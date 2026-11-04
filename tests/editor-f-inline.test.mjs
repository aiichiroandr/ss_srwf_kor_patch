import test from 'node:test';
import assert from 'node:assert/strict';
import {packFInlineAuxiliary,expandFInlineAuxiliary,fInlineAuxiliaryUsage} from '../assets/editor-f-inline.mjs';
import {compactUnitStorage,expandCompactUnitStorage,fUnitOffsetLedgerDiagnostics} from '../assets/editor-unit-compact.mjs';
import {unitFiller as unusedUnitPreimage} from './helpers/synthetic-fillers.mjs';
import {writeWeaponNames,readWeaponNames} from '../assets/editor-weapon-names.mjs';
import {createGlyphEditor} from '../assets/editor-glyphs.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {requireTsrExportSize,tsrRuntimeLimit} from '../assets/editor-storage-safety.mjs';
import {sha256Hex} from '../assets/sha256.mjs';
import {editorStorageBudget} from '../assets/editor-storage-budget.mjs';
const GAME='srwf-f',BASE='a'.repeat(64),v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function fixture(){
 const baseLength=409836,count=14,size=count*4,empty=unusedUnitPreimage(GAME),normal=empty.slice();normal[8]=1;
 const active=new Uint8Array(size+count*empty.length);
 for(let id=0;id<count;id++){v(active).setInt32(id*4,size+id*empty.length-id*4);active.set(id<2?normal:empty,size+id*empty.length);}
 const storage={start:2000,length:active.length,restoration:{slots:Array.from({length:count-2},(_,i)=>({recordIndex:i+2}))}};
 const logical=new Uint8Array(baseLength+active.length),d=v(logical);d.setUint32(0,164);d.setInt32(108,baseLength-108);d.setInt32(112,storage.start+storage.length-112);
 d.setInt32(56,4000-56);d.setInt32(116,9500-116);d.setUint32(9500,1280*4);d.setInt32(144,20000-144);
 for(let id=0;id<1280;id++)d.setInt32(4000+4*id,15000-4000-4*id);
 logical.set(encodeEditorText('빔사벨',{gameId:GAME}),15000);logical.set(encodeEditorText('빔라이플',{gameId:GAME}),15040);d.setInt32(4004,15040-4004);
 logical.fill(71,tsrRuntimeLimit(GAME),baseLength);logical.set(active,baseLength);
 const packed=compactUnitStorage(logical,storage,GAME);
 const profile={gameId:GAME,baseSha256:BASE,atlasOffset:20000,atlasBytes:90112,atlasSha256:sha256Hex(logical.subarray(20000,110112)),cells:Array.from({length:8},(_,i)=>({code:(0xec00+i).toString(16).toUpperCase(),sha256:sha256Hex(new Uint8Array(32)),zero:true}))};
 return {logical,packed,storage,baseLength,tools:createGlyphEditor([profile]),options:{gameId:GAME,baseSha256:BASE,staging:true}};
}
function reopen(stored,f){const staged=expandFInlineAuxiliary(stored,GAME),glyphs=f.tools.readGlyphAdditions(staged,f.options),names=readWeaponNames(glyphs.decoded,GAME,{glyphMap:glyphs.glyphMap});return {logical:expandCompactUnitStorage(names.decoded,GAME),glyphs,names};}
function constructionFixture(){
 const f=fixture(),shift=32,logical=new Uint8Array(f.logical.length+shift);logical.set(f.logical.subarray(0,f.baseLength));logical.set(f.logical.subarray(f.baseLength),f.baseLength+shift);
 const d=v(logical);d.setInt32(108,f.baseLength+shift-108);d.setInt32(44,16000-44);
 for(let id=0;id<14;id++)d.setInt32(16000+4*id,16080-16000-4*id);
 logical.set(encodeEditorText('기체',{gameId:GAME}),16080);
 // Prefix contents remain opaque here; the construction codec/provenance
 // independently authenticate its SRU1 entries and original filler preimages.
 logical.set(new TextEncoder().encode('SRU1'),f.baseLength);logical.set(encodeEditorText('Ｓ건담',{gameId:GAME}),f.baseLength+12);d.setInt32(16008,f.baseLength+12-16008);
 const packed=compactUnitStorage(logical,f.storage,GAME);return {...f,logical,packed};
}
test('F weapon names occupy only the reclaimed unit gap and restore the authenticated logical data',()=>{
 const f=fixture(),entries=[{recordIndex:2,text:'빔라이플'}];
 assert.throws(()=>writeWeaponNames(f.packed,entries,GAME),e=>e.code==='EDITOR_STORAGE_INVALID','the ordinary writer never permits an unsafe game tail');
 const staged=writeWeaponNames(f.packed,entries,GAME,{staging:true}),stored=packFInlineAuxiliary(staged,GAME);
 assert.equal(stored.length,f.baseLength);assert.deepEqual(expandFInlineAuxiliary(stored,GAME),staged);
 assert.equal(fUnitOffsetLedgerDiagnostics(stored).version,6,'already fitting F06 is retained');
 const target=4008+v(stored).getInt32(4008);assert.equal(target,15040,'existing complete strings may stay shared');
 assert.ok(fInlineAuxiliaryUsage(stored,GAME)>0);requireTsrExportSize(stored,GAME,f.logical.subarray(0,f.baseLength));
 assert.deepEqual(reopen(stored,f).logical,f.logical);assert.deepEqual(reopen(stored,f).names.entries,entries);
 assert.deepEqual(packFInlineAuxiliary(expandFInlineAuxiliary(stored,GAME),GAME),stored);
});
test('F names and new glyphs compose losslessly without changing original installation bytes',()=>{
 const f=fixture(),planned=f.tools.planGlyphAdditions(f.logical,['힣'],f.options),entries=[{recordIndex:2,text:'힣 빔사벨'}];
 const named=writeWeaponNames(f.packed,entries,GAME,{glyphMap:planned.glyphMap,staging:true}),written=f.tools.writeGlyphAdditions(named,planned.entries,f.options),stored=packFInlineAuxiliary(written.decoded,GAME);
 const pointer=4008+v(stored).getInt32(4008);assert.ok(pointer>=f.storage.start&&pointer<f.storage.start+f.storage.length);assert.ok(pointer<tsrRuntimeLimit(GAME));
 const read=reopen(stored,f);assert.deepEqual(read.logical,f.logical);assert.deepEqual(read.names.entries,entries);assert.deepEqual(read.glyphs.entries,planned.entries);
 assert.deepEqual(stored.subarray(tsrRuntimeLimit(GAME)),f.packed.subarray(tsrRuntimeLimit(GAME)));
 requireTsrExportSize(stored,GAME,f.logical.subarray(0,f.baseLength));
 const used=v(stored).getUint32(f.storage.start+f.storage.length-4);assert.deepEqual(stored.subarray(f.storage.start+used,f.storage.start+used+2),new Uint8Array(2));
});
for(const count of [1,3])test(`new F names never share a transient string, including duplicate names (${count})`,()=>{
 const f=fixture(),text='천지인검',tail=401500;
 for(const b of [f.logical,f.packed]){b.set(encodeEditorText(text,{gameId:GAME}),tail);v(b).setInt32(4004,tail-4004);}
 const staged=writeWeaponNames(f.packed,Array.from({length:count},(_,i)=>({recordIndex:2+i,text})),GAME,{staging:true}),stored=packFInlineAuxiliary(staged,GAME),target=4008+v(stored).getInt32(4008);
 assert.ok(target<tsrRuntimeLimit(GAME));assert.equal(4004+v(stored).getInt32(4004),tail,'the existing reference is not silently rewritten');
 requireTsrExportSize(stored,GAME,f.logical.subarray(0,f.baseLength));assert.deepEqual(reopen(stored,f).logical,f.logical);
});
test('F auxiliary overflow fails atomically with the actual shared-gap deficit',()=>{
 const f=fixture(),before=f.packed.slice(),planned=f.tools.planGlyphAdditions(f.logical,['힣뷁뛟쀍쎾쫯뛣쒧'],f.options),staged=f.tools.writeGlyphAdditions(f.packed,planned.entries,f.options).decoded;
 assert.throws(()=>packFInlineAuxiliary(staged,GAME),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.reason==='f-inline-aux-capacity'&&e.details.excessBytes===e.details.usedBytes-e.details.limitBytes&&e.details.excessBytes>0);
 assert.deepEqual(f.packed,before);assert.equal(packFInlineAuxiliary(f.packed,GAME),f.packed);assert.equal(packFInlineAuxiliary(staged,'srwf-final'),staged);
});
for(const withGlyph of [false,true])test(`F construction prefix and unit name pointers share the gap (glyph=${withGlyph})`,()=>{
 const f=constructionFixture();let staged=f.packed;
 if(withGlyph){const plan=f.tools.planGlyphAdditions(f.logical,['힣'],f.options);staged=writeWeaponNames(staged,[{recordIndex:2,text:'힣빔'}],GAME,{glyphMap:plan.glyphMap,staging:true});staged=f.tools.writeGlyphAdditions(staged,plan.entries,f.options).decoded;}
 const stored=packFInlineAuxiliary(staged,GAME,f.baseLength),target=16008+v(stored).getInt32(16008);
 assert.equal(stored.length,f.baseLength);assert.ok(target>=f.storage.start&&target<f.storage.start+f.storage.length);requireTsrExportSize(stored,GAME,f.logical.subarray(0,f.baseLength));
 assert.deepEqual(expandFInlineAuxiliary(stored,GAME),staged);assert.deepEqual(reopen(stored,f).logical,f.logical);
 assert.deepEqual(packFInlineAuxiliary(expandFInlineAuxiliary(stored,GAME),GAME,f.baseLength),stored);
 const bad=stored.slice(),foot=f.storage.start+f.storage.length-32,begin=f.storage.start+v(bad).getUint32(foot+28)+2;
 v(bad).setUint32(foot+8,f.baseLength+v(bad).getUint32(begin+8)+1);
 assert.throws(()=>expandFInlineAuxiliary(bad,GAME));
});
test('F pointers, payload bounds, glyphs, gap padding and guard bytes remain authenticated',()=>{
 const f=fixture(),named=writeWeaponNames(f.packed,[{recordIndex:2,text:'빔サーベル'}],GAME,{staging:true}),stored=packFInlineAuxiliary(named,GAME),foot=f.storage.start+f.storage.length-32,begin=f.storage.start+v(stored).getUint32(foot+28)+2;
 for(const [index,mutate] of [b=>v(b).setUint32(begin+8,0xffffffff),b=>v(b).setUint32(begin+12,f.baseLength-1),b=>b[begin-1]=128,b=>v(b).setInt32(4008,begin+16-1-4008),b=>b[begin+16+8]=255,b=>b[begin+16+v(b).getUint32(begin+8)]=1].entries()){
  const bad=stored.slice();mutate(bad);assert.throws(()=>reopen(bad,f),`mutation ${index}`);
 }
});

