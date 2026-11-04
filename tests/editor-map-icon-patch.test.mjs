import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../assets/sha256.mjs';
import {createMapIconPatchCodec,MAP_ICON_PATCH_BYTES,MAP_ICON_PATCH_TRANSFORM_REVISION} from '../assets/editor-map-icon-patch.mjs';
import {readMapIcons,decodeMapIcon} from '../assets/editor-map-icons.mjs';

const start=id=>128+id*128;
function fixture(){
 const original=new Uint8Array(MAP_ICON_PATCH_BYTES);
 for(let i=0;i<128;i++)original[i]=i;
 for(let id=1;id<319;id++)original.fill((id%255)||255,start(id),start(id)+128);
 const assets=[['s-gundam',1],['exs-gundam',2],['s-gcruiser',3]].map(([assetId,n])=>({assetId,pixels:Uint8Array.from({length:256},(_,i)=>(i+n)%16)}));
 const source={sourceId:'srw4-jp-rev1',transformRevision:MAP_ICON_PATCH_TRANSFORM_REVISION,assets};
 const unitReferences=[{recordIndex:0,iconId:0},{recordIndex:1,iconId:1},{recordIndex:430,iconId:1},{recordIndex:431,iconId:8},{recordIndex:432,iconId:1},{recordIndex:50,iconId:319}];
 const assignments=[{unitRecordIndex:430,fromIconId:1,assetId:'s-gundam'},
  {unitRecordIndex:431,fromIconId:8,assetId:'s-gcruiser'},{unitRecordIndex:432,fromIconId:1,assetId:'s-gundam'}];
 const profiles={test:{sha256:sha256Hex(original)}};
 const validateSource=s=>s.sourceId===source.sourceId&&s.transformRevision===source.transformRevision
  &&s.assets.every(a=>source.assets.some(e=>e.assetId===a.assetId&&sha256Hex(e.pixels)===sha256Hex(a.pixels)));
 const codec=createMapIconPatchCodec({profiles,validateSource});
 return {original,source,assignments,unitReferences,profiles,validateSource,codec};
}
function currentRefs(refs,plan){return refs.map(r=>({...r,iconId:plan.unitOverrides.find(e=>e.unitRecordIndex===r.recordIndex)?.iconId??r.iconId}));}
function build(f,overrides={}){return f.codec.build(f.original,'test',{source:f.source,assignments:f.assignments,unitReferences:f.unitReferences,...overrides});}
const rejected=fn=>assert.throws(fn,{code:'EDITOR_MAP_ICON_PATCH_INVALID'});

