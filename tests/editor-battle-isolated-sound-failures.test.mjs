import test from'node:test';import assert from'node:assert/strict';
import{hasPreparedBattleSoundNotes,isIsolatedBattleSoundFailure}from'../assets/editor-battle-isolated-sound-failures.mjs';
test('a scene containing only an isolated partial cue can reach playback while unsafe failures cannot',()=>{
 const partial={status:'partial',notes:[{}],unresolved:[{reason:'tone-lfo-phase-unresolved'}]};
 assert.equal(hasPreparedBattleSoundNotes(partial),true);
 assert.equal(hasPreparedBattleSoundNotes({...partial,notes:[]}),false);
 assert.equal(hasPreparedBattleSoundNotes({...partial,unresolved:[{reason:'pcm-tone-binding-unresolved'}]}),false);
 assert.equal(hasPreparedBattleSoundNotes({...partial,unresolved:[]}),false);
 assert.equal(isIsolatedBattleSoundFailure(new Array(1)),false);
 assert.equal(hasPreparedBattleSoundNotes({status:'ready',notes:[{}]}),true);
});
