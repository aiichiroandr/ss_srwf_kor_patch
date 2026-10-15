import test from 'node:test';import assert from 'node:assert/strict';
import {prepareBattleWebEffectEdgePicture,createBattleWebEffectEdgePreparer} from '../assets/editor-battle-web-effect-edge.mjs';
import {prepareBattleWebPicture,expandBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';
const sprite={carrier:'owned-common-sprite',group:19,sourceTableCell:10,role:'debris'};
const screen={carrier:'owned-common-screen',planeIndex:2,resourceIndex:14,sourceTableCell:11,mapTableCell:12,role:'explosion'};
function picture(){
 const pixels=new Uint8Array(9*9*4);
 for(let y=1;y<8;y++)for(let x=1;x<8;x++)pixels.set([24,0,0,255],(y*9+x)*4);
 for(let y=2;y<7;y++)for(let x=2;x<7;x++)pixels.set([248,160,32,255],(y*9+x)*4);
 pixels.set([0,0,24,255],(4*9+4)*4);pixels.set([64,16,0,255],(1*9+4)*4);
 return {width:9,height:9,pixels};
}
test('verified effect matte becomes transparent/soft while enclosed black shading and every RGB byte remain intact',()=>{
 for(const provenance of [sprite,{...sprite,sourceTableCell:16},screen,
  {...screen,sourceTableCell:14,mapTableCell:15},{...screen,sourceTableCell:17,mapTableCell:18},
  {...screen,resourceIndex:15,sourceTableCell:8,mapTableCell:9,role:'dust'}]){
  const p=picture(),before=p.pixels.slice(),r=prepareBattleWebEffectEdgePicture({picture:p,provenance,enabled:true});
  assert.equal(r.corrected,true);assert.equal(r.picture.width,p.width);assert.equal(r.picture.height,p.height);
  assert.equal(r.picture.pixels[(1*9+1)*4+3],0);assert.equal(r.picture.pixels[(1*9+4)*4+3],128);
  assert.deepEqual([...r.picture.pixels.slice((4*9+4)*4,(4*9+4)*4+4)],[0,0,24,255]);
  assert.equal(r.evidence.protectedDarkPixels,1);assert.equal(r.evidence.featheredPixels,1);
  for(let i=0;i<before.length;i++)if(i%4!==3)assert.equal(r.picture.pixels[i],before[i]);
  assert.deepEqual(p.pixels,before);assert.deepEqual(expandBattleWebPicture(prepareBattleWebPicture(r.picture)),r.picture);
 }
});
test('body, portraits, HUD, shadows, mixed or unknown sources and the original option cannot receive a color key',()=>{
 const p=picture();for(const provenance of [null,{...sprite,carrier:'C_ROBOT.BIN'},{...sprite,carrier:'FACE.BIN'},
  {...sprite,group:16,sourceTableCell:7},{...sprite,sourceTableCell:20},{...sprite,role:'target'},
  {...screen,planeIndex:3},{...screen,resourceIndex:0},{...screen,mapTableCell:9},
  {...screen,carrier:'BTSR.BIN'},{...screen,carrier:'mixed'}, {...screen,role:'dust'}]){
  const r=prepareBattleWebEffectEdgePicture({picture:p,provenance,enabled:true});assert.equal(r.corrected,false);assert.equal(r.picture,p);
 }
 assert.equal(prepareBattleWebEffectEdgePicture({picture:p,provenance:sprite,enabled:false}).picture,p);
});
test('only the owned common booster pair and selected weapon effect plane gain the new preparation profile',()=>{
 const p=picture(),booster={carrier:'owned-common-sprite',group:16,sourceTableCell:7,role:'booster'},
  effect={carrier:'owned-weapon-animation-bank',planeIndex:2,role:'weapon-effect'};
 for(const subIndex of [42,43])assert.equal(prepareBattleWebEffectEdgePicture({picture:p,enabled:true,
  provenance:{...booster,subIndex}}).corrected,true);
 for(let subIndex=35;subIndex<=41;subIndex++)assert.equal(prepareBattleWebEffectEdgePicture({picture:p,enabled:true,
  provenance:{...booster,subIndex,role:'common-effect'}}).corrected,true);
 for(let resourceIndex=0;resourceIndex<6;resourceIndex++)assert.equal(prepareBattleWebEffectEdgePicture({picture:p,enabled:true,
  provenance:{...effect,resourceIndex}}).corrected,true);
 // Body-shadow, result digits, HP/EN bars, portrait and unknown common
 // pictures cannot inherit a booster flag, even in the same loaded bank.
 for(const subIndex of [0,11,12,13,14,15,16,25,26,34,35,41,44,'42',undefined])
  assert.equal(prepareBattleWebEffectEdgePicture({picture:p,enabled:true,provenance:{...booster,subIndex}}).picture,p);
 for(const provenance of [{...booster,subIndex:42,sourceTableCell:20},{...booster,subIndex:42,role:'debris'},
  {...sprite,role:'weapon-effect'},{...effect,resourceIndex:0,planeIndex:0},{...effect,resourceIndex:0,planeIndex:3},
  {...effect,resourceIndex:6},{...effect,resourceIndex:-1},{...effect,resourceIndex:'0'},{...effect,resourceIndex:0,carrier:'mixed'},
  {...effect,resourceIndex:0,role:'target'}])
  assert.equal(prepareBattleWebEffectEdgePicture({picture:p,enabled:true,provenance}).picture,p);
});
test('colored optical rims use perceptual alpha without sharing a different matte strategy cache result',()=>{
 const p=picture(),before=p.pixels.slice(),point=(1*9+4)*4+3,prepare=createBattleWebEffectEdgePreparer(),
  matte={picture:p,provenance:sprite,enabled:true},light={...matte,provenance:{carrier:'owned-weapon-animation-bank',
   planeIndex:2,resourceIndex:0,role:'weapon-effect'}};
 const a=prepare(matte),b=prepare(light);
 assert.equal(a.picture.pixels[point],128);assert.equal(b.picture.pixels[point],0);
 assert.equal(a.evidence.brightness,'maximum-channel');assert.equal(b.evidence.brightness,'perceptual-luminance');
 assert.notEqual(a.picture,b.picture);assert.equal(prepare(matte).picture,a.picture);assert.equal(prepare(light).picture,b.picture);
 assert.equal(prepare.stats().computations,2);assert.equal(prepare.stats().cacheHits,2);assert.deepEqual(p.pixels,before);
 for(let i=0;i<before.length;i++)if(i%4!==3)assert.equal(b.picture.pixels[i],before[i]);
});
test('closed internal transparent holes do not give their surrounding shading an exterior connection',()=>{
 const p=picture();p.pixels.set([0,0,0,0],(4*9+4)*4);p.pixels.set([0,0,0,255],(4*9+5)*4);
 const r=prepareBattleWebEffectEdgePicture({picture:p,provenance:sprite,enabled:true});
 assert.equal(r.picture.pixels[(4*9+5)*4+3],255);assert.equal(r.picture.pixels[(4*9+4)*4+3],0);
});
test('two-axis ink bounds preserve smoke shading reached by a curved exterior channel',()=>{
 const p=picture();
 for(let y=2;y<7;y++)for(let x=2;x<7;x++)p.pixels.set([64,48,32,255],(y*9+x)*4);
 p.pixels.set([248,160,32,255],(3*9+3)*4);
 // Exterior dark pixels reach the center around a bend; a flood alone would
 // remove it. Ink to its left/right/top/bottom makes this interior shading.
 for(const [x,y]of [[4,1],[4,2],[5,2],[5,3],[5,4],[4,4]])
  p.pixels.set([0,0,24,255],(y*9+x)*4);
 const before=p.pixels.slice(),r=prepareBattleWebEffectEdgePicture({picture:p,provenance:screen,enabled:true});
 assert.equal(r.corrected,true);assert.equal(r.picture.pixels[(4*9+4)*4+3],255);
 assert.equal(r.picture.pixels[(4*9+5)*4+3],0);
 assert.equal(r.picture.pixels[(1*9+4)*4+3],0);
 assert.ok(r.evidence.protectedDarkPixels>1);assert.deepEqual(p.pixels,before);
 for(let i=0;i<before.length;i++)if(i%4!==3)assert.equal(r.picture.pixels[i],before[i]);
});
test('partial source alpha is multiplied only at an external matte, with typed subviews preserved',()=>{
 const p=picture(),storage=new Uint8Array(p.pixels.length+20).fill(77);storage.set(p.pixels,7);p.pixels=storage.subarray(7,7+p.pixels.length);
 p.pixels[(1*9+4)*4+3]=128;const before=storage.slice(),r=prepareBattleWebEffectEdgePicture({picture:p,provenance:screen,enabled:true});
 assert.equal(r.picture.pixels[(1*9+4)*4+3],64);assert.deepEqual(storage,before);
 for(const pixels of [new Uint8Array(1),Array.from(p.pixels),new Uint16Array(p.pixels.length)])
  assert.throws(()=>prepareBattleWebEffectEdgePicture({picture:{...p,pixels},provenance:sprite,enabled:true}),/bounded RGBA/);
 for(const enabled of [1,null,'on'])assert.throws(()=>prepareBattleWebEffectEdgePicture({picture:p,provenance:sprite,enabled}),/explicit correction/);
});
test('dark monochrome particles, fully bright effects and source black silhouettes stay unchanged',()=>{
 for(const color of [[0,0,0],[0,0,24],[248,248,248]]){
  const p=picture();for(let i=0;i<p.pixels.length;i+=4)if(p.pixels[i+3])p.pixels.set(color,i);
  assert.equal(prepareBattleWebEffectEdgePicture({picture:p,provenance:sprite,enabled:true}).picture,p);
 }
});
test('per-action cache reuses immutable results across equal views, palette changes and A/B/A, without stale mutation',()=>{
 const prepare=createBattleWebEffectEdgePreparer(),p=picture(),input={picture:p,provenance:sprite,enabled:true};
 const a=prepare(input),same=prepare({...input,picture:{...p,pixels:p.pixels.slice()}});assert.equal(a.picture,same.picture);
 assert.equal(prepare.stats().computations,1);assert.equal(prepare.stats().cacheHits,1);assert.equal(prepare.ownsSnapshot(a.picture),true);
 const b={...p,pixels:p.pixels.slice()};b.pixels[(1*9+4)*4]=72;
 assert.notEqual(prepare({...input,picture:b}).picture,a.picture);assert.equal(prepare(input).picture,a.picture);
 a.picture.pixels[0]=99;const repaired=prepare(input);assert.notEqual(repaired.picture,a.picture);assert.equal(repaired.picture.pixels[0],0);
 assert.equal(prepare.ownsSnapshot({...repaired.picture,pixels:repaired.picture.pixels.slice()}),false);
 structuredClone(repaired.picture.pixels.buffer,{transfer:[repaired.picture.pixels.buffer]});assert.equal(prepare.ownsSnapshot(repaired.picture),false);
 assert.equal(prepare(input).picture.pixels.length,p.pixels.length);
});
test('cache memory stays bounded and exclusions do not accumulate effect art',()=>{
 const prepare=createBattleWebEffectEdgePreparer({maxEntries:1,maxBytes:1500}),p=picture(),input={picture:p,provenance:sprite,enabled:true};
 const a=prepare(input);for(let v=65;v<90;v++){const b={...p,pixels:p.pixels.slice()};b.pixels[(1*9+4)*4]=v;prepare({...input,picture:b});}
 assert.equal(prepare.stats().cachedPictures,1);assert.ok(prepare.stats().cachedBytes<=1500);
 assert.notEqual(prepare(input).picture,a.picture);
 const before=prepare.stats().computations;prepare({...input,provenance:{...sprite,group:16}});assert.equal(prepare.stats().computations,before);
});
