import {readSrw4RomFile} from './editor-srw4-file.mjs?v=20261113-alicecopies1';
// Session-only source ownership. A JSON flag or a decoded pixel array cannot
// create a connected source: only a completed read of the supplied Blob can.
async function readSource(blob, options) {
  const {scanSrw4Icons} = await import('./editor-srw4-rom.mjs?v=20261113-alicecopies1');
  options.onProgress?.({phase:'srw4-read',indeterminate:true});
  const bytes=new Uint8Array(await blob.arrayBuffer());
  options.signal?.throwIfAborted();options.onProgress?.({phase:'srw4-source',processed:0,total:1});
  const report=await scanSrw4Icons(bytes,options);
  if(report.identity.profileId==='srw4-jp-rev1'){const {readSrw4CruiserFrames}=await import('./editor-srw4-battle.mjs?v=20261113-alicecopies1');report.battleFrames=readSrw4CruiserFrames(bytes.subarray(report.identity.headerBytes));report.capabilities.battleBodies='cruiser-frames-rom-verified';}
  return report;
}

const clone = value => structuredClone(value);
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function live(signal) { signal?.throwIfAborted(); }

export function createSrw4SourceStore({readCatalog = readSource} = {}) {
  const prepared = new WeakMap(), attached = new WeakMap();
  return Object.freeze({
    async prepare(blob, {signal, onProgress} = {}) {
      live(signal);onProgress?.({phase:'srw4-read',indeterminate:true});if(!(blob instanceof Blob)||![0x300000,0x300200].includes(blob.size))blob=await readSrw4RomFile(blob,{signal});
      if (!(blob instanceof Blob) || ![0x300000, 0x300200].includes(blob.size))
        fail('SRW4_ROM_SIZE', '제4차 SFC 원본 ROM(.sfc/.smc)을 선택해 주세요.');
      onProgress?.({phase:'srw4-source', processed:0, total:1});
      const report = await readCatalog(blob, {signal, onProgress});
      live(signal);
      if (report?.identity?.profileId !== 'srw4-jp-rev1'
        || !/^[a-f0-9]{64}$/.test(report.identity.sha256)
        || !Array.isArray(report.units) || !Array.isArray(report.assets))
        fail('SRW4_SOURCE_INVALID', '제4차 자료의 검증 결과를 확인하지 못했습니다.');
      // Never hand the internally retained arrays to UI code. Browser worker
      // messages clone again, but callers outside a worker have the same rule.
      const handle = Object.freeze({});
      prepared.set(handle, {blob, report:clone(report)});
      onProgress?.({phase:'srw4-source', processed:1, total:1});
      return handle;
    },
    prepared(handle) {const record=prepared.get(handle);if(!record)fail('SRW4_SOURCE_INVALID','검증이 끝난 제4차 원본이 아닙니다.');return clone(record.report);},
    attach(session, handle) {
      if (!session || typeof session !== 'object') fail('EDITOR_SESSION_MISSING', 'ROM을 먼저 열어 주세요.');
      const record = prepared.get(handle);
      if (!record) fail('SRW4_SOURCE_INVALID', '검증이 끝난 제4차 원본이 아닙니다.');
      prepared.delete(handle);
      attached.set(session, record);
      return clone(record.report);
    },
    clear(session) { attached.delete(session); },
    view(session) { const record = attached.get(session); return record ? clone(record.report) : null; },
    // This accessor is for the core's future writers, not a request format.
    // Returning a fresh copy prevents a caller from changing a verified source.
    source(session) { const record = attached.get(session); return record ? {blob:record.blob, report:clone(record.report)} : null; },
  });
}
