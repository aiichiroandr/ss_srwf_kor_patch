import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../assets/sha256.mjs';
import {decodeFramedLz,compressTsr} from '../assets/editor-core.mjs';
import {createMapIconPatchCodec,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_TRANSFORM_REVISION} from '../assets/editor-map-icon-patch.mjs';
import {createMapIconPackedCodec} from '../assets/editor-map-icon-packed.mjs';
const start=id=>128+id*128;
function literals(raw){
 const out=[];let bits=0,flag=0;
 const bit=n=>{if(!bits){flag=out.length;out.push(0);bits=8;}out[flag]|=n<<--bits;};
 for(const value of raw){bit(1);out.push(value);}bit(0);bit(1);out.push(0,0,0);return Uint8Array.from(out);
}
function fixture(){
 const raw=new Uint8Array(MAP_ICON_PATCH_BYTES);for(let i=0;i<128;i++)raw[i]=i;
 for(let i=1;i<319;i++)raw.fill(i%255||255,start(i),start(i)+128);
 const original=literals(raw),profiles={test:{bytes:original.length,sha256:sha256Hex(original),decodedSha256:sha256Hex(raw)}};
 const codec=createMapIconPackedCodec({decode:decodeFramedLz,encode:compressTsr,profiles});
 const source={sourceId:'srw4-jp-rev1',transformRevision:MAP_ICON_PATCH_TRANSFORM_REVISION,assets:[{assetId:'s-gundam',pixels:Uint8Array.from({length:256},(_,i)=>i%16)}]};
 const patch=createMapIconPatchCodec({profiles:{test:{sha256:sha256Hex(raw)}},validateSource:s=>s.sourceId===source.sourceId&&s.assets.length===1&&sha256Hex(s.assets[0].pixels)===sha256Hex(source.assets[0].pixels)});
 const unitReferences=[{recordIndex:0,iconId:0},{recordIndex:1,iconId:1},{recordIndex:430,iconId:1}];
 const assignments=[{unitRecordIndex:430,fromIconId:1,assetId:'s-gundam'}];
 return {raw,original,profiles,codec,source,patch,unitReferences,assignments};
}
async function plan(f){
 const prepared=await f.codec.prepare(f.original,'test',{firstChangedByte:start(319)});
 const icons=f.patch.build(f.raw,'test',{source:f.source,unitReferences:f.unitReferences,assignments:f.assignments,recoveryLedger:prepared.ledger});
 const packed=await f.codec.build(f.original,'test',icons.bytes,{ledger:icons.recoveryLedger});
 return {prepared,icons,packed};
}
const rejected=fn=>assert.throws(fn,{code:'EDITOR_MAP_ICON_PACKED_INVALID'});

