import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBattleTextureRegistration,applyBattleTextureRegistration,readBattleRegisteredTextureImage} from '../assets/editor-battle-texture-registration.mjs';
import {projectBattleActorSprite} from '../assets/editor-battle-actor-layout.mjs';
import {prepareBattleSceneFrame} from '../assets/editor-battle-scene-frame.mjs';
const image=(subIndex,width=8,height=2)=>({subIndex,nativeTexture:true,width,height,colorIndices:Uint8Array.from({length:width*height},(_,i)=>i%16),colorCount:16,paletteIndex:2,pivot:{x:-5,y:21}});
test('native loader retains order, aligned physical allocation, attributes and signed pivots',()=>{
 const plan=prepareBattleTextureRegistration({images:[image(0),image(1,16,3)],kind:0x70,textureBase:0,paletteBase:58,drawColor:4});
 assert.equal(plan.nextTextureIndex,2);const g=new DataView(plan.geometry.buffer),a=new DataView(plan.attributes.buffer),p=new DataView(plan.pivots.buffer);
 assert.deepEqual([g.getUint16(0),g.getUint16(2),g.getUint16(4),g.getUint16(6)],[8,2,0x2000,0x102]);
 assert.equal(g.getUint16(12),0x2004);assert.deepEqual([a.getUint16(0),a.getUint16(2),a.getUint16(4),a.getUint16(6),a.getUint16(8)],[0,128,0x43c0,0,0x0a02]);
 assert.equal(a.getUint16(10),1);assert.equal(p.getInt16(0),-5);assert.equal(p.getInt16(2),21);
 assert.deepEqual([...plan.uploads[0].bytes],[1,35,69,103,137,171,205,239]);
});
test('8bpp alignment, bank alignment and prior format determine next physical address',()=>{
 const prior=Uint8Array.from([0,8,0,3,0x20,0,1,3]);
 const plan=prepareBattleTextureRegistration({images:[{...image(0,4,2),colorCount:256}],kind:0x50,textureBase:7,paletteBase:17,drawColor:5,previousGeometry:prior,previousFormat:3});
 assert.equal(plan.paletteBase,32);assert.equal(plan.uploads[0].address,0x10020);
 assert.deepEqual([...plan.uploads[0].bytes],[0,1,2,3,4,5,6,7]);assert.equal(new DataView(plan.attributes.buffer).getUint16(2),160);
});
test('missing, skipped, oversized or malformed native textures cannot produce partial registration',()=>{
 const state={images:[image(0)],kind:0x70,textureBase:0,paletteBase:0,drawColor:0};
 for(const change of [{images:[image(1)]},{images:[{...image(0),nativeTexture:false}]},{images:[image(0,6)]},{textureBase:1},{images:[{...image(0),pivot:{x:65535,y:0}}]}])assert.throws(()=>prepareBattleTextureRegistration({...state,...change}),/unresolved/);
 const original=image(0);original.colorIndices[1]=16;assert.throws(()=>prepareBattleTextureRegistration({...state,images:[original]}),/unresolved/);
 const previousGeometry=Uint8Array.from([0,8,0,1,0xff,0xff,1,1]);
 assert.throws(()=>prepareBattleTextureRegistration({...state,textureBase:1,previousGeometry,previousFormat:3}),/unresolved/);
});

test('registration commits retained bytes once, and validates all destinations before mutation',()=>{
 const plan=prepareBattleTextureRegistration({images:[image(0)],kind:0x70,textureBase:0,paletteBase:0,drawColor:0});
 const state={nextTextureIndex:0,geometry:new Uint8Array(16),attributes:new Uint8Array(20),pivots:new Uint8Array(8),vram:new Uint8Array(0x80000),textureFormats:new Uint8Array(10)};
 assert.throws(()=>applyBattleTextureRegistration(plan,{...state,attributes:new Uint8Array(0)}),/destination/);
 assert.equal(state.geometry.some(Boolean),false);assert.equal(state.vram.some(Boolean),false);
 plan.geometry.fill(255);plan.uploads[0].bytes.fill(255);
 const done=applyBattleTextureRegistration(plan,state);assert.equal(done.uploaded,true);assert.equal(state.nextTextureIndex,1);
 assert.equal(new DataView(state.geometry.buffer).getUint16(0),8);assert.equal(state.vram[0x10000],1);
 assert.throws(()=>applyBattleTextureRegistration(plan,state),/destination/);
});

