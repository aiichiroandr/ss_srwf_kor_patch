// Read-only weapon -> animation dependency -> sprite mapping.
// The executable consumers, coordinate systems and limits are documented in
// docs/EDITOR_BATTLE_IMAGE_MAPPING.md. No name or editable stat selects a picture.

const GAMES = new Set(['srwf-f', 'srwf-final']);
const MODES = new Set(['attack', 'hit', 'evade', 'defense', 'destroyed']);
const SPRITE_SLOTS = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const HEADER_BYTES = 46;
const DIRECTORY_BYTES = 24 + 6 * 1024;

const u16 = (b, p) => b[p] * 256 + b[p + 1];
const u32 = (b, p) => b[p] * 0x1000000 + b[p + 1] * 0x10000 + b[p + 2] * 256 + b[p + 3];
const s16 = (b, p) => (u16(b, p) << 16) >> 16;
const le32 = (b, p) => u32(Uint8Array.of(b[p + 3], b[p + 2], b[p + 1], b[p]), 0);

function result(status, message, evidence = {}, assets = []) {
  return { status, assets, message, evidence };
}

function rootBytes(root, index, decodedTsr) {
  const segment = root?.[index];
  if (segment?.bytes instanceof Uint8Array) return segment.bytes;
  if (decodedTsr instanceof Uint8Array && Number.isSafeInteger(segment?.start)
    && Number.isSafeInteger(segment?.end) && segment.start >= 0 && segment.end <= decodedTsr.length
    && segment.end >= segment.start) return decodedTsr.subarray(segment.start, segment.end);
  return null;
}

function weaponSelector(bytes, recordIndex) {
  if (!bytes || bytes.length < 8 || !Number.isSafeInteger(recordIndex) || recordIndex < 1) return null;
  const tableEnd = u32(bytes, 0);
  const cell = recordIndex * 4;
  if (tableEnd < 8 || tableEnd % 4 || tableEnd > 16384 || tableEnd > bytes.length || cell + 4 > tableEnd) return null;
  // TSR pointers are relative to their own cell, unlike graphics bank pointers.
  const start = cell + (u32(bytes, cell) | 0);
  if (start < tableEnd || start + 17 > bytes.length) return null;
  let end = bytes.length;
  for (let pos = 0; pos < tableEnd; pos += 4) {
    const target = pos + (u32(bytes, pos) | 0);
    if (target < tableEnd || target >= bytes.length) return null;
    if (target > start && target < end) end = target;
  }
  if (end - start < 17) return null;
  return { selector: u16(bytes, start + 3), recordStart: start };
}

function pairSpan(directory, selector) {
  if (!directory || directory.length < DIRECTORY_BYTES || !Number.isInteger(selector)
    || selector < 0 || selector > 0x057f || (selector & 255) >= 128) return null;
  // Six absolute bank offsets, followed by 128 pairs per bank. These are file
  // offsets, not self-relative TSR pointers and not catalog table-cell indices.
  const bank = selector >>> 8;
  for (let group = 0; group < 6; group += 1) {
    if (u32(directory, group * 4) !== 24 + group * 1024) return null;
  }
  const cellOffset = u32(directory, bank * 4) + (selector & 255) * 8;
  const start = u32(directory, cellOffset);
  const end = u32(directory, cellOffset + 4);
  if (start < DIRECTORY_BYTES || end < start || end > MAX_FILE_BYTES) return null;
  return { start, end, bank, localIndex: selector & 255, cellOffset };
}

async function fileBytes({ battleFiles, readFile }, fileName) {
  const supplied = battleFiles instanceof Map ? battleFiles.get(fileName) : battleFiles?.[fileName];
  const value = supplied ?? (typeof readFile === 'function' ? await readFile(fileName) : null);
  if (value instanceof Uint8Array && value.length <= MAX_FILE_BYTES) return value;
  return null;
}

const DEFENSE_OPTIONS = [
  { id: 'beam-coating', label: '공통 빔코팅 표시', subIndex: 4, discriminator: 4 },
  { id: 'i-field', label: '공통 I필드 표시', subIndex: 6, discriminator: 8 },
  { id: 'aura-barrier', label: '공통 오라배리어 표시', subIndex: 7, discriminator: 12 },
  { id: 'at-field', label: '공통 AT필드 표시', subIndex: 8, discriminator: 1 },
  { id: 'ide-barrier', label: '공통 이데배리어 표시', subIndex: 11, discriminator: 2 },
];
const STATE_DEFENSE_OPTIONS = [{ id: 'shield', label: '실드 반응 그림' }, { id: 'parry', label: '베어내기 · 연결 미지원' }];

function relativeRecord(bytes, index, minimumLength = 1) {
  if (!bytes || bytes.length < 4 || !Number.isSafeInteger(index) || index < 0) return null;
  const tableEnd = u32(bytes, 0);
  const cell = index * 4;
  if (tableEnd < 4 || tableEnd % 4 || tableEnd > bytes.length || cell + 4 > tableEnd) return null;
  const start = cell + (u32(bytes, cell) | 0);
  if (start < tableEnd || start >= bytes.length) return null;
  let end = bytes.length;
  for (let p = 0; p < tableEnd; p += 4) {
    const target = p + (u32(bytes, p) | 0);
    if (target < tableEnd || target >= bytes.length) return null;
    if (target > start && target < end) end = target;
  }
  if (end - start < minimumLength) return null;
  return { start, end };
}

