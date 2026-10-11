// Read the visible workflow only. The manual never changes the user's editor session or file selection.
const CASES = new Set(["stock", "native", "patched", "personal"]);
const PAGES = {
  folder: ["게임 폴더 열기", "‘폴더 찾기’로 디스크 덤프 폴더를 선택하세요. F는 Rev B 21M, F완결편은 Rev A 10M·11M을 지원합니다."],
  stock: ["한글 패치 적용하기", "원본 확인 후 ‘한글 패치’와 폰트를 선택하세요. 에디터를 열거나 ‘편집 없이 저장으로 이동’을 누를 수 있습니다."],
  native: ["원본 언어로 편집하기", "‘원본 유지’를 선택한 뒤 에디터를 여세요. 한글 패치 없이 게임 데이터만 바꿀 수 있습니다."],
  patched: ["한글 패치본에서 시작하기", "최신 한글 패치본은 패치 설정을 건너뜁니다. 현재 언어·폰트를 유지한 채 바로 편집하거나 저장하세요."],
  personal: ["기존 편집을 이어서 하기", "최신 한글 패치 기반 또는 원본 언어의 편집본을 열면 기존 값과 언어를 유지합니다. 추가 편집 후 새 BIN/CUE로 저장하세요."],
  edit: ["편집할 항목 찾기", "기체·파일럿·무기 탭을 고른 뒤 이름이나 번호로 검색하세요. 휴대폰에서는 ‘목록’을 열어 항목을 선택하면 편집 화면으로 돌아옵니다."],
  unit: ["수치 바꾸기와 되돌리기", "HP·EN·이동력 등의 숫자를 입력하세요(예: HP 3000→3500). 바뀐 칸의 ↶를 누르면 이번에 불러온 값으로 돌아갑니다. ⓘ에서 수치 설명을 볼 수 있습니다."],
  "unit-terrain": ["기체 지형 적응 바꾸기", "공·육·해·우에서 원하는 등급을 고르세요. 여기서는 선택한 기체의 적응을 바꿉니다. 무기마다 다른 지형 적응은 ‘무기’ 탭에서 따로 편집합니다."],
  "unit-abilities": ["기체 특수능력 추가·삭제", "첫 빈칸의 ‘＋ 능력 추가’에서 고르고 ×로 삭제하세요. 🔒 항목은 고정됩니다. 플래그는 이벤트 조건 번호이며 0은 이벤트 제한 없음입니다. ⓘ에서 발동 조건·확인 여부를 볼 수 있습니다."],
  pilot: ["파일럿 능력과 성장 바꾸기", "파일럿 탭에서 전투 능력과 정신(SP)을 수정하세요. 성장·지형 구역에는 성장값과 파일럿 지형 적응이 있습니다. 휴대폰은 표시되는 구역 버튼으로 이동하세요."],
  spirits: ["정신커맨드 편집", "이름을 고르면 교체되고 Lv(1~99)는 습득 레벨입니다. ×로 삭제하고 빈칸의 ‘＋ 추가’에서 넣으세요. 특수능력과 저장 공간을 공유하므로 남은 자리가 있어야 추가할 수 있습니다."],
  skills: ["파일럿 특수능력 추가·삭제", "특수능력의 ‘추가·삭제’를 누르면 이 창이 열립니다. 능력·습득 Lv를 골라 추가하고, 목록에서 레벨을 바꾸거나 삭제하세요. 이벤트 조건으로 고정된 항목은 편집할 수 없습니다."],
  weapon: ["무기 수치와 사용 조건 바꾸기", "공격력·명중 보정·사거리·소비 EN·탄수·필요 기력·필요 기능을 수정하세요. 기체 무장에서 무기를 누르면 해당 무기로 이동합니다. 여러 기체가 같은 무기 데이터를 쓰면 함께 반영됩니다."],
  "weapon-terrain": ["무기 지형 적응 바꾸기", "공·육·해·우의 등급을 고르면 해당 무기의 지형 적응이 바뀝니다. 기체 지형 적응과 별도 항목입니다. ⓘ에서 등급 효과와 게임 화면 표시의 주의점을 확인하세요."],
  changes: ["변경 목록 확인하기", "아래의 ‘이번 변경 …건’을 누르면 바꾼 항목과 이전·현재 값이 나옵니다. 목록의 항목을 누르면 해당 편집 칸으로 돌아갑니다. BIN/CUE를 만들기 전에 확인하세요."],
  preset: ["편집값 저장·불러오기", "‘편집값 저장’은 이번에 바꾼 값을 JSON으로 보관합니다. ‘편집값 불러오기’는 JSON을 읽어 적용할 내용을 확인합니다."],
  save: ["플레이할 BIN/CUE 만들기", "‘BIN/CUE 저장’으로 이동해 적용 언어·변경 건수를 확인하고 ‘BIN/CUE 만들기’를 누르세요. JSON과 별도로 게임 파일을 만듭니다."],
  downloads: ["BIN과 CUE 함께 저장하기", "준비가 끝나면 BIN과 CUE를 둘 다 받아 같은 폴더에 두세요. 저장한 파일의 폴더를 다시 열어 계속 편집할 수 있습니다."],
};

export const EDIT_GUIDE_PAGES = Object.freeze(["edit", "unit", "unit-terrain", "unit-abilities", "pilot", "spirits", "skills", "weapon", "weapon-terrain", "changes"]);
export function guidePages(route) {
  return [{ key: "folder", group: 0 }, { key: CASES.has(route) ? route : "stock", group: 1 },
    ...EDIT_GUIDE_PAGES.map(key => ({ key, group: 2 })), { key: "preset", group: 3 }, { key: "save", group: 4 }, { key: "downloads", group: 4 }];
}