test('bounded terminal1024x64 storage preserves all22 slots and upload bytes without authorizing its draw',async()=>{
 const images=Array.from({length:22},(_,i)=>image(i,i===21?1024:8,i===21?64:2));
 const plan=prepareBattleTextureRegistration({images,kind:0x70,textureBase:0,paletteBase:58,drawColor:4});
 const g=new DataView(plan.geometry.buffer);
 assert.equal(plan.textureCount,22);assert.equal(plan.nextTextureIndex,22);
 assert.deepEqual([g.getUint16(168),g.getUint16(170),g.getUint16(174)],[1024,64,0x8040]);
 assert.equal(plan.uploads[21].textureIndex,21);assert.equal(plan.uploads[21].address,0x102a0);
 assert.equal(plan.uploads[21].bytes.length,32768);
 assert.deepEqual([...plan.uploads[21].bytes.slice(0,8)],[1,35,69,103,137,171,205,239]);
 const expected=plan.uploads.map(u=>({address:u.address,bytes:u.bytes.slice()}));
 const state={nextTextureIndex:0,geometry:new Uint8Array(22*8),attributes:new Uint8Array(22*10),pivots:new Uint8Array(22*4),vram:new Uint8Array(0x80000),textureFormats:new Uint8Array(22)};
 applyBattleTextureRegistration(plan,state);
 for(const upload of expected)assert.deepEqual(state.vram.slice(upload.address,upload.address+upload.bytes.length),upload.bytes);
 for(let i=0;i<21;i++){
  const loaded=readBattleRegisteredTextureImage(state,i,'owned-slot-'+i);
  assert.deepEqual(loaded.colorIndices,images[i].colorIndices);assert.equal(loaded.textureIndex,i);
 }
 assert.throws(()=>readBattleRegisteredTextureImage(state,21,'owned-slot-21'),/unresolved physical geometry/);
 assert.throws(()=>projectBattleActorSprite({},()=>null,images[21],{}),/unresolved native sprite geometry/);
 const source={fileName:'E_SPR.BIN',byteLength:40,recordOffset:24,recordEnd:28,headerSlots:[0]};
 const records=Array.from({length:129},()=>({flags1:0}));
 Object.assign(records[1],{flags1:0xc8,flags2:0,selector:21,colorFlags:2,renderMode:2,nativeByte64:10,nativeWord72:0});
 const context={variant:1,depthTables:new Uint8Array(32),paletteWords:new Uint16Array(1024),
  screenOffsets:{offsetX:0,offsetY:0},textureState:state,
  nativeRegistry:{variant:1,pass:0,textureBases:new Uint16Array(32),addressMap:new Uint16Array(64),
   drawColors:new Uint8Array(8),geometryTable:state.geometry,textureAttributes:state.attributes},
  textureSourceRegistry:{sessionToken:'wide-storage-test',sources:new Map(images.map((_,i)=>[i,{...source,subIndex:i}]))},
  state:{systemClip:{maxX:319,maxY:223},localX:160,localY:112},clearColor:[0,0,0,255]};
 await assert.rejects(prepareBattleSceneFrame({drawRecords:records},{
  sources:{sourceSessionToken:'wide-storage-test',weaponGraphics:[source]},context}),/unresolved physical geometry/);
});

test('storage-only geometry is still bounded by complete pixel data, uint16 alignment and physical allocation',()=>{
 const options={kind:0x70,textureBase:0,paletteBase:0,drawColor:0};
 const wide=image(0,1024,64);
 for(const bad of [{...wide,colorIndices:wide.colorIndices.subarray(1)},
   {...wide,width:65536},{...wide,height:0},{...wide,height:513},
   {...wide,width:65528,height:17,colorIndices:new Uint8Array(65528*17)}]){
  assert.throws(()=>prepareBattleTextureRegistration({...options,images:[bad]}),/unresolved/);
 }
 const previousGeometry=Uint8Array.from([0,8,0,1,0xff,0xf0,1,1]);
 assert.throws(()=>prepareBattleTextureRegistration({...options,images:[wide],textureBase:1,previousGeometry,previousFormat:3}),/unresolved/);
 // Filling the last physical byte must not wrap the following retained slot
 // to address0 and overwrite an earlier registration in the same plan.
 assert.throws(()=>prepareBattleTextureRegistration({...options,images:[image(0,14336,64),image(1)]}),/unresolved/);
});
