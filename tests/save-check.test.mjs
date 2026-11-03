import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSaveBytes, repairSaveBytes } from '../assets/save-check.mjs';
import { openSave, saveChecksum } from '../assets/save-core.mjs';
import { syntheticSave } from './helpers/synthetic-save.mjs';

const catalog = { gameId: 'srwf-final', units: Array.from({ length: 447 }, (_, i) => ({ recordIndex: i })), pilots: Array.from({ length: 400 }, (_, i) => ({ recordIndex: i })) };
const record = { gameId: 'srwf-final', upgradeLimit: 5 };
const unit = (b, slot, id, pilotSlot = 255, linkedSlot = 255) => { const u = 0x100 + slot * 30; b.fill(0, u, u + 30); b[u] = id >> 8; b[u + 1] = id & 255; b[u + 2] = 0x40; b[u + 15] = pilotSlot; b[u + 16] = linkedSlot; };
const pilot = (b, slot, id, level = 10) => { const p = 0x1000 + slot * 12; b.fill(0, p, p + 12); b[p] = id >> 8; b[p + 1] = id & 255; b[p + 2] = level; };
function clean() { const b = new Uint8Array(0x1600); pilot(b, 0, 74); pilot(b, 1, 75); unit(b, 0, 168, 0); unit(b, 1, 169, 1); return b; }

test('a well-formed save has no issues and is never changed by a repair', () => {
  const b = clean(), copy = b.slice();
  assert.deepEqual(checkSaveBytes(b, record, catalog), []);
  assert.equal(repairSaveBytes(b, record, catalog), 0);
  assert.deepEqual(b, copy);
});

test('Action Replay style damage is found and repaired into a save that checks clean', () => {
  const b = clean();
  unit(b, 2, 900, 0);            // unit id beyond the ROM table
  unit(b, 3, 170, 40);           // boards an empty pilot slot
  unit(b, 4, 171, 200, 77);      // pilot slot out of range, link to an empty slot
  unit(b, 5, 172, 255, 2);       // links to the broken unit that will be cleared
  b[0x100 + 6 * 30] = 0; unit(b, 6, 173); b[0x100 + 6 * 30 + 3] = 0xF0; // HP upgrade nibble 15 (bits 7-10 of +3)
  b[0x100 + 6 * 30 + 17] = 99;   // part id out of range
  pilot(b, 2, 4000);             // pilot id beyond the ROM table
  unit(b, 7, 174, 2);            // boards that pilot
  pilot(b, 3, 76, 0);            // level 0
  const kinds = checkSaveBytes(b, record, catalog).filter(i => i.level === 'error').map(i => `${i.type}:${i.slot}`);
  for (const k of ['unit:2', 'unit:3', 'unit:4', 'unit:6', 'pilot:2', 'pilot:3']) assert.ok(kinds.includes(k), k);
  assert.ok(repairSaveBytes(b, record, catalog) > 0);
  assert.deepEqual(checkSaveBytes(b, record, catalog).filter(i => i.level === 'error'), []);
  assert.equal(b[0x100 + 2 * 30], 0); assert.equal(b[0x100 + 2 * 30 + 1], 0);
  assert.equal(b[0x100 + 5 * 30 + 16], 255, 'a link to a cleared unit is detached');
  assert.equal(b[0x100 + 7 * 30 + 15], 255, 'a boarding of a cleared pilot is detached');
  assert.equal(b[0x1000 + 3 * 12 + 2], 1);
});

test('duplicate pilots and weapon nibbles are warnings and left untouched', () => {
  const b = clean(); pilot(b, 2, 74); b[0x100 + 7] = 0xB0;
  const issues = checkSaveBytes(b, record, catalog);
  assert.deepEqual(issues.map(i => i.level), ['warn', 'warn']);
  const copy = b.slice(); repairSaveBytes(b, record, catalog); assert.deepEqual(b, copy);
});

test('without a ROM catalog of the same game only ROM-independent checks run', () => {
  const b = clean(); unit(b, 2, 900, 40);
  const issues = checkSaveBytes(b, record, { gameId: 'srwf-f', units: catalog.units, pilots: catalog.pilots });
  assert.deepEqual(issues.map(i => i.message.startsWith('탑승')), [true]);
});

test('the save session repairs a slot, keeps the checksum valid and lists removals in the diff', async () => {
  const data = syntheticSave();
  const session = await openSave(data.raw.slice(), catalog);
  const key = session.list()[0].key;
  const payload = data.payload.slice(); unit(payload, 9, 900); payload.set([0, 0, 0, 0], 0);
  const n = saveChecksum(payload); payload[0] = n >>> 24; payload[1] = (n >>> 16) & 255; payload[2] = (n >>> 8) & 255; payload[3] = n & 255;
  const raw = data.raw.slice(); data.payloadPositions.forEach((p, i) => { raw[p] = payload[i]; });
  const broken = await openSave(raw, catalog);
  assert.ok(broken.check(key).some(i => i.level === 'error'));
  assert.equal(broken.repair(key) >= 1, true);
  assert.deepEqual(broken.check(key).filter(i => i.level === 'error'), []);
  assert.ok(broken.diff().some(c => c.field === 'unitRemoved' && c.id === 900));
  const out = await broken.exportFile();
  const reopened = await openSave(out, catalog);
  assert.deepEqual(reopened.check(key).filter(i => i.level === 'error'), []);
  assert.equal(reopened.list()[0].editable, true);
});
