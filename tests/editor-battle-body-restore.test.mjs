import test from 'node:test';import assert from 'node:assert/strict';
import {restoreBattleSceneBodies} from '../assets/editor-battle-body-restore.mjs';
import {createBattleActorClock} from '../assets/editor-battle-clock.mjs';
import {createBattleMainClock,tickBattleMainClock} from '../assets/editor-battle-main-clock.mjs';
function fixture(){
 const actors=Array.from({length:8},()=>({...createBattleActorClock(Uint8Array.of(1,255)),flags1:128}));
 actors[4].x=704;actors[4].depth=1152;const copies=[];
 const shared={mainPauseWord:0,sceneFlagsByte:64,sideSecondaryStatusFlags:[0,16],
  alternateAnimationFlagsBytes:[32,96],actorAt:slot=>actors[slot],initializeGraphics:request=>{copies.push(request);return true;}};
 return {actors,copies,shared};
}
test('680E restores opposite body resources, parent-relative support and palette rows across native yields',()=>{
 const f=fixture(),clock=createBattleMainClock(Uint8Array.of(0x68,14,4),{shared:f.shared});
 assert.equal(tickBattleMainClock(clock).bodyRestoreWait,true);assert.equal(clock.program.pc,0);
 assert.equal(f.shared.mainPauseWord,1);
 assert.equal(f.actors[1].selector,0x900);assert.equal(f.actors[4].selector,0x800);
 assert.deepEqual([f.actors[1].x,f.actors[1].depth],[704,1152]);
 assert.deepEqual([f.actors[4].x,f.actors[4].depth],[1280,1088]);
 assert.equal(f.actors[5].selector,0x907);assert.equal(f.actors[5].parentIndex,1);
 assert.equal(f.actors[6].selector,0x100d);assert.equal(f.actors[7].selector,0x100f);
 assert.equal(tickBattleMainClock(clock).bodyRestoreWait,true);assert.equal(f.copies.length,2);
 assert.equal(tickBattleMainClock(clock).ended,true);assert.equal(clock.program.pc,2);
 assert.equal(f.shared.mainPauseWord,0);assert.equal(f.shared.graphicsCompletionWord,1);
 assert.deepEqual(f.copies.map(({request,bank})=>[request,bank]),[[128,62],[384,63],[144,58],[400,59]]);
});
test('680E keeps support hidden for the inhibited state and missing palettes cannot publish body changes',()=>{
 const f=fixture();f.shared.sideSecondaryStatusFlags[1]=20;f.actors[5].flags1=192;
 assert.equal(restoreBattleSceneBodies(f.shared).status,'waiting');assert.equal(f.actors[5].flags1&64,0);
 const g=fixture();g.shared.initializeGraphics=undefined;
 const before=g.actors.map(actor=>({...actor}));
 assert.equal(restoreBattleSceneBodies(g.shared).reason,'body-restore-palette-context-missing');
 assert.deepEqual(g.actors,before);
});
