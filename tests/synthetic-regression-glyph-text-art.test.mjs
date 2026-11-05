// Synthetic regression pins for the glyph, title-logo, dictionary-portrait and
// save-name modules. Inputs are built here; the expected digests were taken from
// the tree before the shared byte helpers (bytesEqual, bytesToHex, hexToBytes,
// base64UrlToBytes) replaced the private copies. The title and dictionary data
// modules are swapped for synthetic ones through a resolve hook, so their
// authenticated positive paths run without any game data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as nodeModule from 'node:module';
import {createGlyphEditor,generateHangulGlyph} from '../assets/editor-glyphs.mjs';
import {EDITOR_GLYPH_PROFILES} from '../assets/editor-glyph-pools.mjs';
import {finalDefaultSaveName,finalDefaultSaveAlias} from '../assets/editor-save-name-defaults.mjs';
import {encodeEditorText} from '../assets/editor-text-codec.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=bytes=>Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('hex');
const glyphInvalid=message=>error=>error.code==='EDITOR_GLYPH_INVALID'&&(message===undefined||error.message===message);
function atOffset(bytes,pad=13){const buffer=new Uint8Array(bytes.length+pad*2).fill(0xa5);buffer.set(bytes,pad);return buffer.subarray(pad,pad+bytes.length);}
function flipped(bytes,at){const out=bytes.slice();out[at]^=1;return out;}

// A 90385-byte image with a 2816-cell glyph atlas at 256 and a small trusted pool from EC00.
function glyphFixture({cells=4,ink=false,gameId='srwf-f',baseline=null}={}){
 const source=new Uint8Array(256+2816*32+17);new DataView(source.buffer).setInt32(144,256-144);
 const pool=Array.from({length:cells},(_,i)=>{
  const code=(0xec00+i).toString(16).toUpperCase(),start=256+(256+i)*32;
  if(ink){source[start+i]=i+1;source[start+31]=0x82;}
  return {code,sha256:sha(source.subarray(start,start+32)),zero:!ink};
 });
 if(baseline)for(const e of baseline)if(/^[가-힣]$/u.test(e.unicode))source.set(generateHangulGlyph(e.unicode),256+(parseInt(e.code,16)-0xeb00)*32);
 const profile={gameId,baseSha256:'a'.repeat(64),atlasOffset:256,atlasBytes:2816*32,atlasSha256:sha(source.subarray(256,256+2816*32)),cells:pool};
 if(baseline)profile.baselineEntries=baseline;
 return {source,tools:createGlyphEditor([profile]),options:{gameId,baseSha256:'a'.repeat(64)}};
}

