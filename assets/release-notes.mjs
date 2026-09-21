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

export const F_V04_NOTES = release(
  "v0.4",
  [
    "1. 슈발츠의 기술 사용 중 멈춤 수정\n- ‘슈투름 운트 드랑’ 사용 시 화면이 암전되거나 게임이 멈추던 문제를 수정했습니다.",
    "2. 글꼴 3종 선택 지원\n- DOS thin 커스텀(기존 폰트), 갈무리11, Mona12 중 선택할 수 있습니다.",
    "3. 전투 대사 일부 번역 개선\n- 일부 오역과 어색한 표현을 다듬고 줄바꿈을 정리했습니다.",
    "4. 남아 있던 일본어 번역 보완\n- 일부 기체명, 분기 선택지, 확인 메시지와 이벤트 대사의 미번역 부분을 보완했습니다.",
    "5. 이름·용어 표기 일부 정리",
    "6. 기타 메뉴 명칭 소폭 개선",
    "7. 타이틀 로고, 시나리오 화수별 제목 이미지 개선",
    "8. 이용 시 참고사항\n- 아직 보완이 필요한 부분이 있으며, 발견되지 않은 게임 멈춤이나 글자 깨짐이 발생할 수 있습니다.\n- 원본이나 이전 패치에서 없던 오류가 이번 버전에 나타날 수도 있습니다.",
  ].join("\n\n"),
  [],
);

// Local r109 copy draft; deliberately not registered as a public release.
export const FIN_R109_V01_NOTES = release(
  "v0.1",
  [
    "1. 글꼴 3종 선택\n- DOS thin 커스텀(기존 폰트), 갈무리11, Mona12 중 선택할 수 있습니다.",
    "2. 전투 장면 OFF/ON 토글 기능 추가\n- 스피드업(커서 가속)에 배정한 버튼과 위쪽 방향키를 함께 누르면 전투 장면을 켜거나 끌 수 있습니다.\n- OFF로 바뀌면 정신기 ‘번뜩임’, ON으로 바뀌면 ‘필중’ 효과음이 재생되어 전환 여부를 확인할 수 있습니다.\n- 전투 장면 OFF 상태에서는 에바의 AT필드나 쇼우의 분신으로 피해를 막아도, 시스템상 피격으로 처리되면 피격 효과가 나올 수 있습니다. 이때 실제 데미지는 없습니다. 플레이 중 이상이 있으면 제보해 주세요.",
    "3. 세이브 이전과 불러오기\n- 에뮬레이터의 상태저장(세이브스테이트)은 다른 패치 버전에서 정상 동작하지 않을 가능성이 높습니다. 버전을 바꿀 때는 게임 내에서 저장한 본체 RAM·카트리지 RAM 세이브를 옮겨 사용하는 것을 권장합니다.\n- F 세이브를 인계하거나 기존 세이브를 불러올 때 주인공·연인의 이름이 잘못 표시되거나 로드되지 않으면 제보해 주세요. 세이브를 만든 게임이 일본어 원본인지, 한글 패치라면 어느 버전인지 함께 알려주세요.",
    "4. 주인공·연인 설정\n- F 세이브 인계 없이 새로 시작하면 주인공·연인의 이름 설정을 건너뛰고, 게임에 설정된 기본 인물 조합으로 진행합니다.\n- 주인공 초상은 변경할 수 있지만, 해당 화면의 이름은 가타카나로 표시됩니다.\n- 주인공·연인·기체의 이름 설정 화면은 개편 후 제공할 예정입니다. 그전까지 마이너 패치에서는 이름 설정을 건너뛰는 것을 원칙으로 합니다.",
    "5. 후반 주인공 기체의 이름 설정\n- 주인공 업그레이드 기체의 이름 설정 화면은 선택 팝업의 그래픽 개선과 화면 건너뛰기가 아직 적용되지 않았습니다. v0.2에서 반영할 예정입니다.",
    "6. 남아 있는 번역·화면 작업\n- 시나리오·전투 등의 대사에 미번역과 오역이 남아 있으며, ‘시라/실라’처럼 표기가 통일되지 않은 부분도 있습니다.\n- 옵션 화면, 인물도감, 로봇대백과, 가라오케의 한글화는 이번 버전에 반영되지 않았습니다.",
    "7. 이용 시 참고사항\n- 아직 보완이 필요한 부분이 있으며, 발견되지 않은 게임 멈춤이나 글자 깨짐이 발생할 수 있습니다.\n- 원본이나 이전 패치에서 없던 오류가 이번 버전에 나타날 수도 있습니다.",
  ].join("\n\n"),
  [],
);

