import test from 'node:test';import assert from 'node:assert/strict';
import{encodeWeaponName,allocateWeaponNames,normalizeAllocatedWeaponNames,STOCK_F_NAME_SOURCE}from'../assets/editor-weapon-names.mjs';
import{decodeEditorName}from'../assets/editor-core.mjs';import{F_STOCK_NAME_MAP}from'../assets/editor-stock-name-map.mjs';
import{STOCK_F_NAME_RELOCATIONS as moves}from'../assets/editor-stock-weapon-name-profile.mjs';
function decoded(encoded){const b=new Uint8Array(4+encoded.length);new DataView(b.buffer).setInt32(0,4);b.set(encoded,4);return decodeEditorName(b,{start:0,end:b.length},0,F_STOCK_NAME_MAP).text;}
test('native names use the pinned source font, including kanji and keyboard Latin forms',()=>{
 for(const text of ['ウェイブアタック','格闘','ABC X MAP P α','ビームサーベル']){
  const encoded=encodeWeaponName(text,'srwf-f',STOCK_F_NAME_SOURCE);
  assert.equal(decoded(encoded).normalize('NFKC'),text.normalize('NFKC'));
 }
 assert.throws(()=>encodeWeaponName('격투','srwf-f',STOCK_F_NAME_SOURCE),/원본 게임 글꼴/);
 assert.throws(()=>encodeWeaponName('格闘','srwf-final',STOCK_F_NAME_SOURCE),/글꼴/);
 assert.throws(()=>encodeWeaponName('🚀','srwf-f',STOCK_F_NAME_SOURCE),/글꼴/);
});
test('native sharing offsets keep retained masters outside every freed span and directory',()=>{
 assert.equal(moves.length,54);assert.equal(moves.reduce((n,row)=>n+row[3],0),348);assert.equal(Math.max(...moves.map(row=>row[3])),12);
 for(const[id,from,to,length]of moves){
  assert.ok(id>0&&id<1248&&from>=5120&&to>=5120&&from+length<=16272&&to+length<=16272);
  for(const[,other,,otherLength]of moves)assert.ok(to+length<=other||to>=other+otherLength);
 }
 assert.equal(new Set(moves.map(row=>row[0])).size,moves.length);
});
test('an arbitrary or altered table cannot enter the native name pool',()=>{
 const bad=new Uint8Array(16272),entry={weaponIndex:1248,sourceWeapon:1,name:'格闘'};
 assert.throws(()=>allocateWeaponNames(bad,'srwf-f',[entry],STOCK_F_NAME_SOURCE),/검증값/);
 assert.throws(()=>normalizeAllocatedWeaponNames(bad,'srwf-f',[entry],STOCK_F_NAME_SOURCE),/검증값/);
 assert.throws(()=>allocateWeaponNames(bad,'srwf-final',[entry],STOCK_F_NAME_SOURCE),/Unsupported/);
});

test('portable preset names allow either whole F font but never a mixed invalid name',async()=>{
 const{parseWeaponAuthoringSettings}=await import('../assets/editor-preset.mjs');
 const entry={weaponIndex:1248,sourceWeapon:1,unitIndex:1,edits:[],name:'格闘'};
 assert.equal(parseWeaponAuthoringSettings([entry],'srwf-f')[0].name,'格闘');
 assert.equal(parseWeaponAuthoringSettings([{...entry,name:'웨이브라이더어택'}],'srwf-f')[0].name,'웨이브라이더어택');
 for(const name of ['격투格闘','🚀'])assert.throws(()=>parseWeaponAuthoringSettings([{...entry,name}],'srwf-f'));
});
