# 연속 B1 사이의 새 발화 코어 — 2026-10-23

사용자 우선순위가 ‘맵 특정 좌표의 기체 습득 이벤트’로 좁혀진 시점에, 이미 진행하던 새 발화 코어만 정합성까지 마무리했다. UI 노출·실제 BIN 재생성·게임 전체 실행을 새로 반복하지 않았다. 이 문서는 일반 시나리오 추가·삭제 기능을 완료했다고 주장하지 않는다.

## 허용 범위

기존 `readScenarioDialogue`가 확인한 B1 뒤에 서로 다른 파일럿의 발화를 최대4개 넣는다. 모든 공유 owner의 원래 다음 명령도 **확인된 B1**이어야 한다. 원문 descriptor가 같은 owner 묶음이며, 원래 파일럿과 추가 파일럿의 실제 FACE 블록이 검증된 `speakerOptions`가 필요하다. 원래 low2 초상화 변형과 bit15, 미확정 bits11..14는 그대로 쓴다. 새 파일럿에게 원래 변형 인덱스가 없으면 거부한다.

각 추가 발화는 일반 글자만 받으며 1페이지의 종결자를 제외한107바이트 예산을 쓴다. 없는 글자는 기존 글리프 자동 추가 결과를 `glyphMap`으로 받아 인코딩한다. raw VM 명령·제어 토큰·분기·새 화수·새 맵은 입력할 수 없다. 같은 화자 다음 페이지는 기존 `pagesJson` 기능이고 이 새 발화와 다르다.

원문 5바이트 호출 내부로 향할 수 있는 참조는 부정 검사로 거부한다. 알려진14개 header root의 BE32 참조뿐 아니라 header 뒤의 모든 정렬에서 signed16 상대 참조 후보, 모든 정렬의 상대32 후보와 알려진 RAM 주소 기반 절대 포인터 후보를 검사한다. 이 후보 scan은 쓰기를 막기만 하며 새 owner나 양성 편집 권한을 만들지 않는다. 오탐 때문에 일부 정상 지점이 읽기 전용일 수 있다. 원래 다음 명령을 해석하지 못했거나, 다른 검증된 wrapper가 B1 위치를 바꿨거나, signed16/RAM 예산을 만족하지 못하면 이유를 표시한다.

## API

shape parser는 `editor-dialogue-sequence.mjs`의 `readAfterDialogueJson`을 재사용한다. 실제 B1/FACE/인코딩/공유 owner 권한은 `editor-scenario-dialogue.mjs`에서 확인한다.

```js
{ recordIndex, afterDialogueJson: '[{"speakerId":71,"text":"도와줄게"}]' }
```

`text` 또는 `pagesJson`, 원문 화자 `speakerId`와 동시에 줄 수 있다. `text`와 `pagesJson`은 동시에 받지 않는다. 부분 요청은 나머지 필드를 보존한다. `afterDialogueJson:''` 또는 `'[]'`는 추가 발화만 없애고 원문 본문·페이지·화자 편집을 유지한다.

읽은 행은 다음 필드를 제공한다.

- `afterDialogueJson`: 원래는 빈 문자열이며 저장된 경우 정규 JSON 문자열.
- `afterDialogueEditable`, `afterDialogueReadOnlyReason`: 이 위치의 실제 허용 여부와 이유.
- `maxAfterDialogues:4`, `maxAfterDialogueBytes:107`.

`validateScenarioAfterDialogue(row, value, {gameId,glyphMap,speakerOptions})`는 `{valid,message,count,bytes}`를 반환한다. 실제 압축 슬롯 예산은 최종 저장 단계에서 기존 SCEDATA 압축기로 확인해야 한다.

여러 글자 run이 같은 B1을 공유하면 새 발화를 각 B1 호출 뒤 한 번씩 넣고 모든 관련 run에 같은 값을 표시한다. 같은 owner 뒤에 다른 목록을 요청하거나, 일부 owner만 변경해 다른 공유 행이 서로 다른 목록을 갖게 되면 거부한다. JSON을 반복 저장해 발화가 중복 누적되지 않도록 원문으로 정규화한 뒤 항상 같은 목록에서 다시 생성한다.

## 변환과 복귀

원래 B1을 덮는 byte는 첫3바이트뿐이다. `01`과 signed16 점프로 추가 영역에 진입한다. 추가 영역은 다음과 같다.

1. 원래 B1의 복제. 이미 선택한 본문·페이지·화자 편집을 사용한다.
2. 최대4개의 새 B1. 각 call은 검증한 파일럿과 새 일반 문구를 사용한다.
3. `01` signed16 점프로 원래 `owner+5`, 즉 원래 다음 B1으로 복귀한다.

01은 VM call stack을 늘리지 않는다. B1은 원래 helper를 통해 각 call의 다음 위치를 저장·복원한다. head→trampoline, 복제 B1→본문, 새 B1→새본문, 마지막 jump→원래 다음 B1의 signed16 범위를 각각 검사한다. 원래 데이터·다음 B1과 그 descriptor는 그대로 남긴다. 새 발화를 추가한 다음 원래 다음 B1에도 목록을 추가한 경우에도 각 head와 append record는 원래 자료에서 정해 생성된다.

네이티브 근거와 한정 실행 증명의 경계는 [B1 화자 계약](EDITOR_B1_SPEAKER_CONTRACT_20261023.md)에 있다. 실제 원래 연속 B1 사용과 실제 SH-2의 call/return 계약을 재사용하지만, 임의 이벤트 루프·새 callback·다른 시나리오 흐름을 안전하다고 일반화하지 않는다.

## SRWDIA05

기존 text/pages/speaker 출력은 원래 SRWDIA01~04 형식으로 먼저 만든다. 새 발화가 있을 때만 그 출력을 단일 SRWDIA05로 감싼다. 따라서 이전 metadata의 의미를 새 종류 번호로 재해석하지 않는다.

v5 추가 영역에는 trampoline 코드와 새 문구가 들어간다. payload는 내부 출력의 SHA-256, 행 offset과 정규 after JSON 목록, 원래 head 두 word의 원복 기록을 담는다. 32바이트 footer는 내부 길이·행 개수·payload 길이·물리 본문 번호·추가 데이터 길이·patch 개수를 기록한다. patch는 정렬·비중첩·범위·reserved0 규칙과8192개 상한을 지킨다.

정규화는 head를 복원해 내부 출력을 정확히 만들고 hash를 확인한다. 그 내부의 기존 v1~4를 정규화한 뒤, 합친 본문/페이지/화자/새 발화 요청 전체에서 **동일한 모든 바이트**를 다시 생성해야 성공한다. v5 안에 다른 v5를 중첩하는 출력은 허용하지 않는다. 기존 wrapper metadata와 원래 출처 검사는 계속 유지하며 전역 mutable mask는 넓히지 않는다. trusted FACE 목록 없는 변경본은 정규화하지 않는다.

## 집중 회귀

새 발화7건과 기존 대사·페이지·확장·화자 회귀를 합쳐38건이 통과했다. 새 검사에는 두 게임의 실제 VM 명령 형태 추적, 서로 다른 화자, 원래 다음 B1 복귀, 다른 byte 불변, 최대4개와 빈 입력, 본문·페이지·화자 합성, 독립 원복, 공유 owner 충돌, 다음 B1 미확정·후보 내부 참조·signed16·글자/초상화 예산 거부, v5 head/code/본문/metadata 변조 및 중첩 거부가 포함된다. 원본 디스크 없이 합성 fixture를 사용했으며 UI 또는 실제 게임 실행 검증으로 계산하지 않는다.
