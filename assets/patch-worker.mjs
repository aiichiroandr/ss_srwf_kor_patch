import {
  PATCH_LIMITS,
  applyPatchToWritable,
  buildVerifiedPatchedBlob,
  parsePatch,
} from "./patch-core.mjs?v=20260929-1";
import {
  PATCH_FORMAT_V2,
  PATCH_V2_LIMITS,
  applyPatchV2ToWritable,
  buildVerifiedPatchedBlobV2,
  parsePatchV2,
} from "./patch-core-v2.mjs?v=20260929-1";
import {
  PATCH_FORMAT_V3,
  PATCH_V3_DESCRIPTOR_KEYS,
  PATCH_V3_LIMITS,
  PATCH_V3_MIN_PATCH_BYTES,
  applyPatchV3ToWritable,
  buildVerifiedPatchedBlobV3,
  parsePatchV3,
  selectVariantV3,
} from "./patch-core-v3.mjs?v=20260929-1";
import { sha256Hex } from "./sha256.mjs?v=20260929-1";

let activeJob = null;
let preparedSource = null;
// 파싱한 패치의 단일 슬롯. v1·v2는 릴리스 단위(RESET이 비운다), v3는 공유 payload 단위
// (payload SHA-256이 키이며 RESET이 유지한다). 변형 a/b/c를 바꿔도 다시 받거나 다시
// 파싱하지 않고, 한 번에 하나의 payload 그룹만 보관한다.
let patchCache = null;
const DESCRIPTOR_KEYS = Object.freeze([
  "patchSize",
  "patchSha256",
  "sourceSize",
  "sourceSha256",
  "targetSize",
  "targetSha256",
  "recordCount",
  "bodyUncompressedSize",
]);
const V2_DESCRIPTOR_KEYS = Object.freeze([...DESCRIPTOR_KEYS, "format"]);
const PATCH_FORMAT_V1 = "srwf.sparse-byte-delta.v1";
// v3 payload 수준 지문: 변형과 무관한 descriptor 항목만 넣는다. variant, targetSha256,
// recordCount는 selectVariantV3가 적용할 때마다 다시 고정한다.
const V3_PAYLOAD_FINGERPRINT_KEYS = Object.freeze([
  "format",
  "patchSize",
  "patchSha256",
  "sourceSize",
  "sourceSha256",
  "targetSize",
  "bodyUncompressedSize",
  "commonRecordCount",
]);
// descriptor의 format이 v3면 v3(열한 키, 키 개수로 추측하지 않는다). 아니면 기존 규칙:
// 키 8개 = v1, v1 키 8개 + format = v2. 패치 본문 magic이 이와 다르면 추측하지 않고 멈춘다.
const PATCH_ENGINES = new Map([
  [PATCH_FORMAT_V1, Object.freeze({
    magic: "SRWFKP1\0",
    parse: parsePatch,
    applyToWritable: applyPatchToWritable,
    buildDownload: buildVerifiedPatchedBlob,
  })],
  [PATCH_FORMAT_V2, Object.freeze({
    magic: "SRWFKP2\0",
    parse: parsePatchV2,
    applyToWritable: applyPatchV2ToWritable,
    buildDownload: buildVerifiedPatchedBlobV2,
  })],
  [PATCH_FORMAT_V3, Object.freeze({
    magic: "SRWFKP3\0",
    parse: parsePatchV3,
    // 공유 payload에서 변형을 고르는 단계. 준비할 때 한 번, 적용할 때마다 다시 부른다.
    select: (parsedPatch, descriptor) => selectVariantV3(parsedPatch, {
      variant: descriptor.variant,
      targetSha256: descriptor.targetSha256,
      recordCount: descriptor.recordCount,
    }),
    sharedPayload: true,
    applyToWritable: applyPatchV3ToWritable,
    buildDownload: buildVerifiedPatchedBlobV3,
  })],
]);
const SAFE_IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/;
const SAFE_CUE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.cue$/;

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "CANCEL") {
    if (activeJob && (!message.jobId || message.jobId === activeJob.jobId)) {
      activeJob.controller.abort(createAbortError());
    }
    return;
  }

  if (message.type === "RESET") {
    activeJob?.controller.abort(createAbortError());
    preparedSource = null;
    // 공유 v3 payload는 내용 주소(payload SHA-256)로만 재사용되며 원본 상태가 아니므로 남긴다.
    if (patchCache?.kind !== "payload") {
      patchCache = null;
    }
    return;
  }

  if (
    message.type === "PREPARE_SOURCE"
    || message.type === "APPLY_PATCH"
    || message.type === "BUILD_PATCH_DOWNLOAD"
  ) {
    void runJob(message);
  }
});