async function commonDisplayPlan(input) {
  const { gameId, mode, defenseId, unit, root, decodedTsr } = input;
  const options = DEFENSE_OPTIONS.map(({ id, label }) => ({ id, label }));
  const option = mode === 'defense' ? DEFENSE_OPTIONS.find((item) => item.id === defenseId) : null;
  const ability = mode === 'evade' && defenseId === 'afterimage';
  if (!option && !ability) return null;
  const rawUnits = rootBytes(root, 27, decodedTsr);
  const selected = relativeRecord(rawUnits, unit?.recordIndex, 50);
  if (!selected) return result('unmapped', '선택 기체의 원본 레코드를 확인할 수 없습니다.', { reason: 'unit-record-invalid' });
  let bytes;
  try { bytes = await fileBytes(input, 'BTSR.BIN'); }
  catch { return result('unmapped', '선택한 디스크에서 공통 전투 그림을 읽지 못했습니다.', { reason: 'common-file-unavailable' }); }
  // Native macro 05: outer cell 7's signed BE32 relative pointer, corrected
  // by +28 at the consumer, is decoded into frame cache group 16.
  const span = relativeRecord(bytes, 7, 8);
  if (!span || bytes[span.start] !== 0x70 || bytes[span.start + 1] !== 0x58) {
    return result('unmapped', '공통 전투 그림의 원본 참조를 확인할 수 없습니다.', { reason: 'common-display-record-invalid' });
  }
  const subIndex = option?.subIndex ?? ({ 0x00db: 1, 25: 2, 28: 3 }[unit.recordIndex] ?? 0);
  const evidence = {
    gameId, mode, scope: 'battle-scene-on-common-reaction-display',
    mapping: 'native-reaction-discriminator-to-cache16-to-BTSR-cell7',
    unitRecordIndex: unit.recordIndex, sourceFileName: 'BTSR.BIN', sourceTableCell: 7,
    frameCacheGroup: 16, subIndex, reaction: option?.id ?? 'evasion-ability',
    representativeCondition: option ? { animationRecordByte0: option.discriminator }
      : { outcomeFlags: 0x0400, hit: false },
    abilityAvailability: 'not-inferred', composition: 'display-sprite-only', timeline: 'not-reproduced',
  };
  return { ...result('ready', option ? option.label : '선택 기체의 공통 회피능력 표시', evidence,
    [{ fileName: 'BTSR.BIN', recordOffset: span.start, recordEnd: span.end, subIndex,
      role: 'common-reaction-display', sourceTableCell: 7, frameCacheGroup: 16,
    indexConvention: 'physical-file-byte-offset-and-image-subindex' }]), defenseOptions: mode === 'defense' ? options : [],
    evadeOptions: mode === 'evade' ? [{ id: 'afterimage', label: '공통 회피능력 표시' }] : [] };
}

// Verified native instruction widths, not a search for opcode-looking bytes.
// Unknown instructions stop this bounded reader. The renderer's two frame
// selectors and palette references deliberately use separate paths.
const MAIN_WIDTH = new Map(Object.entries({
  0: 0, 4: 0, 5: 2, 6: 0, 16: 0, 18: 1, 19: 1, 35: 0,
  36: 1, 37: 1, 38: 1, 40: 10, 41: 10, 42: 4, 43: 3, 44: 3,
  45: 10, 46: 10, 47: 11, 48: 10, 49: 6, 50: 3, 51: 3,
  52: 2, 54: 0, 55: 0, 56: 1, 105: 5, 106: 1, 107: 2,
  111: 6, 112: 1, 117: 0, 126: 1,
}).map(([key, value]) => [Number(key), value]));
const MACRO_WIDTH = new Map([[8, 2], [9, 1], [11, 3], [18, 4], [19, 4],
  [6, 1], [7, 1], [13, 1], [38, 2], [72, 1], [73, 1], [74, 1], [39, 2], [31, 1], [1, 2]]);
const ACTOR_WIDTH = new Map([[0xbf, 2], [0xc0, 2], [0xc1, 1], [0xc2, 1],
  [0xc3, 1], [0xc4, 1], [0xc5, 1], [0xc8, 4], [0xcc, 3], [0xed, 1],
  [0xfe, 1], [0xff, 1], [0xf5, 2], [0xf8, 4], [0xf9, 3], [0xe0, 7], [0xe1, 7],
  [0xc7, 1], [0xca, 6], [0xcd, 3], [0xfd, 4], [0xec, 1], [0xf6, 2],
  [0xf0, 12], [0xf1, 11], [0xf2, 5], [0xd8, 3], [0xf4, 2], [0xc9, 6]]);
const ACTOR_FA_WIDTH = new Map([[0x44, 6], [0x2c, 2], [0x2d, 2], [0xf6, 3],
  [0xf7, 3], [0xfa, 3], [0xba, 4], [0xbb, 2], [0xa7, 4], [0xf9, 2], [0xfc, 3],
  [0x10, 4], [0x16, 4], [0x17, 4], [0xd7, 2], [0xfb, 2], [0x46, 3],
  [0x45, 3], [0xc4, 7], [0xe6, 2], [0x06, 3]]);
