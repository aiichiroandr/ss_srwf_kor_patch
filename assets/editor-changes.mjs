import { objectiveContextFor } from './editor-scenario-region-context.mjs?v=20261011-public4';
import { objectiveRuleLabel, decodeObjectiveRule } from './editor-scenario-criteria.mjs?v=20261011-public4';
// The change list of the editor and its preset file: the button at the bottom of the editor (the change count) opens a
// dialog that lists every changed record grouped by unit, pilot and weapon; an entry jumps to that record and field. The
// footer saves the changes as a preset file (.json) and loads one: a loaded file is checked, judged against the open
// session and summarised, and only applied to the pending rows when the user says so. The page module hands in what it
// owns (rows, labels, navigation, the refresh after applying) through `host`; every judgement comes from editor-preset.mjs.
import {
  TERRAIN_DATA_ORDER,
  TERRAIN_LABELS,
  TERRAIN_SCREEN_ORDER,
  gradeLabel,
  splitWeaponTerrain,
  weaponGradeLabel,
} from "./editor-grades.mjs?v=20261011-public4";
import { skillDiff } from "./editor-skill-list.mjs?v=20261011-public4";
import {
  PresetError,
  applyPreset,
  buildPreset,
  diffEditorRows,
  isPresetSizeAllowed,
  parsePreset,
  planPresetApplication,
  presetChangeCount,
  presetFileName,
  serializePreset,
} from "./editor-preset.mjs?v=20261011-public4";

export const CHANGE_KINDS = Object.freeze(["unit", "pilot", "weapon", "reward", "terrain", "deployment", "event", "objective", "reinforcement", "map"]);
const KIND_HEADINGS = Object.freeze({ unit: "기체", pilot: "파일럿", weapon: "무기", reward: "격추 보상", terrain: "지형 효과", deployment: "기체 배치", event: "이벤트 조건", objective: "작전 목적", reinforcement: "새 증원", map: "맵 타일" });
const GAME_LABELS = Object.freeze({ "srwf-f": "슈퍼로봇대전 F", "srwf-final": "F 완결편" });

// Why a file was refused, in one short sentence each. Every code of editor-preset.mjs has one (a test checks it).
export const PRESET_ERROR_COPY = Object.freeze({
  PRESET_TOO_LARGE: "파일이 너무 큽니다. 편집값 파일은 8MB까지 읽습니다.",
  PRESET_READ_FAILED: "파일을 읽지 못했습니다.",
  PRESET_NOT_JSON: "JSON 파일이 아니거나 내용이 깨져 있습니다.",
  PRESET_WRONG_FORMAT: "에디터 변경 내용 파일이 아닙니다.",
  PRESET_NEWER_VERSION: "더 새 에디터에서 만든 파일이라 읽을 수 없습니다.",
  PRESET_WRONG_VERSION: "지원하지 않는 형식의 파일입니다.",
  PRESET_UNKNOWN_GAME: "어느 게임의 변경 내용인지 알 수 없습니다.",
  PRESET_OTHER_GAME: "다른 게임의 변경 내용이라 넣을 수 없습니다.",
  PRESET_UNKNOWN_KEY: "파일에 모르는 항목이 들어 있습니다.",
  PRESET_MISSING_KEY: "파일에 꼭 있어야 할 항목이 빠져 있습니다.",
  PRESET_BAD_RECORD: "레코드 번호가 올바르지 않습니다.",
  PRESET_DUPLICATE_RECORD: "같은 레코드가 두 번 들어 있습니다.",
  PRESET_BAD_VALUE: "범위를 벗어났거나 형식이 틀린 값이 있습니다.",
  PRESET_TOO_MANY: "항목이 너무 많습니다.",
  PRESET_EMPTY_ENTRY: "바뀐 값이 없는 레코드 항목이 있습니다.",
});

