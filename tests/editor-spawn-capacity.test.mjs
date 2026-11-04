import test from 'node:test';
import assert from 'node:assert/strict';
import {actorCapacityQueryCode,EDITOR_SPAWN_CAPACITY_INFO as INFO,createSpawnCapacityEditor,applySpawnCapacity,spawnCapacityInfo} from '../assets/editor-spawn-capacity.mjs';
import {sha256Hex} from '../assets/sha256.mjs';

// Bounded SH-2 instruction execution for our newly authored leaf, not a
// Saturn/gameplay simulator. Unmapped reads and all unrelated writes fail.
const signed=(x,bits)=>x&(2**(bits-1))?(x&(2**bits-1))-2**bits:x&(2**bits-1);
function execute({tag='AQ01',free=[],pool=0x20210000,pilotFree=[0],unitFree=[0],pilotPool=0x20220000,unitPool=0x20230000,alignment=0,sr=0x3f3,placementResult=0,corrected=[12,16],version=2,gameId='srwf-f'}={}){
 const profile=spawnCapacityInfo(gameId);
 const memory=new Map(),registers=new Uint32Array(16),writes=[],actorReads=[],poolReads=[],placementCalls=[],stop=0x0600f00d;
 const frame=version===1?28:version===2?60:profile.stackBytes,stack=0x202f0000,cursor=0x20204000+alignment,result=profile.resultAddress;
 const put=(at,bytes)=>bytes.forEach((x,i)=>memory.set(at+i,x));
 const store=(at,value,bytes)=>{for(let i=bytes-1;i>=0;i--){memory.set(at+i,value&255);value>>>=8;}};
 put(profile.address,actorCapacityQueryCode({version,gameId}));put(stack-frame,new Uint8Array(frame));
 put(cursor,tag instanceof Uint8Array?tag:new TextEncoder().encode(tag));store(profile.cursorAddress,cursor,4);store(profile.actorPointer,pool,4);store(result,0x12345678,4);
 const pools=[{kind:'actors',pointer:profile.actorPointer,at:pool,count:74,stride:16,free}];
 if(version===3)pools.unshift({kind:'pilots',pointer:profile.pools.find(p=>p.kind==='pilots').pointer,at:pilotPool,count:128,stride:12,free:pilotFree},{kind:'units',pointer:profile.pools.find(p=>p.kind==='units').pointer,at:unitPool,count:128,stride:30,free:unitFree});
 for(const p of pools){store(p.pointer,p.at,4);if(p.at>=0x20200000&&p.at+p.count*p.stride<=0x20300000&&!(p.at&1)){
  const bytes=new Uint8Array(p.count*p.stride).fill(0x5a),v=new DataView(bytes.buffer);
  for(let i=0;i<p.count;i++)if(p.kind==='actors'){bytes[i*p.stride]=p.free.includes(i)?255:i%254;bytes[i*p.stride+1]=i*29&255;}
  else v.setUint16(i*p.stride,p.free.includes(i)?0:i+1);put(p.at,bytes);
 }}
 for(let i=0;i<15;i++)registers[i]=(0x91234560+i)>>>0;registers[15]=stack;
 const before=registers.slice();let pc=profile.address,pr=stop,status=sr>>>0,steps=0,mach=0x1234abcd,macl=0x98765432;
 const setT=value=>{status=(status&~1)|(value?1:0);};
 const read=(at,bytes)=>{let value=0;for(let i=0;i<bytes;i++){assert.ok(memory.has(at+i),`unmapped native read ${at.toString(16)}`);value=value*256+memory.get(at+i);}for(const p of pools)if(at>=p.at&&at<p.at+p.count*p.stride){poolReads.push({kind:p.kind,at,bytes});if(p.kind==='actors')actorReads.push(at);}return value>>>0;};
 const write=(at,value,bytes)=>{assert.ok(at>=stack-frame&&at+bytes<=stack||at===result&&bytes===4,`unrelated native write ${at.toString(16)}`);writes.push({at,bytes});store(at,value,bytes);};
 const simple=(at,w)=>{const n=w>>>8&15,m=w>>>4&15,op=w&0xf00f;
  if(w===9)return;
  if(w===0x4f03){registers[15]-=4;write(registers[15],status,4);}
  else if(w===0x4f07){status=read(registers[15],4);registers[15]+=4;}
  else if([0x4f22,0x4f02,0x4f12].includes(w)){registers[15]-=4;write(registers[15],w===0x4f22?pr:w===0x4f02?mach:macl,4);}
  else if([0x4f26,0x4f06,0x4f16].includes(w)){const value=read(registers[15],4);registers[15]+=4;if(w===0x4f26)pr=value;else if(w===0x4f06)mach=value;else macl=value;}
  else if(op===0x2006){registers[n]-=4;write(registers[n],registers[m],4);}
  else if(op===0x6006){const p=registers[m];registers[n]=read(p,4);if(n!==m)registers[m]+=4;}
  else if((w&0xf0ff)===0x0002)registers[n]=status;
  else if((w&0xf0ff)===0x400e)status=registers[n];
  else if((w&0xff00)===0xc700)registers[0]=((at+4)&~3)+(w&255)*4;
  else if((w&0xf000)===0xd000)registers[n]=read(((at+4)&~3)+(w&255)*4,4);
  else if((w&0xf000)===0x9000)registers[n]=signed(read(at+4+(w&255)*2,2),16);
  else if((w&0xf000)===0xe000)registers[n]=signed(w,8);
  else if((w&0xf000)===0x7000)registers[n]+=signed(w,8);
  else if(op===0x6002)registers[n]=read(registers[m],4);
  else if(op===0x6003)registers[n]=registers[m];
  else if(op===0x6000)registers[n]=signed(read(registers[m],1),8);
  else if(op===0x6001)registers[n]=signed(read(registers[m],2),16);
  else if(op===0x600c)registers[n]=registers[m]&255;
  else if(op===0x6004){const p=registers[m];registers[n]=signed(read(p,1),8);registers[m]++;}
  else if((w&0xff00)===0x8800)setT(registers[0]===(signed(w,8)>>>0));
  else if((w&0xff00)===0xc800)setT((registers[0]&(w&255))===0);
  else if(op===0x2008)setT((registers[n]&registers[m])===0);
  else if(op===0x300c)registers[n]+=registers[m];
  else if(op===0x3008)registers[n]-=registers[m];
  else if(op===0x3000)setT(registers[n]===registers[m]);
  else if(op===0x2009)registers[n]&=registers[m];
  else if(op===0x200e)macl=(registers[n]&65535)*(registers[m]&65535);
  else if((w&0xf0ff)===0x001a)registers[n]=macl;
  else if((w&0xf0ff)===0x4018)registers[n]<<=8;
  else if((w&0xf0ff)===0x0029)registers[n]=status&1;
  else if(op===0x3002)setT(registers[n]>=registers[m]);
  else if(op===0x3006)setT(registers[n]>registers[m]);
  else if((w&0xf0ff)===0x4010){registers[n]--;setT(registers[n]===0);}
  else if((w&0xf0ff)===0x4011)setT((registers[n]|0)>=0);
  else if((w&0xff00)===0x8000)write(registers[w>>>4&15]+(w&15),registers[0],1);
  else if(op===0x000c)registers[n]=signed(read(registers[0]+registers[m],1),8);
  else if((w&0xf000)===0x1000)write(registers[n]+(w&15)*4,registers[m],4);
  else assert.fail(`unsupported authored SH2 ${w.toString(16)} at ${at.toString(16)}`);
 };
 while(pc!==stop){assert.ok(++steps<10000,'native leaf did not return');
  if(pc===profile.placementHandler){
   // Explicit ABI stub: tests the authored caller, not terrain/search logic.
   const x=read(registers[4],1),y=read(registers[5],1),mode=registers[6];placementCalls.push({x,y,mode,xPointer:registers[4],yPointer:registers[5]});
   write(registers[4],corrected[0],1);write(registers[5],corrected[1],1);
   for(let i=1;i<=7;i++)registers[i]=0xbad00000+i;
   status^=0x3f3;mach=0x77777777;macl=0x88888888;registers[0]=placementResult;pc=pr;continue;
  }
  const at=pc,w=read(at,2),top=w&0xff00;
  if(top===0x8900||top===0x8b00){const take=top===0x8900?status&1:!(status&1);pc=take?at+4+signed(w,8)*2:at+2;}
  else if((w&0xf000)===0xa000){simple(at+2,read(at+2,2));pc=at+4+signed(w,12)*2;}
  else if(w===11||(w&0xf0ff)===0x400b){const target=w===11?pr:registers[w>>>8&15];if(w!==11)pr=at+4;simple(at+2,read(at+2,2));pc=target;}
  else{simple(at,w);pc=at+2;}
 }
 assert.deepEqual(Array.from(registers.subarray(version===3?8:1)),Array.from(before.subarray(version===3?8:1)),version===3?'r8..r15 must be preserved':'legacy r1..r15 must be preserved');
 assert.equal(pr,stop);assert.equal(status,sr);if(version!==3){assert.equal(mach,0x1234abcd);assert.equal(macl,0x98765432);}assert.equal(read(profile.cursorAddress,4),cursor,'leaf must not change VM cursor');
 return {result:read(result,4),returnCode:registers[0]&65535,writes,actorReads,poolReads,placementCalls,steps,volatileChanged:Array.from(registers.subarray(1,8)).some((x,i)=>x!==before[i+1])};
}

