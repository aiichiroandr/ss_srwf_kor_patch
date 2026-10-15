import test from 'node:test';import assert from 'node:assert/strict';
import {planBattleActorAttachment} from '../assets/editor-battle-attachments.mjs';
import {readBattleMotionDescriptor} from '../assets/editor-battle-motion-metadata.mjs';
const common=()=>{
 const bytes=new Uint8Array(32),view=new DataView(bytes.buffer);view.setInt32(0,8);view.setInt32(4,20);
 for(let index=0;index<8;index++)view.setUint16(8+index*2,((index&1)?0:128)|((index&3)<<5)|index);
 return bytes;
};
const actor=()=>({bytes:Uint8Array.of(0xfa,0x43,1),pc:0,lowerBound:0,end:3,flags1:192,parentIndex:1});
const parent=()=>({requestByte:1,flags1:196,x:1448,colorFlags:129,renderMode:3});
const context=(base=parent())=>({sceneFlagsByte:0,actorAt:index=>index===1?base:null,
 alternateSideMotionDescriptors:[readBattleMotionDescriptor(common(),0),readBattleMotionDescriptor(common(),1)],
 attachmentPolicies:{attacker:0,defender:1}});
test('FA43 descriptor selection uses scene bits5/6 XOR without borrowing selected gallery metadata',()=>{
 const descriptors=context().alternateSideMotionDescriptors;
 for(let flags=0;flags<256;flags++){
  const state=context(),a=actor();state.sceneFlagsByte=flags;
  const result=planBattleActorAttachment(a,state),side=((flags>>>5)^(flags>>>6))&1;
  assert.equal(result.status,'ready');assert.equal(result.side,side);assert.equal(result.metadataIndex,descriptors[side].index);
  assert.equal(result.visible,side===0);assert.equal(a.flags1,192);assert.equal(a.pc,0);
 }
});
test('FA43 policies distinguish inherited visibility, fixed coordinates, hidden and forced visible attachments',()=>{
 for(const role of ['attacker','defender'])for(let policy=0;policy<4;policy++)for(const visible of [false,true]){
  const base=parent();base.requestByte=role==='attacker'?1:4;base.flags1=(visible?64:0)|4;
  const state=context(base);state.attachmentPolicies[role]=policy;
  state.attachmentPolicies[role==='attacker'?'defender':'attacker']=(policy+1)&3;
  const result=planBattleActorAttachment(actor(),state);
  assert.equal(result.policy,policy);assert.equal(result.visible,policy===2?false:policy===3||visible);
  if(policy!==2){
   assert.equal(result.relative,policy!==1);assert.equal(result.x,policy===1?1448:0);assert.equal(result.depth,policy===1?1088:0);
   assert.equal(result.inheritedFacing,true);assert.equal(result.colorFlags,129);assert.equal(result.renderMode,3);
  }else assert.equal(result.relative,undefined);
 }
});
test('FA43 hide paths do not invent missing styles or an unknown policy',()=>{
 const state=context({requestByte:1});state.sceneFlagsByte=32;state.attachmentPolicies={};
 assert.deepEqual(planBattleActorAttachment(actor(),state),{status:'ready',side:1,metadataIndex:1,visible:false});
 state.sceneFlagsByte=0;state.attachmentPolicies.attacker=2;
 assert.deepEqual(planBattleActorAttachment(actor(),state),{status:'ready',side:0,metadataIndex:0,policy:2,visible:false});
 state.attachmentPolicies.attacker=3;
 assert.equal(planBattleActorAttachment(actor(),state).reason,'attachment-parent-style-unresolved');
});
test('FA43 refuses absent or internally inconsistent owned descriptors before changing a pose',()=>{
 for(const replacement of [null,{status:'blocked'},
  {...readBattleMotionDescriptor(common(),0),flagsByte:0},
  {...readBattleMotionDescriptor(common(),0),motionType:4},
  {...readBattleMotionDescriptor(common(),0),index:-1}]){
  const a=actor(),state=context();state.alternateSideMotionDescriptors[0]=replacement;
  assert.equal(planBattleActorAttachment(a,state).reason,'attachment-motion-descriptor-unresolved');assert.equal(a.flags1,192);
 }
 const missing=context();delete missing.alternateSideMotionDescriptors;
 assert.equal(planBattleActorAttachment(actor(),missing).reason,'attachment-motion-descriptor-unresolved');
 const policy=context();delete policy.attachmentPolicies.attacker;
 assert.equal(planBattleActorAttachment(actor(),policy).reason,'attachment-policy-unresolved');
 assert.equal(planBattleActorAttachment({...actor(),parentIndex:255},context()).reason,'attachment-parent-context-missing');
 assert.throws(()=>planBattleActorAttachment({...actor(),end:1},context()),/FA43 source/);
});
