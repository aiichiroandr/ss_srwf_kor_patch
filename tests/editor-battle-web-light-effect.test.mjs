import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattleWebLightEffectStyle} from '../assets/editor-battle-web-light-effect.mjs';

const sourceStyle={status:'ready',planeIndex:2,scope:'owned-nbg2-top-ratio-mode',opacity:31/32,blend:'normal'};
const provenance={carrier:'owned-weapon-animation-bank',planeIndex:2,animationBeam:true};
function picture(){
 const pixels=new Uint8Array(7*3*4),colors=[32,48,128,200,248];
 for(let x=1;x<=5;x++)pixels.set([colors[x-1],8,8,255],(7+x)*4);
 return {width:7,height:3,pixels};
}
const input=()=>({picture:picture(),sourceStyle,provenance,enabled:true});
test('a verified beam-bank top light gets reversible screen composition without changing source bytes',()=>{
 const a=input(),before=a.picture.pixels.slice(),result=resolveBattleWebLightEffectStyle(a);
 assert.equal(result.corrected,true);assert.deepEqual(result.style,{opacity:31/32,blend:'screen'});
 assert.equal(result.scope,'web-beam-light-rim-correction');assert.equal(result.evidence.rimPixels,2);
 assert.deepEqual(a.picture.pixels,before);assert.equal(a.sourceStyle.blend,'normal');
 assert.deepEqual(resolveBattleWebLightEffectStyle({...a,enabled:false}).style,{opacity:31/32,blend:'normal'});
 assert.equal(resolveBattleWebLightEffectStyle({...a,enabled:false}).corrected,false);
});
test('only the exact common movement pair gains screen while source RGB and opaque artwork remain intact',()=>{
 const pixels=new Uint8Array(7*3*4),colors=[[8,24,40],[16,32,56],[0,32,88],[40,48,128],[64,72,120]];
 colors.forEach((color,x)=>pixels.set([...color,255],(8+x)*4));
 const p={width:7,height:3,pixels},before=pixels.slice(),sourceStyle={status:'ready',opacity:1,blend:'normal'},
  common={carrier:'owned-common-sprite',group:16,sourceTableCell:7,role:'booster'};
 for(const subIndex of [42,43]){
  const r=resolveBattleWebLightEffectStyle({picture:p,sourceStyle,enabled:true,provenance:{...common,subIndex}});
  assert.equal(r.corrected,true);assert.deepEqual(r.style,{opacity:1,blend:'screen'});
  assert.equal(r.scope,'web-common-movement-light-rim-correction');assert.deepEqual(pixels,before);
 }
 for(const subIndex of [12,13,14,15,35,36,37,38,39,40,41,44,undefined])
  assert.equal(resolveBattleWebLightEffectStyle({picture:p,sourceStyle,enabled:true,provenance:{...common,subIndex}}).corrected,false);
 for(const provenance of [{...common,subIndex:42,carrier:'C_ROBOT.BIN'},{...common,subIndex:42,group:8},
  {...common,subIndex:42,sourceTableCell:20},{...common,subIndex:42,role:'target'}])
  assert.equal(resolveBattleWebLightEffectStyle({picture:p,sourceStyle,enabled:true,provenance}).corrected,false);
 assert.equal(resolveBattleWebLightEffectStyle({picture:p,sourceStyle,enabled:false,provenance:{...common,subIndex:42}}).style.blend,'normal');
 assert.equal(resolveBattleWebLightEffectStyle({picture:p,sourceStyle:{...sourceStyle,status:'partial'},enabled:true,
  provenance:{...common,subIndex:42}}).corrected,false);
});
test('body art, BTSR shadows, background planes, edited beam flags and unresolved composition keep their source style',()=>{
 for(const replacement of [null,{carrier:'C_ROBOT.BIN',planeIndex:2,animationBeam:true},
  {carrier:'BTSR.BIN',planeIndex:2,animationBeam:true},{...provenance,planeIndex:0},
  {...provenance,animationBeam:false},{...provenance,animationBeam:1},
  {carrier:'owned-weapon-animation-bank',planeIndex:2,editedWeaponBeam:true}]){
  const result=resolveBattleWebLightEffectStyle({...input(),provenance:replacement});
  assert.equal(result.corrected,false);assert.equal(result.style.blend,'normal');
 }
 for(const replacement of [{...sourceStyle,status:'partial'},{...sourceStyle,planeIndex:3},
  {...sourceStyle,scope:'owned-second-image-ratio-mode'},{...sourceStyle,blend:'add'}]){
  const result=resolveBattleWebLightEffectStyle({...input(),sourceStyle:replacement});
  assert.equal(result.corrected,false);assert.equal(result.style.blend,replacement.blend);
 }
});
test('opaque silhouettes, monochrome art, dark art, soft alpha and missing rim stay untouched',()=>{
 const variants=[];
 const opaque=picture();for(let i=3;i<opaque.pixels.length;i+=4)opaque.pixels[i]=255;variants.push(opaque);
 const monochrome=picture();for(let i=0;i<monochrome.pixels.length;i+=4)if(monochrome.pixels[i+3])monochrome.pixels[i]=248;variants.push(monochrome);
 const dark=picture();for(let i=0;i<dark.pixels.length;i+=4)dark.pixels[i]>>=2;variants.push(dark);
 const soft=picture();soft.pixels[7*4+7]=128;variants.push(soft);
 const noRim=picture();for(let i=0;i<noRim.pixels.length;i+=4)if(noRim.pixels[i+3])noRim.pixels[i]=Math.max(80,noRim.pixels[i]);variants.push(noRim);
 for(const p of variants){const before=p.pixels.slice(),r=resolveBattleWebLightEffectStyle({...input(),picture:p});
  assert.equal(r.corrected,false);assert.deepEqual(p.pixels,before);}
});
test('nonzero opaque black remains source artwork even when used as a light matte',()=>{
 const a=input();a.picture.pixels.set([0,0,0,255],8*4);
 const before=a.picture.pixels.slice(),r=resolveBattleWebLightEffectStyle(a);
 assert.equal(r.corrected,true);assert.deepEqual(a.picture.pixels,before);
 assert.deepEqual([...a.picture.pixels.slice(32,36)],[0,0,0,255]);
 const shadow={width:1,height:1,pixels:Uint8Array.of(0,0,24,255)};
 assert.equal(resolveBattleWebLightEffectStyle({...a,picture:shadow,provenance:{carrier:'BTSR.BIN',planeIndex:2,animationBeam:true}}).style.blend,'normal');
});
test('RGBA typed subviews are bounded and malformed data or correction choices are rejected',()=>{
 const a=input(),storage=new Uint8Array(a.picture.pixels.length+12).fill(77);
 storage.set(a.picture.pixels,4);a.picture.pixels=storage.subarray(4,storage.length-8);
 assert.equal(resolveBattleWebLightEffectStyle(a).corrected,true);assert.equal(storage[3],77);assert.equal(storage.at(-1),77);
 for(const p of [null,{...a.picture,width:0},{...a.picture,pixels:new Uint8Array(1)},
  {...a.picture,pixels:Array.from(a.picture.pixels)}])
  assert.throws(()=>resolveBattleWebLightEffectStyle({...a,picture:p}),/unresolved RGBA picture/);
 for(const enabled of [null,1,'true'])assert.throws(()=>resolveBattleWebLightEffectStyle({...a,enabled}),/explicit correction choice/);
 assert.throws(()=>resolveBattleWebLightEffectStyle({...a,sourceStyle:{...sourceStyle,opacity:2}}),/opacity or blend/);
});
