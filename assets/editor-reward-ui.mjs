import { REWARD_FIELDS, REWARD_PART_MAX, rewardTotal, rewardValueAllowed } from "./editor-rewards.mjs?v=20261011-public7";

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
  let selected = null;
  let page = 0;
  let paged = false;
  const controls = new Map();
  const row = () => host.rows().find(item => item.recordIndex === selected);
  const aliasLabel = aliases => {
    if (aliases.length > 2 && aliases.every((id, i) => id === aliases[0] + i)) return `${aliases[0]}–${aliases.at(-1)}`;
    return aliases.join("·");
  };
  function showPage() {
    const groups = [...form.children];
    page = Math.max(0, Math.min(page, groups.length - 1));
    groups.forEach((group, i) => { group.hidden = paged && i !== page; });
    position.textContent = `${page + 1}/${groups.length}`;
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
    selector.disabled = !host.canEdit() || !host.rows().length;
    for (const control of controls.values()) control.disabled = !writable;
    reset.disabled = !writable || !REWARD_FIELDS.some(field => current[field] !== current.original[field]);
  }

  function describe() {
    const current = row();
    const total = current ? rewardTotal(current) : 0;
    summary.textContent = current ? `파츠 ${total}% · 보상 없음 ${100 - total}%` : "보상 표가 없습니다";
    scope.textContent = current?.aliases.length > 1
      ? `보상 번호 ${aliasLabel(current.aliases)}는 같은 표를 사용합니다.`
      : "이 보상 표를 사용하는 모든 기체에 적용됩니다.";
    for (const [field, control] of controls) control.classList.toggle("is-modified", current[field] !== current.original[field]);
    sync();
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
    if (!current) { describe(); return; }
    for (let i = 1; i <= current.capacity; i += 1) {
      const group = node("div", undefined, "reward-pair");
      const partLabel = node("label", `파츠 ${i}`);
      const select = node("select");
      select.dataset.rewardField = `part${i}`;
      for (let id = 1; id <= REWARD_PART_MAX; id += 1) {
        const option = node("option", host.partName(id) || `파츠 #${id}`);
        option.value = String(id);
        select.append(option);
      }
      select.value = String(current[`part${i}`]);
      const chanceLabel = node("label", "확률 (%)");
      const input = node("input");
      input.type = "number"; input.inputMode = "numeric"; input.min = "0"; input.max = "100"; input.step = "1";
      input.value = String(current[`chance${i}`]); input.dataset.rewardField = `chance${i}`;
      controls.set(`part${i}`, select); controls.set(`chance${i}`, input);
      partLabel.append(select); chanceLabel.append(input); group.append(partLabel, chanceLabel); form.append(group);
    }
    describe();
    measure();
  }

  function refresh() {
    const rows = host.rows();
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.editable)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    selector.replaceChildren(...rows.map(item => {
      const option = node("option", `${item.name}${item.editable ? "" : " · 보상 없음"}`);
      option.value = String(item.recordIndex);
      return option;
    }));
    selector.value = selected === null ? "" : String(selected);
    render();
  }

  selector.addEventListener("change", () => { selected = Number(selector.value); render(); });
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
    reset: () => { selected = null; refresh(); },
    validate: () => accept({ report: true }),
    focus: (recordIndex, fields = []) => {
      if (!host.rows().some(item => item.recordIndex === recordIndex)) return false;
      selected = recordIndex; selector.value = String(selected); render();
      const target = controls.get(fields[0]) ?? selector;
      if (paged && fields[0]) { page = fields[0].endsWith("2") ? 1 : 0; showPage(); }
      target.focus();
      return true;
    },
  });
}
