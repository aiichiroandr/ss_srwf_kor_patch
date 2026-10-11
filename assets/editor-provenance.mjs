import { Sha256 } from "./sha256.mjs?v=20261011-public7";

export function validateMaskRanges(ranges, size) {
  if (!Array.isArray(ranges) || ranges.length > 50000 || !Number.isSafeInteger(size) || size < 1) {
    throw new Error("Invalid provenance mask.");
  }
  let end = 0;
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 3) throw new Error("Invalid provenance range.");
    const [offset, length, mask] = range;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < end || length < 1
      || offset + length > size || !Number.isInteger(mask) || mask < 1 || mask > 255) {
      throw new Error("Overlapping or out-of-bounds provenance range.");
    }
    end = offset + length;
  }
  return ranges;
}

export function immutableBytesHash(bytes, ranges) {
  validateMaskRanges(ranges, bytes.length);
  const copy = bytes.slice();
  for (const [offset, length, mask] of ranges) {
    for (let index = offset; index < offset + length; index += 1) copy[index] &= ~mask;
  }
  return new Sha256().update(copy).hex();
}

export async function immutableImageHash(blob, ranges, { signal, onProgress } = {}) {
  validateMaskRanges(ranges, blob.size);
  const hash = new Sha256();
  let rangeIndex = 0;
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    while (rangeIndex < ranges.length && ranges[rangeIndex][0] + ranges[rangeIndex][1] <= offset) rangeIndex += 1;
    for (let index = rangeIndex; index < ranges.length && ranges[index][0] < offset + bytes.length; index += 1) {
      const [start, length, mask] = ranges[index];
      for (let byte = Math.max(start, offset); byte < Math.min(start + length, offset + bytes.length); byte += 1) bytes[byte - offset] &= ~mask;
    }
    hash.update(bytes);
    onProgress?.({ phase: "custom-provenance", processed: offset + bytes.length, total: blob.size });
  }
  return hash.hex();
}
