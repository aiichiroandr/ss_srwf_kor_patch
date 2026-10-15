import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBattleSecondLayerPicture} from '../assets/editor-battle-second-layer-picture.mjs';

const scope={planeContents:'no-replacements',frontOverlay:'empty',spriteOrder:'ordinary',lowerLayers:'back-only'};
const layer=(pixels,width=1,height=1,geometry={})=>({picture:{width,height,pixels:Uint8Array.from(pixels)},
 x:0,y:0,width,height,...geometry});
function request(){return {viewport:{x:0,y:0,width:1,height:1},
 rear:layer([80,100,120,255]),effect:layer([240,20,40,255]),effectRatio:19,
 back:{rgb:[0,0,0],ratio:0},scope:{...scope}};}
const rgba=result=>[...result.picture.pixels];

test('source rear row bands sample their partial UVs before applying the second-image ratio',()=>{
 const picture={width:4,height:2,pixels:Uint8Array.from([32,64,96,128,160,192,224,248].flatMap(n=>[n,0,0,255]))};
 const r=request();r.viewport={x:0,y:0,width:2,height:2};r.effect=null;
 r.rear=[{picture,x:0,y:0,width:2,height:1,uvs:[0,0,.5,0,.5,.5,0,.5]},
  {picture,x:0,y:1,width:2,height:1,uvs:[.5,.5,1,.5,1,1,.5,1]}];
 const before=picture.pixels.slice(),result=prepareBattleSecondLayerPicture(r);
 assert.equal(result.status,'ready');assert.deepEqual(rgba(result),[31,0,0,255,62,0,0,255,217,0,0,255,240,0,0,255]);
 assert.deepEqual(picture.pixels,before);
});

test('rear quad partitions preserve the single-plane result while overlaps and unknown UV warps remain unresolved',()=>{
 const r=request();r.viewport={x:0,y:0,width:2,height:1};r.effect=null;r.rear=layer([80,100,120,255],1,1,{width:2});
 const expected=rgba(prepareBattleSecondLayerPicture(r)),original=r.rear;
 r.rear=[{...original,width:1},{...original,x:1,width:1}];assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),expected);
 r.rear=[original,original];assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'overlapping-rear-bands-unresolved'});
 r.rear=[];assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'rear-bands-invalid'});
 r.rear={...original,uvs:[0,0,1,0,1,1,.5,1]};assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'non-axis-aligned-uv-unresolved'});
 r.rear={...original,uvs:[0,0,1,0,1,1,0,1.1]};assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'rear-uv-invalid'});
});

test('active second-image effect uses its ratio for the rear background, preserving source direction',()=>{
 const result=prepareBattleSecondLayerPicture(request());
 assert.equal(result.status,'ready');assert.deepEqual(rgba(result),[180,50,70,255]);
 assert.deepEqual(Object.keys(result).sort(),['picture','scope','status','x','y']);
 assert.deepEqual(Object.keys(result.picture).sort(),['height','pixels','width']);
});

test('transparent effect switches to explicit Back ratio instead of reusing the effect ratio',()=>{
 const r=request();r.effect.picture.pixels[3]=0;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[77,96,116,255]);
 r.back={rgb:[20,40,60],ratio:15};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[50,70,90,255]);
});

test('transparent rear makes the effect top, while two transparent planes expose Back unchanged',()=>{
 const r=request();r.rear.picture.pixels[3]=0;r.back={rgb:[8,12,16],ratio:15};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[124,16,28,255]);
 r.effect.picture.pixels[3]=0;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[8,12,16,255]);
});

test('dark nonzero art colors stay real pixels; transparency follows alpha alone',()=>{
 const r=request();r.rear=layer([100,100,100,255]);r.effect=layer([24,0,0,255]);
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[52,37,37,255]);
 r.effect=layer([0,0,0,255]);
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[37,37,37,255]);
});

test('ratio endpoints and channel flooring follow the source formula without rescaling RGB',()=>{
 const r=request();r.rear=layer([248,248,248,255]);r.effect=layer([248,248,248,255]);
 for(const effectRatio of [0,15,31]){r.effectRatio=effectRatio;
  assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[248,248,248,255]);}
 r.rear=layer([1,3,5,255]);r.effect=layer([0,0,0,255]);r.effectRatio=0;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[0,2,4,255]);
 r.effectRatio=31;assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[0,0,0,255]);
});

