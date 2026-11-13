// Pure synthetic model tests only. They validate parser and row-construction
// contracts, not save import/export, editor authority, or emulator behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSavePilotCatalog, initializeSavePilotRow, readSavePilotGrowth } from '../assets/editor-save-pilot-init.mjs';

const put16 = (bytes, offset, value) => { bytes[offset] = value >>> 8; bytes[offset + 1] = value & 255; };
const put32 = (bytes, offset, value) => new DataView(bytes.buffer).setInt32(offset, value, false);
const pointer = (bytes, cell, target) => put32(bytes, cell, target - cell);

function fixture() {
  const bytes = new Uint8Array(14000);
  const experience = 8;
  const categories = 208;
  const growthPointers = Array.from({ length: 8 }, (_, category) => 240 + category * 64);
  const curves = 800;
  pointer(bytes, 0, experience);
  pointer(bytes, 4, categories);
  for (let level = 0; level < 100; level += 1) put16(bytes, experience + level * 2, 400 + level * 7);
  for (let category = 0; category < 8; category += 1) {
    pointer(bytes, categories + category * 4, growthPointers[category]);
    for (let type = 0; type < 16; type += 1) {
      const curve = curves + (category * 16 + type) * 99;
      pointer(bytes, growthPointers[category] + type * 4, curve);
      for (let index = 0; index < 99; index += 1) bytes[curve + index] = type + (index % 5);
    }
  }
  const segments = Array.from({ length: 31 }, () => ({ bytes: new Uint8Array() }));
  segments[30] = { bytes };
  return { bytes, segments, growthPointers, curves };
}

const growth = () => {
  const parsed = readSavePilotGrowth(fixture().segments, { gameId: 'srwf-final' });
  assert.equal(parsed.supported, true);
  return parsed;
};

test('synthetic nested own-cell-relative pointers read EXP and all nonuniform SP curves', () => {
  const parsed = growth();
  assert.equal(parsed.experience.length, 100);
  assert.equal(parsed.experience[31], 617);
  assert.equal(parsed.spCurves.length, 16);
  assert.deepEqual(parsed.spCurves[7].slice(0, 6), [7, 8, 9, 10, 11, 7]);
});

test('row initializer writes every Final normal-row field and uses selected curve through level 31', () => {
  const row = initializeSavePilotRow({ id: 511, level: 31, mp: 45, mindGrowth: 7 }, growth());
  // SP = 45 + six repetitions of 7+8+9+10+11.
  assert.deepEqual([...row], [1, 255, 31, 16, 2, 105, 0, 60, 255, 100, 1, 59]);
});

test('level 1 has no increment and indexes next EXP by level, while level 99 has zero next EXP', () => {
  const parsed = growth();
  const level1 = initializeSavePilotRow({ id: 1, level: 1, mp: 123, mindGrowth: 15 }, parsed);
  assert.deepEqual([...level1], [0, 1, 1, 16, 1, 151, 0, 0, 255, 100, 0, 123]);
  const level99 = initializeSavePilotRow({ id: 2, level: 99, mp: 0, mindGrowth: 0 }, parsed);
  assert.equal((level99[4] << 8) | level99[5], 0);
  assert.equal((level99[6] << 8) | level99[7], 196);
  assert.equal((level99[10] << 8) | level99[11], 193);
});

test('SP is clamped after accumulation', () => {
  const row = initializeSavePilotRow({ id: 3, level: 2, mp: 999, mindGrowth: 15 }, growth());
  assert.equal((row[10] << 8) | row[11], 999);
});

test('ordinary and permitted subpilot rows differ only in state bit 8', () => {
  const parsed = growth();
  const ordinary = initializeSavePilotRow({ id: 399, level: 1, mp: 10, mindGrowth: 0 }, parsed);
  const subpilot = initializeSavePilotRow({ id: 399, level: 1, mp: 10, mindGrowth: 0, subpilot: true }, parsed);
  assert.deepEqual([...ordinary.slice(0, 3)], [...subpilot.slice(0, 3)]);
  assert.equal(ordinary[3], 16);
  assert.equal(subpilot[3], 24);
  assert.deepEqual([...ordinary.slice(4)], [...subpilot.slice(4)]);
});

test('missing, unsupported, self-referential, overlapping, and short nested shapes are unsupported', () => {
  assert.deepEqual(readSavePilotGrowth([], { gameId: 'srwf-final' }), { supported: false });
  assert.deepEqual(readSavePilotGrowth(fixture().segments, { gameId: 'unsupported' }), { supported: false });
  const self = fixture(); pointer(self.bytes, 0, 0);
  assert.deepEqual(readSavePilotGrowth(self.segments, { gameId: 'srwf-final' }), { supported: false });
  const overlap = fixture(); pointer(overlap.bytes, 4, 8);
  assert.deepEqual(readSavePilotGrowth(overlap.segments, { gameId: 'srwf-final' }), { supported: false });
  const shortCurve = fixture(); pointer(shortCurve.bytes, shortCurve.growthPointers[6], 13950);
  assert.deepEqual(readSavePilotGrowth(shortCurve.segments, { gameId: 'srwf-final' }), { supported: false });
});

