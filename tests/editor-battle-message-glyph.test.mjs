import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBattleMessageGlyph,writeBattleMessageGlyph} from '../assets/editor-battle-message-glyph.mjs';
test('packed source pairs expand into two independent native4bpp palette indices',()=>{
  const font=new Uint8Array(258*32);font.set([0x1b,0xe4],257*32);
  const glyph=decodeBattleMessageGlyph(font,257,0xa3);
  assert.equal(glyph.width,16);assert.equal(glyph.height,16);assert.equal(glyph.sourceOffset,257*32);
  assert.deepEqual(Array.from(glyph.colorIndices.slice(0,16)),[3,3,3,10,10,3,10,10,10,10,10,3,3,10,3,3]);
  assert.ok(glyph.colorIndices.slice(16).every(v=>v===3));
});
test('narrow glyphs use the first source byte of each row rather than a contiguous16-byte prefix',()=>{
  const font=new Uint8Array(257*32);font[256*32]=0x80;font[256*32+1]=255;font[256*32+2]=1;
  const glyph=decodeBattleMessageGlyph(font,256,0x10);
  assert.equal(glyph.width,8);assert.equal(glyph.colorIndices[0],1);assert.equal(glyph.colorIndices[15],1);
  assert.ok(glyph.colorIndices.slice(1,15).every(v=>v===0));
});
test('missing or foreign slots cannot fall back to another glyph and decoded masks are independent',()=>{
  const font=new Uint8Array(32);font[0]=128;
  for(const glyph of [-1,1,0.5])assert.throws(()=>decodeBattleMessageGlyph(font,glyph,16),/bounded/);
  assert.throws(()=>decodeBattleMessageGlyph(new Uint8Array(33),0,16),/bounded/);
  assert.throws(()=>decodeBattleMessageGlyph(font,0,256),/bounded/);
  decodeBattleMessageGlyph(font,0,16).colorIndices[0]=0;assert.equal(font[0],128);
  assert.equal(decodeBattleMessageGlyph(font,0,16).colorIndices[0],1);
});
function display(){
  const fields=new Uint8Array(64);fields[32]=48;fields[58]=7;fields[59]=20;fields[60]=16;fields[63]=7;
  const font=new Uint8Array(258*32);font[257*32]=128;font[257*32+1]=1;
  return {fields,font,buffer:new Uint8Array(0x8c00),displayRecords:[{columns:33,rows:6,left:7,top:20}]};
}
test('native font writes use packed4bpp rows and alternating half-column state',()=>{
  const d=display();const first=writeBattleMessageGlyph(d.fields,257,d);
  assert.equal(first.byteOffset,0);assert.equal(first.stride,132);assert.equal(d.buffer[0],0x10);assert.equal(d.buffer[7],1);
  assert.equal(d.fields[58],8);assert.equal(d.fields[32],52);
  const second=writeBattleMessageGlyph(d.fields,257,d);assert.equal(second.byteOffset,6);
  assert.equal(d.fields[58],10);assert.equal(d.fields[32],48);
  const third=writeBattleMessageGlyph(d.fields,257,d);assert.equal(third.byteOffset,12);
  assert.equal(d.fields[58],11);assert.equal(d.fields[32],52);
});
test('culled glyphs still advance native layout while malformed source preserves pixels and fields',()=>{
  const d=display();d.fields[58]=6;
  assert.equal(writeBattleMessageGlyph(d.fields,257,d).visible,false);assert.ok(d.buffer.every(v=>v===0));assert.equal(d.fields[58],7);
  const before=d.fields.slice(),pixels=d.buffer.slice();
  assert.throws(()=>writeBattleMessageGlyph(d.fields,999,d),/bounded/);
  assert.deepEqual(d.fields,before);assert.deepEqual(d.buffer,pixels);
});
test('glyph column credits retain native wide-row advance at credit exhaustion',()=>{
  const d=display();d.fields[61]=1;d.fields[62]=1;
  writeBattleMessageGlyph(d.fields,257,d);
  assert.equal(d.fields[58],7);assert.equal(d.fields[59],22);assert.equal(d.fields[62],1);
});
test('Final retained EBF4 normalizes to F4 and draws8 pixels without toggling the half-column bit',()=>{
  const d=display();d.fields[32]=52;d.fields[58]=12;d.fields[59]=22;d.font[244*32]=128;
  const result=writeBattleMessageGlyph(d.fields,244,d);
  assert.equal(result.width,8);assert.equal(result.byteOffset,2134);assert.equal(d.buffer[2134],16);
  assert.equal(d.fields[58],13);assert.equal(d.fields[32],52);
});
