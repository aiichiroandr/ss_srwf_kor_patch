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
  "srwf-f-20260814-v0-1-1": release(
    "v0.1.1",
    "v0.1의 누적 변경을 유지하면서 잘못된 KORPROL 프롤로그 helper gate를 현재 BOOT gate와 동기화해 새 게임 프롤로그가 한국어 경로를 사용하도록 바로잡은 핫픽스입니다.",
    [
      item({
        id: "protagonist-names",
        title: "주인공 8명 이름·애칭 표시 정리",
        description: "이미 한글화된 설명과 항목명은 유지하고, 일부가 일본어로 남거나 잘못 연결된 기본 주인공 8명의 이름·애칭 표시 경로만 한국어 데이터로 연결했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-protagonist-names-before.png",
          "AS-IS 기능 화면: 설명과 항목명은 한국어지만 헥토르의 이름과 애칭은 일본어로 남은 주인공 설정",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-protagonist-names-after.png",
          "TO-BE 기능 화면: 같은 설정에서 헥토르의 이름과 애칭도 한국어로 표시된 주인공 설정",
          330,
          240,
        ),
      }),
      item({
        id: "sortie-unit-pilot-names",
        title: "출격 목록 기체·파일럿명",
        description: "출격 목록의 대표 기체명과 파일럿명을 한국어로 표시하고 파일럿 풀네임의 띄어쓰기를 정리했습니다. 남은 고유명사는 계속 검수합니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-sortie-names-before.png",
          "AS-IS 기능 화면: 기체명과 파일럿명이 일본어로 표시된 출격 목록",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-sortie-names-after.png",
          "TO-BE 기능 화면: 대표 기체명과 파일럿명이 한국어로 표시된 출격 목록",
          330,
          240,
        ),
      }),
      item({
        id: "sortie-count-position",
        title: "출격유닛 선택 옆 NN기 위치 보정",
        description: "‘출격유닛 선택’에 붙어 있던 동적 유닛 수 NN기를 반각 한 칸 오른쪽으로 옮겼습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-sortie-count-before.png",
          "AS-IS 기능 화면 크롭: 출격유닛 선택 제목에 13기가 붙어 표시된 헤더",
          188,
          42,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-sortie-count-after.png",
          "TO-BE 기능 화면 크롭: 출격유닛 선택 제목과 13기 사이를 반각 한 칸 띄운 헤더",
          188,
          42,
        ),
      }),
      item({
        id: "preview-heading-translation",
        title: "F완결편 예고 제목 한글화",
        description: "일본어 예고 제목을 같은 카드 영역 안에서 한국어 ‘예고편’으로 교체했습니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-preview-heading-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 제목",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-preview-heading-after.png",
          "TO-BE: 한국어 예고편으로 표시된 F완결편 예고 제목",
          320,
          224,
        ),
      }),
      item({
        id: "preview-body-translation",
        title: "F완결편 예고 본문 한글화·확대",
        description: "일본어 예고 본문을 한국어로 바꾸고 15포인트 기준으로 키운 뒤 안전 여백 안에 다시 배치했습니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-preview-body-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 본문",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-preview-body-after.png",
          "TO-BE: 15포인트 한국어 문장으로 확대하고 줄을 다시 배치한 F완결편 예고 본문",
          320,
          224,
        ),
      }),
      item({
        id: "parts-window-width",
        title: "강화파츠 선택창 폭",
        description: "긴 파츠명과 설명이 잘리지 않도록 창 폭과 선택 바를 넓혔습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-parts-before.png",
          "AS-IS 기능 참고 화면: 긴 강화파츠 이름과 설명이 좁은 창에 표시된 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-parts-after.png",
          "TO-BE 기능 참고 화면: 강화파츠 창과 선택 바 폭을 넓힌 화면",
          330,
          240,
        ),
      }),
      item({
        id: "disconnect-confirmation",
        title: "절단 확인창 정리",
        description: "질문과 예·아니오 선택 영역을 분리해 문구와 프레임이 겹치지 않도록 정리했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-disconnect-before.png",
          "AS-IS 기능 참고 화면: 절단 질문과 선택 영역이 좁게 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-disconnect-after.png",
          "TO-BE 기능 참고 화면: 절단 질문창과 선택창 폭을 정리한 화면",
          330,
          240,
        ),
      }),
      item({
        id: "turn-end-boundary",
        title: "턴 종료 질문창 경계",
        description: "화면 오른쪽에서도 질문창이 감기거나 메뉴와 겹치지 않도록 위치와 폭을 보정했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-turn-end-before.png",
          "AS-IS 기능 참고 화면: 화면 오른쪽의 턴 종료 질문창이 경계와 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-turn-end-after.png",
          "TO-BE 기능 참고 화면: 턴 종료 질문창의 오른쪽 경계를 보정한 화면",
          330,
          240,
        ),
      }),
      item({
        id: "split-confirmation",
        title: "분리 확인창 여백",
        description: "분리 질문과 아니오 선택 바가 화면 경계에 붙지 않도록 안쪽 여백과 선택 폭을 맞췄습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/srwf-f-v0-1-split-before.png",
          "AS-IS 기능 참고 화면: 화면 끝에 붙어 있고 선택 바가 짧은 분리 확인창",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-f-v0-1-split-after.png",
          "TO-BE 기능 참고 화면: 분리 질문창과 선택 바 여백을 맞춘 화면",
          330,
          240,
        ),
      }),
    ],
  ),
  "srwf-final-20260814-v0-1": release(
    "v0.1",
    "F 완결편 첫 공개 시험판입니다. 시나리오 대사(SCEDATA)·전투 메시지(BMESS)·화자명 풀(TSR)·가라오케 자막(KARAOKE)의 내부 r013 작업본을 정품 Rev. A 전체 디스크 기반으로 조립했습니다. 콜드부트와 데모 전투 경로의 한글 표시를 확인했으며, 장시간 실플레이 검증은 진행 중입니다.",
    [
      item({
        id: "fin-battle-speaker",
        title: "전투 화자명·침묵 대사 한글화",
        description: "전투 데모의 화자명(인공지능 등)과 말줄임 대사가 한국어 데이터로 표시됩니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/srwf-final-v0-1-battle-speaker-before.png",
          "AS-IS: 화자명이 일본어(人工知能)로 표시된 전투 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-final-v0-1-battle-speaker-after.png",
          "TO-BE: 같은 장면에서 화자명이 한국어(인공지능)로 표시된 전투 화면",
          330,
          240,
        ),
      }),
      item({
        id: "fin-karaoke-caption",
        title: "가라오케 자막 한글화",
        description: "가라오케 모드 자막(겟타 드래곤 등)을 한국어로 표시합니다.",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/srwf-final-v0-1-karaoke-caption-before.png",
          "AS-IS: 가라오케 자막이 일본어(ゲッタードラゴン)로 표시된 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-final-v0-1-karaoke-caption-after.png",
          "TO-BE: 같은 자막이 한국어(겟타 드래곤)로 표시된 화면",
          330,
          240,
        ),
      }),
      item({
        id: "fin-battle-dialogue",
        title: "전투 대사 한글화",
        description: "전투 중 기합 대사와 외침이 한국어로 표시됩니다(료마의 샤인 스파크 등).",
        evidenceType: "included",
        asIs: image(
          "assets/patch-notes/srwf-final-v0-1-battle-dialogue-before.png",
          "AS-IS: 전투 대사가 일본어로 표시된 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/srwf-final-v0-1-battle-dialogue-after.png",
          "TO-BE: 같은 대사가 한국어로 표시된 화면",
          330,
          240,
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