test('decoded planner reserves only unreferenced blank slots and preserves all original icons and palettes',()=>{
 const f=fixture(),before=f.original.slice(),plan=build(f);
 assert.deepEqual(f.original,before);assert.equal(plan.bytes.length,MAP_ICON_PATCH_BYTES);
 assert.equal(plan.version,1);assert.equal(plan.sourceId,'srw4-jp-rev1');
 assert.equal(plan.unitOverrides.length,3);assert.equal(plan.iconSlots.length,2,'same verified asset shares one new icon');
 assert.equal(plan.unitOverrides[0].iconId,320,'referenced zero icon 319 remains untouched');
 assert.equal(plan.unitOverrides[0].iconId,plan.unitOverrides[2].iconId);
 assert.deepEqual(plan.metadataSlots,[510,511]);
 assert.deepEqual(plan.bytes.subarray(0,start(319)),f.original.subarray(0,start(319)));
 for(let id=0;id<512;id++)if(!plan.reservedSlots.includes(id))assert.deepEqual(plan.bytes.subarray(start(id),start(id)+128),f.original.subarray(start(id),start(id)+128));
 const bytes=plan.bytes.subarray(start(plan.unitOverrides[0].iconId),start(plan.unitOverrides[0].iconId)+128);
 assert.equal(bytes[0],0x12,'high nibble is the left pixel');
 const bank=readMapIcons(plan.bytes),rgba=decodeMapIcon(bank,plan.unitOverrides[0].iconId,'player');assert.equal(rgba.length,1024);
});
test('exact reconstruction proves original decoded bytes and canonical edited bytes',()=>{
 const f=fixture(),plan=build(f),refs=currentRefs(f.unitReferences,plan);
 const parsed=f.codec.inspect(plan.bytes,'test',{source:f.source,unitReferences:refs});
 assert.deepEqual(parsed.bytes,plan.bytes);assert.deepEqual(parsed.original,f.original);assert.deepEqual(parsed.unitOverrides,plan.unitOverrides);
 assert.notEqual(parsed.original,f.original);assert.notEqual(parsed.bytes,plan.bytes);
 assert.equal(sha256Hex(parsed.original),f.profiles.test.sha256);
});
test('native original banks remain readable without any optional ROM source',()=>{
 const f=fixture(),codec=createMapIconPatchCodec({profiles:f.profiles});
 const parsed=codec.inspect(f.original,'test');assert.equal(parsed.version,0);assert.deepEqual(parsed.reservedSlots,[]);
 assert.deepEqual(parsed.original,f.original);
 const unchanged=codec.build(f.original,'test',{unitReferences:f.unitReferences,assignments:[]});assert.deepEqual(unchanged.bytes,f.original);
});
test('no caller-owned verifier binding means arbitrary source pixels are refused',()=>{
 const f=fixture(),codec=createMapIconPatchCodec({profiles:f.profiles});
 rejected(()=>codec.build(f.original,'test',{source:f.source,assignments:f.assignments,unitReferences:f.unitReferences}));
 const plan=build(f);rejected(()=>codec.inspect(plan.bytes,'test',{source:f.source,unitReferences:currentRefs(f.unitReferences,plan)}));
 for(const source of [{...f.source,sourceId:'constructor'},{...f.source,sourceId:'srw4-jp'},{...f.source,transformRevision:'future'},
  {...f.source,assets:[{...f.source.assets[0],pixels:new Uint8Array(256)}]},
  {...f.source,assets:[{...f.source.assets[0],pixels:new Uint8Array(256).fill(16)}]}])rejected(()=>build(f,{source}));
});
test('both exact source revision and regenerated pixels are needed to reopen',()=>{
 const f=fixture(),plan=build(f),unitReferences=currentRefs(f.unitReferences,plan);
 rejected(()=>f.codec.inspect(plan.bytes,'test',{unitReferences}));
 rejected(()=>f.codec.inspect(plan.bytes,'test',{source:{...f.source,sourceId:'srw4-jp'},unitReferences}));
 const modified={...f.source,assets:f.source.assets.map(a=>({...a,pixels:a.pixels.slice()}))};modified.assets[0].pixels[0]^=1;
 rejected(()=>f.codec.inspect(plan.bytes,'test',{source:modified,unitReferences}));
});
test('icon, palette, ledger, reserved padding and source modifications are rejected',()=>{
 const f=fixture(),plan=build(f),options={source:f.source,unitReferences:currentRefs(f.unitReferences,plan)};
 for(const at of [0,start(5),start(plan.iconSlots[0]),start(plan.metadataSlots[0])+20,start(plan.metadataSlots[0])+56,
  start(plan.metadataSlots[0])+128+7,start(plan.metadataSlots[1])+127]){
  const bytes=plan.bytes.slice();bytes[at]^=1;rejected(()=>f.codec.inspect(bytes,'test',options));
 }
 const badSource=f.original.slice();badSource[0]^=1;rejected(()=>f.codec.build(badSource,'test',{source:f.source,assignments:f.assignments,unitReferences:f.unitReferences}));
});
test('metadata can never be referenced and unrelated units cannot acquire reserved new icons',()=>{
 const f=fixture(),plan=build(f),refs=currentRefs(f.unitReferences,plan);
 for(const iconId of [plan.metadataSlots[0],plan.iconSlots[0]]){
  const changed=refs.map(r=>r.recordIndex===1?{...r,iconId}:r);
  rejected(()=>f.codec.inspect(plan.bytes,'test',{source:f.source,unitReferences:changed}));
 }
 const disconnected=refs.map(r=>r.recordIndex===430?{...r,iconId:1}:r);
 rejected(()=>f.codec.inspect(plan.bytes,'test',{source:f.source,unitReferences:disconnected}));
 rejected(()=>f.codec.inspect(plan.bytes,'test',{source:f.source,unitReferences:refs.filter(r=>r.recordIndex!==430)}));
});
test('unknown, duplicate, sparse, inherited and mismatched unit assignments fail atomically',()=>{
 const f=fixture(),before=f.original.slice();
 for(const assignments of [[...f.assignments,f.assignments[0]],new Array(1),
  [{unitRecordIndex:1,fromIconId:2,assetId:'s-gundam'}],
  [{unitRecordIndex:900,fromIconId:1,assetId:'s-gundam'}],
  [Object.create(f.assignments[0])],
  [{...f.assignments[0],assetId:'arbitrary'}]])rejected(()=>build(f,{assignments}));
 rejected(()=>build(f,{unitReferences:[...f.unitReferences,f.unitReferences[0]]}));
 rejected(()=>build(f,{unitReferences:new Array(2)}));
 assert.deepEqual(f.original,before);
});
test('occupied and referenced icons are never sacrificed when capacity is insufficient',()=>{
 const f=fixture(),original=f.original.slice();original.fill(1,start(319));
 const codec=createMapIconPatchCodec({profiles:{test:{sha256:sha256Hex(original)}},validateSource:f.validateSource});
 const before=original.slice();rejected(()=>codec.build(original,'test',{source:f.source,assignments:f.assignments,unitReferences:f.unitReferences}));assert.deepEqual(original,before);
 const almost=f.original.slice();almost.fill(1,start(319));almost.fill(0,start(510),start(512));
 const sparseCodec=createMapIconPatchCodec({profiles:{test:{sha256:sha256Hex(almost)}},validateSource:f.validateSource});
 rejected(()=>sparseCodec.build(almost,'test',{source:f.source,assignments:f.assignments,unitReferences:f.unitReferences}));
});
test('input ordering cannot alter the reserved layout or source-recovery bytes',()=>{
 const f=fixture(),first=build(f),second=build(f,{assignments:[...f.assignments].reverse(),unitReferences:[...f.unitReferences].reverse(),source:{...f.source,assets:[...f.source.assets].reverse()}});
 assert.deepEqual(first.bytes,second.bytes);assert.deepEqual(first.unitOverrides,second.unitOverrides);
});
test('an icon that mimics the ledger marker cannot produce an unopenable output',()=>{
 const f=fixture(),pixels=f.source.assets[0].pixels;
 const magic=new TextEncoder().encode('SRWKOM01');
 magic.forEach((value,i)=>{pixels[i*2]=value>>>4;pixels[i*2+1]=value&15;});
 rejected(()=>build(f));
});