// Sparse XOR streams: varint gap, varint length, nonzero XOR bytes; base64url encoded.
function xorStream(edits){
 const out=[],varint=n=>{do{let b=n&127;n=Math.floor(n/128);if(n)b|=128;out.push(b);}while(n);};let end=0;
 for(const [start,bytes]of edits){varint(start-end);varint(bytes.length);out.push(...bytes);end=start+bytes.length;}
 return Buffer.from(out).toString('base64url');
}
function applyEdits(bytes,edits,at=0){const out=bytes.slice();for(const [start,values]of edits)values.forEach((x,i)=>{out[at+start+i]^=x;});return out;}
const PURPLE=[[3,[0xfb,0xff,0xbf,0x12]],[20,[1,2,3]]],RED=[[0,[0xff,0xff,0xff]],[30,[0x7e,0xfb,0xef]]],SHARED=[[5,[0x11,0xfb,0xef,0xbe,0xfb,0xef,0xbe]],[60,[0x3f,0xff]]];
const REV3=[[2,[0xfb,0xff]],[100,[0xbf,0xfe,0xfd]],[250,[0xff,0x3e]]],REV1=[[0,[0xfc,0x10]],[128,[0xff,0xff,0xbf]]],REV2=[[7,[0x3f,0xfb,0xef]],[200,[0x80]]];
// EFFECT-like container: BE32 table size at 0, start/end cells per bank, two adjacent slots.
function effectContainer(){
 const table=151*8,bytes=Uint8Array.from({length:table+40+64+100},(_,i)=>(i*29+7)&255),v=new DataView(bytes.buffer);
 v.setUint32(0,table);let at=table;
 for(const [bank,length]of [[95,40],[96,64]]){v.setUint32(bank*8,at-bank*8);v.setUint32(bank*8+4,at+length-bank*8-4);at+=length;}
 return bytes;
}
const SLOT0=151*8,SLOT1=SLOT0+40;
function titleData(purpleXor=xorStream(PURPLE)){
 const effect=effectContainer(),slot0=effect.slice(SLOT0,SLOT0+40),slot1=effect.slice(SLOT1,SLOT1+64);
 return {records:[
  {bank:95,length:40,originalSha256:sha(slot0),variants:{purple:{sha256:sha(applyEdits(slot0,PURPLE)),xor:purpleXor},red:{sha256:sha(applyEdits(slot0,RED)),xor:xorStream(RED)}}},
  {bank:96,length:64,originalSha256:sha(slot1),variants:{},shared:{sha256:sha(applyEdits(slot1,SHARED)),xor:xorStream(SHARED)}}]};
}
const ALLOCATION=Uint8Array.from({length:256},(_,i)=>(i*53+11)&255);
function dictionaryData(){
 return {profiles:[{id:'synthetic',extentLba:4321,originalBytes:200,fixedBytes:240,allocationBytes:256,originalAllocationBytes:256,
  originalSha256:sha(ALLOCATION),fixedSha256:sha(applyEdits(ALLOCATION,REV3)),xor:xorStream(REV3),
  previous:[{revision:1,fixedBytes:220,fixedSha256:sha(applyEdits(ALLOCATION,REV1)),xor:xorStream(REV1)},
   {revision:2,fixedBytes:230,fixedSha256:sha(applyEdits(ALLOCATION,REV2)),xor:xorStream(REV2)}]}]};
}
// Route a marked module instance's data import to a synthetic data module.
const moduleUrl=(name,value)=>'data:text/javascript,'+encodeURIComponent(`export const ${name}=${JSON.stringify(value)};`);
const ROUTES={
 'title-good':{specifier:'./editor-title-logo-data.mjs',url:moduleUrl('FINAL_TITLE_LOGO_DATA',titleData())},
 'title-star':{specifier:'./editor-title-logo-data.mjs',url:moduleUrl('FINAL_TITLE_LOGO_DATA',titleData(xorStream(PURPLE).replace(/^(.{4})/,'$1*')))},
 'title-short':{specifier:'./editor-title-logo-data.mjs',url:moduleUrl('FINAL_TITLE_LOGO_DATA',titleData('A'))},
 'title-truncated':{specifier:'./editor-title-logo-data.mjs',url:moduleUrl('FINAL_TITLE_LOGO_DATA',titleData(Buffer.from([0,5,1,2]).toString('base64url')))},
 'title-zero':{specifier:'./editor-title-logo-data.mjs',url:moduleUrl('FINAL_TITLE_LOGO_DATA',titleData(Buffer.from([0,3,1,0,2]).toString('base64url')))},
 'dictionary-good':{specifier:'./editor-dictionary-portrait-data.mjs',url:moduleUrl('DICTIONARY_PORTRAIT_DATA',dictionaryData())},
};
// module.register arrived in Node 20.6; older Node 20 releases skip the tests that need synthetic data modules.
const register=nodeModule.register;
const needsHooks=typeof register==='function'?{}:{skip:'module.register needs Node 20.6 or later'};
if(typeof register==='function')register('data:text/javascript,'+encodeURIComponent(`let routes={};
export async function initialize(data){routes=data;}
export async function resolve(specifier,context,next){
 const marker=/[?&]synthetic=([a-z-]+)/.exec(context.parentURL??'')?.[1],route=marker?routes[marker]:undefined;
 if(route&&specifier.startsWith(route.specifier))return {url:route.url,shortCircuit:true};
 return next(specifier,context);
}`),import.meta.url,{data:ROUTES});
const withData=marker=>import(`../assets/${marker.startsWith('title')?'editor-title-logo':'editor-dictionary-portraits'}.mjs?synthetic=${marker}`);

