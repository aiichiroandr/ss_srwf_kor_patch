import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../assets/sha256.mjs';
import {createMapIconPatchV2Codec,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_V2_HEADER_BYTES,MAP_ICON_PATCH_V2_REUSED_FLAG,MAP_ICON_PATCH_TRANSFORM_REVISION} from '../assets/editor-map-icon-patch-v2.mjs';
import {createMapIconPatchCodec as createV1} from '../assets/editor-map-icon-patch.mjs';
import {SRW4_ASSET_KEYS} from '../assets/editor-srw4-rom.mjs';
import {readMapIcons,decodeMapIcon} from '../assets/editor-map-icons.mjs';
const start=id=>128+id*128;
const pack=pixels=>Uint8Array.from({length:128},(_,i)=>(pixels[i*2]<<4)|pixels[i*2+1]);
const pixels=n=>Uint8Array.from({length:256},(_,i)=>(i+n)%16);
const rejected=fn=>assert.throws(fn,{code:'EDITOR_MAP_ICON_PATCH_INVALID'});
function makeCodec(original,source){
 const profiles={test:{sha256:sha256Hex(original)}},expected=new Map(source.assets.map(a=>[a.assetId,sha256Hex(a.pixels)]));
 const validateSource=s=>s.sourceId===source.sourceId&&s.transformRevision===source.transformRevision&&s.assets.every(a=>expected.get(a.assetId)===sha256Hex(a.pixels));
 return {profiles,validateSource,codec:createMapIconPatchV2Codec({profiles,validateSource})};
}
function fixture(){
 const original=new Uint8Array(MAP_ICON_PATCH_BYTES);for(let i=0;i<128;i++)original[i]=i;
 for(let id=1;id<319;id++)original.fill((id%255)||255,start(id),start(id)+128);
 const source={sourceId:'srw4-jp-rev1',transformRevision:MAP_ICON_PATCH_TRANSFORM_REVISION,assets:[{assetId:'s-gundam',pixels:pixels(1)},{assetId:'icon:0',pixels:pixels(2)},{assetId:'icon:511',pixels:pixels(3)}]};
 const unitReferences=[{recordIndex:0,iconId:0},{recordIndex:1,iconId:1},{recordIndex:50,iconId:319},{recordIndex:430,iconId:1},{recordIndex:431,iconId:8},{recordIndex:432,iconId:1}];
 const assignments=[{unitRecordIndex:430,fromIconId:1,assetId:'s-gundam'},{unitRecordIndex:431,fromIconId:8,assetId:'icon:511'},{unitRecordIndex:432,fromIconId:1,assetId:'s-gundam'}];
 return {original,source,unitReferences,assignments,...makeCodec(original,source)};
}
function build(f,extra={}){return f.codec.build(f.original,'test',{source:f.source,unitReferences:f.unitReferences,assignments:f.assignments,...extra});}
function currentRefs(refs,plan){return refs.map(r=>({...r,iconId:plan.unitOverrides.find(e=>e.unitRecordIndex===r.recordIndex)?.iconId??r.iconId}));}
function options(f,plan){return {source:f.source,unitReferences:currentRefs(f.unitReferences,plan)};}
function reopen(f,plan){return f.codec.inspect(plan.bytes,'test',options(f,plan));}
function rebuiltFixture(f){return {...f,...makeCodec(f.original,f.source)};}

