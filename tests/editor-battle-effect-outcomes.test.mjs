import test from'node:test';import assert from'node:assert/strict';
import{inspectEffectOutcomes,effectOutcomeState,effectOutcomesLabel}from'../assets/editor-battle-effect-outcomes.mjs';
const unused={status:'ready',effectImportUsage:{requested:[8],called:[],uncalled:[8]}};
const used={previewStatus:'ready',effectImportUsage:{requested:[8],called:[8],uncalled:[]}};
test('outcome inspection reuses the current result, bounds reads to other outcomes, and identifies all-unused',async()=>{
 const calls=[],rows=await inspectEffectOutcomes(async mode=>{calls.push(mode);return unused;},{currentMode:'attack',currentResult:unused});
 assert.deepEqual(calls,['evade','defense','destroyed']);assert.equal(rows.length,4);assert.match(effectOutcomesLabel(rows),/모두 미사용/);
});
test('unverified or failed outcomes stay unknown; partial use is distinct from all-used',async()=>{
 const rows=await inspectEffectOutcomes(async mode=>{if(mode==='evade')return used;if(mode==='defense')throw Error('unsupported');return{status:'partial',effectImportUsage:used.effectImportUsage};},{currentMode:'attack',currentResult:unused});
 assert.deepEqual(rows.map(r=>r.state),['unused','used','unknown','unknown']);assert.doesNotMatch(effectOutcomesLabel(rows),/모두 미사용/);
 assert.equal(effectOutcomeState({status:'ready',effectImportUsage:{requested:[1,2],called:[1],uncalled:[2]}}),'partial');
});
test('a changed selection aborts the scan before reading another outcome',async()=>{
 const controller=new AbortController(),calls=[];
 await assert.rejects(inspectEffectOutcomes(async mode=>{calls.push(mode);controller.abort();return used;},{signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(calls,['attack']);
});
