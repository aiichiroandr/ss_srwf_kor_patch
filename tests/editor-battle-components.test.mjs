import test from 'node:test';
import assert from 'node:assert/strict';
import {compressTsr,decompressTsr} from '../assets/editor-core.mjs';
import {Sha256} from '../assets/sha256.mjs';
import {createBattleComponentCodec} from '../assets/editor-battle-components.mjs';
import {makeBattleSourceDelta,restoreBattleSourceDelta} from '../assets/editor-battle-source-delta.mjs';
const hash=b=>new Sha256().update(b).hex();
async function fixture(){
 const records=[];
 for(let id=0;id<8;id++){
  const raw=new Uint8Array(134),v=new DataView(raw.buffer);v.setUint16(0,2);v.setUint32(34,16);
  for(let part=0;part<2;part++){const at=2+part*16;v.setUint32(at,72+part*32);v.setUint16(at+8,8);v.setUint16(at+10,8);v.setInt16(at+12,4);v.setInt16(at+14,4);}
  for(let i=0;i<16;i++)v.setUint16(38+i*2,i*67);
  raw.fill(id===3?0x22:0x11,70,102);raw.fill(id===4?0x12:0,102);
  const compressed=await compressTsr(raw),record=new Uint8Array(2+compressed.length);record.set([0x70,0x58]);record.set(compressed,2);records.push(record);
 }
 const original=new Uint8Array(64+records.reduce((n,r)=>n+r.length,0)),v=new DataView(original.buffer);let cursor=64;
 records.forEach((r,id)=>{v.setInt32(id*8,cursor-id*8);v.setInt32(id*8+4,cursor+r.length-id*8-4);original.set(r,cursor);cursor+=r.length;});
 const profile={count:8,size:original.length,sha256:hash(original)},recipes=[{preset:'test-unit',graphic:3,parts:[{slot:1,sourceGraphic:4,sourceSlot:1,dx:2,dy:-3}]}];
 const codec=createBattleComponentCodec({decode:decompressTsr,encode:compressTsr,profiles:{test:profile},aliases:[[1,0],[2,0],[5,0],[6,0],[7,0]],recipes});
 return {original,codec,profile,recipes};
}
async function legacyPlan(original,codec){
 const records=Array.from({length:8},(_,id)=>codec.read(original,id)),positions=[],parts=[],seen=new Map();let cursor=64;
 const place=packed=>{const key=hash(packed);let p=seen.get(key);if(!p){p={start:cursor,end:cursor+packed.length};seen.set(key,p);parts.push({p,packed});cursor=p.end;}return p;};
 records.forEach(r=>positions.push(place(r.packed)));
 const raw=codec.compose(records[3],[{slot:1,sourceGraphic:4,sourceSlot:1,dx:2,dy:-3}],records),stream=await compressTsr(raw,{completeNearMatches:true}),packed=new Uint8Array(stream.length+2);
 packed.set(records[3].packed.subarray(0,2));packed.set(stream,2);positions[3]=place(packed);
 const out=new Uint8Array(original.length),d=new DataView(out.buffer),at=out.length-16-24;
 assert.ok(cursor<=at);parts.forEach(({p,packed})=>out.set(packed,p.start));positions.forEach((p,id)=>{d.setInt32(id*8,p.start-id*8);d.setInt32(id*8+4,p.end-id*8-4);});
 d.setUint16(at,1);d.setUint16(at+2,8);d.setUint32(at+4,cursor);records.forEach((r,id)=>d.setUint16(at+8+id*2,r.packed.length));
 out.set(new TextEncoder().encode('SRWBCP01'),out.length-16);d.setUint32(out.length-8,24);d.setUint32(out.length-4,1);return out;
}
test('component export preserves the source body, exact source recovery and fixed file length',async()=>{
 const {codec,original}=await fixture(),before=codec.read(original,3),source=codec.read(original,4),plan=await codec.build(original,'test',1);
 assert.equal(plan.bytes.length,original.length);assert.ok(plan.remaining>=0);
 const after=codec.read(plan.bytes,3);assert.deepEqual(after.parts[0].pixels,before.parts[0].pixels);assert.deepEqual(after.parts[0].palette,before.parts[0].palette);
 assert.deepEqual(after.parts[1].pixels,source.parts[1].pixels);assert.equal(after.parts[1].x,6);assert.equal(after.parts[1].y,1);
 for(const id of [0,1,2,4,5,6,7])assert.deepEqual(codec.read(plan.bytes,id).raw,codec.read(original,id).raw);
 const reopened=await codec.inspect(plan.bytes,'test');assert.equal(reopened.mask,1);assert.deepEqual(reopened.original,original);
 const again=await codec.build(reopened.original,'test',1);assert.deepEqual(again.bytes,plan.bytes);
 assert.deepEqual((await codec.build(reopened.original,'test',0)).bytes,original);
 assert.equal(codec.maskFor([{preset:'test-unit'}]),1);
});
test('component import rejects a changed original, replacement, ledger or padding without widening provenance',async()=>{
 const {codec,original}=await fixture(),plan=await codec.build(original,'test',1);
 const chosen=codec.read(plan.bytes,3);
 for(const at of [64,chosen.start+3,plan.bytes.length-17,plan.bytes.length-1]){
  const changed=plan.bytes.slice();changed[at]^=1;
  await assert.rejects(()=>codec.inspect(changed,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 }
 const other=original.slice();other[100]^=1;await assert.rejects(()=>codec.build(other,'test',1));
 await assert.rejects(()=>codec.build(original,'test',2));
});
test('component parser bounds each image and refuses replacing body slot zero',async()=>{
 const {codec,original}=await fixture();assert.throws(()=>codec.read(original,8));
 const bad=original.slice();new DataView(bad.buffer).setInt32(3*8,original.length);assert.throws(()=>codec.read(bad,3));
 const source=codec.read(original,4),target=codec.read(original,3),records=[];records[4]=source;
 assert.throws(()=>codec.compose(target,[{slot:0,sourceGraphic:4,sourceSlot:1,dx:0,dy:0}],records));
 assert.throws(()=>codec.compose(target,[{slot:1,sourceGraphic:4,sourceSlot:1,dx:129,dy:0}],records));
});
test('old v1 images recover the exact source and keep their bytes on a no-op save',async()=>{
 const {codec,original}=await fixture(),old=await legacyPlan(original,codec),opened=await codec.inspect(old,'test');
 assert.equal(opened.version,1);assert.deepEqual(opened.original,original);
 assert.deepEqual((await codec.build(opened.original,'test',1)).bytes,old);
 assert.deepEqual((await codec.build(opened.original,'test',0)).bytes,original);
 const fresh=await codec.build(original,'test',1);assert.equal(fresh.version,6);assert.notDeepEqual(fresh.bytes,old);
 const upgraded=await codec.build(opened.original,'test',1,{upgrade:true});assert.equal(upgraded.version,6);assert.deepEqual(upgraded.bytes,fresh.bytes);
 assert.deepEqual((await codec.inspect(upgraded.bytes,'test')).original,original);
 await assert.rejects(()=>codec.build(opened.original,'test',1,{upgrade:'yes'}),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});
test('v2/v3/v4/v5 source delta rejects changed metadata, copied ranges and extra instructions',()=>{
 const current=Uint8Array.from({length:4096},(_,i)=>i%251),source=new Uint8Array(4000);source.set(current.subarray(37,4037));source[205]=8;
 const delta=makeBattleSourceDelta(source,current);assert.ok(delta.length<100);assert.deepEqual(restoreBattleSourceDelta(current,delta,source.length),source);
 for(const malformed of [Uint8Array.from([1,0,8,255,255]),Uint8Array.from([0,0,0]),Uint8Array.from([2,0,1,0]),Uint8Array.from([...delta,0])])
  assert.throws(()=>restoreBattleSourceDelta(current,malformed,source.length),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 assert.throws(()=>restoreBattleSourceDelta(current,delta,source.length-1));
});

// v2, v3, v4 and v5 share the bounded source-delta container, but their marker and
// metadata versions must agree. This helper only changes that container tag;
// part-only synthetic fixtures have identical permitted artwork in both.
function withModernVersion(bytes,version){
 const out=bytes.slice(),d=new DataView(out.buffer),at=out.length-16-d.getUint32(out.length-8);
 out.set(new TextEncoder().encode(`SRWBCP0${version}`),out.length-16);d.setUint16(at,version);return out;
}
test('v1/v2/v3/v4/v5/v6 imports preserve no-op bytes and explicit upgrades use v6',async()=>{
 const {codec,original}=await fixture(),fresh=await codec.build(original,'test',1);
 const images=[await legacyPlan(original,codec),withModernVersion(fresh.bytes,2),withModernVersion(fresh.bytes,3),withModernVersion(fresh.bytes,4),withModernVersion(fresh.bytes,5),fresh.bytes];
 for(const [i,image]of images.entries()){
  const opened=await codec.inspect(image,'test');assert.equal(opened.version,i+1);assert.deepEqual(opened.original,original);
  const kept=await codec.build(opened.original,'test',1);assert.equal(kept.version,i+1);assert.deepEqual(kept.bytes,image);
  assert.deepEqual((await codec.build(opened.original,'test',0)).bytes,original);
  const upgraded=await codec.build(opened.original,'test',1,{upgrade:true});assert.equal(upgraded.version,6);assert.deepEqual(upgraded.bytes,fresh.bytes);
  assert.deepEqual((await codec.inspect(upgraded.bytes,'test')).original,original);
 }
 for(const version of [2,3,4,5,6]){
  const changed=withModernVersion(fresh.bytes,version),d=new DataView(changed.buffer),at=changed.length-16-d.getUint32(changed.length-8);
  d.setUint16(at,version===2?3:2);
  await assert.rejects(()=>codec.inspect(changed,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 }
});
async function aircraftFixture(){
 const raws=[],packed=[];
 for(let id=0;id<341;id++){
  const raw=new Uint8Array(278),d=new DataView(raw.buffer);d.setUint16(0,5);d.setUint32(82,16);
  for(let i=0;i<16;i++)d.setUint16(86+i*2,i*(id===306?71:67));
  for(let part=0;part<5;part++){
   const at=2+part*16;d.setUint32(at,120+part*32);d.setUint16(at+8,8);d.setUint16(at+10,8);d.setInt16(at+12,4);d.setInt16(at+14,4);
   raw.fill(id===310?0x77:0x11,118+part*32,150+part*32);
  }
  raws.push(raw);const stream=await compressTsr(raw),record=new Uint8Array(stream.length+2);record.set([0x70,0x58]);record.set(stream,2);packed.push(record);
 }
 const original=new Uint8Array(341*8+packed.reduce((n,p)=>n+p.length,0)),d=new DataView(original.buffer);let cursor=341*8;
 packed.forEach((record,id)=>{d.setInt32(id*8,cursor-id*8);d.setInt32(id*8+4,cursor+record.length-id*8-4);original.set(record,cursor);cursor+=record.length;});
 const visiblePaletteSha256=hash(raws[306].subarray(88,118)),art={};
 for(const [i,key]of ['gCruiser','gAttacker','gBomber','gCore'].entries()){
  const pixels=new Uint8Array(32).fill((i+2)*17);
  art[key]={width:8,height:8,x:4+i,y:4,paletteSourceGraphic:306,visiblePaletteSha256,pixels:Buffer.from(pixels).toString('base64'),pixelSha256:hash(pixels)};
 }
 const recipes=[{preset:'g-cruiser',graphic:340,parts:[],created:'gcruiser-v4'},{preset:'g-attacker',graphic:295,parts:[],created:'gAttacker'},
  {preset:'g-bomber',graphic:296,parts:[],created:'gBomber'},{preset:'g-core',graphic:310,parts:[],created:'gCore'}];
 const options={decode:decompressTsr,encode:compressTsr,profiles:{test:{count:341,size:original.length,sha256:hash(original)}},
  aliases:Array.from({length:340},(_,i)=>i+1).filter(id=>![306,310].includes(id)).map(id=>[id,0]),recipes,aircraftArt:art};
 const artV3=Object.fromEntries(Object.entries(art).map(([key,a],i)=>{const pixels=new Uint8Array(32).fill((i+7)*17);return [key,{...a,pixels:Buffer.from(pixels).toString('base64'),pixelSha256:hash(pixels)}];}));
 const artV4=Object.fromEntries(Object.entries(art).map(([key,a],i)=>{const pixels=new Uint8Array(32).fill((i+11)*17);return [key,{...a,pixels:Buffer.from(pixels).toString('base64'),pixelSha256:hash(pixels)}];}));
 options.aircraftArtV3=artV3;options.aircraftArtV4=artV4;
 return {original,options,art,artV3,artV4,codec:createBattleComponentCodec(options)};
}
test('v5 aircraft use their pinned palette and preserve all four bodies through source recovery',async()=>{
 const {codec,original,art}=await aircraftFixture(),plan=await codec.build(original,'test',15);
 assert.equal(plan.version,6);assert.equal(plan.bytes.length,original.length);assert.ok(plan.remaining>=0);
 for(const [graphic,key]of [[340,'gCruiser'],[295,'gAttacker'],[296,'gBomber'],[310,'gCore']]){
  const body=codec.read(plan.bytes,graphic).parts[0],asset=art[key];
  assert.equal(hash(body.pixels),asset.pixelSha256);assert.equal(hash(body.palette.subarray(2)),asset.visiblePaletteSha256);
  assert.equal(body.x,asset.x);assert.equal(body.y,asset.y);
  assert.notDeepEqual(body.pixels,codec.read(original,graphic).parts[0].pixels);
 }
 const opened=await codec.inspect(plan.bytes,'test');assert.deepEqual(opened.original,original);
 assert.deepEqual((await codec.build(opened.original,'test',15)).bytes,plan.bytes);
 assert.deepEqual((await codec.build(opened.original,'test',0)).bytes,original);
});
test('new aircraft art cannot silently replace legacy v2 artwork or bypass a palette pin',async()=>{
 const {codec,original,options,art}=await aircraftFixture(),oldFixture=await codec.build(original,'test',1);
 // v1 canonical construction uses the frozen old G-Cruiser drawing. Construct
 // that original container explicitly, then retagging alone must not turn its
 // pixels into valid current art (and vice versa).
 // Synthetic stand-in for the v1/v2 drawn G-Cruiser (the drawing itself is no longer shipped).
 const legacyPixels=new Uint8Array(32).fill(0x99),legacyCruiserArt={width:8,height:8,x:4,y:4,pixels:Buffer.from(legacyPixels).toString('base64'),pixelSha256:hash(legacyPixels)};
 const oldCodec=createBattleComponentCodec({...options,legacyCruiserArt,recipes:[options.recipes[0]]});
 // Use the genuine v1 builder format with the complete synthetic archive.
 const records=Array.from({length:341},(_,id)=>oldCodec.read(original,id)),positions=[],parts=[],seen=new Map();let cursor=341*8;
 const place=record=>{const key=hash(record);let p=seen.get(key);if(!p){p={start:cursor,end:cursor+record.length};seen.set(key,p);parts.push({p,record});cursor=p.end;}return p;};
 records.forEach(record=>positions.push(place(record.packed)));const sourceEnd=cursor;
 // Legacy G-Cruiser pixels are deliberately distinct from the current fixture.
 const legacyArt=legacyCruiserArt,pixels=Buffer.from(legacyArt.pixels,'base64');
 const raw=new Uint8Array(118+pixels.length+128),rd=new DataView(raw.buffer);rd.setUint16(0,5);rd.setUint32(82,16);raw.set(records[1].parts[0].palette,86);let pixelAt=118;
 for(let i=0;i<5;i++){const at=2+i*16;raw.set(records[8].parts[i].header,at);rd.setUint32(at,pixelAt+2);raw[at+7]=0;
  rd.setUint16(at+8,i?8:legacyArt.width);rd.setUint16(at+10,i?8:legacyArt.height);rd.setInt16(at+12,i?4:legacyArt.x);rd.setInt16(at+14,i?4:legacyArt.y);
  if(!i)raw.set(pixels,pixelAt);pixelAt+=i?32:pixels.length;}
 const stream=await compressTsr(raw,{completeNearMatches:true}),record=new Uint8Array(stream.length+2);record.set([0x70,0x58]);record.set(stream,2);positions[340]=place(record);
 const old=new Uint8Array(original.length),d=new DataView(old.buffer),metadataLength=8+341*2,at=old.length-16-metadataLength;
 assert.ok(cursor<=at);parts.forEach(({p,record})=>old.set(record,p.start));positions.forEach((p,id)=>{d.setInt32(id*8,p.start-id*8);d.setInt32(id*8+4,p.end-id*8-4);});
 d.setUint16(at,1);d.setUint16(at+2,341);d.setUint32(at+4,cursor);records.forEach((r,id)=>d.setUint16(at+8+id*2,r.packed.length));
 old.set(new TextEncoder().encode('SRWBCP01'),old.length-16);d.setUint32(old.length-8,metadataLength);d.setUint32(old.length-4,1);
 const legacyV2=new Uint8Array(old.length),v2d=new DataView(legacyV2.buffer),v2Length=14+341*2,v2At=old.length-16-v2Length;
 assert.ok(cursor<=v2At);legacyV2.set(old.subarray(0,cursor));v2d.setUint16(v2At,2);v2d.setUint16(v2At+2,341);v2d.setUint32(v2At+4,cursor);v2d.setUint32(v2At+8,sourceEnd);
 records.forEach((r,id)=>v2d.setUint16(v2At+12+id*2,r.packed.length));v2d.setUint16(v2At+12+341*2,0);
 legacyV2.set(new TextEncoder().encode('SRWBCP02'),old.length-16);v2d.setUint32(old.length-8,v2Length);v2d.setUint32(old.length-4,1);
 for(const [i,image]of [old,legacyV2].entries()){
  const opened=await oldCodec.inspect(image,'test');assert.equal(opened.version,i+1);assert.deepEqual(opened.original,original);
  assert.deepEqual((await oldCodec.build(opened.original,'test',1)).bytes,image);
  assert.deepEqual((await oldCodec.build(opened.original,'test',0)).bytes,original);
 }
 const opened=await oldCodec.inspect(legacyV2,'test'),newPlan=await oldCodec.build(opened.original,'test',1,{upgrade:true});assert.equal(newPlan.version,6);assert.notDeepEqual(newPlan.bytes,old);
 assert.equal(hash(oldCodec.read(newPlan.bytes,340).parts[0].pixels),art.gCruiser.pixelSha256);
 const allCodec=createBattleComponentCodec({...options,legacyCruiserArt}),allCodecOpened=await allCodec.inspect(legacyV2,'test'),expanded=await allCodec.build(allCodecOpened.original,'test',15);
 assert.equal(expanded.version,6);assert.deepEqual((await allCodec.inspect(expanded.bytes,'test')).original,original);
 const forged=withModernVersion(oldFixture.bytes,2);await assert.rejects(()=>codec.inspect(forged,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 for(const asset of [{...art.gCruiser,paletteSourceGraphic:0},{...art.gCruiser,visiblePaletteSha256:'0'.repeat(64)},{...art.gCruiser,paletteSourceGraphic:341}]){
  const bad=createBattleComponentCodec({...options,aircraftArt:{...art,gCruiser:asset}});
  await assert.rejects(()=>bad.build(original,'test',1),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 }
});

test('v3 aircraft keep their old pixels on no-op saves while explicit upgrades use current v5 art',async()=>{
 const {codec,original,options,art,artV3}=await aircraftFixture();
 const v3Writer=createBattleComponentCodec({...options,aircraftArt:artV3}),tagged=withModernVersion((await v3Writer.build(original,'test',15)).bytes,3);
 const opened=await codec.inspect(tagged,'test');assert.equal(opened.version,3);assert.deepEqual(opened.original,original);
 const noOp=await codec.build(opened.original,'test',15);assert.equal(noOp.version,3);assert.deepEqual(noOp.bytes,tagged);
 const upgraded=await codec.build(opened.original,'test',15,{upgrade:true});assert.equal(upgraded.version,6);assert.notDeepEqual(upgraded.bytes,tagged);
 for(const [graphic,key]of [[340,'gCruiser'],[295,'gAttacker'],[296,'gBomber'],[310,'gCore']]){
  assert.equal(hash(codec.read(noOp.bytes,graphic).parts[0].pixels),artV3[key].pixelSha256);
  assert.equal(hash(codec.read(upgraded.bytes,graphic).parts[0].pixels),art[key].pixelSha256);
 }
 assert.deepEqual((await codec.inspect(upgraded.bytes,'test')).original,original);
 assert.deepEqual((await codec.build(opened.original,'test',0)).bytes,original);
 const subset=await codec.inspect(withModernVersion((await v3Writer.build(original,'test',1)).bytes,3),'test');
 assert.equal((await codec.build(subset.original,'test',15)).version,6);
 await assert.rejects(()=>codec.inspect(withModernVersion(tagged,4),'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});

test('v4 aircraft retain their pixels and dimensions until an explicit current-art upgrade',async()=>{
 const {codec,original,options,art,artV4}=await aircraftFixture(),writer=createBattleComponentCodec({...options,aircraftArt:artV4});
 const old=withModernVersion((await writer.build(original,'test',15)).bytes,4),opened=await codec.inspect(old,'test');
 assert.equal(opened.version,4);assert.deepEqual(opened.original,original);assert.deepEqual((await codec.build(opened.original,'test',15)).bytes,old);
 const upgraded=await codec.build(opened.original,'test',15,{upgrade:true});assert.equal(upgraded.version,6);
 for(const [graphic,key]of [[340,'gCruiser'],[295,'gAttacker'],[296,'gBomber'],[310,'gCore']]){
  assert.equal(hash(codec.read(old,graphic).parts[0].pixels),artV4[key].pixelSha256);
  assert.equal(hash(codec.read(upgraded.bytes,graphic).parts[0].pixels),art[key].pixelSha256);
 }
 assert.deepEqual((await codec.inspect(upgraded.bytes,'test')).original,original);
 await assert.rejects(()=>codec.inspect(withModernVersion(old,5),'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});

test('v5 Ex-S body patches pin the original pixels and palette while preserving all other parts',async()=>{
 const {original,options,codec:reader}=await aircraftFixture(),before=reader.read(original,306),pixels=before.parts[0].pixels.slice();pixels[0]=0x22;pixels[16]=0x33;
 const body=before.parts[0],patch={width:body.width,height:body.height,x:body.x,y:body.y,sourcePixelSha256:hash(body.pixels),pixelSha256:hash(pixels),visiblePaletteSha256:hash(body.palette.subarray(2)),patches:[[0,1,'22'],[16,1,'33']]};
 const recipe={preset:'ex-s-gundam',graphic:306,bodyPatch:'exs-forward',parts:[]},make=exsForwardPatch=>createBattleComponentCodec({...options,recipes:[recipe],exsForwardPatch});
 const codec=make(patch),plan=await codec.build(original,'test',1),after=codec.read(plan.bytes,306);assert.equal(plan.version,6);assert.equal(plan.bytes.length,original.length);
 assert.deepEqual(after.parts[0].pixels,pixels);assert.deepEqual(after.parts[0].palette,body.palette);
 for(let i=1;i<5;i++)assert.deepEqual(after.parts[i],before.parts[i]);
 const reopened=await codec.inspect(plan.bytes,'test');assert.deepEqual(reopened.original,original);assert.deepEqual((await codec.build(reopened.original,'test',1)).bytes,plan.bytes);
 for(const bad of [{...patch,sourcePixelSha256:'0'.repeat(64)},{...patch,visiblePaletteSha256:'0'.repeat(64)},{...patch,patches:[[0,1,'33']]},{...patch,pixelSha256:'0'.repeat(64)},{...patch,patches:[[-1,1,'22']]}])
  await assert.rejects(()=>make(bad).build(original,'test',1),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});


test('public recipe bits stay stable and S cruiser conflicts with the old split G attacker',async()=>{
 const {BATTLE_COMPONENT_RECIPES}=await import('../assets/editor-battle-components.mjs');
 assert.deepEqual(BATTLE_COMPONENT_RECIPES.map(r=>r.preset),['s-gundam','ex-s-gundam','sirbine','zwauss','g-cruiser','g-attacker','g-bomber','g-core','s-g-cruiser']);
 const codec=createBattleComponentCodec({decode:decompressTsr,encode:compressTsr});
 assert.equal(codec.maskFor([{preset:'s-g-cruiser'},{preset:'g-cruiser'}]),(1<<8)|(1<<4));
 assert.throws(()=>codec.maskFor([{preset:'s-g-cruiser'},{preset:'g-attacker'}]),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});
test('v6 S and Ex-S cruiser slots share only authored pixels and preserve exact source provenance',async()=>{
 const {original,options,art}=await aircraftFixture();
 const recipes=[{preset:'s-g-cruiser',graphic:295,parts:[],created:'s-gcruiser-v6'},
  {preset:'g-cruiser',graphic:340,parts:[],created:'gcruiser-v4'},
  {preset:'g-attacker',graphic:295,parts:[],created:'gAttacker'}];
 const codec=createBattleComponentCodec({...options,recipes}),mask=codec.maskFor([{preset:'s-g-cruiser'},{preset:'g-cruiser'}]),plan=await codec.build(original,'test',mask);
 assert.equal(plan.version,6);assert.equal(plan.bytes.length,original.length);assert.ok(plan.remaining>=0);
 assert.equal(new TextDecoder().decode(plan.bytes.subarray(-16,-8)),'SRWBCP06');
 for(const id of [295,340]){
  const body=codec.read(plan.bytes,id).parts[0];assert.equal(hash(body.pixels),art.gCruiser.pixelSha256);
  assert.equal(hash(body.palette.subarray(2)),art.gCruiser.visiblePaletteSha256);assert.deepEqual([body.x,body.y],[art.gCruiser.x,art.gCruiser.y]);
 }
 for(const id of [0,1,8,306,310])assert.deepEqual(codec.read(plan.bytes,id).raw,codec.read(original,id).raw);
 const reopened=await codec.inspect(plan.bytes,'test');assert.deepEqual(reopened.original,original);
 assert.deepEqual((await codec.build(reopened.original,'test',mask)).bytes,plan.bytes);
 assert.deepEqual((await codec.build(reopened.original,'test',0)).bytes,original);
 for(const version of [2,3,4,5])await assert.rejects(()=>codec.inspect(withModernVersion(plan.bytes,version),'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 await assert.rejects(()=>codec.build(original,'test',5),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
 const at=codec.read(plan.bytes,295).start+3,changed=plan.bytes.slice();changed[at]^=1;
 await assert.rejects(()=>codec.inspect(changed,'test'),e=>e.code==='EDITOR_BATTLE_COMPONENT_INVALID');
});


test('v5 authored aircraft remain byte-identical on no-op save after the v6 dual-slot extension',async()=>{
 const {codec,original}=await aircraftFixture(),current=await codec.build(original,'test',15);
 const old=withModernVersion(current.bytes,5),state=await codec.inspect(old,'test');
 assert.equal(state.version,5);assert.deepEqual(state.original,original);
 assert.deepEqual((await codec.build(state.original,'test',15)).bytes,old);
 const upgraded=await codec.build(state.original,'test',15,{upgrade:true});assert.equal(upgraded.version,6);
 for(const id of [295,296,310,340])assert.deepEqual(codec.read(upgraded.bytes,id).raw,codec.read(old,id).raw);
 assert.deepEqual((await codec.build(state.original,'test',0)).bytes,original);
});