async function runJob(message) {
  if (activeJob) {
    postError(message.jobId, new WorkerPatcherError("WORKER_BUSY", "Another patch operation is already running"));
    return;
  }

  const controller = new AbortController();
  activeJob = { jobId: message.jobId, controller };

  try {
    if (message.type === "PREPARE_SOURCE") {
      await prepareSource(message, controller.signal);
    } else if (message.type === "APPLY_PATCH") {
      await writePatchedImage(message, controller.signal);
    } else {
      await buildPatchedDownload(message, controller.signal);
    }
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      postMessage({ type: "cancelled", jobId: message.jobId });
    } else {
      postError(message.jobId, error);
    }
  } finally {
    if (activeJob?.jobId === message.jobId) {
      activeJob = null;
    }
  }
}

async function prepareSource(message, signal) {
  // Starting a new preparation revokes every earlier capability immediately,
  // even when validation, download, or parsing fails.
  preparedSource = null;
  requireJobId(message.jobId);
  if (!(message.sourceFile instanceof Blob)) {
    throw new WorkerPatcherError("SOURCE_FILE_INVALID", "Source must be a browser File or Blob");
  }
  requireString(message.releaseKey, "release key");
  validateDescriptor(message.descriptor);
  if (message.sourceFile.size !== message.descriptor.sourceSize) {
    throw new WorkerPatcherError("SOURCE_SIZE_MISMATCH", "Source size does not match the release descriptor");
  }

  const parsedPatch = await loadParsedPatch(
    message.releaseKey,
    message.patchUrl,
    message.descriptor,
    message.jobId,
    signal,
  );
  throwIfAborted(signal);
  // 공유 payload는 파싱 직후 변형을 한 번 골라 보아, 잘못된 변형·해시·record 수를
  // 원본을 읽기 전에 거부한다. 적용할 때마다 다시 고른다.
  selectForApplication(parsedPatch, message.descriptor);

  const preparationToken = createToken();
  preparedSource = {
    token: preparationToken,
    releaseKey: message.releaseKey,
    sourceFile: message.sourceFile,
    parsedPatch,
    descriptor: message.descriptor,
  };

  postMessage({
    type: "complete",
    jobId: message.jobId,
    operation: "PREPARE_SOURCE",
    preparationToken,
  });
}

async function writePatchedImage(message, signal) {
  const context = requirePreparedApplication(message);
  // 변형 선택 오류는 출력 파일을 열기 전에 낸다(열린 writable을 남기지 않는다).
  const subject = selectForApplication(context.parsedPatch, context.descriptor);
  const rawWritable = await createOutputWritable(message.outputHandle, signal);
  await applyPreparedPatch(
    message,
    signal,
    context,
    rawWritable,
    "APPLY_PATCH",
    undefined,
    subject,
  );
}

async function buildPatchedDownload(message, signal) {
  const context = requirePreparedApplication(message);
  const names = validateDownloadOutputNames(message);
  const subject = selectForApplication(context.parsedPatch, context.descriptor);

  postPhase(message.jobId, "source-apply");
  let result;
  try {
    // This path never opens an Android document-provider output. The core
    // retains only bounded windows containing changed records and reuses
    // source Blob slices for every unchanged gap. It returns nothing until the
    // complete source hash, every record preimage, and the target hash match.
    result = await patchEngineFor(context.descriptor).buildDownload(
      context.sourceFile,
      subject,
      {
        signal,
        onProgress: createProgressReporter(
          message.jobId,
          "source-apply",
          context.descriptor.targetSize,
          signal,
        ),
      },
    );
  } catch (error) {
    if (isSourceAuthenticationError(error)) {
      preparedSource = null;
    }
    throw error;
  }

  postPhase(message.jobId, "output-verify");
  // Blob is structured-cloneable but not transferable. Do not pass a transfer
  // list: the browser can preserve its immutable backing store without
  // materializing the full disc image in JavaScript memory.
  postMessage({
    type: "complete",
    jobId: message.jobId,
    operation: "BUILD_PATCH_DOWNLOAD",
    result: Object.freeze({
      ...sanitizeResult(result),
      outputBlob: result.blob,
      ...names,
    }),
  });
}

