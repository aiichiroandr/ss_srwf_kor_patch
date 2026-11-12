import test from'node:test';import assert from'node:assert/strict';
import {normalizeAliceFFirstClearScenario,changeAliceFFirstClearScenario,ALICE_F_FIRST_CLEAR_SCENARIO} from'../assets/editor-alice-f-first-clear-scenario.mjs';
import {applyAliceFFirstClearImage,normalizeAliceFFirstClearImage} from'../assets/editor-alice-f-first-clear-image.mjs';
const base='b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9';
const trusted={gameId:'srwf-f',developmentOnly:true,baseSha256:base};
test('F first-clear SCEDATA adapters fail closed before accepting synthetic data or option overrides',async()=>{
 assert.equal(ALICE_F_FIRST_CLEAR_SCENARIO.byteLength,409628);
 for(const bad of [{...trusted,gameId:'srwf-final'},{...trusted,developmentOnly:false},{...trusted,baseSha256:'0'.repeat(64)}])await assert.rejects(normalizeAliceFFirstClearScenario(new Uint8Array(409628),bad),{code:'EDITOR_ALICE_F_FIRST_CLEAR_INVALID'});
 await assert.rejects(normalizeAliceFFirstClearScenario(new Uint8Array(3),trusted),{code:'EDITOR_ALICE_F_FIRST_CLEAR_INVALID'});
 await assert.rejects(changeAliceFFirstClearScenario(new Uint8Array(409628),null,trusted),{code:'EDITOR_ALICE_F_FIRST_CLEAR_INVALID'});
});
test('F first-clear image adapter rejects untrusted requests without ISO reads or writes',async()=>{
 const blob=new Blob([new Uint8Array(0)]),bad={...trusted,developmentOnly:false};await assert.rejects(applyAliceFFirstClearImage(blob,null,bad),{code:'EDITOR_ALICE_F_FIRST_CLEAR_INVALID'});await assert.rejects(normalizeAliceFFirstClearImage(blob,bad),{code:'EDITOR_ALICE_F_FIRST_CLEAR_INVALID'});
});
