import test from 'node:test';
import assert from 'node:assert/strict';
import {readBattleStartupAttachmentPlan,initializeBattleStartupAttachment} from '../assets/editor-battle-startup-attachments.mjs';
import {createBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';

const commandBytes=Uint8Array.from([0x2d,6,0,0,0,0,0xae,0x11,0xf0,8,0,
  0x2e,7,0,0,0,0,0xae,0x11,0xf0,8,0,0x68,3]);
function sources(gameId){
  const commonPrograms=new Uint8Array(400),view=new DataView(commonPrograms.buffer),start=128;
  view.setUint32(12,4);
  for(let index=0;index<24;index++){const cell=16+index*4;view.setInt32(cell,start-cell);}
  const at=start+(gameId==='srwf-f'?114:123);commonPrograms.set(commandBytes,at);
  const commonActors=new Uint8Array(169),a=new DataView(commonActors.buffer);
  for(let index=0;index<80;index++)a.setUint16(index*2,index===8?162:index>8?168:160);
  commonActors.set([1,0xff,0xfa,0x43,1,0xf9,0xff,0xfc,0xff],160);
  return {commonPrograms,commonActors,gameId,at};
}
const allocated=()=>{const a=createBattleActorClock(Uint8Array.of(1,255));a.flags1=128;a.flags2=255;return a;};

test('owned scene-entry attachment pair is read before its selector-publication phase in both games',()=>{
  for(const gameId of ['srwf-f','srwf-final']){
    const s=sources(gameId),before=s.commonPrograms.slice(),actorsBefore=s.commonActors.slice();
    const plan=readBattleStartupAttachmentPlan(s);
    assert.equal(plan.status,'ready');assert.deepEqual(plan.plans.map(p=>[p.request,p.opcode,p.parent,p.sequence,p.attrs,p.x,p.depth,p.startDelay]),
      [[6,0x2d,1,0xf008,0xae11,0,0,0],[7,0x2e,4,0xf008,0xae11,0,0,0]]);
    assert.deepEqual(s.commonPrograms,before);assert.deepEqual(s.commonActors,actorsBefore);
    assert.equal(JSON.stringify(plan).includes('Address'),false);
  }
});
test('missing, reordered or changed constructors/publication and unknown sequence fail closed',()=>{
  for(const gameId of ['srwf-f','srwf-final']){
    for(const offset of [0,1,6,8,10,11,12,17,19,21,22,23]){
      const s=sources(gameId);s.commonPrograms[s.at+offset]^=1;
      assert.equal(readBattleStartupAttachmentPlan(s).reason,'startup-attachment-constructor-order-unresolved');
    }
    const s=sources(gameId);s.commonActors[162+2]=0;
    assert.equal(readBattleStartupAttachmentPlan(s).reason,'startup-attachment-sequence-unresolved');
    s.commonActors=s.commonActors.subarray(0,167);
    assert.equal(readBattleStartupAttachmentPlan(s).reason,'startup-attachment-sequence-unresolved');
  }
  assert.equal(readBattleStartupAttachmentPlan({gameId:'other'}).reason,'startup-attachment-game-unresolved');
  assert.equal(readBattleStartupAttachmentPlan({gameId:'srwf-f'}).reason,'startup-attachment-source-unresolved');
  const s=sources('srwf-f');s.commonPrograms=s.commonPrograms.subarray(0,s.at+23);
  assert.equal(readBattleStartupAttachmentPlan(s).reason,'startup-attachment-constructor-order-unresolved');
});
test('typed subviews preserve their own directory and sequence bounds',()=>{
  const s=sources('srwf-final');
  for(const key of ['commonPrograms','commonActors']){
    const b=new Uint8Array(s[key].length+16);b.fill(255);b.set(s[key],8);s[key]=b.subarray(8,b.length-8);
  }
  assert.equal(readBattleStartupAttachmentPlan(s).status,'ready');
});
test('startup initialization matches existing source main2D/2E with every direction pair',()=>{
  const s=sources('srwf-f'),plans=readBattleStartupAttachmentPlan(s).plans;
  for(const plan of plans)for(const directionBit6 of [false,true])for(const directionBit7 of [false,true]){
    const a=allocated(),reference=allocated(),options={commonActors:s.commonActors,directionBit6,directionBit7};
    const at=plan.request===6?0:11,command=Uint8Array.of(...commandBytes.slice(at,at+11),4);
    const shared={flags:0,directionBit6,directionBit7,allocateActor:request=>{assert.equal(request,plan.request);return reference;}};
    const main=createBattleMainClock(command,{shared});
    assert.equal(tickBattleMainClock(main,{resolveActorSequence:sequence=>{
      assert.equal(sequence,0xf008);return {bytes:s.commonActors,index:8,common:true};
    }}).ended,true);
    initializeBattleStartupAttachment(a,plan,options);
    for(const key of ['parentIndex','x','depth','flags1','flags2','selector','renderWord58','nativeByte64',
      'nativeWord72','colorFlags','renderMode','startDelay','sequenceIndex','pc','entryEnd','delay','vx','vDepth'])
      assert.equal(a[key],reference[key],key);
    assert.equal(a.flags1,0x98|(directionBit6!==directionBit7?4:0));
    assert.equal(a.colorFlags,2);assert.equal(a.renderMode,2);assert.equal(a.nativeWord72,112);
    assert.equal(a.nativeByte64,10);assert.equal(a.selector,0);assert.equal(a.startDelay,0);
  }
});
test('initialization keeps source-owned retained secondary state and refuses unresolved source before mutation',()=>{
  const s=sources('srwf-f'),plan=readBattleStartupAttachmentPlan(s).plans[0],a=allocated();
  const oldBytes=a.bytes;a.secondary=0;a.secondaryDelay=5;a.secondaryPeriod=3;
  a.nativeLong44=200;a.nativeLong48=300;a.x=90;a.selector=0x100e;
  const options={commonActors:s.commonActors,directionBit6:false,directionBit7:false};
  const before={...a};
  assert.throws(()=>initializeBattleStartupAttachment(a,{...plan,sequence:0xf009},options),/context unresolved/);
  assert.deepEqual(a,before);
  const bad=s.commonActors.slice();bad[164]=2;
  assert.throws(()=>initializeBattleStartupAttachment(a,plan,{...options,commonActors:bad}),/source sequence unresolved/);
  assert.deepEqual(a,before);
  initializeBattleStartupAttachment(a,plan,options);
  assert.equal(a.secondary,0);assert.equal(a.secondaryBytes,oldBytes);
  assert.equal(a.secondaryDelay,0);assert.equal(a.secondaryPeriod,0);
  assert.equal(a.nativeLong44,200);assert.equal(a.nativeLong48,300);
  assert.equal(a.x,0);assert.equal(a.selector,0); // Publication must follow construction.
  const unallocated=allocated();unallocated.flags1=0;
  assert.throws(()=>initializeBattleStartupAttachment(unallocated,plan,options),/context unresolved/);
});
