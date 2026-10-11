import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { buildEditorRows, decodeEditorName, splitRootSegments } from '../assets/editor-core.mjs';
import { F_NAME_MAP, FINAL_NAME_MAP } from '../assets/editor-name-map.mjs';
import { FINAL_PILOT_NAME_MAP, F_NAME_SUPPLEMENT } from '../assets/editor-pilot-name-map.mjs';

// Skill and unit-ability glyph codes that the legacy Final table lacked; each was the second or later glyph of an
// ability name, so the whole name decoded as blank. See the evidence comment next to the map.
const FINAL_ABILITY_GLYPHS = [
  ['ED1F', '화'], ['ED60', '간'], ['EEF3', '저'], ['EF7A', '경'], ['ED68', '지'],
  ['EE09', '수'], ['EFAC', '재'], ['ED5F', '신'], ['EF15', '주'], ['EC80', '변'],
];

test('every added Final ability glyph is mapped, and the F table gives the same syllable', () => {
  for (const [code, syllable] of FINAL_ABILITY_GLYPHS) {
    assert.equal(FINAL_NAME_MAP.get(code), syllable, code);
    assert.equal(F_NAME_MAP.get(code), syllable, `${code} agrees with the F table`);
  }
  assert.equal(new Set(FINAL_ABILITY_GLYPHS.map(([code]) => code)).size, FINAL_ABILITY_GLYPHS.length);
});

test('a name made of the added codes decodes completely instead of reporting an unknown glyph', () => {
  const sequence = FINAL_ABILITY_GLYPHS.map(([code]) => Number.parseInt(code, 16));
  const cell = new Uint8Array(4 + sequence.length * 2 + 1);
  new DataView(cell.buffer).setInt32(0, 4);
  sequence.forEach((value, index) => { cell[4 + index * 2] = value >> 8; cell[5 + index * 2] = value & 0xff; });
  cell[cell.length - 1] = 0xff;
  const result = decodeEditorName(cell, { start: 0, end: 4 }, 0, FINAL_NAME_MAP);
  assert.equal(result.status, 'decoded');
  assert.equal(result.text, FINAL_ABILITY_GLYPHS.map(([, syllable]) => syllable).join(''));
  // the same bytes were an unknown glyph for a table without the additions
  const withoutAdditions = new Map([...FINAL_NAME_MAP].filter(([code]) => !FINAL_ABILITY_GLYPHS.some(([added]) => added === code)));
  const before = decodeEditorName(cell, { start: 0, end: 4 }, 0, withoutAdditions);
  assert.deepEqual([before.status, before.glyphCode], ['unknown-glyph', FINAL_ABILITY_GLYPHS[0][0]]);
});

test('the shared two-byte codes of the F and Final tables are not disturbed by the additions', () => {
  // Spot anchors that both tables agree on (used by the same ability names).
  for (const code of ['ED7A', 'ED82', 'EC2C', 'EC33', 'EFB5', 'ED67']) {
    assert.equal(FINAL_NAME_MAP.get(code), F_NAME_MAP.get(code), code);
  }
});

// ---- glyph-map audit corrections ------------------------------------------------------------------------------------
// Font-atlas audit (root table 36, 32-byte cells, cell = code - 0xEB00): five stale readings were found where the cell of
// a code draws one syllable but a map read another. Synthetic checks on the maps only; the atlas comparison itself runs
// below when real decoded tables are available.
const encodeName = (codes) => {
  // one pointer cell (relative +4) followed by the glyph tokens and the 0xFF terminator
  const tokens = [];
  for (const code of codes) {
    const value = Number.parseInt(code, 16);
    if (code.length === 4) tokens.push(value >> 8, value & 0xff); else tokens.push(value);
  }
  const bytes = new Uint8Array(4 + tokens.length + 1);
  new DataView(bytes.buffer).setInt32(0, 4);
  bytes.set(tokens, 4);
  bytes[bytes.length - 1] = 0xff;
  return bytes;
};
const decodeWith = (codes, map) => decodeEditorName(encodeName(codes), { start: 0, end: 4 }, 0, map);

test('the cell the F table reads as 개 is read the same way by both Final tables', () => {
  assert.equal(F_NAME_MAP.get('EC4A'), '개');
  assert.equal(FINAL_NAME_MAP.get('F30B'), '개');
  assert.equal(FINAL_PILOT_NAME_MAP.get('F30B'), '개');
  // the unit name ending of the Final lanes and the pilot name ending now spell the same letter as the F lanes
  assert.equal(decodeWith(['F30B'], FINAL_NAME_MAP).text, '개');
  assert.equal(decodeWith(['F30B'], FINAL_PILOT_NAME_MAP).text, '개');
});

test('the short name of Final pilots 306 and 307 reads as one name, not as two stock kanji', () => {
  assert.equal(FINAL_PILOT_NAME_MAP.get('EC50'), '이');
  assert.equal(FINAL_PILOT_NAME_MAP.get('F409'), '룸');
  assert.equal(FINAL_NAME_MAP.get('EC50'), '이');
  assert.equal(FINAL_NAME_MAP.get('F409'), '룸');
  assert.equal(decodeWith(['EC50', 'F409'], FINAL_PILOT_NAME_MAP).text, '이룸');
  // the legacy bank spells 이 with EEFF as well; both codes agree
  assert.equal(FINAL_PILOT_NAME_MAP.get('EEFF'), '이');
});