// Shared with the local authoring reader. Widths alone do not authorize an
// operand edit: that module maintains a smaller native-proven field contract.
export function battleActorInstructionBytes(opcode, subopcode) {
  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 255) return null;
  if (opcode <= 0xbe) return 1;
  if (opcode === 0xfa) {
    if ([0x36,0x37,0x38,0x39,0x3a,0x3e,0xcf,0xee].includes(subopcode)) return 4;
    if ([0x3b,0xef].includes(subopcode)) return 6;
    return ACTOR_FA_WIDTH.get(subopcode) ?? null;
  }
  return ACTOR_WIDTH.get(opcode) ?? null;
}
const MAX_STEPS = 4096;

function representativeState(mode, defenseId, deathType) {
  let outcomeFlags = mode === 'evade' ? 0x0c00 : mode === 'defense' ? 0x4800 : mode === 'destroyed' ? 0x5000 : 0x4000;
  if (defenseId === 'parry') outcomeFlags = 0x0080;
  if (defenseId === 'shield') outcomeFlags = 0x4180;
  return { outcomeFlags, animationRecordByte0: deathType << 5, deathType,
    directionBit6: true, selectedBodyCacheGroup: 8, stageGuard: false,
    oppositeSupportPresent: false, oppositeOutcomeFlags: 0, supportPresent: false,
    sceneMetadataIndex: 0, sceneMetadataType: null, contextBit5: false, cache19Source: null };
}

function predicate(id, state, actor = false) {
  const flags = state.outcomeFlags;
  const predicates = actor ? {
    0x36: !!(flags & 0x4000), 0x37: !!(flags & 0x1000), 0x38: !(flags & 0x4000),
    0x39: !!(flags & 0x2000), 0x3a: (flags & 0x0c00) === 0x0400,
    0x3e: (flags & 0x0180) === 0x0080, 0xcf: (flags & 0x0180) !== 0x0180,
    0xd0: (state.animationRecordByte0 & 3) === 1,
    0xd1: (state.animationRecordByte0 & 3) === 1 && !!(flags & 0x0200),
    0xd3: !!(state.oppositeOutcomeFlags & 16) && !(state.oppositeOutcomeFlags & 4),
    0x3c: state.directionBit6 && !!(state.oppositeOutcomeFlags & 0x8000),
    0x3d: (state.animationRecordByte0 & 3) !== 1 && !!(state.animationRecordByte0 & 31) && !!(flags & 0x0200),
  } : {
    0x22: state.stageGuard, 0x34: !!(flags & 0x4000), 0x35: !!(flags & 0x1000),
    0x36: !(flags & 0x4000), 0x37: !!(flags & 0x2000),
    0x38: (flags & 0x0c00) === 0x0400,
    0x3a: (flags & 0x0180) === 0x0180, 0x3b: (flags & 0x0180) === 0x0180,
    0x3c: (flags & 0x0180) === 0x0080, 0x45: state.oppositeSupportPresent,
  };
  return Object.hasOwn(predicates, id) ? predicates[id] : null;
}

function sequenceSpan(record, index, common = false) {
  if (!record || !Number.isInteger(index) || index < 0) return null;
  const table = common ? 0 : le32(record, 4);
  if (table < 0 || table + 2 > record.length) return null;
  const first = u16(record, table);
  const tableLength = common ? first : first - table;
  if (tableLength < 2 || tableLength % 2 || table + tableLength > record.length
    || index * 2 >= tableLength) return null;
  const start = u16(record, table + index * 2) + (common ? table : 0);
  const minimum = table + tableLength;
  if (start < minimum || start >= record.length) return null;
  let end = record.length;
  for (let p = table; p < minimum; p += 2) {
    const target = u16(record, p) + (common ? table : 0);
    if (target < minimum || target > record.length) return null;
    if (target > start && target < end) end = target;
  }
  return { start, end };
}

// root0 nested cell3 has aliases/backward targets. Its first target is not its
// table size. Only the 24 independently validated program cells are consumed.
function commonProgram(root0, index) {
  if (!root0 || !Number.isInteger(index) || index < 0 || index >= 24 || root0.length < 16) return null;
  const table = 12 + (u32(root0, 12) | 0);
  if (table < 0 || table + 96 > root0.length) return null;
  const cell = table + index * 4;
  const start = cell + (u32(root0, cell) | 0);
  if (start < table + 96 || start >= root0.length) return null;
  let end = root0.length;
  for (let i = 0; i < 24; i += 1) {
    const p = table + i * 4;
    const target = p + (u32(root0, p) | 0);
    if (target < table + 96 || target >= root0.length) return null;
    if (target > start && target < end) end = target;
  }
  // Entry aliases can intentionally share a fallthrough tail with the next
  // physical program. Its native cursor is bounded by root0, not that entry.
  return { bytes: root0, start, end: root0.length, label: `TSR-root0-program-${index}` };
}

