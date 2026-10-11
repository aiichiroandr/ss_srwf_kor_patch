import {
  exportEditedImage,
  inspectPatchedImage,
  previewEditorRecord,
} from "./editor-core.mjs?v=20261011-public13";

// The worker body takes its scope and the three core operations so that a test can drive it with a fake scope and fake
// operations. The page's worker starts it below with the real ones.
//
// Job lifecycle. At most one INSPECT or EXPORT job is active. A job is LIVE while it is the active job and its signal has not
// been aborted; only a live job may report progress, publish a session or post a result. CANCEL aborts the active job and
// leaves it active until it has unwound and reported CANCELLED. RESET aborts it, forgets it and drops the session in one
// step, so the next INSPECT can start at once and nothing the old job still holds can reach the new state: the old job
// ends with CANCELLED for its own job number, whatever its core operation does after the abort (a core that ignores the
// abort and resolves anyway changes nothing).
export function createEditorWorker(scope, api) {
  let activeJob = null;
  let editorSession = null;

  const abortError = () => new DOMException("Operation aborted", "AbortError");
  const abortJob = (job) => { if (!job.controller.signal.aborted) job.controller.abort(abortError()); };

  scope.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") return;

    if (message.type === "CANCEL") {
      if (activeJob && (!message.jobId || message.jobId === activeJob.jobId)) abortJob(activeJob);
      return;
    }
    if (message.type === "RESET") {
      if (activeJob) abortJob(activeJob);
      activeJob = null;
      editorSession = null;
      return;
    }
    if (message.type === "INSPECT" || message.type === "EXPORT") {
      void runJob(message);
      return;
    }
    if (message.type === "PREVIEW") {
      void runPreview(message);
    }
  });

  async function runPreview(message) {
    // The preview belongs to the session it was asked for: when that session is reset or replaced while the picture is
    // being read, the answer is "no longer available" instead of a picture of the old image.
    const session = editorSession;
    try {
      if (!session || message.sessionToken !== session.sessionToken) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      const result = await api.previewEditorRecord(session, message.kind, message.recordIndex);
      if (editorSession !== session) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      const response = {
        type: "PREVIEW_COMPLETE",
        previewId: message.previewId,
        kind: result.kind,
        recordIndex: result.recordIndex,
        image: result.image,
        imageSource: result.imageSource === "reference" ? "reference" : "record",
      };
      scope.postMessage(response, result.image ? [result.image.pixels.buffer] : []);
    } catch (error) {
      scope.postMessage({
        type: "PREVIEW_ERROR",
        previewId: message.previewId,
        kind: message.kind,
        recordIndex: message.recordIndex,
        error: typeof error?.message === "string" ? error.message : "Preview is unavailable.",
      });
    }
  }

  async function runJob(message) {
    if (activeJob) {
      postError(message.jobId, "EDITOR_BUSY", "Another editor operation is already running.");
      return;
    }
    if (typeof message.jobId !== "string" || message.jobId.length < 8 || message.jobId.length > 128) {
      postError(message.jobId, "EDITOR_JOB_INVALID", "The editor operation identity is invalid.");
      return;
    }

    const controller = new AbortController();
    const job = { jobId: message.jobId, controller };
    activeJob = job;
    const live = () => activeJob === job && !controller.signal.aborted;
    // The last check before a job publishes anything. The core operations check the signal between their reads, but the
    // last read can finish after the abort arrived.
    const requireLive = () => {
      if (!live()) {
        abortJob(job);
        throw controller.signal.reason ?? abortError();
      }
    };
    // Blob streams can produce thousands of chunks per image. Send the first
    // update of each phase and each visible percentage instead of asking the
    // page to rebuild its progress panel for every chunk. This is job-local;
    // cancellation and a new job cannot inherit an earlier job's progress.
    let lastProgress = null;
    const onProgress = (progress) => {
      if (!live()) return;
      const total = Number.isSafeInteger(progress?.total) && progress.total > 0 ? progress.total : 1;
      const processed = Number.isSafeInteger(progress?.processed) && progress.processed >= 0
        ? Math.min(progress.processed, total) : 0;
      const percent = Math.floor(processed * 100 / total);
      const indeterminate = progress?.indeterminate === true;
      if (lastProgress && lastProgress.phase === progress?.phase && lastProgress.total === total
        && lastProgress.indeterminate === indeterminate && lastProgress.percent === percent
        && processed >= lastProgress.processed) return;
      lastProgress = { phase: progress?.phase, total, processed, percent, indeterminate };
      postProgress(message.jobId, { ...progress, processed, total });
    };
    try {
      if (message.type === "INSPECT") {
        // The session of the image that is open stays until another image has been opened: a refused or cancelled
        // inspect leaves the edits on screen exportable. Only a successful inspect or RESET replaces it.
        const result = await api.inspectPatchedImage(message.imageBlob, message.descriptor, {
          signal: controller.signal,
          onProgress,
        });
        requireLive();
        scope.postMessage({
          type: "INSPECT_COMPLETE",
          jobId: message.jobId,
          view: result.view,
        });
        editorSession = result.session;
        return;
      }

      if (!editorSession) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      const result = await api.exportEditedImage(editorSession, message.request, {
        signal: controller.signal,
        onProgress,
      });
      requireLive();
      scope.postMessage({
        type: "EXPORT_COMPLETE",
        jobId: message.jobId,
        result,
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        scope.postMessage({ type: "CANCELLED", jobId: message.jobId });
      } else {
        postError(
          message.jobId,
          typeof error?.code === "string" ? error.code : "EDITOR_FAILED",
          typeof error?.message === "string" ? error.message : "The editor operation failed.",
          error?.details,
        );
      }
    } finally {
      // Only this job's own entry is cleared: after RESET the active job may already be a newer one with the same number.
      if (activeJob === job) activeJob = null;
    }
  }

  function postProgress(jobId, progress) {
    const total = Number.isSafeInteger(progress?.total) && progress.total > 0 ? progress.total : 1;
    const processed = Number.isSafeInteger(progress?.processed) && progress.processed >= 0
      ? Math.min(progress.processed, total)
      : 0;
    scope.postMessage({
      type: "PROGRESS",
      jobId,
      phase: progress?.phase === "compress" ? "compress" : progress?.phase,
      processed,
      total,
      ...(progress?.indeterminate === true ? { indeterminate: true } : {}),
    });
  }

  function postError(jobId, code, message, details = null) {
    scope.postMessage({
      type: "ERROR",
      jobId: typeof jobId === "string" ? jobId : null,
      error: { code, message, details: safeDetails(details) },
    });
  }

  return Object.freeze({ safeDetails });
}

// What may travel with an error: whole numbers (for example how many bytes an export overshoots its slot) and, under
// the four keys that say what was refused (`kind` of record, `field`, `reason`, `cause`), a short token such as
// `pilot`, `specialAbilities`, `capacity` or `hero-slot`. Nothing else crosses: no free text, no other key's string.
const DETAIL_TOKEN_KEYS = new Set(["kind", "field", "reason", "cause"]);
const DETAIL_TOKEN = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
function safeDetails(details) {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return null;
  const result = {};
  for (const [key, value] of Object.entries(details)) {
    if (Number.isSafeInteger(value)) result[key] = value;
    else if (DETAIL_TOKEN_KEYS.has(key) && typeof value === "string" && DETAIL_TOKEN.test(value)) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  createEditorWorker(self, { exportEditedImage, inspectPatchedImage, previewEditorRecord });
}
