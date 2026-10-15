import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBattleMessageDisplay,planBattleMessageUpload,commitBattleMessageUploads,reserveBattleMessageTexture} from '../assets/editor-battle-message-display.mjs';
function input(){
  const recordBytes=new Uint8Array(80);recordBytes.set([252,33,6,7,20],64);
  const scaleBytes=new Uint8Array(8);new DataView(scaleBytes.buffer).setFloat64(0,65536);
  const previousTextureDefinition=new Uint8Array(8),v=new DataView(previousTextureDefinition.buffer);
  v.setUint16(0,8);v.setUint16(2,1);v.setUint16(4,8192);
  return {recordBytes,textureBase:4,textureCount:1,paletteBank:48,scaleBytes,previousTextureDefinition,
    previousPaletteRecord:Uint8Array.from([0,4,0,3])};
}
test('native registration aligns the previous texture and prepares attributes and fixed-point XY',()=>{
  const source=input(),result=prepareBattleMessageDisplay(source);
  assert.equal(result.textureIndex,5);assert.equal(result.textureCountAfter,2);assert.equal(result.uploaded,false);
  assert.deepEqual(Array.from(result.textureDefinition),[1,8,0,48,32,4,33,48]);
  assert.deepEqual(Array.from(result.paletteRecord),[0,5,0,3,0,0,0,0]);
  assert.deepEqual(Array.from(result.attributes),[0,5,0,128,115,0,0,0,5,2]);
  const v=new DataView(result.positionPatch.buffer);assert.equal(v.getInt32(0),-104*65536);assert.equal(v.getInt32(4),48*65536);
  assert.equal(new DataView(result.recordAfter.buffer).getUint16(70),5);
  assert.equal(new DataView(source.recordBytes.buffer).getUint16(70),0);
});
test('native zero texture and counter wrap do not consume an invented previous record',()=>{
  const source=input();source.textureBase=65535;source.textureCount=1;
  delete source.previousTextureDefinition;delete source.previousPaletteRecord;
  assert.equal(new DataView(prepareBattleMessageDisplay(source).textureDefinition.buffer).getUint16(4),0x2000);
  source.textureBase=0;source.textureCount=65535;
  source.previousTextureDefinition=input().previousTextureDefinition;source.previousPaletteRecord=input().previousPaletteRecord;
  assert.equal(prepareBattleMessageDisplay(source).textureCountAfter,0);
});
test('unresolved geometry, previous formats and overflowing positions fail before registration mutation',()=>{
  const source=input(),before=source.recordBytes.slice();source.previousPaletteRecord[3]=32;
  assert.throws(()=>prepareBattleMessageDisplay(source),/format/);assert.deepEqual(source.recordBytes,before);
  source.previousPaletteRecord[3]=3;new DataView(source.scaleBytes.buffer).setFloat64(0,Infinity);
  assert.throws(()=>prepareBattleMessageDisplay(source),/scale/);
  source.recordBytes[65]=0;assert.throws(()=>prepareBattleMessageDisplay(source),/rectangle/);
});
function uploadInput(){
  const prepared=prepareBattleMessageDisplay(input()),textureDefinitions=new Uint8Array(8*8),paletteRecords=new Uint8Array(8*8);
  textureDefinitions.set(prepared.textureDefinition,prepared.textureIndex*8);
  const fontArena=new Uint8Array(0x8c00);fontArena[0]=0x12;fontArena[6335]=0x34;
  return {recordBytes:prepared.recordAfter,textureDefinitions,paletteRecords,fontArena,fontSourceAddress:0x202e0000,
    vram:new Uint8Array(0x80000),tileDestinationAddress:0};
}
test('FE stages and commits the registered font bytes and source pointer without replacing unrelated VRAM',()=>{
  const source=uploadInput(),plan=planBattleMessageUpload(source);
  assert.equal(plan.packedPixels.length,6336);assert.equal(plan.uploaded,false);assert.ok(source.vram.every(v=>v===0));
  commitBattleMessageUploads(source,[{plan}]);
  assert.equal(plan.uploaded,true);assert.equal(source.vram[plan.offset],0x12);assert.equal(source.vram[plan.offset+6335],0x34);
  assert.equal(source.vram[plan.offset-1],0);assert.equal(source.vram[plan.offset+6336],0);
  assert.deepEqual(Array.from(source.paletteRecords.slice(40,48)),[0,5,0,3,32,46,0,0]);
  source.fontArena[0]=99;assert.equal(source.vram[plan.offset],0x12);
});
test('optional FE tile copy preserves the24 unused words per destination row',()=>{
  const source=uploadInput();source.tileDestinationAddress=0x25e00000;
  source.tileSource=new Uint8Array(2240);for(let i=0;i<2240;i++)source.tileSource[i]=i&255;
  source.tileDestination=new Uint8Array(3584).fill(0xaa);
  const plan=planBattleMessageUpload(source);assert.equal(source.tileDestination[0],0xaa);
  commitBattleMessageUploads(source,[{plan,tileDestination:source.tileDestination}]);
  for(let row=0;row<28;row++){
    assert.deepEqual(source.tileDestination.subarray(row*128,row*128+80),source.tileSource.subarray(row*80,row*80+80));
    assert.ok(source.tileDestination.subarray(row*128+80,row*128+128).every(v=>v===0xaa));
  }
});
test('missing tile state and a malformed later staged upload cannot partially commit an earlier display',()=>{
  const source=uploadInput(),plan=planBattleMessageUpload(source);source.tileDestinationAddress=1;
  assert.throws(()=>planBattleMessageUpload(source),/tile-grid/);assert.ok(source.vram.every(v=>v===0));
  assert.throws(()=>commitBattleMessageUploads(source,[{plan},{plan:{...plan,offset:0x80000}}]),/staged/);
  assert.ok(source.vram.every(v=>v===0));assert.ok(source.paletteRecords.every(v=>v===0));assert.equal(plan.uploaded,false);
});

