import test from'node:test';import assert from'node:assert/strict';import{battlePreviewReasonLabel}from'../assets/editor-battle-preview-reason.mjs';
test('owned audit blockers retain human-readable reasons through nested source evidence',()=>{
 assert.equal(battlePreviewReasonLabel({status:'blocked',sceneTick:45,reason:{phase:'main',reason:'resource-cache-value-uninitialized'}}),'연출 진행값 연결 미완료');
 assert.equal(battlePreviewReasonLabel({reason:{phase:'actors',blocked:{reason:'screen-fragment-unresolved',code:'BATTLE_BACKGROUND_CELL_BOUNDS'}}}),'화면 효과 그림 연결 미완료');
 assert.equal(battlePreviewReasonLabel({reason:{phase:'presentation',reason:'other-sprite-priority-composition-unresolved'}}),'효과 겹침 순서 연결 미완료');
});
test('unknown, cyclic and missing evidence cannot become a claimed known diagnosis',()=>{
 assert.equal(battlePreviewReasonLabel(null),null);assert.equal(battlePreviewReasonLabel('unrecognized'),null);const cycle={};cycle.reason=cycle;assert.equal(battlePreviewReasonLabel(cycle),null);
});
