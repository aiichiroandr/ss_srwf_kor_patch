import { TERRAIN_FIELDS, TERRAIN_LABELS, terrainValueAllowed } from "./editor-terrain.mjs?v=20261011-public1";
import { paintTilePreview } from './editor-map-graphics.mjs?v=20261011-public1';

export function createTerrainEditor(host) {
  const panel = document.getElementById("terrainEditorPanel");
  const selector = document.getElementById("terrainSelector");
  const form = document.getElementById("terrainFields");
  const reset = document.getElementById("terrainReset");
  const status = document.getElementById("terrainStatus");
  const examples = document.getElementById('terrainTileExamples');
  let selected = null;
  const controls = new Map();
  const row = () => host.rows().find(item => item.recordIndex === selected);
  function measure() {
    if (panel.hidden || !panel.getClientRects?.().length) return;
    panel.dataset.compact = "false";
    const footer = document.querySelector(".editor-footer");
    if (panel.getBoundingClientRect().bottom + (footer?.getBoundingClientRect().height ?? 80) + 12 > window.innerHeight) panel.dataset.compact = "true";
  }
  function sync() {
    const current = row(), writable = host.canEdit() && Boolean(current?.editable);
    selector.disabled = !host.canEdit() || !host.rows().length;
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
      if (!terrainValueAllowed(wanted[field]) || !input.validity.valid) invalid ??= input;
    }
    if (invalid) {
      const message = "0~100 범위의 정수를 입력해주세요.";
      invalid.setCustomValidity(message); invalid.setAttribute("aria-invalid", "true"); status.textContent = message;
      sync();
      if (report) { host.open(); measure(); invalid.reportValidity(); }
      return false;
    }
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
      input.type = "number"; input.inputMode = "numeric"; input.min = "0"; input.max = "100"; input.step = "1";
      input.value = String(current[field]); input.dataset.terrainField = field;
      input.setAttribute("aria-label", `${TERRAIN_LABELS[field]} (%)`);
      const suffix = document.createElement("span"); suffix.textContent = "%"; suffix.setAttribute("aria-hidden", "true");
      controls.set(field, input); wrap.append(input, suffix); label.append(wrap); form.append(label);
    }
    sync(); measure();
  }
  function refresh() {
    const rows = host.rows();
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.recordIndex === 4)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    selector.replaceChildren(...rows.map(item => {
      const option = document.createElement("option"); option.textContent = `#${item.recordIndex} · ${host.name(item)}`; option.value = String(item.recordIndex); return option;
    }));
    selector.value = selected === null ? "" : String(selected); render();
  }
  selector.addEventListener("change", () => { selected = Number(selector.value); render(); });
  form.addEventListener("input", () => accept()); form.addEventListener("change", () => accept());
  reset.addEventListener("click", () => {
    const current = row(); if (!current?.editable || !host.canEdit()) return;
    const changed = TERRAIN_FIELDS.some(field => current[field] !== current.original[field]);
    for (const field of TERRAIN_FIELDS) current[field] = current.original[field];
    render(); if (changed) host.onChange(current);
  });
  window.addEventListener("resize", measure); document.fonts?.ready.then(measure);
  return Object.freeze({ refresh, sync, selectedRow: row, reset: () => { selected = null; refresh(); }, validate: () => accept({ report: true }),
    focus: (id, fields = []) => { if (!host.rows().some(item => item.recordIndex === id)) return false; selected = id; selector.value = String(id); render(); (controls.get(fields[0]) ?? selector).focus(); return true; },
  });
}
