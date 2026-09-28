import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectPatchedImage, previewEditorRecord } from '../assets/editor-core.mjs';

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

function mode1Image(sectorCount) {
  const bytes = new Uint8Array(2352 * sectorCount);
  for (let sector = 0; sector < sectorCount; sector += 1) {
    const base = sector * 2352;
    bytes.fill(0xff, base + 1, base + 11);
    bytes[base + 15] = 1;
    for (let index = 0; index < 2048; index += 1) bytes[base + 16 + index] = (sector * 31 + index) & 0xff;
  }
  return bytes;
}

function previewSession(blob, mediaFiles) {
  return Object.freeze({
    sessionToken: 'preview-session',
    sourceBlob: blob,
    mediaFiles: Object.freeze(mediaFiles),
    mediaCache: new Map(),
  });
}

test('preview reads each media file once per session with a single contiguous slice', async () => {
  const blob = new Blob([mode1Image(3)]);
  let sliceCalls = 0;
  const slice = blob.slice.bind(blob);
  Object.defineProperty(blob, 'slice', {
    value: (...args) => {
      sliceCalls += 1;
      return slice(...args);
    },
  });
  const session = previewSession(blob, { face: { extentLba: 0, byteLength: 3 * 2048 }, robot: null });
  const first = await previewEditorRecord(session, 'pilot', 1);
  const second = await previewEditorRecord(session, 'pilot', 2);
  assert.equal(first.image, null, 'synthetic data holds no image table');
  assert.equal(second.recordIndex, 2);
  assert.equal(sliceCalls, 1, 'three sectors are read with one slice and then served from the session cache');
  assert.equal(session.mediaCache.get('pilot').length, 3 * 2048);
});

test('preview without a media file reports no image instead of failing', async () => {
  const session = previewSession(new Blob([mode1Image(1)]), { face: null, robot: null });
  const preview = await previewEditorRecord(session, 'unit', 1);
  assert.deepEqual({ ...preview }, { kind: 'unit', recordIndex: 1, image: null });
});

test('preview honours an aborted signal before reading media', async () => {
  const session = previewSession(new Blob([mode1Image(1)]), { face: { extentLba: 0, byteLength: 2048 }, robot: null });
  await assert.rejects(
    previewEditorRecord(session, 'pilot', 1, { signal: AbortSignal.abort() }),
    (error) => error.name === 'AbortError',
  );
  assert.equal(session.mediaCache.size, 0);
});
