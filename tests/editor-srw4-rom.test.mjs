import test from 'node:test';
import assert from 'node:assert/strict';
import {SRW4_ROM_BYTES,SRW4_ROM_PROFILES,SRW4_EXTRACTION_STATUS,SRW4_ICON_FINGERPRINTS,SRW4_REV1_SHA256,normalizeSrw4Rom,identifySrw4Rom,srw4Crc32,decodeSnes4bpp,decodeSnesPalette,composeSnes4bpp,decodeSrw4Lz,readSrw4Units,inspectSrw4Catalog,canonicalizeSrw4Icon,probeSrw4RawIcons,resolveSrw4IconBank} from '../assets/editor-srw4-rom.mjs';
import * as srw4Rom from '../assets/editor-srw4-rom.mjs';
import {readFileSync,readdirSync} from 'node:fs';

test('the importer never represents identity-only support as a completed sprite extractor',()=>{
  assert.equal(SRW4_EXTRACTION_STATUS.available,false);
  assert.equal(SRW4_EXTRACTION_STATUS.required.length,7);
  assert.ok(SRW4_ROM_PROFILES.every(p=>p.spritesAvailable===false&&p.sha1.length===40));
});
test('normalization only removes a fully checked zero copier header',()=>{
  const source=new Uint8Array(SRW4_ROM_BYTES+512);source[512]=123;
  const n=normalizeSrw4Rom(source);assert.equal(n.headerBytes,512);assert.equal(n.canonical[0],123);
  assert.equal(n.canonical.length,SRW4_ROM_BYTES);n.canonical[0]=6;assert.equal(source[512],123);
  source[511]=1;assert.throws(()=>normalizeSrw4Rom(source),{code:'SRW4_COPIER_HEADER'});
  assert.throws(()=>normalizeSrw4Rom(source.subarray(0,100)),{code:'SRW4_ROM_SIZE'});
});
test('raw normalization keeps all bytes and does not claim the image is authenticated',()=>{
  const b=new Uint8Array(SRW4_ROM_BYTES);
  const n=normalizeSrw4Rom(b);assert.equal(n.headerBytes,0);assert.deepEqual(n.canonical,b);assert.notEqual(n.canonical,b);
});
test('CRC32 covers every byte and matches the standard public check vector',()=>{
  assert.equal(srw4Crc32(new TextEncoder().encode('123456789')),'cbf43926');
  const b=new Uint8Array(64);const a=srw4Crc32(b);b[63]=1;assert.notEqual(srw4Crc32(b),a);
});
test('unknown source bytes fail closed even at the exact supported length',async()=>{
  await assert.rejects(identifySrw4Rom(new Uint8Array(SRW4_ROM_BYTES)),{code:'SRW4_ROM_IDENTITY'});
});
test('oversized Blob is refused before reading and abort is preserved',async()=>{
  const blob=new Blob([new Uint8Array(100)]);blob.arrayBuffer=()=>{throw new Error('must not read');};
  await assert.rejects(identifySrw4Rom(blob),{code:'SRW4_ROM_SIZE'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(identifySrw4Rom(new Uint8Array(SRW4_ROM_BYTES),{signal:controller.signal}),{name:'AbortError'});
});
test('4bpp decodes independent bitplanes with the SNES horizontal bit order',()=>{
  const b=new Uint8Array(32);b[0]=0x80;b[1]=0x40;b[16]=0x20;b[17]=0x10;
  const p=decodeSnes4bpp(b);assert.deepEqual([...p.subarray(0,8)],[1,2,4,8,0,0,0,0]);
  assert.throws(()=>decodeSnes4bpp(b.subarray(1)),{code:'SRW4_TILE_BYTES'});
  assert.throws(()=>decodeSnes4bpp(new Uint8Array(64),{maxTiles:1}),{code:'SRW4_TILE_BYTES'});
});
test('15-bit palette decoding is exact and index zero is transparent',()=>{
  const b=new Uint8Array(32);b[2]=31;b[4]=0xe0;b[5]=3;b[6]=0;b[7]=0x7c;
  const p=decodeSnesPalette(b);assert.deepEqual([...p.subarray(4,16)],[255,0,0,255,0,255,0,255,0,0,255,255]);
  assert.equal(p[3],0);b[31]=0x80;assert.throws(()=>decodeSnesPalette(b),{code:'SRW4_PALETTE_BITS'});
});
test('explicit tile composition supports horizontal and vertical flip without guessing banks',()=>{
  const tiles=new Uint8Array(64);tiles[0]=1;tiles[63]=2;
  const palette=new Uint8Array(64);palette.set([10,20,30,255],4);palette.set([40,50,60,255],8);
  const out=composeSnes4bpp(tiles,palette,new Uint8Array([0,0xc0]),{columns:1,rows:1});
  assert.equal(out.width,8);assert.equal(out.height,8);assert.deepEqual([...out.rgba.subarray(0,4)],[40,50,60,255]);
  assert.deepEqual([...out.rgba.subarray(-4)],[10,20,30,255]);
  assert.throws(()=>composeSnes4bpp(tiles,palette,new Uint8Array([0,4]),{columns:1,rows:1}),{code:'SRW4_IMAGE_LAYOUT'});
  assert.throws(()=>composeSnes4bpp(tiles,palette,new Uint8Array([1,0]),{columns:1,rows:1}),{code:'SRW4_IMAGE_LAYOUT'});
});
test('documented LZ literal and terminal token return a bounded copy and consumed count',()=>{
  const r=decodeSrw4Lz(new Uint8Array([0xa0,65,0,0,0,99]));
  assert.deepEqual([...r.data],[65]);assert.equal(r.consumed,5);
});
test('documented short LZ references support overlapping copies',()=>{
  // control: literal 1, short 00 + length bits 10 (four bytes), terminal 01.
  const r=decodeSrw4Lz(new Uint8Array([0x92,65,255,0,0,0]));
  assert.deepEqual([...r.data],[65,65,65,65,65]);
});
test('documented long LZ references remain bounded',()=>{
  // literal, long 01; packed -1 with low length 4 gives six bytes; end 01.
  const r=decodeSrw4Lz(new Uint8Array([0xa8,65,0xfc,0xff,0,0,0]));
  assert.deepEqual([...r.data],new Array(7).fill(65));
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0xa8,65,0xfc,0xff,0,0,0]),{maxOutputBytes:6}),{code:'SRW4_LZ_OUTPUT'});
});
test('LZ malformed references, truncation, range and input/output bombs fail closed',()=>{
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0,255])),{code:'SRW4_LZ_REFERENCE'});
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0xff])),{code:'SRW4_LZ_TRUNCATED'});
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0xa0,65,0,0,0]),{maxInputBytes:4}),{code:'SRW4_LZ_INPUT'});
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0xff,1,2]),{maxOutputBytes:1}),{code:'SRW4_LZ_OUTPUT'});
  assert.throws(()=>decodeSrw4Lz(new Uint8Array([0]),{maxOutputBytes:Infinity}),{code:'SRW4_RANGE'});
});