test('nearest sampling supports the current axis-aligned web bounds, crops and integer viewport origins',()=>{
 const r=request();r.viewport={x:5,y:7,width:4,height:1};
 r.rear=layer([0,0,0,0,0,0,0,0],2,1,{x:5,y:7,width:4,height:1});
 r.effect=layer([64,32,16,255,128,64,32,255],2,1,{x:5,y:7,width:4,height:1});
 r.back.ratio=31;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),new Array(4).fill([0,0,0,255]).flat());
 r.back.ratio=0;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[62,31,15,255,62,31,15,255,124,62,31,255,124,62,31,255]);
 r.effect.x=7;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[0,0,0,255,0,0,0,255,62,31,15,255,62,31,15,255]);
});

test('picture, ratio and scroll changes each prepare fresh pixels without mutating previous inputs or output',()=>{
 const r=request(),beforeRear=r.rear.picture.pixels.slice(),beforeEffect=r.effect.picture.pixels.slice();
 const first=prepareBattleSecondLayerPicture(r),firstPixels=first.picture.pixels.slice();
 assert.deepEqual(r.rear.picture.pixels,beforeRear);assert.deepEqual(r.effect.picture.pixels,beforeEffect);
 r.effect.picture.pixels[0]=40;
 const recolored=prepareBattleSecondLayerPicture(r);assert.notDeepEqual(recolored.picture.pixels,firstPixels);
 r.effectRatio=3;
 const rerated=prepareBattleSecondLayerPicture(r);assert.notDeepEqual(rerated.picture.pixels,recolored.picture.pixels);
 r.effect.x=2;
 const scrolled=prepareBattleSecondLayerPicture(r);assert.notDeepEqual(scrolled.picture.pixels,rerated.picture.pixels);
 assert.deepEqual(first.picture.pixels,firstPixels);
});

test('explicit empty effect needs only explicit Back context, while unresolved presence/ratios fail closed',()=>{
 const r=request();r.effect=null;delete r.effectRatio;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[77,96,116,255]);
 delete r.effect;
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'effect-presence-unresolved'});
 r.effect=layer([1,2,3,255]);
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'explicit-effect-ratio-missing'});
 r.effectRatio=19;delete r.back.ratio;
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'explicit-back-context-missing'});
});

test('unproved replacements, front contents, sprite ordering and lower layers remain partial',()=>{
 const reasons={planeContents:'plane-replacement-composition-unresolved',frontOverlay:'front-overlay-composition-unresolved',
  spriteOrder:'ordinary-sprite-composition-unresolved',lowerLayers:'lower-layer-composition-unresolved'};
 for(const [key,reason]of Object.entries(reasons))for(const value of [undefined,'unknown','active']){
  const r=request();r.scope[key]=value;
  assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason});
 }
});

test('partial alpha and general quads are unsupported instead of becoming approximate composition',()=>{
 const r=request();r.effect.picture.pixels[3]=128;
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'partial-alpha-plane-unresolved'});
 r.effect.picture.pixels[3]=255;r.effect.vertices=[0,0,1,1,1,2,0,1];
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'non-axis-aligned-geometry-unresolved'});
});

test('invalid ratios, colors, dimensions and image lengths produce no output picture',()=>{
 for(const effectRatio of [-1,32,1.5,NaN]){
  const r=request();r.effectRatio=effectRatio;
  assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'effect-ratio-invalid'});
 }
 for(const back of [{rgb:[0,0],ratio:0},{rgb:[-1,0,0],ratio:0},{rgb:[0,0,0],ratio:32}]){
  const r=request();r.back=back;
  assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'back-context-invalid'});
 }
 const r=request();r.viewport.width=513;
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'viewport-invalid'});
 r.viewport.width=1;r.effect.picture.pixels=new Uint8Array(3);
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'effect-picture-invalid'});
});

test('RGBA typed-array subviews are sampled from their actual offsets',()=>{
 const r=request(),storage=new Uint8Array(20).fill(197);storage.set([240,20,40,255],7);
 r.effect.picture.pixels=storage.subarray(7,11);
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[180,50,70,255]);
});

test('explicit null rear is absent while omitted rear presence remains unresolved',()=>{
 const r=request();r.rear=null;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[232,19,38,255]);
 r.effect=null;delete r.effectRatio;r.back.rgb=[8,12,16];
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[8,12,16,255]);
 delete r.rear;
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'rear-presence-unresolved'});
});

test('empty rear does not bypass the original source-composition guards',()=>{
 const r=request();r.rear=null;
 r.scope.planeContents='replaced';
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'plane-replacement-composition-unresolved'});
 r.scope.planeContents='no-replacements';r.scope.frontOverlay='nonempty';
 assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'front-overlay-composition-unresolved'});
});

