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
