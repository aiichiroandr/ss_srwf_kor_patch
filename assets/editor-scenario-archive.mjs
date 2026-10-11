// SCEDATA carrier only. No VM command, objective or deployment write is enabled
// by this module. Callers must separately authenticate allowed decoded changes.
import { decompressTsr, decodeFramedLz, repackTsr, compressTsr } from './editor-core.mjs?v=20261011-public13';
import { ownData, readDenseList } from './editor-own.mjs?v=20261011-public13';
import { normalizeScenarioDeadlineBody } from './editor-scenario-deadlines.mjs?v=20261011-public13';

export const SCENARIO_ARCHIVE_FORMATS = Object.freeze({
  'srwf-f': Object.freeze({ slots: 74, endCellBias: 4 }),
  'srwf-final': Object.freeze({ slots: 200, endCellBias: 0 }),
});
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TOTAL_DECODED = 8 * 1024 * 1024;
function fail(message, code = 'EDITOR_SCENARIO_INVALID', details) {
  const error = new Error(message); error.code = code;
  if (details) error.details = details;
  throw error;
}
function same(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }
function abort(signal) { if (signal?.aborted) throw new DOMException('Operation aborted.', 'AbortError'); }
function rootsOf(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 57 || bytes.length > MAX_BODY_BYTES) fail('Invalid scenario body length.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const roots = Array.from({ length: 14 }, (_, i) => i * 4 + view.getInt32(i * 4));
  if (roots.some(offset => offset < 56 || offset >= bytes.length)) fail('A scenario root points outside its decoded body.');
  return Object.freeze(roots);
}

