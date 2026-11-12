import { createEffectList, fitEffectPanel } from './editor-effect-list.mjs?v=20261113-froster1';
import { TERRAIN_FIELDS, TERRAIN_LABELS, terrainValueAllowed } from "./editor-terrain.mjs?v=20261113-froster1";
import { paintTilePreview } from './editor-map-graphics.mjs?v=20261113-froster1';

export function createTerrainEditor(host) {
  const panel = document.getElementById("terrainEditorPanel");
  const list = document.getElementById("terrainRecordList");
  const search = document.getElementById("terrainSearch");
  const form = document.getElementById("terrainFields");
  const reset = document.getElementById("terrainReset");
  const status = document.getElementById("terrainStatus");
  const examples = document.getElementById('terrainTileExamples');
  let selected = null;
  const picker = createEffectList({ list, label: item => `#${item.recordIndex} · ${host.name(item)}`, onSelect: id => { if (!host.canEdit()) return; selected = id; render(); } });
  const controls = new Map();
  const drafts = new Map();
  const row = () => host.rows().find(item => item.recordIndex === selected);
  function measure() {
    fitEffectPanel(panel);
    if (panel.hidden || !panel.getClientRects?.().length) return;
    panel.dataset.compact = "false";
    const footer = document.querySelector(".editor-footer");
    if (window.innerWidth<1100&&panel.getBoundingClientRect().bottom + (footer?.getBoundingClientRect().height ?? 80) + 12 > window.innerHeight) panel.dataset.compact = "true";
  }
  function sync() {
    const current = row(), writable = host.canEdit() && Boolean(current?.editable);
    picker.sync(selected, !host.canEdit());
    search.disabled = !host.canEdit() || !host.rows().length;
    for (const [field, input] of controls) {
      input.disabled = !writable;
      input.classList.toggle("is-modified", current[field] !== current.original[field]);
    }
    reset.disabled = !writable || !TERRAIN_FIELDS.some(field => current[field] !== current.original[field] || controls.get(field)?.value !== String(current[field]));
  }
  function accept({ report = false } = {}) {
    const current = row();
    if (!current?.editable || !host.canEdit()) return true;
    let invalid = null;
    const wanted = {};
    for (const [field, input] of controls) {
      input.setCustomValidity(""); input.removeAttribute("aria-invalid");
      wanted[field] = input.value === "" ? NaN : Number(input.value);
      if (!terrainValueAllowed(wanted[field], field) || !input.validity.valid) invalid ??= input;
    }
    if (invalid) {
      drafts.set(current.recordIndex, Object.fromEntries([...controls].map(([field, input]) => [field, input.value])));
      const message = "명중·방어 보정은 -100~100, HP·EN 회복은 0~100의 정수를 입력해주세요.";
      invalid.setCustomValidity(message); invalid.setAttribute("aria-invalid", "true"); status.textContent = message;
      sync();
      if (report) { host.open(); measure(); invalid.reportValidity(); }
      return false;
    }
    drafts.delete(current.recordIndex);
    const changed = TERRAIN_FIELDS.some(field => current[field] !== wanted[field]);
    Object.assign(current, wanted);
    status.textContent = ""; sync(); measure();
    if (changed) host.onChange(current);
    return true;
  }
  function render() {
    form.replaceChildren(); controls.clear(); status.textContent = "";
    const current = row();
    examples.replaceChildren(); examples.hidden = true;
    if (!current) { sync(); return; }
    for (const example of host.examples?.(current.recordIndex) ?? []) {
      const button = document.createElement('button'), canvas = document.createElement('canvas'), text = document.createElement('span');
      if (!paintTilePreview(canvas, example.pixels)) continue;
      button.type = 'button'; button.title = `맵 #${example.mapIndex} · 상태 ${example.plane + 1} · (${example.x}, ${example.y})에서 보기`;
      button.setAttribute('aria-label', `타일 #${example.tileId}, ${button.title}`); text.textContent = `#${example.tileId}`;
      canvas.setAttribute('aria-hidden', 'true'); button.append(canvas, text);
      button.addEventListener('click', () => host.openMap?.(example)); examples.append(button);
    }
    examples.hidden = !examples.children.length;
    for (const field of TERRAIN_FIELDS) {
      const label = document.createElement("label"); label.textContent = TERRAIN_LABELS[field];
      const wrap = document.createElement("span"); wrap.className = "terrain-value";
      const input = document.createElement("input");
      input.type = "number"; input.inputMode = "numeric"; input.min = ["avoidanceBonus", "defenseBonus"].includes(field) ? "-100" : "0"; input.max = "100"; input.step = "1";
      input.value = drafts.get(current.recordIndex)?.[field] ?? String(current[field]); input.dataset.terrainField = field;
      if (input.value === "" || !terrainValueAllowed(Number(input.value), field)) {
        input.setCustomValidity("이 지형의 적용되지 않은 입력을 수정하거나 복원하세요."); input.setAttribute("aria-invalid", "true");
        status.textContent = "적용되지 않은 입력이 있습니다.";
      }
      input.setAttribute("aria-label", `${TERRAIN_LABELS[field]} (%)`);
      const suffix = document.createElement("span"); suffix.textContent = "%"; suffix.setAttribute("aria-hidden", "true");
      controls.set(field, input); wrap.append(input, suffix); label.append(wrap); form.append(label);
    }
    sync(); measure();
  }
  function refresh() {
    const query = search.value.trim().toLocaleLowerCase();
    const rows = host.rows().filter(item => !query || `${item.recordIndex} ${host.name(item)}`.toLocaleLowerCase().includes(query));
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.recordIndex === 4)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    picker.render(rows, selected); render();
  }
  search.addEventListener('input', refresh);
  form.addEventListener("input", () => accept()); form.addEventListener("change", () => accept());
  reset.addEventListener("click", () => {
    const current = row(); if (!current?.editable || !host.canEdit()) return;
    const hadDraft = drafts.delete(current.recordIndex);
    const changed = TERRAIN_FIELDS.some(field => current[field] !== current.original[field]);
    for (const field of TERRAIN_FIELDS) current[field] = current.original[field];
    render(); if (changed || hadDraft) host.onChange(current);
  });
  window.addEventListener("resize", measure); document.fonts?.ready.then(measure);
  return Object.freeze({ refresh, sync, selectedRow: row, reset: () => { drafts.clear(); selected = null; search.value = ""; refresh(); }, validate: ({report=true}={}) => {
      const id = drafts.keys().next().value;
      if (id !== undefined && id !== selected) { if (!report) return false; selected = id; search.value = ""; refresh(); }
      return accept({ report });
    },
    hasInvalidDraft: () => drafts.size > 0,
    focus: (id, fields = []) => { if (!host.rows().some(item => item.recordIndex === id)) return false; selected = id; search.value = ""; refresh(); if (controls.get(fields[0])) controls.get(fields[0]).focus(); else picker.focus(id); return true; },
  });
}
