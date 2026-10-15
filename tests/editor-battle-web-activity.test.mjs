import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBattleWebActivity} from '../assets/editor-battle-web-activity.mjs';

const picture={assetKey:'owned-body'};
const pose=(slot,overrides={})=>({slot,picture,vertices:[0,0,8,0,8,8,0,8],uvs:[0,0,1,0,1,1,0,1],...overrides});
const frame=(atUs,objects)=>({atUs,webScene:{width:320,height:224,objects}});

test('visible activity preserves actual appearance, disappearance, and pose or picture changes',()=>{
 const original=pose(1),moved=pose(1,{vertices:[4,0,12,0,12,8,4,8]}),recolored=pose(1,{picture:{...picture}});
 const tracks=buildBattleWebActivity([
  frame(0,[original]),frame(100,[original]),frame(200,[moved]),frame(300,[]),
  frame(450,[recolored]),frame(500,[recolored]),
 ],600);
 assert.deepEqual(tracks[0],{role:'attacker',segments:[
  {fromUs:0,toUs:300,keyTimesUs:[0,200]},
  {fromUs:450,toUs:600,keyTimesUs:[450]},
 ]});
 assert.deepEqual(tracks.slice(1).map(t=>t.segments),[[],[]]);
 const change=buildBattleWebActivity([frame(0,[original]),frame(100,[recolored])],200);
 assert.deepEqual(change[0].segments[0].keyTimesUs,[0,100]);
});

test('static background, offscreen objects, and empty clipping regions do not create activity',()=>{
 const background=pose(undefined,{picture:{assetKey:'backdrop'}});
 const offscreen=pose(1,{vertices:[320,0,328,0,328,8,320,8]});
 const emptyClip=pose(4,{vertices:[300,0,500,0,500,8,300,8],clip:{minX:400,minY:0,maxX:500,maxY:223}});
 const reversedClip=pose(4,{clip:{minX:7,minY:0,maxX:3,maxY:223}});
 const tracks=buildBattleWebActivity([frame(0,[background,offscreen,emptyClip,reversedClip])],100);
 assert.ok(tracks.every(t=>t.segments.length===0));
});

test('effect planes and visible target poses occupy separate tracks with source key times',()=>{
 const effect=pose(undefined,{picture:{assetKey:'web-effect-plane:2'}}),target=pose(4);
 const tracks=buildBattleWebActivity([frame(0,[]),frame(50,[effect,target]),frame(90,[target])],120);
 assert.deepEqual(tracks[1].segments,[{fromUs:50,toUs:90,keyTimesUs:[50]}]);
 assert.deepEqual(tracks[2].segments,[{fromUs:50,toUs:120,keyTimesUs:[50]}]);
});
test('opacity zero has no visible activity and style-only changes create actual source keys',()=>{
 const effect=pose(2,{opacity:0,blend:'add'}),shown=pose(2,{opacity:0.5,blend:'add'}),
  normal=pose(2,{opacity:0.5,blend:'normal'}),opaque=pose(2,{opacity:1,blend:'normal'});
 const tracks=buildBattleWebActivity([
  frame(0,[effect]),frame(100,[shown]),frame(200,[normal]),frame(300,[opaque]),
  frame(400,[pose(2)]),frame(500,[effect]),
 ],600);
 assert.deepEqual(tracks[1].segments,[{fromUs:100,toUs:500,keyTimesUs:[100,200,300]}]);
 const hidden=buildBattleWebActivity([frame(0,[pose(1,{opacity:0}),pose(4,{opacity:0})])],100);
 assert.ok(hidden.every(track=>track.segments.length===0));
});
