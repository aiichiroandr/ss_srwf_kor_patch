// Desktop always resolves the unchanged desktop manifest. Mobile fallback
// happens before starting a runtime, never by restarting a live game.
export async function selectRuntime({optimized, game, mobileManifest = 'current-mobile.json'}, fetchManifest) {
  async function read(name) {
    const response = await fetchManifest(`./runtime/${name}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`실행 파일 목록을 읽지 못했습니다 (${response.status}).`);
    const manifest = await response.json();
    if (!/^[a-f0-9]{20}$/.test(manifest.version)
        || !Array.isArray(manifest.files)
        || manifest.files.length !== 2
        || !manifest.files.includes('saturn.js') || !manifest.files.includes('saturn.wasm')) {
      throw new Error('실행 파일 버전 정보가 올바르지 않습니다.');
    }
    return manifest.version;
  }
  if (optimized && game === 'final') {
    if (typeof mobileManifest !== 'string'
        || !/^[a-z0-9][a-z0-9_-]*\.json$/.test(mobileManifest)
        || !mobileManifest.endsWith('.json')) {
      throw new Error('모바일 실행 파일 목록 이름이 올바르지 않습니다.');
    }
    try { return {version: await read(mobileManifest), mobile: true, fallback: false}; }
    catch { return {version: await read('current.json'), mobile: false, fallback: true}; }
  }
  return {version: await read('current.json'), mobile: false, fallback: false};
}
