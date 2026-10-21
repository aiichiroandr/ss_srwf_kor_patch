// Read-only WORKERFS acceleration. Emulated CD timing and disc bytes are unchanged.
// Call after mount and before opening files. The caller selects mobile devices.
export const DISC_CACHE_MAX_BYTES = 16 * 1024 * 1024;

export function installDiscCache(FS, {
  blockSize = 256 * 1024,
  maxBlocks = 64,
  minFileSize = 1024 * 1024,
  now = () => performance.now(),
} = {}) {
  for (const [name, value] of Object.entries({blockSize, maxBlocks, minFileSize})) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
  }
  if (blockSize * maxBlocks > DISC_CACHE_MAX_BYTES) throw new RangeError('Disc cache exceeds 16 MiB');

  // Shared across all BIN files, rather than reserving 16 MiB for every track.
  const blocks = new Map();
  const stats = {
    files: 0, requests: 0, hits: 0, reads: 0, bytes: 0,
    readMs: 0, maxReadMs: 0, evictions: 0,
    residentBytes: 0, peakResidentBytes: 0,
  };
  let nextFile = 0;

  function evictOldest() {
    const key = blocks.keys().next().value;
    stats.residentBytes -= blocks.get(key).byteLength;
    blocks.delete(key);
    stats.evictions++;
  }

  function visit(node) {
    if (!node.contents || typeof node.contents.slice !== 'function') {
      for (const child of Object.values(node.contents || {})) visit(child);
      return;
    }
    if (!/\.bin$/i.test(node.name || '') || node.size < minFileSize || !node.stream_ops?.read) return;
    const file = nextFile++;
    stats.files++;
    const original = node.stream_ops;
    function readOriginal(stream, buffer, offset, length, position) {
      const start = now();
      stats.reads++;
      try {
        const read = original.read.call(original, stream, buffer, offset, length, position);
        stats.bytes += read;
        return read;
      } finally {
        const elapsed = now() - start;
        stats.readMs += elapsed;
        stats.maxReadMs = Math.max(stats.maxReadMs, elapsed);
      }
    }
    // WORKERFS shares stream_ops globally. Replace only this file's table.
    node.stream_ops = {...original, read(stream, buffer, offset, length, position) {
      stats.requests++;
      if (!length || position >= node.size) return 0;
      let copied = 0;
      while (copied < length && position + copied < node.size) {
        const pos = position + copied;
        const start = Math.floor(pos / blockSize) * blockSize;
        const key = `${file}:${start}`;
        let block = blocks.get(key);
        if (block) {
          stats.hits++;
          blocks.delete(key);
          blocks.set(key, block);
        } else {
          // Evict before allocating: retained cache storage never exceeds its cap.
          // The original WORKERFS read also has one transient Blob-read buffer.
          while (blocks.size >= maxBlocks) evictOldest();
          block = new Uint8Array(Math.min(blockSize, node.size - start));
          const read = readOriginal(stream, block, 0, block.length, start);
          if (read !== block.length) {
            // WORKERFS normally reads the complete immutable Blob slice. Do not
            // retain an incomplete block if another wrapper returns a short read.
            return copied + readOriginal(stream, buffer, offset + copied, length - copied, pos);
          }
          blocks.set(key, block);
          stats.residentBytes += block.byteLength;
          stats.peakResidentBytes = Math.max(stats.peakResidentBytes, stats.residentBytes);
        }
        const within = pos - start;
        const count = Math.min(length - copied, block.length - within);
        buffer.set(block.subarray(within, within + count), offset + copied);
        copied += count;
      }
      return copied;
    }};
  }
  visit(FS.lookupPath('/disc').node);
  return {
    stats,
    clear() {
      blocks.clear();
      stats.residentBytes = 0;
    },
  };
}
