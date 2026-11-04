# 기존 B1 대사의 제한적인 길이 확장

2026-10-23. 구현: `assets/editor-scenario-dialogue.mjs`. 기존 `readScenarioDialogue`/`writeScenarioDialogue` API와 run별 ID·identity는 유지한다. 이 기능은 기존 B1 문구를 늘리며, 시나리오 명령·분기·발화를 임의로 추가하거나 삭제하지 않는다.

## 허용하는 행

일반 글자 run 중 다음 조건을 모두 만족한 것만 원래 byte 수보다 길게 쓸 수 있다.

- 확인한 B1 owner가 읽는 token-boundary FF 종료 전체 문자열이다. 미해석 토큰과 동적 F8/F9 삽입이 없다.
- 전체 문구 내부·FF 위치에 가능한 중간 참조가 없고, 같은 head를 가리키는 미확인 B1~B9 형태도 없다. 동일한 head를 읽는 확인 B1들은 함께 수정한다. 기존 root가 가리키는 문구는 이동하지 않는다.
- 원래 저장된 owner의 B1 opcode와 상대 operand가 확인본과 일치한다. 이벤트 wrapper가 바꾼 호출 위치는 추측해 고치지 않는다.
- 추가 위치가 모든 owner의 signed16 상대 참조 범위 안이다. 여러 문구를 동시에 추가해 뒤쪽 위치가 범위를 넘는 경우 writer가 거부한다.
- 전체 문구의 각 페이지가 108 emitted-byte 예산을 지키고, decoded 작업 공간·기존 압축 물리 slot에 들어간다.

row에는 `expandable`, `maxExpandedBytes`, `expansionReason`, `expansionTarget`을 추가했다. `maxBytes`는 원래 run 폭이며 identity도 원문 기준이다. UI의 행별 상한은 단독 수정 때의 페이지 예산이다. 여러 행의 같은 페이지를 동시에 늘리면 합산한 실제 writer 검사에서 거부될 수 있다. 물리 압축 slot의 잔여량도 최종 저장 때 확인한다.

일반 글자는 NFC/NFKC 단일 글자 별칭과 추가 glyphMap을 기존과 같이 사용한다. 일반 text 입력의 개행·F6/F7/F8/F9/FF 주입은 허용하지 않는다. 아래의 명시적인 다음 페이지 입력만 F7을 생성한다. 기존 F6/F7/FF를 보존한 채 바이트가 긴 run만 바꾼다. 짧은 기존 편집은 공백 `00`으로 원래 폭을 유지한다.

## 페이지 회계의 native 근거

기존 로컬 `fin_page_safety.py`의 108바이트 보수 예산과 토큰 종류를 재사용하되, 세 번째 F6의 소비 여부는 실제 양쪽 실행 코드를 다시 확인했다.

| 확인한 경로 | F | F 완결편 |
|---|---|---|
| 128바이트 스택 예약 | `0601C636`, `0601C71A` | `0601CC02`, `0601CD5E` |
| 개행 수 2와 비교 | `0601C84A`/`0601C84C` | `0601CE90`/`0601CE92` |
| 페이지 종료 때 consumed count +1 | `0601C8D4`/`0601C8D6` | `0601CF24`/`0601CF26` |
| F9/F6/F8/F7/FF/EA literal 연속 | `0601C8FA`~`0601C904` | `0601CF4A`~`0601CF54` |

24개 opcode/literal word를 실제 승인 BIN의 EXEC 0에서 대조했다. 세 번째 F6는 FF를 내고 source를 다음 바이트로 진행시킨다. 예전 Python 모델의 ‘F6 미소비’ 설명을 그대로 옮기지 않았다. JavaScript 모델은 세 번째 F6를 소비하며 페이지를 끝낸다. F6는 보수적으로 최대 2바이트, F7/FF는 종결자 1바이트, 일반 문자는 실제 인코딩 byte 폭으로 센다. 동적 F8/F9는 페이지 실제 길이가 실행 상태에 달려 있어 확장을 닫았다.