// Why one loaded change is skipped in this session.
export const SKIP_REASON_COPY = Object.freeze({
  "identity-missing": "같은 구조의 레코드를 찾지 못함",
  "identity-ambiguous": "같은 구조의 레코드가 여러 개 있음",
  missing: "지금 열린 데이터에 없는 레코드",
  alias: "여러 ID가 함께 쓰는 레코드",
  "read-only": "수정할 수 없는 레코드",
  "reward-total": "보상 확률 합계가 100%를 넘음",
  "scenario-domain": "맵 좌표·보상·작전 목적 조건이 적용 범위를 벗어남",
  "map-capacity": "기존 변경과 합쳐 타일 20,000칸을 넘음",
  locked: "게임 구조와 묶인 능력",
  grade: "지형 값이 범위를 벗어남",
  "weapon-domain": "무기의 사용 조건 범위를 벗어남",
  "spirits-locked": "정신커맨드를 바꿀 수 없는 파일럿",
  "spirit-value": "정신커맨드 번호·레벨·최소 개수 불일치",
  "spirit-capacity": "정신커맨드와 특수능력을 담을 자리 부족",
  "spirit-flag": "이벤트 조건 정신커맨드는 고정",
  "skills-locked": "특수능력 목록을 바꿀 수 없는 파일럿",
  "skill-unknown": "이 게임에 없는 특수능력",
  "skill-level": "습득 레벨이 1~99가 아님",
  "skill-capacity": "특수능력 자리가 모자람",
  "skill-consumers": "서로 다른 특수능력이 4가지를 넘음",
  "skill-flag": "조건부 특수능력이 빠지게 됨",
});

const ABILITY_ID_FIELD = /^ability([1-4])$/;

// A stored value as the screen shows it: a terrain grade as its letter, the weapon terrain byte as four letters in screen
// order, a unit ability by its name, every other value as its number.
export function formatFieldValue(kind, field, value, { abilityName = (id) => `#${id}`, objectiveContext=null,gameId=null,rows=null,rowName=null,recordIndex=null,physicalIndex=null } = {}) {
  if(kind==='event'){
    if(field==='eventPhase')return value?'아군 시작':'적군 시작';
    if(/^eventRule[1-3]$/.test(field))return objectiveRuleLabel(value);
    if(field==='eventJoin')return value?'하나라도':'모두';
  }
  if(kind==='objective'){
    if(/^(victory|defeat)Rule[1-3]$/.test(field)){
      const units=typeof rows==='function'?rows('unit'):[];
      const globalContext=(typeof objectiveContext==='function'?objectiveContext():objectiveContext)
        ??{gameId:typeof gameId==='function'?gameId():gameId,unitCount:units.reduce((maximum,row)=>Math.max(maximum,row.recordIndex+1),0)};
      const objective=typeof rows==='function'?rows('objective').find(row=>row.recordIndex===recordIndex):null;
      const context=objectiveContextFor(globalContext,objective??physicalIndex??recordIndex);
      const rule=decodeObjectiveRule(value,context);
      const record=rule?.query==='unitKind'?units.find(row=>row.recordIndex===rule.value)
        :rule?.query==='pilotLookup'&&typeof rows==='function'?rows('pilot').find(row=>row.recordIndex===rule.value):null;
      if(record)return `${typeof rowName==='function'?rowName(record):record.name||`${rule.value}번 ${rule.query==='pilotLookup'?'파일럿':'기체'}`} ${rule.comparison==='present'?'있음':'없음'}`;
      return objectiveRuleLabel(value,context);
    }
    if(field==='objectivePriority')return value?'패배':'승리';
    if(['victoryJoin','defeatJoin'].includes(field))return value?'하나라도':'모두';
  }
  if(kind==='reinforcement'&&field==='enabled')return value?'추가됨':'없음';
  if (kind !== "weapon" && TERRAIN_DATA_ORDER.includes(field)) return gradeLabel(value);
  if (kind === "weapon" && field === "terrain") {
    const parts = splitWeaponTerrain(value);
    return TERRAIN_SCREEN_ORDER.map((key) => `${TERRAIN_LABELS[key]}${weaponGradeLabel(parts[key])}`).join(" ");
  }
  if (kind === "unit" && ABILITY_ID_FIELD.test(field)) return abilityName(value);
  if (typeof value === "boolean") return value ? "있음" : "없음";
  return String(value);
}

export function fieldTitle(kind, field, { fieldLabel = (_, name) => name } = {}) {
  if (kind !== "weapon" && TERRAIN_DATA_ORDER.includes(field)) return `지형 ${TERRAIN_LABELS[field]}`;
  if (kind === "weapon" && field === "terrain") return "지형";
  const slot = kind === "unit" ? ABILITY_ID_FIELD.exec(field) : null;
  return slot ? `특수능력 ${slot[1]}` : fieldLabel(kind, field);
}

