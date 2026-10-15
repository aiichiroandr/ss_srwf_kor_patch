import test from 'node:test';
import assert from 'node:assert/strict';
import{readBattleSequenceEvents}from'../assets/editor-battle-sequence-events.mjs';
test('compact stream retains program, bank, pressure and bend alongside extended notes',()=>{
 const r=readBattleSequenceEvents(Uint8Array.from([0xc2,4,0,0xb2,32,3,1,0xe2,63,2,0xa2,60,9,0,0xd2,7,0,0x8c,0x88,0x62,60,100,4,5,0x83,0,0]));
 assert.deepEqual(r.events.map(e=>e.type),['program','control','pitchBendMsb','polyPressure','channelPressure','note']);
 assert.equal(r.events[1].controller,32);assert.equal(r.events[5].tick,520);assert.equal(r.events[5].gate,772);assert.equal(r.trailingByteLength,2);
});
test('unknown loop commands, truncated streams and dangling extensions fail explicitly',()=>{
 for(const b of[[0x82],[0,60],[0x8c,0x83],[0,60,200,1,0,0x83],[0xc0,1,0]])assert.throws(()=>readBattleSequenceEvents(Uint8Array.from(b)),/Battle sequence events:/);
});
test('reference returns after logical events without counting extension prefixes',()=>{
 const r=readBattleSequenceEvents(Uint8Array.from([0x81,0,8,1,0x83,0,0,0,0x8c,0,60,100,1,2]));
 assert.equal(r.events.length,1);assert.equal(r.events[0].tick,258);assert.equal(r.events[0].offset,9);assert.equal(r.endOffset,5);
});
test('loop delimiters retain event boundaries and their own step times',()=>{
 const r=readBattleSequenceEvents(Uint8Array.from([0x82,3,0,60,100,4,5,0x82,2,0x83]));
 assert.deepEqual(r.loopPoints,[{tick:3,eventIndex:0,offset:0},{tick:10,eventIndex:1,offset:7}]);
 assert.equal(r.events[0].tick,8);assert.equal(r.durationTicks,10);
});
test('references and loop markers are bounded rather than recursively expanded without limits',()=>{
 for(const bytes of[[0x81,0,0,1,0x83],[0x81,0,0,0,0x83],[0x81,255,255,1,0x83],[0x82,0,0x83],[0x82,0,0x82,0,0x82,0,0x83]])assert.throws(()=>readBattleSequenceEvents(Uint8Array.from(bytes)),/Battle sequence events:/);
});
