// Receive a patch through stdin; verify the browser download output in RAM only.
//
//   node tests/helpers/verify-prepared-patch.mjs STOCK EXPECTED_TARGET_SHA256 [VARIANT] < patch.srwfp
//
// A v1 patch (SRWFKP1) is applied as before. A shared v3 payload (SRWFKP3) needs the variant
// letter (a, b or c): there is no default variant, and EXPECTED_TARGET_SHA256 is pinned to that
// variant exactly as the release manifest pins it in the browser.
import { openAsBlob } from 'node:fs';
import { createHash } from 'node:crypto';
import { parsePatch, buildVerifiedPatchedBlob } from '../../assets/patch-core.mjs';
import { buildVerifiedPatchedBlobV3, parsePatchV3, selectVariantV3 } from '../../assets/patch-core-v3.mjs';
const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
const patch=Buffer.concat(chunks);
const stock=await openAsBlob(process.argv[2]);
let result;
if(patch.subarray(0,8).equals(Buffer.from('SRWFKP3\0','latin1'))){
  const group=await parsePatchV3(patch);
  const variant=process.argv[4];
  const entry=group.variants.find((candidate)=>candidate.variant===variant);
  const plan=selectVariantV3(group,{variant,targetSha256:process.argv[3],recordCount:entry?.recordCount});
  result=await buildVerifiedPatchedBlobV3(stock,plan);
}else{
  const parsed=await parsePatch(patch);
  result=await buildVerifiedPatchedBlob(stock,parsed);
}
const hash=createHash('sha256');
for await (const chunk of result.blob.stream()) hash.update(chunk);
const digest=hash.digest('hex');
if(digest!==process.argv[3]) throw new Error('Independent output digest differs');
console.log(JSON.stringify({targetSha256:digest, capturedBytes:result.capturedBytes,
  browserDownloadReapply:'PASS', outputBytes:result.blob.size}));