// One change in a few words: "HP 3000 → 3500", "지형 육 B → A", "지형 공 - → A, 해 B → C", "특수능력 1 없음 → (name)".
export function describeFieldChange(kind, { field, from, to }, labels = {}) {
  if (kind === "weapon" && field === "terrain") {
    const before = splitWeaponTerrain(from);
    const after = splitWeaponTerrain(to);
    const parts = TERRAIN_SCREEN_ORDER.filter((key) => before[key] !== after[key])
      .map((key) => `${TERRAIN_LABELS[key]} ${weaponGradeLabel(before[key])} → ${weaponGradeLabel(after[key])}`);
    return `지형 ${parts.join(", ")}`;
  }
  return `${fieldTitle(kind, field, labels)} ${formatFieldValue(kind, field, from, labels)} → ${formatFieldValue(kind, field, to, labels)}`;
}

export function describeSkillChange({ from, to }) {
  if (from.length !== to.length) return `특수능력 ${from.length}개 → ${to.length}개`;
  const diff = skillDiff(to, from);
  const count = diff.added.length + diff.removed.length + diff.changed.length;
  return count > 0 ? `특수능력 ${count}곳 바뀜` : "특수능력 순서 바뀜";
}

function node(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = text;
  return element;
}

const byId = (id) => document.getElementById(id);

