import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectPatchedImage } from '../assets/editor-core.mjs';

const targetSha256 = 'a'.repeat(64);

function makeTrackedImageBlob() {
  const blob = new Blob([new Uint8Array(2352 * 4)], { type: 'application/octet-stream' });
  let streamCalls = 0;
  const stream = blob.stream.bind(blob);
  Object.defineProperty(blob, 'stream', {
    value: () => {
      streamCalls += 1;
      return stream();
    },
  });
  return { blob, get streamCalls() { return streamCalls; } };
}

function descriptor(blob, extra = {}) {
  return {
    gameId: 'srwf-final',
    targetSize: blob.size,
    targetSha256,
    ...extra,
  };
}

test('only a same-session patch result attestation skips the editor target rehash', async () => {
  const untrusted = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(untrusted.blob, descriptor(untrusted.blob)),
    (error) => error.code === 'EDITOR_TARGET_HASH_MISMATCH',
  );
  assert.equal(untrusted.streamCalls, 1, 'user-selected BINs must be streamed through SHA-256');

  const mismatchedAttestation = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(mismatchedAttestation.blob, descriptor(mismatchedAttestation.blob, {
      verifiedPatchTargetSha256: 'b'.repeat(64),
    })),
  );
  assert.equal(mismatchedAttestation.streamCalls, 1, 'a different target hash must not bypass authentication');

  const verifiedOutput = makeTrackedImageBlob();
  await assert.rejects(
    inspectPatchedImage(verifiedOutput.blob, descriptor(verifiedOutput.blob, {
      verifiedPatchTargetSha256: targetSha256,
    })),
  );
  assert.equal(verifiedOutput.streamCalls, 0, 'the immutable patch result reuses its completed target hash');
});

// Two relative pointers: metadata and one fixed record. Sprite IDs deliberately
// differ from the record row, matching the original viewer's field layout.
function imageRecordRoot(kind, firstBytes) {
  const size = kind === 'unit' ? 48 : 24;
  const bytes = new Uint8Array(12 + size);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 8); view.setInt32(4, 8);
  bytes.set(firstBytes, 12);
  const root = [];
  root[kind === 'unit' ? 27 : 28] = { bytes };
  return root;
}

test('preview follows original stored references and rejects zero/out-of-range identities', async () => {
  const { resolveEditorImageIndex } = await import('../assets/editor-core.mjs');
  for (const game of ['srwf-f', 'srwf-final']) {
    for (const id of [1,2,3,4,5,7,61,63,65,74,242,254,326]) {
      assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,id >> 8,id & 255]), 'unit', 1, game), id);
    }
    for (const id of [10,95,96,180,181,182,233,327]) {
      assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [48 | (id >> 8),id & 255]), 'pilot', 1, game), id);
    }
    // units 315-317 (graphic 0, field 299-301) have no picture; field 299-301 is NOT a name id
    assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [49,44,0,0]), 'unit', 1, game), null);
    assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [48,0]), 'pilot', 1, game), null);
  }
  assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,1,100]), 'unit', 1, 'srwf-f'), null);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('unit', [48,67,1,100]), 'unit', 1, 'srwf-final'), 356);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [49,82]), 'pilot', 1, 'srwf-f'), null);
  assert.equal(resolveEditorImageIndex(imageRecordRoot('pilot', [49,85]), 'pilot', 1, 'srwf-final'), 341);
  assert.throws(() => resolveEditorImageIndex(imageRecordRoot('unit', [48,67,0,63]), 'unit', 2), e => e.code === 'EDITOR_PREVIEW_INVALID');
});

test('unit abilities use viewer ID/value pairs and preserve all surrounding bytes', async () => {
  const { readUnitAbilities, writeUnitAbilities } = await import('../assets/editor-core.mjs');
  const record = new Uint8Array(48).fill(0xa5);
  record.set([1, 7, 2, 8, 14, 9, 5, 10], 38);
  const fields = readUnitAbilities(record, 0);
  assert.deepEqual([fields.ability1, fields.ability2, fields.ability3, fields.ability4], [1, 2, 14, 5]);
  assert.deepEqual([fields.abilityValue1, fields.abilityValue2, fields.abilityValue3, fields.abilityValue4], [7, 8, 9, 10]);
  writeUnitAbilities(record, 0, { ...fields, ability1: 13, ability2: 5, ability3: 10, ability4: 14 });
  assert.deepEqual([...record.slice(38, 46)], [13, 7, 5, 8, 10, 9, 14, 10]);
  assert.ok(record.slice(0, 38).every(byte => byte === 0xa5));
  assert.deepEqual([...record.slice(46)], [0xa5, 0xa5]);
  assert.deepEqual(readUnitAbilities(record, 0), { ...fields, ability1: 13, ability2: 5, ability3: 10, ability4: 14 });
  assert.throws(() => readUnitAbilities(new Uint8Array(45), 0));
});

