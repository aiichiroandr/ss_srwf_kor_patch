import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the real renderer against Pixi's public mesh/stage API. The
// independent WebGL probe also reproduces the cached pipeline failure with
// indexed -> RGBA -> indexed scenes and checks the actual returned pixels.
let fixtureId=0;
async function fixture(){
 const id=++fixtureId;
 const trace={meshes:[],textures:[],frames:[],geometriesDestroyed:0};globalThis.__battlePixiFormatFixture=trace;
 const vendor=`const trace=globalThis.__battlePixiFormatFixture;
 export class BufferImageSource{constructor(options){Object.assign(this,options);}}
 export class Texture{static EMPTY={};constructor(options){Object.assign(this,options);trace.textures.push(this);}destroy(){this.destroyed=true;}}
 export class Container{constructor(){this.children=[];}addChild(...items){this.children.push(...items);}removeChild(item){this.children.splice(this.children.indexOf(item),1);}getChildIndex(item){return this.children.indexOf(item);}addChildAt(item,index){this.children.splice(index,0,item);}destroy(){this.destroyed=true;}}
 export class RenderTexture{static create(options){trace.renderTextures??=[];const t={...options,source:{id:trace.renderTextures.length},destroy(){this.destroyed=true;}};trace.renderTextures.push(t);return t;}}
 export class Sprite{constructor(texture){this.texture=texture;}setMask(options){this.maskOptions=options;}destroy(){this.destroyed=true;}}
 export class Graphics{clear(){return this;}rect(){return this;}fill(){return this;}destroy(){this.destroyed=true;}}
 export class Shader{static from(options){const resources={...options.resources};resources.pictureUniforms={uniforms:Object.fromEntries(Object.entries(resources.pictureUniforms).map(([k,v])=>[k,v.value])),update(){}};return{resources,destroy(){this.destroyed=true;}};}}
 export class MeshSimple{constructor(options){Object.assign(this,options);this.id=trace.meshes.length;trace.meshes.push(this);this.geometry={getBuffer:()=>({data:options.uvs,update(){}}),destroy(){trace.geometriesDestroyed++;}};}setMask(options){this.maskOptions=options;if(options.mask)this.mask=options.mask;}destroy(){this.destroyed=true;}}
 export class Application{constructor(){const children=[];this.stage={children,addChild(...items){children.push(...items);},getChildIndex(item){return children.indexOf(item);},removeChild(item){children.splice(children.indexOf(item),1);},addChildAt(item,index){children.splice(index,0,item);}};}
 async init(){this.renderer={screen:{width:320,height:224},resize(){},render(options){trace.ownershipFrames??=[];trace.ownershipFrames.push({...options,coverage:options.container.children.filter(x=>x.visible&&x.shader?.resources?.pictureUniforms).map(x=>x.shader.resources.pictureUniforms.uniforms.uCoverage)});},background:{},gl:{pixelStorei(){},UNPACK_ALIGNMENT:1}};}stop(){}render(){trace.frames.push(this.stage.children.filter(item=>item instanceof MeshSimple&&item.visible).map(item=>({id:item.id,indexed:Boolean(item.shader),alpha:item.alpha,blend:item.blendMode})));}destroy(){}}
 `;
 let source=await readFile(new URL('../assets/editor-battle-pixi.mjs',import.meta.url),'utf8');
 source=source.replace("import './vendor/pixi/unsafe-eval-csp.mjs';",'');
 source=source.replace("'./vendor/pixi/pixi-8.22.0.min.mjs'",JSON.stringify('data:text/javascript,'+encodeURIComponent(vendor+`\n// fixture${id}`)));
 for(const name of ['editor-battle-web-style.mjs','editor-battle-web-picture.mjs'])
  source=source.replace(`'./${name}'`,JSON.stringify(new URL('../assets/'+name,import.meta.url).href));
 const {createBattlePixiRenderer}=await import('data:text/javascript,'+encodeURIComponent(source+`\n// fixture${id}`));
 const renderer=await createBattlePixiRenderer({});delete globalThis.__battlePixiFormatFixture;return {renderer,trace};
}
const indexed={format:'battle-web-indexed-picture-v1',width:1,height:1,slotStride:1,
 colorSlots:Uint8Array.of(1),colors:Uint8Array.of(0,0,0,0,80,100,120,255)};
const rgba={format:'battle-web-rgba-picture-v1',width:1,height:1,pixels:Uint8Array.of(80,100,120,255)};
const pose=(picture,style={})=>({picture,vertices:[0,0,1,0,1,1,0,1],uvs:[0,0,1,0,1,1,0,1],clip:null,...style});
const frame=objects=>({format:'battle-web-scene-frame-v1',width:320,height:224,clearColor:[0,0,0,255],objects});

