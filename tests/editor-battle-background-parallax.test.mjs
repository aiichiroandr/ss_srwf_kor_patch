import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleBackgroundParallaxState,advanceBattleBackgroundParallax,
 planBattleBackgroundParallaxBands,compileBattleBackgroundParallaxLayers} from '../assets/editor-battle-background-parallax.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';

function common({first=[[2,320],[8,192]],second=[[1,352],[4,160]],vertical=[24,24]}={}){
 const bytes=new Uint8Array(22+(first.length+second.length)*4),v=new DataView(bytes.buffer);
 for(const [cell,start]of [[0,12],[4,14],[8,16]])v.setInt32(cell,start-cell);
 v.setUint16(16,2);bytes.set([first.length,second.length,...vertical],18);
 let at=22;for(const [factor,control]of [...first,...second]){v.setUint16(at,factor);v.setUint16(at+2,control);at+=4;}
 return bytes;
}
const make=(options={})=>createBattleBackgroundParallaxState({commonData:common(options),mode:0,rowStart:32});
const cameras=[{x:0,y:280},{x:0,y:280}],assetKeys=['foreground','rear'];

test('source layout creates duplicated band rows and the explicit ordinary camera',()=>{
 const r=make();assert.equal(r.status,'ready');assert.deepEqual(r.state.currentVertical,[18350080,18350080]);
 assert.deepEqual(r.state.verticalFactors,[24,24]);assert.equal(r.groups[0].records.length,5);
 assert.deepEqual(r.groups[0].records.map(row=>[row.factor,row.control]),[[2,320],[8,192],[2,320],[8,192],[0,512]]);
 const saved=structuredClone(r);const bytes=common();const independent=createBattleBackgroundParallaxState({commonData:bytes,mode:0,rowStart:32});bytes.fill(0);
 assert.deepEqual(independent,saved);assert.throws(()=>createBattleBackgroundParallaxState({commonData:common(),mode:0}),{code:'BATTLE_BACKGROUND_PARALLAX'});
});

test('main6A source velocities produce unequal row motion, facing reversal, and a true stop',()=>{
 for(const facing of [false,true]){
  let r=make();const background={modeFactors:[-64,0],groups:r.groups},clock=createBattleMainClock(Uint8Array.of(0x6a,1,4),{
   shared:{background,directionBit6:facing,directionBit7:false}});tickBattleMainClock(clock);
  assert.equal(clock.blocked,null);assert.deepEqual(background.groups[0].records.slice(0,2).map(row=>row.offset),facing?[1024,4096]:[-1024,-4096]);
  r=advanceBattleBackgroundParallax({state:r.state,groups:background.groups,speed:background.speed,manual:false});
  assert.deepEqual(r.groups[0].records.slice(0,2).map(row=>row.secondaryOffset),facing?[1024,4096]:[-1024,-4096]);
  assert.deepEqual(r.groups[0].records.slice(2,4).map(row=>row.secondaryOffset),r.groups[0].records.slice(0,2).map(row=>row.secondaryOffset));
  const stopped=r.groups.map(group=>({...group,records:group.records.map(row=>({...row,offset:0}))}));
  const next=advanceBattleBackgroundParallax({state:r.state,groups:stopped,speed:0,manual:false});
  assert.deepEqual(next.groups.map(g=>g.records.map(v=>v.secondaryOffset)),r.groups.map(g=>g.records.map(v=>v.secondaryOffset)));
 }
});

test('source group order, sourceY+32 selection, exact boundaries, and adjacent equal offsets are retained',()=>{
 const r=make();r.groups[0].records[0].secondaryOffset=r.groups[0].records[2].secondaryOffset=65536;
 r.groups[0].records[1].secondaryOffset=r.groups[0].records[3].secondaryOffset=262144;
 r.groups[1].records[0].secondaryOffset=r.groups[1].records[2].secondaryOffset=-65536;
 r.groups[1].records[1].secondaryOffset=r.groups[1].records[3].secondaryOffset=-131072;
 const p=planBattleBackgroundParallaxBands({...r,manual:false});
 assert.deepEqual(p.planes,[{planeIndex:0,bands:[{y:32,height:40,x:-1},{y:72,height:88,x:-2}]},
  {planeIndex:1,bands:[{y:32,height:8,x:1},{y:40,height:120,x:4}]}]);
 r.state.previousVertical[0]=288*65536;
 assert.deepEqual(planBattleBackgroundParallaxBands({...r,manual:false}).planes[1].bands,[{y:32,height:128,x:4}]);
});

