import test from'node:test';import assert from'node:assert/strict';import{readBattleSequenceBank}from'../assets/editor-battle-sequence-bank.mjs';
const fixture=()=>{const b=new Uint8Array(40),v=new DataView(b.buffer);v.setUint16(0,1);v.setUint32(2,6);v.setUint16(6,480);v.setUint16(8,2);v.setUint16(10,24);v.setUint16(12,16);v.setUint32(14,955);v.setUint32(18,400000);v.setUint32(22,4079);v.setUint32(26,500000);b.set([0xb0,7,100,0,0x83],30);return b;};
test('all original tempo rows and event bytes survive parsing without rounded BPM conversion',()=>{const b=fixture(),r=readBattleSequenceBank(b);assert.equal(r.songCount,1);assert.deepEqual(r.songs[0].tempos,[{stepTime:955,microsecondsPerQuarter:400000},{stepTime:4079,microsecondsPerQuarter:500000}]);assert.equal(r.songs[0].tempoLoopOffset,16);assert.equal(r.songs[0].resolution,480);assert.deepEqual(r.songs[0].eventBytes,b.slice(30));r.songs[0].eventBytes.fill(0);assert.equal(b[30],0xb0);});
test('header bounds, tempo zero and misaligned tempo loop reject instead of silently losing data',()=>{for(const[offset,value]of[[0,0],[2,65535],[6,0],[8,65535],[10,8],[12,9],[18,0]]){const b=fixture(),v=new DataView(b.buffer);if(offset===2||offset===18)v.setUint32(offset,value);else v.setUint16(offset,value);assert.throws(()=>readBattleSequenceBank(b),/malformed/);}});
test('byte-offset views use their own bank boundary',()=>{const b=fixture(),p=new Uint8Array(64);p.set(b,8);assert.deepEqual(readBattleSequenceBank(p.subarray(8,48)),readBattleSequenceBank(b));});
test('multi-song banks retain source selection order and delimit by sorted distinct extents',()=>{
 const b=new Uint8Array(74),v=new DataView(b.buffer);v.setUint16(0,2);v.setUint32(2,42);v.setUint32(6,10);
 for(const start of[10,42]){v.setUint16(start,480);v.setUint16(start+2,1);v.setUint16(start+4,16);v.setUint16(start+6,8);v.setUint32(start+8,100);v.setUint32(start+12,400000);b[start+16]=0x83;}
 const r=readBattleSequenceBank(b);assert.deepEqual(r.songs.map(s=>[s.start,s.end]),[[42,74],[10,42]]);
 assert.equal(r.songs[0].eventBytes.length,16);assert.equal(r.songs[1].eventBytes.length,16);
 v.setUint32(6,42);const alias=readBattleSequenceBank(b);assert.equal(alias.songs[0].start,alias.songs[1].start);
 assert.notEqual(alias.songs[0].eventBytes,alias.songs[1].eventBytes);
});