test('authored actor query executes exact74 first-byte reads and preserves native ABI',()=>{
 const cases=[[],[0],[73],Array.from({length:74},(_,i)=>i),Array.from({length:74},(_,i)=>i).filter(i=>i%3===1)];
 for(const free of cases)for(const alignment of [0,1,2,3])for(const sr of [0,1,0x3f3]){
  const actual=execute({free,alignment,sr});assert.equal(actual.result,free.length);assert.equal(actual.returnCode,0x6004);
  assert.deepEqual(actual.actorReads,Array.from({length:74},(_,i)=>0x20210000+i*16));
  assert.equal(actual.writes.filter(x=>x.at===INFO.resultAddress).length,1);
 }
 assert.equal(actorCapacityQueryCode().length,256);assert.ok(INFO.meaningfulBytes<=256);assert.equal(sha256Hex(actorCapacityQueryCode()),INFO.codeSha256);
});

test('every unrecognized single-byte tag keeps FC fallback and never reads the actor table',()=>{
 for(let position=0;position<4;position++)for(let value=0;value<256;value++){
  if(value==='AQ01'.charCodeAt(position)||position===3&&value===50)continue;
  const bytes=Uint8Array.from([65,81,48,49]);bytes[position]=value;const actual=execute({tag:bytes});
  assert.equal(actual.result,0x12345678);assert.equal(actual.returnCode,0xf000);assert.equal(actual.actorReads.length,0);assert.equal(actual.writes.filter(x=>x.at===INFO.resultAddress).length,0);
 }
});

