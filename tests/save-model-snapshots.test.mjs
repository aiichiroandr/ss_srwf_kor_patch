import test from 'node:test';
import assert from 'node:assert/strict';
import {openSave} from '../assets/save-core.mjs';
import {syntheticSave} from './helpers/synthetic-save.mjs';

test('repeated reads, edits, reset and catalog replacement preserve independent save snapshots',async()=>{
 const fixture=syntheticSave(),firstGlyphs=new Map(),secondGlyphs=new Map();
 const s=await openSave(fixture.raw,{glyphMap:firstGlyphs});
 const original=s.list()[0],pilot=original.pilots[0];
 for(let i=0;i<100;i++)assert.deepEqual(s.list()[0],original);
 s.edit(original.key,'level',37,pilot.slot);const changed=s.list()[0];
 s.edit(original.key,'money',7654321);const combined=s.list()[0];
 assert.equal(original.pilots[0].level,pilot.level);
 assert.equal(changed.pilots[0].level,37);assert.equal(changed.money,original.money);
 assert.equal(combined.money,7654321);assert.equal(combined.pilots[0].level,37);
 s.updateCatalog({glyphMap:secondGlyphs});assert.equal(s.list()[0].glyphMap,secondGlyphs);
 assert.equal(combined.glyphMap,firstGlyphs);
 const reopened=(await openSave(await s.exportFile(),{glyphMap:secondGlyphs})).list()[0];
 assert.deepEqual(reopened,s.list()[0]);s.reset();assert.deepEqual(await s.exportFile(),fixture.raw);
 assert.equal(s.list()[0].pilots[0].level,pilot.level);
});
