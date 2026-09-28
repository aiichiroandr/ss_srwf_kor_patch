// Receive a v1 patch through stdin; verify browser download output in RAM only.
import { openAsBlob } from 'node:fs';
import { createHash } from 'node:crypto';
import { parsePatch, buildVerifiedPatchedBlob } from '../../assets/patch-core.mjs';
const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
const parsed=await parsePatch(Buffer.concat(chunks));
const result=await buildVerifiedPatchedBlob(await openAsBlob(process.argv[2]),parsed);
const hash=createHash('sha256');
for await (const chunk of result.blob.stream()) hash.update(chunk);
const digest=hash.digest('hex');
if(digest!==process.argv[3]) throw new Error('Independent output digest differs');
console.log(JSON.stringify({targetSha256:digest, capturedBytes:result.capturedBytes,
  browserDownloadReapply:'PASS', outputBytes:result.blob.size}));