function unitFixture(){
  const b=new Uint8Array(SRW4_ROM_BYTES),view=new DataView(b.buffer),table=0xb9000,count=8,start=table+count*2;
  b.set([0,0x90,0xcb],0x900c6);
  for(let i=0;i<count;i++){
    view.setUint16(table+i*2,(start+i*32)&65535,true);
    if(!i)continue;
    const p=start+i*32;b[p]=i;b[p+1]=0x25;view.setUint16(p+2,0x123+i,true);view.setUint16(p+28,1000+i,true);b[p+30]=i+1;
  }
  return {b,view,table,count,start};
}
test('primary native unit-reference reader distinguishes 9-bit icons, picture IDs and unit IDs',()=>{
  const f=unitFixture(),r=readSrw4Units(f.b);
  assert.equal(r.table.pointerOffset,0x900c6);assert.equal(r.table.tableOffset,f.table);assert.equal(r.table.count,8);
  assert.equal(r.units.length,7);assert.deepEqual(r.units[0],{unitId:1,recordOffset:f.start+32,iconId:257,pictureId:0x124,franchiseId:0x24,hp:1001,weaponCount:2});
  assert.deepEqual(r.iconReferences[0],{iconId:257,unitIds:[1]});
  assert.deepEqual(r.pictureReferences[0],{pictureId:0x124,unitIds:[1]});
});
test('native reference reader preserves valid pointer aliases and omits zero-HP metadata',()=>{
  const f=unitFixture();f.view.setUint16(f.table+4,(f.start+32)&65535,true);f.view.setUint16(f.start+3*32+28,0,true);
  const r=readSrw4Units(f.b);assert.equal(r.units.length,6);assert.deepEqual(r.iconReferences[0].unitIds,[1,2]);
});
test('unit-reference headers, table counts and pointers are bounded before records are read',()=>{
  const f=unitFixture();f.b.set([0,0,0],0x900c6);assert.throws(()=>readSrw4Units(f.b),{code:'SRW4_RANGE'});
  const g=unitFixture();g.view.setUint16(g.table,0x9001,true);assert.throws(()=>readSrw4Units(g.b),{code:'SRW4_UNIT_TABLE'});
  const h=unitFixture();h.view.setUint16(h.table+4,0xffff,true);assert.throws(()=>readSrw4Units(h.b),{code:'SRW4_UNIT_POINTER'});
  assert.throws(()=>readSrw4Units(new Uint8Array(64)),{code:'SRW4_ROM_SIZE'});
});
test('catalog authentication cannot be bypassed by a well-formed reference table',async()=>{
  await assert.rejects(inspectSrw4Catalog(unitFixture().b),{code:'SRW4_ROM_IDENTITY'});
});
function syntheticIcon(){
  const out=new Uint8Array(256);let seed=123;
  for(let i=0;i<out.length;i++){seed=Math.imul(seed,1664525)+1013904223|0;out[i]=(seed>>>24)%7;}
  return out;
}
function encodeIcon(indexed,order=[0,1,2,3]){
  const out=new Uint8Array(128);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const c=indexed[y*16+x],tile=order[(y>>>3)*2+(x>>>3)],p=tile*32+(y&7)*2,bit=1<<(7-(x&7));
    if(c&1)out[p]|=bit;if(c&2)out[p+1]|=bit;if(c&4)out[p+16]|=bit;if(c&8)out[p+17]|=bit;
  }
  return out;
}
test('icon fingerprints are invariant under palette-index permutation but preserve transparency and geometry',()=>{
  const a=syntheticIcon(),b=a.map(v=>v?[0,15,8,10,9,14,7][v]:0);
  assert.equal(canonicalizeSrw4Icon(a).sha256,canonicalizeSrw4Icon(b).sha256);
  b[0]=b[0]?0:1;assert.notEqual(canonicalizeSrw4Icon(a).sha256,canonicalizeSrw4Icon(b).sha256);
  assert.throws(()=>canonicalizeSrw4Icon(new Uint8Array(255)),{code:'SRW4_ICON_SIZE'});
});
test('raw icon probe returns passed-buffer pixels only after full fingerprint equality',async()=>{
  const icon=syntheticIcon(),raw=encodeIcon(icon),f={...canonicalizeSrw4Icon(icon),key:'synthetic',unitId:1,crop:[0,0,16,16]};
  const r=await probeSrw4RawIcons(raw,{fingerprints:[f]});
  assert.equal(r.researchOnly,true);assert.equal(r.matches.length,1);assert.equal(r.matches[0].layout,'linear-row');
  assert.deepEqual(r.matches[0].indexed,icon);assert.deepEqual(r.matches[0].sourceOffsets,[0,32,64,96]);
  raw[0]^=128;assert.equal((await probeSrw4RawIcons(raw,{fingerprints:[f]})).matches.length,0);
});
test('raw probe supports explicit tile alignment and column assembly without calling guesses a bank',async()=>{
  const icon=syntheticIcon(),raw=new Uint8Array(129);raw.set(encodeIcon(icon,[0,2,1,3]),1);
  const f={...canonicalizeSrw4Icon(icon),key:'synthetic',unitId:2,crop:[0,0,16,16]};
  assert.equal((await probeSrw4RawIcons(raw,{fingerprints:[f]})).matches.length,0);
  const r=await probeSrw4RawIcons(raw,{fingerprints:[f],alignments:[1]});assert.equal(r.matches.length,1);
  assert.equal(r.matches[0].layout,'linear-column');assert.deepEqual(r.matches[0].indexed,icon);assert.equal(r.confirmedBank,undefined);
});
test('fast fingerprint prefilter never substitutes for SHA-256 equality',async()=>{
  const icon=syntheticIcon(),f={...canonicalizeSrw4Icon(icon),key:'synthetic',unitId:1,crop:[0,0,16,16]};f.sha256='0'.repeat(64);
  assert.equal((await probeSrw4RawIcons(encodeIcon(icon),{fingerprints:[f]})).matches.length,0);
});
test('raw probe has strict work bounds, input bounds, alignment and cancellation',async()=>{
  const raw=new Uint8Array(2048),c=new AbortController();c.abort();
  await assert.rejects(probeSrw4RawIcons(raw,{signal:c.signal}),{name:'AbortError'});
  await assert.rejects(probeSrw4RawIcons(raw,{alignments:[0,0]}),{code:'SRW4_PROBE_ALIGNMENT'});
  await assert.rejects(probeSrw4RawIcons(raw,{alignments:[32]}),{code:'SRW4_RANGE'});
  await assert.rejects(probeSrw4RawIcons(raw,{maxCandidates:1}),{code:'SRW4_PROBE_LIMIT'});
  await assert.rejects(probeSrw4RawIcons(new Uint8Array(SRW4_ROM_BYTES+1)),{code:'SRW4_PROBE_SIZE'});
});
test('reference registry contains digests and metadata without embedded image pixels',()=>{
  assert.equal(SRW4_ICON_FINGERPRINTS.length,30);
  for(const f of SRW4_ICON_FINGERPRINTS){assert.deepEqual(Object.keys(f).sort(),['crop','fnv32','key','sha256','unitId']);assert.match(f.sha256,/^[0-9a-f]{64}$/);}
});
function bankFixture(base=256,layout='linear-row'){
  const references={units:[{unitId:1,iconId:4},{unitId:2,iconId:5},{unitId:3,iconId:17}],iconReferences:[{iconId:4},{iconId:5},{iconId:17},{iconId:30}]};
  const matches=references.units.map(u=>({unitId:u.unitId,sourceOffset:base+u.iconId*128,layout,linear:true}));
  return {references,matches};
}
test('icon-bank hypothesis requires three different units with one consistent origin and layout',()=>{
  const {references,matches}=bankFixture();const r=resolveSrw4IconBank(matches,references,{sourceBytes:8192});
  assert.deepEqual(r.confirmedBank,{base:256,layout:'linear-row',anchors:[1,2,3]});
  assert.equal(resolveSrw4IconBank(matches.slice(0,2),references,{sourceBytes:8192}).confirmedBank,null);
  assert.equal(resolveSrw4IconBank(new Array(3).fill(matches[0]),references,{sourceBytes:8192}).confirmedBank,null);
});
test('icon-bank candidate is refused when any referenced unit would read past the source',()=>{
  const {references,matches}=bankFixture();references.iconReferences.push({iconId:100});
  assert.equal(resolveSrw4IconBank(matches,references,{sourceBytes:8192}).confirmedBank,null);
});
test('competing exact-match banks or layouts remain ambiguous and cannot be silently selected',()=>{
  const a=bankFixture(),b=bankFixture(512),c=bankFixture(256,'linear-column');
  for(const other of [b,c]){
    const r=resolveSrw4IconBank([...a.matches,...other.matches],a.references,{sourceBytes:8192});
    assert.equal(r.confirmedBank,null);assert.equal(r.ambiguous,true);
  }
});
test('nonlinear sheet probes do not automatically establish a contiguous icon bank',()=>{
  const {references,matches}=bankFixture(256,'sheet16');
  assert.equal(resolveSrw4IconBank(matches,references,{sourceBytes:8192}).confirmedBank,null);
});
test('sheet16 bank requires consistent two-row tile addresses across sheet boundaries',()=>{
  const {references,matches}=bankFixture(256,'sheet16');
  matches.forEach((m,i)=>{const id=references.units[i].iconId,at=256+Math.floor(id/8)*1024+(id%8)*64;m.sourceOffset=at;m.sourceOffsets=[at,at+32,at+512,at+544];m.linear=false;});
  assert.deepEqual(resolveSrw4IconBank(matches,references,{sourceBytes:8192}).confirmedBank,{base:256,layout:'sheet16',anchors:[1,2,3]});
  matches[2].sourceOffsets[2]+=32;
  assert.equal(resolveSrw4IconBank(matches,references,{sourceBytes:8192}).confirmedBank,null);
});