test('the F supplement reads the cell of F160 as the syllable the Final pilot table reads for the same drawing', () => {
  assert.equal(F_NAME_SUPPLEMENT.get('F160'), '냠');
  assert.equal(FINAL_PILOT_NAME_MAP.get('EC90'), '냠');
  assert.equal(decodeWith(['F160', 'F160'], new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP])).text, '냠냠');
});

// ---- real atlas check (skipped without prepared decoded tables) -----------------------------------------------------
// SRWF_GOLDEN_TSR_DIR holds <lane>.TSR.dec for the accepted lanes. For every font variant (a, b, c) with both games
// present, every two-byte code that a name table of either lane actually uses is read through the map that the editor
// applies to that table; all (game, map, code) entries whose atlas cell is bit-identical must read as the same
// character. This is the check that found the five stale readings corrected above.
const GOLDEN_DIR = process.env.SRWF_GOLDEN_TSR_DIR;
const CELL_COUNTS = {
  'srwf-f': { 11: 368, 12: 400, 13: 400, 14: 1280, 16: 94, 17: 59, 18: 18 },
  'srwf-final': { 11: 448, 12: 400, 13: 400, 14: 1344, 16: 94, 17: 52, 18: 19 },
};
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();

function usedGlyphCodes(decoded, root, gameId) {
  const used = new Map(); // `${map}:${code}` -> where
  for (const [table, count] of Object.entries(CELL_COUNTS[gameId])) {
    const segment = root[Number(table)];
    for (let index = 0; index < count; index += 1) {
      const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.length);
      const target = segment.start + index * 4 + view.getInt32(segment.start + index * 4);
      for (let cursor = target; cursor < decoded.length && decoded[cursor] !== 0xff && cursor < target + 161;) {
        const wide = decoded[cursor] >= 0xeb && decoded[cursor] <= 0xf5;
        if (wide) {
          const map = gameId === 'srwf-final' && (table === '12' || table === '13') ? 'pilot' : 'unit';
          used.set(`${map}:${hex(decoded.subarray(cursor, cursor + 2))}`, `${table}#${index}`);
        }
        cursor += wide ? 2 : 1;
      }
    }
  }
  return used;
}

for (const variant of ['a', 'b', 'c']) {
  const lanes = { 'srwf-f': `f-v0.5-${variant}`, 'srwf-final': `final-v0.3-${variant}` };
  const available = Boolean(GOLDEN_DIR) && Object.values(lanes).every((lane) => fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
  test(`golden font variant ${variant}: no two used codes with the same atlas cell read as different characters`, { skip: !available }, () => {
    const classes = new Map(); // atlas cell bytes -> Map(character -> entries)
    const unmapped = [];
    for (const [gameId, lane] of Object.entries(lanes)) {
      const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
      const root = splitRootSegments(decoded);
      assert.equal(root[36].bytes.length, 90112, 'the two-byte glyph atlas is 2816 cells of 32 bytes');
      const maps = gameId === 'srwf-final'
        ? { unit: FINAL_NAME_MAP, pilot: FINAL_PILOT_NAME_MAP }
        : { unit: new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]), pilot: new Map([...F_NAME_SUPPLEMENT, ...F_NAME_MAP]) };
      for (const key of usedGlyphCodes(decoded, root, gameId).keys()) {
        const [mapName, code] = key.split(':');
        const character = maps[mapName].get(code);
        if (character === undefined) { unmapped.push(`${gameId}:${mapName}:${code}`); continue; }
        const cell = hex(root[36].bytes.subarray((Number.parseInt(code, 16) - 0xeb00) * 32, (Number.parseInt(code, 16) - 0xeb00) * 32 + 32));
        if (!classes.has(cell)) classes.set(cell, new Map());
        const readings = classes.get(cell);
        if (!readings.has(character)) readings.set(character, []);
        readings.get(character).push(`${gameId}:${mapName}:${code}`);
      }
    }
    const conflicts = [...classes.values()].filter((readings) => readings.size > 1)
      .map((readings) => Object.fromEntries(readings));
    assert.deepEqual(conflicts, [], 'one drawing, two readings');
    // the only used code without a reading is a blank cell in the F spirit table that no editor view reads
    assert.deepEqual(unmapped, ['srwf-f:unit:F030']);
  });
}

for (const [lane, gameId] of [['f-v0.5-a', 'srwf-f'], ['final-v0.3-c', 'srwf-final']]) {
  const available = Boolean(GOLDEN_DIR) && fs.existsSync(`${GOLDEN_DIR}/${lane}.TSR.dec`);
  test(`golden ${lane}: the corrected readings reach the rows`, { skip: !available }, () => {
    const decoded = new Uint8Array(fs.readFileSync(`${GOLDEN_DIR}/${lane}.TSR.dec`));
    const { units, pilots } = buildEditorRows(splitRootSegments(decoded), decoded, gameId);
    const pilot = (id) => pilots.find((row) => row.recordIndex === id);
    const unit = (id) => units.find((row) => row.recordIndex === id);
    if (gameId === 'srwf-final') {
      assert.deepEqual([306, 307].map((id) => pilot(id).shortName), ['이룸', '이룸']);
      assert.ok([75, 80, 184, 278, 280, 338, 339].every((id) => unit(id).name.endsWith('개')));
      assert.ok([246, 372, 373, 374, 381, 393, 394].every((id) => pilot(id).name.endsWith('개')));
      assert.ok(pilot(140).name.includes('냠'));
    } else {
      assert.ok(pilot(246).name.endsWith('개'));
      assert.ok(pilot(140).name.includes('냠'));
    }
  });
}
