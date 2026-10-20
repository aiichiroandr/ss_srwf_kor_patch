const games = new Set(["stock", "f", "final"]);
const MAX_BYTES = 65536;
const database = "srwf-recomp-saves-v1";

function gameKey(game) {
  if (!games.has(game)) throw Error("지원하지 않는 게임 저장입니다.");
  return game;
}

export function validateBackup(input) {
  if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer))
    throw Error("세이브 바이트 형식이 올바르지 않습니다.");
  const bytes = new Uint8Array(input);
  if (bytes.length > MAX_BYTES) throw Error("세이브 크기가 너무 큽니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = new Set();
  let blocks = 0;
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 32 > bytes.length) throw Error("세이브 헤더가 잘렸습니다.");
    const field = bytes.subarray(offset, offset + 12);
    const end = field.indexOf(0);
    const nameBytes = field.subarray(0, end < 0 ? 12 : end);
    if (!nameBytes.length || nameBytes.some(x => x < 32 || x > 126))
      throw Error("세이브 이름이 올바르지 않습니다.");
    const name = String.fromCharCode(...nameBytes);
    if (names.has(name)) throw Error("중복 세이브 이름입니다.");
    names.add(name);
    const size = view.getUint32(offset + 28, true);
    if (size > 32768 || offset + 32 + size > bytes.length)
      throw Error("세이브 데이터 길이가 올바르지 않습니다.");
    blocks += Math.ceil((size + 30) / 58);
    if (blocks > 510) throw Error("새턴 내부 저장 메모리 용량을 초과합니다.");
    offset += 32 + size;
  }
  return bytes;
}

async function digest(bytes) {
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, "0")).join("");
}

export async function exportBackup(game, input) {
  const bytes = validateBackup(input);
  return JSON.stringify({
    format: "srwf-web-backup", version: 1, game: gameKey(game),
    createdAt: new Date().toISOString(), sha256: await digest(bytes),
    payload: btoa(String.fromCharCode(...bytes)),
  }, null, 2);
}

export async function importBackup(text, game) {
  if (text.length > 100000) throw Error("백업 파일이 너무 큽니다.");
  let value;
  try { value = JSON.parse(text); } catch { throw Error("올바른 백업 JSON이 아닙니다."); }
  if (value.format !== "srwf-web-backup" || value.version !== 1)
    throw Error("지원하지 않는 백업 형식입니다.");
  if (value.game !== gameKey(game)) throw Error("선택한 게임과 백업의 게임이 다릅니다.");
  if (typeof value.payload !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.payload))
    throw Error("백업 데이터 인코딩이 올바르지 않습니다.");
  const bytes = validateBackup(Uint8Array.from(atob(value.payload), x => x.charCodeAt(0)));
  if (await digest(bytes) !== value.sha256) throw Error("백업 체크섬이 일치하지 않습니다.");
  return bytes;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("games");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error("다른 탭의 저장소 연결을 닫아 주세요."));
  });
}

export async function readSave(game) {
  gameKey(game);
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("games", "readonly");
      const request = tx.objectStore("games").get(game);
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onerror = tx.onabort = () => reject(tx.error ?? Error("저장소 읽기 실패"));
    });
  } finally { db.close(); }
}

// One atomic transaction preserves the previous complete backup before replacement.
export async function writeSave(game, input) {
  gameKey(game);
  const bytes = validateBackup(input);
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("games", "readwrite");
      const store = tx.objectStore("games");
      const request = store.get(game);
      request.onsuccess = () => {
        const old = request.result;
        store.put({bytes, previous: old?.bytes ?? null, updatedAt: new Date().toISOString()}, game);
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error ?? Error("저장 공간에 기록하지 못했습니다."));
    });
  } finally { db.close(); }
}

export function lockSave(game) {
  gameKey(game);
  if (!navigator.locks) return Promise.reject(Error("이 브라우저는 안전한 저장 잠금을 지원하지 않습니다."));
  return new Promise((resolve, reject) => {
    navigator.locks.request(`srwf-save-${game}`, {ifAvailable: true}, async lock => {
      if (!lock) { reject(Error("다른 탭에서 이 게임을 실행하거나 저장 중입니다.")); return; }
      await new Promise(release => resolve(release));
    }).catch(reject);
  });
}