function requirePreparedApplication(message) {
  requireJobId(message.jobId);
  requireString(message.releaseKey, "release key");
  requireString(message.preparationToken, "preparation token");

  if (
    !preparedSource
    || preparedSource.token !== message.preparationToken
    || preparedSource.releaseKey !== message.releaseKey
  ) {
    throw new WorkerPatcherError("PREPARED_SOURCE_MISSING", "The prepared source state is unavailable");
  }
  return preparedSource;
}

async function createOutputWritable(outputHandle, signal) {
  if (!outputHandle || typeof outputHandle.createWritable !== "function") {
    throw new WorkerPatcherError("OUTPUT_HANDLE_INVALID", "Output must be a File System Access handle");
  }

  throwIfAborted(signal);
  let writable;
  try {
    writable = await outputHandle.createWritable({ keepExistingData: false });
  } catch (error) {
    throw remapOutputError(error);
  }
  if (signal.aborted) {
    try {
      await writable.abort(createAbortError());
    } catch {
      // The cancellation itself remains authoritative.
    }
    throw createAbortError();
  }
  return writable;
}

async function applyPreparedPatch(
  message,
  signal,
  context,
  writable,
  operation,
  outputNames,
  subject = context.parsedPatch,
) {

  postPhase(message.jobId, "source-apply");
  let result;
  try {
    // The core authenticates the source and output in the same source pass. It
    // closes only after both hashes and every record preimage match.
    result = await patchEngineFor(context.descriptor).applyToWritable(
      context.sourceFile,
      writable,
      subject,
      {
        signal,
        onProgress: createProgressReporter(
          message.jobId,
          "source-apply",
          context.descriptor.targetSize,
          signal,
        ),
      },
    );
  } catch (error) {
    if (isSourceAuthenticationError(error)) {
      preparedSource = null;
    }
    throw error;
  }
  writable = null;

  postPhase(message.jobId, "output-verify");
  postMessage({
    type: "complete",
    jobId: message.jobId,
    operation,
    result: Object.freeze({
      ...sanitizeResult(result),
      ...(outputNames ?? {}),
    }),
  });
}

