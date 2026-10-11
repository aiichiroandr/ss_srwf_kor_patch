export async function directoryForGame(directory, handles, imageGames, gameId) {
  const selected = new Set([...imageGames].filter(([, game]) => game === gameId).map(([name]) => name.toLowerCase()));
  const allowed = new Set(selected);
  for (const handle of handles) {
    if (!/\.cue$/i.test(handle.name)) continue;
    const file = await handle.getFile();
    if (file.size > 65536) continue;
    const refs = [...(await file.text()).matchAll(/^\s*FILE\s+"([^"]+)"\s+BINARY\s*$/gim)].map(match => match[1].toLowerCase());
    if (!refs.some(name => selected.has(name))) continue;
    if (refs.some(name => imageGames.has(name) && imageGames.get(name) !== gameId)) {
      throw new Error("CUE가 서로 다른 게임의 BIN을 함께 참조합니다.");
    }
    allowed.add(handle.name.toLowerCase());
    for (const name of refs) allowed.add(name);
  }
  const files = handles.filter(handle => allowed.has(handle.name.toLowerCase()) || !/\.(bin|img|iso|chd|cue)$/i.test(handle.name));
  return {
    kind: "directory", name: directory.name,
    async *values() { yield* files; },
    async *entries() { for (const handle of files) yield [handle.name, handle]; },
    async getFileHandle(name) {
      const handle = files.find(file => file.name === name);
      if (!handle) throw new DOMException("File not in selected game", "NotFoundError");
      return handle;
    },
  };
}
