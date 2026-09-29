// Re-apply a layered release (base + font) with the browser engine, in RAM only.
// Usage: node verify-layered-patch.mjs <stock> <base.srwfp> <font.srwfp> <expected target SHA-256>
// Used by scripts/split_font_variants.py; never writes the stock, intermediate or target.
import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  applyLayeredPatchToWritable,
  buildVerifiedLayeredPatchedBlob,
  composeLayeredPatch,
  parsePatch,
} from '../../assets/patch-core.mjs';

const [stockPath, basePath, fontPath, expectedTarget] = process.argv.slice(2);
const base = await parsePatch(await readFile(basePath));
const font = await parsePatch(await readFile(fontPath));
const layered = composeLayeredPatch(base, font, {
  sourceSize: base.sourceSize,
  sourceSha256: base.sourceSha256,
  intermediateSha256: base.targetSha256,
  targetSize: font.targetSize,
  targetSha256: expectedTarget,
});

// Desktop path: stream into a hashing sink.
const sinkHash = createHash('sha256');
const desktop = await applyLayeredPatchToWritable(await openAsBlob(stockPath), {
  async write(chunk) { sinkHash.update(chunk); },
  async close() {},
  async abort() {},
}, layered);
const desktopDigest = sinkHash.digest('hex');

// Mobile path: bounded capture windows + source slices, hashed independently.
const download = await buildVerifiedLayeredPatchedBlob(await openAsBlob(stockPath), layered);
const blobHash = createHash('sha256');
for await (const chunk of download.blob.stream()) blobHash.update(chunk);
const downloadDigest = blobHash.digest('hex');

for (const digest of [desktop.targetSha256, desktopDigest, download.targetSha256, downloadDigest]) {
  if (digest !== expectedTarget) throw new Error(`Layered output digest ${digest} differs from ${expectedTarget}`);
}
console.log(JSON.stringify({
  targetSha256: downloadDigest,
  intermediateSha256: desktop.intermediateSha256,
  capturedBytes: download.capturedBytes,
  desktopReapply: 'PASS',
  browserDownloadReapply: 'PASS',
}));