function validateDownloadOutputNames(message) {
  requireString(message.imageName, "download image name");
  requireString(message.cueName, "download CUE name");
  if (!SAFE_IMAGE_NAME.test(message.imageName)
    || !SAFE_CUE_NAME.test(message.cueName)
    || /["/\\\0\r\n]/.test(message.imageName)
    || /["/\\\0\r\n]/.test(message.cueName)) {
    throw new WorkerPatcherError(
      "DOWNLOAD_OUTPUT_NAME_INVALID",
      "Download output names must be safe flat filenames",
    );
  }
  const imageStem = message.imageName.slice(0, -4);
  const cueStem = message.cueName.slice(0, -4);
  if (imageStem !== cueStem) {
    throw new WorkerPatcherError(
      "DOWNLOAD_OUTPUT_NAME_MISMATCH",
      "Download image and CUE basenames must match",
    );
  }
  return Object.freeze({
    imageName: message.imageName,
    cueName: message.cueName,
  });
}

async function loadParsedPatch(releaseKey, patchUrl, descriptor, jobId, signal) {
  requireString(patchUrl, "patch URL");
  const resolvedUrl = new URL(patchUrl, self.location.href);
  if (resolvedUrl.origin !== self.location.origin) {
    throw new WorkerPatcherError("EXTERNAL_URL_REJECTED", "Patch URL must be same-origin");
  }

  const sharedPayload = patchEngineFor(descriptor).sharedPayload === true;
  const cacheKind = sharedPayload ? "payload" : "release";
  // 공유 payload는 payload SHA-256이 키라서 같은 payload를 쓰는 다른 변형(a/b/c)이
  // 같은 항목을 재사용한다. v1·v2는 기존처럼 릴리스 단위 키다.
  const cacheKey = sharedPayload
    ? descriptor.patchSha256.toLowerCase()
    : `${releaseKey}:${descriptor.patchSha256}`;
  if (patchCache?.kind === cacheKind && patchCache.key === cacheKey) {
    if (
      patchCache.patchUrl !== resolvedUrl.href
      || patchCache.descriptorFingerprint !== descriptorFingerprint(descriptor)
    ) {
      throw new WorkerPatcherError(
        "PATCH_CACHE_MISMATCH",
        "Cached patch identity does not match the current URL and descriptor",
      );
    }
    return patchCache.parsedPatch;
  }
  if (sharedPayload) {
    // 한 번에 하나의 payload 그룹만 보관한다: 새 payload를 받기 전에 이전 그룹을 놓아
    // 두 그룹이 동시에 메모리에 올라가지 않게 한다.
    patchCache = null;
  }

  postPhase(jobId, "patch-download");
  let response;
  try {
    response = await fetch(resolvedUrl, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw createAbortError();
    }
    throw new WorkerPatcherError("PATCH_FETCH_FAILED", "Patch request failed", { cause: error });
  }
  if (!response.ok) {
    throw new WorkerPatcherError("PATCH_FETCH_FAILED", `Patch request failed with ${response.status}`);
  }

  const patchBytes = await readExactResponse(
    response,
    descriptor.patchSize,
    jobId,
    signal,
  );
  throwIfAborted(signal);

  postPhase(jobId, "patch-parse");
  const actualSha256 = sha256Hex(patchBytes);
  if (actualSha256 !== descriptor.patchSha256.toLowerCase()) {
    throw new WorkerPatcherError("PATCH_HASH_MISMATCH", "Patch SHA-256 does not match the release manifest");
  }

  const engine = patchEngineFor(descriptor);
  const actualMagic = String.fromCharCode(...patchBytes.subarray(0, 8));
  const knownMagic = [...PATCH_ENGINES.values()].some((candidate) => candidate.magic === actualMagic);
  if (knownMagic && actualMagic !== engine.magic) {
    throw new WorkerPatcherError(
      "PATCH_FORMAT_MISMATCH",
      "Patch payload format does not match the release descriptor",
    );
  }

  let parsedPatch;
  try {
    parsedPatch = await engine.parse(patchBytes, descriptor);
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") {
      throw error;
    }
    if (typeof error?.code === "string") {
      throw error;
    }
    throw new WorkerPatcherError("PATCH_PARSE_FAILED", "Patch parser rejected the payload", { cause: error });
  }
  throwIfAborted(signal);

  patchCache = {
    kind: cacheKind,
    key: cacheKey,
    patchUrl: resolvedUrl.href,
    descriptorFingerprint: descriptorFingerprint(descriptor),
    parsedPatch,
  };
  return parsedPatch;
}

async function readExactResponse(response, expectedSize, jobId, signal) {
  const bytes = new Uint8Array(expectedSize);
  let offset = 0;

  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength !== expectedSize) {
      throw new WorkerPatcherError("PATCH_SIZE_MISMATCH", "Patch byte length does not match the release manifest");
    }
    bytes.set(body);
    postProgress(jobId, "patch-download", expectedSize, expectedSize);
    return bytes;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (offset + value.byteLength > expectedSize) {
        throw new WorkerPatcherError("PATCH_SIZE_MISMATCH", "Patch exceeds its declared size");
      }
      bytes.set(value, offset);
      offset += value.byteLength;
      postProgress(jobId, "patch-download", offset, expectedSize);
    }
  } finally {
    reader.releaseLock();
  }

  if (offset !== expectedSize) {
    throw new WorkerPatcherError("PATCH_SIZE_MISMATCH", "Patch is shorter than its declared size");
  }
  return bytes;
}