function traceMain(source, state, { root0, start = 46, end = le32(source, 4), label = 'D_ANIME', onSequence, diagnostics, mainEvidence, phase = { reaction: false } }, depth = 0) {
  if (depth > 12 || start < 0 || end > source.length || start >= end) {
    diagnostics.push({ source: label, reason: 'main-boundary-invalid' }); return false;
  }
  let pc = start;
  const returns = [];
  const visits = new Map();
  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    if (pc < start || pc >= end) { diagnostics.push({ source: label, pc, reason: 'main-cursor-outside-program' }); return false; }
    const visitCount = (visits.get(pc) ?? 0) + 1;
    visits.set(pc, visitCount);
    if (visitCount > 2) { diagnostics.push({ source: label, pc, reason: 'main-loop-gallery-bound' }); return false; }
    const opcode = source[pc]; const operand = pc + 1;
    if (opcode === 4) { if (returns.length) { pc = returns.pop(); continue; } return true; }
    if ([1, 2, 3, 10].includes(opcode)) {
      const width = opcode === 2 || opcode === 10 ? 4 : 2;
      if (operand + width > end) break;
      const displacement = width === 4 ? (u32(source, operand) | 0) : s16(source, operand);
      if (opcode === 3 || opcode === 10) returns.push(operand + width);
      pc = operand + displacement; continue;
    }
    if (opcode === 0x68) {
      if (operand >= end) break;
      const macro = source[operand];
      const value = predicate(macro, state);
      if (value !== null) {
        if (operand + 3 > end) break;
        const target = operand + 1 + s16(source, operand + 1);
        mainEvidence.push({ source: label, pc, predicate: macro, taken: value });
        if (macro >= 0x34 && macro <= 0x3c) phase.reaction = true;
        pc = value ? target : operand + 3; continue;
      }
      if (macro === 0x39 && !(state.animationRecordByte0 & 31)) { if (operand + 5 > end) break; pc = operand + 5; continue; }
      if (macro === 0x0c && (state.directionBit6 || (state.outcomeFlags & 0x0c00) > 0x0400)) { if (operand + 5 > end) break; pc = operand + 5; continue; }
      if (macro === 0x2f) {
        if (!Number.isInteger(state.sceneMetadataType) || operand + 13 > end) {
          diagnostics.push({ source: label, pc, reason: 'scene-metadata-context-unverified' }); return false;
        }
        const bits = state.unitByte10;
        const offset = state.sceneMetadataType === 0 ? (bits & 0x40 ? 11 : 1)
          : state.sceneMetadataType === 1 ? (bits & 0x20 ? 7 : 1)
            : bits & 0x10 ? 9 : bits & 8 ? 5 : bits & 4 ? 3 : 1;
        const cell = operand + offset;
        mainEvidence.push({ source: label, pc, macro, sceneMetadataIndex: state.sceneMetadataIndex,
          sceneMetadataType: state.sceneMetadataType, rawUnitByteOffset: 10, rawUnitByte: bits, branchCellOffset: offset });
        pc = cell + s16(source, cell); continue;
      }
      if (macro === 0x11) {
        if (!(state.outcomeFlags & 0x1000) || state.deathType > 4 || operand + 11 > end) {
          diagnostics.push({ source: label, pc, reason: 'death-switch-context-unverified' }); return false;
        }
        const offset = [3, 5, 5, 7, 9][state.deathType];
        const cell = operand + offset;
        pc = cell + s16(source, cell); continue;
      }
      const width = MACRO_WIDTH.get(macro);
      if (width === undefined || operand + width > end) {
        diagnostics.push({ source: label, pc, opcode, macro, reason: 'main-macro-unverified' }); return false;
      }
      if (macro === 0x0d) state.contextBit5 = !state.contextBit5;
      if (macro === 0x06) state.cache19Source = state.deathType >= 1 && state.deathType <= 4
        ? (state.deathType === 4 ? 16 : 10) : null;
      pc = operand + width; continue;
    }
    const width = MAIN_WIDTH.get(opcode);
    if (width === undefined || operand + width > end) {
      diagnostics.push({ source: label, pc, opcode, reason: 'main-opcode-unverified' }); return false;
    }
    if ([0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x32, 0x33].includes(opcode)) {
      const fixedActor = opcode === 0x2b || opcode === 0x32 ? 1 : opcode === 0x2c || opcode === 0x33 ? 4 : null;
      const actorId = fixedActor ?? source[operand];
      const offset = [0x2d, 0x2e, 0x2f].includes(opcode) ? 7 : fixedActor === null ? 1 : 0;
      onSequence({ actorId, sequence: u16(source, operand + offset), resetSelector: fixedActor === null,
        source: label, pc, reaction: phase.reaction });
    }
    if (opcode === 0x7e) {
      const program = commonProgram(root0, source[operand]);
      if (!program) { diagnostics.push({ source: label, pc, reason: 'common-program-unavailable', program: source[operand] }); return false; }
      if (!traceMain(program.bytes, state, { root0, ...program, onSequence, diagnostics, mainEvidence, phase }, depth + 1)) return false;
    }
    pc = operand + width;
  }
  diagnostics.push({ source: label, pc, reason: 'main-step-or-operand-bound' });
  return false;
}