test('AQ02 authenticates operands and preserves native caller state around the placement ABI',()=>{
 for(const placementResult of [0,1,3,-1])for(const alignment of [0,1,2,3]){
  const actual=execute({tag:Uint8Array.from([65,81,48,50,21,22,6]),free:[0,73],alignment,placementResult});
  assert.equal(actual.result,placementResult<0?0:2);assert.equal(actual.returnCode,0x6007);
  assert.equal(actual.placementCalls.length,1);assert.equal(actual.placementCalls[0].x,21);assert.equal(actual.placementCalls[0].y,22);assert.equal(actual.placementCalls[0].mode,6);
  assert.equal(actual.placementCalls[0].yPointer,actual.placementCalls[0].xPointer+1);
 }
 const noActor=execute({tag:Uint8Array.from([65,81,48,50,0,0,0])});assert.equal(noActor.result,0);assert.equal(noActor.placementCalls.length,0);assert.equal(noActor.returnCode,0x6007);
 for(const [x,y,mode]of[[64,0,0],[0,64,0],[255,255,0],[0,0,16],[0,0,255]]){
  const invalid=execute({tag:Uint8Array.from([65,81,48,50,x,y,mode]),free:[0]});assert.equal(invalid.result,0);assert.equal(invalid.returnCode,0x6007);assert.equal(invalid.actorReads.length,0);assert.equal(invalid.placementCalls.length,0);
 }
 assert.equal(execute({tag:Uint8Array.from([65,81,48,50,63,63,15]),free:[73]}).result,1);
 assert.equal(execute({version:1,free:[73]}).result,1,'old AQ01 exact code remains independently reproducible');
});

