import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWeaponName,allocateWeaponNames,normalizeAllocatedWeaponNames,stockReservedWeaponNameOffset} from '../assets/editor-weapon-names.mjs';
import {decodeEditorName} from '../assets/editor-core.mjs';
import {F_NAME_MAP,FINAL_NAME_MAP} from '../assets/editor-name-map.mjs';
test('stock reserved-name normalization is pinned to the exact F source and bounded cells',()=>{
 const hash='c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8';
 assert.deepEqual([1248,1249,1250,1251,1252,1265,1278].map(id=>stockReservedWeaponNameOffset('srwf-f',hash,id)),
  [16249,16250,16251,16252,16253,16250,16253]);
 for(const id of [1247,1279,1248.5,'1248',null,NaN])assert.equal(stockReservedWeaponNameOffset('srwf-f',hash,id),null);
 assert.equal(stockReservedWeaponNameOffset('srwf-final',hash,1248),null);
 assert.equal(stockReservedWeaponNameOffset('srwf-f',hash.slice(0,-1)+'9',1248),null);
 assert.equal(stockReservedWeaponNameOffset('srwf-f',undefined,1248),null);
});
function table(game){const final=game==='srwf-final',length=final?17259:16272,cells=final?1344:1280,b=new Uint8Array(length).fill(255),d=new DataView(b.buffer);for(let id=0;id<cells;id++)d.setInt32(id*4,cells*4-id*4,false);return b;}
for(const game of ['srwf-f','srwf-final']){
 test(`${game}: keyboard spaces encode the actual owned blank glyph and remain verifiable`,()=>{
  const id=game==='srwf-f'?1248:1331,canonical=table(game),entry={weaponIndex:id,sourceWeapon:245,name:'난무의 태도'};
  assert.deepEqual(encodeWeaponName(entry.name,game),encodeWeaponName('난무의　태도',game));
  const plan=allocateWeaponNames(canonical,game,[entry]);
  assert.equal(decodeEditorName(plan.bytes,{start:0,end:plan.bytes.length},id,game==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP).text,'난무의　태도');
  assert.deepEqual(normalizeAllocatedWeaponNames(plan.bytes,game,[entry]),canonical);
 });
 test(`${game}: reopening verifies names and unused pool bytes before normalization`,()=>{
  const id=game==='srwf-f'?1248:1331,canonical=table(game),entry={weaponIndex:id,sourceWeapon:245,name:'웨이브라이더어택'};
  const plan=allocateWeaponNames(canonical,game,[entry]),normalized=normalizeAllocatedWeaponNames(plan.bytes,game,[entry]);
  assert.deepEqual(normalized,canonical);
  const altered=plan.bytes.slice();altered[plan.allocations[0].address]^=1;
  assert.throws(()=>normalizeAllocatedWeaponNames(altered,game,[entry]),/match their project/);
  const hidden=plan.bytes.slice();hidden[plan.allocations[0].address+plan.allocations[0].byteLength+2]=0;
  assert.throws(()=>normalizeAllocatedWeaponNames(hidden,game,[entry]),/match their project/);
  assert.throws(()=>normalizeAllocatedWeaponNames(plan.bytes,game,[{...entry,name:'돌격'}]),/match their project/);
 });
 test(`${game}: custom name round trip preserves unrelated names and length`,()=>{
  const original=table(game),id=game==='srwf-f'?1248:1331,result=allocateWeaponNames(original,game,[{weaponIndex:id,name:'웨이브라이더어택'}]);
  assert.equal(result.bytes.length,original.length);assert.equal(result.allocations[0].byteLength,17);
  assert.equal(decodeEditorName(result.bytes,{start:0,end:result.bytes.length},id,game==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP).text,'웨이브라이더어택');
  assert.equal(decodeEditorName(result.bytes,{start:0,end:result.bytes.length},245,game==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP).status,'empty');
  assert.equal(original[id*4],0);assert.deepEqual(original,table(game));
 });
 test(`${game}: rejects occupied padding and references into an allocation span`,()=>{
  const bytes=table(game),at=game==='srwf-f'?12509:13188;bytes[at]=0;
  assert.throws(()=>allocateWeaponNames(bytes,game,[]),/free padding/);
  bytes[at]=255;new DataView(bytes.buffer).setInt32(245*4,at-245*4,false);
  assert.throws(()=>allocateWeaponNames(bytes,game,[]),/free padding/);
 });
 test(`${game}: rejects duplicate slots, unsupported glyphs and exhausted capacity`,()=>{
  const id=game==='srwf-f'?1248:1331;
  assert.throws(()=>allocateWeaponNames(table(game),game,[{weaponIndex:id,name:'돌격'},{weaponIndex:id,name:'돌격'}]),/identity/);
  assert.throws(()=>encodeWeaponName('🚀',game),/문자/);
  assert.throws(()=>encodeWeaponName(' 돌격',game),/1~80/);
  if(game==='srwf-f')assert.throws(()=>allocateWeaponNames(table(game),game,Array.from({length:24},(_,i)=>({weaponIndex:id+i,name:'웨'.repeat(80)}))),/공간/);
 });
}
