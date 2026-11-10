// Newly authored capacity and native placement queries for accepted F/Final.
// Current AQ03 checks requested pilot/unit/actor free counts and calls the
// original placement query, which writes documented scratch and local XY.
// Exact v1 AQ01 and v2 AQ01/AQ02 bytes remain readable only for normalization.
// No game code is bundled here. The exact original IP/EXEC identities and the
// two generated replacements are verified together; partial installs fail.
import {sha256Hex} from './sha256.mjs?v=20261110-part1';
import {ownData,readDenseList} from './editor-own.mjs?v=20261110-part1';
import {bytesEqual as same,dataView as view} from './editor-bytes.mjs?v=20261110-part1';

const GAME='srwf-f',IP_BYTES=0x1800,EXEC_BYTES=731504,IP_OFFSET=0x1700,CODE_BYTES=256;
const ADDRESS=0x06003700,EXEC_BASE=0x06004000,DISPATCH=0x060b25ac-EXEC_BASE;
const ORIGINAL_HANDLER=0x0601789c,FINAL='srwf-final',TAG='AQ01',HASH=/^[a-f0-9]{64}$/;
const ACCEPTED_BASES=Object.freeze([
 'b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9',
 '85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3',
 '75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202'
]);
function fail(message){const error=new Error(message);error.code='EDITOR_SPAWN_CAPACITY_INVALID';throw error;}
function pointer(value){const bytes=new Uint8Array(4);view(bytes).setUint32(0,value);return bytes;}

