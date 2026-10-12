import { REWARD_FIELDS, REWARD_PART_MAX, rewardTotal, rewardValueAllowed, rewardOutcomeLabel, rewardReferences } from "./editor-rewards.mjs?v=20261012-frames3";
import { scenarioSelectionLabel } from "./editor-scenario-labels.mjs?v=20261012-frames3";

const node = (tag, text, className = "") => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

// Rows remain the host's pending values. Rebuilding controls is reserved for selection/preset changes;
// input updates summaries in place so a mobile keyboard and the current focus are preserved.
export function createRewardEditor(host) {
  const panel = document.getElementById("rewardEditorPanel");
  const selector = document.getElementById("rewardSelector");
  const form = document.getElementById("rewardFields");
  const summary = document.getElementById("rewardSummary");
  const scope = document.getElementById("rewardScope");
  const reset = document.getElementById("rewardReset");
  const pager = document.getElementById("rewardPager");
  const previous = document.getElementById("rewardPrev");
  const next = document.getElementById("rewardNext");
  const position = document.getElementById("rewardPageNumber");
  const search = document.getElementById("rewardSearch");
  const usageSelector = document.getElementById("rewardUsageSelector");
  const usageOpen = document.getElementById("rewardUsageOpen");
  let selected = null;
  let references = [];
  let page = 0;
  let paged = false;
  const controls = new Map();
  const row = () => host.rows().find(item => item.recordIndex === selected);
  const model = () => host.model?.() ?? {};
  const usageKey = reference => `${reference.kind}:${reference.recordIndex}`;
  const selectedUse = () => references.find(reference => usageKey(reference) === usageSelector?.value);
  const sceneLabel = reference => scenarioSelectionLabel(model().scenarios?.find(scene => scene.physicalIndex === reference.physicalIndex));
  const composition = item => rewardOutcomeLabel(item, host.partName);
  const optionLabel = item => rewardOutcomeLabel(item, host.partName, { compact: true });
  const shortSceneLabel = reference => {
    const scene = model().scenarios?.find(item => item.physicalIndex === reference.physicalIndex);
    // The chapter must have passed the same label validation used by the map
    // selector. A raw scenario selector number is never a gameplay episode.
    const label = scenarioSelectionLabel(scene);
    return /^(?:제|완결편 )\d+(?:·\d+)*화/u.test(label) ? label.split(" · ")[0].replace(/^(?:제|완결편 )/u, "") : "화수 미확인";
  };
  function showPage() {
    const groups = [...form.children];
    page = Math.max(0, Math.min(page, groups.length - 1));
    groups.forEach((group, i) => { group.hidden = paged && i !== page; });
    position.textContent = groups.length ? `${page + 1}/${groups.length}` : "0/0";
    previous.disabled = page === 0;
    next.disabled = page >= groups.length - 1;
    pager.hidden = !paged;
  }
  function measure() {
    if (panel.hidden || !panel.getClientRects?.().length) return;
    const focused = [...form.children].findIndex(group => group.contains(document.activeElement));
    for (const group of form.children) group.hidden = false;
    pager.hidden = true;
    panel.dataset.compact = "false";
    const footer = document.querySelector(".editor-footer");
    const fits = () => panel.getBoundingClientRect().bottom + (footer?.getBoundingClientRect().height ?? 80) + 12 <= window.innerHeight;
    if (!fits()) panel.dataset.compact = "true";
    paged = !fits() && form.children.length > 1;
    if (focused >= 0) page = focused;
    showPage();
  }

  function sync() {
    const current = row();
    const writable = host.canEdit() && Boolean(current?.editable);
    selector.disabled = !host.canEdit() || !Array.from(selector.options).some(option => option.value !== "");
    if (search) search.disabled = !host.canEdit() || !host.rows().length;
    if (usageSelector) usageSelector.disabled = !host.canEdit() || !references.length;
    if (usageOpen) usageOpen.disabled = !host.canEdit() || !selectedUse() || !host.openUse;
    for (const control of controls.values()) control.disabled = !writable;
    reset.disabled = !writable || !(REWARD_FIELDS.some(field => current[field] !== current.original[field])
      || [...controls].some(([field, control]) => control.value !== String(current.original[field]) || !control.validity.valid));
  }

  function describe() {
    const current = row();
    const total = current ? rewardTotal(current) : 0;
    summary.textContent = current?.capacity ? `파츠 획득 ${total}% · 미획득 ${100 - total}%` : current ? "획득할 강화파츠가 없습니다" : "검색과 일치하는 보상 없음";
    scope.textContent = current?.capacity
      ? references.length ? `확인된 등장 ${references.length}곳에 공통 적용` : "확인된 등장 연결 없음"
      : current ? "이 구성은 강화파츠를 지급하지 않습니다" : "기체명 또는 파츠명으로 다시 검색해주세요";
    scope.title = current?.capacity ? "이 보상 구성을 사용하는 모든 등장 기체의 파츠와 확률이 함께 바뀝니다. 목록에는 에디터에서 확인한 연결을 표시합니다." : "";
    const selectedOption = Array.from(selector.options).find(option => Number(option.value) === selected);
    if (current && selectedOption) { selectedOption.textContent = optionLabel(current); selectedOption.title = composition(current); }
    selector.title = current ? optionLabel(current) : "";
    for (const [field, control] of controls) control.classList.toggle("is-modified", current[field] !== current.original[field]);
    for (const group of form.children) {
      const select = group.querySelector("select"), input = group.querySelector("input");
      if (select) select.title = host.partName(Number(select.value));
      if (input) group.dataset.inactive = String(input.value === "0");
    }
    sync();
  }

  function renderUses() {
    const previousUse = usageSelector?.value;
    references = row() ? rewardReferences(row(), model()) : [];
    if (!usageSelector) return;
    usageSelector.replaceChildren(...references.map(reference => {
      const option = node("option", `${reference.name} · ${shortSceneLabel(reference)}`);
      option.value = usageKey(reference);
      option.title = `${reference.name} · ${sceneLabel(reference)}${reference.kind === "reinforcement" ? ` · ${reference.turn}턴 증원` : ""} · (${reference.x}, ${reference.y})`;
      return option;
    }));
    if (!references.length) {
      const option = node("option", "확인된 등장 연결 없음"); option.value = ""; usageSelector.append(option);
    }
    usageSelector.value = references.some(reference => usageKey(reference) === previousUse) ? previousUse : references.length ? usageKey(references[0]) : "";
    usageSelector.title = Array.from(usageSelector.options).find(option => option.value === usageSelector.value)?.title ?? "";
  }

  function readPending() {
    const current = row();
    if (!current?.editable) return null;
    return { ...current, ...Object.fromEntries([...controls].map(([field, control]) => [field, control.value === "" ? NaN : Number(control.value)])) };
  }

  function accept({ report = false } = {}) {
    const current = row();
    if (!current?.editable || !host.canEdit()) return true;
    for (const control of controls.values()) { control.setCustomValidity(""); control.removeAttribute("aria-invalid"); }
    const pending = readPending();
    const invalid = [...controls].find(([field, control]) => !Number.isInteger(pending[field]) || !control.validity.valid);
    const message = invalid ? "범위 안의 정수를 입력해주세요." : !rewardValueAllowed(current, pending) ? "확률 합계는 100% 이하여야 합니다." : "";
    const target = invalid?.[1] ?? controls.get("chance1");
    if (message) {
      target.setCustomValidity(message);
      target.setAttribute("aria-invalid", "true");
      summary.textContent = message;
      sync();
      measure();
      if (report) {
        host.open(); measure();
        if (paged) { page = [...form.children].findIndex(group => group.contains(target)); showPage(); }
        target.reportValidity();
      }
      return false;
    }
    const fields = REWARD_FIELDS.slice(0, current.capacity * 2);
    const changed = fields.some(field => current[field] !== pending[field]);
    for (const field of fields) current[field] = pending[field];
    describe();
    measure();
    if (changed) host.onChange(current);
    return true;
  }

  function render() {
    controls.clear();
    form.replaceChildren();
    const current = row();
    renderUses();
    if (!current) { describe(); return; }
    for (let i = 1; i <= current.capacity; i += 1) {
      const group = node("div", undefined, "reward-pair");
      const partLabel = node("label", current.capacity === 1 ? "획득 강화파츠" : `획득 후보 ${i}`);
      const select = node("select");
      select.dataset.rewardField = `part${i}`;
      select.setAttribute("aria-label", current.capacity === 1 ? "획득 강화파츠" : `획득 후보 ${i} 강화파츠`);
      for (let id = 1; id <= REWARD_PART_MAX; id += 1) {
        const option = node("option", host.partName(id) || "명칭 미확인 강화파츠");
        option.value = String(id);
        select.append(option);
      }
      select.value = String(current[`part${i}`]);
      const chanceLabel = node("label", "획득 확률 (%)");
      const input = node("input");
      input.type = "number"; input.inputMode = "numeric"; input.min = "0"; input.max = "100"; input.step = "1";
      input.value = String(current[`chance${i}`]); input.dataset.rewardField = `chance${i}`;
      input.setAttribute("aria-label", current.capacity === 1 ? "강화파츠 획득 확률 (%)" : `획득 후보 ${i} 확률 (%)`);
      controls.set(`part${i}`, select); controls.set(`chance${i}`, input);
      partLabel.append(select); chanceLabel.append(input); group.append(partLabel, chanceLabel); form.append(group);
    }
    describe();
    measure();
  }

  function refresh() {
    const searchKey = value => value.replace(/\s/gu, "").toLocaleLowerCase();
    const query = searchKey(search?.value ?? "");
    const rows = host.rows().filter(item => !query || [composition(item), ...rewardReferences(item, model()).flatMap(reference => [reference.name, sceneLabel(reference)])]
      .join(" ").replace(/\s/gu, "").toLocaleLowerCase().includes(query));
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.editable)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    selector.replaceChildren(...rows.map(item => {
      const option = node("option", optionLabel(item));
      option.title = composition(item);
      option.value = String(item.recordIndex);
      return option;
    }));
    if (!rows.length) { const option = node("option", "검색과 일치하는 보상 없음"); option.value = ""; selector.append(option); }
    selector.value = selected === null ? "" : String(selected);
    page = 0;
    render();
  }

  selector.addEventListener("change", () => { selected = Number(selector.value); render(); });
  search?.addEventListener("input", refresh);
  usageSelector?.addEventListener("change", () => {
    usageSelector.title = Array.from(usageSelector.options).find(option => option.value === usageSelector.value)?.title ?? "";
    sync();
  });
  usageOpen?.addEventListener("click", () => {
    const reference = selectedUse();
    if (host.canEdit() && reference) host.openUse?.(reference.kind, reference.recordIndex);
  });
  previous.addEventListener("click", () => { page -= 1; showPage(); });
  next.addEventListener("click", () => { page += 1; showPage(); });
  form.addEventListener("input", () => accept());
  form.addEventListener("change", () => accept());
  reset.addEventListener("click", () => {
    const current = row();
    if (!current?.editable || !host.canEdit()) return;
    for (const field of REWARD_FIELDS.slice(0, current.capacity * 2)) current[field] = current.original[field];
    render(); host.onChange(current);
  });
  window.addEventListener("resize", measure);
  document.fonts?.ready.then(measure);
  return Object.freeze({
    refresh, sync, selectedRow: row,
    reset: () => { selected = null; if (search) search.value = ""; refresh(); },
    validate: () => accept({ report: true }),
    focus: (recordIndex, fields = []) => {
      if (!host.rows().some(item => item.recordIndex === recordIndex)) return false;
      selected = recordIndex; if (search) search.value = ""; refresh();
      const target = controls.get(fields[0]) ?? selector;
      if (paged && fields[0]) { page = fields[0].endsWith("2") ? 1 : 0; showPage(); }
      target.focus();
      return true;
    },
  });
}
