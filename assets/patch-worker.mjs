import {
  PATCH_LIMITS,
  applyPatchToWritable,
  buildVerifiedPatchedBlob,
  parsePatch,
} from "./patch-core.mjs?v=20260813-6";
import { sha256Hex } from "./sha256.mjs?v=20260813-6";

let activeJob = null;
let preparedSource = null;
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
    patchCache = null;
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
  const rawWritable = await createOutputWritable(message.outputHandle, signal);
  await applyPreparedPatch(
    message,
    signal,
    context,
    rawWritable,
    "APPLY_PATCH",
  );
}

async function buildPatchedDownload(message, signal) {
  const context = requirePreparedApplication(message);
  const names = validateDownloadOutputNames(message);

  postPhase(message.jobId, "source-apply");
  let result;
  try {
    // This path never opens an Android document-provider output. The core
    // retains only bounded windows containing changed records and reuses
    // source Blob slices for every unchanged gap. It returns nothing until the
    // complete source hash, every record preimage, and the target hash match.
    result = await buildVerifiedPatchedBlob(
      context.sourceFile,
      context.parsedPatch,
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
) {

  postPhase(message.jobId, "source-apply");
  let result;
  try {
    // The core authenticates the source and output in the same source pass. It
    // closes only after both hashes and every record preimage match.
    result = await applyPatchToWritable(
      context.sourceFile,
      writable,
      context.parsedPatch,
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

  const cacheKey = `${releaseKey}:${descriptor.patchSha256}`;
  if (patchCache?.key === cacheKey) {
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

  let parsedPatch;
  try {
    parsedPatch = await parsePatch(patchBytes, descriptor);
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
  ]).has(error?.code);
}

function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "Patch descriptor is missing");
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
  if (descriptor.recordCount > Math.min(PATCH_LIMITS.maxRecordCount, 1_000_000)) {
    throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", "recordCount exceeds the worker safety cap");
  }
  for (const key of ["patchSha256", "sourceSha256", "targetSha256"]) {
    if (typeof descriptor[key] !== "string" || !/^[0-9a-f]{64}$/i.test(descriptor[key])) {
      throw new WorkerPatcherError("PATCH_DESCRIPTOR_INVALID", `${key} must be a SHA-256 digest`);
    }
  }
}

function descriptorFingerprint(descriptor) {
  return DESCRIPTOR_KEYS.map((key) => `${key}=${descriptor[key]}`).join("\n");
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
