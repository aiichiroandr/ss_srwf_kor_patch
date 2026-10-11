import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportEditedImage, buildEditedImage, buildEditorRows, splitRootSegments, updatePilotRecords } from '../assets/editor-core.mjs';
import { expansionTable } from './helpers/synthetic-pilot-expansion.mjs';
import { makeBase, descriptorFor } from './helpers/synthetic-game.mjs';
import { echoRequest } from './helpers/synthetic-iso.mjs';
const pairs = entries => entries.map(({ id, level }) => ({ id, level }));
const local = (disc, gameId) => descriptorFor(disc, { gameId, imageKind: 'local' });
const locked = pilots => new Map(pilots.filter(row => !row.editable).map(row => [row.recordIndex, row.readOnlyReason]));
const request = opened => {
  const next = echoRequest(opened.session, opened.view);
  for (const edit of next.pilotEdits) edit.spirits = pairs(opened.view.pilots.find(row => row.recordIndex === edit.recordIndex).spirits);
  return next;
};

for (const gameId of ['srwf-f', 'srwf-final']) {
  test(`${gameId}: full-capacity pilots add a pair, preserve six spirits and existing skills, export and reopen`, async () => {
    const base = await makeBase({ gameId, pilotTable: expansionTable(gameId) });
    const { opened } = base, before = opened.session.decoded.slice();
    const next = request(opened);
    for (const id of [12, 85]) {
      const row = opened.view.pilots.find(row => row.recordIndex === id);
      assert.equal(row.spirits.length, 6);
      assert.equal(row.pairFree, 0);
      assert.ok(row.skillExpansionPairs > 0);
      next.pilotEdits.find(edit => edit.recordIndex === id).specialAbilities.push({ id: 41, level: 1 });
    }
    const result = await exportEditedImage(opened.session, next);
    const bytes = new Uint8Array(await result.outputBlob.arrayBuffer());
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    const again = await base.full.inspectPatchedImage(result.outputBlob, local(base.disc, gameId));
    assert.equal(again.view.provenanceMode, 'bounded-editor-profile');
    assert.equal(again.session.decoded.length, before.length);
    assert.deepEqual(again.session.root.map(root => [root.start, root.end]), opened.session.root.map(root => [root.start, root.end]));
    for (const old of opened.view.pilots) {
      const row = again.view.pilots.find(row => row.recordIndex === old.recordIndex);
      assert.deepEqual(pairs(row.spirits), pairs(old.spirits));
      assert.deepEqual(pairs(row.specialAbilities), [12, 85].includes(old.recordIndex) ? [...pairs(old.specialAbilities), { id: 41, level: 1 }] : pairs(old.specialAbilities));
      assert.equal(row.identity, old.identity);
      for (const field of ['atk', 'shot', 'hit', 'agi', 'mp', 'tech', 'cnt', 'ground', 'sea', 'air', 'space']) assert.equal(row[field], old[field]);
      if (!old.pilotExpansionGroup) {
        assert.equal(row.byteOffset, old.byteOffset);
        assert.deepEqual(again.session.root[28].bytes.subarray(row.byteOffset, row.byteOffset + row.recordLength), opened.session.root[28].bytes.subarray(old.byteOffset, old.byteOffset + old.recordLength));
      }
    }
    assert.deepEqual(opened.session.decoded, before, 'authenticated session is never mutated');
    const echo = await exportEditedImage(again.session, request(again));
    assert.equal(echo.bytesChanged, 0);
    assert.equal(echo.outputBlob, result.outputBlob);
  });

  test(`${gameId}: expansion failures restore the whole table, and explicit deletion space is staged atomically`, async () => {
    const base = await makeBase({ gameId, pilotTable: expansionTable(gameId) });
    const rows = base.opened.view.pilots, next = request(base.opened), table = base.opened.session.root[28].bytes.slice(), before = table.slice();
    // Each ordinary pilot needs another pair: more than the span's available padding.
    for (const edit of next.pilotEdits) {
      const row = rows.find(row => row.recordIndex === edit.recordIndex);
      if (row.pilotExpansionGroup?.endsWith(':2-301')) edit.specialAbilities.push({ id: 68, level: 1 });
    }
    assert.throws(() => updatePilotRecords(table, next.pilotEdits, locked(rows), gameId), error => error.code === 'EDITOR_EDIT_INVALID');
    assert.deepEqual(table, before);
    const target = request(base.opened);
    target.pilotEdits.find(edit => edit.recordIndex === 86).specialAbilities.push({ id: 68, level: 1 });
    target.pilotEdits.find(edit => edit.recordIndex === 85).specialAbilities = [];
    updatePilotRecords(table, target.pilotEdits, locked(rows), gameId);
    const copy = base.opened.session.decoded.slice(), root = splitRootSegments(copy);
    root[28].bytes.set(table);
    const again = buildEditorRows(root, copy, gameId).pilots;
    assert.deepEqual(pairs(again.find(row => row.recordIndex === 86).specialAbilities), [...pairs(rows.find(row => row.recordIndex === 86).specialAbilities), { id: 68, level: 1 }]);
    assert.ok(again.find(row => row.recordIndex === 85).recordLength < rows.find(row => row.recordIndex === 85).recordLength, 'staged deletion provided actual donor space');
    assert.deepEqual(pairs(again.find(row => row.recordIndex === 85).specialAbilities), []);
    assert.deepEqual(pairs(again.find(row => row.recordIndex === 85).spirits), pairs(rows.find(row => row.recordIndex === 85).spirits));
  });

  test(`${gameId}: normalized provenance rejects immutable headers, locked bytes, aliases and unknown tails`, async () => {
    const base = await makeBase({ gameId, pilotTable: expansionTable(gameId) });
    const ordinary = base.opened.view.pilots.find(row => row.recordIndex === 12);
    const aliasOwner = base.opened.view.pilots.find(row => row.recordIndex === 1);
    const mutations = [
      bytes => { bytes[ordinary.byteOffset] ^= 1; },
      bytes => { bytes[aliasOwner.byteOffset + 4] ^= 1; },
      bytes => { const view = new DataView(bytes.buffer, bytes.byteOffset); view.setInt32(312 * 4, ordinary.byteOffset - 312 * 4, false); },
      bytes => { bytes[ordinary.byteOffset + ordinary.recordLength - 2] = 250; },
    ];
    for (const mutate of mutations) {
      const decoded = base.opened.session.decoded.slice(), root = splitRootSegments(decoded);
      mutate(root[28].bytes);
      const result = await buildEditedImage(base.opened.session, decoded);
      await assert.rejects(base.full.inspectPatchedImage(result.outputBlob, local(base.disc, gameId)), error =>
        ['EDITOR_CUSTOM_PROVENANCE', 'EDITOR_TSR_STRUCTURE_UNSUPPORTED'].includes(error.code));
    }
  });
}
