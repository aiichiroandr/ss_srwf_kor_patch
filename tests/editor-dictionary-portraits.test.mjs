import{setDictionaryAdditionsExec,dictionaryAdditionsExecState}from'../assets/editor-dictionary-additions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {dictionaryPortraitExecState,setDictionaryPortraitExec,inspectDictionaryPortraitSlot,changeDictionaryPortraitSlot,DICTIONARY_PORTRAIT_HOOK as H} from '../assets/editor-dictionary-portraits.mjs';
import {DICTIONARY_PORTRAIT_DATA} from '../assets/editor-dictionary-portrait-data.mjs';
import {locateIsoFiles,readCdUserExtent} from '../assets/editor-core.mjs';
import {mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const fixture=process.env.SRWF_DICTIONARY_FACE_SLOT_FIXTURE;
const binFixture=process.env.SRWF_DICTIONARY_FACE_BIN_FIXTURE;
test('dictionary portrait hook preserves every other EXEC byte and refuses unknown code',()=>{
 const bytes=new Uint8Array(H.execBytes);H.hooks.forEach(h=>new DataView(bytes.buffer).setUint32(h.offset,h.original));
 const fixed=setDictionaryPortraitExec(bytes,'srwf-final',true);
 assert.equal(dictionaryPortraitExecState(fixed,'srwf-final').enabled,true);
 const restored=fixed.slice();H.hooks.forEach(h=>new DataView(restored.buffer).setUint32(h.offset,h.original));
 assert.deepEqual(restored,bytes);assert.equal(dictionaryPortraitExecState(fixed,'srwf-final').revision,4);
 // Revision 4 adds exactly the list interpreter literal; revision 3 images stay recognised and upgrade.
 const list=H.hooks.find(h=>h.since===4);assert.equal(list.offset,0x825e0);assert.equal(list.original,0x06015ebc);assert.equal(list.fixed,0x2029f980);
 const previous=setDictionaryPortraitExec(bytes,'srwf-final',3);assert.equal(dictionaryPortraitExecState(previous,'srwf-final').revision,3);
 assert.deepEqual([...fixed.keys()].filter(i=>fixed[i]!==previous[i]),[0x825e0,0x825e1,0x825e2,0x825e3]);
 assert.deepEqual(setDictionaryPortraitExec(previous,'srwf-final',true),fixed);assert.deepEqual(setDictionaryPortraitExec(fixed,'srwf-final',3),previous);
 const early=setDictionaryPortraitExec(bytes,'srwf-final',2);new DataView(early.buffer).setUint32(list.offset,list.fixed);
 assert.equal(dictionaryPortraitExecState(early,'srwf-final').available,false);
 const half=fixed.slice();new DataView(half.buffer).setUint32(list.offset,list.original^1);
 assert.equal(dictionaryPortraitExecState(half,'srwf-final').available,false);
 const legacy=setDictionaryPortraitExec(bytes,'srwf-final',1);
 assert.equal(dictionaryPortraitExecState(legacy,'srwf-final').revision,1);
 assert.deepEqual(setDictionaryPortraitExec(legacy,'srwf-final',true),fixed);
 const mixed=fixed.slice();new DataView(mixed.buffer).setUint32(H.hooks[1].offset,H.hooks[1].original);
 assert.equal(dictionaryPortraitExecState(mixed,'srwf-final').available,false);
 assert.throws(()=>setDictionaryPortraitExec(mixed,'srwf-final',true),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
 assert.deepEqual(setDictionaryPortraitExec(fixed,'srwf-final',false),bytes);
 const unknown=bytes.slice();unknown[H.offset]^=1;
 assert.throws(()=>setDictionaryPortraitExec(unknown,'srwf-final',true),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
 assert.equal(setDictionaryPortraitExec(unknown,'srwf-final',false),unknown);
 assert.throws(()=>setDictionaryPortraitExec(bytes,'srwf-f',true),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
});
test('public dictionary recipes contain only the accepted v0.3 family',()=>{
 assert.ok(DICTIONARY_PORTRAIT_DATA.profiles.length>0);
 for(const p of DICTIONARY_PORTRAIT_DATA.profiles){
  assert.equal(p.extentLba,2835);assert.equal(p.originalBytes,79013);
  assert.ok(p.fixedBytes<=p.allocationBytes);assert.match(p.xor,/^[A-Za-z0-9_-]+$/);
  // The public revision-3 latest (unaligned name-cell access) stays readable as the newest revision-3 variant.
  assert.equal(p.previous.at(-1).variant,'before-list-names');assert.equal(p.previous.at(-1).revision,3);
  assert.equal(p.previous.at(-1).fixedSha256,'79d95b4f11e3399204b0f803933e92c2c40d6fdbb90f6de2cc8f04eb4a4bb6e5');
  assert.equal(new Set([p.fixedSha256,...p.previous.map(r=>r.fixedSha256)]).size,p.previous.length+1);
 }
});
test('portrait code refuses a data module of another revision (stale cache or uncopied override)',async()=>{
 assert.equal(DICTIONARY_PORTRAIT_DATA.version,H.latest);
 // Rebuild the shipped revision-3 data module: its latest is the 'before-list-names' recipe.
 const old={...DICTIONARY_PORTRAIT_DATA,version:3,profiles:DICTIONARY_PORTRAIT_DATA.profiles.map(p=>{const last=p.previous.at(-1),{variant,revision,...recipe}=last;return {...p,...recipe,previous:p.previous.slice(0,-1)};})};
 const dir=await mkdtemp(join(tmpdir(),'dic-portrait-mix-'));
 try{
  for(const name of ['editor-dictionary-portraits.mjs','sha256.mjs','editor-bytes.mjs'])await copyFile(new URL('../assets/'+name,import.meta.url),join(dir,name));
  await writeFile(join(dir,'editor-dictionary-portrait-data.mjs'),'export const DICTIONARY_PORTRAIT_DATA=Object.freeze('+JSON.stringify(old)+');\n');
  const M=await import(pathToFileURL(join(dir,'editor-dictionary-portraits.mjs')).href);
  const bytes=new Uint8Array(H.execBytes);H.hooks.forEach(h=>new DataView(bytes.buffer).setUint32(h.offset,h.original));
  const rev3=setDictionaryPortraitExec(bytes,'srwf-final',3);
  for(const enabled of [true,4,3,1])assert.throws(()=>M.setDictionaryPortraitExec(bytes,'srwf-final',enabled),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
  assert.equal(M.dictionaryPortraitExecState(rev3,'srwf-final').revision,3);
  assert.deepEqual(M.setDictionaryPortraitExec(rev3,'srwf-final',false),bytes);
  for(const p of old.profiles){
   assert.equal(M.dictionaryPortraitAllocation(p.extentLba),null);
   assert.equal(M.inspectDictionaryPortraitSlot(new Uint8Array(p.allocationBytes),p.extentLba,p.fixedBytes),null);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('real dictionary slot is reversible and a byte mutation or wrong length/LBA is rejected',{skip:!fixture},async()=>{
 const bytes=new Uint8Array(await readFile(fixture)),p=DICTIONARY_PORTRAIT_DATA.profiles[0],before=bytes.slice();
 assert.equal(inspectDictionaryPortraitSlot(bytes,p.extentLba,p.originalBytes)?.enabled,false);
 const fixed=changeDictionaryPortraitSlot(bytes,p.extentLba,p.originalBytes,true);
 assert.equal(inspectDictionaryPortraitSlot(fixed.bytes,p.extentLba,p.fixedBytes)?.enabled,true);
 assert.deepEqual(changeDictionaryPortraitSlot(fixed.bytes,p.extentLba,p.fixedBytes,false).bytes,bytes);
 for(const revision of [1,2,3]){
  const legacy=changeDictionaryPortraitSlot(bytes,p.extentLba,p.originalBytes,revision);
  assert.equal(inspectDictionaryPortraitSlot(legacy.bytes,p.extentLba,legacy.byteLength).revision,revision);
  assert.deepEqual(changeDictionaryPortraitSlot(legacy.bytes,p.extentLba,legacy.byteLength,true).bytes,fixed.bytes);
 }
 for(const [lba,length]of [[p.extentLba+1,p.originalBytes],[p.extentLba,p.originalBytes+1]]){
  assert.equal(inspectDictionaryPortraitSlot(bytes,lba,length),null);
  assert.throws(()=>changeDictionaryPortraitSlot(bytes,lba,length,true),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
 }
 const bad=fixed.bytes.slice();bad[100]^=1;
 assert.throws(()=>changeDictionaryPortraitSlot(bad,p.extentLba,p.fixedBytes,false),{code:'EDITOR_DICTIONARY_PORTRAIT_INVALID'});
 assert.deepEqual(bytes,before);
});
