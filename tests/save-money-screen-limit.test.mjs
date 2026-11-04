import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { checkSaveBytes, repairSaveBytes } from '../assets/save-check.mjs';
import { SAVE_MONEY_SCREEN_MAX, SAVE_SCALAR_RULES, requireSaveScalar } from '../assets/save-field-rules.mjs';
import { openSave, saveChecksum } from '../assets/save-core.mjs';
import { syntheticSave } from './helpers/synthetic-save.mjs';

const record = { gameId: 'srwf-final', upgradeLimit: 5 };
const setMoney = (b, v) => { b[10] = v >>> 16; b[11] = (v >>> 8) & 255; b[12] = v & 255; };
const money = b => b[10] * 65536 + b[11] * 256 + b[12];

test('save money: a changed value must fit the 7-digit field the load list prints it in', () => {
  assert.equal(SAVE_MONEY_SCREEN_MAX, 9999999);
  assert.equal(SAVE_SCALAR_RULES.money.max, 9999999);
  assert.equal(requireSaveScalar('money', 9999999), 9999999);
  assert.equal(requireSaveScalar('money', 0), 0);
  assert.throws(() => requireSaveScalar('money', 10000000), /9,999,999/);
  assert.throws(() => requireSaveScalar('money', 0xffffff), /게임을 멈추고/);
  assert.throws(() => requireSaveScalar('money', -1));
  // A stored value above the field may be kept as it is, a different one may not.
  assert.equal(requireSaveScalar('money', 12000000, 12000000), 12000000);
  assert.throws(() => requireSaveScalar('money', 12000001, 12000000));
  assert.throws(() => requireSaveScalar('money', 0x1000000, 0x1000000), 'the record holds 24 bits');
});

test('save money: the input field carries the screen limit', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="saveMoney" type="number" min="0" max="9999999"/);
  assert.doesNotMatch(html, /16777215/);
});

test('save check: money over 9,999,999 is an error and the repair lowers it to 9,999,999', () => {
  const b = new Uint8Array(0x1600);
  setMoney(b, 9999999);
  assert.deepEqual(checkSaveBytes(b, record), []);
  setMoney(b, 10000000);
  const issues = checkSaveBytes(b, record);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].level, 'error'); assert.equal(issues[0].type, 'money');
  assert.deepEqual(issues[0].fix, { kind: 'money', value: 9999999 });
  setMoney(b, 0xffffff);
  const copy = b.slice();
  assert.equal(repairSaveBytes(b, record), 1);
  assert.equal(money(b), 9999999);
  copy.set(b.subarray(10, 13), 10); assert.deepEqual(b, copy, 'only the three money bytes change');
  assert.deepEqual(checkSaveBytes(b, record), []);
});

async function brokenSave(value) {
  const data = syntheticSave();
  const payload = data.payload.slice(); setMoney(payload, value);
  const n = saveChecksum(payload); payload[0] = n >>> 24; payload[1] = (n >>> 16) & 255; payload[2] = (n >>> 8) & 255; payload[3] = n & 255;
  const raw = data.raw.slice(); data.payloadPositions.forEach((p, i) => { raw[p] = payload[i]; });
  return raw;
}

test('save session: an unchanged stored money may be echoed, a new wide one is refused, repair fixes it', async () => {
  const s = await openSave(await brokenSave(15000000));
  const key = s.list()[0].key;
  assert.equal(s.list()[0].money, 15000000);
  s.edit(key, 'money', 15000000);
  assert.deepEqual(s.diff(), []);
  assert.throws(() => s.edit(key, 'money', 15000001), /9,999,999/);
  assert.ok(s.check(key).some(i => i.type === 'money' && i.level === 'error'));
  const before = s.check(key).filter(i => i.level === "error" && i.type !== "money").length;
  assert.equal(s.repair(key), 1 + before);
  assert.equal(s.list()[0].money, 9999999);
  assert.deepEqual(s.check(key).filter(i => i.type === 'money'), []);
  const reopened = await openSave(await s.exportFile());
  assert.equal(reopened.list()[0].money, 9999999);
  assert.throws(() => reopened.edit(key, 'money', 10000000));
  reopened.edit(key, 'money', 9999999);
});
