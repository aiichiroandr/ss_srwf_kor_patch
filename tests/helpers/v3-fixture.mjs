// Synthetic SRWFKP3 payload builder for tests. Everything here is generated from
// pseudo-random bytes; no game data. It is an independent encoder (it does not
// import the production parser) so a shared misreading of the spec would need
// two mistakes. The layout follows docs/PATCH_FORMAT_V3.md sections 3-8.
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export const MAGIC_V3 = Uint8Array.from([0x53, 0x52, 0x57, 0x46, 0x4b, 0x50, 0x33, 0x00]);
export const FORMAT_V3 = 'srwf.sparse-byte-delta.v3';
export const WINDOW = 1024 * 1024;

// Fixed header field offsets.
export const H = Object.freeze({
  imageSize: 8,
  bodySize: 16,
  sourceSha: 24,
  variantCount: 56,
  commonCount: 60,
  commonData: 64,
  canaryCount: 68,
  canaries: 72,
});

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hexToBytes(hex) {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

export function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** LEB128 (unsigned, minimal). Multiplication, never <<. */
export function varint(value) {
  const out = [];
  let rest = value;
  while (rest >= 128) {
    out.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  out.push(rest);
  return out;
}

/** Pseudo-random stock of any size (xorshift32); never contains game data. */
export function syntheticStock(size, seed = 0x9e3779b9) {
  const out = new Uint8Array(size);
  let state = seed >>> 0 || 1;
  for (let index = 0; index < size; index += 1) {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    out[index] = state & 0xff;
  }
  return out;
}

/** The golden-vector stock of docs/PATCH_FORMAT_V3.md appendix A. */
export function goldenStock() {
  return Uint8Array.from({ length: 4096 }, (_, index) => (index * 131 + 17) & 0xff);
}

/** Bytes that differ from the stock at every position (salt picks the delta 1..255). */
export function changedBytes(stock, offset, length, salt = 1) {
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const delta = ((salt * 31 + index * 7) % 255) + 1;
    out[index] = (stock[offset + index] + delta) & 0xff;
  }
  return out;
}

/** records: [{ offset, bytes }] ascending. Returns a patched copy. */
export function applyRecords(stock, records) {
  const out = stock.slice();
  for (const record of records) {
    out.set(record.bytes, record.offset);
  }
  return out;
}

/** Merge two ascending record lists (as the format defines a variant's set). */
export function mergeRecords(common, extra) {
  return [...common, ...extra].sort((left, right) => left.offset - right.offset);
}

export function recordSetSha256(records) {
  const hash = createHash('sha256');
  for (const record of records) {
    const head = Buffer.alloc(12);
    head.writeBigUInt64BE(BigInt(record.offset), 0);
    head.writeUInt32BE(record.bytes.byteLength, 8);
    hash.update(head);
    hash.update(record.bytes);
  }
  return hash.digest('hex');
}

/** Encode one record set into GAP and LEN column bytes plus its DATA bytes. */
export function encodeSet(records) {
  const gaps = [];
  const lens = [];
  const data = [];
  let previousEnd = -1;
  for (const record of records) {
    const gap = previousEnd < 0 ? record.offset : record.offset - previousEnd - 1;
    if (gap < 0) {
      throw new Error(`test fixture bug: record at ${record.offset} is not after the previous record`);
    }
    gaps.push(...varint(gap));
    lens.push(...varint(record.bytes.byteLength - 1));
    data.push(record.bytes);
    previousEnd = record.offset + record.bytes.byteLength;
  }
  return {
    gap: Uint8Array.from(gaps),
    len: Uint8Array.from(lens),
    data: concat(data),
    count: records.length,
    dataBytes: data.reduce((sum, part) => sum + part.byteLength, 0),
  };
}

/** Spec section 8 generator rule: canaries are evenly chosen common records of length 16..4096. */
export function chooseCanaries(stock, common, maxCount = 8) {
  const candidates = common.filter((record) => record.bytes.byteLength >= 16 && record.bytes.byteLength <= 4096);
  const count = Math.min(maxCount, candidates.length);
  const chosen = [];
  for (let index = 0; index < count; index += 1) {
    const record = candidates[Math.floor((index * candidates.length) / count)];
    chosen.push({
      offset: record.offset,
      length: record.bytes.byteLength,
      sha256: sha256Hex(stock.subarray(record.offset, record.offset + record.bytes.byteLength)),
    });
  }
  return chosen;
}

export function zlibBody(body, options = {}) {
  return new Uint8Array(deflateSync(body, { level: 9, memLevel: 9, windowBits: 15, ...options }));
}

/**
 * Assemble header + zlib. Every argument is taken literally so tests can lie in
 * any field. `bodySize` defaults to the real body length.
 */
export function assemble({
  imageSize,
  bodySize,
  body,
  zlib = zlibBody(body),
  sourceSha256,
  commonCount,
  commonData,
  canaries,
  variants,
  variantCount = variants.length,
  canaryCount = canaries.length,
  magic = MAGIC_V3,
}) {
  const headerSize = 72 + 40 * canaries.length + 41 * variants.length;
  const header = new Uint8Array(headerSize);
  const view = new DataView(header.buffer);
  header.set(magic, 0);
  view.setBigUint64(8, BigInt(imageSize), false);
  view.setBigUint64(16, BigInt(bodySize ?? body.byteLength), false);
  header.set(hexToBytes(sourceSha256), 24);
  view.setUint32(56, variantCount, false);
  view.setUint32(60, commonCount, false);
  view.setUint32(64, commonData, false);
  view.setUint32(68, canaryCount, false);
  let position = 72;
  for (const canary of canaries) {
    view.setUint32(position, canary.offset, false);
    view.setUint32(position + 4, canary.length, false);
    header.set(hexToBytes(canary.sha256), position + 8);
    position += 40;
  }
  for (const variant of variants) {
    header[position] = variant.id.charCodeAt(0);
    header.set(hexToBytes(variant.targetSha256), position + 1);
    view.setUint32(position + 33, variant.count, false);
    view.setUint32(position + 37, variant.dataBytes, false);
    position += 41;
  }
  return concat([header, zlib]);
}

/**
 * Build a whole shared payload.
 *
 *   imageSize / stock         synthetic source
 *   common                    [{ offset, bytes }] present in every variant
 *   variants                  { a: [...], b: [...], c: [...] } variant-only records
 *   canaries                  'auto' | [{ offset, length, sha256 }]
 *   targetOverrides           { b: 'hex' } lie about a variant's targetSha256
 */
export function buildGroup({
  stock,
  common,
  variants,
  canaries = 'auto',
  targetOverrides = {},
  sourceSha256 = sha256Hex(stock),
}) {
  const ids = Object.keys(variants).sort();
  const commonSet = encodeSet(common);
  const variantSets = ids.map((id) => ({ id, records: variants[id], set: encodeSet(variants[id]) }));
  const allSets = [commonSet, ...variantSets.map((entry) => entry.set)];
  const indexParts = [];
  for (const set of allSets) {
    indexParts.push(set.gap, set.len);
  }
  const index = concat(indexParts);
  const data = concat(allSets.map((set) => set.data));
  const body = concat([index, data]);

  const canaryTable = canaries === 'auto' ? chooseCanaries(stock, common) : canaries;
  const variantInfo = {};
  for (const entry of variantSets) {
    const merged = mergeRecords(common, entry.records);
    const target = applyRecords(stock, merged);
    variantInfo[entry.id] = {
      records: merged,
      target,
      targetSha256: targetOverrides[entry.id] ?? sha256Hex(target),
      recordCount: merged.length,
      recordSetSha256: recordSetSha256(merged),
      count: entry.set.count,
      dataBytes: entry.set.dataBytes,
    };
  }
  const fields = {
    imageSize: stock.byteLength,
    body,
    sourceSha256,
    commonCount: commonSet.count,
    commonData: commonSet.dataBytes,
    canaries: canaryTable,
    variants: variantSets.map((entry) => ({
      id: entry.id,
      targetSha256: variantInfo[entry.id].targetSha256,
      count: entry.set.count,
      dataBytes: entry.set.dataBytes,
    })),
  };
  const payload = assemble(fields);
  const headerSize = payload.byteLength - zlibBody(body).byteLength;
  const layout = { headerSize, indexBytes: index.byteLength, sets: [] };
  let indexPosition = 0;
  let dataPosition = index.byteLength;
  for (const [position, set] of allSets.entries()) {
    layout.sets.push({
      id: position === 0 ? null : variantSets[position - 1].id,
      gapStart: indexPosition,
      gapEnd: indexPosition + set.gap.byteLength,
      lenStart: indexPosition + set.gap.byteLength,
      lenEnd: indexPosition + set.gap.byteLength + set.len.byteLength,
      dataStart: dataPosition,
      dataEnd: dataPosition + set.dataBytes,
    });
    indexPosition += set.gap.byteLength + set.len.byteLength;
    dataPosition += set.dataBytes;
  }
  const group = {
    payload,
    body,
    stock,
    fields,
    layout,
    common,
    canaries: canaryTable,
    variants: variantInfo,
    sourceSha256,
    /** Re-assemble with a different body and/or header lies. */
    with(overrides = {}) {
      return assemble({ ...fields, ...overrides });
    },
    descriptor(variant, overrides = {}) {
      const info = variantInfo[variant];
      return {
        patchSize: payload.byteLength,
        patchSha256: sha256Hex(payload),
        sourceSize: stock.byteLength,
        sourceSha256,
        targetSize: stock.byteLength,
        targetSha256: info.targetSha256,
        recordCount: info.recordCount,
        bodyUncompressedSize: body.byteLength,
        format: FORMAT_V3,
        variant,
        commonRecordCount: common.length,
        ...overrides,
      };
    },
  };
  return group;
}

/** Descriptor for an arbitrary payload buffer (variant-level values must be given). */
export function descriptorFor(payload, { variant, targetSha256, recordCount, sourceSize, sourceSha256, bodyUncompressedSize, commonRecordCount, ...rest }) {
  return {
    patchSize: payload.byteLength,
    patchSha256: sha256Hex(payload),
    sourceSize,
    sourceSha256,
    targetSize: sourceSize,
    targetSha256,
    recordCount,
    bodyUncompressedSize,
    format: FORMAT_V3,
    variant,
    commonRecordCount,
    ...rest,
  };
}

/** Set one big-endian header field on a copy. */
export function patchU32(bytes, offset, value) {
  const out = bytes.slice();
  new DataView(out.buffer).setUint32(offset, value, false);
  return out;
}

export function patchU64(bytes, offset, value) {
  const out = bytes.slice();
  new DataView(out.buffer).setBigUint64(offset, BigInt(value), false);
  return out;
}

export function patchByte(bytes, offset, value) {
  const out = bytes.slice();
  out[offset] = value;
  return out;
}

export function flipByte(bytes, offset) {
  const out = bytes.slice();
  out[offset] ^= 0xff;
  return out;
}

/** A Blob-like source with controllable chunking and read accounting. */
export function chunkedSource(bytes, chunkSize, { extraBytes = 0 } = {}) {
  const state = { read: 0, streamCalls: 0, cancelled: false };
  const blob = {
    size: bytes.byteLength,
    state,
    slice(start, end) {
      return new Blob([bytes.subarray(start, end)]);
    },
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
    stream() {
      state.streamCalls += 1;
      let position = 0;
      const total = bytes.byteLength + extraBytes;
      return new ReadableStream({
        pull(controller) {
          if (position >= total) {
            controller.close();
            return;
          }
          const end = Math.min(position + chunkSize, total);
          const chunk = new Uint8Array(end - position);
          for (let index = position; index < end; index += 1) {
            chunk[index - position] = index < bytes.byteLength ? bytes[index] : 0x5a;
          }
          position = end;
          state.read = Math.max(state.read, position);
          controller.enqueue(chunk);
        },
        cancel() {
          state.cancelled = true;
        },
      });
    },
  };
  return blob;
}

/** A recording writer with the abort/close semantics the cores expect. */
export function recordingWriter() {
  const chunks = [];
  const state = { closed: 0, aborted: 0, writes: 0, abortReason: null };
  return {
    state,
    bytes() {
      return concat(chunks);
    },
    writer: {
      async write(chunk) {
        state.writes += 1;
        chunks.push(Uint8Array.from(chunk));
      },
      async close() {
        state.closed += 1;
      },
      async abort(reason) {
        state.aborted += 1;
        state.abortReason = reason;
      },
    },
  };
}

/**
 * A realistic small group: image 3 MiB + 777 (four 1 MiB windows). Common records
 * sit next to and straddle the window boundaries, variant b straddles the third
 * boundary, and the last record ends exactly at the image end.
 */
export function standardGroup({ variantIds = ['a', 'b', 'c'], imageSize = 3 * WINDOW + 777 } = {}) {
  const stock = syntheticStock(imageSize);
  const spec = (offset, length, salt) => ({ offset, bytes: changedBytes(stock, offset, length, salt) });
  const common = [
    spec(5, 3, 1),
    spec(9, 1, 2),
    spec(300, 200, 3),
    spec(4000, 40, 4),
    spec(WINDOW - 4, 3, 5), // ends one byte before the first boundary
    spec(WINDOW, 10, 6), // starts exactly on the first boundary
    spec(WINDOW + 5000, 64, 7),
    spec(WINDOW + 70000, 17, 8),
    spec(2 * WINDOW - 100, 200, 9), // straddles the second boundary
    spec(2 * WINDOW + 5000, 1500, 10),
    spec(imageSize - 40, 40, 11), // ends exactly at the image end
  ];
  const variants = {
    a: [spec(600, 2, 21), spec(WINDOW + 1200, 300, 22), spec(2 * WINDOW + 9000, 5, 23)],
    b: [spec(600, 4, 31), spec(3 * WINDOW - 25, 50, 32)], // straddles the third boundary
    c: [],
  };
  const chosen = Object.fromEntries(variantIds.map((id) => [id, variants[id]]));
  return buildGroup({ stock, common, variants: chosen });
}