function compressedFixture(){
 const count=400,baseLength=409836,size=count*4,empty=unusedUnitPreimage(GAME),normal=empty.slice();normal[8]=1;
 const active=new Uint8Array(size+count*54);for(let id=0;id<count;id++){v(active).setInt32(id*4,size+id*54-id*4);active.set(id<count-12?normal:empty,size+id*54);}
 const storage={start:20000,length:active.length,restoration:{slots:Array.from({length:12},(_,i)=>({recordIndex:count-12+i}))}},logical=new Uint8Array(baseLength+active.length),d=v(logical);
 d.setUint32(0,164);d.setInt32(108,baseLength-108);d.setInt32(112,storage.start+storage.length-112);d.setInt32(56,4000-56);d.setInt32(116,9500-116);d.setUint32(9500,1280*4);d.setInt32(144,60000-144);
 for(let id=0;id<1280;id++)d.setInt32(4000+4*id,15000-4000-4*id);logical[15000]=255;logical.fill(71,tsrRuntimeLimit(GAME),baseLength);logical.set(active,baseLength);
 const source=compactUnitStorage(logical,storage,GAME),staged=new Uint8Array(source.length+200);staged.set(source);staged.fill(42,source.length);
 const foot=storage.start+storage.length-32,begin=storage.start+v(source).getUint32(foot+28)+2;
 assert.equal(new TextDecoder().decode(source.subarray(foot,foot+8)),'SRUCMP06');let oldMeta=begin;while(source[oldMeta]===0)oldMeta++;
 assert.ok(oldMeta-begin<216,'the F06 gap cannot hold the payload and 16-byte auxiliary header');
 return {logical,source,staged,storage,foot,begin,baseLength};
}
test('F07 compresses only the reconstruction ledger when F06 auxiliary capacity is insufficient',()=>{
 const {logical,source,staged,storage,foot,begin,baseLength}=compressedFixture();
 const before=staged.slice(),stored=packFInlineAuxiliary(staged,GAME,baseLength);assert.deepEqual(staged,before);assert.equal(new TextDecoder().decode(stored.subarray(foot,foot+8)),'SRUCMP07');
 const expanded=expandFInlineAuxiliary(stored,GAME);assert.equal(expanded.length,staged.length);assert.deepEqual(expanded.subarray(baseLength),staged.subarray(baseLength));
 assert.deepEqual(expandCompactUnitStorage(expanded.subarray(0,baseLength),GAME),logical);
 assert.deepEqual(stored.subarray(storage.start,begin),source.subarray(storage.start,begin),'native unit records, pointers and guard stay exact');
 assert.deepEqual(stored.subarray(tsrRuntimeLimit(GAME)),source.subarray(tsrRuntimeLimit(GAME)),'the original transient installation tail stays exact');
 assert.deepEqual(packFInlineAuxiliary(expanded,GAME,baseLength),stored);requireTsrExportSize(stored,GAME,logical.subarray(0,baseLength));
 const ledger=fUnitOffsetLedgerDiagnostics(stored);assert.equal(ledger.version,7);assert.ok(ledger.savedBytes>0);assert.equal(ledger.rawBytes-ledger.storedBytes,ledger.savedBytes);
 assert.equal(fUnitOffsetLedgerDiagnostics(source).version,6);assert.deepEqual(expandCompactUnitStorage(source,GAME),logical,'historical F06 still reopens exactly');
 const clean=expanded.slice(0,baseLength);let meta=begin;while(clean[meta]===0)meta++;
 for(const at of [meta,meta+1,meta+3,meta+7,foot-1,foot+8,storage.start+4]){const corrupt=clean.slice();corrupt[at]^=1;assert.throws(()=>expandCompactUnitStorage(corrupt,GAME),`F07 mutation ${at}`);}
});

