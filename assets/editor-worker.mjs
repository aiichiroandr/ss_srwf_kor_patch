import {
  exportEditedImage,
  inspectPatchedImage,
  readEditorSourceImage,
  previewEditorRecord,
  preflightEditedImage,
  prepareSrw4EditorSource,
  attachSrw4EditorSource,
  preflightSrw4HandPoints,
  clearSrw4EditorSource,
  prepareFCampaignEditorSource,
  attachFCampaignEditorSource,
  clearFCampaignEditorSource,
} from "./editor-core.mjs?v=20261104-part1";
import {readBattleDialogue} from './editor-battle-dialogue.mjs?v=20261104-part1';

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
  let editorView = null;
  // Retain only the latest completed export. Both consumers receive the same
  // immutable, fully validated Blob; in-flight work still owns the job slot.
  let completedExport = null;

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
      if (editorSession) api.clearSrw4EditorSource?.(editorSession);
      if (editorSession) api.clearFCampaignEditorSource?.(editorSession);
      editorSession = null;
      editorView = null;
      completedExport = null;
      return;
    }
    if (["INSPECT", "EXPORT", "PREFLIGHT", "SRW4_CONNECT", "SRW4_DISCONNECT", "F_CAMPAIGN_CONNECT", "F_CAMPAIGN_DISCONNECT"].includes(message.type)) {
      void runJob(message);
      return;
    }
    if (message.type === "PREVIEW") {
      void runPreview(message);
    }
    if(message.type==='BATTLE_DIALOGUE')void runBattleDialogue(message);
    if (message.type === "ANIMATION_SOURCE") {
      void runAnimationSource(message);
    }
  });

  const requireExportLive = (job, session) => {
    if (activeJob !== job || editorSession !== session) abortJob(job);
    job.controller.signal.throwIfAborted();
  };

  async function prepareExport(session, request, job, { onProgress, onBudget } = {}) {
    const key = exportRequestKey(request);
    requireExportLive(job, session);
    if (key !== null && completedExport?.session === session && completedExport.key === key) {
      const cached = completedExport;
      if (cached.hasBudget) onBudget?.(cached.budget);
      return cached;
    }
    completedExport = null;
    let budget, hasBudget = false;
    const result = await api.exportEditedImage(session, request, {
      signal: job.controller.signal,
      onProgress,
      onBudget: value => {
        if (activeJob !== job || editorSession !== session || job.controller.signal.aborted) return;
        budget = value; hasBudget = true; onBudget?.(value);
      },
    });
    requireExportLive(job, session);
    return { session, key, result, budget, hasBudget };
  }

  function rememberExport(prepared, job) {
    requireExportLive(job, prepared.session);
    if (prepared.key !== null) completedExport = prepared;
  }

  async function runBattleDialogue(message){
    const session=editorSession;
    try{
      if(!session||message.sessionToken!==session.sessionToken||!Number.isInteger(message.pilot)||message.pilot<1||message.pilot>399)throw Error('전투대사를 확인할 ROM·파일럿을 선택해주세요.');
      const catalog=await api.readBattleDialogue(session,message.pilot);
      if(editorSession!==session)throw Error('ROM 세션이 바뀌었습니다.');
      scope.postMessage({type:'BATTLE_DIALOGUE_COMPLETE',previewId:message.previewId,catalog});
    }catch(error){scope.postMessage({type:'BATTLE_DIALOGUE_ERROR',previewId:message.previewId,error:error.message||'기존 전투대사를 읽지 못했습니다.'});}
  }

  async function runAnimationSource(message){
    const session=editorSession;
    if(activeJob?.kind==='save-catalog'&&activeJob.controller.signal.aborted)activeJob=null;
    if(message.includeSaveCatalog===true&&activeJob?.kind==='animation-source'&&session&&message.sessionToken===session.sessionToken
      &&typeof message.previewId==='string'&&message.previewId.length>=8&&message.previewId.length<=128){abortJob(activeJob);activeJob=null;}
    if(activeJob||!session||message.sessionToken!==session.sessionToken){
      scope.postMessage({type:'ANIMATION_SOURCE_ERROR',previewId:message.previewId,error:'검증한 ROM 세션이 없습니다. 작업을 마친 뒤 다시 열어 주세요.'});return;
    }
    const job={jobId:message.previewId,kind:message.includeSaveCatalog===true?'save-catalog':'animation-source',controller:new AbortController()};activeJob=job;
    try{
      const original=api.readEditorSourceImage?.(session);
      let blob=original?.blob??session.sourceBlob,descriptor=original?.descriptor??session.descriptor;
      let prepared;
      if(message.request){
        prepared=await prepareExport(session,message.request,job);
        const result=prepared.result;
        blob=result.outputBlob;descriptor={...descriptor,targetSize:blob.size,targetSha256:result.sha256};
      }
      requireExportLive(job,session);
      let saveCatalog;
      if(message.includeSaveCatalog===true){
        saveCatalog=prepared?.saveCatalog??(!message.request?editorView:null);
        if(!saveCatalog){
          const inspected=await api.inspectPatchedImage(blob,{gameId:descriptor.gameId,targetSize:blob.size,
            targetSha256:session.descriptor.baseTargetSha256??session.descriptor.targetSha256,imageKind:'local'},
            {signal:job.controller.signal});
          requireExportLive(job,session);saveCatalog=inspected.view;
        }
        if(saveCatalog?.targetHash!==descriptor.targetSha256||saveCatalog?.gameId!==descriptor.gameId)
          throw makeError('EDITOR_SAVE_CATALOG_INVALID','세이브에 연결할 ROM 출력과 기체 정보가 일치하지 않습니다.');
        if(prepared)prepared.saveCatalog=saveCatalog;
      }
      requireExportLive(job,session);
      scope.postMessage({type:'ANIMATION_SOURCE_COMPLETE',previewId:message.previewId,blob,descriptor,...saveCatalog?{saveCatalog}:{}});
      if(prepared)rememberExport(prepared,job);
    }catch(error){if(activeJob===job)completedExport=null;scope.postMessage({type:'ANIMATION_SOURCE_ERROR',previewId:message.previewId,error:typeof error?.message==='string'?error.message:'미리보기용 편집본을 준비하지 못했습니다.',errorCode:typeof error?.code==='string'?error.code:null,details:safeDetails(error?.details)});}
    finally{if(activeJob===job)activeJob=null;}
  }

  async function runPreview(message) {
    // The preview belongs to the session it was asked for: when that session is reset or replaced while the picture is
    // being read, the answer is "no longer available" instead of a picture of the old image.
    const session = editorSession;
    try {
      if (!session || message.sessionToken !== session.sessionToken) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      const result = await api.previewEditorRecord(session, message.kind, message.recordIndex,
        {...message.unitPreset===undefined?{}:{unitPreset:message.unitPreset},
          ...message.heroFaceId===undefined?{}:{heroFaceId:message.heroFaceId},
          ...message.alicePilot===undefined?{}:{alicePilot:message.alicePilot}});
      if (editorSession !== session) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      const response = {
        type: "PREVIEW_COMPLETE",
        previewId: message.previewId,
        kind: result.kind,
        recordIndex: result.recordIndex,
        image: result.image,
        imageSource: result.imageSource === "save" ? "save" : result.imageSource === "reference" ? "reference" : "record",
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
    if(activeJob?.kind==='save-catalog'&&activeJob.controller.signal.aborted)activeJob=null;
    // Speculative preview reads must yield to real editing/source/output work.
    // Invalid requests cannot cancel them; late results retain their own guard.
    if (activeJob?.kind === 'animation-source' && typeof message.jobId === 'string'
      && message.jobId.length >= 8 && message.jobId.length <= 128) {
      abortJob(activeJob);
      activeJob = null;
    }
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
          tailReferenceBlob: message.tailReferenceBlob,
        });
        requireLive();
        scope.postMessage({
          type: "INSPECT_COMPLETE",
          jobId: message.jobId,
          view: result.view,
        });
        if (editorSession) api.clearSrw4EditorSource?.(editorSession);
        if (editorSession) api.clearFCampaignEditorSource?.(editorSession);
        editorSession = result.session;
        editorView = result.view;
        completedExport = null;
        return;
      }

      if (!editorSession) {
        throw makeError("EDITOR_SESSION_MISSING", "The authenticated editor session is no longer available.");
      }
      if(message.type==='F_CAMPAIGN_CONNECT'||message.type==='F_CAMPAIGN_DISCONNECT'){
        if(message.sessionToken!==editorSession.sessionToken)
          throw makeError('EDITOR_SESSION_MISSING','현재 완결편과 F 연결 요청이 일치하지 않습니다.');
        let catalog=null;
        if(message.type==='F_CAMPAIGN_CONNECT'){
          const prepared=await api.prepareFCampaignEditorSource(editorSession,message.sourceBlob,{signal:controller.signal,onProgress});
          requireLive();
          catalog=await api.attachFCampaignEditorSource(editorSession,prepared,{signal:controller.signal,onProgress});
          requireLive();
        }else{
          requireLive();api.clearFCampaignEditorSource(editorSession);
        }
        completedExport=null;
        scope.postMessage({type:'F_CAMPAIGN_SOURCE_COMPLETE',jobId:message.jobId,catalog});
        return;
      }
      if (message.type === 'SRW4_CONNECT' || message.type === 'SRW4_DISCONNECT') {
        if (message.sessionToken !== editorSession.sessionToken)
          throw makeError('EDITOR_SESSION_MISSING', '현재 ROM 세션과 제4차 연결 요청이 일치하지 않습니다.');
        let catalog = null;
        if (message.type === 'SRW4_CONNECT') {
          const prepared = await api.prepareSrw4EditorSource(message.sourceBlob, {signal:controller.signal,onProgress});
          requireLive();
          if(message.restorations!==undefined){
            onProgress({phase:'srw4-target-check',indeterminate:true});
            await api.preflightSrw4HandPoints(editorSession,message.restorations,{signal:controller.signal});
            requireLive();
          }
          catalog = await api.attachSrw4EditorSource(editorSession, prepared, {signal:controller.signal});
          requireLive();
        } else {
          requireLive(); api.clearSrw4EditorSource(editorSession);
        }
        completedExport = null;
        scope.postMessage({type:'SRW4_SOURCE_COMPLETE',jobId:message.jobId,catalog});
        return;
      }
      if(message.type==='PREFLIGHT'){
        const budget=await api.preflightEditedImage(editorSession,message.request,{signal:controller.signal,onProgress});
        requireLive();scope.postMessage({type:'PREFLIGHT_COMPLETE',jobId:message.jobId,budget});return;
      }
      const prepared = await prepareExport(editorSession, message.request, job, {
        onProgress,
        onBudget:(budget)=>{if(live())scope.postMessage({type:'STORAGE_BUDGET',jobId:message.jobId,budget});},
      });
      requireLive();
      scope.postMessage({
        type: "EXPORT_COMPLETE",
        jobId: message.jobId,
        result: prepared.result,
      });
      rememberExport(prepared, job);
    } catch (error) {
      if (message.type === "EXPORT" && activeJob === job) completedExport = null;
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

// Cache only plain, exact JSON data. Values JSON would omit or coerce (own
// undefined fields, sparse arrays, non-finite numbers, accessors, and so on)
// must still reach the core's original validation instead of hitting a cache.
function exportRequestKey(request) {
  const ancestors = new Set();
  const exact = value => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
    if (typeof value !== "object" || ancestors.has(value)) return false;
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    if (array && (keys.length !== value.length + 1
      || keys.some((key, index) => key !== (index === value.length ? "length" : String(index))))) return false;
    ancestors.add(value);
    try {
      return keys.every(key => {
        if (array && key === "length") return true;
        const field = Object.getOwnPropertyDescriptor(value, key);
        return typeof key === "string" && field.enumerable && Object.hasOwn(field, "value") && exact(field.value);
      });
    } finally { ancestors.delete(value); }
  };
  try { return exact(request) ? JSON.stringify(request) : null; }
  catch { return null; }
}

// What may travel with an error: whole numbers (for example how many bytes an export overshoots its slot) and, under
// the four keys that say what was refused (`kind` of record, `field`, `reason`, `cause`), a short token such as
// `pilot`, `specialAbilities`, `capacity` or `hero-slot`. Nothing else crosses: no free text, no other key's string.
const DETAIL_TOKEN_KEYS = new Set(["kind", "field", "reason", "cause", "component"]);
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

if (new URL(import.meta.url).searchParams.get('factory') !== '1'
  && typeof self !== "undefined" && typeof self.addEventListener === "function") {
  createEditorWorker(self, { exportEditedImage, inspectPatchedImage, readEditorSourceImage, previewEditorRecord, preflightEditedImage,readBattleDialogue,
    prepareSrw4EditorSource,preflightSrw4HandPoints,attachSrw4EditorSource,clearSrw4EditorSource,
    prepareFCampaignEditorSource,attachFCampaignEditorSource,clearFCampaignEditorSource });
}
