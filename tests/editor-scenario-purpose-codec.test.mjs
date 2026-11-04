import test from 'node:test';
import assert from 'node:assert/strict';
import {readScenarioPurpose,encodeObjectiveText} from '../assets/editor-scenario-objective-base.mjs';

test('F purpose text reads and rewrites the accepted supplemental 맵 glyph without allocating a font cell',()=>{
 const b=new Uint8Array(100),v=new DataView(b.buffer);for(let i=0;i<14;i++)v.setInt32(i*4,56-i*4);
 // root13 E702 -> two relative purpose strings. Both use the existing
 // accepted F193 glyph that the old purpose-only map omitted.
 b.set([0xe7,2,0,4,0xe7,3,0,4,0,5,0xf1,0x93,255,0xf1,0x93,255],56);
 const before=b.slice(),purpose=readScenarioPurpose(b,'srwf-f');
 assert.equal(purpose.victory,'맵');assert.equal(purpose.defeat,'맵');assert.deepEqual(b,before);
 assert.deepEqual([...encodeObjectiveText('맵','srwf-f')],[0xf1,0x93,255]);
});
test('a missing purpose glyph still refuses parsing or writing instead of silently omitting a character',()=>{
 const b=new Uint8Array(100),v=new DataView(b.buffer);for(let i=0;i<14;i++)v.setInt32(i*4,56-i*4);
 b.set([0xe7,2,0,4,0xe7,3,0,4,0,5,0xfe,0xfe,255,0xf1,0x93,255],56);
 assert.equal(readScenarioPurpose(b,'srwf-f'),null);
 assert.throws(()=>encodeObjectiveText('🦄','srwf-f'),{code:'EDITOR_OBJECTIVE_INVALID'});
});