test('a format transition replaces only that mesh and preserves stage order, texture caches, masks and style reset',async()=>{
 const {renderer,trace}=await fixture();renderer.render(frame([pose(indexed,{opacity:.25,blend:'add'}),pose(indexed)]));
 const first=trace.frames.at(-1),textures=trace.textures.length;assert.equal(first.length,2);
 renderer.render(frame([pose(indexed),pose(indexed)]));assert.deepEqual(trace.frames.at(-1).map(v=>v.id),first.map(v=>v.id));
 renderer.render(frame([pose(rgba),pose(indexed)]));const changed=trace.frames.at(-1);
 assert.notEqual(changed[0].id,first[0].id);assert.equal(changed[1].id,first[1].id);assert.equal(changed[0].indexed,false);
 assert.deepEqual([changed[0].alpha,changed[0].blend],[1,'normal']);assert.equal(trace.textures.length,textures+1);
 renderer.render(frame([pose(indexed),pose(indexed)]));const restored=trace.frames.at(-1);
 assert.notEqual(restored[0].id,changed[0].id);assert.equal(restored[1].id,first[1].id);assert.equal(restored[0].indexed,true);
 assert.equal(trace.textures.length,textures+1);assert.equal(trace.geometriesDestroyed,2);
 renderer.destroy();assert.ok(trace.textures.every(texture=>texture.destroyed));
});

test('shrinking and growing band counts cannot revive an old mesh with the wrong picture backend',async()=>{
 const {renderer,trace}=await fixture();renderer.render(frame([pose(indexed),pose(rgba),pose(indexed)]));
 renderer.render(frame([pose(rgba)]));assert.equal(trace.frames.at(-1).length,1);
 renderer.render(frame([pose(indexed),pose(indexed),pose(rgba)]));
 assert.deepEqual(trace.frames.at(-1).map(v=>v.indexed),[true,true,false]);
 const ids=trace.frames.at(-1).map(v=>v.id);renderer.render(frame([pose(indexed),pose(indexed),pose(rgba)]));
 assert.deepEqual(trace.frames.at(-1).map(v=>v.id),ids);renderer.destroy();
});
test('conditional addition renders sprite colors and visible eligibility separately, then resets ordinary frames',async()=>{
 const {renderer,trace}=await fixture();const a=pose(rgba,{slot:1,spriteAdditiveEligible:true}),b=pose(indexed,{slot:2,spriteAdditiveEligible:false});
 renderer.render(frame([a,b]));assert.equal(trace.ownershipFrames.length,3);
 assert.equal(trace.frames.at(-1).length,2);assert.equal(trace.ownershipFrames[1].container.children.filter(x=>x.shader!==undefined&&x.visible).length,2);
 renderer.render(frame([pose(rgba,{slot:1}),pose(indexed,{slot:2})]));assert.equal(trace.frames.at(-1).length,2);
 renderer.render(frame([a,b]));renderer.reset();renderer.destroy();assert.ok(trace.textures.every(x=>x.destroyed));
});
test('conditional sprite ownership rejects fractional alpha or incomplete eligibility before rendering',async()=>{
 const {renderer,trace}=await fixture();const soft={...rgba,pixels:Uint8Array.of(80,100,120,128)};
 assert.throws(()=>renderer.render(frame([pose(soft,{slot:1,spriteAdditiveEligible:true})])),/fractional/);
 assert.throws(()=>renderer.render(frame([pose(rgba,{slot:1,spriteAdditiveEligible:true}),pose(rgba,{slot:2})])),/opaque normal/);
 assert.equal(trace.frames.length,0);renderer.destroy();
});

test('rear and front GPU ownership use separate masks, restore each frame and release targets',async()=>{
 const {renderer,trace}=await fixture();
 const sprites=[pose(rgba,{slot:1,occludesFrontLayers:false,occludesRearLayers:false}),pose(indexed,{slot:2,occludesFrontLayers:false,occludesRearLayers:true})];
 renderer.render(frame([...sprites,pose(rgba,{occludedBySprites:true,spriteOcclusionLayer:'rear',blend:'add'}),pose(indexed,{occludedBySprites:true})]));
 assert.deepEqual(trace.ownershipFrames.map(x=>x.coverage),[[0,0],[0,1]]);
 assert.notEqual(trace.ownershipFrames[0].target,trace.ownershipFrames[1].target);
 const planes=trace.meshes.filter(x=>x.shader?.resources.uOwnership);
 assert.equal(planes[0].shader.resources.uOwnership,trace.ownershipFrames[1].target.source);
 assert.equal(planes[1].shader.resources.uOwnership,trace.ownershipFrames[0].target.source);
 renderer.render(frame([pose(rgba,{slot:1}),pose(indexed,{slot:2})]));
 renderer.render(frame([...sprites,pose(rgba,{occludedBySprites:true,spriteOcclusionLayer:'rear'})]));
 assert.deepEqual(trace.ownershipFrames.at(-1).coverage,[0,1]);
 renderer.reset();assert.ok(trace.renderTextures.every(x=>x.destroyed));renderer.destroy();
});
test('rear masks refuse incomplete sprite context or an unowned rear plane before drawing',async()=>{
 const {renderer,trace}=await fixture();
 assert.throws(()=>renderer.render(frame([pose(rgba,{slot:1}),pose(rgba,{occludedBySprites:true,spriteOcclusionLayer:'rear'})])),/incomplete web rear/);
 assert.throws(()=>renderer.render(frame([pose(rgba,{spriteOcclusionLayer:'rear'})])),/ownership layer/);
 assert.equal(trace.frames.length,0);renderer.destroy();
});
