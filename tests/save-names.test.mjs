import {authenticatedSaveCatalog} from './helpers/authenticated-save-catalog.mjs';
const openSave=async(input,catalog)=>openUntrustedSave(input,await authenticatedSaveCatalog(catalog));
import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {openSave as openUntrustedSave,saveChecksum} from '../assets/save-core.mjs';
import {SAVE_NAME_FIELDS,saveNameFields,decodeSaveName,savedHeroUnitId} from '../assets/save-names.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {checkSaveCompatibility,applyCompatibleNames} from '../assets/save-compatibility.mjs';
import {syntheticSave,syntheticHeroUnits} from './helpers/synthetic-save.mjs';

function fixture(gameId='srwf-final',forms=3){
 const f=syntheticSave({name:gameId==='srwf-final'?'SROBOTFC_01':'SROBOT_F_01'});
 f.payload[0x36]=forms===3?1:0;
 for(const spec of SAVE_NAME_FIELDS){
  f.payload.fill(spec.unitSlot===undefined?255:0,spec.offset,spec.offset+spec.maxBytes);
  if(spec.unitSlot===undefined)f.payload.set(encodeEditorText('가',{gameId,kind:spec.kind,maxBytes:spec.maxBytes}),spec.offset);
 }
 const commit=()=>{new DataView(f.payload.buffer).setUint32(0,saveChecksum(f.payload));f.payloadPositions.forEach((p,i)=>f.raw[p]=f.payload[i]);};
 commit();return {...f,commit};
}

for(const gameId of ['srwf-f','srwf-final'])test(`${gameId}: independent full/alias/form fields round-trip and preserve every other byte`,async()=>{
 const f=fixture(gameId),original=f.raw.slice(),s=await openSave(new Uint8Array(gzipSync(f.raw)),{gameId,units:syntheticHeroUnits()});
 const specs=saveNameFields(s.list()[0]);assert.equal(specs.length,gameId==='srwf-final'?7:4);
 for(const [i,spec]of specs.entries())s.editName(2,spec.field,['천지인','미나','아무로','크리','건담','발칸','빔'][i]);
 const out=await s.exportFile(),raw=gunzipSync(out),next=await openSave(out,{gameId}),record=next.list()[0];
 assert.equal(record.editable,true);assert.equal(s.diff().length,specs.length);
 const allowed=new Set([...f.payloadPositions.slice(0,4),...specs.flatMap(spec=>f.payloadPositions.slice(spec.offset,spec.offset+spec.maxBytes))]);
 raw.forEach((v,i)=>{if(!allowed.has(i))assert.equal(v,original[i],`unrelated byte ${i}`);});
 for(const spec of specs)assert.equal(decodeSaveName(record,spec.field),s.diff().find(d=>d.field===spec.field).after);
 assert.deepEqual(f.raw,original);s.reset();assert.deepEqual(await s.exportFile(),new Uint8Array(gzipSync(original)));
});

test('byte budgets reject overflow atomically and each alias leaves its adjacent full name intact',async()=>{
 const f=fixture(),s=await openSave(f.raw,{gameId:'srwf-final',units:syntheticHeroUnits()});
 for(const [field,n]of [['heroName',6],['partnerName',6],['heroAlias',2],['partnerAlias',2],['heroUnitName1',5],['heroUnitName2',5],['heroUnitName3',5]]){
  s.editName(2,field,'가'.repeat(n));const before=await s.exportFile();
  assert.throws(()=>s.editName(2,field,'가'.repeat(n+1)),/바이트/);assert.deepEqual(await s.exportFile(),before);
 }
 const before=s.list()[0].partnerNameBytes;s.editName(2,'heroAlias','미나');assert.deepEqual(s.list()[0].partnerNameBytes,before);
 assert.throws(()=>s.editName(2,'heroAlias',''),/이름/);assert.throws(()=>s.editName(2,'heroUnitName1',' '),/공백|이름/);
 assert.throws(()=>s.editName(2,'__proto__','가'),/지원/);
});

test('Final saved selection controls the one/three form names; F and inactive forms cannot be written',async()=>{
 const f=fixture('srwf-final',1);f.payload[0x9a]=255;f.commit();
 const single=await openSave(f.raw,{gameId:'srwf-final'});assert.equal(single.list()[0].heroUnitNameCount,1);assert.equal(savedHeroUnitId(single.list()[0]),221);
 for(const field of ['heroUnitName2','heroUnitName3'])assert.throws(()=>single.editName(2,field,'건담'),/지원/);
 const triple=await openSave(fixture().raw,{gameId:'srwf-final',units:syntheticHeroUnits()});assert.deepEqual([0,1,2].map(i=>savedHeroUnitId(triple.list()[0],i)),[222,223,224]);
 const original=await triple.exportFile();triple.editName(2,'heroUnitName2','건담');triple.editName(2,'heroUnitName2','');assert.deepEqual(await triple.exportFile(),original);
 const first=await openSave(fixture('srwf-f').raw,{gameId:'srwf-f'});assert.equal(first.list()[0].heroUnitNameCount,0);assert.throws(()=>first.editName(2,'heroUnitName1','건담'),/지원/);
});