test('closed-flag token boundary keeps the exact prefix and reconstructs every source byte',async()=>{
 const f=fixture(),{prepared,icons,packed}=await plan(f);
 assert.equal(prepared.boundary.decodedOffset,start(319));assert.equal(prepared.boundary.packedOffset,start(319)*9/8);
 assert.ok(prepared.ledger.length<2048);assert.equal(packed.bytes.length,f.original.length);assert.ok(packed.remainingBytes>0);
 assert.deepEqual(packed.bytes.subarray(0,prepared.boundary.packedOffset),f.original.subarray(0,prepared.boundary.packedOffset));
 assert.deepEqual(decodeFramedLz(packed.bytes,MAP_ICON_PATCH_BYTES).output,icons.bytes);
 const restored=f.codec.recover(packed.bytes,'test',icons.recoveryLedger);
 assert.deepEqual(restored.originalPacked,f.original);assert.deepEqual(restored.originalDecoded,f.raw);
 assert.equal(sha256Hex(restored.originalPacked),f.profiles.test.sha256);
 const checked=await f.codec.inspect(packed.bytes,'test',{ledger:icons.recoveryLedger,expectedDecoded:icons.bytes});
 assert.deepEqual(checked.bytes,packed.bytes);
});
test('decoded planner and packed codec jointly validate source icons, reservations and recovery ledger',async()=>{
 const f=fixture(),{icons,packed}=await plan(f),refs=f.unitReferences.map(r=>r.recordIndex===430?{...r,iconId:icons.unitOverrides[0].iconId}:r);
 const decoded=f.patch.inspect(decodeFramedLz(packed.bytes,MAP_ICON_PATCH_BYTES).output,'test',{source:f.source,unitReferences:refs});
 assert.deepEqual(decoded.recoveryLedger,icons.recoveryLedger);
 const restored=f.codec.recover(packed.bytes,'test',decoded.recoveryLedger);assert.deepEqual(restored.originalPacked,f.original);
});
test('non-aligned first modification selects the preceding fresh-flag token boundary',async()=>{
 const f=fixture(),p=await f.codec.prepare(f.original,'test',{firstChangedByte:start(319)+3});
 assert.equal(p.boundary.decodedOffset,start(319));
 const raw=f.raw.slice();raw[start(319)+3]=7;
 const written=await f.codec.build(f.original,'test',raw,{ledger:p.ledger});assert.equal(decodeFramedLz(written.bytes,MAP_ICON_PATCH_BYTES).output[start(319)+3],7);
});
test('changed original bytes, prefix changes, forged boundary and damaged source suffix are refused',async()=>{
 const f=fixture(),{prepared,icons,packed}=await plan(f),changed=f.original.slice();changed[1]^=1;
 await assert.rejects(f.codec.prepare(changed,'test',{firstChangedByte:start(319)}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
 const raw=icons.bytes.slice();raw[0]^=1;
 await assert.rejects(f.codec.build(f.original,'test',raw,{ledger:prepared.ledger}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
 const prefix=packed.bytes.slice();prefix[1]^=1;rejected(()=>f.codec.recover(prefix,'test',prepared.ledger));
 for(const at of [0,10,15,19,20,27,prepared.ledger.length-1]){const ledger=prepared.ledger.slice();ledger[at]^=1;rejected(()=>f.codec.recover(packed.bytes,'test',ledger));}
});
test('nonzero bytes after the active frame and noncanonical frame rewrites fail closed',async()=>{
 const f=fixture(),{icons,packed}=await plan(f),tail=packed.bytes.slice();tail[tail.length-1]=1;
 rejected(()=>f.codec.recover(tail,'test',icons.recoveryLedger));
 const expected=icons.bytes.slice();expected[start(319)]^=1;
 await assert.rejects(f.codec.inspect(packed.bytes,'test',{ledger:icons.recoveryLedger,expectedDecoded:expected}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
});
test('a genuinely full packed file is refused rather than enlarged or partly modified',async()=>{
 const f=fixture(),original=await compressTsr(f.raw,{completeNearMatches:true}),profiles={test:{bytes:original.length,sha256:sha256Hex(original),decodedSha256:sha256Hex(f.raw)}};
 const codec=createMapIconPackedCodec({decode:decodeFramedLz,encode:compressTsr,profiles}),p=await codec.prepare(original,'test',{firstChangedByte:start(319)});
 const changed=f.raw.slice();let n=123456789;for(let i=start(319);i<changed.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;changed[i]=n>>>24;}
 const before=original.slice();await assert.rejects(codec.build(original,'test',changed,{ledger:p.ledger}),error=>error.code==='EDITOR_MAP_ICON_PACKED_INVALID'&&error.details.reason==='capacity');
 assert.deepEqual(original,before);
});
test('absence, wrong framing, ranges and cancellation cannot create a source authorization',async()=>{
 const f=fixture();
 rejected(()=>f.codec.recover(f.original,'test',new Uint8Array()));
 await assert.rejects(f.codec.prepare(f.original,'test',{firstChangedByte:0}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
 await assert.rejects(f.codec.prepare(f.original,'test',{firstChangedByte:Infinity}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
 const controller=new AbortController();controller.abort();
 await assert.rejects(f.codec.prepare(f.original,'test',{firstChangedByte:start(319),signal:controller.signal}),{name:'AbortError'});
 const unchanged=await f.codec.build(f.original,'test',f.raw);assert.deepEqual(unchanged.bytes,f.original);
 const bad=createMapIconPackedCodec({decode:()=>({output:new Uint8Array(MAP_ICON_PATCH_BYTES+1),streamEnd:f.original.length}),encode:compressTsr,profiles:f.profiles});
 await assert.rejects(bad.prepare(f.original,'test',{firstChangedByte:start(319)}),{code:'EDITOR_MAP_ICON_PACKED_INVALID'});
});
