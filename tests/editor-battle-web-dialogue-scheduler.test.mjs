import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleWebDialogueScheduler} from '../assets/editor-battle-web-dialogue-scheduler.mjs';
const message=speaker=>({speakerId:speaker,phase:'attack',text:{picture:{}}});
const action=(token,speaker,delayTicks=0)=>({token,delayTicks,message:message(speaker)});

test('source activation and duration progression generate stable cues before web transport starts',()=>{
 const scheduler=createBattleWebDialogueScheduler([[action(16,10,2),action(17,22)],[],[],[]]);
 scheduler.begin(0);
 assert.equal(scheduler.advance(0,0).status,'displayed');
 assert.equal(scheduler.advance(1,0).status,'waiting');
 assert.equal(scheduler.advance(2,0).status,'waiting');
 assert.deepEqual(scheduler.advance(3,0),{status:'waiting',progress:129});
 assert.equal(scheduler.advance(4,1).status,'displayed');
 assert.deepEqual(scheduler.advance(5,1),{status:'complete',progress:255});
 const cues=scheduler.finish(6,tick=>tick*33430);
 assert.deepEqual(cues.map(cue=>[cue.fromUs,cue.toUs,cue.speakerId]),[[0,133720,10],[133720,200580,22]]);
});

test('reaction activation and channel replacement preserve the visible speaker until the next actual message',()=>{
 const scheduler=createBattleWebDialogueScheduler([[action(16,10)], [action(18,30)],[],[]]);
 scheduler.begin(0);scheduler.advance(0,0);scheduler.advance(1,0);
 scheduler.begin(1);
 assert.deepEqual(scheduler.advance(2,0),{status:'waiting',progress:192});
 assert.deepEqual(scheduler.advance(3,1),{status:'waiting',progress:192});
 scheduler.advance(4,2);
 assert.deepEqual(scheduler.finish(5,tick=>tick*100).map(c=>[c.fromUs,c.toUs,c.speakerId]),[[0,400,10],[400,500,30]]);
});

test('disabled and source-empty channels complete without fabricating speech or timing',()=>{
 const scheduler=createBattleWebDialogueScheduler([[action(16,10)],[],[],[]]);
 scheduler.begin(0,{disabled:true});assert.equal(scheduler.advance(0,0).progress,255);
 scheduler.begin(1);assert.equal(scheduler.advance(1,0).progress,255);
 assert.deepEqual(scheduler.finish(2,tick=>tick*100),[]);
});

test('invalid source messages and reverse compile time cannot become a finished dialogue timeline',()=>{
 assert.throws(()=>createBattleWebDialogueScheduler([[action(15,10)],[],[],[]]),/unresolved channel/);
 const scheduler=createBattleWebDialogueScheduler([[action(16,10)],[],[],[]]);
 scheduler.begin(0);scheduler.advance(0,0);
 assert.throws(()=>scheduler.advance(0,0),/progression/);
 assert.throws(()=>scheduler.finish(0,tick=>tick),/ending/);
 assert.throws(()=>scheduler.finish(1,()=>0),/presentation time/);
});

test('voice identity follows actual immediate and reaction activation rather than a pending text selection',()=>{
 const voiced=(token,speaker,id)=>({...action(token,speaker),voiceId:id});
 const scheduler=createBattleWebDialogueScheduler([
  [voiced(16,10,'voice:13:4'),voiced(17,10,'voice:13:5')],
  [voiced(18,323,'voice:173:12')],
  [voiced(16,22,'voice:unconsumed')],[],
 ]);
 scheduler.begin(0);scheduler.advance(0,0);
 assert.equal(scheduler.advance(1,0).status,'waiting');
 assert.equal(scheduler.advance(2,1).status,'displayed');
 scheduler.begin(1);assert.equal(scheduler.advance(3,1).status,'waiting');
 assert.equal(scheduler.advance(4,2).status,'displayed');
 scheduler.begin(2,{disabled:true});scheduler.advance(5,2);
 const cues=scheduler.finish(6,tick=>tick*100);
 assert.deepEqual(cues.map(cue=>[cue.fromUs,cue.toUs,cue.speakerId,cue.voiceId]),[
  [0,200,10,'voice:13:4'],[200,400,10,'voice:13:5'],[400,600,323,'voice:173:12'],
 ]);
 assert.ok(cues.every(cue=>cue.voiceId!=='voice:unconsumed'));
});

test('a message without a voice stays silent and malformed optional voice identities are rejected',()=>{
 const scheduler=createBattleWebDialogueScheduler([[action(16,10)],[],[],[]]);
 scheduler.begin(0);scheduler.advance(0,0);
 assert.equal(Object.hasOwn(scheduler.finish(1,tick=>tick*100)[0],'voiceId'),false);
 for(const voiceId of ['',null,23,'x'.repeat(129)])
  assert.throws(()=>createBattleWebDialogueScheduler([[{...action(16,10),voiceId}],[],[],[]]),/unresolved channel/);
});
