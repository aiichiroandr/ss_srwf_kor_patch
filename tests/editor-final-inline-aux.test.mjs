import test from 'node:test';
import assert from 'node:assert/strict';
import {packFinalInlineAuxiliary,expandFinalInlineAuxiliary,finalInlineAuxiliaryUsage} from '../assets/editor-final-inline-aux.mjs';
import {compactUnitStorage,expandCompactUnitStorage} from '../assets/editor-unit-compact.mjs';
import {unitFiller as unusedUnitPreimage} from './helpers/synthetic-fillers.mjs';
import {writeWeaponCloneManifest,readWeaponCloneManifest} from '../assets/editor-weapon-clone.mjs';
import {writeWeaponNames,readWeaponNames} from '../assets/editor-weapon-names.mjs';
import {requireTsrRuntimeSize,tsrRuntimeLimit} from '../assets/editor-storage-safety.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';
import {editorStorageBudget} from '../assets/editor-storage-budget.mjs';
import {unitStorageUsage,finalInlineLedgerBytes} from '../assets/editor-unit-compact.mjs';
import {recordTable,unitRecord} from './helpers/synthetic-tsr.mjs';
const game='srwf-final',baseSha='ab'.repeat(32),v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function fixture(){
 const empty=unusedUnitPreimage(game),active=recordTable(Array.from({length:14},(_,i)=>i),[unitRecord(),unitRecord(),...Array.from({length:12},()=>empty)]),base=tsrRuntimeLimit(game)-68;
 const offsets=Array.from({length:14},(_,i)=>i*4+v(active).getInt32(i*4)),storage={start:1024,length:active.length,offsets,baseSha,restoration:{slots:Array.from({length:12},(_,i)=>({recordIndex:i+2}))}},logical=new Uint8Array(base+active.length),d=v(logical);
 d.setUint32(0,164);d.setInt32(108,base-108);d.setInt32(112,storage.start+storage.length-112);d.setInt32(56,4000-56);d.setInt32(116,10000-116);d.setUint32(10000,1408*4);d.setInt32(144,30000-144);
 for(let id=0;id<1344;id++)d.setInt32(4000+4*id,18000-4000-4*id);
 logical.set(encodeEditorText('빔사벨',{gameId:game}),18000);logical.set(active,base);
 const packed=compactUnitStorage(logical,storage,game,{experimentalFinalReference:true}),profile={gameId:game,baseTargetSha256:baseSha,decodedLength:base,unitStorage:storage};
 return {logical,packed,profile,storage,base};
}
function staged(f){const entries=[{recordIndex:2,text:'4연장빔캐논'},{recordIndex:3,text:'빔스마트건'},{recordIndex:4,text:'리플렉터인컴'}];assert.throws(()=>writeWeaponNames(f.packed,entries,game),e=>e.code==='EDITOR_STORAGE_INVALID');return {entries,value:writeWeaponNames(f.packed,entries,game,{staging:true})};}
test('Final reference gap saves name records without growing the runtime image and restores canonical contents',()=>{
 const f=fixture(),s=staged(f),before=s.value.slice(),packed=packFinalInlineAuxiliary(s.value,game,f.base);
 assert.deepEqual(s.value,before);assert.equal(packed.length,f.base);requireTsrRuntimeSize(packed,game);assert.ok(finalInlineAuxiliaryUsage(packed,game)>0);
 assert.deepEqual(expandFinalInlineAuxiliary(packed,game),s.value);
 const read=readWeaponNames(expandFinalInlineAuxiliary(packed,game),game);assert.deepEqual(read.entries,s.entries);assert.deepEqual(expandCompactUnitStorage(read.decoded,game,{profiles:[f.profile]}),f.logical);
 assert.deepEqual(packFinalInlineAuxiliary(expandFinalInlineAuxiliary(packed,game),game,f.base),packed);
 const foot=f.storage.start+f.storage.length-32,used=v(packed).getUint32(foot+28);assert.deepEqual(packed.subarray(f.storage.start+used,f.storage.start+used+2),new Uint8Array(2));
});
test('Final auxiliary bounds, pointer relocation, protected padding and baseline profile fail closed',()=>{
 const f=fixture(),s=staged(f),packed=packFinalInlineAuxiliary(s.value,game,f.base),foot=f.storage.start+f.storage.length-32,begin=f.storage.start+v(packed).getUint32(foot+28)+2;
 const reopen=b=>{const n=readWeaponNames(expandFinalInlineAuxiliary(b,game),game);return expandCompactUnitStorage(n.decoded,game,{profiles:[f.profile]});};
 for(const [i,mutate] of [b=>v(b).setUint32(begin+8,0xffffffff),b=>v(b).setUint32(begin+12,f.base-1),b=>b[begin-1]=128,b=>v(b).setInt32(4008,begin+15-4008),b=>b[begin+16+8]=255,b=>b[foot-1]^=1,b=>b[begin+16+v(b).getUint32(begin+8)]=1].entries()){
  const bad=packed.slice();mutate(bad);assert.throws(()=>reopen(bad),`mutation ${i}`);
 }
 assert.throws(()=>expandCompactUnitStorage(readWeaponNames(expandFinalInlineAuxiliary(packed,game),game).decoded,game,{profiles:[]}));
 const excess=new Uint8Array(f.packed.length+f.storage.length);excess.set(f.packed);excess.fill(42,f.packed.length);const before=excess.slice();assert.throws(()=>packFinalInlineAuxiliary(excess,game,f.base),e=>e.code==='EDITOR_STORAGE_INVALID'&&e.details.reason==='final-inline-aux-capacity'&&e.details.excessBytes>0);assert.deepEqual(excess,before);
});

test('Final clone staging is bounded and available only after authenticated auxiliary expansion',()=>{
 const f=fixture(),clones=Array.from({length:13},(_,i)=>({recordIndex:1331+i,sourceRecordIndex:1}));
 const clone=writeWeaponCloneManifest(f.packed,clones,game,{staging:true});assert.equal(clone.length,tsrRuntimeLimit(game));
 const names=writeWeaponNames(clone,[{recordIndex:2,text:'4연장빔캐논'}],game,{staging:true}),packed=packFinalInlineAuxiliary(names,game,f.base);
 assert.equal(packed.length,f.base);requireTsrRuntimeSize(packed,game);
 const n=readWeaponNames(expandFinalInlineAuxiliary(packed,game),game);assert.deepEqual(readWeaponCloneManifest(n.decoded,game,{staging:true}).entries,clones);
 const long=new Uint8Array(f.packed.length+1);long.set(f.packed);assert.throws(()=>writeWeaponCloneManifest(long,clones,game),e=>e.code==='EDITOR_STORAGE_INVALID');
});

test('Final shared-gap capacity reports auxiliary bytes instead of treating them as free',()=>{
 const f=fixture(),s=staged(f),stored=packFinalInlineAuxiliary(s.value,game,f.base),root={27:{bytes:f.logical.subarray(f.base)},28:{bytes:new Uint8Array(0)},29:{bytes:new Uint8Array(0)}};
 const report=editorStorageBudget({session:{descriptor:{gameId:game},root},logical:f.logical,stored,root,unitStorage:f.storage,pilots:[],sourcePilots:[]});
 const row=report.rows.find(r=>r.id==='unit'),physical=unitStorageUsage(f.logical,f.storage,game).usedBytes+finalInlineLedgerBytes(stored)+finalInlineAuxiliaryUsage(stored,game);
 assert.equal(row.usedBytes,physical);assert.equal(row.remainingBytes,row.limitBytes-physical);assert.ok(row.remainingBytes>=0);
});
