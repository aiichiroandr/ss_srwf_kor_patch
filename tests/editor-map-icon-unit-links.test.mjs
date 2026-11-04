import test from 'node:test';
import assert from 'node:assert/strict';
import {readUnitIconReferences,applyUnitIconLinks} from '../assets/editor-map-icon-unit-links.mjs';
function fixture(){
 const offsets=[12,62,112],bytes=Uint8Array.from({length:162},(_,i)=>(i*7)&255);
 for(const [id,at] of offsets.entries()){bytes[at]=0xa6|(id===1?1:0);bytes[at+1]=id===1?44:id;}
 return {bytes,offsets};
}
test('unit bindings separate record IDs from nine-bit icon IDs and preserve every other bit',()=>{
 const {bytes,offsets}=fixture(),links=[{unitRecordIndex:1,fromIconId:300,iconId:19},{unitRecordIndex:2,fromIconId:2,iconId:511}];
 const output=applyUnitIconLinks(bytes,offsets,links);
 assert.deepEqual(readUnitIconReferences(output,offsets),[{recordIndex:0,iconId:0},{recordIndex:1,iconId:19},{recordIndex:2,iconId:511}]);
 for(let i=0;i<bytes.length;i++)if(![62,63,112,113].includes(i))assert.equal(output[i],bytes[i]);
 assert.equal(output[62]&0xfe,bytes[62]&0xfe);assert.equal(output[112]&0xfe,bytes[112]&0xfe);
 assert.deepEqual(applyUnitIconLinks(output,offsets,links,{restore:true}),bytes);
});
test('shared records can be read but cannot silently change an unselected alias',()=>{
 const {bytes,offsets}=fixture(),aliases=[offsets[0],offsets[1],offsets[1]],before=bytes.slice();
 assert.equal(readUnitIconReferences(bytes,aliases)[2].iconId,300);
 assert.throws(()=>applyUnitIconLinks(bytes,aliases,[{unitRecordIndex:1,fromIconId:300,iconId:7}]),{code:'EDITOR_MAP_ICON_UNIT_INVALID'});
 assert.deepEqual(bytes,before);
});
test('stale, repeated, inherited, sparse and invalid bindings are refused before any byte changes',()=>{
 const {bytes,offsets}=fixture(),before=bytes.slice(),ok={unitRecordIndex:1,fromIconId:300,iconId:19};
 for(const bad of [[{...ok,fromIconId:44}],[ok,ok],[Object.create(ok)],new Array(1),[{...ok,iconId:512}],[{...ok,unitRecordIndex:0}]]){
  assert.throws(()=>applyUnitIconLinks(bytes,offsets,bad),{code:'EDITOR_MAP_ICON_UNIT_INVALID'});assert.deepEqual(bytes,before);
 }
 const current=applyUnitIconLinks(bytes,offsets,[ok]);
 assert.throws(()=>applyUnitIconLinks(current,offsets,[ok]),{code:'EDITOR_MAP_ICON_UNIT_INVALID'});
 assert.throws(()=>applyUnitIconLinks(bytes,offsets,[ok],{restore:true}),{code:'EDITOR_MAP_ICON_UNIT_INVALID'});
});
test('only bounded, aligned logical records outside the pointer table can be linked',()=>{
 const {bytes}=fixture();
 for(const offsets of [[],[0],[13],[bytes.length-2],new Array(2),Array(513).fill(12)])
  assert.throws(()=>readUnitIconReferences(bytes,offsets),{code:'EDITOR_MAP_ICON_UNIT_INVALID'});
});
