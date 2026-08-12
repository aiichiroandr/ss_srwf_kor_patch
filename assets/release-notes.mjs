const image = (src, alt, width, height) => Object.freeze({ src, alt, width, height });

const item = ({ id, title, description, evidenceType, asIs, toBe }) => Object.freeze({
  id,
  title,
  description,
  evidenceType,
  asIs,
  toBe,
});

const release = (version, summary, items) => Object.freeze({
  version,
  summary,
  items: Object.freeze(items),
});

export const PATCH_NOTES = Object.freeze({
  "srwf-f-20260812-v1-1": release(
    "v1.1",
    "v1.0의 범위를 유지하면서 출격 수 간격, 턴 종료 확인창, 예고 본문 크기와 타이틀 메뉴 간격을 보완했습니다. RAM 시안은 후속 UI 작업 참고용입니다.",
    [
      item({
        id: "sortie-count-spacing",
        title: "출격 유닛 수 표기 간격",
        description: "‘출격유닛 선택’과 동적 기체 수 사이에 공백을 넣어 ‘선택 13기’처럼 또렷하게 구분했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v1-1-sortie-count-before.png",
          "AS-IS 기능 화면: 출격유닛 선택 문구와 13기 표기가 붙어 있는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-sortie-count-after.png",
          "TO-BE 기능 화면: 출격유닛 선택 문구와 13기 표기 사이에 간격을 둔 화면",
          330,
          240,
        ),
      }),
      item({
        id: "preview-body-size",
        title: "F완결편 예고 본문 확대",
        description: "예고 카드 다섯 장의 본문을 13pt에서 15pt로 키우고 안전 여백 안에 다시 배치했습니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/v1-1-preview-body-13pt.png",
          "AS-IS: 13포인트로 표시된 F완결편 예고 한국어 본문",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-preview-body-15pt.png",
          "TO-BE: 15포인트로 확대하고 줄을 다시 배치한 F완결편 예고 한국어 본문",
          320,
          224,
        ),
      }),
      item({
        id: "protagonist-names-inherited",
        title: "주인공 8명 이름 한글 표기",
        description: "v1.0부터 주인공 선택 화면의 기본 이름·애칭과 관련 표시 경로를 8명 모두 한국어 데이터로 연결했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v1-0-protagonist-names-before.png",
          "AS-IS 기능 화면: 일본어 기본 이름과 애칭이 표시된 주인공 설정 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-protagonist-names-after.png",
          "TO-BE 기능 화면: 한국어 기본 이름과 애칭이 표시된 주인공 설정 화면",
          330,
          240,
        ),
      }),
      item({
        id: "sortie-unit-pilot-names-inherited",
        title: "출격 목록 기체·파일럿명",
        description: "v1.0부터 출격 목록의 대표 기체명과 파일럿명을 한국어로 표시하며, 남은 고유명사·일본어 표기는 계속 검수합니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v1-0-sortie-names-before.png",
          "AS-IS 기능 화면: 기체명과 파일럿명이 일본어로 표시된 출격 목록",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-sortie-names-after.png",
          "TO-BE 기능 화면: 대표 기체명과 파일럿명이 한국어로 표시된 출격 목록",
          330,
          240,
        ),
      }),
      item({
        id: "parts-window-width",
        title: "강화파츠 선택창 폭",
        description: "긴 파츠명과 설명이 잘리지 않도록 창 폭과 선택 바를 넓히는 후속 RAM 배치안입니다.",
        evidenceType: "ram-reference",
        asIs: image(
          "assets/patch-notes/v1-1-ram-parts-before.png",
          "AS-IS: 긴 강화파츠 이름과 설명이 좁은 창에 표시된 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-ram-parts-after.png",
          "TO-BE 참고: RAM 변조로 강화파츠 창과 선택 바 폭을 넓힌 화면",
          330,
          240,
        ),
      }),
      item({
        id: "disconnect-confirmation",
        title: "절단 확인창 정리",
        description: "질문과 예·아니오 선택 영역을 분리해 문구와 프레임이 겹치지 않게 하는 후속 시안입니다.",
        evidenceType: "ram-reference",
        asIs: image(
          "assets/patch-notes/v1-1-ram-disconnect-before.png",
          "AS-IS: 절단 질문과 선택 영역이 좁게 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-ram-disconnect-after.png",
          "TO-BE 참고: RAM 변조로 절단 질문창과 선택창 폭을 정리한 화면",
          330,
          240,
        ),
      }),
      item({
        id: "turn-end-boundary",
        title: "턴 종료 질문창 경계",
        description: "오른쪽 끝에서도 질문창이 감기거나 메뉴와 겹치지 않도록 위치를 보정하는 후속 시안입니다.",
        evidenceType: "ram-reference",
        asIs: image(
          "assets/patch-notes/v1-1-ram-turn-end-before.png",
          "AS-IS: 화면 오른쪽의 턴 종료 질문창이 경계와 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-ram-turn-end-after.png",
          "TO-BE 참고: RAM 변조로 턴 종료 질문창의 오른쪽 경계를 보정한 화면",
          330,
          240,
        ),
      }),
      item({
        id: "split-confirmation",
        title: "분리 확인창 여백",
        description: "분리 질문과 아니오 선택 바를 화면 안쪽에 맞추는 후속 RAM 배치안입니다.",
        evidenceType: "ram-reference",
        asIs: image(
          "assets/patch-notes/v1-1-ram-split-before.png",
          "AS-IS: 화면 끝에 붙어 있고 선택 바가 짧은 분리 확인창",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-1-ram-split-after.png",
          "TO-BE 참고: RAM 변조로 분리 질문창과 선택 바 여백을 맞춘 화면",
          330,
          240,
        ),
      }),
    ],
  ),
  "srwf-f-20260810-v1-0": release(
    "v1.0",
    "시나리오·전투 문구와 주요 시스템 UI를 한글화하고 F완결편 예고 카드 일곱 장을 한국어로 다시 구성한 첫 공개판입니다.",
    [
      item({
        id: "protagonist-names",
        title: "주인공 8명 이름 한글 표기",
        description: "주인공 선택 화면의 기본 이름·애칭과 관련 표시 경로를 8명 모두 한국어 데이터로 연결했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v1-0-protagonist-names-before.png",
          "AS-IS 기능 화면: 일본어 기본 이름과 애칭이 표시된 주인공 설정 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-protagonist-names-after.png",
          "TO-BE 기능 화면: 한국어 기본 이름과 애칭이 표시된 주인공 설정 화면",
          330,
          240,
        ),
      }),
      item({
        id: "sortie-unit-pilot-names",
        title: "출격 목록 기체·파일럿명",
        description: "출격 목록의 대표 기체명과 파일럿명을 한국어로 표시하며, 남은 고유명사·일본어 표기는 계속 검수합니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v1-0-sortie-names-before.png",
          "AS-IS 기능 화면: 기체명과 파일럿명이 일본어로 표시된 출격 목록",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-sortie-names-after.png",
          "TO-BE 기능 화면: 대표 기체명과 파일럿명이 한국어로 표시된 출격 목록",
          330,
          240,
        ),
      }),
      item({
        id: "preview-heading-translation",
        title: "F완결편 예고 제목 한글화",
        description: "일본어 예고 제목을 같은 카드 영역 안에서 한국어 ‘예고편’으로 교체했습니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/v1-0-preview-heading-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 제목",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-preview-heading-after.png",
          "TO-BE: 한국어 예고편으로 표시된 F완결편 예고 제목",
          320,
          224,
        ),
      }),
      item({
        id: "preview-body-translation",
        title: "F완결편 예고 본문 한글화",
        description: "일본어 예고 본문을 한국어 문장으로 바꾸고 원래 카드 영역 안에 맞춰 배치했습니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/v1-0-preview-body-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 본문",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/v1-0-preview-body-after.png",
          "TO-BE: 한국어로 표시된 F완결편 예고 본문",
          320,
          224,
        ),
      }),
    ],
  ),
});

export function getPatchNotesForRelease(releaseId) {
  return Object.hasOwn(PATCH_NOTES, releaseId) ? PATCH_NOTES[releaseId] : null;
}

export function isSafePatchNoteAssetPath(value) {
  if (
    typeof value !== "string"
    || !/^assets\/patch-notes\/[a-z0-9][a-z0-9._/-]*\.(?:png|webp)$/.test(value)
    || /[\\%?#]/.test(value)
  ) {
    return false;
  }
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}