// Small label assembler for our own leaf function. It executes no external
// code, saves r1..r6 and SR (including T), leaves PR untouched, and uses a
// bounded 28-byte stack frame. Literal addresses are 4-byte aligned.
function assembleLegacy(){
 const words=[],labels=new Map(),fixups=[];
 const emit=w=>words.push(w),mark=name=>labels.set(name,words.length*2);
 const branch=(opcode,name)=>{fixups.push({kind:'branch',at:words.length*2,opcode,name});emit(0);};
 const long=(register,name)=>{fixups.push({kind:'long',at:words.length*2,register,name});emit(0);};
 const short=(register,name)=>{fixups.push({kind:'short',at:words.length*2,register,name});emit(0);};
 for(let r=1;r<=6;r++)emit(0x2f06|(r<<4)); // mov.l rN,@-r15
 emit(0x0602);emit(0x2f66); // stc sr,r6; preserve SR on stack
 long(1,'cursor');emit(0x6212); // r2 = [CTX], not RESUME
 for(const character of TAG){emit(0x6024);emit(0x8800|character.charCodeAt(0));branch(0x8b00,'fallback');}
 long(1,'actors');emit(0x6412); // r4 = [actor-pointer global]
 long(1,'ramLow');emit(0x3412);branch(0x8b00,'invalid'); // cmp/hs r1,r4
 long(1,'ramHigh');emit(0x3416);branch(0x8900,'invalid'); // cmp/hi r1,r4
 emit(0xe54a);emit(0xe600); // 74 records; free count=0
 mark('loop');emit(0x6040);emit(0x88ff);branch(0x8b00,'occupied');
 emit(0x7601);mark('occupied');emit(0x7410);emit(0x4510);branch(0x8b00,'loop');
 mark('store');long(1,'result');emit(0x1165); // RESUME+20=count
 short(0,'matched');branch(0xa000,'restore');emit(9);
 mark('invalid');emit(0xe600);branch(0xa000,'store');emit(9);
 mark('fallback');short(0,'unmatched');
 mark('restore');emit(0x66f6);emit(0x460e); // restore complete incoming SR
 for(let r=6;r>=2;r--)emit(0x60f6|(r<<8));
 emit(0x000b);emit(0x61f6); // rts; mov.l @r15+,r1
 mark('matched');emit(0x6004);mark('unmatched');emit(0xf000);
 while(words.length%2)emit(0);
 const constants={cursor:0x060c0900,actors:0x060b207c,ramLow:0x20200000,ramHigh:0x202ffb60,result:0x060c06f0};
 for(const[name,value]of Object.entries(constants)){mark(name);emit(value>>>16);emit(value&65535);}
 const meaningfulBytes=words.length*2;
 for(const f of fixups){
  const target=labels.get(f.name);if(target===undefined)fail('Unknown authored native label.');
  if(f.kind==='branch'){
   const delta=(target-f.at-4)/2,bits=f.opcode===0xa000?12:8;
   if(!Number.isInteger(delta)||delta<-(2**(bits-1))||delta>=2**(bits-1))fail('Authored native branch exceeds its range.');
   words[f.at/2]=f.opcode|(delta&(2**bits-1));
  }else{
   const base=f.kind==='long'?((ADDRESS+f.at+4)&~3)-ADDRESS:f.at+4,scale=f.kind==='long'?4:2;
   const delta=(target-base)/scale;if(!Number.isInteger(delta)||delta<0||delta>255)fail('Authored native literal exceeds its range.');
   words[f.at/2]=(f.kind==='long'?0xd000:0x9000)|(f.register<<8)|delta;
  }
 }
 if(meaningfulBytes>CODE_BYTES)fail('Authored native query exceeds its fixed slot.');
 const bytes=new Uint8Array(CODE_BYTES),v=view(bytes);words.forEach((w,i)=>v.setUint16(i*2,w));
 return {bytes,meaningfulBytes};
}
function assembleV2(){
 const words=[],labels=new Map(),fixups=[];
 const emit=w=>words.push(w),mark=name=>labels.set(name,words.length*2);
 const branch=(opcode,name)=>{fixups.push({kind:'branch',at:words.length*2,opcode,name});emit(0);};
 const long=(register,name)=>{fixups.push({kind:'long',at:words.length*2,register,name});emit(0);};
 const short=(register,name)=>{fixups.push({kind:'short',at:words.length*2,register,name});emit(0);};
 for(let r=1;r<=9;r++)emit(0x2f06|(r<<4));
 emit(0x4f22);emit(0x4f02);emit(0x4f12); // save PR, MACH, MACL
 emit(0x0102);emit(0x2f16);emit(0x7ff8); // save SR; local XY/mode, 8 bytes
 long(1,'cursor');emit(0x6212);
 for(const character of 'AQ0'){emit(0x6024);emit(0x8800|character.charCodeAt(0));branch(0x8b00,'fallback');}
 emit(0xe900);emit(0x6024);emit(0x8831);branch(0x8900,'actors');
 emit(0x8832);branch(0x8b00,'fallback');emit(0xe903);
 // AQ02 byte operands x/y/mode. Native queue geometry is 64x64; the browser
 // also authenticates the actual, possibly smaller map and unit-derived mode.
 for(const[offset,mask]of[[0,0xc0],[1,0xc0],[2,0xf0]]){
  emit(0x6024);emit(0xc800|mask);branch(0x8b00,'invalid');emit(0x80f0|offset);
 }
 mark('actors');long(1,'actorPointer');emit(0x6412);
 long(1,'ramLow');emit(0x3412);branch(0x8b00,'invalid');
 long(1,'ramHigh');emit(0x3416);branch(0x8900,'invalid');
 emit(0xe54a);emit(0xe800);
 mark('loop');emit(0x6040);emit(0x88ff);branch(0x8b00,'occupied');
 emit(0x7801);mark('occupied');emit(0x7410);emit(0x4510);branch(0x8b00,'loop');
 emit(0x2998);branch(0x8900,'store'); // AQ01: do not call placement
 emit(0x2888);branch(0x8900,'store'); // no actor: no placement scratch writes
 emit(0x64f3);emit(0x65f3);emit(0x7501); // r4=&x,r5=&y
 emit(0xe002);emit(0x06fc); // r6=mode byte, validated 0..15
 long(1,'placement');emit(0x410b);emit(9); // original helper preserves r8/r9
 emit(0x4011);branch(0x8900,'store'); // nonnegative=native placement success
 emit(0xe800); // failure: capacity result0; no roster changes by this shim
 mark('store');long(1,'result');emit(0x1185);short(0,'matched');emit(0x309c);
 branch(0xa000,'restore');emit(9);
 mark('invalid');emit(0xe800);branch(0xa000,'store');emit(9);
 mark('fallback');short(0,'unmatched');
 mark('restore');emit(0x7f08);emit(0x61f6);emit(0x410e);
 emit(0x4f16);emit(0x4f06);emit(0x4f26);
 for(let r=9;r>=2;r--)emit(0x60f6|(r<<8));
 emit(0x000b);emit(0x61f6);
 mark('matched');emit(0x6004);mark('unmatched');emit(0xf000);
 while(words.length%2)emit(0);
 for(const[name,value]of Object.entries({cursor:0x060c0900,actorPointer:0x060b207c,ramLow:0x20200000,ramHigh:0x202ffb60,placement:0x0602684c,result:0x060c06f0})){
  mark(name);emit(value>>>16);emit(value&65535);
 }
 const meaningfulBytes=words.length*2;
 for(const f of fixups){const target=labels.get(f.name);if(target===undefined)fail('Unknown authored native label.');
  if(f.kind==='branch'){const delta=(target-f.at-4)/2,bits=f.opcode===0xa000?12:8;
   if(!Number.isInteger(delta)||delta<-(2**(bits-1))||delta>=2**(bits-1))fail('Authored native branch exceeds its range.');
   words[f.at/2]=f.opcode|(delta&(2**bits-1));
  }else{const base=f.kind==='long'?((ADDRESS+f.at+4)&~3)-ADDRESS:f.at+4,scale=f.kind==='long'?4:2,delta=(target-base)/scale;
   if(!Number.isInteger(delta)||delta<0||delta>255)fail('Authored native literal exceeds its range.');
   words[f.at/2]=(f.kind==='long'?0xd000:0x9000)|(f.register<<8)|delta;
  }
 }
 if(meaningfulBytes>CODE_BYTES)fail('Authored native query exceeds its fixed slot.');
 const bytes=new Uint8Array(CODE_BYTES),v=view(bytes);words.forEach((w,i)=>v.setUint16(i*2,w));return {bytes,meaningfulBytes};
}
// AQ03 follows the actual dispatcher ABI: r1..r7 and MACH/MACL are volatile;
// r8..r14, PR, stack and complete incoming SR are preserved. r13/r14 are never
// touched. A three-row descriptor bounds each source pool independently.
function assemble({cursor=0x060c0900,poolPointer=0x060b208c,placement=0x0602684c,result=0x060c06f0}={}){
 const words=[],labels=new Map(),fixups=[];
 const emit=w=>words.push(w),mark=name=>labels.set(name,words.length*2);
 const branch=(opcode,name)=>{fixups.push({kind:'branch',at:words.length*2,opcode,name});emit(0);};
 const long=(register,name)=>{fixups.push({kind:'long',at:words.length*2,register,name});emit(0);};
 const short=(register,name)=>{fixups.push({kind:'short',at:words.length*2,register,name});emit(0);};
 const address=name=>{fixups.push({kind:'address',at:words.length*2,name});emit(0);};
 for(let r=8;r<=12;r++)emit(0x2f06|(r<<4));
 emit(0x4f22);emit(0x4f03);emit(0x7ff8); // PR, SR, local XY/mode
 long(1,'cursor');emit(0x6212);
 for(const character of 'AQ03'){emit(0x6024);emit(0x8800|character.charCodeAt(0));branch(0x8b00,'fallback');}
 for(const[offset,mask]of[[0,0xc0],[1,0xc0],[2,0xf0]]){
  emit(0x6024);emit(0xc800|mask);branch(0x8b00,'invalid');emit(0x80f0|offset);
 }
 long(3,'poolPointer');address('descriptor');emit(0x6c03);emit(0xeb03);
 mark('pool');
 // Descriptor bytes: subtract-from-global, stride, unsigned record count.
 emit(0x60c4);emit(0x3308);emit(0x6432);emit(0x66c4);emit(0x65c4);emit(0x655c);
 emit(0xe7ff);emit(0xe800);emit(0xe010);emit(0x3060);branch(0x8b00,'maskReady');
 emit(0x4718);emit(0x6873); // actor: mask/expected FF00; caches: FFFF/0000
 mark('maskReady');emit(0x6924);emit(0x699c); // requested free count, unsigned
 long(1,'ramLow');emit(0x3412);branch(0x8b00,'invalid');
 long(1,'ramEnd');emit(0x3412);branch(0x8900,'invalid'); // pool < end: sum cannot wrap
 emit(0x256e);emit(0x001a);emit(0x304c);emit(0x3102);branch(0x8b00,'invalid'); // full extent <= end
 emit(0x6043);emit(0xc801);branch(0x8b00,'invalid'); // aligned BE16 reads
 mark('loop');emit(0x6041);emit(0x2079);emit(0x3080);branch(0x8b00,'occupied');
 emit(0x4910);branch(0x8900,'next'); // zero requirements never reach zero again
 mark('occupied');emit(0x346c);emit(0x4510);branch(0x8b00,'loop');
 branch(0xa000,'store');emit(0xe800); // exhausted: result0 in the delay slot
 mark('next');emit(0x4b10);branch(0x8b00,'pool');
 emit(0x64f3);emit(0x65f3);emit(0x7501);emit(0xe002);emit(0x06fc);
 long(1,'placement');emit(0x410b);emit(9);
 emit(0x4011);branch(0xa000,'store');emit(0x0829); // result = (helper >= 0)
 mark('invalid');emit(0xe800);
 mark('store');long(1,'result');emit(0x1185);branch(0xa000,'restore');short(0,'matched');
 mark('fallback');short(0,'unmatched');
 mark('restore');emit(0x7f08);emit(0x4f07);emit(0x4f26);
 for(let r=12;r>=9;r--)emit(0x60f6|(r<<8));
 emit(0x000b);emit(0x68f6);
 mark('matched');emit(0x600a);mark('unmatched');emit(0xf000);
 while(words.length%2)emit(0);
 for(const[name,value]of Object.entries({cursor,poolPointer,ramLow:0x20200000,ramEnd:0x20300000,placement,result})){
  mark(name);emit(value>>>16);emit(value&65535);
 }
 // 060B208C -> 060B2088 -> 060B207C; counts128/128/74, strides12/30/16.
 mark('descriptor');for(const word of[0x000c,0x8004,0x1e80,0x0c10,0x4a00])emit(word);
 const meaningfulBytes=words.length*2;
 for(const f of fixups){const target=labels.get(f.name);if(target===undefined)fail('Unknown authored native label.');
  if(f.kind==='branch'){const delta=(target-f.at-4)/2,bits=f.opcode===0xa000?12:8;
   if(!Number.isInteger(delta)||delta<-(2**(bits-1))||delta>=2**(bits-1))fail('Authored native branch exceeds its range.');
   words[f.at/2]=f.opcode|(delta&(2**bits-1));
  }else{const aligned=f.kind==='long'||f.kind==='address',base=aligned?((ADDRESS+f.at+4)&~3)-ADDRESS:f.at+4,scale=aligned?4:2,delta=(target-base)/scale;
   if(!Number.isInteger(delta)||delta<0||delta>255)fail('Authored native literal exceeds its range.');
   words[f.at/2]=f.kind==='address'?0xc700|delta:(f.kind==='long'?0xd000:0x9000)|(f.register<<8)|delta;
  }
 }
 if(meaningfulBytes>CODE_BYTES)fail('Authored native query exceeds its fixed slot.');
 const bytes=new Uint8Array(CODE_BYTES),v=view(bytes);words.forEach((w,i)=>v.setUint16(i*2,w));return {bytes,meaningfulBytes};
}
const LEGACY_CODE=assembleLegacy(),V2_CODE=assembleV2(),CODE=assemble(),FINAL_CODE=assemble({cursor:0x060c6d70,poolPointer:0x060b856c,placement:0x060283f8,result:0x060c6b60}),AFTER_POINTER=pointer(ADDRESS);
export const EDITOR_SPAWN_CAPACITY_INFO=Object.freeze({version:3,gameId:GAME,tag:'AQ03',queryBytes:Object.freeze([0xfc,0x41,0x51,0x30,0x33]),placementTag:'AQ03',placementQueryPrefix:Object.freeze([0xfc,0x41,0x51,0x30,0x33]),queryOperandBytes:10,returnCode:0x600a,placementHandler:0x0602684c,
 address:ADDRESS,ipByteLength:IP_BYTES,execByteLength:EXEC_BYTES,originalHandler:ORIGINAL_HANDLER,cursorAddress:0x060c0900,resultBase:0x060c06f0,ipOffset:IP_OFFSET,codeBytes:CODE_BYTES,meaningfulBytes:CODE.meaningfulBytes,execOffset:DISPATCH,execBase:EXEC_BASE,
 actorPointer:0x060b207c,actorCount:74,actorStride:16,emptyByte:255,resultAddress:0x060c06f0+20,stackBytes:36,volatileRegisters:Object.freeze([1,2,3,4,5,6,7]),preservedRegisters:Object.freeze([8,9,10,11,12,13,14,15]),
 pools:Object.freeze([{kind:'pilots',pointer:0x060b208c,count:128,stride:12},{kind:'units',pointer:0x060b2088,count:128,stride:30},{kind:'actors',pointer:0x060b207c,count:74,stride:16}].map(Object.freeze)),
 sourceIpSha256:'ad00e607e43b8dd6c52f0a58d10d0ce78a5a058e2c43bb9895ffec34558783ff',
 sourceExecSha256:'308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1',codeSha256:sha256Hex(CODE.bytes),
 legacyCodeSha256:sha256Hex(LEGACY_CODE.bytes),v2CodeSha256:sha256Hex(V2_CODE.bytes),supportedBaseSha256:ACCEPTED_BASES});