function createProgressReporter(jobId, phase, fallbackTotal, signal) {
  let lastSentAt = 0;
  let lastProcessed = -1;
  return (...args) => {
    throwIfAborted(signal);
    const { processed, total } = normalizeProgress(args, fallbackTotal);
    const now = performance.now();
    if (processed !== total && processed === lastProcessed) {
      return;
    }
    if (processed !== total && now - lastSentAt < 50) {
      return;
    }
    lastSentAt = now;
    lastProcessed = processed;
    postProgress(jobId, phase, processed, total);
  };
}

function normalizeProgress(args, fallbackTotal) {
  const first = args[0];
  const second = args[1];
  let processed;
  let total;

  if (first && typeof first === "object") {
    processed = first.processed
      ?? first.processedBytes
      ?? first.loaded
      ?? first.bytesProcessed
      ?? first.completed
      ?? first.offset;
    total = first.total
      ?? first.totalBytes
      ?? first.size
      ?? fallbackTotal;
  } else {
    processed = first;
    total = second ?? fallbackTotal;
  }

  processed = Number(processed);
  total = Number(total);
  if (!Number.isFinite(processed) || processed < 0) {
    processed = 0;
  }
  if (!Number.isFinite(total) || total <= 0) {
    total = fallbackTotal;
  }
  return {
    processed: Math.min(processed, total),
    total,
  };
}

function postPhase(jobId, phase) {
  postMessage({ type: "phase", jobId, phase });
}

function postProgress(jobId, phase, processed, total) {
  postMessage({ type: "progress", jobId, phase, processed, total });
}

function postError(jobId, error) {
  postMessage({
    type: "error",
    jobId,
    error: {
      code: classifyError(error),
      name: typeof error?.name === "string" ? error.name : "Error",
      message: typeof error?.message === "string" ? error.message : "Patch worker failed",
    },
  });
}

function classifyError(error) {
  if (typeof error?.code === "string" && error.code) {
    return error.code;
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "OUTPUT_PERMISSION_DENIED";
  }
  if (error?.name === "QuotaExceededError") {
    return "OUTPUT_QUOTA_EXCEEDED";
  }
  if (new Set([
    "InvalidStateError",
    "NotReadableError",
    "UnknownError",
    "NoModificationAllowedError",
  ]).has(error?.name)) {
    return "OUTPUT_PROVIDER_FAILED";
  }
  return "PATCH_OPERATION_FAILED";
}

function remapOutputError(error) {
  const code = classifyError(error);
  if (code !== "PATCH_OPERATION_FAILED") {
    return new WorkerPatcherError(code, error?.message ?? "Output write failed", { cause: error });
  }
  return error;
}

function sanitizeResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  const safe = {};
  for (const key of [
    "bytesWritten",
    "size",
    "sha256",
    "sourceSha256",
    "targetSha256",
    "capturedBytes",
    "captureWindowCount",
  ]) {
    if (typeof result[key] === "number" || typeof result[key] === "string") {
      safe[key] = result[key];
    }
  }
  return safe;
}

function isSourceAuthenticationError(error) {
  return new Set([
    "SOURCE_SIZE_MISMATCH",
    "SOURCE_HASH_MISMATCH",
    "NON_DIFFERING_BYTE",
    "PREIMAGE_MISMATCH",
    "COPY_SOURCE_MISMATCH",
    "SOURCE_CANARY_MISMATCH",
  ]).has(error?.code);
}

function hasExactDescriptorKeys(descriptor, keys) {
  const suppliedKeys = Reflect.ownKeys(descriptor);
  return suppliedKeys.length === keys.length
    && keys.every((key) => Object.hasOwn(descriptor, key))
    && suppliedKeys.every((key) => typeof key === "string" && keys.includes(key));
}

function isV2Descriptor(descriptor) {
  return Boolean(descriptor)
    && typeof descriptor === "object"
    && !Array.isArray(descriptor)
    && hasExactDescriptorKeys(descriptor, V2_DESCRIPTOR_KEYS);
}

function isV3Descriptor(descriptor) {
  return Boolean(descriptor)
    && typeof descriptor === "object"
    && !Array.isArray(descriptor)
    && descriptor.format === PATCH_FORMAT_V3;
}