function traceActor(record, span, initial, state, collect, diagnostics, source, copySelectors, childSequence) {
  let pc = span.start; let selector = initial;
  let changed = false;
  let selectorOrigin = 'inherited'; let highWritten = false; let lowWritten = false;
  let high = initial === null ? null : initial & 0xff00;
  let low = initial === null ? null : initial & 255;
  const sync = () => { selector = high === null || low === null ? null : high | low; };
  const assign = (value) => { selector = value; high = value === null ? null : value & 0xff00; low = value === null ? null : value & 255; };
  const visited = new Set();
  const emit = () => { if (selector !== null) collect(selector, { selectorOrigin }); };
  for (let steps = 0; steps < MAX_STEPS; steps += 1) {
    if (pc < span.start || pc >= span.end) { diagnostics.push({ source, pc, reason: 'actor-cursor-outside-sequence' }); return null; }
    if (visited.has(pc)) { diagnostics.push({ source, pc, reason: 'actor-loop-gallery-bound' }); return changed ? null : selector; }
    visited.add(pc);
    const opcode = record[pc];
    if (opcode <= 0xbe) { emit(); pc += 1; continue; }
    if (opcode === 0xfe) { emit(); return changed ? null : selector; }
    if (opcode === 0xff) return 0;
    if (opcode === 0xf9) { if (pc + 3 > span.end) break; pc = pc + 1 + s16(record, pc + 1); continue; }
    if (opcode === 0xf8) {
      if (pc + 4 > span.end) break;
      // Both loop body and exit are already on this linear gallery path. A
      // backward loop repeats its frames; forward loops need full counter state.
      const target = pc + 2 + s16(record, pc + 2);
      if (target > pc) { diagnostics.push({ source, pc, reason: 'forward-counter-loop-unverified' }); return null; }
      pc += 4; continue;
    }
    if (opcode === 0xfa) {
      if (pc + 2 > span.end) break;
      const sub = record[pc + 1]; const value = predicate(sub, state, true);
      if (value !== null) {
        if (pc + 4 > span.end) break;
        pc = value ? pc + 2 + s16(record, pc + 2) : pc + 4; continue;
      }
      if (sub === 0x3b && !(state.animationRecordByte0 & 31)) { if (pc + 6 > span.end) break; pc += 6; continue; }
      if (sub === 0xee) {
        if (pc + 4 > span.end) break;
        if ((state.outcomeFlags & 0x0c00) === 0x0400) {
          assign(0x1000 | ({ 0xdb: 1, 25: 2, 28: 3 }[state.unitRecordIndex] ?? 0)); emit(); pc += 4;
        } else pc = pc + 2 + s16(record, pc + 2);
        continue;
      }
      if (sub === 0xef && !(state.animationRecordByte0 & 31) && !(state.outcomeFlags & 0x2000)) {
        if (pc + 6 > span.end) break;
        assign(0); pc = pc + 2 + s16(record, pc + 2); continue;
      }
      const width = ACTOR_FA_WIDTH.get(sub);
      if (width === undefined || pc + width > span.end) { diagnostics.push({ source, pc, opcode: `FA${sub.toString(16)}`, reason: 'actor-opcode-unverified' }); return null; }
      if (sub === 0xf6) assign((state.directionBit6 ? 0x0900 : 0x0800) | record[pc + 2]);
      if (sub === 0xf7) assign((state.directionBit6 ? (state.supportPresent ? 0x0a00 : 0x0800) : (state.supportPresent ? 0x0b00 : 0x0900)) | record[pc + 2]);
      if (sub === 0xfa) assign((state.directionBit6 ? 0x0800 : 0x0900) | record[pc + 2]);
      if (sub === 0x2c || sub === 0x2d) assign(copySelectors.get(sub === 0x2c ? 1 : 4) ?? null);
      if ([0xf6, 0xf7, 0xfa].includes(sub)) selectorOrigin = 'explicit-selector';
      if (sub === 0x2c || sub === 0x2d) selectorOrigin = 'copy-selector';
      if ([0xf6, 0xf7, 0xfa, 0x2c, 0x2d].includes(sub)) changed = true;
      pc += width; continue;
    }
    const width = ACTOR_WIDTH.get(opcode);
    if (width === undefined || pc + width > span.end) { diagnostics.push({ source, pc, opcode, reason: 'actor-opcode-unverified' }); return null; }
    if (opcode === 0xbf) { high = record[pc + 1] << 8; highWritten = true; sync(); }
    if (opcode === 0xc0) { low = record[pc + 1]; lowWritten = true; sync(); }
    if ((opcode === 0xbf || opcode === 0xc0) && highWritten && lowWritten) selectorOrigin = 'paired-selector';
    if (opcode === 0xc1 || opcode === 0xc2) assign(selector === null ? null : (selector + (opcode === 0xc1 ? 1 : -1)) & 0xffff);
    if (opcode === 0xc7) {
      // The native reset walks a linked child list. This gallery does not
      // emulate that allocation graph; other actors' cached history can no
      // longer establish a copied/reused selector.
      for (const actorId of copySelectors.keys()) copySelectors.set(actorId, null);
      diagnostics.push({ source, pc, reason: 'linked-child-history-invalidated' });
    }
    if (opcode === 0xf6) {
      // A pending native global-flag wait yields to the renderer with the
      // current complete selector. Its scheduling/duration is not replayed.
      emit();
      diagnostics.push({ source, pc, reason: 'global-wait-timing-not-reproduced' });
    }
    if ([0xf0, 0xf1, 0xf2].includes(opcode)) {
      const offset = opcode === 0xf0 ? 9 : opcode === 0xf1 ? 8 : 2;
      const sequence = u16(record, pc + offset);
      if (record[pc + 1] & 0xc0) diagnostics.push({ source, pc, reason: 'child-relative-or-allocated-identity-unverified' });
      else if ((sequence & 0xf000) === 0xf000) childSequence?.(record[pc + 1], sequence);
      else diagnostics.push({ source, pc, reason: 'child-relative-sequence-unverified' });
    }
    if (opcode === 0xc8) {
      const target = pc + 1 + s16(record, pc + 1);
      // The secondary VM can OR the selector bank as well as change its low
      // byte. Without the native scheduler, later primary C0/BF writes cannot
      // establish which bank the renderer consumes. Preserve the verified
      // prefix and stop rather than label a stale bank as a state picture.
      diagnostics.push({ source, pc, reason: target < 0 || target >= record.length
        ? 'secondary-track-target-outside-record' : 'concurrent-frame-track-unverified' });
      return null;
    }
    if ([0xbf, 0xc0, 0xc1, 0xc2].includes(opcode)) changed = true;
    pc += width;
  }
  diagnostics.push({ source, pc, reason: 'actor-step-or-operand-bound' }); return null;
}

