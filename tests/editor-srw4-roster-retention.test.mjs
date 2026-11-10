import test from 'node:test';
import assert from 'node:assert/strict';
import {applySrw4RosterRetentionBody,normalizeSrw4RosterRetentionBody} from '../assets/editor-srw4-roster-retention.mjs';

const gameId='srwf-final',unitIds=[430,431,432,433,434,435,436];
const originalIds=[80,82,31,33,35,321,37,77,78,79,319,221,222];
function fixture(){
 const decoded=new Uint8Array(19498),roots=[6027,104,1975,104,2523,2563,548,104,2567,2614,2616,2618,2620,6021],v=new DataView(decoded.buffer);
 roots.forEach((p,i)=>v.setInt32(i*4,p-i*4));
 decoded.set([0xc2,0x13],2477);[...originalIds,65535].forEach((id,i)=>v.setUint16(2479+i*2,id));
 decoded.set([0xc1,0x16,0,0xc1,0x17,0xbf,0,130,0xbf,6,0xe7,3],2507);
 return {physicalIndex:88,slots:[185],roots,decoded};
}
const delta=(b,p)=>p+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt16(p);
function cleanupIds(body){
 const b=body.decoded,entry=b[2477]===1?delta(b,2478):2477,v=new DataView(b.buffer,b.byteOffset,b.byteLength),ids=[];
 assert.deepEqual([...b.slice(entry,entry+2)],[0xc2,0x13]);
 let at=entry+2;for(;v.getUint16(at)!==65535;at+=2){ids.push(v.getUint16(at));assert(ids.length<64);}
 return {ids,end:at+2,entry};
}
test('Final slot185 retains all seven current forms without granting seven units or changing pilot cleanup',()=>{
 const source=fixture(),before=source.decoded.slice(),patched=applySrw4RosterRetentionBody(source,{unitIds},{gameId}),parsed=cleanupIds(patched);
 assert.deepEqual(source.decoded,before);assert.deepEqual(parsed.ids,[...originalIds,...unitIds]);
 assert.equal(patched.decoded[parsed.end],1);assert.equal(delta(patched.decoded,parsed.end+1),2507);
 assert.deepEqual(patched.decoded.slice(2480,19498),before.slice(2480));
 assert.deepEqual(patched.roots,source.roots);
 // Model only the verified C2.13 keep-list predicate. No constructor is
 // inserted: transformed forms and every original keep ID survive this list.
 for(const id of [...originalIds,...unitIds])assert(parsed.ids.includes(id));
 assert.equal(parsed.ids.includes(400),false);
 const normalized=normalizeSrw4RosterRetentionBody(patched,{gameId});
 assert.deepEqual(normalized.body.decoded,before);assert.deepEqual(normalized.config,{unitIds});
 assert.equal(applySrw4RosterRetentionBody(patched,{unitIds},{gameId}),patched);
});
test('retention can be deterministically reconfigured and normalizes back to the same original',()=>{
 const source=fixture(),first=applySrw4RosterRetentionBody(source,{unitIds},{gameId}),other=[440,441,442,443,444,445,446];
 const updated=applySrw4RosterRetentionBody(first,{unitIds:other},{gameId});
 assert.equal(updated.decoded.length,first.decoded.length);assert.deepEqual(cleanupIds(updated).ids,[...originalIds,...other]);
 assert.deepEqual(normalizeSrw4RosterRetentionBody(updated,{gameId}).body.decoded,source.decoded);
});
test('wrong game, body, slot, root and changed original keep-list cannot install retention',()=>{
 assert.equal(normalizeSrw4RosterRetentionBody(fixture(),{gameId:'srwf-f'}).config,null);
 for(const body of [{...fixture(),physicalIndex:87},{...fixture(),slots:[184]},fixture(),fixture()]){
  if(body.physicalIndex===88&&body.slots[0]===185){if(body.roots[2]===1975&&body.decoded[2479]===0)body.decoded[2479]=1;}
  assert.throws(()=>applySrw4RosterRetentionBody(body,{unitIds},{gameId}),{code:'EDITOR_SRW4_RETENTION_INVALID'});
 }
 const badRoot=fixture();badRoot.roots[2]++;assert.throws(()=>applySrw4RosterRetentionBody(badRoot,{unitIds},{gameId}),{code:'EDITOR_SRW4_RETENTION_INVALID'});
 assert.throws(()=>applySrw4RosterRetentionBody(fixture(),{unitIds},{gameId:'srwf-f'}),{code:'EDITOR_SRW4_RETENTION_INVALID'});
 for(const ids of [[430],[430,431,432,433,434,435,435],[431,430,432,433,434,435,436],[0,431,432,433,434,435,436],[430,431,432,433,434,435,512]])
  assert.throws(()=>applySrw4RosterRetentionBody(fixture(),{unitIds:ids},{gameId}),{code:'EDITOR_SRW4_RETENTION_INVALID'});
});
test('altered jump, program, IDs, length, original command or footer is rejected before normalization',()=>{
 const patched=applySrw4RosterRetentionBody(fixture(),{unitIds},{gameId});
 for(const at of [2478,2480,19498,19498+28,19498+43,19498+45,19498+47+8,patched.decoded.length-1]){
  const b={...patched,decoded:patched.decoded.slice()};b.decoded[at]^=1;
  assert.throws(()=>normalizeSrw4RosterRetentionBody(b,{gameId}),{code:'EDITOR_SRW4_RETENTION_INVALID'},`offset ${at}`);
 }
 // Missing/altered markers grant no normalization or trusted config; the
 // existing immutable scenario scope must reject these unchanged raw bytes.
 const marker={...patched,decoded:patched.decoded.slice()};marker.decoded[19498+47]^=1;
 assert.equal(normalizeSrw4RosterRetentionBody(marker,{gameId}).body,marker);
 assert.equal(normalizeSrw4RosterRetentionBody(marker,{gameId}).config,null);
 const cut={...patched,decoded:patched.decoded.slice(0,-1)};
 assert.equal(normalizeSrw4RosterRetentionBody(cut,{gameId}).config,null);
 const ordinary=fixture();ordinary.decoded[2478]=0x14;
 assert.equal(normalizeSrw4RosterRetentionBody(ordinary,{gameId}).body,ordinary);
});
