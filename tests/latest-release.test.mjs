import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPatchNotesForRelease,isSummaryOnlyPatchNotesRelease} from '../assets/release-notes.mjs';
test('latest stable F and Final each pin all fonts and retain historical patch notes',async()=>{
 const index=JSON.parse(await readFile(new URL('../manifest/releases.json',import.meta.url)));
 const app=await readFile(new URL('../assets/app.mjs',import.meta.url),'utf8');
 for(const [game,family,defaultFont] of [['srwf-f','srwf-f-20260928-v0-5','a'],['srwf-final','srwf-final-20261005-v0-3','c']]){
  assert.equal(index.games.find(x=>x.id===game).defaultReleaseId,`${family}-${defaultFont}`);
  for(const lane of 'abc'){
   const id=`${family}-${lane}`,row=index.releases.find(x=>x.id===id);assert.equal(row.state,'ACCEPTED');
   const bytes=await readFile(new URL('../'+row.manifest,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.manifestSha256);
   const m=JSON.parse(bytes),notes=getPatchNotesForRelease(id);assert.ok(notes);assert.ok(app.includes(m.target.sha256));
   if(game==='srwf-f'){
    assert.ok(isSummaryOnlyPatchNotesRelease(id));assert.match(notes.summary,/버튼 \+ START/);assert.match(notes.summary,/일괄 개조/);
    assert.equal(notes.bgmTables.length,2);assert.equal(notes.bgmTables[0].rows.length,6);
   }else assert.match(notes.summary,/부활 목록 암전 수정/);
   const receipt=JSON.parse(await readFile(new URL('../receipts/'+id+'.acceptance.json',import.meta.url)));assert.equal(receipt.targetSha256,m.target.sha256);assert.equal(receipt.patchSha256,m.patch.sha256);assert.equal(receipt.gates.longPlayProgression,'NOT_CLAIMED');
  }
 }
 for(const lane of 'abc'){
  const id=`srwf-final-20260928-v0-2-${lane}`,notes=getPatchNotesForRelease(id);
  assert.equal(index.releases.some(row=>row.id===id),false);
  assert.match(notes.summary,/버튼 \+ START/);assert.equal(notes.bgmTables.length,2);
 }
});
