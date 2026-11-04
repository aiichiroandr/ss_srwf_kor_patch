import test from 'node:test';
import assert from 'node:assert/strict';
import {repairBattleSceneLabels,normalizeBattleSceneLabels,BATTLE_SCENE_O_OFFSETS,requireSingleByteFontPreserved} from '../assets/editor-battle-scene-labels.mjs';
import {ACCEPTED_EDITOR_TARGETS} from '../assets/editor-provenance-profiles.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
const bases=Object.entries(ACCEPTED_EDITOR_TARGETS).filter(([,v])=>/^srwf-final-20261005-v0-3-[abc]$/.test(v.releaseId)).map(([hash])=>hash);
function fixture(){
 const b=new Uint8Array(0x70000);
 for(const[at,hex]of[[0x6ddcf,'ec4cec53ec0bed1afd231000ea2300fe00ff'],[0x6e715,'ea230000ea1b1b00']])b.set(Uint8Array.from(hex.match(/../g),h=>parseInt(h,16)),at);
 return b;
}
test('a-only Latin O repair is atomic and reversible; b/c retain their already correct EA alias',()=>{
 for(const baseSha256 of bases){const options={gameId:'srwf-final',baseSha256},before=fixture(),after=repairBattleSceneLabels(before,options);
  const needsRepair=ACCEPTED_EDITOR_TARGETS[baseSha256].releaseId.endsWith('-a');
  assert.deepEqual(BATTLE_SCENE_O_OFFSETS,[0x6dddb,0x6e715,0x6e719]);
  assert.deepEqual(Array.from(after).flatMap((n,i)=>n!==before[i]?[i]:[]),needsRepair?BATTLE_SCENE_O_OFFSETS:[]);
  for(const at of BATTLE_SCENE_O_OFFSETS){assert.equal(before[at],0xea);assert.equal(after[at],needsRepair?0x24:0xea);}
  assert.equal(after.length,before.length);assert.equal(repairBattleSceneLabels(after,options),after);assert.equal(normalizeBattleSceneLabels(before,options),before);
  assert.deepEqual(normalizeBattleSceneLabels(after,options),before);
  // Preserve compatibility with b/c exports made by the earlier broad fix.
  const oldFix=before.slice();for(const at of BATTLE_SCENE_O_OFFSETS)oldFix[at]=0x24;
  assert.deepEqual(normalizeBattleSceneLabels(oldFix,options),before);
 }
});
test('partial repair, unknown status byte and changed neighbouring text/control bytes are rejected without mutation',()=>{
 const options={gameId:'srwf-final',baseSha256:bases[0]};
 for(const at of [0x6dddb,0x6e715,0x6e719,0x6ddcf,0x6ddd8,0x6e716,0x6e71c]){
  const b=fixture();b[at]^=1;const before=b.slice();
  for(const operation of [repairBattleSceneLabels,normalizeBattleSceneLabels])assert.throws(()=>operation(b,options),e=>e.code==='EDITOR_UI_LABEL_INVALID');
  assert.deepEqual(b,before);
 }
 const partial=fixture();partial[BATTLE_SCENE_O_OFFSETS[0]]=0x24;assert.throws(()=>normalizeBattleSceneLabels(partial,options),/일부만/);
});
test('stock, F, unsupported/future bases and unrelated EA bytes are not globally rewritten',()=>{
 const b=fixture();b[100]=0xea;
 for(const options of [{gameId:'srwf-f',baseSha256:bases[0]},{gameId:'srwf-final',baseSha256:'f'.repeat(64)},{gameId:'srwf-final'}]){
  assert.equal(repairBattleSceneLabels(b,options),b);assert.equal(normalizeBattleSceneLabels(b,options),b);
 }
 const after=repairBattleSceneLabels(b,{gameId:'srwf-final',baseSha256:bases[0]});assert.equal(after[100],0xea);
});
test('new editor names encode the native Latin alphabet, including O, consistently for weapon and save fields',()=>{
 for(const gameId of ['srwf-f','srwf-final'])for(const kind of ['weapon','save','saveAlias','saveUnit']){
  const bytes=encodeEditorText('ABCDEFGHIJKLMNOPQRSTUVWXYZ',{gameId,kind,maxBytes:32});
  assert.deepEqual([...bytes],[...Array.from({length:26},(_,i)=>0x16+i),255]);
 }
});
test('every accepted font protects all 235 one-byte glyphs during export; EC00 additions stay permitted',()=>{
 for(const baseSha256 of bases){
  const before=new Uint8Array(200+9000),options={gameId:'srwf-final',baseSha256};new DataView(before.buffer).setInt32(144,200-144);
  requireSingleByteFontPreserved(before,before,options);
  for(const code of [0,0x16,0x24,0x2f,0xea]){const bad=before.slice();bad[200+code*32+15]=1;assert.throws(()=>requireSingleByteFontPreserved(before,bad,options),e=>e.code==='EDITOR_OUTPUT_INTERNAL');}
  const added=before.slice();added[200+256*32]=1;requireSingleByteFontPreserved(before,added,options);
  const moved=before.slice();new DataView(moved.buffer).setInt32(144,201-144);assert.throws(()=>requireSingleByteFontPreserved(before,moved,options));
 }
});