test('each pixel receives the post-calculation RGB offset of its actual top role exactly once',()=>{
 const r=request();r.viewport.width=3;r.effectRatio=15;r.back={rgb:[20,20,20],ratio:15};
 r.rear=layer([100,100,100,255,10,20,30,0,40,50,60,0],3);
 r.effect=layer([200,200,200,255,200,200,200,255,200,200,200,0],3);
 r.colorOffsets={rear:[-50,0,50],effect:[10,-100,200],back:[1,2,3]};
 const beforeRear=r.rear.picture.pixels.slice(),beforeEffect=r.effect.picture.pixels.slice(),beforeOffsets=structuredClone(r.colorOffsets);
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[100,150,200,255,120,10,255,255,21,22,23,255]);
 assert.deepEqual(r.rear.picture.pixels,beforeRear);assert.deepEqual(r.effect.picture.pixels,beforeEffect);
 assert.deepEqual(r.colorOffsets,beforeOffsets);
});

test('background-only darkening does not darken an effect over a transparent or absent rear',()=>{
 const r=request();r.colorOffsets={rear:[-255,-255,-255],effect:[0,0,0],back:[0,0,0]};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[0,0,0,255]);
 r.rear.picture.pixels[3]=0;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[232,19,38,255]);
 r.rear=null;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[232,19,38,255]);
});

test('effect offset is inactive below opaque rear and active when effect becomes top',()=>{
 const r=request();r.colorOffsets={rear:[0,0,0],effect:[-17,-17,-17],back:[0,0,0]};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[180,50,70,255]);
 r.rear=null;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[215,2,21,255]);
});

test('Back offset is applied only to Back top pixels rather than to its contribution under another layer',()=>{
 const r=request();r.back={rgb:[20,20,20],ratio:15};r.effect=null;
 r.colorOffsets={rear:[0,0,0],effect:[0,0,0],back:[200,200,200]};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[50,60,70,255]);
 r.rear=null;
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[220,220,220,255]);
});

test('positive and negative offset clamp after mixing, preserving channel flooring',()=>{
 const r=request();r.rear=layer([248,3,5,255]);r.effect=layer([0,0,0,255]);r.effectRatio=15;
 r.colorOffsets={rear:[200,-4,1],effect:[0,0,0],back:[0,0,0]};
 // The mixed top is124/1/2 before its offset. Clamping the source248+200
 // before mixing would produce127 instead of the correct saturated255.
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[255,0,3,255]);
});

test('omitting offsets retains the existing contract and explicit zeros yield the identical picture',()=>{
 const r=request(),unoffset=prepareBattleSecondLayerPicture(r);
 r.colorOffsets={rear:[0,0,0],effect:[0,0,0],back:[0,0,0]};
 assert.deepEqual(prepareBattleSecondLayerPicture(r),unoffset);
});

test('offset changes prepare fresh pixels without altering prior outputs or source alpha',()=>{
 const r=request();r.colorOffsets={rear:[0,0,0],effect:[0,0,0],back:[0,0,0]};
 const first=prepareBattleSecondLayerPicture(r),firstPixels=first.picture.pixels.slice();
 r.colorOffsets.rear[0]=7;
 const second=prepareBattleSecondLayerPicture(r);
 assert.deepEqual(rgba(second),[187,50,70,255]);assert.notEqual(first.picture.pixels,second.picture.pixels);
 assert.deepEqual(first.picture.pixels,firstPixels);assert.equal(r.rear.picture.pixels[3],255);assert.equal(r.effect.picture.pixels[3],255);
});

test('provided color offsets require every explicit role and valid signed9-bit RGB values',()=>{
 for(const colorOffsets of [{rear:[0,0,0],effect:[0,0,0]},{}]){
  const r=request();r.colorOffsets=colorOffsets;
  assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'partial',reason:'explicit-color-offset-context-missing'});
 }
 for(const invalid of [null,'RGB',[-257,0,0],[256,0,0],[0.5,0,0],[0,0],[NaN,0,0],new Array(3)]){
  const r=request();r.colorOffsets={rear:invalid,effect:[0,0,0],back:[0,0,0]};
  assert.deepEqual(prepareBattleSecondLayerPicture(r),{status:'blocked',reason:'color-offset-context-invalid'});
 }
 const r=request();r.rear=null;r.effect=null;r.back.rgb=[20,40,60];
 r.colorOffsets={rear:[-256,255,0],effect:[-256,255,0],back:[-256,255,0]};
 assert.deepEqual(rgba(prepareBattleSecondLayerPicture(r)),[0,255,60,255]);
});
