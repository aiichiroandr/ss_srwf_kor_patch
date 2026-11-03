// Save rescue for the ended WEB PORT trial. Reads the trial's browser-local
// save store and hands the player a file. Nothing is uploaded, imported or
// deleted; there is no game runtime on this page.
import { readSave, exportBackup } from "./saves.mjs?v=ram1";

const $ = (id) => document.getElementById(id);
const GAMES = [
  ["final", "F 완결편"],
  ["f", "F"],
  ["stock", "원본 디스크(패치 없이 실행)"],
];
const RAM_FORMATS = {
  bkr: { capacity: 32768, interleaved: false },
  srm: { capacity: 32768, interleaved: false },
  bin: { capacity: 32768, interleaved: true },
  bcr: { capacity: 524288, interleaved: false },
};

let busy = false;

function status(message) {
  $("rescue-status").textContent = message;
}

function setBusy(value) {
  busy = value;
  for (const id of ["rescue-game", "rescue-format", "rescue-json", "rescue-ram"]) $(id).disabled = value;
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function encodeInWorker(bytes, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./ram-save-worker.mjs?v=ram1", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish(Error("RAM 파일 변환 시간이 초과되었습니다.")), 15000);
    function finish(error, result) {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    }
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = () => finish(Error("RAM 파일로 변환하지 못했습니다."));
    worker.postMessage({ type: "export", bytes, options });
  });
}

async function currentRecord() {
  const game = $("rescue-game").value;
  const record = await readSave(game);
  if (!record?.bytes?.length) throw Error("이 브라우저에는 선택한 게임의 웹 포트 저장이 없습니다.");
  return { game, record };
}

async function survey() {
  const found = [];
  for (const [game, label] of GAMES) {
    try {
      const record = await readSave(game);
      if (record?.bytes?.length) found.push(`${label} · 마지막 저장 ${new Date(record.updatedAt).toLocaleString()}`);
    } catch (error) {
      status(`저장소를 읽지 못했습니다: ${error.message}`);
      return;
    }
  }
  status(found.length
    ? `이 브라우저에 남은 웹 포트 저장: ${found.join(" / ")}`
    : "이 브라우저에는 웹 포트 저장이 없습니다. 다른 기기나 브라우저에서 플레이했다면 그곳에서 이 페이지를 여세요.");
}

async function run(task) {
  if (busy) return;
  setBusy(true);
  try { await task(); } catch (error) { status(error.message); } finally { setBusy(false); }
}

async function retireIsolationWorker() {
  // The trial registered a header-only service worker for this folder.
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    for (const registration of registrations) {
      if (new URL(registration.scope).pathname.endsWith("/web-port/")) await registration.unregister();
    }
  } catch { /* the retirement worker removes it on a later visit */ }
}

$("rescue-json").addEventListener("click", () => run(async () => {
  const { game, record } = await currentRecord();
  const text = await exportBackup(game, record.bytes);
  download(`srwf-${game}-save-${Date.now()}.json`, new Blob([text], { type: "application/json" }));
  status("백업 JSON을 만들었습니다. 웹 포트가 다시 열리면 이 파일로 복원할 수 있습니다.");
}));

$("rescue-ram").addEventListener("click", () => run(async () => {
  const { game, record } = await currentRecord();
  const format = $("rescue-format").value;
  const options = RAM_FORMATS[format];
  if (!options) throw Error("지원하지 않는 RAM 형식입니다.");
  const bytes = await encodeInWorker(record.bytes, options);
  download(`srwf-${game}-${Date.now()}.${format}`, new Blob([bytes], { type: "application/octet-stream" }));
  status("RAM 파일을 만들었습니다. 에뮬레이터의 기존 RAM 파일은 덮어쓰기 전에 따로 보관하세요.");
}));

$("rescue-game").addEventListener("change", () => void survey());

void retireIsolationWorker();
void survey();