const FINAL_INFO=Object.freeze({...EDITOR_SPAWN_CAPACITY_INFO,gameId:FINAL,meaningfulBytes:FINAL_CODE.meaningfulBytes,execByteLength:758232,execOffset:0x060b8a8c-EXEC_BASE,originalHandler:0x06017d30,
 cursorAddress:0x060c6d70,resultBase:0x060c6b60,resultAddress:0x060c6b60+20,actorPointer:0x060b855c,placementHandler:0x060283f8,
 sourceIpSha256:'7e2a2f3da06ea64ad85162a29bd6263c7286669654ddbf20a5521b08d9f4588d',sourceExecSha256:'17c8bbf01e5fd0af708ff43b157e41d6cbd656104ccc3e4e03e7d07c687d61ac',
 // Authenticated accepted font variants: a has a different EXEC from b/c.
 sourceExecSha256ByBase:Object.freeze({"fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e":"17c8bbf01e5fd0af708ff43b157e41d6cbd656104ccc3e4e03e7d07c687d61ac","9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23":"2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0","0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d":"2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0"}),
 codeSha256:sha256Hex(FINAL_CODE.bytes),legacyCodeSha256:null,v2CodeSha256:null,
 pools:Object.freeze([{kind:'pilots',pointer:0x060b856c,count:128,stride:12},{kind:'units',pointer:0x060b8568,count:128,stride:30},{kind:'actors',pointer:0x060b855c,count:74,stride:16}].map(Object.freeze)),
 supportedBaseSha256:Object.freeze(['fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e','9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23','0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d'])});