test('compact SRWGLY02 output pins glyph hex and font decoding and refuses corruption',()=>{
 const f=glyphFixture(),plan=f.tools.planGlyphAdditions(f.source,['힣뷁'],f.options);
 assert.deepEqual(plan.entries.map(e=>[e.code,e.unicode]),[['EC00','뷁'],['EC01','힣']]);
 assert.equal(plan.entries[1].bitmap,'000000001040ff403c40424042403c4004007fc01f0020801f00000000000000');
 assert.equal(hex(generateHangulGlyph('힣')),plan.entries[1].bitmap);
 const written=f.tools.writeGlyphAdditions(f.source,plan.entries,f.options).decoded;
 assert.equal(written.length,90603);
 assert.equal(sha(written),'117b4e74120db911cfaf8b72d195b6a1db82a4539347bfa5690f10227fd5b36d');
 assert.equal(hex(written.subarray(-16)),'535257474c59303200016111000000ca');
 assert.equal(sha(written.subarray(f.source.length,written.length-16)),'c721d212be36d84822ba7ff4b6ab02b5e592c4dc3483cff385649727cfeea094');
 const manifest=f.tools.encodeGlyphManifest(f.source,plan.entries,f.options);
 assert.equal(manifest.bytes.length,756);
 assert.equal(sha(manifest.bytes),'bef286c6c84af457132306d7acb4028a8dd29edc1f568f76ce12e5a28b8501b5');
 for(const input of [written,atOffset(written)]){
  const read=f.tools.readGlyphAdditions(input,f.options);
  assert.deepEqual(read.decoded,f.source);assert.deepEqual(read.entries,plan.entries);
 }
 for(const at of [0,2,34,66,70,102])assert.throws(()=>f.tools.readGlyphAdditions(flipped(written,f.source.length+at),f.options),glyphInvalid(),`payload byte ${at}`);
 // Byte 69 is the low byte of the first entry's cell code; the cell preimage comparison rejects it first.
 assert.throws(()=>f.tools.readGlyphAdditions(flipped(written,f.source.length+69),f.options),glyphInvalid('The glyph cell does not match its declared preimage.'));
});

test('non-zero originals: compact output is pinned and legacy SRWGLY01 JSON hex decodes back to the source',()=>{
 const f=glyphFixture({ink:true,gameId:'srwf-final'}),plan=f.tools.planGlyphAdditions(f.source,['가나다'],f.options);
 const json=f.tools.encodeGlyphManifest(f.source,plan.entries,f.options).bytes,written=f.tools.writeGlyphAdditions(f.source,plan.entries,f.options).decoded;
 assert.equal(written.length,90671);
 assert.equal(sha(written),'d29ef1e8833f15e89b3870149e0ff5e5c8ee461e18b3d84cea3b11cd6f8e96e5');
 assert.equal(hex(written.subarray(-16)),'535257474c593032000161110000010e');
 const legacy=new Uint8Array(f.source.length+json.length+16),foot=legacy.length-16,d=new DataView(legacy.buffer);
 legacy.set(written.subarray(0,f.source.length));legacy.set(json,f.source.length);
 legacy.set(new TextEncoder().encode('SRWGLY01'),foot);d.setUint32(foot+8,f.source.length);d.setUint32(foot+12,json.length);
 assert.equal(json.length,1036);assert.equal(sha(json),'6831eeb588868a9d31ed7012f49ce1fd7566440e771492df3115b1284f49ed74');
 assert.equal(sha(legacy),'1166cd7b203b59692418758dca0bbc3da05a895fa2ecc7f25a5b06259fd09a1b');
 const read=f.tools.readGlyphAdditions(legacy,f.options);
 assert.deepEqual(read.decoded,f.source);assert.deepEqual(read.entries,plan.entries);
 const text=new TextDecoder().decode(json),edited=text.replace(plan.entries[1].bitmap,plan.entries[1].bitmap.replace(/[0-9a-f]$/,c=>c==='0'?'1':'0'));
 assert.notEqual(edited,text);
 const tampered=new Uint8Array(legacy);tampered.set(new TextEncoder().encode(edited),f.source.length);
 assert.throws(()=>f.tools.readGlyphAdditions(tampered,f.options),glyphInvalid());
});

test('zero-original SRWGLY03 output keeps release-owned glyphs and round-trips',()=>{
 const baseline=[{code:'EC02',unicode:'힣'},{code:'EC03',unicode:'花'}];
 const f=glyphFixture({cells:2,baseline}),plan=f.tools.planGlyphAdditions(f.source,['힣花똠쀍'],f.options);
 assert.deepEqual(plan.entries.map(e=>[e.code,e.unicode]),[['EC00','똠'],['EC01','쀍']]);
 const written=f.tools.writeGlyphAdditions(f.source,plan.entries,f.options).decoded;
 assert.equal(written.length,90539);
 assert.equal(sha(written),'92b53ea0f9ffcdf749a1e29621e0e90b7bc11b48cdc08fb7894e3c6861c75019');
 assert.equal(hex(written.subarray(-16)),'535257474c593033000161110000008a');
 const read=f.tools.readGlyphAdditions(written,f.options);
 assert.deepEqual(read.entries.map(e=>[e.code,e.unicode]),[['EC00','똠'],['EC01','쀍']]);assert.deepEqual(read.decoded,f.source);
 assert.throws(()=>f.tools.readGlyphAdditions(flipped(written,f.source.length+69),f.options),glyphInvalid('The glyph cell does not match its declared preimage.'));
 assert.throws(()=>f.tools.readGlyphAdditions(flipped(written,f.source.length+104),f.options),glyphInvalid());
});