export function guideContext(doc) {
  const byId = id => doc.getElementById(id);
  const source = byId("editorSourceState")?.textContent ?? "";
  const summary = byId("workflowDetectedSummary")?.textContent ?? "";
  const origin = byId("originLine")?.textContent ?? "";
  const text = `${source} ${summary} ${origin}`;
  const loaded = !byId("workflowOpenEditor")?.disabled || doc.body.dataset.view === "editor" || doc.body.dataset.view === "save";
  const route = /편집본/.test(text) ? "personal"
    : loaded && doc.body.dataset.patchSettings === "skip" && !/원본 언어/.test(text) ? "patched"
    : byId("languageOriginal")?.checked ? "native" : "stock";
  const step = doc.body.dataset.view === "save" ? 4 : doc.body.dataset.view === "editor" ? 2 : loaded ? 1 : 0;
  return { route, step };
}

export function createUserGuide(doc) {
  const byId = id => doc.getElementById(id);
  const opener = byId("userGuideOpen");
  const dialog = byId("userGuideDialog");
  if (!opener || !dialog) return null;
  const routeSelect = byId("userGuideRoute");
  const topicSelect = byId("userGuideTopic");
  const topicRow = byId("userGuideTopicRow");
  const image = byId("userGuideImage");
  const mobileImage = byId("userGuideMobileImage");
  const imageError = byId("userGuideImageError");
  const previous = byId("userGuidePrevious");
  const next = byId("userGuideNext");
  const stepButtons = [...dialog.querySelectorAll("[data-guide-step]")];
  let route = "stock";
  let step = 0;
  const pages = () => guidePages(route);

  function fit() {
    if (!dialog.open || !image.naturalWidth || !image.naturalHeight) return;
    const shell = dialog.querySelector(".user-guide-shell");
    const figure = dialog.querySelector(".user-guide-figure");
    const style = getComputedStyle(shell);
    const visible = [...shell.children].filter(child => !child.hidden);
    const chrome = visible.filter(child => child !== figure).reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
      + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.rowGap) * (visible.length - 1);
    const figureStyle = getComputedStyle(figure);
    const frame = parseFloat(figureStyle.paddingTop) + parseFloat(figureStyle.paddingBottom) + 2
      + figure.querySelector("figcaption").getBoundingClientRect().height + parseFloat(figureStyle.rowGap);
    const width = figure.clientWidth - parseFloat(figureStyle.paddingLeft) - parseFloat(figureStyle.paddingRight);
    const available = Math.max(0, window.innerHeight - (window.innerWidth <= 760 ? 16 : 32));
    const height = Math.min(available, Math.ceil(chrome + frame + width * image.naturalHeight / image.naturalWidth + 2));
    dialog.style.height = `${height}px`;
  }

  function render() {
    const { key, group } = pages()[step];
    dialog.dataset.guideGroup = String(group);
    const [title, description] = PAGES[key];
    byId("userGuideHeading").textContent = title;
    byId("userGuideDescription").textContent = description;
    byId("userGuidePosition").textContent = `${step + 1} / ${pages().length}`;
    routeSelect.value = route;
    topicRow.hidden = group !== 2;
    if (group === 2) topicSelect.value = key;
    previous.disabled = step === 0;
    next.disabled = step === pages().length - 1;
    for (const button of stepButtons) {
      if (Number(button.dataset.guideStep) === group) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    imageError.hidden = true;
    image.hidden = false;
    image.alt = `${title} — 실제 UI에 설명용 데이터를 넣은 화면`;
    // Image assets are requested only after the manual is opened, from this site's own origin.
    mobileImage.srcset = new URL(`./user-guide/${key}-portrait.png`, import.meta.url).href;
    image.src = new URL(`./user-guide/${key}-desktop.png`, import.meta.url).href;
    fit();
  }

  function open() {
    if (dialog.open) return;
    const context = guideContext(doc);
    route = context.route;
    step = pages().findIndex(page => page.group === context.step);
    if (context.step === 2) {
      const tab = byId("pilotTabButton")?.getAttribute("aria-selected") === "true" ? "pilot"
        : byId("weaponTabButton")?.getAttribute("aria-selected") === "true" ? "weapon" : "unit";
      step = pages().findIndex(page => page.key === tab);
    }
    render();
    dialog.showModal();
    opener.setAttribute("aria-expanded", "true");
    fit();
  }
  function close() { dialog.close(); }
  function move(delta) {
    const position = Math.max(0, Math.min(pages().length - 1, step + delta));
    if (position === step) return;
    step = position;
    render();
  }

  opener.addEventListener("click", open);
  byId("userGuideClose").addEventListener("click", close);
  dialog.addEventListener("close", () => {
    opener.setAttribute("aria-expanded", "false");
    opener.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  routeSelect.addEventListener("change", () => {
    if (!CASES.has(routeSelect.value)) return;
    route = routeSelect.value;
    render();
  });
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  topicSelect.addEventListener("change", () => {
    const position = pages().findIndex(page => page.key === topicSelect.value && page.group === 2);
    if (position < 0) return;
    step = position;
    render();
  });
  for (const button of stepButtons) button.addEventListener("click", () => {
    step = pages().findIndex(page => page.group === Number(button.dataset.guideStep));
    render();
  });
  dialog.addEventListener("keydown", event => {
    // Keep the editor's document-level shortcuts out of the open manual, including Escape and arrows on selects.
    event.stopPropagation?.();
    if (event.target?.tagName === "SELECT" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  image.addEventListener("error", () => { image.hidden = true; imageError.hidden = false; });
  image.addEventListener("load", fit);
  window.addEventListener("resize", fit);
  return { open, close };
}

if (typeof document !== "undefined") createUserGuide(document);
