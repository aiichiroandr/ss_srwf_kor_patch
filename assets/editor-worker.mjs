import {
  exportEditedImage,
  inspectPatchedImage,
  previewEditorRecord,
} from "./editor-core.mjs?v=20260926-1";

let activeJob = null;
let editorSession = null;

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message.type !== "string") return;

  if (message.type === "CANCEL") {
    if (activeJob && (!message.jobId || message.jobId === activeJob.jobId)) {
      activeJob.controller.abort(new DOMException("Operation aborted", "AbortError"));
    }
    return;
  }
  if (message.type === "RESET") {
    activeJob?.controller.abort(new DOMException("Operation aborted", "AbortError"));
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
  try {
    if (!editorSession || message.sessionToken !== editorSession.sessionToken) {
      throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
    }
    const result = await previewEditorRecord(editorSession, message.kind, message.recordIndex);
    const response = {
      type: "PREVIEW_COMPLETE",
      previewId: message.previewId,
      kind: result.kind,
      recordIndex: result.recordIndex,
      image: result.image,
    };
    self.postMessage(response, result.image ? [result.image.pixels.buffer] : []);
  } catch (error) {
    self.postMessage({
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
  activeJob = { jobId: message.jobId, controller };
  try {
    if (message.type === "INSPECT") {
      editorSession = null;
      const result = await inspectPatchedImage(message.imageBlob, message.descriptor, {
        signal: controller.signal,
        onProgress: (progress) => postProgress(message.jobId, progress),
      });
      editorSession = result.session;
      self.postMessage({
        type: "INSPECT_COMPLETE",
        jobId: message.jobId,
        view: result.view,
      });
      return;
    }

    if (!editorSession) {
      throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
    }
    const result = await exportEditedImage(editorSession, message.request, {
      signal: controller.signal,
      onProgress: (progress) => postProgress(message.jobId, progress),
    });
    self.postMessage({
      type: "EXPORT_COMPLETE",
      jobId: message.jobId,
      result,
    });
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      self.postMessage({ type: "CANCELLED", jobId: message.jobId });
    } else {
      postError(
        message.jobId,
        typeof error?.code === "string" ? error.code : "EDITOR_FAILED",
        typeof error?.message === "string" ? error.message : "The editor operation failed.",
      );
    }
  } finally {
    if (activeJob?.jobId === message.jobId) activeJob = null;
  }
}

function postProgress(jobId, progress) {
  const total = Number.isSafeInteger(progress?.total) && progress.total > 0 ? progress.total : 1;
  const processed = Number.isSafeInteger(progress?.processed) && progress.processed >= 0
    ? Math.min(progress.processed, total)
    : 0;
  self.postMessage({
    type: "PROGRESS",
    jobId,
    phase: progress?.phase === "compress" ? "compress" : progress?.phase,
    processed,
    total,
  });
}

function postError(jobId, code, message) {
  self.postMessage({
    type: "ERROR",
    jobId: typeof jobId === "string" ? jobId : null,
    error: { code, message },
  });
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
