import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattlePaletteInitializer,createBattlePaletteApproacher,createBattlePaletteTransition,createBattlePaletteSelector,createBattlePalettePool,resetBattlePalettes,loadBattleBankPalette,loadBattleBodyPalette,resolveBattleTexturePaletteBanks,advanceBattleSpriteLoadCounters,resolveBattleSpriteLoadContext,readBattlePaletteRendererTables} from '../assets/editor-battle-palette.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
test('positive palette weights preserve the native asymmetric rounding and RGB555 channel independence',()=>{
 const sourceWords=new Uint16Array(6144),destinationWords=new Uint16Array(1024),target=31|(7<<5)|(2<<10),current=0|(31<<5)|(13<<10);
 sourceWords[256]=target;
 const approach=createBattlePaletteApproacher({mode:0,sourceWords,destinationWords});
 for(const [weight,expected]of [[0,current],[128,15|(19<<5)|(8<<10)],[256,target]]){
  destinationWords[0]=current|32768;
  assert.equal(approach({request:0,count:1,bank:1,selector:0,weight}),true);
  assert.equal(destinationWords[0],expected);
 }
 sourceWords[256]=0;destinationWords[0]=31;
 approach({request:0,count:1,bank:1,selector:0,weight:128});assert.equal(destinationWords[0],16);
 destinationWords[0]=0;sourceWords[256]=31;
 approach({request:0,count:1,bank:1,selector:0,weight:255});assert.equal(destinationWords[0],30);
 const before=destinationWords.slice();
 for(const weight of [-2,257,0.5]){
  assert.equal(approach({request:0,count:1,bank:1,selector:0,weight}),false);
  assert.deepEqual(destinationWords,before);
 }
});
test('FA02 initial and target palettes share mapped destinations and keep unrelated colors',()=>{
 const sourceWords=new Uint16Array(6144),destinationWords=new Uint16Array(1024).fill(77),addressMap=new Uint16Array(64);
 addressMap[32]=4;sourceWords.fill(31,32,48);sourceWords.fill(0,48,64);
 const transition=createBattlePaletteTransition({mode:1,sourceWords,destinationWords,addressMap});
 assert.equal(transition({request:128,count:16,initial:{bank:2,selector:0},target:{bank:3,selector:0},weight:128}),true);
 assert.ok(destinationWords.slice(64,80).every(word=>word===16));
 assert.equal(destinationWords[63],77);assert.equal(destinationWords[80],77);
 assert.equal(transition({request:128,count:16,initial:null,target:{bank:3,selector:0},weight:128}),true);
 assert.ok(destinationWords.slice(64,80).every(word=>word===8));
 assert.equal(transition({request:128,count:16,initial:null,target:{bank:3,selector:0},weight:256}),true);
 assert.ok(destinationWords.slice(64,80).every(word=>word===0));
});
test('FA02 stages initial copying so invalid target extents or weights cannot partly alter a palette',()=>{
 const sourceWords=new Uint16Array(6144).fill(31),destinationWords=new Uint16Array(1024).fill(777);
 const transition=createBattlePaletteTransition({mode:0,sourceWords,destinationWords});
 const base={request:0,count:16,initial:{bank:1,selector:0},target:{bank:255,selector:0},weight:128},before=destinationWords.slice();
 for(const request of [base,{...base,target:{bank:1,selector:0},weight:257},
  {...base,target:{bank:1,selector:0},count:0},{...base,target:{bank:1,selector:0},request:1023},
  {...base,initial:{bank:-1,selector:0},target:{bank:1,selector:0}}]){
  assert.equal(transition(request),false);assert.deepEqual(destinationWords,before);
 }
 assert.throws(()=>createBattlePaletteTransition({mode:0,sourceWords,destinationWords:new Uint16Array(1023)}),/transition state/);
});
test('body palette registration uses separate reserved banks and obeys the native four-bank limit',()=>{
 const sourceWords=new Uint16Array(6144).fill(77),bankStates=new Uint8Array(768);
 const loadPool=createBattlePalettePool({sourceWords,bankStates});
 const record={paletteWords:Uint16Array.from({length:16},(_,i)=>i),colorCount:16,nativeBankCount:1};
 assert.equal(loadBattleBodyPalette(record,{role:'attacker',loadPool,sourceAddress:0x060ff958}).loaded,true);
 assert.deepEqual(sourceWords.slice(58*16,59*16),record.paletteWords);assert.equal(sourceWords[62*16],77);
 assert.equal(loadBattleBodyPalette(record,{role:'defender',loadPool,sourceAddress:0x060ff958}).loaded,true);
 assert.deepEqual(sourceWords.slice(62*16,63*16),record.paletteWords);
 const before=sourceWords.slice();
 assert.equal(loadBattleBodyPalette({...record,paletteWords:new Uint16Array(80),colorCount:80,nativeBankCount:5},
  {role:'attacker',loadPool,sourceAddress:0x060ff958}).reason,'body-palette-bank-limit');
 assert.equal(loadBattleBodyPalette(record,{role:'attacker',loadPool,sourceAddress:0x060ff958}).loaded,false);
 assert.deepEqual(sourceWords,before);
});
test('executable palette tables preserve their overlapping word and do not alias disc bytes',()=>{
 const executable=new Uint8Array(180),v=new DataView(executable.buffer);
 for(let i=0;i<79;i++)v.setUint16(4+i*2,100+i);
 const tables=readBattlePaletteRendererTables(executable,{baseAddress:0x06004000,bankBasesAddress:0x06004004,addressMapAddress:0x06004022});
 assert.equal(tables.bankBases[15],115);assert.equal(tables.addressMap[0],115);
 tables.addressMap[0]=999;assert.equal(tables.bankBases[15],999);assert.equal(v.getUint16(34),115);
 assert.throws(()=>readBattlePaletteRendererTables(executable.subarray(0,161),{baseAddress:0x06004000,bankBasesAddress:0x06004004,addressMapAddress:0x06004022}));
});
test('weapon loader follows cache remapping and actual bank words without slot-number fallback',()=>{
 const cacheMap=Uint8Array.from([0,99,5,255,0,10]),bankBases=new Uint16Array(16);bankBases[0]=128;bankBases[5]=132;
 assert.deepEqual(resolveBattleSpriteLoadContext({logicalIndex:1,cacheMap,bankBases}),{cacheIndex:5,baseBank:132,format:4});
 assert.equal(resolveBattleSpriteLoadContext({logicalIndex:2,cacheMap,bankBases}).baseBank,128);
 bankBases[5]=65535;assert.equal(resolveBattleSpriteLoadContext({logicalIndex:1,cacheMap,bankBases}).baseBank,65535);
 cacheMap[2]=16;assert.equal(resolveBattleSpriteLoadContext({logicalIndex:1,cacheMap,bankBases}),null);
 assert.equal(resolveBattleSpriteLoadContext({logicalIndex:3,cacheMap,bankBases}),null);
 assert.equal(resolveBattleSpriteLoadContext({logicalIndex:0,bankBases}),null);
});
test('sprite completion follows observed F/Final texture totals and explicit discontinuous bases',()=>{
 for(const initial of [12,14]){
  const state={textureCount:initial,bankEnd:0};
  for(const [textureCount,baseBank,bankCount,total,end]of [[45,74,18,57,92],[5,96,1,62,97],[12,128,4,74,132],[8,132,2,82,134]]){
   advanceBattleSpriteLoadCounters(state,{textureCount,baseBank,bankCount});
   assert.equal(state.textureCount,total+initial-12);assert.equal(state.bankEnd,end);
  }
 }
 const state={textureCount:65535,bankEnd:123};
 advanceBattleSpriteLoadCounters(state,{textureCount:2,baseBank:65535,bankCount:2});
 assert.deepEqual(state,{textureCount:1,bankEnd:1});
 const before={...state};assert.throws(()=>advanceBattleSpriteLoadCounters(state,{textureCount:1,baseBank:0,bankCount:256}));
 assert.deepEqual(state,before);
});
test('sprite loading maps native material palette bits to byte-sized texture banks',()=>{
 const attributes=new Uint8Array(40),view=new DataView(attributes.buffer);
 [0,0x0030,0xf3f0,0x0400].forEach((word,i)=>view.setUint16(i*10+4,word));
 const before=attributes.slice();
 assert.deepEqual([...resolveBattleTexturePaletteBanks(attributes,128)],[128,131,191,128]);
 assert.deepEqual([...resolveBattleTexturePaletteBanks(attributes,250)],[250,253,57,250]);
 assert.deepEqual(attributes,before);
 assert.equal(resolveBattleTexturePaletteBanks(new Uint8Array(0),0).length,0);
 assert.throws(()=>resolveBattleTexturePaletteBanks(attributes.subarray(1),0));
 assert.throws(()=>resolveBattleTexturePaletteBanks(attributes,-1));
});
test('whole-bank loading connects original words to the retained cache base and advances the next base',()=>{
  const sourceWords=new Uint16Array(6144),bankStates=new Uint8Array(768),bankBases=new Uint16Array(16).fill(128);
  const pool=createBattlePalettePool({sourceWords,bankStates});
  const record={paletteWords:Uint16Array.from({length:80},(_,i)=>i+1),colorCount:80,nativeBankCount:5};
  assert.deepEqual(loadBattleBankPalette(pool,bankBases,6,record,0x20240000),{loaded:true,code:0,base:128,count:5,nextBase:133});
  assert.deepEqual(sourceWords.slice(2048,2128),record.paletteWords);
  assert.equal(bankBases[6],128);assert.equal(bankBases[7],133);assert.equal(bankBases[8],128);
  assert.deepEqual(loadBattleBankPalette(pool,bankBases,7,record,0x20240000),{loaded:true,code:0,base:133,count:5,nextBase:138});
});
test('failed or malformed whole-bank loading cannot advance cache bases',()=>{
  const sourceWords=new Uint16Array(6144),bankStates=new Uint8Array(768),bankBases=new Uint16Array(16).fill(128);
  bankStates[256]=1;const pool=createBattlePalettePool({sourceWords,bankStates});
  const record={paletteWords:new Uint16Array(80),colorCount:80,nativeBankCount:5};
  assert.deepEqual(loadBattleBankPalette(pool,bankBases,6,record,4),{loaded:false,code:0});
  assert.equal(bankBases[7],128);
  assert.equal(loadBattleBankPalette(pool,bankBases,6,{...record,nativeBankCount:6},4).reason,'invalid-bank-record');
  assert.ok(sourceWords.every(n=>n===0));assert.ok(bankBases.every(n=>n===128));
});
test('native palette reset preserves uncleared source tail, bank side bytes and final base cells',()=>{
  const sourceWords=new Uint16Array(6144).fill(9),destinationWords=new Uint16Array(1024).fill(12);
  const bankStates=new Uint8Array(768).fill(77),bankBases=new Uint16Array(16).fill(66);
  assert.deepEqual(resetBattlePalettes({sourceWords,destinationWords,bankStates,bankBases}),{graphicsCompletionWord:0});
  for(const [bank,color]of [[0,0],[1,32767],[2,31],[3,992],[4,31744],[5,1023]])
    assert.ok(sourceWords.slice(bank*16,(bank+1)*16).every(n=>n===color));
  assert.ok(sourceWords.slice(96,4096).every(n=>n===0));assert.ok(sourceWords.slice(4096).every(n=>n===9));
  assert.ok(destinationWords.every(n=>n===0));
  assert.ok(bankStates.every((n,i)=>n===(i%2?77:0)));
  assert.deepEqual(Array.from(bankBases),[...Array(14).fill(128),66,66]);
});
test('palette reset validates all retained extents before modifying any state',()=>{
  const sourceWords=new Uint16Array(6144).fill(9);
  assert.throws(()=>resetBattlePalettes({sourceWords,destinationWords:new Uint16Array(1024),bankStates:new Uint8Array(768),bankBases:new Uint16Array(14)}),/reset state/);
  assert.ok(sourceWords.every(n=>n===9));
});
test('native palette pool reserves banks, preserves side bytes and copies their actual colors',()=>{
  const sourceWords=new Uint16Array(6144).fill(9),bankStates=new Uint8Array(768);
  bankStates[5]=77;const load=createBattlePalettePool({sourceWords,bankStates});
  const words=Uint16Array.from({length:32},(_,i)=>i+10);
  assert.deepEqual(load({bank:258,count:2,sourceAddress:0x20200000,words}),{loaded:true,code:0});
  assert.deepEqual(sourceWords.slice(32,64),words);assert.equal(sourceWords[31],9);assert.equal(sourceWords[64],9);
  assert.equal(bankStates[4],1);assert.equal(bankStates[6],1);assert.equal(bankStates[5],77);
  assert.deepEqual(load({bank:2,count:1,sourceAddress:0x20200000,words}),{loaded:false,code:0});
});
test('native palette pool errors cannot partially reserve or overwrite banks',()=>{
  const sourceWords=new Uint16Array(6144),bankStates=new Uint8Array(768),words=new Uint16Array(32);
  const load=createBattlePalettePool({sourceWords,bankStates});
  for(const [request,code]of [[{sourceAddress:3},-1],[{sourceAddress:0},-2],[{count:0},-3],[{bank:255,count:130},1]])
    assert.deepEqual(load({bank:0,count:2,sourceAddress:4,words,...request}),{loaded:false,code});
  assert.ok(bankStates.every(n=>n===0));
  bankStates[2]=1;assert.deepEqual(load({bank:0,count:2,sourceAddress:4,words}),{loaded:false,code:1});
  assert.equal(bankStates[0],0);assert.ok(sourceWords.every(n=>n===0));
});
test('native palette selector covers direct banks, mapped words and special sentinels',()=>{
  const select=createBattlePaletteSelector({bankBases:Uint16Array.from({length:16},(_,i)=>i*5),directionBit6:false,sideWords:[0,0]});
  for(const [word,bank,selector]of [[0,0,0],[255,15,15],[256,0,0],[261,5,0],[262,16,6],
    [0x6000,30,0],[0xff00,74,0],[0xff07,81,0],[0xff08,92,0],[0xff09,83,0],[0xff11,91,0],
    [0xff14,58,0],[0xff15,62,0],[0xff1b,65,0],[0xff1c,38,0],[0xff1f,41,0],[0xff20,96,0]])
    assert.deepEqual(select(word),{bank,selector});
  assert.deepEqual(createBattlePaletteSelector({directionBit6:true,sideWords:[1,0]})(0xff17),{bank:67,selector:0});
  assert.deepEqual(createBattlePaletteSelector({directionBit6:false,sideWords:[0,1]})(0xff19),{bank:72,selector:0});
});
test('palette selection never invents missing bank maps or side state',()=>{
  const select=createBattlePaletteSelector();
  for(const word of [0,0x6000,0xff14,0xff15,-1,65536])assert.equal(select(word),null);
  assert.deepEqual(select(0xff20),{bank:96,selector:0});
});
test('mode1 matches native shrinking-count loop and remapped destination strides',()=>{
  const sourceWords=Uint16Array.from({length:2048},(_,i)=>i+1),destinationWords=new Uint16Array(1024).fill(65535);
  const addressMap=Uint16Array.from({length:64},(_,i)=>(i%4)*16+(i>>>2));
  const init=createBattlePaletteInitializer({mode:1,sourceWords,destinationWords,addressMap});
  assert.equal(init({request:0,count:48,bank:2,selector:0}),true);
  assert.deepEqual(destinationWords.slice(0,16),sourceWords.slice(32,48));
  assert.ok(destinationWords.slice(16,32).every(n=>n===65535));
  assert.deepEqual(destinationWords.slice(32,48),sourceWords.slice(48,64));
  assert.ok(destinationWords.slice(48).every(n=>n===65535));
});
test('mode1 preserves partial rows and refuses underflow or bad mapped extents atomically',()=>{
  const sourceWords=Uint16Array.from({length:2048},(_,i)=>i+1),destinationWords=new Uint16Array(1024).fill(65535);
  const addressMap=Uint16Array.from({length:64},(_,i)=>(i%4)*16+(i>>>2));
  const init=createBattlePaletteInitializer({mode:1,sourceWords,destinationWords,addressMap});
  assert.equal(init({request:1,count:3,bank:2,selector:0}),false);
  assert.ok(destinationWords.every(n=>n===65535));
  assert.equal(init({request:15,count:3,bank:2,selector:0}),true);
  assert.deepEqual(destinationWords.slice(15,18),sourceWords.slice(32,35));
  destinationWords.fill(65535);addressMap[4]=65535;
  assert.equal(init({request:15,count:16,bank:2,selector:0}),false);
  assert.ok(destinationWords.every(n=>n===65535));
});
test('6F actually copies native palette words and preserves all other retained colors',()=>{
  const sourceWords=Uint16Array.from({length:1024},(_,i)=>i*31&65535),destinationWords=new Uint16Array(1024).fill(7);
  const shared={flags:0,graphicsMode:0,initializeGraphics:createBattlePaletteInitializer({mode:0,sourceWords,destinationWords})};
  const c=createBattleMainClock(Uint8Array.from([0x6f,1,250,0,16,2,252,4]),{shared});
  assert.equal(tickBattleMainClock(c).ended,true);
  assert.deepEqual(destinationWords.slice(506,522),sourceWords.slice(764,780));
  assert.ok(destinationWords.slice(0,506).every(n=>n===7));assert.ok(destinationWords.slice(522).every(n=>n===7));
});
test('unresolved remapping and out-of-bounds copies fail before palette mutation',()=>{
  const sourceWords=new Uint16Array(512),destinationWords=new Uint16Array(1024).fill(123);
  const init=createBattlePaletteInitializer({mode:0,sourceWords,destinationWords});
  assert.equal(init({request:1020,count:16,bank:0,selector:0}),false);
  assert.equal(init({request:0,count:16,bank:1,selector:250}),false);
  assert.equal(createBattlePaletteInitializer({mode:1,sourceWords,destinationWords})({request:0,count:16,bank:0,selector:0}),false);
  assert.ok(destinationWords.every(n=>n===123));
  assert.equal(init({request:0,count:0,bank:0,selector:0}),true);
});

test('actor color approach moves each channel independently and converges without overshooting',()=>{
 const sourceWords=new Uint16Array(6144),destinationWords=new Uint16Array(1024).fill(32767),addressMap=new Uint16Array(64);
 addressMap[36]=44;sourceWords[62*16]=(10<<10)|(5<<5)|31;destinationWords[44*16]=(20<<10)|(5<<5)|1;
 const approach=createBattlePaletteApproacher({mode:1,sourceWords,destinationWords,addressMap});
 assert.equal(approach({request:144,count:1,bank:62,selector:0}),true);
 assert.equal(destinationWords[44*16],(19<<10)|(5<<5)|2);assert.equal(destinationWords[44*16+1],32767);
 for(let i=0;i<40;i++)approach({request:144,count:1,bank:62,selector:0});
 assert.equal(destinationWords[44*16],sourceWords[62*16]);
 const before=destinationWords.slice();assert.equal(approach({request:1023,count:16,bank:62,selector:0}),false);
 assert.deepEqual(destinationWords,before);
});
