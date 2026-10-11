import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { immutableBytesHash, immutableImageHash, validateMaskRanges } from "../assets/editor-provenance.mjs";
import { ACCEPTED_EDITOR_TARGETS, EDITOR_PROVENANCE_PROFILES } from "../assets/editor-provenance-profiles.mjs";

test("provenance allows only the exact field bits and preserves the weapon low nibble", () => {
  const accepted = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
  const masks = [[1, 1, 255], [2, 1, 240]];
  const edited = new Uint8Array([0x12, 0xff, 0xa6, 0x78]);
  assert.equal(immutableBytesHash(accepted, masks), immutableBytesHash(edited, masks));
  edited[2] = 0xa7;
  assert.notEqual(immutableBytesHash(accepted, masks), immutableBytesHash(edited, masks));
  edited[2] = 0xa6; edited[3] = 0x79;
  assert.notEqual(immutableBytesHash(accepted, masks), immutableBytesHash(edited, masks));
});

test("disc provenance streams masks across chunk boundaries and detects unrelated edits", async () => {
  const accepted = new Uint8Array(1024 * 1024 + 32).fill(0x39);
  const masks = [[1024 * 1024 - 4, 16, 255]];
  const edited = accepted.slice(); edited.fill(0x51, masks[0][0], masks[0][0] + masks[0][1]);
  const normalized = accepted.slice(); normalized.fill(0, masks[0][0], masks[0][0] + masks[0][1]);
  const expected = createHash("sha256").update(normalized).digest("hex");
  assert.equal(await immutableImageHash(new Blob([accepted]), masks), expected);
  assert.equal(await immutableImageHash(new Blob([edited]), masks), expected);
  edited[17] ^= 1;
  assert.notEqual(await immutableImageHash(new Blob([edited]), masks), expected);
});

test("provenance rejects overlapping, malformed and out-of-bounds masks", () => {
  for (const masks of [[[0, 2, 255], [1, 1, 255]], [[4, 1, 255]], [[0, 0, 255]], [[0, 1, 0]], [[0, 1, 256]], [[0, 1]]]) {
    assert.throws(() => validateMaskRanges(masks, 4));
  }
});

test("provenance hashing supports cancellation without accepting a partial hash", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(immutableImageHash(new Blob([new Uint8Array(8)]), [], { signal: controller.signal }), { name: "AbortError" });
});

test("the stored profiles carry tail digests of the shape the padding check reads; the one of the retired F release carries none", () => {
  const withTail = [];
  const without = [];
  for (const profile of EDITOR_PROVENANCE_PROFILES) {
    const release = ACCEPTED_EDITOR_TARGETS[profile.baseTargetSha256].releaseId;
    if (!profile.tail) { without.push(release); continue; }
    withTail.push(release);
    const { streamEnd, window, digests } = profile.tail;
    assert.ok(Number.isSafeInteger(streamEnd) && streamEnd > 0 && streamEnd <= profile.allocatedSectors * 2048, release);
    assert.equal(window, Math.min(1024, streamEnd), release);
    assert.equal(digests.length, window + 1, release);
    assert.ok(digests.every((digest) => /^[0-9a-f]{16}$/.test(digest)), release);
    assert.equal(new Set(digests).size, digests.length, "every end position has its own digest");
    assert.deepEqual(Object.keys(profile.tail).sort(), ["digests", "streamEnd", "window"]);
  }
  assert.deepEqual(without, ["srwf-f-20260915-v0-4-a"]);
  assert.deepEqual(withTail.sort(), [
    "srwf-f-20260928-v0-5-a", "srwf-f-20260928-v0-5-b", "srwf-f-20260928-v0-5-c",
    "srwf-final-20261005-v0-3-a", "srwf-final-20261005-v0-3-b", "srwf-final-20261005-v0-3-c",
  ]);
});

test("every accepted lane of the latest releases has a bounded profile, and the masks of a lane do not depend on its font variant", () => {
  const byRelease = new Map(EDITOR_PROVENANCE_PROFILES.map((profile) => [ACCEPTED_EDITOR_TARGETS[profile.baseTargetSha256].releaseId, profile]));
  for (const release of [
    "srwf-f-20260928-v0-5-a", "srwf-f-20260928-v0-5-b", "srwf-f-20260928-v0-5-c",
    "srwf-final-20261005-v0-3-a", "srwf-final-20261005-v0-3-b", "srwf-final-20261005-v0-3-c",
  ]) assert.ok(byRelease.has(release), release);
  // the pilot table is the same in every font variant of a release, so the editable ranges are too
  const ranges = (...releases) => releases.map((release) => JSON.stringify(byRelease.get(release).decodedMasks));
  assert.equal(new Set(ranges("srwf-f-20260928-v0-5-a", "srwf-f-20260928-v0-5-b", "srwf-f-20260928-v0-5-c")).size, 1);
  assert.equal(new Set(ranges("srwf-final-20261005-v0-3-a", "srwf-final-20261005-v0-3-b", "srwf-final-20261005-v0-3-c")).size, 1);
  // the ranges are sorted, disjoint and bounded by the decoded length they belong to
  for (const profile of EDITOR_PROVENANCE_PROFILES) {
    let end = 0;
    for (const [offset, length, mask] of profile.decodedMasks) {
      assert.ok(offset >= end && length >= 1 && mask >= 1 && mask <= 255 && offset + length <= profile.decodedLength);
      end = offset + length;
    }
  }
});