export function spawnCapacityInfo(gameId=GAME){if(gameId===GAME)return EDITOR_SPAWN_CAPACITY_INFO;if(gameId===FINAL)return FINAL_INFO;fail('Unknown native query game profile.');}
export function actorCapacityQueryCode({gameId=GAME,version=3}={}){
 spawnCapacityInfo(gameId);if(![1,2,3].includes(version)||gameId===FINAL&&version!==3)fail('Unknown native query version.');
 return (gameId===FINAL?FINAL_CODE:version===1?LEGACY_CODE:version===2?V2_CODE:CODE).bytes.slice();
}

// Trusted metadata seam for non-game synthetic fixtures. Callers must never
// pass JSON/user-selected profiles; production wrappers below use fixed pins.
export function createSpawnCapacityEditor(trusted){
 const ipSha256=ownData(trusted,'ipSha256'),execSha256=ownData(trusted,'execSha256'),profileGame=ownData(trusted,'gameId')??GAME,info=spawnCapacityInfo(profileGame),code=profileGame===GAME?CODE:FINAL_CODE,beforePointer=pointer(info.originalHandler),dispatch=info.execOffset;
 const {list:bases,problem}=readDenseList(ownData(trusted,'baseSha256'),16);
 if(!HASH.test(ipSha256)||!HASH.test(execSha256)||problem||!bases.length||bases.some(x=>typeof x!=='string'||!HASH.test(x))||new Set(bases).size!==bases.length)fail('Invalid trusted capacity profile.');
 const suppliedPins=ownData(trusted,'execSha256ByBase');
 const execPins=suppliedPins===undefined?Object.fromEntries(bases.map(base=>[base,execSha256])):suppliedPins;
 if(!execPins||typeof execPins!=='object'||Array.isArray(execPins)||Reflect.ownKeys(execPins).length!==bases.length
  ||Reflect.ownKeys(execPins).some(base=>!bases.includes(base))||bases.some(base=>!HASH.test(ownData(execPins,base))))fail('Invalid trusted executable pins.');
 const authenticatedExecPins=Object.freeze(Object.fromEntries(bases.map(base=>[base,ownData(execPins,base)])));
 function inspect(ipInput,execInput,options={}){
  const gameId=ownData(options,'gameId'),base=ownData(options,'baseSha256');
  if(gameId!==profileGame||base!==undefined&&!bases.includes(base))fail('This native query is supported only for its authenticated game base.');
  if(!(ipInput instanceof Uint8Array)||ipInput.length!==IP_BYTES||!(execInput instanceof Uint8Array)||execInput.length!==info.execByteLength)fail('Invalid native query file geometry.');
  const ip=ipInput.slice(),exec=execInput.slice(),currentCode=ip.subarray(IP_OFFSET),currentPointer=exec.subarray(dispatch,dispatch+4);
  const zero=currentCode.every(x=>x===0),oldPointer=same(currentPointer,beforePointer),version=same(currentCode,code.bytes)?3:profileGame===GAME&&same(currentCode,V2_CODE.bytes)?2:profileGame===GAME&&same(currentCode,LEGACY_CODE.bytes)?1:0,newPointer=same(currentPointer,AFTER_POINTER);
  if(!(zero&&oldPointer)&&!(version&&newPointer))fail('The native query is partially installed or has unknown bytes.');
  const enabled=version>0&&newPointer;
  if(enabled){ip.fill(0,IP_OFFSET);exec.set(beforePointer,dispatch);}
  const expectedExec=base===undefined?Object.values(authenticatedExecPins):[authenticatedExecPins[base]];
  if(sha256Hex(ip)!==ipSha256||!expectedExec.includes(sha256Hex(exec)))fail('The native query files differ outside the exact authenticated replacements.');
  if(view(ip).getUint32(0xe0)!==IP_BYTES||view(ip).getUint32(0xf0)!==EXEC_BASE)fail('The initial program header differs from the authenticated load contract.');
  return {ip,exec,enabled,version};
 }
 function change(ipInput,execInput,options,enabled){
  const result=inspect(ipInput,execInput,options),ip=result.ip,exec=result.exec;
  if(enabled){ip.set(code.bytes,IP_OFFSET);exec.set(AFTER_POINTER,dispatch);}
  const patches=[];
  for(const[file,before,after,offset,length]of[['ip',ipInput,ip,IP_OFFSET,CODE_BYTES],['exec',execInput,exec,dispatch,4]]){
   const a=before.slice(offset,offset+length),b=after.slice(offset,offset+length);
   if(!same(a,b))patches.push(Object.freeze({file,offset,before:a,after:b}));
  }
  return Object.freeze({ip,exec,enabled,previouslyEnabled:result.enabled,previouslyVersion:result.version,installedVersion:enabled?3:0,patches:Object.freeze(patches),profileId:`spawn-capacity:3:${code.bytes.length}:${sha256Hex(code.bytes)}`});
 }
 function normalize(ip,exec,options={}){return change(ip,exec,options,false);}
 function apply(ip,exec,options={}){
  const enabled=ownData(options,'enabled');if(typeof enabled!=='boolean')fail('An explicit native-query enabled state is required.');
  return change(ip,exec,options,enabled);
 }
 return Object.freeze({normalizeSpawnCapacity:normalize,applySpawnCapacity:apply});
}
const PRODUCTION=Object.freeze(Object.fromEntries([GAME,FINAL].map(gameId=>{
 const info=spawnCapacityInfo(gameId);return [gameId,createSpawnCapacityEditor({gameId,ipSha256:info.sourceIpSha256,execSha256:info.sourceExecSha256,execSha256ByBase:info.sourceExecSha256ByBase,baseSha256:info.supportedBaseSha256})];
})));
function production(options){const gameId=ownData(options,'gameId');spawnCapacityInfo(gameId===undefined?null:gameId);return PRODUCTION[gameId];}
export function normalizeSpawnCapacity(ip,exec,options={}){return production(options).normalizeSpawnCapacity(ip,exec,options);}
export function applySpawnCapacity(ip,exec,options={}){return production(options).applySpawnCapacity(ip,exec,options);}