async function statePlan(input, animationRecord, spriteDirectory, evidence) {
  const { mode, defenseId, unit, root, decodedTsr } = input;
  const rawUnits = rootBytes(root, 27, decodedTsr);
  const selectedUnit = relativeRecord(rawUnits, unit?.recordIndex, 50);
  if (!selectedUnit) return result('unmapped', '상태 그림을 볼 기체를 선택하세요.', { ...evidence, scope: 'battle-scene-on', reason: 'unit-record-invalid' });
  const deathType = rawUnits[selectedUnit.start + 6] >>> 5;
  const state = representativeState(mode, defenseId, deathType);
  state.unitRecordIndex = unit.recordIndex;
  state.unitByte10 = rawUnits[selectedUnit.start + 10];
  const diagnostics = []; const mainEvidence = []; const references = [];
  const selectors = new Map([[1, 0x0800], [4, 0x0900]]);
  const root0 = rootBytes(root, 0, decodedTsr);
  let commonBytes = null; let commonActors = null;
  try { commonBytes = await fileBytes(input, 'BTSR.BIN'); } catch { /* a bounded weapon-only gallery can still resolve */ }
  const commonSpan = relativeRecord(commonBytes, 3, 2);
  if (commonSpan) commonActors = commonBytes.subarray(commonSpan.start, commonSpan.end);
  const sceneMetadata = relativeRecord(commonBytes, 0, 2);
  if (sceneMetadata && state.sceneMetadataIndex * 2 + 2 <= sceneMetadata.end - sceneMetadata.start) {
    state.sceneMetadataType = (commonBytes[sceneMetadata.start + state.sceneMetadataIndex * 2 + 1] >>> 5) & 3;
    state.sceneMetadataSource = { fileName: 'BTSR.BIN', sourceTableCell: 0,
      recordOffset: sceneMetadata.start, entryIndex: state.sceneMetadataIndex, entryByteOffset: 1 };
  }
  let childDepth = 0;
  const onSequence = ({ actorId, sequence, resetSelector, source, pc, reaction }) => {
    if (childDepth > 12) { diagnostics.push({ source, pc, reason: 'child-depth-bound' }); return; }
    const common = (sequence & 0xf000) === 0xf000;
    const index = common ? sequence & 255 : sequence;
    const record = common ? commonActors : animationRecord;
    const span = sequenceSpan(record, index, common);
    if (!span) { diagnostics.push({ source, pc, reason: 'actor-sequence-unavailable', sequence }); selectors.set(actorId, null); return; }
    // Attribute/sequence assignment does not clear a live secondary track.
    // Reusing an actor with unresolved previous history cannot supply low0.
    const initial = resetSelector ? (selectors.has(actorId) && selectors.get(actorId) === null ? null : 0)
      : (selectors.get(actorId) ?? null);
    const final = traceActor(record, span, initial, state, (selector, selectorEvidence) => {
      const shieldPose = mode === 'defense' && defenseId === 'shield' && sequence === 0xf007 && (selector >>> 8) === 8;
      if (reaction || shieldPose) references.push({ selector, actorId, sequence, mainSource: source, mainPc: pc,
        cache19Source: state.cache19Source, ...selectorEvidence });
    },
      diagnostics, `${common ? 'BTSR-cell3' : 'D_ANIME'}-sequence-${index}`, selectors, (childId, childSelector) => {
        childDepth += 1;
        onSequence({ actorId: childId, sequence: childSelector, resetSelector: true, source, pc, reaction });
        childDepth -= 1;
      });
    selectors.set(actorId, final);
  };
  traceMain(animationRecord, state, { root0, onSequence, diagnostics, mainEvidence });
  const assets = [];
  const append = (asset) => {
    if (!assets.some((other) => other.fileName === asset.fileName && other.recordOffset === asset.recordOffset && other.subIndex === asset.subIndex)) assets.push(asset);
  };
  for (const ref of references) {
    const group = (ref.selector >>> 8) & 31; const subIndex = ref.selector & 255;
    // A branch change alone does not make the incoming weapon's residual
    // bullet/slash a shield or sword-cut picture. Only the proven shield body
    // selection in common F007 is currently a variant-specific source.
    if (defenseId === 'shield' && !(ref.sequence === 0xf007 && group === 8 && subIndex === 1
      && ref.selectorOrigin === 'explicit-selector')) continue;
    if (defenseId === 'parry') continue;
    if (group < 6) {
      const sourceSelector = u16(animationRecord, 8 + group * 2);
      if (sourceSelector === 0xffff) { diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: 'inherited-sprite-slot-unverified', group }); continue; }
      const span = pairSpan(spriteDirectory, sourceSelector & 0x07ff);
      if (span && span.end > span.start) append({ fileName: 'E_SPR.BIN', recordOffset: span.start, recordEnd: span.end,
        subIndex, role: 'weapon-state-sprite', sourceSelector, headerSlots: [group], ...ref,
        indexConvention: 'physical-file-byte-offset-and-image-subindex' });
      else diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: 'state-sprite-pair-invalid', group });
    } else if (group === 19 && mode === 'destroyed' && ref.cache19Source !== null) {
      const cell = ref.cache19Source; const span = relativeRecord(commonBytes, cell, 8);
      if (span && commonBytes[span.start] === 0x70 && commonBytes[span.start + 1] === 0x58) append({ fileName: 'BTSR.BIN', recordOffset: span.start, recordEnd: span.end,
        subIndex, role: 'common-destruction-sprite', sourceTableCell: cell, frameCacheGroup: 19, ...ref,
        indexConvention: 'physical-file-byte-offset-and-image-subindex' });
      else diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: 'destruction-source-record-invalid', cell });
    } else if (group === state.selectedBodyCacheGroup && ['explicit-selector', 'paired-selector'].includes(ref.selectorOrigin)) {
      const graphicsSelector = u16(rawUnits, selectedUnit.start + 2) & 0x01ff;
      const directory = rootBytes(root, 1, decodedTsr); const cell = graphicsSelector * 8;
      const count = input.gameId === 'srwf-f' ? 356 : 369;
      if (!directory || graphicsSelector < 1 || graphicsSelector >= count || cell + 8 > directory.length) {
        diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: 'unit-body-directory-invalid' }); continue;
      }
      const start = cell + (u32(directory, cell) | 0);
      const end = cell + 4 + (u32(directory, cell + 4) | 0);
      if (start >= u32(directory, 0) && end > start && end <= MAX_FILE_BYTES) append({ fileName: 'C_ROBOT.BIN', recordOffset: start, recordEnd: end,
        subIndex, role: 'selected-unit-reaction-sprite', sourceSelector: graphicsSelector, frameCacheGroup: group, ...ref,
        indexConvention: 'physical-file-byte-offset-and-image-subindex' });
      else diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: 'unit-body-span-invalid' });
    } else if (group !== 9) {
      diagnostics.push({ source: ref.mainSource, pc: ref.mainPc, reason: group === 19 ? 'destruction-cache-not-loaded'
        : group === state.selectedBodyCacheGroup ? 'body-selector-history-unverified' : 'actor-cache-group-not-mapped', group });
    }
  }
  const stateEvidence = { ...evidence, scope: 'battle-scene-on-bounded-state-sprites', mapping: 'native-state-branch-to-actor-selector-to-source-record',
    stateBranches: 'verified-bounded-conditions',
    representativeCondition: state, mainPredicates: mainEvidence, diagnostics,
    coverage: diagnostics.length ? 'verified-references-with-unresolved-sequences' : 'bounded-path',
    selectedUnitRole: 'representative-defender', selectedWeaponRole: 'incoming-effect-from-selected-owned-weapon',
    opponentArrangement: 'same-unit-mirror-sample',
    sceneContext: 'explicit-sample-metadata-index-zero-not-current-map',
    ...(defenseId === 'parry' ? { reason: 'parry-specific-source-unverified' } : {}),
    composition: 'source-sprite-gallery', timeline: 'not-reproduced' };
  if (mode === 'destroyed') assets.sort((a, b) => Number(b.role === 'common-destruction-sprite') - Number(a.role === 'common-destruction-sprite'));
  else assets.sort((a, b) => Number(b.role === 'selected-unit-reaction-sprite') - Number(a.role === 'selected-unit-reaction-sprite'));
  return result(assets.length ? 'ready' : 'unmapped', assets.length
    ? `대표 조건 · 선택 기체의 ${{ hit: '명중', evade: '회피', defense: '방어', destroyed: '격추' }[mode]}${diagnostics.length ? ' 일부' : ''} 그림`
    : `${({ shield: '실드', parry: '베어내기' }[defenseId]
      ?? { hit: '명중', evade: '회피', defense: '방어', destroyed: '격추' }[mode])} 그림은 아직 지원하지 않습니다.`, stateEvidence, assets);
}