test('manual mode freezes accumulation and uses only explicit FA58/5A camera values',()=>{
 const r=make(),saved=structuredClone(r);r.groups[0].records[0].offset=65536;
 const gated=advanceBattleBackgroundParallax({...r,speed:7,manual:true});assert.equal(gated.advanced,false);assert.equal(gated.cameras,null);
 assert.equal(gated.state,r.state);assert.equal(gated.groups,r.groups);assert.deepEqual(r.state,saved.state);
 assert.deepEqual(planBattleBackgroundParallaxBands({...r,manual:true}).planes,[]);
 const compiled=compileBattleBackgroundParallaxLayers({...r,cameras:[{x:5,y:10},{x:7,y:11}],assetKeys,manual:true});
 assert.equal(compiled.layers[0].uvs[0],7/512);assert.equal(compiled.layers[0].uvs[1],11/512);
 assert.equal(compiled.layers[1].uvs[0],5/512);assert.equal(compiled.layers[1].uvs[1],10/512);
});

test('vertical speed publication uses signed source byte factors and previous scroll for band selection',()=>{
 const r=make({vertical:[255,24]});const n=advanceBattleBackgroundParallax({...r,speed:65536,manual:false});
 assert.deepEqual(n.state.verticalVelocity,[-65536,1572864]);assert.deepEqual(n.state.previousVertical,r.state.currentVertical);
 assert.deepEqual(n.cameras,[{x:0,y:304},{x:0,y:279}]);assert.deepEqual(r.state.verticalVelocity,[0,0]);
 const stable=advanceBattleBackgroundParallax({...n,speed:65536,manual:false});assert.deepEqual(stable.cameras,[{x:0,y:328},{x:0,y:278}]);
});

test('wrapped signed accumulation and zero-count source sentinel stay explicit and bounded',()=>{
 const r=make({second:[]});r.groups[0].records[0].secondaryOffset=2147483647;r.groups[0].records[0].offset=2;
 const n=advanceBattleBackgroundParallax({...r,speed:0,manual:false});assert.equal(n.groups[0].records[0].secondaryOffset,-2147483647);
 assert.deepEqual(planBattleBackgroundParallaxBands({...n,manual:false}).planes[0].bands,[{y:32,height:128,x:0}]);
 n.state.previousVertical[1]=479*65536;assert.equal(planBattleBackgroundParallaxBands({...n,manual:false}).status,'blocked');
});

test('web quads split at texture wraps, cover each visible pixel once and carry no source state',()=>{
 const r=make();for(const g of r.groups)for(const row of g.records)row.secondaryOffset=-3*65536;
 const p=compileBattleBackgroundParallaxLayers({...r,cameras:[{x:511.75,y:500.5},{x:-2.25,y:-4.5}],assetKeys,manual:false});
 assert.equal(p.status,'ready');const counts=[new Uint8Array(320*224),new Uint8Array(320*224)];
 for(const q of p.layers){
  assert.deepEqual(Object.keys(q).sort(),['assetKey','height','planeIndex','uvs','width','x','y']);assert.ok(q.uvs.every(n=>n>=0&&n<=1));
  for(let y=0;y<224;y++)for(let x=0;x<320;x++)if(x+.5>=q.x&&x+.5<q.x+q.width&&y+.5>=q.y&&y+.5<q.y+q.height)counts[q.planeIndex][y*320+x]++;
 }
 assert.ok(counts.every(c=>c.every(n=>n===1)));assert.ok(p.layers.length>4);
 const hidden=compileBattleBackgroundParallaxLayers({...r,cameras,assetKeys:[null,'rear'],manual:false});assert.ok(hidden.layers.every(q=>q.planeIndex===1));
});

test('invalid band identity or context rejects before either source group is modified',()=>{
 const r=make(),before=structuredClone(r);r.groups[1].records[0].control++;
 assert.throws(()=>advanceBattleBackgroundParallax({...r,speed:1,manual:false}),{code:'BATTLE_BACKGROUND_PARALLAX'});
 assert.deepEqual(r.groups[0],before.groups[0]);
 for(const options of [{manual:undefined},{speed:-1},{speed:NaN}])assert.throws(()=>advanceBattleBackgroundParallax({...make(),speed:0,manual:false,...options}));
 assert.throws(()=>compileBattleBackgroundParallaxLayers({...make(),cameras:[{x:Infinity,y:0},cameras[1]],assetKeys,manual:false}));
});