test('native battle setup initializes all four rectangles and resets counts while retaining opaque fields',async()=>{
 const {initializeBattleMessageRectangles}=await import('../assets/editor-battle-message-display.mjs');
 const records=Array.from({length:4},()=>new Uint8Array(80).fill(255)),counts=new Uint16Array([5,6,7,8]);
 initializeBattleMessageRectangles(records,counts);
 assert.deepEqual([...counts],[0,0,0,0]);
 records.forEach((r,i)=>{
  assert.deepEqual([...r.subarray(64,69)],[127,33,6,7,20]);assert.deepEqual([...r.subarray(70,74)],[255,255,255,255]);
  assert.equal(r[69],255);assert.equal(r[63],255);
  assert.equal(new DataView(r.buffer).getUint16(58),i===0?65535:0);
  assert.equal(new DataView(r.buffer).getUint16(74),i===0?0x110:65535);
 });
 const invalid=records.slice(0,3);counts.fill(8);const before=records.map(r=>r.slice());
 assert.throws(()=>initializeBattleMessageRectangles(invalid,counts),/four retained/);
 assert.deepEqual(records,before);assert.deepEqual([...counts],[8,8,8,8]);
});

test('native message scene setup retains opaque storage and prepares source/control/allocator state atomically',async()=>{
 const {prepareBattleMessageScene}=await import('../assets/editor-battle-message-display.mjs');
 const bytes=new Uint8Array(0x23cc).fill(255),controlBytes=new Uint8Array(16).fill(255),graphicsPointers=new Uint8Array(16).fill(2),gpuPointers=new Uint8Array(8).fill(3);
 const source={bytes,controlBytes,graphicsPointers,gpuPointers,fontAddress:0x20274b7b,glyphArenaAddress:0x202e0000,textureCounter:65535};
 const result=prepareBattleMessageScene(source),v=new DataView(result.bytes.buffer),c=new DataView(result.controlBytes.buffer);
 assert.equal(result.textureCounterAfter,0);assert.equal(v.getUint32(0x23a0),source.fontAddress);assert.equal(v.getUint32(0x23ac),source.glyphArenaAddress);
 assert.equal(v.getUint16(0x910),65535);assert.equal(v.getUint16(0x914),51);assert.equal(v.getUint32(0x90c),0);
 assert.equal(result.bytes[0x918],0x2b);assert.deepEqual([...result.bytes.subarray(0x23b4,0x23c4)],[...graphicsPointers]);
 assert.deepEqual([...result.bytes.subarray(0x23c4,0x23cc)],[...gpuPointers]);
 for(let i=0;i<4;i++){
  assert.deepEqual([...result.bytes.subarray(i*0x8d8+65,i*0x8d8+69)],[33,6,7,20]);assert.equal(v.getUint16(i*0x8d8+0x912),0);
 }
 assert.equal(result.controlBytes[0],63);assert.equal(result.controlBytes[1],255);assert.equal(c.getUint32(4),0);assert.equal(c.getUint32(12),0);
 assert.equal(c.getUint16(2),65535);assert.equal(c.getUint32(8),0xffffffff);
 assert.equal(bytes.every(n=>n===255),true);assert.equal(controlBytes.every(n=>n===255),true);
 assert.throws(()=>prepareBattleMessageScene({...source,gpuPointers:new Uint8Array(7)}),/setup context/);
 assert.equal(bytes.every(n=>n===255),true);
});

test('message reservation advances allocation without exposing an unuploaded archive picture',()=>{
 const source=input();source.textureBase=1;source.textureCount=0;
 const registration=prepareBattleMessageDisplay(source),state={nextTextureIndex:1,geometry:new Uint8Array(32),attributes:new Uint8Array(40),textureFormats:new Uint8Array(4),vram:new Uint8Array(0x80000)};
 state.geometry.set(source.previousTextureDefinition);state.textureFormats[0]=3;
 const ownership={sessionToken:'owned',nextTextureIndex:1,capacity:4,sources:new Map([[0,{subIndex:0}]])};
 const before=state.vram.slice();const receipt=reserveBattleMessageTexture(registration,state,ownership);
 assert.equal(receipt.registered,true);assert.equal(receipt.uploaded,false);assert.equal(state.nextTextureIndex,2);assert.equal(ownership.nextTextureIndex,2);
 assert.equal(ownership.sources.has(1),false);assert.equal(ownership.generatedTextures.get(1).uploaded,false);
 assert.deepEqual(state.geometry.slice(8,16),registration.textureDefinition);assert.deepEqual(state.vram,before);
 assert.throws(()=>reserveBattleMessageTexture(registration,state,ownership),/destination/);
});
test('message reservation rejects stale physical allocation before mutating any registry',()=>{
 const source=input();source.textureBase=1;source.textureCount=0;
 const registration=prepareBattleMessageDisplay(source),state={nextTextureIndex:1,geometry:new Uint8Array(16),attributes:new Uint8Array(20),textureFormats:new Uint8Array(2),vram:new Uint8Array(0x80000)};
 state.geometry.set(source.previousTextureDefinition);state.geometry[5]++;state.textureFormats[0]=3;
 const ownership={sessionToken:'owned',nextTextureIndex:1,capacity:2,sources:new Map()};
 assert.throws(()=>reserveBattleMessageTexture(registration,state,ownership),/destination/);assert.equal(state.nextTextureIndex,1);assert.equal(state.attributes.some(Boolean),false);assert.equal(ownership.generatedTextures,undefined);
});
