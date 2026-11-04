import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {applyBattleArtPatch} from '../assets/editor-art-patch.mjs';
import {Sha256} from '../assets/sha256.mjs';
const hash=bytes=>new Sha256().update(bytes).hex();
const bad=error=>error.code==='EDITOR_BATTLE_COMPONENT_INVALID';
const root=process.env.SRWF_ART_SCAN_ROOT || fileURLToPath(new URL('../',import.meta.url));

function fixture(){
 const source=Uint8Array.from({length:64},(_,i)=>(i*37+9)&255),expected=source.slice();
 expected.set([0xa1,0xb2],3);expected.set([0xc3,0xd4,0xe5],23);
 const asset={sourcePixelSha256:hash(source),pixelSha256:hash(expected),patches:[
  [3,2,'a1b2'],[23,3,'c3d4e5'],
 ]};
 return {source,expected,asset};
}

test('source-fingerprint art patches apply authored bytes without changing the user source',()=>{
 const {source,expected,asset}=fixture(),before=source.slice();
 const output=applyBattleArtPatch(source,asset);
 assert.deepEqual(output,expected);assert.deepEqual(source,before);assert.notEqual(output,source);
});

test('mutations inside and outside changed regions are rejected by the whole-source fingerprint',()=>{
 const {source,asset}=fixture();
 for(const at of [0,3,24,63]){
  const changed=source.slice();changed[at]^=1;const before=changed.slice();
  assert.throws(()=>applyBattleArtPatch(changed,asset),bad);assert.deepEqual(changed,before);
 }
});

test('patch lengths, order and whole-source/output fingerprints remain fail-closed and atomic',()=>{
 const {source,asset}=fixture(),before=source.slice(),first=asset.patches[0],last=asset.patches[1];
 const invalidAssets=[null,{...asset,sourcePixelSha256:'0'.repeat(64)},{...asset,pixelSha256:'0'.repeat(64)},
  {...asset,patches:null},{...asset,patches:[[3,'1122','a1b2']]},
  ...[
   [3,2,'0'.repeat(64),'a1b2'],[3,2,'bad','a1b2'],[3,0,''],[3,-1,'a1b2'],
   [3,1,'a1b2'],[3,2,'a1b'],[3,2,'zzzz'],[3,2,'A1B2'],
   [-1,2,'a1b2'],[63,2,'a1b2'],[NaN,2,'a1b2'],
   [3,Infinity,'a1b2'],[3,2,'a1b2','extra'],
  ].map(entry=>({...asset,patches:[entry]})),
  {...asset,patches:[first,first]},{...asset,patches:[last,first]},
  {...asset,patches:[first,[4,2,'abcd']]},
  {...asset,patches:[first,[23,3,'000000']]},
 ];
 for(const candidate of invalidAssets){assert.throws(()=>applyBattleArtPatch(source,candidate),bad);assert.deepEqual(source,before);}
});

// These pins cover only offsets, lengths and authored replacement bytes. No
// original sprite bytes are needed by this test or by the shipped patch tables.
const shipped=[
 ['editor-exs-aimed-art.mjs','EXS_AIMED_ART_V16',69,318,'da8e08c209be81fd986c01a1870986297848b6d332d295c581e5ac7f99176eeb'],
];
test('shipped Ex-S art keeps authored deltas while carrying no source-pixel payload',async()=>{
 for(const [file,name,count,bytes,expected]of shipped){
  const asset=(await import(pathToFileURL(path.join(root,'assets',file))))[name];
  assert.match(asset.sourcePixelSha256,/^[0-9a-f]{64}$/);assert.match(asset.pixelSha256,/^[0-9a-f]{64}$/);
  assert.equal(asset.patches.length,count);let end=0,total=0;
  for(const entry of asset.patches){
   assert.equal(entry.length,3,`${file}: no short preimage fingerprint may be shipped`);
   const [at,length,afterHex]=entry;
   assert(Number.isSafeInteger(at)&&at>=end);assert(Number.isSafeInteger(length)&&length>0);
   assert(at+length<=asset.width*asset.height/2);
   assert.match(afterHex,/^[0-9a-f]+$/);assert.equal(afterHex.length,length*2);
   end=at+length;total+=length;
  }
  assert.equal(total,bytes);
  const authored=asset.patches.map(([at,length,afterHex])=>[at,length,afterHex]);
  assert.equal(hash(new TextEncoder().encode(JSON.stringify(authored))),expected,`${file}: authored replacement bytes changed`);
 }
});

function inlinePreimages(text){
 // The former distributed payload shape was [offset, sourceHex, authoredHex].
 // Report lengths only; do not copy original game bytes into logs or fixtures.
 const tuples=/\[\s*(\d+)\s*,\s*(['"])([0-9a-f]+)\2\s*,\s*(['"])([0-9a-f]+)\4\s*\]/gi;
 return [...text.matchAll(tuples)].filter(match=>match[3].length%2===0&&match[3].length===match[5].length)
  .map(match=>({offset:Number(match[1]),length:match[3].length/2}));
}
test('the public payload scanner catches source tuples without flagging fingerprint tuples',()=>{
 assert.deepEqual(inlinePreimages('patches: [[3,"1122","a1b2"]]'),[{offset:3,length:2}]);
 assert.deepEqual(inlinePreimages('patches: [[3,2,"'+'a'.repeat(64)+'","a1b2"]]'),[]);
});

test('production JavaScript contains no inline source-preimage patch payloads',async()=>{
 const files=[];
 async function collect(directory,recursive){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name),info=entry.isSymbolicLink()?await stat(file):entry;
   if(info.isDirectory()&&recursive)await collect(file,true);
   else if(info.isFile()&&/\.(?:m?js)$/.test(entry.name))files.push(file);
  }
 }
 await collect(root,false);
 // weapon-preview/ is a local-only runtime folder; the public checkout does not carry it.
 for(const directory of ['assets','web-port','weapon-preview'])if(existsSync(path.join(root,directory)))await collect(path.join(root,directory),true);
 assert(files.length>0);
 const findings=[];
 for(const file of files){const entries=inlinePreimages(await readFile(file,'utf8'));if(entries.length)findings.push({file:path.relative(root,file),ranges:entries.length,bytes:entries.reduce((n,entry)=>n+entry.length,0)});}
 assert.deepEqual(findings,[],'distributed JavaScript must read original pixel bytes from the user ROM');
});