export function readScenarioArchive(bytes, gameId, { scenarioLayout = 'latest' } = {}) {
  const format = ownData(SCENARIO_ARCHIVE_FORMATS, gameId), directoryLength = format?.slots * 8;
  if (!['latest', 'stock'].includes(scenarioLayout)) fail('Unsupported scenario directory layout.');
  // The accepted Final archive rebuilt its end cells relative to the entry
  // base. Original Final uses the end cell itself, as original F does.
  const endCellBias = gameId === 'srwf-final' && scenarioLayout === 'stock' ? 4 : format?.endCellBias;
  if (!format || !(bytes instanceof Uint8Array) || bytes.length <= directoryLength || bytes.length > MAX_ARCHIVE_BYTES) fail('Unsupported scenario archive.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), spans = new Map(), slots = [];
  for (let slot = 0; slot < format.slots; slot++) {
    const cell = slot * 8, start = cell + view.getUint32(cell), end = cell + endCellBias + view.getUint32(cell + 4);
    if (start < directoryLength || start % 4 || start >= end || end > bytes.length) fail('Invalid scenario directory range.');
    let body = spans.get(start);
    if (body && body.end !== end) fail('Scenario aliases disagree about their shared body boundary.');
    if (!body) { body = { start, end, slots: [] }; spans.set(start, body); }
    body.slots.push(slot); slots.push(body);
  }
  const bodies = [...spans.values()].sort((a, b) => a.start - b.start);
  let cursor = directoryLength, totalDecoded = 0;
  for (const [physicalIndex, body] of bodies.entries()) {
    if (body.start < cursor || body.start - cursor > 3 || bytes.subarray(cursor, body.start).some(Boolean)) fail('Scenario bodies overlap or have foreign alignment bytes.');
    const compressed = bytes.subarray(body.start, body.end);
    if (compressed[0] === 0 && compressed[1] === 0) fail('Unframed scenario data is unsupported.');
    let decoded, streamEnd;
    try { const frame = decodeFramedLz(compressed, MAX_BODY_BYTES); decoded = frame.output; streamEnd = frame.streamEnd; }
    catch { fail('A scenario compression stream is malformed.'); }
    if (compressed.subarray(streamEnd).some(Boolean)) fail('Foreign bytes follow a scenario compression stream.');
    const roots = rootsOf(decoded);
    totalDecoded += decoded.length;
    if (totalDecoded > MAX_TOTAL_DECODED) fail('The scenario archive exceeds the decoded inspection limit.');
    Object.assign(body, { physicalIndex, compressed, decoded, streamEnd, roots, slots: Object.freeze(body.slots) });
    Object.freeze(body); cursor = body.end;
  }
  if (cursor !== bytes.length) fail('Unreferenced bytes follow the last scenario body.');
  return Object.freeze({ gameId, scenarioLayout, byteLength: bytes.length, directoryLength, totalDecoded,
    bodies: Object.freeze(bodies),
    slots: Object.freeze(slots.map(body => body.physicalIndex)) });
}

// Preserve directory words, aliases and physical spans. Decoded size/roots
// stay fixed except for an exactly regenerated, bounded deadline extension. A shorter
// stream gets a zero tail; a larger stream must fit the same physical span.
// The input and every requested decoded buffer are copied before async packing.
export async function repackScenarioBodies(sourceBytes, gameId, submitted, { signal, onProgress, scenarioLayout = 'latest', unitCount, pilotContext, regionContexts } = {}) {
  abort(signal);
  if (!(sourceBytes instanceof Uint8Array)) fail('Missing scenario source.');
  const source = sourceBytes.slice(), archive = readScenarioArchive(source, gameId, { scenarioLayout });
  const { list, problem } = readDenseList(submitted, archive.bodies.length);
  if (problem) fail('Invalid scenario body edit list.');
  const seen = new Set();
  const planned = list.map(edit => {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit) || Reflect.ownKeys(edit).some(key => !['physicalIndex', 'decoded'].includes(key))) fail('Unknown scenario body edit field.');
    const physicalIndex = ownData(edit, 'physicalIndex'), decoded = ownData(edit, 'decoded');
    const body = Number.isInteger(physicalIndex) ? archive.bodies[physicalIndex] : null;
    if (!body || seen.has(physicalIndex) || !(decoded instanceof Uint8Array)) fail('Unknown or duplicate scenario body.');
    seen.add(physicalIndex);
    const wanted = decoded.slice(), roots=rootsOf(wanted);
    const original=normalizeScenarioDeadlineBody(body,gameId,{scenarioLayout,unitCount,pilotContext,regionContexts}).body.decoded;
    const normalized=normalizeScenarioDeadlineBody({...body,decoded:wanted,roots},gameId,{scenarioLayout,unitCount,pilotContext,regionContexts}).body.decoded;
    if (normalized.length !== original.length || !same(normalized.subarray(0, 56), original.subarray(0, 56))) fail('Scenario edits must preserve decoded size and root pointers outside a verified deadline template.');
    return { body, decoded: wanted };
  });
  const output = source.slice(), changedBodies = [];
  for (const { body, decoded } of planned) {
    abort(signal);
    if (same(decoded, body.decoded)) continue;
    onProgress?.({ phase: 'scenario-compress', processed: changedBodies.length, total: planned.length });
    const replay = await repackTsr(body.compressed, decoded, { signal });
    let packed = replay?.bytes;
    if (!packed || packed.length > body.end - body.start) {
      const scratch = await compressTsr(decoded, { signal, completeNearMatches: true });
      if (!packed || scratch.length < packed.length) packed = scratch;
    }
    if (packed.length > body.end - body.start) fail('The edited scenario does not fit its original compressed body span.',
      'EDITOR_SCENARIO_GROWTH_UNSUPPORTED', { physicalIndex: body.physicalIndex, packedBytes: packed.length, slotBytes: body.end - body.start });
    if (!same(decompressTsr(packed), decoded)) fail('Scenario compression failed its decoded read-back check.');
    output.fill(0, body.start, body.end); output.set(packed, body.start);
    changedBodies.push(body.physicalIndex);
  }
  abort(signal);
  const readBack = readScenarioArchive(output, gameId, { scenarioLayout });
  for (const { body, decoded } of planned) {
    if (!same(readBack.bodies[body.physicalIndex].decoded, decoded)) fail('The stored scenario archive failed its read-back check.');
  }
  onProgress?.({ phase: 'scenario-compress', processed: planned.length, total: planned.length });
  return Object.freeze({ bytes: output, changedBodies: Object.freeze(changedBodies) });
}
