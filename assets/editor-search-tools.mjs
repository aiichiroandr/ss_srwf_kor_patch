import { filterFields, filterField, gradeChoices, gradeText, filterValue, isValidCondition, matchesConditions, isValidBulkValue, planBulkEdit, applyBulkEdit, undoBulkEdit, MAX_EDITOR_CONDITIONS } from "./editor-filter.mjs?v=20261011-public9";
import { packMeasuredGroups } from "./editor-layout.mjs?v=20261011-public9";

const KINDS = ["unit", "pilot", "weapon"];
const NOUNS = { unit: "기체", pilot: "파일럿", weapon: "무기" };
const OPERATORS = { eq: "=", gte: "≥", lte: "≤", has: "보유", lacks: "없음" };
const REASONS = { "read-only": "읽기 전용", alias: "공유 레코드", missing: "값 확인 불가", grade: "지형 범위", "weapon-domain": "탄수·기력 제한" };
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const button = (text, action, cls = "") => { const el = node("button", cls, text); el.type = "button"; el.addEventListener("click", action); return el; };
const option = (select, value, label) => { const el = node("option", null, label); el.value = String(value); select.append(el); };

// Host owns the session, row names, normal text search, editing revision and refresh/export invalidation.
// This controller only changes the same pending rows used by the existing form/preset/export path.
export function createEditorSearchTools(host) {
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(["Dialog", "Title", "Close", "Summary", "Error", "Cancel", "Submit"].map(key => [key.toLowerCase(), byId(`editorSearch${key}`)]));
  Object.assign(ui, {
    filter: byId("editorFilterPanel"), conditions: byId("editorFilterConditions"), filterPager: byId("editorFilterPager"), add: byId("editorAddCondition"), clear: byId("editorClearConditions"),
    bulk: byId("editorBulkPanel"), field: byId("editorBulkField"), value: byId("editorBulkValue"), bulkSummary: byId("editorBulkSummary"), preview: byId("editorBulkPreviewLabel"), targetsToggle: byId("editorBulkTargetsToggle"), targets: byId("editorBulkTargets"), bulkPager: byId("editorBulkPager"), choose: byId("editorBulkChooseTools"), all: byId("editorBulkSelectAll"), none: byId("editorBulkSelectNone"),
  });
  const controls = Object.fromEntries(KINDS.map(kind => [kind, { filter: byId(`${kind}FilterButton`), bulk: byId(`${kind}BulkButton`), chips: byId(`${kind}FilterChips`), note: byId(`${kind}BulkNote`) }]));
  const criteria = { unit: [], pilot: [], weapon: [] };
  const appliedView = { unit: false, pilot: false, weapon: false };
  let history = [], pending = null, opener = null, layoutFrame = 0, pageAnchor = 0;
  const catalogs = new Map();

  const latest = kind => [...history].reverse().find(item => item.kind === kind) ?? null;
  const session = () => host.session();
  const rowsFor = kind => session()[{ unit: "units", pilot: "pilots", weapon: "weapons" }[kind]] ?? [];
  const readValue = input => input.type === "number" ? (input.value.trim() === "" ? null : Number(input.value)) : Number(input.value);
  const format = (kind, key, value) => filterField(kind, key)?.type === "grade" ? gradeText(kind, value) : typeof value === "boolean" ? (value ? "있음" : "없음") : String(value);
  const reasonText = reason => reason === "weapon-domain" && pending?.key === "ammo" ? "탄수 없는 무기" : REASONS[reason] ?? "편집 제한";
  const catalog = (kind, key) => { const id = `${kind}/${key}`; if (!catalogs.has(id)) catalogs.set(id, host.choices(kind, key)); return catalogs.get(id); };
  function describe(kind, condition) {
    const field = filterField(kind, condition.field);
    const value = field?.type === "membership" ? catalog(kind, field.key).find(item => item.id === condition.value)?.name ?? `#${condition.value}` : format(kind, condition.field, condition.value);
    return `${field?.label ?? condition.field} ${OPERATORS[condition.op]} ${value}`;
  }
  function error(message = "") { ui.error.textContent = message; ui.error.hidden = !message; scheduleLayout(); }
  function sourceRows(kind, conditions = criteria[kind]) {
    return host.textRows(kind).filter(row => matchesConditions(kind, row, conditions, host.isModified));
  }
  function filterRows(kind, rows) {
    const transaction = latest(kind);
    if (appliedView[kind] && transaction) {
      const ids = new Set(transaction.items.map(item => item.recordIndex));
      return rows.filter(row => ids.has(row.recordIndex));
    }
    return rows.filter(row => matchesConditions(kind, row, criteria[kind], host.isModified));
  }
  function canUndo(transaction) {
    const map = new Map(rowsFor(transaction.kind).map(row => [row.recordIndex, row]));
    return transaction.items.every(item => { const row = map.get(item.recordIndex); return row && row.editable !== false && row.statsValid !== false && row[item.field] === item.after; });
  }
  function sync(kind) {
    const tool = controls[kind], transaction = latest(kind), top = history.at(-1);
    const editable = host.canEdit() ? host.visibleRows(kind).filter(row => row.editable !== false && row.statsValid !== false).length : 0;
    tool.filter.disabled = !host.canEdit(); tool.bulk.disabled = !host.canEdit() || !editable;
    tool.bulk.title = `현재 목록 중 편집 가능한 ${editable}개를 일괄 편집`;
    tool.filter.textContent = criteria[kind].length ? `조건 ${criteria[kind].length}` : "조건";
    const chips = (appliedView[kind] ? [] : criteria[kind].slice(0, 1)).map((condition, index) => {
      const label = describe(kind, condition);
      const el = button(`${label} ×`, () => { criteria[kind].splice(index, 1); appliedView[kind] = false; host.refresh(kind); controls[kind].filter.focus?.({ preventScroll: true }); }, "record-filter-chip");
      el.setAttribute("aria-label", `${label} 조건 삭제`); el.disabled = !host.canEdit(); return el;
    });
    if (!appliedView[kind] && criteria[kind].length > 1) chips.push(button(`외 ${criteria[kind].length - 1}개`, () => openFilter(kind), "record-filter-chip"));
    if (appliedView[kind]) chips.push(button("방금 편집한 항목 ×", () => { appliedView[kind] = false; host.refresh(kind); }, "record-filter-chip is-applied"));
    tool.chips.replaceChildren(...chips); tool.chips.hidden = !chips.length;
    tool.note.replaceChildren(); tool.note.hidden = !transaction;
    if (transaction) {
      const count = new Set(transaction.items.map(item => item.recordIndex)).size;
      tool.note.append(node("span", "record-bulk-result", `${count}개 · ${filterField(kind, transaction.key)?.label} → ${format(kind, transaction.key, transaction.value)}`));
      const actions = node("div", "record-bulk-actions");
      actions.append(button(appliedView[kind] ? "검색 결과로" : "적용 항목 보기", () => { appliedView[kind] = !appliedView[kind]; host.refresh(kind); }, "record-note-button"));
      const undo = button("되돌리기", () => {
        if (!host.canEdit() || transaction !== history.at(-1)) return;
        try { undoBulkEdit(transaction, session()); history.pop(); appliedView[kind] = false; host.afterApply(); host.announce(`${count}개를 일괄 편집 직전 값으로 되돌렸습니다.`); }
        catch (exception) { host.announce(exception.message); }
      }, "record-note-button");
      undo.disabled = !host.canEdit() || transaction !== top || !canUndo(transaction);
      undo.title = !host.canEdit() ? "저장·검사가 끝난 뒤 되돌릴 수 있습니다."
        : transaction !== top ? `${NOUNS[top.kind]} 탭의 가장 최근 일괄 편집부터 되돌려 주세요.`
          : !canUndo(transaction) ? "이후에 같은 값을 다시 편집해 일괄 되돌릴 수 없습니다. 변경 목록에서 확인하세요." : "원본 초기화가 아니라 이 작업 직전 값으로 되돌리기";
      actions.append(undo);
      tool.note.append(actions);
    }
  }
  function finishClose() { pending = null; opener?.focus?.({ preventScroll: true }); opener = null; }
  function close() { if (ui.dialog.open) ui.dialog.close(); finishClose(); }
  function show(kind, mode, trigger) {
    if (!host.canEdit()) return false;
    host.beforeOpen(); opener = trigger; pageAnchor = 0;
    ui.summary.hidden = false; ui.summary.title = ""; ui.bulkSummary.hidden = false;
    ui.dialog.classList.remove("is-tight", "is-target-selection");
    error(); ui.title.textContent = `${NOUNS[kind]} ${mode === "filter" ? "검색 조건" : "일괄 편집"}`;
    ui.filter.hidden = mode !== "filter"; ui.bulk.hidden = mode !== "bulk";
    if (!ui.dialog.open) ui.dialog.showModal(); scheduleLayout(); return true;
  }
  function defaultCondition(kind, key = "space") {
    const field = filterField(kind, key);
    return { field: key, op: field.type === "membership" ? "has" : field.type === "number" ? "gte" : "eq", value: field.type === "membership" ? catalog(kind, key)[0]?.id ?? null : field.type === "boolean" ? true : field.type === "grade" ? (kind === "weapon" ? 2 : 3) : field.bounds[0] };
  }
  function fieldsSelect(select, kind, editableOnly = false) {
    select.replaceChildren(); let group = null;
    for (const field of filterFields(kind, { editableOnly })) {
      if (group?.label !== field.group) { group = node("optgroup"); group.label = field.group; select.append(group); }
      option(group, field.key, field.label);
    }
  }
  function valueControl(kind, field, value, edit = false) {
    const input = node(field.type === "number" ? "input" : "select");
    if (field.type === "number") {
      input.type = "number"; input.min = String(field.bounds[0]); input.max = String(edit && kind === "weapon" && field.key === "requiredMorale" ? 150 : field.bounds[1]);
      if (edit && kind === "weapon" && field.key === "ammo") input.min = "1";
      input.step = "1"; input.inputMode = field.bounds[0] < 0 ? "text" : "numeric";
      if (edit) input.placeholder = "새 값 입력";
    } else if (field.type === "grade") gradeChoices(kind).forEach(choice => option(input, choice.value, choice.letter));
    else if (field.type === "boolean") { option(input, 1, field.key === "modified" ? "수정됨" : "있음"); option(input, 0, field.key === "modified" ? "수정 안 함" : "없음"); }
    else { option(input, "", "능력 선택"); catalog(kind, field.key).forEach(item => option(input, item.id, item.name)); }
    input.value = value === null ? "" : typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    return input;
  }
  function openFilter(kind) {
    pending = { mode: "filter", kind, draft: criteria[kind].map(condition => ({ ...condition })) };
    if (!pending.draft.length) pending.draft.push(defaultCondition(kind));
    if (!show(kind, "filter", controls[kind].filter)) { pending = null; return; }
    renderConditions(); updateFilter(); ui.conditions.querySelector("select")?.focus?.({ preventScroll: true });
  }
  function renderConditions(focusIndex = null) {
    const { kind, draft } = pending;
    const children = draft.map((condition, index) => {
      const row = node("div", "editor-filter-condition"); row.dataset.conditionIndex = String(index);
      const field = filterField(kind, condition.field);
      if (field.type === "membership") row.classList.add("is-membership");
      const select = node("select", "editor-filter-field"); fieldsSelect(select, kind); select.value = condition.field;
      select.dataset.conditionField = ""; select.setAttribute("aria-label", `조건 ${index + 1} 항목`);
      const op = node("select", "editor-filter-operator");
      (field.type === "membership" ? ["has", "lacks"] : field.type === "boolean" ? ["eq"] : ["eq", "gte", "lte"]).forEach(key => option(op, key, OPERATORS[key]));
      op.value = condition.op; op.dataset.conditionOp = ""; op.setAttribute("aria-label", `조건 ${index + 1} 비교`);
      const value = valueControl(kind, field, condition.value); value.dataset.conditionValue = ""; value.setAttribute("aria-label", `조건 ${index + 1} 값`);
      const remove = button("✕", () => { draft.splice(index, 1); pageAnchor = Math.max(0, index - 1); renderConditions(pageAnchor); updateFilter(); }, "editor-filter-remove"); remove.setAttribute("aria-label", `조건 ${index + 1} 삭제`);
      select.addEventListener("change", () => { Object.assign(condition, defaultCondition(kind, select.value)); renderConditions(index); updateFilter(); });
      op.addEventListener("change", () => { condition.op = op.value; updateFilter(); });
      value.addEventListener(field.type === "number" ? "input" : "change", () => { condition.value = field.type === "boolean" ? value.value === "1" : value.value === "" ? null : readValue(value); updateFilter(); });
      row.append(select, op, value, remove); return row;
    });
    ui.conditions.replaceChildren(...children); ui.add.disabled = draft.length >= MAX_EDITOR_CONDITIONS;
    if (focusIndex !== null) { pageAnchor = focusIndex; ui.conditions.children[focusIndex]?.querySelector("select")?.focus?.({ preventScroll: true }); }
    scheduleLayout();
  }
  function updateFilter() {
    const { kind, draft } = pending;
    const valid = draft.every(condition => isValidCondition(kind, condition));
    const count = valid ? sourceRows(kind, draft).length : 0;
    ui.summary.textContent = valid ? `${count}개 일치 · 현재 값 · 모든 조건${host.query(kind).trim() ? " · 이름 포함" : ""}` : "조건 값을 입력해 주세요.";
    ui.submit.textContent = !draft.length ? "전체 목록 보기" : `결과 ${count}개 보기`;
    ui.submit.disabled = !valid || !host.canEdit(); scheduleLayout();
  }
  function openBulk(kind) {
    const rows = host.visibleRows(kind);
    if (!rows.some(row => row.editable !== false && row.statsValid !== false)) return;
    const key = criteria[kind].find(condition => filterField(kind, condition.field)?.editable)?.field ?? "space";
    const field = filterField(kind, key);
    pending = { mode: "bulk", kind, ids: rows.map(row => row.recordIndex), selected: new Set(rows.filter(row => row.editable !== false && row.statsValid !== false).map(row => row.recordIndex)), key, value: field.type === "grade" ? (kind === "weapon" ? 3 : 4) : field.type === "boolean" ? true : null, expanded: false, token: host.token(), revision: host.revision(), scope: appliedView[kind] ? "방금 편집한 항목" : !criteria[kind].length && !host.query(kind).trim() ? "전체 목록" : "검색 결과" };
    if (!show(kind, "bulk", controls[kind].bulk)) { pending = null; return; }
    fieldsSelect(ui.field, kind, true); ui.field.value = key; renderBulkValue(); renderBulk(); ui.field.focus?.({ preventScroll: true });
  }
  function renderBulkValue() {
    const { kind, key, value } = pending;
    const field = filterField(kind, key), input = valueControl(kind, field, value, true); input.id = "editorBulkValueInput";
    input.setAttribute("aria-label", `${field.label}에 일괄 적용할 값`);
    input.addEventListener(field.type === "number" ? "input" : "change", () => { pending.value = field.type === "boolean" ? input.value === "1" : readValue(input); renderBulk(); });
    ui.value.replaceChildren(input);
  }
  function pendingRows() { const ids = new Set(pending.ids); return host.allRows(pending.kind).filter(row => ids.has(row.recordIndex)); }
  function bulkPlan(all = false) {
    const bulk = planBulkEdit(session(), pending.kind, pendingRows(), pending.key, pending.value);
    if (all) return bulk;
    const items = bulk.plan.items.filter(item => item.status === "skip" || pending.selected.has(item.recordIndex));
    const counts = { apply: 0, conflict: 0, same: 0, skip: 0 };
    for (const item of items) counts[item.status] += 1;
    return { ...bulk, plan: { ...bulk.plan, items, counts } };
  }
  function renderBulk() {
    const { kind, key, value, expanded, selected } = pending;
    ui.summary.textContent = `${pending.scope} ${pending.ids.length}개`;
    ui.summary.title = "이 창을 열 때의 목록만 편집합니다.";
    ui.targetsToggle.textContent = expanded ? "대상 접기" : "대상 확인·선택"; ui.targetsToggle.setAttribute("aria-expanded", String(expanded)); ui.choose.hidden = !expanded;
    const valid = isValidBulkValue(kind, key, value);
    const bulk = valid ? bulkPlan() : null, counts = bulk?.plan.counts;
    const apply = counts ? counts.apply + counts.conflict : 0;
    ui.submit.disabled = !host.canEdit() || !valid || !apply || host.token() !== pending.token || host.revision() !== pending.revision;
    ui.submit.textContent = `${apply}개에 적용`;
    const reasons = bulk ? Object.entries(bulk.plan.skipReasons).map(([reason, count]) => `${reasonText(reason)} ${count}`).join(" · ") : "";
    ui.bulkSummary.textContent = !valid ? (value === null ? "적용할 새 값을 입력해 주세요." : "적용할 값의 범위를 확인해 주세요.") : `변경 ${apply}개${counts.same ? ` · 동일 ${counts.same}개` : ""}${counts.skip ? ` · 제외 ${counts.skip}개 (${reasons})` : ""}`;
    const targets = [];
    const rows = pendingRows(), items = new Map((valid ? bulkPlan(true) : null)?.plan.items.map(item => [item.recordIndex, item]) ?? []);
    if (expanded) {
      for (const row of rows) {
        const line = node("div", "editor-bulk-target"); line.dataset.targetIndex = String(targets.length);
        const label = node("label", "editor-bulk-target-name");
        const check = node("input"); check.type = "checkbox"; check.checked = selected.has(row.recordIndex) && items.get(row.recordIndex)?.status !== "skip";
        check.disabled = row.editable === false || row.statsValid === false || items.get(row.recordIndex)?.status === "skip";
        check.setAttribute("aria-label", `${host.rowName(row)} #${row.recordIndex} 편집 대상으로 선택`);
        check.addEventListener("change", () => { if (check.checked) selected.add(row.recordIndex); else selected.delete(row.recordIndex); renderBulkSummaryOnly(); });
        label.append(check, node("span", null, `${host.rowName(row)} #${row.recordIndex}`));
        const item = items.get(row.recordIndex);
        const detail = node("span", "editor-bulk-target-value", check.disabled ? (item?.reason ? reasonText(item.reason) : "읽기 전용") : !valid ? "새 값 입력" : `${format(kind, key, filterValue(kind, row, key))} → ${format(kind, key, value)}`);
        line.append(label, detail); targets.push(line);
      }
    } else {
      const changes = rows.filter(row => selected.has(row.recordIndex) && items.get(row.recordIndex)?.status === "apply");
      const values = [...new Set(changes.map(row => filterValue(kind, row, key)))];
      const row = node("div", "editor-bulk-target");
      row.append(node("span", null, `${apply}개 변경`), node("span", "editor-bulk-target-value", !valid ? "값 확인" : !apply ? "변경 없음" : `${values.length === 1 ? format(kind, key, values[0]) : "각 현재 값"} → ${format(kind, key, value)}`)); targets.push(row);
    }
    ui.targets.replaceChildren(...targets); scheduleLayout();
  }
  function renderBulkSummaryOnly() {
    // Keep a touched checkbox alive until the interaction completes; other preview rows need no rebuild.
    const bulk = isValidBulkValue(pending.kind, pending.key, pending.value) ? bulkPlan() : null;
    const counts = bulk?.plan.counts, apply = counts?.apply ?? 0;
    ui.submit.disabled = !host.canEdit() || !apply || host.token() !== pending.token || host.revision() !== pending.revision;
    ui.submit.textContent = `${apply}개에 적용`;
    const reasons = bulk ? Object.entries(bulk.plan.skipReasons).map(([reason, count]) => `${reasonText(reason)} ${count}`).join(" · ") : "";
    ui.bulkSummary.textContent = !bulk ? "적용할 새 값을 입력해 주세요." : `변경 ${apply}개${counts.same ? ` · 동일 ${counts.same}개` : ""}${counts.skip ? ` · 제외 ${counts.skip}개 (${reasons})` : ""}`;
    scheduleLayout();
  }
  function submit() {
    if (!pending || !host.canEdit()) return;
    if (pending.mode === "filter") {
      if (!pending.draft.every(condition => isValidCondition(pending.kind, condition))) return;
      const kind = pending.kind; criteria[kind] = pending.draft.map(condition => ({ ...condition })); appliedView[kind] = false; close(); host.refresh(kind); return;
    }
    if (host.token() !== pending.token || host.revision() !== pending.revision) { error("편집 중인 값이 바뀌었습니다. 일괄 편집을 다시 열어 주세요."); return; }
    if (!isValidBulkValue(pending.kind, pending.key, pending.value)) { error("적용할 값을 확인해 주세요."); return; }
    try {
      const transaction = applyBulkEdit(bulkPlan(), session());
      if (!transaction.applied) return;
      history.push(transaction); history = history.slice(-20); appliedView[transaction.kind] = true;
      close(); host.afterApply(); host.announce(`${transaction.applied}개를 일괄 편집했습니다. 적용 항목을 다시 보거나 되돌릴 수 있습니다.`);
    } catch (exception) { error(exception.message); }
  }
  // Fit row pages from measured heights, including controls and the current visual viewport (keyboard).
  // Reuse the editor layout packer, keep focused controls alive, and show a pager only when rows actually overflow.
  function fitRows() {
    layoutFrame = 0;
    if (!pending || !ui.dialog.open || typeof getComputedStyle !== "function") return;
    const viewport = window.visualViewport;
    const limit = Math.max(180, (viewport?.height ?? window.innerHeight) - 24);
    ui.dialog.style.setProperty("--editor-search-height", `${limit}px`);
    const list = pending.mode === "filter" ? ui.conditions : ui.targets;
    const pager = pending.mode === "filter" ? ui.filterPager : ui.bulkPager;
    const children = [...list.children]; children.forEach(el => { el.hidden = false; }); pager.hidden = true;
    const shell = ui.dialog.querySelector(".editor-search-shell");
    ui.summary.hidden = false; ui.bulkSummary.hidden = false;
    ui.dialog.classList.remove("is-tight", "is-target-selection"); ui.preview.textContent = "적용 전 → 적용 후";
    const gap = parseFloat(getComputedStyle(list).gap) || 0;
    const heights = children.map((el, index) => ({ index, el, height: el.getBoundingClientRect().height }));
    const packs = pixels => packMeasuredGroups(heights, page => page.reduce((sum, entry) => sum + entry.height, 0) + gap * Math.max(0, page.length - 1) <= pixels);
    let available = 0;
    const measurePages = () => {
      pager.hidden = true;
      available = Math.max(0, limit - (shell.scrollHeight - list.scrollHeight) - 4);
      let pages = packs(available);
      if (pages.length > 1) {
        // Measure the pager and its margins too, rather than assuming a fixed reserve.
        pager.hidden = false;
        available = Math.max(0, limit - (shell.scrollHeight - list.scrollHeight) - 4);
        pages = packs(available);
      }
      return pages;
    };
    const largest = Math.max(0, ...heights.map(entry => entry.height));
    let pages = measurePages();
    if (largest > available) {
      // The result count is also on the primary button; retain full-size controls before duplicate copy.
      ui.summary.hidden = true; ui.dialog.classList.add("is-tight"); pages = measurePages();
    }
    if (largest > available && pending.mode === "bulk" && pending.expanded) {
      if (ui.value.contains(document.activeElement) || document.activeElement === ui.field) {
        // Keep a field under the keyboard alive. Target selection can be reopened after entering the value.
        pending.expanded = false; pageAnchor = 0; renderBulk(); return;
      }
      // On a short viewport, target selection shows the chosen field/value as a heading.
      // Returning with '대상 접기' restores the same field controls and selected checkboxes.
      ui.dialog.classList.add("is-target-selection"); ui.bulkSummary.hidden = true;
      ui.preview.textContent = `${filterField(pending.kind, pending.key).label} → ${pending.value === null ? "새 값 입력" : format(pending.kind, pending.key, pending.value)}`;
      pages = measurePages();
    }
    const focused = children.findIndex(el => el.contains?.(document.activeElement));
    if (focused >= 0) pageAnchor = focused;
    let pageIndex = Math.max(0, pages.findIndex(page => page.some(entry => entry.index === pageAnchor)));
    const selected = new Set(pages[pageIndex]?.map(entry => entry.el) ?? []);
    children.forEach(el => { el.hidden = !selected.has(el); });
    pager.hidden = pages.length <= 1; pager.replaceChildren();
    if (pages.length > 1) {
      const step = direction => { const page = pages[pageIndex + direction]; if (!page) return; pageAnchor = page[0].index; document.activeElement?.blur?.(); fitRows(); };
      const before = button("‹", () => step(-1)); before.disabled = pageIndex === 0; before.setAttribute("aria-label", "이전 항목 페이지");
      const after = button("›", () => step(1)); after.disabled = pageIndex === pages.length - 1; after.setAttribute("aria-label", "다음 항목 페이지");
      pager.append(before, node("span", null, `${pageIndex + 1} / ${pages.length}`), after);
    }
    // Browsers differ in keyboard viewport positioning; keep the dialog inside that visible rectangle.
    const rect = ui.dialog.getBoundingClientRect(), top = viewport?.offsetTop ?? 0;
    ui.dialog.style.top = `${top + Math.max(0, ((viewport?.height ?? window.innerHeight) - rect.height) / 2)}px`;
  }
  function scheduleLayout() { if (typeof window.requestAnimationFrame !== "function" || layoutFrame) return; layoutFrame = window.requestAnimationFrame(fitRows); }

  for (const kind of KINDS) { controls[kind].filter.addEventListener("click", () => openFilter(kind)); controls[kind].bulk.addEventListener("click", () => openBulk(kind)); }
  ui.close.addEventListener("click", close); ui.cancel.addEventListener("click", close); ui.submit.addEventListener("click", submit);
  ui.dialog.addEventListener("close", () => { if (!ui.dialog.open) finishClose(); });
  ui.add.addEventListener("click", () => { if (!pending || pending.draft.length >= MAX_EDITOR_CONDITIONS) return; pending.draft.push(defaultCondition(pending.kind, filterFields(pending.kind).find(field => field.type === "number").key)); renderConditions(pending.draft.length - 1); updateFilter(); });
  ui.clear.addEventListener("click", () => { pending.draft = []; pageAnchor = 0; renderConditions(); updateFilter(); });
  ui.field.addEventListener("change", () => { pending.key = ui.field.value; const field = filterField(pending.kind, pending.key); pending.value = field.type === "grade" ? (pending.kind === "weapon" ? 3 : 4) : field.type === "boolean" ? true : null; renderBulkValue(); renderBulk(); });
  ui.targetsToggle.addEventListener("click", () => { pending.expanded = !pending.expanded; pageAnchor = 0; renderBulk(); });
  ui.all.addEventListener("click", () => { pending.selected = new Set(pendingRows().filter(row => row.editable !== false && row.statsValid !== false).map(row => row.recordIndex)); renderBulk(); });
  ui.none.addEventListener("click", () => { pending.selected.clear(); renderBulk(); });
  window.addEventListener("resize", scheduleLayout); window.visualViewport?.addEventListener("resize", scheduleLayout); window.visualViewport?.addEventListener("scroll", scheduleLayout);
  document.fonts?.ready.then(scheduleLayout);
  return {
    filterRows, sync, openFilter, openBulk, isOpen: () => ui.dialog.open,
    hasConditions: kind => criteria[kind].length > 0, isFiltered: kind => criteria[kind].length > 0 || appliedView[kind], isAppliedView: kind => appliedView[kind],
    searchChanged(kind) { appliedView[kind] = false; },
    clear(kind) { criteria[kind] = []; appliedView[kind] = false; },
    reset() { close(); history = []; pending = null; catalogs.clear(); for (const kind of KINDS) { criteria[kind] = []; appliedView[kind] = false; controls[kind].chips.replaceChildren(); controls[kind].chips.hidden = true; controls[kind].note.replaceChildren(); controls[kind].note.hidden = true; } },
  };
}