test('invalid dynamic actor pointers yield zero without unrelated reads',()=>{
 for(const pool of [0,0x06000000,0x201fffff,0x202ffb61,0xffffffff]){
  const actual=execute({pool});assert.equal(actual.result,0);assert.equal(actual.returnCode,0x6004);assert.equal(actual.actorReads.length,0);
 }
 for(const pool of [0x20200000,0x202ffb60])assert.equal(execute({pool,free:[73]}).result,1);
});

const aq03=(x=21,y=22,mode=6,pilots=1,units=1,actors=1)=>Uint8Array.from([65,81,48,51,x,y,mode,pilots,units,actors]);
const indices=n=>Array.from({length:n},(_,i)=>i);
test('AQ03 reserves every required pilot/unit/actor slot before native placement',()=>{
 for(const alignment of [0,1,2,3])for(const sr of [0,1,0x3f3]){
  const actual=execute({version:3,tag:aq03(21,22,6,3,2,4),pilotFree:[0,8,127],unitFree:[1,127],free:[0,5,7,73],alignment,sr});
  assert.equal(actual.result,1);assert.equal(actual.returnCode,0x600a);assert.equal(actual.placementCalls.length,1);assert.equal(actual.volatileChanged,true);
  assert.deepEqual(actual.placementCalls.map(({x,y,mode})=>({x,y,mode})),[{x:21,y:22,mode:6}]);
  assert.equal(actual.placementCalls[0].yPointer,actual.placementCalls[0].xPointer+1);
  assert.ok(actual.poolReads.every(r=>r.bytes===2));
 }
 for(const [pilotFree,unitFree,free,failed]of[[[0,8],[1,127],[0,5,7,73],'pilots'],[[0,8,127],[1],[0,5,7,73],'units'],[[0,8,127],[1,127],[0,5,7],'actors']]){
  const actual=execute({version:3,tag:aq03(0,0,0,3,2,4),pilotFree,unitFree,free});
  assert.equal(actual.result,0);assert.equal(actual.returnCode,0x600a);assert.equal(actual.placementCalls.length,0);
  const kinds=[...new Set(actual.poolReads.map(x=>x.kind))];assert.equal(kinds.at(-1),failed,'failed pool must stop later checks');
 }
 for(const placementResult of [-1,-2,0,3]){
  const actual=execute({version:3,tag:aq03(63,63,15,128,128,74),pilotFree:indices(128),unitFree:indices(128),free:indices(74),placementResult});
  assert.equal(actual.result,placementResult<0?0:1);assert.equal(actual.placementCalls.length,1);
  assert.deepEqual(['pilots','units','actors'].map(kind=>actual.poolReads.filter(x=>x.kind===kind).length),[128,128,74]);
 }
 assert.equal(INFO.version,3);assert.equal(INFO.codeSha256,'2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876');assert.equal(INFO.meaningfulBytes,250);assert.equal(INFO.stackBytes,36);assert.equal(INFO.queryOperandBytes,10);
});

test('AQ03 rejects malformed operands and insufficient or zero requirements without roster writes',()=>{
 for(const values of [[64,0,0],[0,64,0],[255,255,0],[0,0,16],[0,0,255]]){
  const actual=execute({version:3,tag:aq03(...values),free:[0]});assert.equal(actual.result,0);assert.equal(actual.poolReads.length,0);assert.equal(actual.placementCalls.length,0);
 }
 for(const counts of [[0,1,1],[1,0,1],[1,1,0],[129,1,1],[1,129,1],[1,1,75],[255,255,255]]){
  const actual=execute({version:3,tag:aq03(0,0,0,...counts),pilotFree:indices(128),unitFree:indices(128),free:indices(74)});
  assert.equal(actual.result,0);assert.equal(actual.returnCode,0x600a);assert.equal(actual.placementCalls.length,0);
 }
});