/** Resolve authenticated disc data to physical battle sprite records.
 * `root` preserves semantic TSR root order. `readFile` is the core's session-only
 * async file reader; tests may provide battleFiles instead. `recordOffset` and
 * `recordEnd` are physical file byte offsets. No catalog ordinal is returned.
 * Attack returns dependencies of the selected original animation, not a frame
 * timeline, composited shot or a claim that every dependency is used on every
 * branch. Other states require their own proven script dispatch.
 */
async function resolvePlan(input = {}) {
  const { gameId, weapon, mode = 'attack', defenseId, root, decodedTsr } = input;
  if (!GAMES.has(gameId) || !MODES.has(mode)) {
    return result('unsupported', '지원되는 게임과 전투 상태가 아닙니다.');
  }
  if (defenseId !== undefined && !((mode === 'defense' && [...STATE_DEFENSE_OPTIONS, ...DEFENSE_OPTIONS].some((option) => option.id === defenseId))
    || (mode === 'evade' && defenseId === 'afterimage'))) {
    return result('unsupported', '지원되는 반응 그림 선택이 아닙니다.', { gameId, mode, reason: 'reaction-option-invalid' });
  }
  if (!weapon || !Number.isSafeInteger(weapon.recordIndex)) {
    return result('empty', '무기를 선택하면 연결된 원본 전투 자산을 읽습니다.');
  }
  if (mode !== 'attack') {
    const common = await commonDisplayPlan(input);
    if (common) return common;
  }
  const selected = weaponSelector(rootBytes(root, 29, decodedTsr), weapon.recordIndex);
  const animationDirectory = rootBytes(root, 6, decodedTsr);
  const spriteDirectory = rootBytes(root, 7, decodedTsr);
  if (!selected) return result('unmapped', '무기 원본 레코드의 참조를 확인할 수 없습니다.', { reason: 'weapon-record-invalid' });
  const animation = pairSpan(animationDirectory, selected.selector);
  if (!animation) return result('unmapped', '무기 애니메이션 디렉터리 참조를 확인할 수 없습니다.', { reason: 'animation-directory-invalid' });
  let bytes;
  try { bytes = await fileBytes(input, 'D_ANIME.BIN'); }
  catch { return result('unmapped', '선택한 디스크에서 전투 애니메이션 파일을 읽지 못했습니다.', { reason: 'animation-file-unavailable' }); }
  const evidence = {
    gameId, mode, weaponRecordIndex: weapon.recordIndex,
    weaponFieldOffset: 3, animationSelector: selected.selector,
    animationFileName: 'D_ANIME.BIN', animationRecordOffset: animation.start,
    animationRecordEnd: animation.end, scope: 'battle-scene-on-animation-dependencies',
    mapping: 'weapon-record-to-D_ANIME-header-to-E_SPR',
    timeline: 'unverified', stateBranches: 'unverified',
  };
  if (!bytes || animation.end > bytes.length || animation.end - animation.start < HEADER_BYTES
    || bytes[animation.start] !== HEADER_BYTES || bytes[animation.start + 1] !== 0
    || bytes[animation.start + 2] !== 0 || bytes[animation.start + 3] !== 0) {
    return result('unmapped', '원본 전투 애니메이션 헤더를 확인할 수 없습니다.', { ...evidence, reason: 'animation-header-invalid' });
  }
  for (let pos = 0; pos < DIRECTORY_BYTES; pos += 1) {
    if (bytes[pos] !== animationDirectory[pos]) return result('unmapped',
      '전투 애니메이션 디렉터리가 원본 참조와 다릅니다.', { ...evidence, reason: 'animation-directory-mismatch' });
  }
  if (mode !== 'attack') return statePlan(input, bytes.subarray(animation.start, animation.end), spriteDirectory, evidence);
  const assets = [];
  const reusedSlots = [];
  for (let headerSlot = 0; headerSlot < SPRITE_SLOTS; headerSlot += 1) {
    const sourceSelector = u16(bytes, animation.start + 8 + headerSlot * 2);
    if (sourceSelector === 0xffff) { reusedSlots.push(headerSlot); continue; }
    const sprite = pairSpan(spriteDirectory, sourceSelector & 0x07ff);
    if (!sprite) return result('unmapped', '원본 스프라이트 디렉터리 참조를 확인할 수 없습니다.', { ...evidence, reason: 'sprite-directory-invalid', headerSlot });
    if (sprite.end === sprite.start) continue;
    const existing = assets.find((asset) => asset.recordOffset === sprite.start && asset.recordEnd === sprite.end);
    if (existing) { existing.headerSlots.push(headerSlot); continue; }
    assets.push({ fileName: 'E_SPR.BIN', recordOffset: sprite.start, recordEnd: sprite.end,
      role: 'attack-linked-sprite', sourceSelector, headerSlots: [headerSlot],
      indexConvention: 'physical-file-byte-offset' });
  }
  evidence.reusedSlots = reusedSlots;
  if (!assets.length) return result('empty', '이 무기 헤더에는 추가로 읽는 스프라이트가 없습니다.', evidence);
  return result('ready', '원본 공격 연결 스프라이트', evidence, assets);
}

export async function resolveBattleAssetPlan(input = {}) {
  const plan = await resolvePlan(input);
  if (input.mode === 'defense') plan.defenseOptions = [...STATE_DEFENSE_OPTIONS, ...DEFENSE_OPTIONS].map(({ id, label }) => ({ id, label }));
  if (input.mode === 'evade') plan.evadeOptions = [{ id: 'afterimage', label: '공통 회피능력 표시' }];
  return plan;
}