export const FIN_R110_V01_NOTES = release(
  "v0.1",
  [
    "1. 글꼴 3종 선택\n- DOS thin 커스텀(기존 폰트), 갈무리11, Mona12 중 선택할 수 있습니다.",
    "2. 전투 장면 OFF/ON 토글 기능 추가\n- 스피드업(커서 가속)에 배정한 버튼과 위쪽 방향키를 함께 누르면 전투 장면을 켜거나 끌 수 있습니다.\n- OFF로 바뀌면 정신기 ‘번뜩임’, ON으로 바뀌면 ‘필중’ 효과음이 재생되어 전환 여부를 확인할 수 있습니다.\n- OFF 상태에서 방어할 때 방어 이펙트 뒤에 피격 이펙트가 한 번 더 나오던 문제를 수정해 방어 이펙트만 표시합니다.",
    "3. 세이브 이전과 불러오기\n- 에뮬레이터의 상태저장(세이브스테이트)은 다른 패치 버전에서 정상 동작하지 않을 가능성이 높습니다. 버전을 바꿀 때는 게임 내에서 저장한 본체 RAM·카트리지 RAM 세이브를 옮겨 사용하는 것을 권장합니다.\n- F 세이브를 인계하거나 기존 세이브를 불러올 때 주인공·연인의 이름이 잘못 표시되거나 로드되지 않으면 제보해 주세요. 세이브를 만든 게임이 일본어 원본인지, 한글 패치라면 어느 버전인지 함께 알려주세요.",
    "4. 주인공·연인 설정\n- F 세이브 인계 없이 새로 시작하면 주인공·연인의 이름 설정을 건너뛰고, 게임에 설정된 기본 인물 조합으로 진행합니다.\n- 주인공 초상은 변경할 수 있지만, 해당 화면의 이름은 가타카나로 표시됩니다.\n- 주인공·연인·기체의 이름 설정 화면은 개편 후 제공할 예정입니다. 그전까지 마이너 패치에서는 이름 설정을 건너뛰는 것을 원칙으로 합니다.",
    "5. 후반 주인공 기체의 이름 설정\n- 주인공 업그레이드 기체의 이름 설정 화면은 선택 팝업의 그래픽 개선과 화면 건너뛰기가 아직 적용되지 않았습니다. v0.2에서 반영할 예정입니다.",
    "6. 남아 있는 번역·화면 작업\n- 시나리오·전투 등의 대사에 미번역과 오역이 남아 있으며, ‘시라/실라’처럼 표기가 통일되지 않은 부분도 있습니다.\n- 옵션 화면, 인물도감, 로봇대백과, 가라오케의 한글화는 이번 버전에 반영되지 않았습니다.",
    "7. 이용 시 참고사항\n- 아직 보완이 필요한 부분이 있으며, 발견되지 않은 게임 멈춤이나 글자 깨짐이 발생할 수 있습니다.\n- 원본이나 이전 패치에서 없던 오류가 이번 버전에 나타날 수도 있습니다.",
  ].join("\n\n"),
  [],
);