test('AQ03 validates aligned complete extents of all three dynamic pools',()=>{
 for(const [field,count,stride]of [['pilotPool',128,12],['unitPool',128,30],['pool',74,16]]){
  for(const at of [0x20200000,0x20300000-count*stride]){
   const actual=execute({version:3,tag:aq03(),free:[0],[field]:at});assert.equal(actual.result,1);assert.equal(actual.placementCalls.length,1);
  }
  for(const at of [0,0x06000000,0x201ffffe,0x20200001,0x20300000-count*stride+2,0x20300000,0xfffffffe]){
   const actual=execute({version:3,tag:aq03(),free:[0],[field]:at});assert.equal(actual.result,0);assert.equal(actual.placementCalls.length,0);
   const kind=field==='pilotPool'?'pilots':field==='unitPool'?'units':'actors';assert.equal(actual.poolReads.filter(x=>x.kind===kind).length,0,'invalid table must not be read');
  }
 }
});

test('v3 accepts AQ03 only; all other tags retain original FC dispatch semantics',()=>{
 for(let position=0;position<4;position++)for(let value=0;value<256;value++){
  if(value==='AQ03'.charCodeAt(position))continue;
  const tag=Uint8Array.from([65,81,48,51]);tag[position]=value;const actual=execute({version:3,tag});
  assert.equal(actual.result,0x12345678);assert.equal(actual.returnCode,0xf000);assert.equal(actual.poolReads.length,0);assert.equal(actual.placementCalls.length,0);
 }
 for(const tag of ['AQ01','AQ02'])assert.equal(execute({version:3,tag}).returnCode,0xf000);
});

function fixture(gameId='srwf-f'){
 const info=spawnCapacityInfo(gameId),ip=new Uint8Array(info.ipByteLength),exec=new Uint8Array(info.execByteLength),base='a'.repeat(64);
 for(let i=0;i<0x1700;i++)ip[i]=i*17&255;
 for(let i=0;i<exec.length;i++)exec[i]=i*7&255;
 const iv=new DataView(ip.buffer),ev=new DataView(exec.buffer);iv.setUint32(0xe0,0x1800);iv.setUint32(0xf0,0x06004000);ev.setUint32(info.execOffset,info.originalHandler);
 const editor=createSpawnCapacityEditor({gameId,ipSha256:sha256Hex(ip),execSha256:sha256Hex(exec),baseSha256:[base]});
 return {ip,exec,editor,options:{gameId,baseSha256:base}};
}
test('exact two-range installation, reapply, removal and canonical normalization preserve source files',()=>{
 const {ip,exec,editor,options}=fixture(),beforeIp=ip.slice(),beforeExec=exec.slice();
 const changed=editor.applySpawnCapacity(ip,exec,{...options,enabled:true});
 assert.equal(changed.enabled,true);assert.equal(changed.previouslyEnabled,false);assert.deepEqual(changed.patches.map(p=>[p.file,p.offset,p.before.length]),[['ip',0x1700,256],['exec',INFO.execOffset,4]]);
 assert.deepEqual(ip,beforeIp);assert.deepEqual(exec,beforeExec);
 for(let i=0;i<ip.length;i++)if(i<0x1700)assert.equal(changed.ip[i],ip[i]);
 for(let i=0;i<exec.length;i++)if(i<INFO.execOffset||i>=INFO.execOffset+4)assert.equal(changed.exec[i],exec[i]);
 const again=editor.applySpawnCapacity(changed.ip,changed.exec,{...options,enabled:true});assert.equal(again.patches.length,0);
 const normalized=editor.normalizeSpawnCapacity(changed.ip,changed.exec,options);assert.equal(normalized.previouslyEnabled,true);assert.equal(normalized.enabled,false);assert.deepEqual(normalized.ip,ip);assert.deepEqual(normalized.exec,exec);
 const disabled=editor.applySpawnCapacity(changed.ip,changed.exec,{...options,enabled:false});assert.deepEqual(disabled.ip,ip);assert.deepEqual(disabled.exec,exec);
 for(const version of [1,2]){
  const legacyIp=changed.ip.slice();legacyIp.set(actorCapacityQueryCode({version}),0x1700);
  const legacy=editor.normalizeSpawnCapacity(legacyIp,changed.exec,options);assert.equal(legacy.previouslyVersion,version);assert.deepEqual(legacy.ip,ip);assert.deepEqual(legacy.exec,exec);
  const removed=editor.applySpawnCapacity(legacyIp,changed.exec,{...options,enabled:false});assert.deepEqual(removed.ip,ip);assert.deepEqual(removed.exec,exec);
  const upgrade=editor.applySpawnCapacity(legacyIp,changed.exec,{...options,enabled:true});assert.equal(upgrade.previouslyVersion,version);assert.equal(upgrade.installedVersion,3);assert.deepEqual(upgrade.ip,changed.ip);assert.equal(upgrade.patches.length,1);
 }
 assert.equal(changed.installedVersion,3);assert.equal(normalized.previouslyVersion,3);
 assert.equal(sha256Hex(actorCapacityQueryCode({version:1})),'73070f03c3b54c202295dfa488fc9fc20962033d1a98770664bf2626ea69c019');
 assert.equal(sha256Hex(actorCapacityQueryCode({version:2})),'fc2791dd0b6327229f67f8a751208e722930068e5659050175438b2832c0224b');
});

