// A synthetic game on a synthetic disc, and the editor trust that lists it, shared by the tests of the opening path.
// Nothing here is game data: every byte is generated from a seed or spelled out by a test.
import { createEditorInspector } from '../../assets/editor-core.mjs';
import {
  NAME, SKILL_CELLS, SPIRIT_CELLS, UNIT_ABILITY_CELLS, nameTable, pilotRecord, recordTable, unitRecord, weaponRecord, world,
} from './synthetic-tsr.mjs';
import { buildDisc, mulberry32, packGreedy } from './synthetic-iso.mjs';

export const GAME = 'srwf-final';
export const PRODUCT = '20612G';
export const GROUP = 'synthetic-final-9';
// The same synthetic game can be a Final or an F disc: only the game id, the Saturn product code and the release family differ.
export const F_GAME = 'srwf-f';
export const F_GROUP = 'synthetic-f-9';
const PRODUCTS = { [GAME]: PRODUCT, [F_GAME]: '20610G' };
const GROUPS = { [GAME]: GROUP, [F_GAME]: F_GROUP };
const digit = (index) => [0x30 + (index % 10), 0xff]; // glyph codes the Final table reads as full-width digits

// A synthetic game: `units` random units, a few pilots (the pilots 1 and 2 share one record), three weapons, an unused unit

// `pilotTable` replaces the small default pilot table: { records, cellToRecord } like pilotWorld in synthetic-tsr.mjs (the
// pilot names are made up from the cell number).
// `unitAbilities` gives units their ability pairs: { [unit number]: [[id, condition flag number], ...] } (at most four).
export function buildGame({ units = 300, seed = 7, pilotTail = null, pilotTable = null, unitAbilities = {}, rewardTable = null, terrainTable = null } = {}) {
  if (terrainTable && !rewardTable) rewardTable = recordTable(Array(48).fill(0), [Uint8Array.of(255, 255)]);
  const next = mulberry32(seed);
  const random16 = () => Math.floor(next() * 65536);
  const unitRecords = [unitRecord({ hp: 0, en: 0, armor: 0 })];
  for (let index = 1; index <= units; index += 1) {
    const record = unitRecord({ field: index % 300, graphic: (index % 200) + 1, hp: random16(), en: random16(), armor: random16() });
    const speed = random16();
    const limit = random16();
    record[30] = speed >> 8; record[31] = speed & 255; record[32] = limit >> 8; record[33] = limit & 255;
    unitRecords.push(record);
  }
  for (const [number, pairs] of Object.entries(unitAbilities)) {
    pairs.forEach(([id, aux], slot) => { unitRecords[Number(number)][38 + 2 * slot] = id; unitRecords[Number(number)][39 + 2 * slot] = aux; });
  }
  unitRecords.push(unitRecord({ graphic: 0, hp: 2300, en: 255, armor: 100 })); // an unfinished template without a name
  const unitNames = [NAME.DASH, ...Array.from({ length: units }, (_, index) => digit(index)), NAME.EMPTY];
  const real = weaponRecord('0020000000012c0730010103cf00000a00');
  const filler = weaponRecord('00200000000000f6010101ff0000000000');
  const pilotCells = pilotTable ? pilotTable.cellToRecord.length : 4;
  const pilotNames = Array.from({ length: pilotCells }, (_, cell) => (cell === 0 ? NAME.DASH : digit(cell)));
  const parts = {
    ...(terrainTable ? { 19: nameTable(Array.from({ length: (terrainTable.byteLength - 16 - new DataView(terrainTable.buffer, terrainTable.byteOffset).getInt32(16)) / 2 }, (_, id) => digit(id))), 34: terrainTable } : {}),
    ...(rewardTable ? { 15: nameTable(Array.from({ length: 23 }, (_, id) => digit(id))), 32: rewardTable } : {}),
    11: nameTable(unitNames),
    12: nameTable(pilotNames),
    13: nameTable(pilotNames),
    14: nameTable([NAME.DASH, digit(4), NAME.EMPTY]),
    16: nameTable(SPIRIT_CELLS),
    17: nameTable(SKILL_CELLS),
    18: nameTable(UNIT_ABILITY_CELLS),
    27: recordTable(unitRecords.map((_, index) => index), unitRecords),
    28: pilotTable
      ? recordTable(pilotTable.cellToRecord, pilotTable.records)
      : recordTable([0, 0, 0, 1], [pilotRecord({ header: [0x14, 1, 0, 0], atk: 0 }), pilotRecord(pilotTail ? { tail: pilotTail } : {})]),
    29: recordTable([0, 1, 2], [new Uint8Array(17), real, filler]),
  };
  return world(parts, { rooted: true }).decoded;
}

export const descriptorFor = (disc, extra = {}) => ({
  gameId: GAME, targetSize: disc.image.length, targetSha256: disc.sha256, imageKind: 'accepted', ...extra,
});
export const trustFor = (disc, profiles = [], gameId = GAME) => ({
  targets: { [disc.sha256]: { gameId, size: disc.image.length, releaseId: `${GROUPS[gameId]}-a` } },
  profiles,
  latestGroups: { [F_GAME]: F_GROUP, [GAME]: GROUP },
});

export async function makeBase({ gameId = GAME, ...options } = {}) {
  const decoded = buildGame(options);
  const stream = packGreedy(decoded);
  const disc = buildDisc({ slot: stream, product: PRODUCTS[gameId] });
  const inspector = createEditorInspector(trustFor(disc, [], gameId));
  const opened = await inspector.inspectPatchedImage(disc.blob, descriptorFor(disc, { gameId }));
  const profile = await inspector.createEditorProvenanceProfile(opened.session);
  const full = createEditorInspector(trustFor(disc, [profile], gameId));
  return { gameId, decoded, stream, disc, inspector, opened, profile, full };
}