test('F07 cannot conceal malformed Huffman trees, padding, fields, or oversized auxiliary data',()=>{
 const {source,staged,storage,foot,begin,baseLength}=compressedFixture(),stored=packFInlineAuxiliary(staged,GAME,baseLength),expanded=expandFInlineAuxiliary(stored,GAME),clean=expanded.slice(0,baseLength);
 let frame=begin;while(!clean[frame])frame++;
 const count=v(clean).getUint16(frame+5);
 const mutations=[
  b=>b[frame]=249,b=>v(b).setUint16(frame+1,0),b=>v(b).setUint16(frame+1,4097),
  b=>v(b).setUint16(frame+3,1),b=>v(b).setUint16(frame+5,257),
  b=>b[frame+8]=0,b=>b[frame+8]=25,
  b=>b[frame+9]=b[frame+7],b=>b[frame+7+count*2]^=1,
  b=>b[begin-1]=128,b=>v(b).setUint32(foot+28,0xffffffff)
 ];
 for(const [index,mutate]of mutations.entries()){const bad=clean.slice();mutate(bad);assert.throws(()=>expandCompactUnitStorage(bad,GAME),e=>e.code==='EDITOR_STORAGE_INVALID',`F07 malformed field ${index}`);}
 const excessive=new Uint8Array(source.length+storage.length);excessive.set(source);excessive.fill(42,source.length);const before=excessive.slice();
 assert.throws(()=>packFInlineAuxiliary(excessive,GAME,baseLength),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.reason==='f-inline-aux-capacity'&&e.details.offsetLedger.version===7&&e.details.excessBytes>0);
 assert.deepEqual(excessive,before,'overflow is atomic even after trying the smaller ledger');
});

test('F07 capacity display counts the actual compressed ledger and auxiliary bytes',()=>{
 const {logical,staged,storage,foot}=compressedFixture(),stored=packFInlineAuxiliary(staged,GAME),ledger=fUnitOffsetLedgerDiagnostics(stored);
 const root={27:{bytes:logical.subarray(108+v(logical).getInt32(108))},28:{bytes:new Uint8Array(0)},29:{bytes:new Uint8Array(0)}};
 const report=editorStorageBudget({session:{descriptor:{gameId:GAME},root},logical,stored,root,unitStorage:storage,pilots:[],sourcePilots:[]}),row=report.rows.find(r=>r.id==='unit');
 const physical=v(stored).getUint32(foot+28)+2+ledger.storedBytes+32+fInlineAuxiliaryUsage(stored,GAME);
 assert.equal(ledger.version,7);assert.equal(row.usedBytes,physical);assert.ok(row.remainingBytes>=0);assert.equal(row.remainingBytes,storage.length-physical);
 assert.ok(row.usedBytes+ledger.savedBytes>row.limitBytes,'using historical uncompressed ledger size would incorrectly report overflow');
});