test('partial installs, unknown native bytes and wrong current files are rejected before any write',()=>{
 const {ip,exec,editor,options}=fixture(),changed=editor.applySpawnCapacity(ip,exec,{...options,enabled:true});
 for(const [p,e]of[[changed.ip,exec],[ip,changed.exec]])assert.throws(()=>editor.normalizeSpawnCapacity(p,e,options),/partially installed/);
 const brokenIp=changed.ip.slice();brokenIp[0x1700+33]^=1;assert.throws(()=>editor.normalizeSpawnCapacity(brokenIp,changed.exec,options),/unknown bytes/);
 const brokenExec=changed.exec.slice();brokenExec[123]^=1;assert.throws(()=>editor.normalizeSpawnCapacity(changed.ip,brokenExec,options),/outside/);
 assert.throws(()=>editor.applySpawnCapacity(ip,exec,{...options,enabled:1}),/explicit/);
 assert.throws(()=>editor.applySpawnCapacity(ip,exec,{...options,gameId:'srwf-final',enabled:true}),/only/);
 assert.throws(()=>editor.applySpawnCapacity(ip,exec,{...options,baseSha256:'b'.repeat(64),enabled:true}),/authenticated/);
 assert.throws(()=>applySpawnCapacity(ip,exec,{gameId:'srwf-f',enabled:true}),/authenticated/);
});

test('Final AQ03 uses its own native addresses and preserves the shared query ABI',()=>{
 const info=spawnCapacityInfo('srwf-final');
 assert.equal(info.ipByteLength,6144);assert.equal(info.execByteLength,758232);assert.equal(info.execOffset,0x060b8a8c-0x06004000);assert.equal(info.originalHandler,0x06017d30);
 assert.equal(info.cursorAddress,0x060c6d70);assert.equal(info.resultAddress,0x060c6b60+20);assert.equal(info.placementHandler,0x060283f8);
 assert.equal(sha256Hex(actorCapacityQueryCode({gameId:'srwf-final'})),info.codeSha256);
 assert.notEqual(info.codeSha256,INFO.codeSha256);assert.equal(info.codeSha256,'f5683b302047bd923e32592350dfdc36f8ae2506c17844cbd1a0ffbb89acb309');assert.equal(info.meaningfulBytes,250);
 for(const alignment of [0,1,2,3])for(const placementResult of [-1,0,3]){
  const actual=execute({gameId:'srwf-final',version:3,tag:aq03(63,63,15,128,128,74),pilotFree:indices(128),unitFree:indices(128),free:indices(74),alignment,placementResult});
  assert.equal(actual.result,placementResult<0?0:1);assert.equal(actual.returnCode,0x600a);assert.equal(actual.placementCalls.length,1);
  assert.deepEqual(actual.placementCalls.map(({x,y,mode})=>({x,y,mode})),[{x:63,y:63,mode:15}]);
 }
 for(const [pilotFree,unitFree,free]of [[[],[0],[0]],[[0],[],[0]],[[0],[0],[]]]){
  const actual=execute({gameId:'srwf-final',version:3,tag:aq03(),pilotFree,unitFree,free});assert.equal(actual.result,0);assert.equal(actual.placementCalls.length,0);
 }
 for(const tag of ['AQ01','AQ02','FQ02']){const actual=execute({gameId:'srwf-final',version:3,tag});assert.equal(actual.returnCode,0xf000);assert.equal(actual.result,0x12345678);assert.equal(actual.poolReads.length,0);}
 assert.throws(()=>actorCapacityQueryCode({gameId:'srwf-final',version:2}),/version/);
 assert.throws(()=>actorCapacityQueryCode({gameId:'srwf-final',version:1}),/version/);
});

