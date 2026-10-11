// Looks for the one patched BIN a folder holds for the selected release. Only names, sizes, the game header and the
// optional CUE decide the candidate; the complete SHA-256 is read once, by the editor worker, so a large image is not
// hashed twice. Whether the candidate is a public patch result or a personal edit is decided there, never here.
export async function findPatchedEditorImage(directory, release, { signal, onCueTracks } = {}) {
  const images = [], cues = [];
  let entries = 0;
  for await (const handle of directory.values()) {
    signal?.throwIfAborted();
    if (++entries > 256) throw new Error("파일이 너무 많습니다. 사용할 BIN/CUE만 있는 폴더를 골라 주세요.");
    if (handle.kind !== "file") continue;
    if (/\.cue$/i.test(handle.name)) { cues.push(await handle.getFile()); continue; }
    if (!/\.(bin|img|iso)$/i.test(handle.name)) continue;
    const file = await handle.getFile();
    if (file.size === release.target.size || file.size === release.source.size) images.push(file);
  }
  const exact = images.filter(file => file.name === release.target.filename);
  const candidates = exact.length ? exact : images;
  if (!candidates.length) return null; // A stock set, or a folder without a patched BIN: the page says which.
  if (candidates.length !== 1) throw new Error("사용할 BIN이 여러 개입니다. 선택한 버전의 BIN/CUE만 있는 폴더를 골라 주세요.");
  const file = candidates[0];
  for (const cue of cues) {
    if (cue.size > 65536) continue;
    const text = await cue.text();
    const refs = [...text.matchAll(/^\s*FILE\s+"([^"]+)"\s+BINARY\s*$/gim)];
    if (refs.length !== 1 || refs[0][1].toLowerCase() !== file.name.toLowerCase()) continue;
    const tracks = text.split(/\r?\n/).map(line => line.trim()).filter(line => /^(TRACK|INDEX)\s/i.test(line));
    if (!tracks.length || tracks[0] !== "TRACK 01 MODE1/2352" || tracks[1] !== "INDEX 01 00:00:00"
      || tracks.some(line => !/^(?:TRACK \d{2} (?:MODE1\/2352|MODE2\/2352|AUDIO)|INDEX (?:00|01) \d{2}:\d{2}:\d{2})$/.test(line))) {
      throw new Error("선택한 BIN의 CUE 트랙 구성을 확인할 수 없습니다.");
    }
    onCueTracks?.(tracks);
  }
  signal?.throwIfAborted();
  const header = new TextDecoder("ascii").decode(await file.slice(16, 112).arrayBuffer());
  const product = release.gameId === "srwf-f" ? "T-20610G" : release.gameId === "srwf-final" ? "T-20612G" : null;
  if (!product || !header.startsWith("SEGA SEGASATURN") || !header.includes(product)) {
    throw new Error("선택한 게임의 새턴 BIN이 아닙니다. 게임 선택과 파일을 확인해 주세요.");
  }
  return file;
}
