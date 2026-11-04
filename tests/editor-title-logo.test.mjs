import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectFinalTitleLogo,setFinalTitleLogo} from '../assets/editor-title-logo.mjs';
import {sha256Hex} from '../assets/sha256.mjs';

const fixture=process.env.SRWF_TITLE_EFFECT_FIXTURE;
const source=async()=>{
 const bytes=new Uint8Array(await readFile(fixture));
 assert.equal(sha256Hex(bytes),'6757833598b473c18ecd2f0cefe3becf791b274f87af9e28848334a7c1124d77');
 return bytes;
};
test('unknown or malformed title inputs cannot authorize a graphic write',()=>{
 for(const bytes of [null,{},new Uint8Array(),new Uint8Array(2048)]){
  assert.equal(inspectFinalTitleLogo(bytes),null);
  assert.throws(()=>setFinalTitleLogo(bytes,'red'),{code:'EDITOR_TITLE_LOGO_INVALID'});
 }
});
test('approved purple and red restore the exact source, preserve other records and refuse a one-byte mutation', {skip:!fixture},async()=>{
 const before=await source(),sourceHash=sha256Hex(before);
 const purple=setFinalTitleLogo(before,'purple'),red=setFinalTitleLogo(before,'red');
 assert.equal(inspectFinalTitleLogo(purple).state,'purple');
 assert.equal(inspectFinalTitleLogo(red).state,'red');
 assert.deepEqual(setFinalTitleLogo(purple,'red'),red);
 assert.deepEqual(setFinalTitleLogo(red,'purple'),purple);
 for(const bytes of [purple,red]){
  assert.equal(bytes.length,before.length);
  assert.deepEqual(bytes.subarray(0,775869),before.subarray(0,775869));
  assert.deepEqual(bytes.subarray(861372),before.subarray(861372));
  assert.deepEqual(setFinalTitleLogo(bytes,'original'),before);
 }
 const damaged=red.slice();damaged[775900]^=1;const snapshot=damaged.slice();
 assert.equal(inspectFinalTitleLogo(damaged),null);
 assert.throws(()=>setFinalTitleLogo(damaged,'purple'),{code:'EDITOR_TITLE_LOGO_INVALID'});
 assert.deepEqual(damaged,snapshot);assert.equal(sha256Hex(before),sourceHash);
});
test('F campaign directory growth changes no title slot identity and the pointer table remains untouched', {skip:!fixture},async()=>{
 const original=await source(),v=new DataView(original.buffer),shift=72,linked=new Uint8Array(original.length+shift),w=new DataView(linked.buffer);
 linked.set(original.subarray(1208),1280);
 for(let cell=0;cell<302;cell++)w.setUint32(cell*4,v.getUint32(cell*4)+shift);
 const end=v.getUint32(4)+4+shift;
 for(let bank=151;bank<160;bank++){
  const cell=bank*8;w.setUint32(cell,1280-cell);w.setUint32(cell+4,end-cell-4);
 }
 assert.equal(w.getUint32(0),160*8);
 assert.equal(inspectFinalTitleLogo(linked).state,'original');
 const red=setFinalTitleLogo(linked,'red');
 assert.equal(inspectFinalTitleLogo(red).state,'red');
 assert.deepEqual(red.subarray(0,1280),linked.subarray(0,1280));
 assert.deepEqual(setFinalTitleLogo(red,'original'),linked);
 const mixed=red.slice(),start=760+w.getUint32(760),stop=764+w.getUint32(764);
 mixed.set(linked.subarray(start,stop),start);
 assert.equal(inspectFinalTitleLogo(mixed),null,'a partially installed correction is not a known title state');
});
