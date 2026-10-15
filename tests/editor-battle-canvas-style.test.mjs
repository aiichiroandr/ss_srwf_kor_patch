import test from 'node:test';
import assert from 'node:assert/strict';
import {paintBattleCommandFrame} from '../assets/editor-battle-canvas.mjs';

function fixture(){
 const draws=[],stack=[];
 const context={globalAlpha:1,globalCompositeOperation:'source-over',
  save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);},restore(){[this.globalAlpha,this.globalCompositeOperation]=stack.pop();},
  setTransform(){},clearRect(){},fillRect(){},translate(){},scale(){},
  createImageData:(width,height)=>({data:new Uint8Array(width*height*4)}),putImageData(){},
  drawImage(source){draws.push({tag:source.tag,opacity:this.globalAlpha,blend:this.globalCompositeOperation});}};
 const ownerDocument={createElement(){const source={width:0,height:0,ownerDocument,tag:0};
  source.getContext=()=>({createImageData:(width,height)=>({data:new Uint8Array(width*height*4)}),
    putImageData(data){source.tag=data.data[0];}});return source;}};
 const canvas={ownerDocument,width:320,height:224,getContext:()=>context};
 const picture=tag=>({assetKey:String(tag),width:8,height:1,pixels:Uint8Array.from({length:32},(_,i)=>i%4===0?tag:i%4===3?255:0)});
 const bytes=new Uint8Array(32),view=new DataView(bytes.buffer);view.setUint16(4,128);view.setUint16(10,0x0101);
 const frame={commands:[{assetKey:'34',bytes}],assets:new Map([17,34,51].map(tag=>[String(tag),picture(tag)])),
  state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,255],
  backgroundLayers:[{assetKey:'17',x:0,y:0,width:8,height:1},
    {assetKey:'51',x:0,y:0,width:8,height:1,aboveSprites:true,opacity:31/32,blend:'screen'}]};
 return {canvas,frame,draws,context};
}
test('Canvas retains ordinary body composition while drawing the screen light above it',()=>{
 const {canvas,frame,draws,context}=fixture();
 assert.equal(paintBattleCommandFrame(canvas,frame).status,'ready');
 assert.deepEqual(draws,[{tag:17,opacity:1,blend:'source-over'},
  {tag:34,opacity:1,blend:'source-over'},{tag:51,opacity:31/32,blend:'screen'}]);
 assert.equal(context.globalAlpha,1);assert.equal(context.globalCompositeOperation,'source-over');
});
test('a following Canvas frame returns to source composition and does not inherit a light or additive style',()=>{
 const {canvas,frame,draws}=fixture();frame.commands[0].opacity=0.5;frame.commands[0].blend='add';
 paintBattleCommandFrame(canvas,frame);assert.deepEqual(draws[1],{tag:34,opacity:0.5,blend:'lighter'});
 draws.length=0;delete frame.commands[0].opacity;delete frame.commands[0].blend;
 delete frame.backgroundLayers[1].opacity;delete frame.backgroundLayers[1].blend;
 paintBattleCommandFrame(canvas,frame);assert.ok(draws.every(draw=>draw.opacity===1&&draw.blend==='source-over'));
});
test('Canvas rejects invalid web styles and layer ordering before drawing',()=>{
 for(const mutate of [f=>f.commands[0].blend='multiply',f=>f.backgroundLayers[0].opacity=2,
  f=>f.backgroundLayers[1].aboveSprites='yes']){
  const {canvas,frame,draws}=fixture();mutate(frame);
  assert.throws(()=>paintBattleCommandFrame(canvas,frame),/invalid/);assert.deepEqual(draws,[]);
 }
});