test('production Final profile refuses a synthetic atlas and a cell that differs from its preimage',()=>{
 const production=createGlyphEditor(EDITOR_GLYPH_PROFILES),profile=EDITOR_GLYPH_PROFILES.find(p=>p.gameId==='srwf-final'&&p.variant==='c');
 assert.deepEqual(profile.cells.slice(0,3).map(c=>c.code),['F327','F385','F387']);
 const source=new Uint8Array(profile.atlasOffset+2816*32+64);new DataView(source.buffer).setInt32(144,profile.atlasOffset-144);
 const chars=['힣','똠','쀍'],payload=new Uint8Array(66+36*3),v=new DataView(payload.buffer),cellAt=code=>profile.atlasOffset+(parseInt(code,16)-0xeb00)*32;
 v.setUint16(0,3);payload.set(Buffer.from(profile.baseSha256,'hex'),2);payload.set(Buffer.from(profile.atlasSha256,'hex'),34);
 chars.forEach((ch,i)=>{const code=profile.cells[i].code,p=66+36*i,glyph=generateHangulGlyph(ch);v.setUint16(p,ch.codePointAt(0));v.setUint16(p+2,parseInt(code,16));payload.set(glyph,p+4);source.set(glyph,cellAt(code));});
 const stored=new Uint8Array(source.length+payload.length+16),d=new DataView(stored.buffer);stored.set(source);stored.set(payload,source.length);
 stored.set(new TextEncoder().encode('SRWGLY03'),stored.length-16);d.setUint32(stored.length-8,source.length);d.setUint32(stored.length-4,payload.length);
 assert.throws(()=>production.readGlyphAdditions(stored,{gameId:'srwf-final'}),glyphInvalid('The original glyph atlas differs from its accepted identity.'));
 const blank=stored.slice();blank.fill(0,cellAt(profile.cells[0].code),cellAt(profile.cells[0].code)+32);
 assert.throws(()=>production.readGlyphAdditions(blank,{gameId:'srwf-final'}),glyphInvalid('The glyph cell does not match its declared preimage.'));
});

test('title logo XOR recipes decode base64url and switch states reversibly',needsHooks,async()=>{
 // Every recipe needs the URL-safe alphabet; together they use both '-' and '_'.
 const streams=titleData().records.flatMap(r=>[...Object.values(r.variants),r.shared].filter(Boolean).map(x=>x.xor));
 assert.equal(streams.length,3);for(const xor of streams)assert.match(xor,/[-_]/);
 assert.ok(streams.some(xor=>xor.includes('-'))&&streams.some(xor=>xor.includes('_')));
 const {inspectFinalTitleLogo,setFinalTitleLogo,canonicalTitleLogo,campaignTitleLogo}=await withData('title-good');
 const original=effectContainer(),expected=state=>applyEdits(applyEdits(original,state==='purple'?PURPLE:RED,SLOT0),SHARED,SLOT1);
 assert.deepEqual(inspectFinalTitleLogo(original),{state:'original',shape:'original'});
 const purple=setFinalTitleLogo(original,'purple'),red=setFinalTitleLogo(original,'red');
 assert.deepEqual(purple,expected('purple'));assert.deepEqual(red,expected('red'));
 assert.equal(original.length,1412);assert.equal(sha(original),'000b609368476bfefb31ebc84f0d273d3f3795e0174d5de1621a190814338e57');
 assert.equal(sha(purple),'2b7fc845eafa922941cab10c5d778150a1ec174201781dfb70199b7a800712ea');
 assert.equal(sha(red),'df8ca77392559dca6da65158baad19f1914f5116d3a4069a77d67baaa2b0f80d');
 assert.deepEqual(inspectFinalTitleLogo(purple),{state:'purple',shape:'straight'});assert.equal(inspectFinalTitleLogo(red).state,'red');
 assert.deepEqual(setFinalTitleLogo(purple,'red'),red);assert.deepEqual(setFinalTitleLogo(red,'original'),original);
 assert.deepEqual(canonicalTitleLogo(red),original);assert.deepEqual(campaignTitleLogo(original),red);
 assert.equal(setFinalTitleLogo(red,'red'),red);
 assert.deepEqual(setFinalTitleLogo(atOffset(original),'purple'),purple);
 assert.throws(()=>setFinalTitleLogo(flipped(original,SLOT0+1),'purple'),{code:'EDITOR_TITLE_LOGO_INVALID'});
});

