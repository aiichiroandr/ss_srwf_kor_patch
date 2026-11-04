import test from 'node:test';
import assert from 'node:assert/strict';
import {compactUnitStorage,expandCompactUnitStorage,unitStorageUsage} from '../assets/editor-unit-compact.mjs';
import {tsrRuntimeLimit,requireTsrRuntimeSize,requireTsrExportSize} from '../assets/editor-storage-safety.mjs';
import {unitFiller as unusedUnitPreimage} from './helpers/synthetic-fillers.mjs';
import {recordTable,unitRecord} from './helpers/synthetic-tsr.mjs';
const v=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function fixture(gameId='srwf-final'){
 const empty=unusedUnitPreimage(gameId),normal=unitRecord(),larger=new Uint8Array(62);larger.set(normal);
 const active=recordTable([0,1,2,3],[normal,larger,empty,empty]);
 const start=tsrRuntimeLimit(gameId)-100,storage={start:1024,length:232,restoration:{slots:[{recordIndex:2},{recordIndex:3}]}};
 const decoded=new Uint8Array(start+active.length);decoded.set(active,start);v(decoded).setInt32(108,start-108);
 return {decoded,storage};
}
test('Final menu collision: a logical table beyond 28D800 is stored inside the original segment and reopens byte for byte',()=>{
 const {decoded,storage}=fixture(),before=decoded.slice();
 assert.throws(()=>requireTsrRuntimeSize(decoded,'srwf-final'));
 const packed=compactUnitStorage(decoded,storage,'srwf-final');requireTsrRuntimeSize(packed,'srwf-final');
 assert.equal(108+v(packed).getInt32(108),storage.start);
 const pointer=id=>storage.start+id*4+v(packed).getInt32(storage.start+id*4);
 assert.notEqual(pointer(0),pointer(1),'active equal-prefix units keep independent records');
 assert.equal(pointer(2),pointer(3),'only exact unchanged empty slots share storage');
 assert.deepEqual(expandCompactUnitStorage(packed,'srwf-final'),decoded);
 // The guest menu can overwrite its entire scratch bank without touching a
 // byte of the stored TSR; the old logical layout intersected the same bank.
 const ram=new Uint8Array(0x100000);ram.set(packed,0x1d000);ram.fill(0x5a,0x8d800,0x96000);
 assert.deepEqual(ram.subarray(0x1d000,0x1d000+packed.length),packed);
 assert.deepEqual(decoded,before);
});
test('compact unit padding, pointer aliases and footer bounds cannot hide foreign data',()=>{
 const {decoded,storage}=fixture(),packed=compactUnitStorage(decoded,storage,'srwf-final'),footer=packed.length-32;
 for(const mutate of [b=>b[storage.start+storage.length-1]=1,b=>v(b).setInt32(storage.start+4,v(b).getInt32(storage.start)-4),b=>v(b).setUint32(footer+12,0xffffffff),b=>v(b).setUint32(footer+24,4096)]){
  const bad=packed.slice();mutate(bad);assert.throws(()=>expandCompactUnitStorage(bad,'srwf-final'),e=>e.code==='EDITOR_STORAGE_INVALID');
 }
 assert.throws(()=>expandCompactUnitStorage(packed,'srwf-f'),e=>e.code==='EDITOR_STORAGE_INVALID');
});
test('Final spills only whole records into bounded tail space while active records stay independent',()=>{
 const {decoded,storage:original}=fixture(),before=decoded.slice(),storage={...original,restoration:{slots:[]}};
 const packed=compactUnitStorage(decoded,storage,'srwf-final'),foot=packed.length-40,d=v(packed);
 assert.equal(new TextDecoder().decode(packed.subarray(foot,foot+8)),'SRUCMP05');
 assert.deepEqual(packed.subarray(d.getUint32(foot+8)+d.getUint32(foot+32),d.getUint32(foot+8)+d.getUint32(foot+32)+2),new Uint8Array(2),'post-record halfword guard precedes metadata');
 assert.deepEqual(expandCompactUnitStorage(packed,'srwf-final'),decoded);requireTsrRuntimeSize(packed,'srwf-final');
 const pointer=id=>storage.start+id*4+d.getInt32(storage.start+id*4);
 assert.equal(d.getUint32(storage.start),16,'first relative cell remains the table/count boundary');
 assert.equal(108+d.getInt32(108),storage.start);assert.ok(pointer(3)>=d.getUint32(foot+8));
 assert.notEqual(pointer(2),pointer(3),'equal active records cannot share storage');
 const usage=unitStorageUsage(decoded,storage,'srwf-final');assert.ok(usage.overflowBytes>0);assert.ok(usage.insideBytes<=storage.length);
 assert.deepEqual(decoded,before);
});
test('historical unsafe SRUCMP04 reopens for recovery but cannot export across the CD-loader reserve',()=>{
 const {decoded,storage:original}=fixture(),storage={...original,restoration:{slots:[]}},packed=compactUnitStorage(decoded,storage,'srwf-final'),foot=packed.length-40,d=v(packed),start=d.getUint32(foot+8),tail=d.getUint32(foot+32),gap=30;
 const legacy=new Uint8Array(packed.length-2+gap);
 legacy.set(packed.subarray(0,start));legacy.set(packed.subarray(start,start+tail),start+gap);
 legacy.set(packed.subarray(start+tail+2),start+gap+tail);
 const f=legacy.length-40;legacy.set(new TextEncoder().encode('SRUCMP04'),f);v(legacy).setUint32(f+8,start+gap);
 for(let id=0;id<4;id++){
  const cell=storage.start+id*4,at=cell+d.getInt32(cell);
  if(at>=start)v(legacy).setInt32(cell,at+gap-cell);
 }
 assert.ok(legacy.length>tsrRuntimeLimit('srwf-final'));
 const restored=expandCompactUnitStorage(legacy,'srwf-final');
 assert.equal(108+v(restored).getInt32(108),start+gap);
 assert.throws(()=>compactUnitStorage(restored,storage,'srwf-final'),e=>e.code==='EDITOR_STORAGE_INVALID');
 // A recoverable older layout below the limit upgrades to the guarded format.
 const safe=legacy.slice(0,legacy.length-gap);safe.set(packed.subarray(0,start));safe.set(packed.subarray(start,start+tail),start);safe.set(packed.subarray(start+tail+2),start+tail);
 safe.set(new TextEncoder().encode('SRUCMP04'),safe.length-40);
 const upgraded=compactUnitStorage(expandCompactUnitStorage(safe,'srwf-final'),storage,'srwf-final');
 assert.deepEqual(upgraded,packed);
});
test('split guards, zero weapon IDs and missing terminators are rejected rather than hidden in metadata',()=>{
 const {decoded,storage:original}=fixture(),storage={...original,restoration:{slots:[]}},packed=compactUnitStorage(decoded,storage,'srwf-final'),foot=packed.length-40,d=v(packed),guard=d.getUint32(foot+8)+d.getUint32(foot+32);
 for(const offset of [guard,guard+1]){const bad=packed.slice();bad[offset]=128;assert.throws(()=>expandCompactUnitStorage(bad,'srwf-final'));}
 const start=108+v(decoded).getInt32(108),tableSize=v(decoded).getUint32(start),first=start+tableSize;
 const badTerminator=decoded.slice();badTerminator[first+48]=1;
 assert.throws(()=>compactUnitStorage(badTerminator,storage,'srwf-final'),e=>e.details?.reason==='split-terminator');
 const zeroWeapon=decoded.slice();zeroWeapon[first+46]=1;
 assert.throws(()=>compactUnitStorage(zeroWeapon,storage,'srwf-final'),e=>e.details?.reason==='split-zero-weapon');
});
test('split storage refuses scratch overflow and a first record that cannot fit the original table',()=>{
 const {decoded,storage}=fixture(),start=108+v(decoded).getInt32(108),active=decoded.subarray(start),later=new Uint8Array(start+60+active.length);
 later.set(active,start+60);v(later).setInt32(108,start+60-108);
 assert.throws(()=>compactUnitStorage(later,{...storage,restoration:{slots:[]}},'srwf-final'),e=>e.code==='EDITOR_STORAGE_INVALID');
 assert.throws(()=>compactUnitStorage(decoded,{...storage,length:20},'srwf-final'),e=>e.details?.reason==='split-first-record');
});
test('split physical spans, aliases, hidden bytes and metadata are authenticated by exact re-encoding',()=>{
 const {decoded,storage:original}=fixture(),storage={...original,restoration:{slots:[]}},packed=compactUnitStorage(decoded,storage,'srwf-final'),foot=packed.length-40,d=v(packed),start=d.getUint32(foot+8),overflow=d.getUint32(foot+32);
 const target=(b,id,at)=>v(b).setInt32(storage.start+id*4,at-(storage.start+id*4));
 const mutations=[
  b=>v(b).setUint32(foot+32,overflow+1),b=>v(b).setUint32(foot+36,0),b=>v(b).setUint32(foot+12,0xffffffff),
  b=>target(b,3,start+overflow-1),b=>target(b,3,storage.start+storage.length-1),b=>target(b,3,start-1),
  b=>target(b,2,start),b=>target(b,0,start),b=>b[storage.start+storage.length-1]=1,
  b=>b[start+overflow]=128,b=>v(b).setInt32(108,start-108)
 ];
 for(const mutate of mutations){const bad=packed.slice();mutate(bad);assert.throws(()=>expandCompactUnitStorage(bad,'srwf-final'),e=>e.code==='EDITOR_STORAGE_INVALID');}
 assert.throws(()=>expandCompactUnitStorage(packed,'srwf-f'));
});
test('split first-fit may fill an earlier gap after a large spilled record without reordering logical records',()=>{
 const normal=unitRecord(),large=new Uint8Array(130);large.set(normal);
 const active=recordTable([0,1,2,3],[normal,large,normal,normal]),start=tsrRuntimeLimit('srwf-final')-600;
 const storage={start:1024,length:170,restoration:{slots:[]}},decoded=new Uint8Array(start+active.length);
 decoded.set(active,start);v(decoded).setInt32(108,start-108);const packed=compactUnitStorage(decoded,storage,'srwf-final'),d=v(packed);
 const pointer=id=>storage.start+id*4+d.getInt32(storage.start+id*4);
 assert.ok(pointer(1)>=start);assert.ok(pointer(2)<start);assert.notEqual(pointer(0),pointer(2));
 assert.deepEqual(expandCompactUnitStorage(packed,'srwf-final'),decoded);
});
test('split records retain the halfword alignment required by original SH2 field consumers',()=>{
 const {decoded,storage:original}=fixture(),storage={...original,restoration:{slots:[]}},start=108+v(decoded).getInt32(108),active=decoded.subarray(start),odd=new Uint8Array(decoded.length+1);
 odd.set(active,start+1);v(odd).setInt32(108,start+1-108);
 assert.throws(()=>compactUnitStorage(odd,storage,'srwf-final'),e=>e.details?.reason==='split-alignment');
 const oddLength=new Uint8Array(decoded.length+1);oddLength.set(decoded);
 assert.throws(()=>compactUnitStorage(oddLength,storage,'srwf-final'),e=>e.details?.reason==='split-alignment');
});
test('Final delta metadata reopens historical raw-pointer metadata without weakening canonical checks',()=>{
 const {decoded,storage}=fixture(),packed=compactUnitStorage(decoded,storage,'srwf-final'),f=packed.length-32,d=v(packed),start=d.getUint32(f+8),size=d.getUint32(f+24);
 assert.equal(new TextDecoder().decode(packed.subarray(f,f+8)),'SRUCMP03');
 const legacy=new Uint8Array(start+size+32);legacy.set(packed.subarray(0,start));legacy.set(decoded.subarray(start,start+size),start);legacy.set(packed.subarray(f),start+size);legacy.set(new TextEncoder().encode('SRUCMP01'),start+size);
 assert.deepEqual(expandCompactUnitStorage(legacy,'srwf-final'),decoded);
 assert.ok(packed.length<legacy.length);
 const tampered=legacy.slice();tampered[start]^=1;assert.throws(()=>expandCompactUnitStorage(tampered,'srwf-final'));
 assert.deepEqual(compactUnitStorage(expandCompactUnitStorage(legacy,'srwf-final'),storage,'srwf-final'),packed);
});
test('F uses its independent TSR base and the 28D000 persistent bound, including backward aliases',()=>{
 const gameId='srwf-f',{decoded,storage}=fixture(gameId),packed=compactUnitStorage(decoded,storage,gameId);
 assert.equal(tsrRuntimeLimit(gameId),0x28d000-0x22b000);
 assert.ok(packed.length<decoded.length);requireTsrRuntimeSize(packed,gameId);
 assert.deepEqual(expandCompactUnitStorage(packed,gameId),decoded);
 assert.throws(()=>expandCompactUnitStorage(packed,'srwf-final'));
 const start=tsrRuntimeLimit(gameId)-100,empty=unusedUnitPreimage(gameId),normal=unitRecord(),large=new Uint8Array(62);large.set(normal);
 const active=recordTable([0,1,2,3,4,1],[normal,large,empty,empty,empty]),aliasDecoded=new Uint8Array(start+active.length);
 aliasDecoded.set(active,start);v(aliasDecoded).setInt32(108,start-108);
 const aliasStorage={...storage,length:294,restoration:{slots:[2,3,4].map(recordIndex=>({recordIndex}))}};
 const aliasPacked=compactUnitStorage(aliasDecoded,aliasStorage,gameId);
 assert.deepEqual(expandCompactUnitStorage(aliasPacked,gameId),aliasDecoded);
 const bad=aliasPacked.slice();bad[start]=128;bad[start+1]=0;
 assert.throws(()=>expandCompactUnitStorage(bad,gameId),'overlong varints cannot hide alternate metadata');
});
test('full-size F stores unit metadata inside the original gap and preserves every original transient byte',()=>{
 const gameId='srwf-f',empty=unusedUnitPreimage(gameId),normal=unitRecord(),active=recordTable([0,1,2,3],[normal,normal,empty,empty]);
 const start=409836,storage={start:1024,length:240,restoration:{slots:[2,3].map(recordIndex=>({recordIndex}))}},decoded=new Uint8Array(start+active.length);
 v(decoded).setUint32(0,164);v(decoded).setInt32(112,storage.start+storage.length-112);v(decoded).setInt32(108,start-108);decoded.fill(71,tsrRuntimeLimit(gameId),start);decoded.set(active,start);
 const packed=compactUnitStorage(decoded,storage,gameId),foot=storage.start+storage.length-32;
 assert.equal(packed.length,start);assert.equal(new TextDecoder().decode(packed.subarray(foot,foot+8)),'SRUCMP06');
 requireTsrExportSize(packed,gameId,decoded.subarray(0,start));assert.deepEqual(expandCompactUnitStorage(packed,gameId),decoded);
 const used=v(packed).getUint32(foot+28);assert.equal(packed[storage.start+used],0);assert.equal(packed[storage.start+used+1],0);
 let metaStart=storage.start+used+2;while(!packed[metaStart])metaStart++;
 const meta=packed.subarray(metaStart,foot),legacy=new Uint8Array(start+meta.length+32);legacy.set(packed);legacy.fill(0,storage.start+used,storage.start+storage.length);legacy.set(meta,start);legacy.set(packed.subarray(foot,foot+32),start+meta.length);legacy.set(new TextEncoder().encode('SRUCMP02'),start+meta.length);
 assert.deepEqual(expandCompactUnitStorage(legacy,gameId),decoded,'historical tail metadata remains readable for recovery');
 assert.deepEqual(compactUnitStorage(expandCompactUnitStorage(legacy,gameId),storage,gameId),packed,'recovery moves metadata inside without losing additions');
 for(const mutate of [b=>b[storage.start+used]=128,b=>v(b).setUint32(foot+8,start+1),b=>v(b).setUint32(foot+20,241)]){const bad=packed.slice();mutate(bad);assert.throws(()=>expandCompactUnitStorage(bad,gameId));}
 assert.throws(()=>compactUnitStorage(decoded,{...storage,length:200},gameId),e=>e.details?.reason==='f-unit-inline-capacity');
});