function patchEngineFor(descriptor) {
  if (isV3Descriptor(descriptor)) {
    return PATCH_ENGINES.get(PATCH_FORMAT_V3);
  }
  return PATCH_ENGINES.get(isV2Descriptor(descriptor) ? PATCH_FORMAT_V2 : PATCH_FORMAT_V1);
}

// 변형 선택이 있는 엔진(v3)은 파싱한 payload에서 이 릴리스의 변형을 골라 적용 대상을
// 돌려준다. 그 밖의 엔진은 파싱한 패치가 곧 적용 대상이다.
function selectForApplication(parsedPatch, descriptor) {
  const engine = patchEngineFor(descriptor);
  return typeof engine.select === "function" ? engine.select(parsedPatch, descriptor) : parsedPatch;
}

function validateDescriptorV3(descriptor) {
  if (!hasExactDescriptorKeys(descriptor, PATCH_V3_DESCRIPTOR_KEYS)) {
    throw new WorkerPatcherError(
      "PATCH_DESCRIPTOR_INVALID",
      "Patch descriptor must contain exactly the eleven documented v3 keys",
    );
  }
  const limits = PATCH_V3_LIMITS;
  for (const key of ["patchSize", "sourceSize", "targetSize"]) {
    if (!Number.isSafeInteger(descriptor[key]) || descriptor[key] <= 0) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a positive safe integer`);
    }
  }
  if (descriptor.patchSize < PATCH_V3_MIN_PATCH_BYTES) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize is smaller than the v3 format minimum");
  }
  if (descriptor.patchSize > limits.maxPatchBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize exceeds the v3 parser safety cap");
  }
  if (descriptor.sourceSize !== descriptor.targetSize) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Source and target sizes must match");
  }
  if (descriptor.sourceSize > limits.maxImageBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "sourceSize exceeds the v3 image cap");
  }
  if (!Number.isSafeInteger(descriptor.commonRecordCount)
    || descriptor.commonRecordCount < 1
    || descriptor.commonRecordCount > limits.maxCommonRecords) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "commonRecordCount is outside the v3 limits");
  }
  if (!Number.isSafeInteger(descriptor.recordCount)
    || descriptor.recordCount < descriptor.commonRecordCount
    || descriptor.recordCount > descriptor.commonRecordCount + limits.maxVariantRecords
    || descriptor.recordCount > limits.maxMergedRecords) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount is outside the v3 limits");
  }
  if (!Number.isSafeInteger(descriptor.bodyUncompressedSize)
    || descriptor.bodyUncompressedSize < descriptor.commonRecordCount * 3) {
    throw new WorkerPatcherError(
      "PATCH_DESCRIPTOR_INVALID",
      "bodyUncompressedSize is too small for the declared records",
    );
  }
  if (descriptor.bodyUncompressedSize > limits.maxBodyUncompressedBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "bodyUncompressedSize exceeds the v3 safety cap");
  }
  if (typeof descriptor.variant !== "string" || !/^[a-c]$/.test(descriptor.variant)) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "variant must be a, b, or c");
  }
  for (const key of ["patchSha256", "sourceSha256", "targetSha256"]) {
    if (typeof descriptor[key] !== "string" || !/^[0-9a-f]{64}$/i.test(descriptor[key])) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a SHA-256 digest`);
    }
  }
}

function validateDescriptorV2(descriptor) {
  if (descriptor.format !== PATCH_FORMAT_V2) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Patch descriptor format is not supported");
  }
  for (const key of ["patchSize", "sourceSize", "targetSize"]) {
    if (!Number.isSafeInteger(descriptor[key]) || descriptor[key] <= 0) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a positive safe integer`);
    }
  }
  if (descriptor.patchSize < 129) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize is smaller than the v2 format minimum");
  }
  if (descriptor.patchSize > PATCH_V2_LIMITS.maxPatchBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize exceeds the parser safety cap");
  }
  if (descriptor.targetSize <= descriptor.sourceSize) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "A v2 target must be larger than its source");
  }
  if (descriptor.targetSize - descriptor.sourceSize > PATCH_V2_LIMITS.maxGrowthBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Target growth exceeds the v2 safety cap");
  }
  if (!Number.isSafeInteger(descriptor.recordCount) || descriptor.recordCount < 1) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount must be a positive safe integer");
  }
  if (descriptor.recordCount > PATCH_V2_LIMITS.maxRecordCount) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount exceeds the worker safety cap");
  }
  if (!Number.isSafeInteger(descriptor.bodyUncompressedSize)
    || descriptor.bodyUncompressedSize < descriptor.recordCount * PATCH_V2_LIMITS.minRecordBytes.literal) {
    throw new WorkerPatcherError(
      "PATCH_DESCRIPTOR_INVALID",
      "bodyUncompressedSize is too small for the declared records",
    );
  }
  if (descriptor.bodyUncompressedSize > PATCH_V2_LIMITS.maxBodyUncompressedBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "bodyUncompressedSize exceeds the safety cap");
  }
  for (const key of ["patchSha256", "sourceSha256", "targetSha256"]) {
    if (typeof descriptor[key] !== "string" || !/^[0-9a-f]{64}$/i.test(descriptor[key])) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a SHA-256 digest`);
    }
  }
}

