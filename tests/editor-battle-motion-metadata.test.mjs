import test from 'node:test';import assert from 'node:assert/strict';
import {readBattleMotionDescriptor,planBattleActorMotionBranch,resolveBattleWebUnitMotion,findBattleWebCompatibleTerrains} from '../assets/editor-battle-motion-metadata.mjs';
import {createBattleActorClock,tickBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {recordTable} from './helpers/synthetic-tsr.mjs';
const common=()=>{
 const b=new Uint8Array(32),v=new DataView(b.buffer);v.setInt32(0,8);v.setInt32(4,20);
 for(let index=0;index<8;index++)v.setUint16(8+index*2,(index<<8)|128|((index&3)<<5)|7);
 return b;
};
const source=(mask=12,delta=8)=>{
 const bytes=new Uint8Array(40);bytes.set([0xfa,0x35,mask,(delta>>>8)&255,delta&255],4);
 return {bytes,pc:4,lowerBound:0,end:40};
};
test('owned common descriptor reader preserves both bytes, type bits and attachment flag',()=>{
 const b=common();
 for(let index=0;index<8;index++){
  const descriptor=readBattleMotionDescriptor(b,index);
  assert.deepEqual(descriptor,{status:'ready',index,word:(index<<8)|128|((index&3)<<5)|7,
   flagsByte:128|((index&3)<<5)|7,motionType:index&3});
 }
 assert.equal(readBattleMotionDescriptor(b,8).status,'blocked');
 assert.equal(readBattleMotionDescriptor(b,-1).status,'blocked');
 assert.equal(readBattleMotionDescriptor(new Uint8Array(3),0).status,'blocked');
 new DataView(b.buffer).setInt32(4,1000);assert.equal(readBattleMotionDescriptor(b,0).status,'blocked');
});
test('FA35 selects opposite alternate metadata, every mask bit, and the operand-relative target',()=>{
 for(const directionBit6 of [false,true])for(let type=0;type<4;type++)for(let mask=0;mask<256;mask++){
  const a=source(mask),descriptors=[{status:'ready',motionType:3-type},{status:'ready',motionType:3-type}];
  descriptors[directionBit6?0:1]={status:'ready',motionType:type};
  const result=planBattleActorMotionBranch(a,{directionBit6,alternateSideMotionDescriptors:descriptors});
  const taken=Boolean(mask&(1<<type));assert.deepEqual(result,{status:'ready',pc:taken?15:9,taken,motionType:type});
  assert.equal(a.pc,4); // Pure compilation plan does not mutate a live actor.
 }
});
test('FA35 preserves signed delta-plus-one wrapping and refuses escaping taken branches',()=>{
 const shared={directionBit6:false,alternateSideMotionDescriptors:[{status:'ready',motionType:0},{status:'ready',motionType:2}]};
 assert.equal(planBattleActorMotionBranch(source(4,-6),shared).pc,1);
 const large={bytes:new Uint8Array(40000),pc:33000,lowerBound:0,end:40000};
 large.bytes.set([0xfa,0x35,4,0x7f,0xff],large.pc);
 assert.equal(planBattleActorMotionBranch(large,shared).pc,234);
 assert.equal(planBattleActorMotionBranch(source(4,255),shared).reason,'motion-branch-target-outside-sequence');
 assert.equal(planBattleActorMotionBranch({...source(4,-6),lowerBound:4},shared).reason,'motion-branch-target-outside-sequence');
 // An unused branch does not execute its invalid destination.
 assert.equal(planBattleActorMotionBranch(source(1,255),shared).pc,9);
});
test('FA35 cannot fabricate the opposite descriptor from selected metadata or a default type',()=>{
 const a=source();
 for(const shared of [{},{directionBit6:false,alternateSideMotionDescriptors:[{status:'ready',motionType:0},null]},
  {directionBit6:false,alternateSideMotionDescriptors:[{status:'ready',motionType:0},{status:'ready',motionType:4}]}])
  assert.equal(planBattleActorMotionBranch(a,shared).reason,'opponent-motion-type-unresolved');
 assert.throws(()=>planBattleActorMotionBranch({...a,end:8},{}),/source/);
 assert.throws(()=>planBattleActorMotionBranch({...a,bytes:new Uint8Array(40)},{}),/source/);
});

function terrainFixture(gameId='srwf-f'){
 const count=gameId==='srwf-f'?120:144,movement=new Uint8Array(80),vectors=Array.from({length:8},()=>new Uint8Array(count));
 movement.set([251,255,0,1,0],0);movement.set([255,255,2,1,4],10);
 vectors[1].fill(1);vectors[2].fill(129);vectors[3].fill(1);
 vectors[1][27]=vectors[2][27]=0;vectors[4][27]=65;vectors[3][9]=65;
 const pictures=new Uint8Array(count*4*3);
 for(let bank=0;bank<3;bank++)for(let terrain=0;terrain<count;terrain++)
  pictures.set([3,2,bank?bank+4:1,0],(bank*count+terrain)*4);
 const terrainData=recordTable([0,1,2,3,4],[movement,recordTable([0,1,2,3,4,5,6,7],vectors),
  pictures,new Uint8Array(count*2),new Uint8Array(count*2)]);
 const metadata=new Uint8Array(16),view=new DataView(metadata.buffer);
 [2,0,1,3,0,0,0,0].forEach((type,i)=>view.setUint16(i*2,0x300|(type<<5)));
 return {gameId,terrainData,commonData:recordTable([0,1],[metadata,Uint8Array.of(0)])};
}
test('owned terrain5/day selects ground from movement capability, while a flying unit selects air explicitly',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const fixture=terrainFixture(gameId),ground=resolveBattleWebUnitMotion({...fixture,movementType:0});
  assert.equal(ground.status,'ready');assert.equal(ground.index,1);assert.equal(ground.motionType,0);
  assert.equal(ground.mapClass,1);assert.deepEqual(ground.eligibleMapClasses,[1]);
  const air=resolveBattleWebUnitMotion({...fixture,movementType:2});
  assert.equal(air.index,0);assert.equal(air.motionType,2);assert.equal(air.mapClass,0);
  assert.deepEqual(air.eligibleMapClasses,[0,1]);
  assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:2,mapClass:1}).index,1);
  assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,mapClass:0}).reason,'web-motion-pose-unavailable');
 }
});
test('terrain motion selection reads water bit6, space column0 and each scene bank',()=>{
 const fixture=terrainFixture();
 const water=resolveBattleWebUnitMotion({...fixture,movementType:0,terrainIndex:9});
 assert.equal(water.index,2);assert.equal(water.motionType,1);
 const space=resolveBattleWebUnitMotion({...fixture,movementType:2,terrainIndex:27});
 assert.equal(space.mapClass,2);assert.equal(space.index,3);assert.equal(space.motionType,3);
 assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,sceneBank:1}).index,5);
 assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,sceneBank:2}).index,6);
});
test('terrain motion selection fails closed on missing source tables or unsupported environment',()=>{
 const fixture=terrainFixture();
 for(const patch of [{movementType:undefined},{movementType:16},{gameId:'unknown'},{sceneBank:3},
  {terrainIndex:120},{mapClass:3}])
  assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,...patch}).reason,'web-motion-environment-invalid');
 for(const terrainData of [null,new Uint8Array(4),fixture.terrainData.subarray(0,fixture.terrainData.length-1)])
  assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,terrainData}).reason,'web-motion-terrain-layout-unresolved');
 assert.equal(resolveBattleWebUnitMotion({...fixture,movementType:0,commonData:new Uint8Array(4)}).reason,'motion-metadata-context-missing');
});
test('compatible terrain choices require both bodies and preserve explicit movement classes',()=>{
 for(const gameId of ['srwf-f','srwf-final']){
  const fixture=terrainFixture(gameId),before=fixture.terrainData.slice();
  const result=findBattleWebCompatibleTerrains({...fixture,movementTypes:[0,2]});
  assert.equal(result.status,'ready');assert.equal(result.terrainIndices.length,(gameId==='srwf-f'?120:144)-1);
  assert.ok(result.terrainIndices.includes(9));assert.ok(!result.terrainIndices.includes(27));
  for(const terrainIndex of result.terrainIndices)for(const movementType of [0,2])
   assert.equal(resolveBattleWebUnitMotion({...fixture,terrainIndex,movementType}).status,'ready');
  assert.deepEqual(findBattleWebCompatibleTerrains({...fixture,movementTypes:[2,2],mapClasses:[2,2]}),
   {status:'ready',terrainIndices:[27]});
  assert.deepEqual(findBattleWebCompatibleTerrains({...fixture,movementTypes:[0,2],mapClasses:[1,2]}),
   {status:'ready',terrainIndices:[]});
  assert.deepEqual(fixture.terrainData,before);
 }
});
test('compatible terrain choices cannot fabricate environments from missing or malformed data',()=>{
 const fixture=terrainFixture();
 for(const patch of [{movementTypes:[0]},{movementTypes:new Array(2)},{movementTypes:[0,16]},{mapClasses:[0,0,0]},
  {commonData:new Uint8Array(4)},{terrainData:new Uint8Array(4)},{gameId:'unknown'},{sceneBank:3}]){
  const result=findBattleWebCompatibleTerrains({...fixture,movementTypes:[0,2],...patch});
  assert.equal(result.status,'blocked');assert.equal(result.terrainIndices,undefined);
 }
});
test('FA35 actor consumer uses the explicit opposite pose and resumes at the exact branch target',()=>{
 const fixture=terrainFixture(),ground=resolveBattleWebUnitMotion({...fixture,movementType:0}),
  air=resolveBattleWebUnitMotion({...fixture,movementType:2});
 for(const [descriptor,selector] of [[ground,99],[air,0]]){
  const a=createBattleActorClock(Uint8Array.of(0xfa,0x35,12,0,4,0xc0,99,1,255));
  tickBattleActorClock(a,{directionBit6:false,alternateSideMotionDescriptors:[ground,descriptor]});
  assert.equal(a.blocked,null);assert.equal(a.selector,selector);assert.equal(a.pc,8);
 }
 const missing=createBattleActorClock(Uint8Array.of(0xfa,0x35,12,0,4,0xc0,99,1,255));
 tickBattleActorClock(missing,{directionBit6:false});assert.equal(missing.pc,0);
 assert.equal(missing.blocked.reason,'opponent-motion-type-unresolved');
});
