import test from'node:test';import assert from'node:assert/strict';
import{readBattleSoundDirectory}from'../assets/editor-battle-sound-directory.mjs';
const source=offsets=>{const b=new Uint8Array(48),v=new DataView(b.buffer);offsets.forEach((n,i)=>v.setUint32(i*4,n));return b;};
test('sound directory retains backward references and shared aliases without adjacent-slot bounds',()=>{
 const b=source([16,32,24,32]);const d=readBattleSoundDirectory(b,{fileName:'SE.BIN'});
 assert.deepEqual(d.entries,[{slot:0,start:16,end:24},{slot:1,start:32,end:48},{slot:2,start:24,end:32},{slot:3,start:32,end:48}]);
 assert.deepEqual([...b.slice(16)],Array(32).fill(0));
});
test('end sentinels and nonzero view offsets remain bounded',()=>{
 const b=source([16,48,24,24]),p=new Uint8Array(64);p.set(b,8);
 const d=readBattleSoundDirectory(p.subarray(8,56),{fileName:'BGM.BIN'});
 assert.deepEqual(d.entries[1],{slot:1,start:48,end:48});assert.equal(d.entries[0].end,24);
});
test('malformed headers and offsets cannot expose header or foreign bytes',()=>{
 for(const offsets of [[17,24,32,40],[16,15,24,32],[16,49,24,32],[0,24,32,40]])
  assert.throws(()=>readBattleSoundDirectory(source(offsets),{fileName:'SE.BIN'}),/directory/);
 assert.throws(()=>readBattleSoundDirectory(source([16,24,32,40]),{fileName:'OTHER.BIN'}),/source/);
});