test('Final exact component profile writes only its own two ranges and rejects F overlays',()=>{
 const {ip,exec,editor,options}=fixture('srwf-final'),info=spawnCapacityInfo('srwf-final'),changed=editor.applySpawnCapacity(ip,exec,{...options,enabled:true});
 assert.equal(changed.installedVersion,3);assert.deepEqual(changed.patches.map(p=>[p.file,p.offset,p.before.length]),[['ip',0x1700,256],['exec',info.execOffset,4]]);
 assert.equal(editor.applySpawnCapacity(changed.ip,changed.exec,{...options,enabled:true}).patches.length,0);
 const normalized=editor.normalizeSpawnCapacity(changed.ip,changed.exec,options);assert.deepEqual(normalized.ip,ip);assert.deepEqual(normalized.exec,exec);assert.equal(normalized.previouslyVersion,3);
 const removed=editor.applySpawnCapacity(changed.ip,changed.exec,{...options,enabled:false});assert.deepEqual(removed.ip,ip);assert.deepEqual(removed.exec,exec);
 const wrong=changed.ip.slice();wrong.set(actorCapacityQueryCode(),0x1700);assert.throws(()=>editor.normalizeSpawnCapacity(wrong,changed.exec,options),/unknown bytes/);
 const unrelated=changed.exec.slice();unrelated[INFO.execOffset]^=1;assert.throws(()=>editor.normalizeSpawnCapacity(changed.ip,unrelated,options),/outside/);
 assert.throws(()=>editor.normalizeSpawnCapacity(changed.ip,changed.exec,{...options,gameId:'srwf-f'}),/only/);
 assert.throws(()=>spawnCapacityInfo('unknown'),/profile/);
 assert.throws(()=>applySpawnCapacity(ip,exec,options),/explicit/);
});

test('accepted font executable pins remain bound to each exact base while unbound discovery accepts only pinned files',()=>{
 const {ip,exec,options}=fixture('srwf-final'),other=exec.slice();other[100]^=1;
 const a='a'.repeat(64),b='b'.repeat(64),pins={[a]:sha256Hex(exec),[b]:sha256Hex(other)};
 const editor=createSpawnCapacityEditor({gameId:'srwf-final',ipSha256:sha256Hex(ip),execSha256:sha256Hex(exec),execSha256ByBase:pins,baseSha256:[a,b]});
 for(const [base,file]of [[a,exec],[b,other]]){
  const installed=editor.applySpawnCapacity(ip,file,{gameId:'srwf-final',baseSha256:base,enabled:true});
  assert.deepEqual(editor.normalizeSpawnCapacity(installed.ip,installed.exec,{gameId:'srwf-final'}).exec,file);
  assert.throws(()=>editor.applySpawnCapacity(ip,file,{gameId:'srwf-final',baseSha256:base===a?b:a,enabled:true}),/outside/);
 }
 const tamper=exec.slice();tamper[101]^=1;assert.throws(()=>editor.normalizeSpawnCapacity(ip,tamper,{gameId:'srwf-final'}),/outside/);
 const bad={...pins};Object.defineProperty(bad,a,{get(){throw Error('getter executed');},enumerable:true});
 assert.throws(()=>createSpawnCapacityEditor({gameId:'srwf-final',ipSha256:sha256Hex(ip),execSha256:sha256Hex(exec),execSha256ByBase:bad,baseSha256:[a,b]}),/pins/);
 const final=spawnCapacityInfo('srwf-final');assert.equal(Object.keys(final.sourceExecSha256ByBase).length,3);
 assert.equal(final.sourceExecSha256ByBase['0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d'],'2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0');
});