test('title logo XOR decoding fails closed on malformed recipes',needsHooks,async()=>{
 const original=effectContainer();
 for(const marker of ['title-star','title-short']){
  const {setFinalTitleLogo}=await withData(marker);
  assert.throws(()=>setFinalTitleLogo(original,'purple'),{name:'InvalidCharacterError'},marker);
  assert.deepEqual(setFinalTitleLogo(original,'original'),original);
 }
 for(const marker of ['title-truncated','title-zero']){
  const {setFinalTitleLogo}=await withData(marker);
  assert.throws(()=>setFinalTitleLogo(original,'purple'),{code:'EDITOR_TITLE_LOGO_INVALID'},marker);
 }
});

test('dictionary portrait recipes decode base64url and move between revisions',needsHooks,async()=>{
 const p=dictionaryData().profiles[0],streams=[p,...p.previous].map(r=>r.xor);
 for(const xor of streams)assert.match(xor,/[-_]/);
 assert.ok(streams.some(xor=>xor.includes('-'))&&streams.some(xor=>xor.includes('_')));
 const {changeDictionaryPortraitSlot,inspectDictionaryPortraitSlot,dictionaryPortraitAllocation}=await withData('dictionary-good');
 assert.equal(dictionaryPortraitAllocation(4321),256);assert.equal(dictionaryPortraitAllocation(4322),null);
 assert.equal(inspectDictionaryPortraitSlot(ALLOCATION,4321,200).revision,0);
 const r3=changeDictionaryPortraitSlot(ALLOCATION,4321,200,true),r1=changeDictionaryPortraitSlot(ALLOCATION,4321,200,1),r2=changeDictionaryPortraitSlot(ALLOCATION,4321,200,2);
 assert.deepEqual([r3.revision,r3.byteLength,r1.revision,r1.byteLength,r2.revision,r2.byteLength],[3,240,1,220,2,230]);
 assert.deepEqual(r3.bytes,applyEdits(ALLOCATION,REV3));assert.deepEqual(r1.bytes,applyEdits(ALLOCATION,REV1));assert.deepEqual(r2.bytes,applyEdits(ALLOCATION,REV2));
 assert.equal(sha(r3.bytes),'1b48877ee97fcc19ad33643ca7140be683618681f6170fdbf073f0c011bcd699');
 assert.equal(sha(r1.bytes),'6bd032af7d43d08b40a8aa374dc8db57350fa60044ff19f39ac9427583cd752d');
 assert.equal(sha(r2.bytes),'6af2fdda92bc51849e3be81a8651d8da4bc11bc6923f1d5402ff523a1e61ca08');
 assert.deepEqual(changeDictionaryPortraitSlot(r1.bytes,4321,220,true).bytes,r3.bytes);
 assert.deepEqual(changeDictionaryPortraitSlot(r2.bytes,4321,230,1).bytes,r1.bytes);
 const back=changeDictionaryPortraitSlot(r3.bytes,4321,240,false);
 assert.deepEqual(back.bytes,ALLOCATION);assert.equal(back.byteLength,200);
 assert.deepEqual(changeDictionaryPortraitSlot(atOffset(ALLOCATION),4321,200,true).bytes,r3.bytes);
 assert.throws(()=>changeDictionaryPortraitSlot(flipped(ALLOCATION,9),4321,200,true),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
});

test('Final default save names and aliases match exact hero-text fingerprints by face',()=>{
 const names=['레난제스 스타로드',null,'헥토르 매디슨','어윈 도스틴','패트리샤 해크먼',null,null,'린 마오'];
 names.forEach((name,i)=>{
  if(!name)return;
  const encoded=encodeEditorText(name,{gameId:'srwf-final',kind:'hero'}),field=new Uint8Array(Math.max(14,encoded.length)).fill(255);field.set(encoded);
  assert.equal(finalDefaultSaveName(field,304+i*2),name);assert.equal(finalDefaultSaveName(field,305+i*2),name);
  assert.equal(finalDefaultSaveName(field,304+((i+1)%8)*2),null);
  assert.equal(finalDefaultSaveName(field,303),null);assert.equal(finalDefaultSaveName(field,320),null);
 });
 const aliases=[['제스',304],['이룸',306],['윈',310],['패트',312],['미나',316],['린',318]];
 for(const [alias,face]of aliases){
  const encoded=encodeEditorText(alias,{gameId:'srwf-final',kind:'hero'}),six=new Uint8Array(6).fill(255);six.set(encoded.subarray(0,Math.min(6,encoded.length-1)));
  assert.equal(finalDefaultSaveAlias(six,face),alias);assert.equal(finalDefaultSaveAlias(six,face+1),alias);
  assert.equal(finalDefaultSaveAlias(six,face===318?304:face+2),null);
  assert.equal(finalDefaultSaveAlias(six.subarray(0,5),face),null);
 }
});