108은 게임의 절대 상한을 새로 알아냈다는 뜻이 아니다. 128바이트 스택 buffer를 넘기지 않도록 여유를 둔 기존 보수 작업 예산이다. 화면 한 줄의 시각적인 폭과도 다르다. 창에서의 자동 줄 배치·모든 대사 표시를 실게임으로 확인한 것은 아니다.

## append와 원복

한 run이라도 길어지면 그 owner의 **전체 FF 문자열**을 body 끝에 다시 만든다. 같은 문자열의 다른 수정 run도 함께 적용하고, 변경하지 않은 토큰과 기존 제어 코드는 그대로 복사한다. 원래 문자열 자리는 보존한다. 해당 문자열을 읽는 확인된 모든 B1의 `opcode+1` signed16 operand만 새 head로 바꾼다. 기존 root·다른 명령·화자 descriptor는 그대로다.

`SRWDIA02` footer는 원래 body 길이, 변경 run 개수, metadata 길이, physical body 번호, append 문자열 길이, 원래 B1 operand 원복 개수를 가진다. metadata에는 원문 body hash, 기존 run 원문과 사용자 문자열, offset순 operand 원복표가 들어간다. 재열기는 append 문자열과 trailer를 제거하고 run·operand를 원복한 뒤 원문 hash를 검사한다. 동일 요청으로 writer 전체를 다시 실행해 저장된 모든 바이트가 정규 출력과 같은지도 검사한다. 가짜 owner·부가 데이터·변조된 append·원래 operand·메타데이터는 거부한다.

원래 폭 안의 기존 수정에는 `SRWDIA01` 형식과 바이트 출력을 유지한다. 긴 수정 후 짧게 바꾸면 v1로 되돌아가고, 원문으로 되돌리면 해당 편집 기록을 없앤다. 별도 writable mask를 넓히지 않는다. 상위 archive는 대사 원복 뒤 기존 deadline/event 원복과 immutable provenance를 수행한다. 압축할 때 기존 물리 구간을 늘리지 않으며 `EDITOR_SCENARIO_GROWTH_UNSUPPORTED` 실패 정책도 유지한다.

## 확인한 범위

- 관련 대사·확장·페이지·archive/deadline 동시 편집 회귀 43건 통과. shared owner, 제어 토큰·glyph trail FF, 새 한글, signed16 경계, 페이지 합산·세 번째 F6, 원본 불변·정확 reset, 변조 거부를 포함한다.
- 합성 F/Final에서 긴 대사 + 배치 + event turn + deadline을 같이 저장하고 물리 재압축·새 scope 검사를 통과했다. 수치만 다시 편집해도 긴 문구가 유지되며 대사 원복 때 다른 편집이 남는다.
- 실제 F v0.5c의 3,189개 일반 run 중 442개, 실제 완결편 v0.3a의 7,851개 중 540개가 현재 정적 확장 조건을 통과했다. 이 수는 모든 행의 실제 압축 여유까지 보장하는 수가 아니다.
- 실제 F `1:11694`는 31→32바이트, 완결편 `3:10391`은 15→16바이트로 늘려 원래 물리 slot 재압축·재열기·원문 body 정확 원복·다른 physical body 불변을 확인했다. 전체 archive 크기와 원본 입력은 같게 유지했다.
- 실게임 진행·콜드부트·모든 대사 창 검사는 하지 않았다. 전체 BIN·CUE·상태·영상 덤프를 만들지 않고 작은 로컬 `story-font/dialogue-expansion.json`, `story-font/dialogue-page-native.json`만 남겼다.

## 동일 화자의 다음 페이지 추가

단일 B1 안에서 동일한 화자의 다음 페이지를 추가하는 writer도 구현했다. 원래 전체 문구에 F6/F7/F8/F9/미해석 토큰이 없고 위 전체-string relocation guard를 통과한 행만 `pagesEditable=true`다. `maxPages=4`, `maxPageBytes=107`, `pagesReadOnlyReason`을 함께 표시한다. 일반 길이 증가의 페이지 여유가 없더라도 각 페이지를 따로 나누어 넣을 수 있다.