test('legacy Korean aliases decode by the saved face and leaving native defaults untouched is byte-identical',async()=>{
 const f=fixture(),face=317,bytes=encodeEditorText('미나',{gameId:'srwf-final',kind:'hero',maxBytes:6});
 new DataView(f.payload.buffer).setUint16(0x34,face<<7);f.payload.fill(255,0x4a,0x50);f.payload.set(bytes,0x4a);f.commit();
 const s=await openSave(f.raw,{gameId:'srwf-final'});assert.equal(decodeSaveName(s.list()[0],'heroAlias'),'미나');
 s.editName(2,'heroAlias','미나');assert.equal(s.diff().length,0);assert.deepEqual(await s.exportFile(),f.raw);
});

test('compatibility remaps custom full names, aliases and all three mecha forms without touching units',async()=>{
 const source={gameId:'srwf-final',glyphMap:new Map([['EB00','힣'],['EB01','똠']]),units:[{recordIndex:23,identity:'unit:23'},...syntheticHeroUnits()],pilots:[{recordIndex:74,identity:'pilot:74'}]};
 const f=fixture(),old=await openSave(f.raw,source),specs=saveNameFields(old.list()[0]);
 for(const [i,spec]of specs.entries())old.editName(2,spec.field,i%2?'똠':'힣');
 const bytes=await old.exportFile(),target={...source,glyphMap:new Map([['EB02','힣'],['EB03','똠']])},s=await openSave(bytes,target);
 const report=checkSaveCompatibility(s.list(),source,target);assert.equal(report.compatible,true);assert.equal(report.names.filter(n=>n.changed).length,7);
 applyCompatibleNames(s,report);const next=(await openSave(await s.exportFile(),target)).list()[0];
 for(const [i,spec]of specs.entries())assert.equal(decodeSaveName(next,spec.field),i%2?'똠':'힣');
 assert.deepEqual(next.units,old.list()[0].units);assert.deepEqual(next.pilots,old.list()[0].pilots);
 const missing={...target,glyphMap:new Map()};assert.equal(checkSaveCompatibility(old.list(),source,missing).compatible,false);
 const changedUnit={...target,units:target.units.filter(u=>u.recordIndex!==224)};
 assert.ok(checkSaveCompatibility(old.list(),source,changedUnit).issues.some(i=>i.code==='unit-name-identity'),'form names are checked even before that form is owned');
 const incomplete=structuredClone(old.list()[0]);incomplete.heroUnitName1Bytes=Array(10).fill(0);
 assert.ok(checkSaveCompatibility([incomplete],source,target).issues.some(i=>i.code==='unit-name-group'));
});

test('editing only a secondary form activates the native group, preserves defaults and accepts ten text bytes',async()=>{
 const units=syntheticHeroUnits(),f=fixture(),s=await openSave(f.raw,{gameId:'srwf-final',units});
 s.editName(2,'heroUnitName2','가나다라마');const r=s.list()[0];
 assert.deepEqual(r.heroUnitName1Bytes,units.find(u=>u.recordIndex===222).saveNameDefaultBytes);
 assert.deepEqual(r.heroUnitName3Bytes,units.find(u=>u.recordIndex===224).saveNameDefaultBytes);
 assert.equal(r.heroUnitName2Bytes.length,10);assert.equal(decodeSaveName(r,'heroUnitName2'),'가나다라마');
 assert.ok(r.heroUnitName1Bytes.some(Boolean),'stock first-form gate must be active');
 const again=(await openSave(await s.exportFile(),{gameId:'srwf-final',units})).list()[0];assert.equal(decodeSaveName(again,'heroUnitName2'),'가나다라마');
 s.editName(2,'heroUnitName2','');assert.deepEqual(await s.exportFile(),f.raw,'all defaults return to the zero group');
 const bad=units.map(u=>({...u,saveNameDefaultBytes:u.recordIndex===224?null:u.saveNameDefaultBytes})),locked=await openSave(f.raw,{gameId:'srwf-final',units:bad});
 assert.throws(()=>locked.editNames(2,{heroName:'천지인',heroUnitName2:'건담'}),/종료 문자/);assert.deepEqual(await locked.exportFile(),f.raw,'a failed group cannot commit a preceding full-name edit');
});

test('ROM metadata accepts only a complete ten-byte body and its own separate terminator',async()=>{
 const {buildGame}=await import('./helpers/synthetic-game.mjs'),{splitRootSegments,unitRows}=await import('../assets/editor-core.mjs'),{nameMap}=await import('../assets/editor-text-codec.mjs');
 const base=buildGame({units:224}),decoded=new Uint8Array(base.length+11);decoded.set(base);
 const body=encodeEditorText('가나다라마',{gameId:'srwf-final'});decoded.set(body,base.length);
 const segments=splitRootSegments(decoded),cell=segments[11].start+222*4;new DataView(decoded.buffer).setInt32(cell,base.length-cell);
 const rows=()=>unitRows(segments,decoded,[],nameMap('srwf-final'),'srwf-final');
 assert.deepEqual(rows().find(r=>r.recordIndex===222).saveNameDefaultBytes,[...body.slice(0,10)]);
 assert.equal(rows().find(r=>r.recordIndex===223).saveNameDefaultBytes,null,'a short name does not provide the fixed native destination');
 decoded[base.length+10]=0;assert.equal(rows().find(r=>r.recordIndex===222).saveNameDefaultBytes,null);
});
