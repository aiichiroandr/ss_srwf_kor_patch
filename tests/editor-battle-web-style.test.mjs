import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleWebObjectStyle} from '../assets/editor-battle-web-style.mjs';
import {compileBattleWebSceneFrame} from '../assets/editor-battle-web-scene-frame.mjs';

function frame(){
 const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);v.setUint16(4,128);v.setUint16(10,0x0101);
 const picture={width:8,height:1,pixels:new Uint8Array(32)};
 return {commands:[{slot:1,pass:0,depthWord:1,assetKey:'body',bytes}],assets:new Map([['body',picture]]),
  backgroundLayers:[{assetKey:'body',x:0,y:0,width:8,height:1}],
  state:{systemClip:{maxX:319,maxY:223},localX:0,localY:0},clearColor:[0,0,0,0]};
}
test('semantic style defaults preserve opaque normal rendering and allow finite fractional opacity',()=>{
 assert.deepEqual(readBattleWebObjectStyle({}),{opacity:1,blend:'normal'});
 for(const opacity of [0,0.25,0.5,1])for(const blend of ['normal','add','screen'])
  assert.deepEqual(readBattleWebObjectStyle({opacity,blend}),{opacity,blend});
 for(const opacity of [-1,1.00001,NaN,Infinity,null,'0.5',false])
  assert.throws(()=>readBattleWebObjectStyle({opacity}),/invalid opacity or blend/);
 for(const blend of ['multiply','ADD',0,null,false])
  assert.throws(()=>readBattleWebObjectStyle({blend}),/invalid opacity or blend/);
});
test('preparation carries explicit background and object styles without interpreting native draw modes',()=>{
 const source=frame();source.backgroundLayers[0].opacity=0.25;source.backgroundLayers[0].blend='add';
 source.commands[0].opacity=0.5;
 const scene=compileBattleWebSceneFrame(source);
 assert.deepEqual(scene.objects.map(({opacity,blend})=>({opacity,blend})),[
  {opacity:0.25,blend:'add'},{opacity:0.5,blend:'normal'},
 ]);
 const defaults=compileBattleWebSceneFrame(frame());
 assert.ok(defaults.objects.every(p=>p.opacity===1&&p.blend==='normal'));
 for(const target of ['backgroundLayers','commands']){
  const bad=frame();bad[target][0].opacity=1.5;
  assert.throws(()=>compileBattleWebSceneFrame(bad),/invalid opacity or blend/);
 }
 const unknown=frame();new DataView(unknown.commands[0].bytes.buffer).setUint16(4,131);
 unknown.commands[0].blend='add';
 assert.throws(()=>compileBattleWebSceneFrame(unknown),/unresolved source drawing/);
});
test('a proved foreground effect blends after the body while ordinary backgrounds stay behind it',()=>{
 const source=frame(),effect={...source.assets.get('body'),assetKey:'effect'};
 source.assets.set('effect',effect);
 source.backgroundLayers.push({assetKey:'effect',x:0,y:0,width:8,height:1,opacity:0.375,aboveSprites:true});
 const scene=compileBattleWebSceneFrame(source);
 assert.equal(scene.objects[0].picture,source.assets.get('body'));
 assert.equal(scene.objects[1].slot,1);
 assert.equal(scene.objects[2].picture,effect);assert.equal(scene.objects[2].opacity,0.375);
 assert.equal('aboveSprites' in scene.objects[2],false);
 source.backgroundLayers.at(-1).aboveSprites='yes';
 assert.throws(()=>compileBattleWebSceneFrame(source),/semantic layer order/);
});