test('V2 uses a 64-byte header and eight-byte mappings with strict raw icon IDs',()=>{
 const f=fixture(),before=f.original.slice(),p=build(f);assert.equal(MAP_ICON_PATCH_V2_HEADER_BYTES,64);
 assert.equal(p.version,2);assert.deepEqual(p.metadataSlots,[511]);assert.equal(p.unitOverrides.length,3);
 assert.deepEqual(p.iconSlots,[320,321]);assert.deepEqual(p.newIconSlots,[320,321]);assert.deepEqual(p.reusedIconSlots,[]);
 assert.equal(p.unitOverrides[0].iconId,p.unitOverrides[2].iconId);assert.deepEqual(f.original,before);
 const m=p.bytes.subarray(start(511)),v=new DataView(m.buffer,m.byteOffset,m.byteLength);
 assert.equal(new TextDecoder().decode(m.subarray(0,8)),'SRWKOM02');assert.equal(v.getUint16(16),64+3*8);
 assert.equal(v.getUint16(64+8+6),0x81ff);assert.equal(p.bytes[start(320)],0x12);
 assert.deepEqual(p.bytes.subarray(0,start(319)),f.original.subarray(0,start(319)));
 assert.equal(decodeMapIcon(readMapIcons(p.bytes),320,'player').length,1024);
});
test('V2 recovers the exact original and requires a canonical full rebuild',()=>{
 const f=fixture(),p=build(f),r=reopen(f,p);assert.deepEqual(r.original,f.original);assert.deepEqual(r.bytes,p.bytes);assert.deepEqual(r.unitOverrides,p.unitOverrides);
 assert.notEqual(r.original,f.original);assert.notEqual(r.bytes,p.bytes);assert.equal(sha256Hex(r.original),f.profiles.test.sha256);
});
test('a source icon already present in the nonempty original bank reuses that slot',()=>{
 let f=fixture();f.original.set(pack(f.source.assets[0].pixels),start(62));f.unitReferences.push({recordIndex:2,iconId:62});f.assignments=f.assignments.filter(e=>e.assetId==='s-gundam');f=rebuiltFixture(f);
 const p=build(f);assert.deepEqual(p.iconSlots,[62]);assert.deepEqual(p.reusedIconSlots,[62]);assert.deepEqual(p.newIconSlots,[]);assert.deepEqual(p.reservedSlots,p.metadataSlots);
 assert.ok(p.unitOverrides.every(e=>e.reusedOriginal));assert.deepEqual(reopen(f,p).original,f.original);
 const m=p.bytes.subarray(start(p.metadataSlots[0]));assert.equal(new DataView(m.buffer,m.byteOffset,m.byteLength).getUint16(64+6),MAP_ICON_PATCH_V2_REUSED_FLAG);
 assert.deepEqual(p.bytes.subarray(start(62),start(63)),f.original.subarray(start(62),start(63)));
});
test('nonempty original icon zero can be reused but is never allocated or zeroed',()=>{
 let f=fixture();f.original.set(pack(f.source.assets[0].pixels),start(0));f.assignments=[f.assignments[0]];f=rebuiltFixture(f);
 const p=build(f);assert.equal(p.unitOverrides[0].iconId,0);assert.equal(p.unitOverrides[0].reusedOriginal,true);assert.deepEqual(p.reservedSlots,[511]);assert.deepEqual(reopen(f,p).original,f.original);
});
test('distinct asset keys with byte-identical new pixels share one new slot',()=>{
 let f=fixture();f.source.assets[2].pixels=f.source.assets[0].pixels.slice();f=rebuiltFixture(f);
 const p=build(f);assert.equal(p.newIconSlots.length,1);assert.equal(new Set(p.unitOverrides.map(e=>e.iconId)).size,1);assert.deepEqual(reopen(f,p).unitOverrides,p.unitOverrides);
});
test('distinct identical source keys choose the lowest matching original slot deterministically',()=>{
 let f=fixture();f.source.assets[2].pixels=f.source.assets[0].pixels.slice();const raw=pack(f.source.assets[0].pixels);f.original.set(raw,start(62));f.original.set(raw,start(77));f=rebuiltFixture(f);
 const p=build(f);assert.deepEqual(p.reusedIconSlots,[62]);assert.equal(p.newIconSlots.length,0);assert.deepEqual(reopen(f,p).original,f.original);
});
test('all 519 source asset keys and all 511 game unit assignments are supported',()=>{
 const original=new Uint8Array(MAP_ICON_PATCH_BYTES);original.fill(0x44,start(1),start(2));
 const source={sourceId:'srw4-jp-rev1',transformRevision:MAP_ICON_PATCH_TRANSFORM_REVISION,assets:[...SRW4_ASSET_KEYS,...Array.from({length:512},(_,i)=>`icon:${i}`)].map(assetId=>({assetId,pixels:pixels(3)}))};
 const unitReferences=Array.from({length:512},(_,recordIndex)=>({recordIndex,iconId:recordIndex?1:0}));
 const assignments=Array.from({length:511},(_,i)=>({unitRecordIndex:i+1,fromIconId:1,assetId:`icon:${i}`}));
 const f={original,source,unitReferences,assignments,...makeCodec(original,source)},p=build(f);assert.equal(p.unitOverrides.length,511);assert.equal(p.metadataSlots.length,33);assert.equal(p.newIconSlots.length,1);assert.equal(reopen(f,p).unitOverrides.length,511);
});
test('native banks and empty edits need no optional sprite source or validator',()=>{
 const f=fixture(),codec=createMapIconPatchV2Codec({profiles:f.profiles});
 const r=codec.inspect(f.original,'test');assert.equal(r.version,0);assert.deepEqual(r.bytes,f.original);assert.deepEqual(r.newIconSlots,[]);
 assert.deepEqual(codec.build(f.original,'test',{unitReferences:f.unitReferences,assignments:[]}).bytes,f.original);
 rejected(()=>createMapIconPatchV2Codec().inspect(f.original,'srwf-f'));
});
test('arbitrary JSON pixels and missing or merely truthy validation callbacks are refused',()=>{
 const f=fixture();for(const validateSource of[undefined,()=>1,()=>({verified:true}),()=>false]){
  const codec=createMapIconPatchV2Codec({profiles:f.profiles,validateSource});rejected(()=>codec.build(f.original,'test',{source:f.source,unitReferences:f.unitReferences,assignments:f.assignments}));
 }
 const p=build(f);rejected(()=>createMapIconPatchV2Codec({profiles:f.profiles}).inspect(p.bytes,'test',options(f,p)));
 rejected(()=>build(f,{source:{...f.source,assets:[{assetId:'s-gundam',pixels:[...pixels(1)]}]}}));
});
test('source keys, source identity, transform, color indices and dense lists stay strict',()=>{
 const f=fixture();
 for(const id of['icon:-1','icon:512','icon:00','icon:1.0','icon:1e1','icon: 1','icon:1x','constructor','ex-s-gundam'])rejected(()=>build(f,{source:{...f.source,assets:[{assetId:id,pixels:pixels(1)}]}}));
 for(const source of[{...f.source,sourceId:'constructor'},{...f.source,transformRevision:'future'},
 {...f.source,assets:new Array(1)},{...f.source,assets:[f.source.assets[0],f.source.assets[0]]},
 {...f.source,assets:[{assetId:'s-gundam',pixels:new Uint8Array(256)}]},
 {...f.source,assets:[{assetId:'s-gundam',pixels:new Uint8Array(256).fill(16)}]}])rejected(()=>build(f,{source}));
});
test('source ID and regenerated selected pixels are required even without redundant header hashes',()=>{
 const f=fixture(),p=build(f),opts=options(f,p);rejected(()=>f.codec.inspect(p.bytes,'test',{unitReferences:opts.unitReferences}));
 rejected(()=>f.codec.inspect(p.bytes,'test',{...opts,source:{...f.source,sourceId:'srw4-jp'}}));
 const changed={...f.source,assets:f.source.assets.map(a=>({...a,pixels:a.pixels.slice()}))};changed.assets[0].pixels[0]^=1;
 rejected(()=>f.codec.inspect(p.bytes,'test',{...opts,source:changed}));
 // Even a trusted permissive verifier cannot make different selected pixels
 // reproduce the previously stored canonical bank.
 const permissive=createMapIconPatchV2Codec({profiles:f.profiles,validateSource:()=>true});
 rejected(()=>permissive.inspect(p.bytes,'test',{...opts,source:changed}));
});
test('unknown serialized asset codes and inconsistent reuse flags are rejected',()=>{
 const f=fixture(),p=build(f),at=start(p.metadataSlots[0])+64+6;
 for(const code of[7,0x200,0x8200,0x2000,0xffff,MAP_ICON_PATCH_V2_REUSED_FLAG]){
  const edited=p.bytes.slice();new DataView(edited.buffer).setUint16(at,code);rejected(()=>f.codec.inspect(edited,'test',options(f,p)));
 }
});
test('changing a reused-original flag cannot zero or retain unowned picture bytes',()=>{
 let f=fixture();f.original.set(pack(f.source.assets[0].pixels),start(62));f.assignments=[f.assignments[0]];f=rebuiltFixture(f);
 const p=build(f),edited=p.bytes.slice(),at=start(p.metadataSlots[0])+64+6;new DataView(edited.buffer).setUint16(at,0);
 rejected(()=>f.codec.inspect(edited,'test',options(f,p)));assert.deepEqual(f.original.subarray(start(62),start(63)),pack(f.source.assets[0].pixels));
});
test('the full reference hash prevents metadata references and unrelated new-slot use',()=>{
 const f=fixture(),p=build(f),refs=currentRefs(f.unitReferences,p);
 for(const iconId of[p.metadataSlots[0],p.newIconSlots[0]])rejected(()=>f.codec.inspect(p.bytes,'test',{source:f.source,unitReferences:refs.map(r=>r.recordIndex===1?{...r,iconId}:r)}));
 rejected(()=>f.codec.inspect(p.bytes,'test',{source:f.source,unitReferences:refs.filter(r=>r.recordIndex!==430)}));
 rejected(()=>f.codec.inspect(p.bytes,'test',{source:f.source,unitReferences:refs.map(r=>r.recordIndex===430?{...r,iconId:1}:r)}));
 rejected(()=>f.codec.inspect(p.bytes,'test',{source:f.source,unitReferences:[...refs,{recordIndex:2,iconId:2}]}));
});
test('original palette, old icons, new icons, header, hash and padding tampering are rejected',()=>{
 const f=fixture(),p=build(f),base=start(p.metadataSlots[0]);
 for(const at of[0,start(5),start(p.newIconSlots[0]),base+8,base+20,base+22,base+24,base+56,base+64,base+127]){
  const edited=p.bytes.slice();edited[at]^=1;rejected(()=>f.codec.inspect(edited,'test',options(f,p)));
 }
 const changed=f.original.slice();changed[0]^=1;rejected(()=>f.codec.build(changed,'test',{source:f.source,unitReferences:f.unitReferences,assignments:f.assignments}));
});
test('duplicate, inherited, sparse, missing and mismatched assignments fail atomically',()=>{
 const f=fixture(),before=f.original.slice();
 for(const assignments of[[...f.assignments,f.assignments[0]],new Array(1),[Object.create(f.assignments[0])],
 [{...f.assignments[0],unitRecordIndex:0}],[{...f.assignments[0],unitRecordIndex:512}],
 [{...f.assignments[0],fromIconId:2}],[{...f.assignments[0],assetId:'icon:512'}]])rejected(()=>build(f,{assignments}));
 rejected(()=>build(f,{unitReferences:[...f.unitReferences,f.unitReferences[0]]}));rejected(()=>build(f,{unitReferences:new Array(2)}));assert.deepEqual(f.original,before);
});
test('existing picture reuse succeeds with only one metadata slot free',()=>{
 const original=new Uint8Array(MAP_ICON_PATCH_BYTES);original.fill(0x11,128,start(511));
 const source={sourceId:'srw4-jp-rev1',transformRevision:MAP_ICON_PATCH_TRANSFORM_REVISION,assets:[{assetId:'icon:1',pixels:new Uint8Array(256).fill(1)}]};
 const unitReferences=[{recordIndex:1,iconId:1},{recordIndex:2,iconId:2}],assignments=[{unitRecordIndex:2,fromIconId:2,assetId:'icon:1'}];
 const f={original,source,unitReferences,assignments,...makeCodec(original,source)},p=build(f);assert.deepEqual(p.metadataSlots,[511]);assert.deepEqual(p.newIconSlots,[]);assert.equal(p.unitOverrides[0].iconId,0,'lowest nonempty existing icon is deterministic');assert.deepEqual(reopen(f,p).original,original);
});
test('occupied or referenced blank slots are never sacrificed for metadata or new pictures',()=>{
 let f=fixture();f.original.fill(1,start(319));f=rebuiltFixture(f);const before=f.original.slice();rejected(()=>build(f));assert.deepEqual(f.original,before);
 let g=fixture();g.original.fill(1,start(319));g.original.fill(0,start(511),start(512));g=rebuiltFixture(g);rejected(()=>build(g));
});
test('maximum recovery ledger stays within contiguous blank metadata slots and reopens exactly',()=>{
 const f=fixture(),ledger=Uint8Array.from({length:2048},(_,i)=>i&255),p=build(f,{recoveryLedger:ledger});assert.equal(p.metadataSlots.length,17);assert.deepEqual(reopen(f,p).recoveryLedger,ledger);
 rejected(()=>build(f,{recoveryLedger:new Uint8Array(2049)}));rejected(()=>build(f,{recoveryLedger:[]}));
});
test('input order cannot affect slot choice, compact metadata or source recovery',()=>{
 const f=fixture(),a=build(f),b=build(f,{assignments:[...f.assignments].reverse(),unitReferences:[...f.unitReferences].reverse(),source:{...f.source,assets:[...f.source.assets].reverse()}});
 assert.deepEqual(a.bytes,b.bytes);assert.deepEqual(a.unitOverrides,b.unitOverrides);
});
test('a source picture that looks like SRWKOM02 cannot create an ambiguous bank',()=>{
 const f=fixture(),magic=new TextEncoder().encode('SRWKOM02');magic.forEach((n,i)=>{f.source.assets[0].pixels[i*2]=n>>>4;f.source.assets[0].pixels[i*2+1]=n&15;});
 rejected(()=>build(rebuiltFixture(f)));
});
test('V1 remains unchanged and each edited envelope is explicitly version-specific',()=>{
 const f=fixture(),source={...f.source,assets:[{assetId:'s-gundam',pixels:pixels(1)}]},assignments=f.assignments.filter(e=>e.assetId==='s-gundam');
 const auth=makeCodec(f.original,source),v1=createV1({profiles:auth.profiles,validateSource:auth.validateSource}),v2=auth.codec;
 const request={source,assignments,unitReferences:f.unitReferences},a=v1.build(f.original,'test',request),b=v2.build(f.original,'test',request),ar={source,unitReferences:currentRefs(f.unitReferences,a)},br={source,unitReferences:currentRefs(f.unitReferences,b)};
 assert.equal(a.version,1);assert.equal(b.version,2);assert.equal(a.metadataSlots.length,2);assert.equal(b.metadataSlots.length,1);
 assert.deepEqual(v1.inspect(a.bytes,'test',ar).original,f.original);assert.deepEqual(v2.inspect(b.bytes,'test',br).original,f.original);
 rejected(()=>v1.inspect(b.bytes,'test',br));rejected(()=>v2.inspect(a.bytes,'test',ar));
});