function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Patch descriptor is missing");
  }
  if (isV3Descriptor(descriptor)) {
    validateDescriptorV3(descriptor);
    return;
  }
  if (isV2Descriptor(descriptor)) {
    validateDescriptorV2(descriptor);
    return;
  }
  const suppliedKeys = Reflect.ownKeys(descriptor);
  if (
    suppliedKeys.length !== DESCRIPTOR_KEYS.length
    || DESCRIPTOR_KEYS.some((key) => !Object.hasOwn(descriptor, key))
    || suppliedKeys.some((key) => typeof key !== "string" || !DESCRIPTOR_KEYS.includes(key))
  ) {
    throw new WorkerPatcherError(
      "PATCH_DESCRIPTOR_INVALID",
      "Patch descriptor must contain exactly the eight documented keys",
    );
  }
  for (const key of ["patchSize", "sourceSize", "targetSize"]) {
    if (!Number.isSafeInteger(descriptor[key]) || descriptor[key] <= 0) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a positive safe integer`);
    }
  }
  if (descriptor.patchSize < 101) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize is smaller than the public format minimum");
  }
  if (descriptor.patchSize > PATCH_LIMITS.maxPatchBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "patchSize exceeds the parser safety cap");
  }
  if (descriptor.sourceSize !== descriptor.targetSize) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Source and target sizes must match");
  }
  if (!Number.isSafeInteger(descriptor.recordCount) || descriptor.recordCount < 1) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount must be a positive safe integer");
  }
  if (!Number.isSafeInteger(descriptor.bodyUncompressedSize)
    || descriptor.bodyUncompressedSize < 45) {
    throw new WorkerPatcherError(
      "PATCH_DESCRIPTOR_INVALID",
      "bodyUncompressedSize must be at least one non-empty record",
    );
  }
  if (descriptor.bodyUncompressedSize > PATCH_LIMITS.maxBodyUncompressedBytes) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "bodyUncompressedSize exceeds the safety cap");
  }
  if (descriptor.recordCount > PATCH_LIMITS.maxRecordCount) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount exceeds the worker safety cap");
  }
  for (const key of ["patchSha256", "sourceSha256", "targetSha256"]) {
    if (typeof descriptor[key] !== "string" || !/^[0-9a-f]{64}$/i.test(descriptor[key])) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a SHA-256 digest`);
    }
  }
}

function descriptorFingerprint(descriptor) {
  let keys;
  if (isV3Descriptor(descriptor)) {
    keys = V3_PAYLOAD_FINGERPRINT_KEYS;
  } else {
    keys = isV2Descriptor(descriptor) ? V2_DESCRIPTOR_KEYS : DESCRIPTOR_KEYS;
  }
  return keys.map((key) => `${key}=${descriptor[key]}`).join("\n");
}

function requireJobId(value) {
  requireString(value, "job id");
}

function requireString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new WorkerPatcherError("WORKER_MESSAGE_INVALID", `${label} is missing`);
  }
}

function throwIfAborted(signal) {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createAbortError() {
  return new DOMException("The patch operation was aborted", "AbortError");
}

function createToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

class WorkerPatcherError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "WorkerPatcherError";
    this.code = code;
  }
}
