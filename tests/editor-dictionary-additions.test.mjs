import test from 'node:test';import assert from 'node:assert/strict';
import{dictionaryPortraitExecState,setDictionaryPortraitExec,DICTIONARY_PORTRAIT_HOOK as H}from'../assets/editor-dictionary-portraits.mjs';
import{dictionaryAdditionsExecState,setDictionaryAdditionsExec,DICTIONARY_ADDITIONS as A}from'../assets/editor-dictionary-additions.mjs';
function fixture(review=false,revision=3){const b=new Uint8Array(H.execBytes),v=new DataView(b.buffer);H.hooks.forEach(h=>v.setUint32(h.offset,h.original));for(const h of A.hooks.slice(1))v.setUint32(h.offset,h.original);v.setUint32(0x81f20,review?0x2028c0c8:0x06004cc8);for(const o of[0x828ec,0x82bd4])v.setUint32(o,review?0x2029f000:0x06016b1c);return setDictionaryPortraitExec(b,'srwf-final',revision);}
for(const review of[false])test(`${review?'v04':'v03'}: independent imported-unit and ALICE entries preserve exact prior EXEC and reject partial installation`,()=>{
 const original=fixture(review),before=original.slice();
 for(const alice of[false,true])for(const units of[false,true]){
  const out=setDictionaryAdditionsExec(original,'srwf-final',{alice,units}),s=dictionaryAdditionsExecState(out,'srwf-final');assert.equal(s.available,true);assert.equal(s.alice,alice);assert.equal(s.units,units);
  assert.deepEqual(setDictionaryAdditionsExec(out,'srwf-final'),original);assert.equal(setDictionaryAdditionsExec(out,'srwf-final',{alice,units}),out);
  if(s.enabled){assert.equal(dictionaryPortraitExecState(out,'srwf-final').available,!alice);for(const h of A.hooks){const bad=out.slice();bad[h.offset+3]^=1;assert.equal(dictionaryAdditionsExecState(bad,'srwf-final').available,false);assert.throws(()=>setDictionaryAdditionsExec(bad,'srwf-final',{alice:true}),{code:'EDITOR_DICTIONARY_ADDITIONS_INVALID'});}}
 }
 assert.deepEqual(original,before);
 for(const rev of[0,1,2]){const old=fixture(review,rev);assert.equal(dictionaryAdditionsExecState(old,'srwf-final').enabled,false);assert.equal(setDictionaryAdditionsExec(old,'srwf-final'),old);assert.throws(()=>setDictionaryAdditionsExec(old,'srwf-final',{units:true}),{code:'EDITOR_DICTIONARY_ADDITIONS_INVALID'});}
});
test('dictionary imports reject a moved paging helper (the unshipped v0.4 layout included), unsupported games and non-boolean settings',()=>{
 assert.equal(dictionaryAdditionsExecState(fixture(true),'srwf-final').available,false);
 const b=fixture();new DataView(b.buffer).setUint32(0x828ec,0x2029f000);assert.equal(dictionaryAdditionsExecState(b,'srwf-final').available,false);assert.throws(()=>setDictionaryAdditionsExec(b,'srwf-final',{units:true}));assert.throws(()=>setDictionaryAdditionsExec(fixture(),'srwf-f',{alice:true}));assert.throws(()=>setDictionaryAdditionsExec(fixture(),'srwf-final',{alice:1}));
});