// CRC32 forger: rewrites the last four bytes so the whole buffer has `target`.
function forgeCrc32(buf,target){
  const table=new Uint32Array(256),top=new Uint8Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);table[n]=c>>>0;top[c>>>24]=n;}
  let crc=0xffffffff;for(let i=0;i<buf.length-4;i++)crc=(table[(crc^buf[i])&255]^(crc>>>8))>>>0;
  let t=(parseInt(target,16)^0xffffffff)>>>0;const idx=[];
  for(let k=0;k<4;k++){const j=top[t>>>24];idx.unshift(j);t=((t^table[j])<<8)>>>0;}
  for(let k=0;k<4;k++){buf[buf.length-4+k]=(crc^idx[k])&255;crc=(table[idx[k]]^(crc>>>8))>>>0;}
  return buf;
}
const hexBuffer=hex=>Uint8Array.from(hex.match(/../g),n=>parseInt(n,16)).buffer;

test('only Rev 1 is accepted and its SHA-256 is pinned to the documented value',()=>{
  assert.equal(SRW4_REV1_SHA256,'efd72094b2727c4903924cf9296b3946b95a354f639b600e1d76d9ec6b9ca18b');
  assert.deepEqual(SRW4_ROM_PROFILES.map(p=>p.id),['srw4-jp-rev1']);
  const [rev1]=SRW4_ROM_PROFILES;
  assert.equal(rev1.sha256,SRW4_REV1_SHA256);assert.equal(rev1.sha1,'c48b09d0ed6850896db7d7b4e08caffc0376223a');assert.equal(rev1.crc32,'63883e1e');
  const doc=readFileSync(new URL('../docs/SRW4_SOURCE_IMPORT_20261027.md',import.meta.url),'utf8');
  assert.ok(doc.includes(SRW4_REV1_SHA256));
});
test('matching SHA-1 and CRC32 without the pinned SHA-256 fails closed',async t=>{
  for(const [sha1,crc] of [['c48b09d0ed6850896db7d7b4e08caffc0376223a','63883e1e'],['3ec883d427724d6dc655f431f901cde60d16af3e','be764d4c']]){
    const rom=forgeCrc32(new Uint8Array(SRW4_ROM_BYTES),crc);assert.equal(srw4Crc32(rom),crc);
    const digest=t.mock.method(crypto.subtle,'digest',async()=>hexBuffer(sha1));
    try{await assert.rejects(identifySrw4Rom(rom),{code:'SRW4_ROM_IDENTITY'});assert.equal(digest.mock.callCount(),1);}
    finally{digest.mock.restore();}
  }
});
test('no SFC-derived color values or raw palette tables ship in SRW4/map-icon modules',()=>{
  assert.equal('SRW4_ICON_PALETTE_CONSTRAINTS' in srw4Rom,false);
  assert.equal('createSrw4PaletteProbe' in srw4Rom,false);
  const dir=new URL('../assets/',import.meta.url);
  const files=readdirSync(dir).filter(n=>/^editor-(srw4-|map-icon|kom-recovery).*\.mjs$/.test(n));
  assert.ok(files.includes('editor-srw4-rom.mjs')&&files.length>=8);
  for(const name of files){
    const text=readFileSync(new URL(name,dir),'utf8');
    assert.doesNotMatch(text,/paletteWords\s*["']?\s*:\s*\[/,name);
    // A literal list of five or more integers with any value above one byte
    // looks like BGR555 words; hashes, offsets and tile layouts are not lists.
    for(const m of text.matchAll(/\[\s*((?:0x[0-9a-f]+|\d+)(?:\s*,\s*(?:0x[0-9a-f]+|\d+)){4,})\s*\]/gi)){
      const values=m[1].split(',').map(v=>Number(v.trim()));
      assert.ok(values.every(v=>v<=255),`${name}: numeric word list ${m[0].slice(0,60)}`);
    }
  }
});
