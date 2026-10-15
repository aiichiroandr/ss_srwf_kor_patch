import test from 'node:test';
import assert from 'node:assert/strict';
import {battleDialogueChoiceOptions} from '../assets/editor-battle-dialogue-options.mjs';
test('dialogue labels snapshot the roster once even for a full 64-key catalog',()=>{
 let calls=0;const rows=Array.from({length:1331},(_,i)=>({recordIndex:i,owners:[{unit:1}]}));
 const catalog={status:'ready',choices:Array.from({length:64},(_,key)=>({key,attack:{explicit:key>1},weapons:Array.from({length:20},(_,weaponIndex)=>({weaponIndex,name:`무기${weaponIndex}`}))}))};
 const result=battleDialogueChoiceOptions(catalog,{unitIndex:1,getWeapons:()=>{calls++;return rows.map(row=>({...row}));}});
 assert.equal(calls,1);assert.equal(result.length,63);assert.equal(result[0].label,'공통 대사');assert.equal(result[1].value,'2');assert.match(result[1].label,/무기0 \/ 무기1/);
});
test('labels retain only the selected unit owners, deduplicate names and preserve unknown dedicated branches',()=>{
 const choices=[{key:0,attack:{explicit:false},weapons:[]},{key:3,attack:{explicit:true},weapons:[{weaponIndex:1,name:'빔사벨'},{weaponIndex:2,name:'빔사벨'},{weaponIndex:3,name:'다른 기체 무기'}]},{key:4,attack:{explicit:true},weapons:[{weaponIndex:9,name:'없는 무기'}]}];
 const result=battleDialogueChoiceOptions({status:'ready',choices},{unitIndex:1,getWeapons:()=>[{recordIndex:1,owners:[{unit:1}]},{recordIndex:2,owners:[{unitIndex:1}]},{recordIndex:3,owners:[{unit:2}]}]});
 assert.deepEqual(result.map(row=>row.label),['공통 대사','빔사벨','전용 대사 4']);
});
test('an unavailable catalog does not build a roster',()=>{
 assert.deepEqual(battleDialogueChoiceOptions({status:'partial'},{unitIndex:1,getWeapons:()=>{throw Error('unneeded roster');}}),[]);
});