// `host` (from the page): hasSession(), gameId(), releaseId(), releaseLabel(id), rows(kind), aliases(), fields(kind),
// fieldLabel(kind, field), rowName(row), abilityName(id), changeCount(), jumpTo(kind, recordIndex, fields), afterApply(),
// announce(text), canEdit().
export function createEditorChanges(host) {
  const ui = {
    button: byId("editorChangesButton"),
    dialog: byId("editorChangesDialog"),
    title: byId("editorChangesTitle"),
    close: byId("editorChangesClose"),
    save: byId("editorPresetSaveButton"),
    load: byId("editorPresetLoadButton"),
    file: byId("editorPresetFile"),
    message: byId("editorChangesMessage"),
    list: byId("editorChangesList"),
    summary: byId("editorPresetSummary"),
    summaryText: byId("editorPresetSummaryText"),
    counts: byId("editorPresetCounts"),
    details: byId("editorPresetDetails"),
    applyAll: byId("editorPresetApplyAll"),
    applyMatching: byId("editorPresetApplyMatching"),
    cancel: byId("editorPresetCancel"),
  };
  // A loaded and checked file that waits for the user's choice: { preset, plan, fileName }.
  let pending = null;
  // Set while the dialog closes because an entry was chosen: the focus goes to that field, not back to the button.
  let navigating = false;
  let returnFocus = ui.button;

  const session = () => ({
    gameId: host.gameId(),
    scenarioObjectiveContext: host.objectiveContext?.() ?? null,
    units: host.rows("unit"),
    pilots: host.rows("pilot"),
    weapons: host.rows("weapon"),
    rewards: host.rows("reward"),
    terrains: host.rows("terrain"),
    deployments: host.rows("deployment"),
    events: host.rows("event"),
    objectives: host.rows("objective"),
    reinforcements: host.rows("reinforcement"),
    mapCells: host.rows("map"),
    pilotAliases: host.aliases(),
  });

  const changes = () => Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, diffEditorRows(kind, (host.rows(kind) ?? []), { fields: host.fields(kind) })]));
  // the session's own name of a record (the file's name is only a hint and is used when the session has no such record)
  const namer = () => {
    const maps = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, new Map((host.rows(kind) ?? []).map((row) => [row.recordIndex, row]))]));
    return (kind, recordIndex, fallback) => {
      const row = maps[kind].get(recordIndex);
      return row ? host.rowName(row) : fallback;
    };
  };

  function say(text, tone = "info") {
    ui.message.textContent = text;
    ui.message.dataset.tone = tone;
    ui.message.hidden = text === "";
  }

  function describe(kind, change) {
    const parts = change.fields.map((entry) => describeFieldChange(kind, entry, {...host,recordIndex:change.recordIndex}));
    if (change.skills) parts.push(describeSkillChange(change.skills));
    if (change.spirits) parts.push(`정신커맨드 ${change.spirits.from.length}개 → ${change.spirits.to.length}개`);
    return parts.join(" · ");
  }

  function renderList() {
    const byKind = changes();
    const records = CHANGE_KINDS.reduce((sum, kind) => sum + byKind[kind].length, 0);
    const count = typeof host.changeCount === "function" ? host.changeCount() : records;
    ui.title.textContent = count > 0 ? `바뀐 값 ${count}개` : "바뀐 값";
    syncButtons(records > 0);
    ui.summary.hidden = true;
    ui.list.hidden = false;
    if (records === 0) {
      ui.list.replaceChildren(node("p", "editor-changes-empty", "바뀐 값이 없습니다"));
      return;
    }
    const nameOf = namer();
    const groups = CHANGE_KINDS.filter((kind) => byKind[kind].length > 0).map((kind) => {
      const group = node("section", "editor-changes-group");
      group.dataset.changeGroup = kind;
      const heading = node("h3", "editor-changes-heading", `${KIND_HEADINGS[kind]} ${byKind[kind].length}`);
      const list = node("ul", "editor-changes-items");
      for (const change of byKind[kind]) {
        const item = node("li");
        const button = node("button", "editor-changes-item");
        button.type = "button";
        button.dataset.changeKind = kind;
        button.dataset.recordIndex = String(change.recordIndex);
        button.dataset.changeFields = [...change.fields.map(({ field }) => field), ...(change.skills ? ["skills"] : []), ...(change.spirits ? ["spirits"] : [])].join(",");
        const name = node("span", "editor-changes-name", `${nameOf(kind, change.recordIndex, change.name)}${typeof change.recordIndex==='number'?` #${change.recordIndex}`:''}`);
        const description=describe(kind,change),detail = node("span", "editor-changes-detail", kind==='event'?null:description);
        if(kind==='event')for(const entry of change.fields){
          const value=node('span','editor-event-change-value',describeFieldChange(kind,entry,host));
          value.dataset.changeField=entry.field;detail.append(value);
        }
        button.append(name, detail);
        button.setAttribute("aria-label", `${name.textContent}: ${description}. 누르면 이 값으로 이동합니다.`);
        item.append(button);
        list.append(item);
      }
      group.append(heading, list);
      return group;
    });
    ui.list.replaceChildren(...groups);
  }

  function renderSummary() {
    const { plan, preset, fileName } = pending;
    const { apply, conflict, same, skip } = plan.counts;
    const knownBase = preset.releaseId ? host.releaseLabel(preset.releaseId) : null;
    const base = knownBase ? ` · 저장한 판 ${knownBase}` : "";
    ui.title.textContent = "편집값 불러오기";
    ui.summaryText.textContent = `${fileName || "선택한 파일"} · 값 ${preset.changeCount}개${base}`;
    const lines = [
      ["apply", `바로 적용 ${apply}개`, "지금 값이 파일의 원래 값과 같습니다"],
      ["conflict", `원래 값이 다름 ${conflict}개`, "이 판에서 값이 달라진 곳입니다"],
      ["same", `이미 같은 값 ${same}개`, "할 일이 없습니다"],
      ["skip", `건너뜀 ${skip}개`, Object.entries(plan.skipReasons).map(([reason, n]) => `${SKIP_REASON_COPY[reason] ?? reason} ${n}`).join(", ")],
    ].filter(([status]) => plan.counts[status] > 0 || status === "apply");
    ui.counts.replaceChildren(...lines.map(([status, label, note]) => {
      const item = node("li", `editor-preset-count is-${status}`);
      item.dataset.presetStatus = status;
      item.append(node("strong", "", label));
      if (note) item.append(node("span", "", note));
      return item;
    }));
    // the conflicts are the values a newer patch changed: list them, with the value here and the change in the file
    const conflicts = plan.items.filter((item) => item.status === "conflict");
    ui.details.hidden = conflicts.length === 0;
    if (conflicts.length > 0) {
      const summary = node("summary", "", `원래 값이 다른 곳 ${conflicts.length}개 보기`);
      const list = node("ul", "editor-preset-conflicts");
      const nameOf = namer();
      for (const item of conflicts) {
        const name = `${KIND_HEADINGS[item.kind]} ${nameOf(item.kind, item.recordIndex, item.name)} #${item.recordIndex}`;
        const value = (number) => formatFieldValue(item.kind, item.field, number, {...host,recordIndex:item.recordIndex});
        const text = ["skills", "spirits"].includes(item.field)
          ? `${item.field === "spirits" ? "정신커맨드" : "특수능력"}: 여기 ${item.current.length}개 · 파일 ${item.from.length}개 → ${item.to.length}개`
          : `${fieldTitle(item.kind, item.field, host)}: 여기 ${value(item.current)} · 파일 ${value(item.from)} → ${value(item.to)}`;
        const entry = node("li", "", `${name} · ${text}`);
        entry.dataset.changeKind = item.kind;
        entry.dataset.recordIndex = String(item.recordIndex);
        list.append(entry);
      }
      ui.details.replaceChildren(summary, list);
    } else {
      ui.details.replaceChildren();
    }
    ui.applyAll.disabled = apply + conflict === 0;
    ui.applyMatching.disabled = apply === 0;
    ui.list.hidden = true;
    ui.summary.hidden = false;
  }

  function render() {
    if (pending) renderSummary();
    else renderList();
  }

  function open() {
    if (!host.hasSession()) return;
    returnFocus = ui.button;
    say("");
    render();
    if (!ui.dialog.open) ui.dialog.showModal?.();
  }

  // Closing drops a loaded file that was not applied. The close event (✕, Esc, a click outside, or close() here) gives the
  // focus back to the button, unless an entry was chosen: then it stays on the field the entry led to.
  function close() {
    pending = null;
    if (ui.dialog.open) ui.dialog.close();
  }

  function handleClosed() {
    pending = null;
    if (!navigating) returnFocus.focus?.();
    navigating = false;
  }

  function choose(event) {
    const target = event.target.closest?.("button[data-change-kind]");
    if (!target) return;
    const kind = target.dataset.changeKind;
    const recordIndex = ["deployment", "event", "objective", "reinforcement", "map"].includes(kind) ? target.dataset.recordIndex : Number(target.dataset.recordIndex);
    const declared = (target.dataset.changeFields ?? "").split(",").filter(Boolean);
    const picked=event.target.closest?.('[data-change-field]');
    const field=picked&&target.contains(picked)?picked.dataset.changeField:null;
    const fields=declared.includes(field)?[field,...declared.filter(value=>value!==field)]:declared;
    // the close event comes after this (a task later in a browser): it sees the flag and leaves the focus on the field
    navigating = true;
    close();
    host.jumpTo(kind, recordIndex, fields);
  }

  function errorText(error) {
    if (error instanceof PresetError && error.code === "PRESET_OTHER_GAME") {
      const theirs = GAME_LABELS[error.details?.presetGame] ?? "다른 게임";
      const ours = GAME_LABELS[error.details?.sessionGame] ?? "지금 게임";
      return `${theirs}의 변경 내용이라 지금 연 ${ours}에는 넣을 수 없습니다.`;
    }
    return PRESET_ERROR_COPY[error?.code] ?? "변경 내용 파일을 불러오지 못했습니다.";
  }

  async function loadFile(file) {
    if (!file || !host.hasSession() || !host.canEdit()) return false;
    if (!ui.dialog.open) returnFocus = ui.load;
    pending = null;
    try {
      if (!isPresetSizeAllowed(file.size)) throw new PresetError("PRESET_TOO_LARGE");
      let text;
      try {
        text = await file.text();
      } catch {
        throw new PresetError("PRESET_READ_FAILED");
      }
      const preset = parsePreset(text, { gameId: host.gameId() });
      host.preparePreset?.(preset);
      const plan = planPresetApplication(preset, session());
      pending = { preset, plan, fileName: typeof file.name === "string" ? file.name : "" };
      say("");
      renderSummary();
      if (!ui.dialog.open) ui.dialog.showModal?.();
      host.announce(`변경 내용 파일을 읽었습니다. 바로 적용 ${plan.counts.apply}개, 원래 값이 다름 ${plan.counts.conflict}개, 건너뜀 ${plan.counts.skip}개.`);
      return true;
    } catch (error) {
      renderList();
      say(errorText(error), "error");
      if (!ui.dialog.open) ui.dialog.showModal?.();
      host.announce(errorText(error));
      return false;
    }
  }

  function apply(mode) {
    if (!pending || !host.hasSession() || !host.canEdit()) return null;
    const { preset } = pending;
    let result;
    try {
      // judged again against the rows as they are now, then applied to the pending rows only
      result = applyPreset(preset, session(), mode);
    } catch (error) {
      pending = null;
      renderList();
      say(errorText(error), "error");
      return null;
    }
    pending = null;
    host.afterApply(result.records);
    renderList();
    const text = result.applied > 0 ? `${result.applied}개 값을 적용했습니다. 아직 BIN은 만들지 않았습니다.` : "적용한 값이 없습니다.";
    say(text);
    host.announce(text);
    return result;
  }

  function cancel() {
    pending = null;
    renderList();
    say("불러오기를 취소했습니다.");
  }

  async function writeWithPicker(picker, text, name) {
    const handle = await picker({
      suggestedName: name,
      types: [{ description: "에디터 변경 내용", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return typeof handle.name === "string" && handle.name ? handle.name : name;
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = node("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // the download has started by then; a timer of a non-browser host must not keep it alive
    setTimeout(() => URL.revokeObjectURL(url), 30_000)?.unref?.();
  }

  async function save() {
    if (!host.hasSession() || !host.canEdit()) return null;
    const preset = buildPreset(
      { gameId: host.gameId(), releaseId: host.releaseId(), createdAt: new Date() },
      Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, (host.rows(kind) ?? [])])),
    );
    if (presetChangeCount(preset) === 0) {
      say("저장할 바뀐 값이 없습니다.");
      return null;
    }
    const text = serializePreset(preset);
    if (!isPresetSizeAllowed(new Blob([text]).size)) {
      say(PRESET_ERROR_COPY.PRESET_TOO_LARGE, "error");
      host.announce(PRESET_ERROR_COPY.PRESET_TOO_LARGE);
      return null;
    }
    const name = presetFileName(preset.gameId);
    const picker = globalThis.showSaveFilePicker;
    if (typeof picker === "function") {
      try {
        const saved = await writeWithPicker(picker.bind(globalThis), text, name);
        say(`변경 내용을 저장했습니다 · ${saved}`);
        host.announce(`편집값을 저장했습니다 · ${saved}`);
        return preset;
      } catch (error) {
        if (error?.name === "AbortError") {
          say("저장을 취소했습니다.");
          return null;
        }
        // a picker that cannot write here (a policy, a sandbox) leaves the ordinary download
      }
    }
    try {
      download(text, name);
      say(`변경 내용 파일을 내려받았습니다 · ${name}`);
      host.announce(`편집값 파일을 내려받았습니다 · ${name}`);
      return preset;
    } catch {
      say("이 브라우저에서는 파일을 저장하지 못했습니다.", "error");
      if (!ui.dialog.open) {
        returnFocus = ui.save;
        render();
        ui.dialog.showModal?.();
      }
      return null;
    }
  }

  function syncButtons(hasChanges = CHANGE_KINDS.some((kind) => diffEditorRows(kind, (host.rows(kind) ?? []), { fields: host.fields(kind) }).length > 0)) {
    ui.button.dataset.changeCount = String(host.changeCount?.() ?? 0);
    const editable = host.hasSession() && host.canEdit();
    ui.save.disabled = !editable || !hasChanges;
    ui.load.disabled = !editable;
    ui.applyAll.disabled = !editable || !pending || pending.plan.counts.apply + pending.plan.counts.conflict === 0;
    ui.applyMatching.disabled = !editable || !pending || pending.plan.counts.apply === 0;
  }

  // Footer actions follow the session and its busy state even when the dialog is closed.
  function refresh() {
    syncButtons();
    if (ui.dialog.open && !pending) renderList();
  }

  function reset() {
    navigating = false;
    pending = null;
    say("");
    close();
    syncButtons();
  }

  ui.button.addEventListener("click", open);
  ui.close.addEventListener("click", close);
  ui.dialog.addEventListener("close", handleClosed);
  ui.dialog.addEventListener("click", (event) => {
    if (event.target === ui.dialog) close(); // the backdrop: a click outside the dialog's box
    else choose(event);
  });
  ui.save.addEventListener("click", () => { void save(); });
  ui.load.addEventListener("click", () => {
    if (!host.hasSession() || !host.canEdit()) return;
    returnFocus = ui.load;
    ui.file.click?.();
  });
  ui.file.addEventListener("change", () => {
    const file = ui.file.files?.[0] ?? null;
    void loadFile(file).finally(() => { ui.file.value = ""; });
  });
  ui.applyAll.addEventListener("click", () => apply("all"));
  ui.applyMatching.addEventListener("click", () => apply("matching"));
  ui.cancel.addEventListener("click", cancel);

  return Object.freeze({
    open, close, refresh, reset, save, loadFile, apply, cancel,
    isOpen: () => ui.dialog.open === true,
    pending: () => pending,
  });
}
