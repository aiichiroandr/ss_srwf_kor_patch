import { createEffectList, fitEffectPanel } from './editor-effect-list.mjs?v=20261106-part4';
import { REWARD_FIELDS, REWARD_PART_MAX, rewardTotal, rewardValueAllowed, rewardOutcomeLabel, rewardReferences } from "./editor-rewards.mjs?v=20261106-part4";
import { scenarioSelectionLabel } from "./editor-scenario-labels.mjs?v=20261106-part4";

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
  const list = document.getElementById("rewardRecordList");
  const form = document.getElementById("rewardFields");
  const summary = document.getElementById("rewardSummary");
  const scope = document.getElementById("rewardScope");
  const reset = document.getElementById("rewardReset");
  const pager = document.getElementById("rewardPager");
  const previous = document.getElementById("rewardPrev");
  const next = document.getElementById("rewardNext");
  const position = document.getElementById("rewardPageNumber");
  const search = document.getElementById("rewardSearch");
  const usageList = document.getElementById('rewardUsageList');
  const usagePager = document.getElementById('rewardUsagePager');
  const usagePrevious = document.getElementById('rewardUsagePrev'), usageNext = document.getElementById('rewardUsageNext');
  let usagePage=0;
  let selected = null;
  const picker = createEffectList({ list, label: item => `#${item.recordIndex} · ${optionLabel(item)}`, onSelect: id => { if (!host.canEdit()) return; selected = id; render(); } });
  let references = [];
  let page = 0;
  let paged = false;
  const controls = new Map();
  const drafts = new Map();
  const row = () => host.rows().find(item => item.recordIndex === selected);
  const model = () => host.model?.() ?? {};
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
    fitEffectPanel(panel);
    if (panel.hidden) return;
    panel.dataset.compact = String(window.innerWidth<1100&&window.innerHeight < 740);
    paged = false; showPage();
    renderUsagePage();
  }

  function sync() {
    const current = row();
    const writable = host.canEdit() && Boolean(current?.editable);
    picker.sync(selected, !host.canEdit());
    if (search) search.disabled = !host.canEdit() || !host.rows().length;
    for(const button of usageList?.querySelectorAll('button')??[])button.disabled=!host.canEdit()||!host.openUse;
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
    if (current) picker.update(current);
    for (const [field, control] of controls) control.classList.toggle("is-modified", current[field] !== current.original[field]);
    for (const group of form.children) {
      const select = group.querySelector("select"), input = group.querySelector("input");
      if (select) select.title = host.partName(Number(select.value));
      if (input) group.dataset.inactive = String(input.value === "0");
    }
    sync();
  }

  function renderUses() {
    references = row() ? rewardReferences(row(), model()) : [];
    usagePage=0;renderUsagePage();
  }
  function renderUsagePage(){
    if(!usageList)return;
    const available=usageList.parentElement?.clientHeight||252;
    const size=window.innerWidth>=1100?Math.max(1,references.length):Math.max(1,Math.min(7,Math.floor((available-28)/32))),pages=Math.max(1,Math.ceil(references.length/size));
    usagePage=Math.max(0,Math.min(usagePage,pages-1));usageList.replaceChildren();
    for(const reference of references.slice(usagePage*size,(usagePage+1)*size)){
      const button=node('button');button.type='button';
      host.appendArtwork?.(button,reference);
      button.append(node('span',`${reference.name} · ${shortSceneLabel(reference)}`,'entity-art-text'));
      button.title=`${reference.name} · ${sceneLabel(reference)}${reference.kind==='reinforcement'?` · ${reference.turn}턴 증원`:''} · (${reference.x}, ${reference.y})`;
      button.disabled=!host.canEdit()||!host.openUse;
      button.addEventListener('click',()=>{if(host.canEdit())host.openUse?.(reference.kind,reference.recordIndex);});usageList.append(button);
    }
    if(!references.length)usageList.append(node('p','확인된 등장 연결 없음'));
    usagePager.hidden=pages<=1;usagePrevious.disabled=usagePage===0;usageNext.disabled=usagePage===pages-1;
    document.getElementById('rewardUsagePosition').textContent=`${usagePage+1} / ${pages}`;
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
      drafts.set(current.recordIndex, Object.fromEntries([...controls].map(([field, control]) => [field, control.value])));
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
    drafts.delete(current.recordIndex);
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
      select.value = drafts.get(current.recordIndex)?.[`part${i}`] ?? String(current[`part${i}`]);
      const chanceLabel = node("label", "획득 확률 (%)");
      const input = node("input");
      input.type = "number"; input.inputMode = "numeric"; input.min = "0"; input.max = "100"; input.step = "1";
      input.value = drafts.get(current.recordIndex)?.[`chance${i}`] ?? String(current[`chance${i}`]); input.dataset.rewardField = `chance${i}`;
      input.setAttribute("aria-label", current.capacity === 1 ? "강화파츠 획득 확률 (%)" : `획득 후보 ${i} 확률 (%)`);
      controls.set(`part${i}`, select); controls.set(`chance${i}`, input);
      partLabel.append(select); chanceLabel.append(input); group.append(partLabel, chanceLabel); form.append(group);
    }
    if (drafts.has(current.recordIndex)) accept();
    else { describe(); measure(); }
  }

  function refresh() {
    const searchKey = value => value.replace(/\s/gu, "").toLocaleLowerCase();
    const query = searchKey(search?.value ?? "");
    const rows = host.rows().filter(item => !query || [composition(item), ...rewardReferences(item, model()).flatMap(reference => [reference.name, sceneLabel(reference)])]
      .join(" ").replace(/\s/gu, "").toLocaleLowerCase().includes(query));
    if (!rows.some(item => item.recordIndex === selected)) selected = rows.find(item => item.editable)?.recordIndex ?? rows[0]?.recordIndex ?? null;
    picker.render(rows, selected);
    page = 0;
    render();
  }

  search?.addEventListener("input", refresh);
  usagePrevious?.addEventListener('click',()=>{usagePage--;renderUsagePage();});
  usageNext?.addEventListener('click',()=>{usagePage++;renderUsagePage();});
  previous.addEventListener("click", () => { page -= 1; showPage(); });
  next.addEventListener("click", () => { page += 1; showPage(); });
  form.addEventListener("input", () => accept());
  form.addEventListener("change", () => accept());
  reset.addEventListener("click", () => {
    const current = row();
    if (!current?.editable || !host.canEdit()) return;
    drafts.delete(current.recordIndex);
    for (const field of REWARD_FIELDS.slice(0, current.capacity * 2)) current[field] = current.original[field];
    render(); host.onChange(current);
  });
  window.addEventListener("resize", measure);
  document.fonts?.ready.then(measure);
  return Object.freeze({
    refresh, sync, selectedRow: row,
    reset: () => { drafts.clear(); selected = null; if (search) search.value = ""; refresh(); },
    hasInvalidDraft: () => drafts.size > 0,
    validate: ({report=true}={}) => {
      const id = drafts.keys().next().value;
      if (id !== undefined && id !== selected) {
        if (!report) return false;
        selected = id; if (search) search.value = ""; refresh();
      }
      return accept({ report });
    },
    focus: (recordIndex, fields = []) => {
      if (!host.rows().some(item => item.recordIndex === recordIndex)) return false;
      selected = recordIndex; if (search) search.value = ""; refresh();
      const target = controls.get(fields[0]);
      if (paged && fields[0]) { page = fields[0].endsWith("2") ? 1 : 0; showPage(); }
      if (target) target.focus(); else picker.focus(selected);
      return true;
    },
  });
}