test('exactly shared complete curves are supported, while partial curve overlaps are rejected', () => {
  const shared = fixture();
  pointer(shared.bytes, shared.growthPointers[6] + 4, shared.curves + 6 * 16 * 99);
  const parsed = readSavePilotGrowth(shared.segments, { gameId: 'srwf-final' });
  assert.equal(parsed.supported, true);
  assert.deepEqual(parsed.spCurves[0], parsed.spCurves[1]);

  const partial = fixture();
  pointer(partial.bytes, partial.growthPointers[6] + 4, partial.curves + 6 * 16 * 99 + 1);
  assert.deepEqual(readSavePilotGrowth(partial.segments, { gameId: 'srwf-final' }), { supported: false });
});

test('a curve pointer into another category pointer table is unsupported', () => {
  const malformed = fixture();
  pointer(malformed.bytes, malformed.growthPointers[6], malformed.growthPointers[3]);
  assert.deepEqual(readSavePilotGrowth(malformed.segments, { gameId: 'srwf-final' }), { supported: false });
});

test('catalog admits only valid regular rows and derives ALICE from donor 246 and crew configuration', () => {
  const segments=fixture().segments;
  const pilots=[
    {recordIndex:246,recordKind:'regular',name:'donor',identity:'pilot:246',mp:41,mindGrowth:7},
    {recordIndex:12,recordKind:'regular',name:'normal',identity:'pilot:12',mp:20,mindGrowth:2},
    {recordIndex:302,recordKind:'regular',name:'hero',identity:'pilot:302',mp:20,mindGrowth:2},
    {recordIndex:13,recordKind:'alias-group',name:'alias',identity:'pilot:13',mp:20,mindGrowth:2},
    {recordIndex:14,recordKind:'regular',name:'bad',identity:'pilot:14',mp:1000,mindGrowth:2},
  ];
  const normal=createSavePilotCatalog(segments,pilots,{gameId:'srwf-final'});
  assert.deepEqual(normal.pilots.map(p=>p.id),[246,12]);
  const alice=createSavePilotCatalog(segments,pilots,{gameId:'srwf-final',alice:{enabled:true,crew:{enabled:true,spBase:25}}});
  assert.deepEqual(alice.pilots.at(-1),{id:399,name:'ALICE',identity:'alice:1:5da1cb369e658ae5e45c667d54c24416fbc28a23702c8a1bd64509df64655382',mp:25,mindGrowth:7,subpilot:true});
  assert.equal(createSavePilotCatalog([],pilots,{gameId:'srwf-final'}),null);
  assert.deepEqual(createSavePilotCatalog(segments,pilots,{gameId:'srwf-f'}).pilots.map(p=>p.id),[246,12]);
});

test('invalid initializer values and malformed supplied growth throw rather than silently creating rows', () => {
  const parsed = growth();
  for (const pilot of [
    { id: 0, level: 1, mp: 0, mindGrowth: 0 },
    { id: 1, level: 100, mp: 0, mindGrowth: 0 },
    { id: 1, level: 1, mp: '0', mindGrowth: 0 },
    { id: 1, level: 1, mp: 0, mindGrowth: 16 },
    { id: 1, level: 1, mp: 0, mindGrowth: 0, subpilot: true },
  ]) assert.throws(() => initializeSavePilotRow(pilot, parsed));
  assert.throws(() => initializeSavePilotRow({ id: 1, level: 1, mp: 0, mindGrowth: 0 }, { experience: [], spCurves: [] }));
});

test('dependent catalog binds both transform forms to each inspected family coordinate',()=>{
 const source=fixture().segments,rows=[{recordIndex:246,recordKind:'regular',name:'donor',identity:'pilot:246',mp:25,mindGrowth:1}];
 const units=[
  {recordIndex:300,srw4Native:true,construction:{preset:'s-gundam'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:0},
  {recordIndex:301,srw4Native:true,construction:{preset:'s-g-cruiser'},constructionGroup:'s-cruiser',constructionGroupRoot:300,saveUnitKind:1,saveUnitForm:1},
  {recordIndex:310,srw4Native:true,construction:{preset:'ex-s-gundam'},constructionGroup:'ex-s-cruiser',constructionGroupRoot:310,saveUnitKind:1,saveUnitForm:0},
  {recordIndex:311,srw4Native:true,construction:{preset:'g-cruiser'},constructionGroup:'ex-s-cruiser',constructionGroupRoot:310,saveUnitKind:1,saveUnitForm:1},
 ];
 const result=createSavePilotCatalog(source,rows,{gameId:'srwf-final',units,alice:{enabled:true,crew:{enabled:true,spBase:25,unitIds:[300,301,310,311]}}});
 assert.deepEqual(result.aliceDependent,{pilotId:399,targetIds:[300,301,310,311],roots:[300,310],families:[{root:300,members:[300,301]},{root:310,members:[310,311]}]});
 const incomplete=createSavePilotCatalog(source,rows,{gameId:'srwf-final',units,alice:{enabled:true,crew:{enabled:true,spBase:25,unitIds:[300,310]}}});assert.equal(incomplete.aliceDependent,undefined);
});