test('editor revision policy follows both current default families and all three fonts', async () => {
  const { readFile } = await import('node:fs/promises');
  const { LATEST_EDITOR_RELEASE_GROUPS, isLatestEditorBase } = await import('../assets/editor-core.mjs');
  const { ACCEPTED_EDITOR_TARGETS } = await import('../assets/editor-provenance-profiles.mjs');
  const index = JSON.parse(await readFile(new URL('../manifest/releases.json', import.meta.url), 'utf8'));
  for (const game of index.games) {
    assert.equal(LATEST_EDITOR_RELEASE_GROUPS[game.id], game.defaultReleaseId.replace(/-[abc]$/, ''));
    let latestFonts = 0, older = 0;
    for (const [sha, target] of Object.entries(ACCEPTED_EDITOR_TARGETS)) {
      if (target.gameId !== game.id) continue;
      const latest = target.releaseId.replace(/-[abc]$/, '') === LATEST_EDITOR_RELEASE_GROUPS[game.id];
      assert.equal(isLatestEditorBase(game.id, sha), latest, target.releaseId);
      assert.equal(isLatestEditorBase(game.id === 'srwf-f' ? 'srwf-final' : 'srwf-f', sha), false);
      if (latest) latestFonts++; else older++;
    }
    assert.equal(latestFonts, 3);
    assert.ok(older > 0);
    assert.equal(isLatestEditorBase(game.id, '0'.repeat(64)), false);
  }
});

test('an older accepted patch cannot open the editor even with same-session verification', async () => {
  const { ACCEPTED_EDITOR_TARGETS } = await import('../assets/editor-provenance-profiles.mjs');
  const { isLatestEditorBase } = await import('../assets/editor-core.mjs');
  for (const [sha, target] of Object.entries(ACCEPTED_EDITOR_TARGETS)) {
    if (isLatestEditorBase(target.gameId, sha)) continue;
    const image = makeTrackedImageBlob();
    await assert.rejects(inspectPatchedImage(image.blob, {
      gameId: target.gameId, targetSize: image.blob.size,
      targetSha256: sha, verifiedPatchTargetSha256: sha,
    }), error => error.code === 'EDITOR_REVISION_OUTDATED');
    assert.equal(image.streamCalls, 0);
  }
});


test('names consume two-byte FF glyphs and signed relocated pointers without partial labels', async () => {
  const { decodeEditorName } = await import('../assets/editor-core.mjs');
  const { FINAL_PILOT_NAME_MAP } = await import('../assets/editor-pilot-name-map.mjs');
  const bytes = new Uint8Array(16);
  bytes.set([0xee, 0xff, 0xff], 0);
  new DataView(bytes.buffer).setInt32(8, -8);
  const segment = {start:8,end:12};
  assert.deepEqual(decodeEditorName(bytes,segment,0,FINAL_PILOT_NAME_MAP),{text:'이',status:'decoded'});
  bytes.set([0xee,0xff,0x01,0xff],0);
  assert.equal(decodeEditorName(bytes,segment,0,new Map([['EEFF','이']])).status,'unknown-glyph');
  assert.equal(decodeEditorName(bytes,segment,0,new Map([['EEFF','이']])).text,'');
  const truncated = new Uint8Array(5);new DataView(truncated.buffer).setInt32(0,4);truncated[4]=0xee;
  assert.equal(decodeEditorName(truncated,{start:0,end:4},0,FINAL_PILOT_NAME_MAP).status,'truncated-glyph');
  assert.equal(decodeEditorName(bytes,segment,1,FINAL_PILOT_NAME_MAP).status,'invalid-cell');
});
