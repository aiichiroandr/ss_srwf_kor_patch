import{setDictionaryAdditionsExec,dictionaryAdditionsExecState}from'../assets/editor-dictionary-additions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {dictionaryPortraitExecState,setDictionaryPortraitExec,inspectDictionaryPortraitSlot,changeDictionaryPortraitSlot,DICTIONARY_PORTRAIT_HOOK as H} from '../assets/editor-dictionary-portraits.mjs';
import {DICTIONARY_PORTRAIT_DATA} from '../assets/editor-dictionary-portrait-data.mjs';
import {locateIsoFiles,readCdUserExtent} from '../assets/editor-core.mjs';
const fixture=process.env.SRWF_DICTIONARY_FACE_SLOT_FIXTURE;
const binFixture=process.env.SRWF_DICTIONARY_FACE_BIN_FIXTURE;
test('dictionary portrait hook preserves every other EXEC byte and refuses unknown code',()=>{
 const bytes=new Uint8Array(H.execBytes);H.hooks.forEach(h=>new DataView(bytes.buffer).setUint32(h.offset,h.original));
 const fixed=setDictionaryPortraitExec(bytes,'srwf-final',true);
 assert.equal(dictionaryPortraitExecState(fixed,'srwf-final').enabled,true);
 const restored=fixed.slice();H.hooks.forEach(h=>new DataView(restored.buffer).setUint32(h.offset,h.original));
 assert.deepEqual(restored,bytes);assert.equal(dictionaryPortraitExecState(fixed,'srwf-final').revision,3);
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
 }
});
test('real dictionary slot is reversible and a byte mutation or wrong length/LBA is rejected',{skip:!fixture},async()=>{
 const bytes=new Uint8Array(await readFile(fixture)),p=DICTIONARY_PORTRAIT_DATA.profiles[0],before=bytes.slice();
 assert.equal(inspectDictionaryPortraitSlot(bytes,p.extentLba,p.originalBytes)?.enabled,false);
 const fixed=changeDictionaryPortraitSlot(bytes,p.extentLba,p.originalBytes,true);
 assert.equal(inspectDictionaryPortraitSlot(fixed.bytes,p.extentLba,p.fixedBytes)?.enabled,true);
 assert.deepEqual(changeDictionaryPortraitSlot(fixed.bytes,p.extentLba,p.fixedBytes,false).bytes,bytes);
 for(const revision of [1,2]){
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