export const PATCH_NOTES = Object.freeze({
  "srwf-f-20260915-v0-4-a": F_V04_NOTES,
  "srwf-f-20260915-v0-4-b": F_V04_NOTES,
  "srwf-f-20260915-v0-4-c": F_V04_NOTES,
  "srwf-final-20260921-v0-1-a": FIN_R110_V01_NOTES,
  "srwf-final-20260921-v0-1-b": FIN_R110_V01_NOTES,
  "srwf-final-20260921-v0-1-c": FIN_R110_V01_NOTES,

  "srwf-f-20260814-v0-1-1": release(
    "v0.1.1",
    "v0.1에서 한국어 프롤로그가 출력되지 않던 문제를 수정한 핫픽스입니다.",
    [
      item({
        id: "protagonist-names",
        title: "주인공 8명 이름·애칭 표시 정리",
        description: "이미 한글화된 설명과 항목명은 유지하고, 일부가 일본어로 남거나 잘못 연결된 기본 주인공 8명의 이름·애칭 표시 경로만 한국어 데이터로 연결했습니다.",
        evidenceType: "included-reference",
        asIs: image(
          "assets/patch-notes/v0-1-protagonist-names-before.png",
          "AS-IS 기능 화면: 설명과 항목명은 한국어지만 헥토르의 이름과 애칭은 일본어로 남은 주인공 설정",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-protagonist-names-after.png",
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
          "assets/patch-notes/v0-1-sortie-names-before.png",
          "AS-IS 기능 화면: 기체명과 파일럿명이 일본어로 표시된 출격 목록",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-sortie-names-after.png",
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
          "assets/patch-notes/v0-1-sortie-count-before.png",
          "AS-IS 기능 화면 크롭: 출격유닛 선택 제목에 13기가 붙어 표시된 헤더",
          188,
          42,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-sortie-count-after.png",
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
          "assets/patch-notes/v0-1-preview-heading-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 제목",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-preview-heading-after.png",
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
          "assets/patch-notes/v0-1-preview-body-before.png",
          "AS-IS: 일본어로 표시된 F완결편 예고 본문",
          320,
          224,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-preview-body-after.png",
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
          "assets/patch-notes/v0-1-parts-before.png",
          "AS-IS 기능 참고 화면: 긴 강화파츠 이름과 설명이 좁은 창에 표시된 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-parts-after.png",
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
          "assets/patch-notes/v0-1-disconnect-before.png",
          "AS-IS 기능 참고 화면: 절단 질문과 선택 영역이 좁게 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-disconnect-after.png",
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
          "assets/patch-notes/v0-1-turn-end-before.png",
          "AS-IS 기능 참고 화면: 화면 오른쪽의 턴 종료 질문창이 경계와 겹쳐 보이는 화면",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-turn-end-after.png",
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
          "assets/patch-notes/v0-1-split-before.png",
          "AS-IS 기능 참고 화면: 화면 끝에 붙어 있고 선택 바가 짧은 분리 확인창",
          330,
          240,
        ),
        toBe: image(
          "assets/patch-notes/v0-1-split-after.png",
          "TO-BE 기능 참고 화면: 분리 질문창과 선택 바 여백을 맞춘 화면",
          330,
          240,
        ),
      }),
    ],
  ),
  "srwf-f-20260815-v0-1-2": release(
    "v0.1.2",
    "v0.1.1의 프롤로그 제목 화면에서 발생하던 그래픽 깨짐을 수정한 핫픽스입니다.",
    [],
  ),
  "srwf-f-20260823-v0-3": release(
    "v0.3",
    "배포 전 전수 검사는 데이터를 기준으로 한 정적 검사입니다 — 시나리오 7,145행·전투 5,989행·격추 166행의 표시 폭을 계산으로 확인했고, 실제 게임 화면에서 돌려 보는 런타임 검수는 하지 않았습니다. 전투 대사 일부에서 폭 초과가 제보되어 확인하고 있습니다. 이 판은 엔딩 크레딧을 일본어 원본으로 되돌렸습니다 — 한글 크레딧 영상은 공개 패치 형식의 record 상한을 넘겨 담을 수 없었고, 다음 판에서 형식을 넓혀 다시 넣습니다.",
    [],
  ),
  "srwf-final-20260814-v0-1": release(
    "v0.1",
    "지금은 설치를 권하지 않습니다. 실제로 플레이하실 생각이라면 이 판은 건너뛰고 다음 판을 기다려 주세요. F 완결편은 F보다 검수가 한참 덜 됐습니다 — 콜드부트와 데모 전투 경로의 한글 표시만 확인했을 뿐, 장시간 실플레이·전 경로 완주·줄바꿈 전수 검수를 아직 하지 않았습니다. 시나리오 대사·전투 대사·화자명·가라오케 자막 일부를 정품 Rev. A 전체 디스크에 반영한 공개 시험판입니다.",
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

const SUMMARY_ONLY_RELEASE_IDS = new Set([
  "srwf-f-20260915-v0-4-a",
  "srwf-f-20260915-v0-4-b",
  "srwf-f-20260915-v0-4-c",

  "srwf-f-20260814-v0-1-1",
  "srwf-f-20260815-v0-1-2",
  "srwf-f-20260823-v0-3",
  "srwf-final-20260921-v0-1-a",
  "srwf-final-20260921-v0-1-b",
  "srwf-final-20260921-v0-1-c",
]);

export function getPatchNotesForRelease(releaseId) {
  return Object.hasOwn(PATCH_NOTES, releaseId) ? PATCH_NOTES[releaseId] : null;
}

export function isSummaryOnlyPatchNotesRelease(releaseId) {
  return SUMMARY_ONLY_RELEASE_IDS.has(releaseId);
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
