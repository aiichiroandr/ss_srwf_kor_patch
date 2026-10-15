import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleBackdropContent} from '../assets/editor-battle-backdrop-content.mjs';
import {prepareBattleSecondLayerPicture} from '../assets/editor-battle-second-layer-picture.mjs';
const tile=()=>({width:8,height:8,pixels:new Uint8ClampedArray(256)});
const setup=()=>createBattleBackdropContent({clearTile:tile(),initialVisibility:[false,false]});
test('fresh cleared content, a published backdrop and later source clear are distinct from display enable',()=>{
 const content=setup();assert.deepEqual(content.snapshot().ownedVisible,[false,false]);
 content.published();assert.deepEqual(content.snapshot().ownedVisible,[true,true]);
 content.clear(0);assert.deepEqual(content.snapshot().ownedVisible,[false,true]);
 content.clear(1);assert.deepEqual(content.snapshot().ownedVisible,[false,false]);
 content.published();assert.deepEqual(content.snapshot().ownedVisible,[true,true]);
});
test('copies remain uncertain after a backdrop switch and become known empty only after a verified clear',()=>{
 const content=setup();content.published();content.copied(0,0);
 assert.deepEqual(content.snapshot().hasCopies,[false,false]);
 content.copied(0,1);content.published();assert.deepEqual(content.snapshot().hasCopies,[true,false]);
 content.clear(0);assert.deepEqual(content.snapshot().hasCopies,[false,false]);
});
test('nonempty pattern0 cannot silently disappear or change existing content',()=>{
 const t=tile();t.pixels[3]=255;
 const content=createBattleBackdropContent({clearTile:t,initialVisibility:[true,true]});
 content.copied(1,4);const before=content.snapshot();
 assert.throws(()=>content.clear(1),error=>error.code==='BATTLE_BACKGROUND_CLEAR_UNRESOLVED');
 assert.deepEqual(content.snapshot(),before);
});
test('all64 texels and actual subview bounds are checked, and snapshots cannot change ownership',()=>{
 const bytes=new Uint8Array(300).fill(255);bytes.fill(0,17,273);
 const initial=[false,true],content=createBattleBackdropContent({clearTile:{...tile(),pixels:bytes.subarray(17,273)},initialVisibility:initial});
 initial.fill(true);const snapshot=content.snapshot();snapshot.ownedVisible.fill(true);snapshot.hasCopies.fill(true);
 assert.deepEqual(content.snapshot(),{ownedVisible:[false,true],hasCopies:[false,false],emptyClear:true});
 const t=tile();t.pixels[255]=1;
 assert.throws(()=>createBattleBackdropContent({clearTile:t,initialVisibility:[true,true]}).clear(0),/not empty/);
});
test('source clear permits an explicitly absent rear without suppressing the still-visible effect',()=>{
 const content=setup();content.published();content.clear(0);content.clear(1);
 const state=content.snapshot(),result=prepareBattleSecondLayerPicture({viewport:{x:0,y:0,width:1,height:1},
  rear:state.ownedVisible[1]?undefined:null,
  effect:{picture:{width:1,height:1,pixels:Uint8Array.of(248,64,32,255)},x:0,y:0,width:1,height:1},
  effectRatio:0,back:{rgb:[0,0,0],ratio:0},
  scope:{planeContents:state.hasCopies.some(Boolean)?'replaced':'no-replacements',frontOverlay:'empty',spriteOrder:'ordinary',lowerLayers:'back-only'},
  colorOffsets:{rear:[-255,-255,-255],effect:[0,0,0],back:[0,0,0]}});
 assert.equal(result.status,'ready');assert.deepEqual([...result.picture.pixels],[240,62,31,255]);
});
test('invalid ownership inputs and copy extents are rejected before mutation',()=>{
 assert.throws(()=>createBattleBackdropContent({clearTile:tile()}),/explicit/);
 assert.throws(()=>createBattleBackdropContent({clearTile:tile(),initialVisibility:[false]}),/explicit/);
 const content=setup();const before=content.snapshot();
 for(const index of [-1,2,0.5])assert.throws(()=>content.clear(index),/invalid plane/);
 for(const count of [-1,4097,1.5])assert.throws(()=>content.copied(0,count),/invalid copy/);
 assert.deepEqual(content.snapshot(),before);
});