요청은 `{recordIndex,pagesJson:'["첫 페이지","다음 페이지"]',identity?}`다. 문자열 배열 2~4개만 받으며 각 원소는 일반 본문이다. UI에서 추가한 빈 draft와 의도적인 빈 페이지도 허용한다. 각 페이지의 인코딩 길이 + 종결자 1이 108바이트 이내여야 한다. 입력 문자열 배열 사이에만 F7을 넣고 마지막에 원래 FF를 보존한다. 화자 descriptor·초상화·표정·VM 호출 수는 바꾸지 않는다. 다른 인물의 발화를 추가한 것처럼 표시하지 않는다.

`text`와 `pagesJson`을 한 요청에서 함께 전달하면 거부한다. 일반 `{recordIndex,text}` 재수정은 이전 페이지 모드를 덮어쓰며, text가 originalText이면 해당 편집을 완전히 제거한다. 읽기 row의 `pagesJson`은 없을 때 빈 문자열이고, 있을 때 정규화된 JSON이다. `text`에는 첫 페이지를 돌려준다. 상위 UI는 페이지 모드일 때 pagesJson만, 모드를 해제했을 때 text만 보낸다. `validateScenarioDialoguePages(row,'')`는 UI 모드 해제를 위해 valid를 반환하지만 writer에는 빈 pagesJson 대신 일반 text 요청을 보내야 한다.

페이지 편집이 하나라도 있으면 `SRWDIA03`을 쓴다. 전체 구조와 원복·해시·정규 재생성은 v2와 같고, 각 metadata run entry 앞에 종류/예약 4바이트를 추가해 일반 text와 pagesJson을 구분한다. 같은 body의 다른 일반 편집과 공존하며 페이지 수정 후 수치만 바꾸거나 재열어도 유지한다. 합성 F/Final에서 새 글리프·페이지·배치·기한을 함께 저장하고, 이후 수치만 재수정·글리프 유지 검증·페이지와 글리프 동시 원복까지 기존 scope를 유지함을 확인했다. 기존 v1/v2 읽기와 출력은 그대로다.

전용 페이지 회귀 7건과 통합 회귀는 F/Final 왕복·동일 B1 공유 owner·명시적 F7·일반 편집과 혼합·빈 페이지·배열/문자/예산 검증·일반 모드 복귀·v3 변조 거부를 포함한다. 실제 F 180행, 완결편 295행이 현재 정적 페이지 추가 조건을 통과했다. F `1:11858`과 완결편 `3:10391`에 기존 첫 페이지 + `가나` + 빈 마지막 페이지의 3페이지를 넣어 원래 압축 물리 slot 재압축·재열기·원문 정확 원복을 확인했다. 작은 근거는 `story-font/dialogue-pages.json`이다. 모든 지원 행의 저장 여유나 실게임 페이지 넘김을 검증한 것은 아니다.

## 아직 별도인 새 발화 이벤트 추가·삭제

새 화자·표정·B1 호출을 추가하려면 별도 호출 상태와 복귀 계약을 확정해야 한다. 기존 B1 5바이트를 signed16 jump로 바꾸고, append 영역의 B1 sequence 뒤 원래 `p+5`로 돌아오는 trampoline을 만드는 설계는 가능하다. 그러나 B1이 호출하는 공통 TSR group2/entry3의 상태, packed descriptor 의미, 모든 중간 진입 참조와 파서가 추적할 경계를 검증하기 전에는 제품 writer에 넣지 않는다.

빈 문구·빈 페이지는 현재 넣을 수 있으나 발화 이벤트 자체를 삭제한 것은 아니다. 실제 skip/delete도 B1을 jump로 건너뛰는 별도 변경이며, 중간 진입·caller 재개점·부수 상태를 확인해야 한다. 시나리오 합류·증원·루트·분기·후속 flag 편집은 이 대사 길이 확장 및 같은 화자 페이지 추가와 별개다.
