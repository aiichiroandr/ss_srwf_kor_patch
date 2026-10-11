// Event conditions are keyed by game and flag number, never by the selected ability's name.
// Record/code evidence and the limits of the walkthrough evidence: docs/EDITOR_FACTS.md#event-flag-conditions.
const SOURCE = "docs/EDITOR_FACTS.md#event-flag-conditions";
const SOURCED_NOTE = "화수·행동 조건은 공략 자료 기준입니다. 새턴판에서 해당 이벤트를 직접 실행해 확인하지는 않았습니다.";
const freeze = (info) => Object.freeze({ ...info, conditions: Object.freeze(info.conditions.map(Object.freeze)) });
const FINAL_FLAGS = Object.freeze({
  74: freeze({
    name: "명경지수 습득", summary: "54화 · 명경지수 습득", badge: "sourced",
    text: "도몬이 명경지수를 습득했는지 구분하는 조건입니다. 습득 이벤트와 전투 중 발동 조건은 다릅니다.",
    conditions: [
      { when: "통산 54화 · 완결편 20화", text: "「기아나 고지의 수행」을 클리어한 뒤 도몬에게 명경지수가 등록됩니다." },
      { when: "습득한 뒤 전투에서", text: "갓 건담에 탄 도몬의 기력이 130 이상이면 하이퍼 모드로 전환됩니다." },
    ],
    note: SOURCED_NOTE,
    how: "원본 도몬의 능력 79·저장 레벨 174와 게임의 레벨−100 플래그 검사로 번호 74를 확인했습니다. 습득 시점은 플레이 공략, 화수는 분기 순서표를 대조했습니다.",
  }),
  75: freeze({
    name: "근성 습득", summary: "근성 · 획득 조건 미확인", badge: "unknown",
    text: "원본에서는 노리코의 근성(거츠) 습득 여부를 구분합니다. 정확히 몇 화의 어떤 행동으로 켜지는지는 새턴판에서 확인하지 못했습니다.",
    conditions: [],
    note: "PS판의 우주 경유·지상 경유 차이에 관한 보고를 새턴판의 확정 조건으로 사용하지 않습니다.",
    how: "원본 노리코의 능력 82·저장 레벨 175와 게임의 레벨−100 플래그 검사로 번호 75의 용도를 확인했습니다.",
  }),
  76: freeze({
    name: "슈퍼 근성 습득", summary: "76화 · 슈퍼 근성 습득", badge: "sourced",
    text: "노리코가 슈퍼 근성을 습득했는지 구분하는 조건입니다. 아래는 습득 이벤트의 조건입니다.",
    conditions: [
      { when: "통산 76화 · DC 분기", text: "「더블 페이크」의 C 맵에서 4턴 적 페이즈까지 건버스터의 HP를 최대 HP의 20% 이하로 낮춥니다." },
      { when: "통산 76화 · 포세이달 분기", text: "「초대받지 않은 방문자」에서 건버스터의 HP가 20% 이하이고, 아군 기체 수가 적군보다 적으면 습득 이벤트가 일어납니다." },
    ],
    note: `${SOURCED_NOTE} 습득 후의 HP·SP 회복 판정은 별도이며 능력 효과 설명에서 확인할 수 있습니다.`,
    how: "원본 노리코의 능력 83·저장 레벨 176으로 번호 76을 확인했습니다. 맵·턴·HP 조건은 PS판 플레이 공략, 통산 화수는 분기 순서표를 대조했습니다.",
  }),
  166: freeze({
    name: "S²기관 획득", summary: "64화 · S²기관 획득", badge: "sourced",
    text: "초호기 S²기관 획득 조건입니다.",
    conditions: [
      { when: "통산 64화 · 완결편 30화", text: "지상 분기 「운명을 엮는 자들」 또는 에바 분기 「내가 나로 태어난 이유」에서 에바 초호기가 제14사도 제르엘의 공격으로 격추되면, S²기관을 흡수하는 이벤트가 일어납니다." },
      { when: "판정에 필요한 행동", text: "초호기를 격추한 상대가 제르엘이어야 합니다. 단순한 EN 고갈이나 다른 적에게 격추되는 것은 이 조건이 아닙니다." },
    ],
    note: `${SOURCED_NOTE} 번호를 입력하는 것은 이 이벤트를 실행하거나 세이브의 플래그를 켜는 동작이 아닙니다.`,
    how: "원본 초호기의 S²기관 슬롯에 번호 166이 있고, 새턴 실행 파일과 시나리오 명령에서 같은 번호의 설정을 확인했습니다. 화수·격추 조건은 분기 순서표와 플레이 공략을 대조했습니다.",
  }),
});

export function eventFlagInfo(gameId, flag) {
  if (!Number.isInteger(flag) || flag < 0 || flag > 255) return freeze({
    flag, name: "조건 번호 확인", summary: "0~255의 정수 입력", badge: "unknown",
    text: "조건 번호는 0~255의 정수로 입력합니다.", conditions: [], note: null, how: null, source: SOURCE,
  });
  if (flag === 0) return freeze({
    flag, name: "이벤트 제한 없음", summary: "이벤트 제한 없음", badge: "verified",
    text: "특정 시나리오나 이벤트를 기다리지 않고 능력 목록에 등록됩니다. 기력·HP·확률 등 능력 자체의 발동 조건은 그대로 적용됩니다.",
    conditions: [], note: "이 칸은 능력이 참조할 조건을 지정합니다. 세이브 데이터의 이벤트 진행 상황을 바꾸지는 않습니다.",
    how: "게임의 기체 능력 목록 구성 함수는 조건 번호 0이면 이벤트 비트 검사를 건너뜁니다.", source: SOURCE,
  });
  const known = gameId === "srwf-final" && Object.hasOwn(FINAL_FLAGS, flag) ? FINAL_FLAGS[flag] : null;
  if (known) return Object.freeze({ ...known, flag, source: SOURCE });
  return freeze({
    flag, name: `이벤트 ${flag}`, summary: "발동 시나리오·조건 미확인", badge: "unknown",
    text: `이벤트 플래그 ${flag}가 켜져 있어야 능력 목록에 등록됩니다. 이 게임에서 해당 번호가 켜지는 화수와 행동 조건은 아직 확인하지 못했습니다.`,
    conditions: [], note: "다른 게임의 같은 번호와 의미가 같다고 가정하지 않습니다. 번호를 입력해도 이벤트가 실행되거나 세이브 플래그가 켜지지는 않습니다.",
    how: null, source: SOURCE,
  });
}
