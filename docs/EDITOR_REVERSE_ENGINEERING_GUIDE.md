# F / F완결편 에디터: 조사와 막힘 대응

이 문서는 2026-09-23 작업 로그에서 실제로 발생한 반복을 줄이기 위한 지침이다. 모델의 성능을 보장하는 프롬프트가 아니다. Luna 계열은 에디터 작업 시작 전과 막혔을 때 반드시 읽는다. 다른 모델도 같은 절차를 권장한다.

## 먼저 지킬 완료 단위

기존 구현을 재사용한다. 한 항목은 **원본 데이터 읽기 → 실제 명칭/레코드 연결 → UI 표시 → 입력 유지 → diff → reset → 출력 재파싱**까지 이어져야 완료다. 캡처만 얻었다고 데이터 쓰기까지 검증됐다고 하지 않는다. 배포는 별도 요청 사항이다.

- `assets/editor-core.mjs`: 디스크/TSR 파싱, 레코드와 쓰기.
- `assets/editor-worker.mjs`: 브라우저 작업 전달.
- `assets/app.mjs`: 선택/입력/이미지/diff/reset/output.
- `assets/editor-runtime.css`: 게임 화면 내부 배치의 단일 수정 위치. `style.css` 끝에 보정 규칙을 계속 추가하지 않는다.
- `docs/LOCAL_EDITOR.md`, `tests/editor-core.test.mjs`: 현재 동작과 회귀 근거. 문서와 구현이 다르면 실제 코드를 확인한다.
- `manifest/releases.json`: 승인 이미지 식별 기준. 검사 통과를 위해 검증 완료 플래그를 조작하지 않는다.

## 오늘 로그에서 확인한 낭비와 대체 방법

세션: `~/.codex/sessions/2026/09/23/rollout-2026-09-23T08-47-05-01a0cb84-11a6-7812-ad01-28f836bf887b.jsonl`. 여러 모델/인용문이 섞여 있으므로 전체 호출 수를 특정 모델의 성과로 집계하지 않는다.

| 관찰한 문제 | 다음부터의 행동 |
|---|---|
| 광범위 검색이 minified JSON까지 출력하여 수백만 토큰 추정 출력이 잘림 | `rg --files`로 후보를 먼저 찾고 `rg -l`로 파일명을 좁힌다. 본문은 지정 파일에 `rg -n --max-columns 200 --max-columns-preview`를 사용한다. 대형 JSON/JSONL은 Python으로 필요한 키만 출력한다. |
| 오래된 문맥에 apply_patch를 반복하여 verification failed | 실패 즉시 해당 함수/선택자 주변을 다시 읽는다. 같은 패치를 재시도하지 않는다. |
| CSS 앞쪽에 수정해도 뒤쪽 같은 선택자가 덮어씀 | computed style과 선언 위치를 먼저 확인한다. 해당 규칙을 수정하고 중복은 제거한다. |
| 상태 문구 ‘불러옴’을 기다렸으나 실제 문구는 ‘승인 이미지 해시 일치’ | 준비 상태는 workspace 가시성과 입력 활성 상태로 판단한다. 문구는 진단에 기록한다. 기다림에는 timeout과 실패 캡처를 둔다. |
| 작은 CSS 변경마다 대형 BIN 재해시 | 같은 브라우저의 로드된 데이터를 유지하고 스타일시트만 갱신한다. 최종 검증에서는 새 세션/실제 BIN으로 다시 확인한다. |
| 입력 이벤트에서 패널 전체를 다시 그림 | DOM input을 유지하고 값/클래스/설명만 변경한다. 연속 입력, focus, selectionStart를 확인한다. |
| 요청한 CSS font-family가 실제 글꼴이라고 간주 | `document.fonts`와 CDP `CSS.getPlatformFontsForNode`로 실제 사용 폰트를 확인한다. fallback 캡처는 별개 폰트 검증이 아니다. |
| UI 도구의 native 잠금 오류를 localhost 금지로 확대 해석 | 서버 응답, URL/port, browser 연결, origin 권한을 각각 확인한다. 정상적인 로컬 headless 경로를 사용할 수 있다. 정책 차단을 우회하지 않는다. |

## 역공학: 한 번에 하나의 검증 가능한 질문

1. 찾는 값/레코드/게임 버전을 한 문장으로 적는다. 예: ‘세실리의 베어내기 명칭과 습득 레벨은 어떤 포인터에서 읽는가?’
2. 기존 해석기·TSRViewer·분석 스크립트에서 같은 용어/offset을 찾는다. 새 추측 파서를 먼저 만들지 않는다.
3. 원본 바이트 주소, endian, 길이, 참조 기준, 종료 조건을 함께 기록한다. **디스크 raw offset / ISO logical offset / 압축 해제 TSR offset / 런타임 RAM 주소**를 섞지 않는다.
4. 이름이 다른 레코드 2개 이상에서 검증한다. F에서 성공해도 F완결편에 동일 offset을 가정하지 않는다.
5. 쓰기는 구조/길이 보존과 재파싱까지 확인한다. 모르는 byte는 그대로 보존한다. 모르는 필드 이름을 임의의 게임 효과로 단정하지 않는다.
6. 두 번 같은 시도가 실패하거나 10분간 새 근거가 없으면 멈추고 ‘가설 / 관찰 / 반증 / 다음 최소 probe’를 네 줄로 적는다. 검색 범위를 넓히기 전에 기존 자산 위치와 좌표계를 재확인한다. 다른 확정 항목은 계속 구현한다.

## 재사용할 분석 자산과 알려진 구조

로컬 분석 프로젝트는 `~/Documents/260729_srwf_kor_v5`, `~/Documents/260702_srwfin_kor_v1`이다. 구 도구는 `~/Documents/260421_srwf_kor_v2_artifacts_20260423/external_reference/external/srw_g1_xrea/`에 있으며 `SRWF_TSRViewer_extracted/SRWF_TSRViewer.exe` 및 `research/tips.utf8.txt`를 우선 확인한다. 파일이 없으면 상위 폴더의 파일명 목록부터 찾는다.

- raw sector는 2352 bytes, user payload는 +16에서 2048 bytes. ISO extent는 logical LBA다.
- TSR 상대 포인터는 **포인터 셀 자신의 주소 + signed BE32 변위**. F완결편은 backward pointer/alias가 있으므로 root 순번을 물리 정렬 순번으로 바꾸지 않는다. 영역 끝은 다음 물리 unique offset으로 경계 처리한다.
- 현재 해석: root27 유닛,28 파일럿,29 무기. 명칭 root11 유닛,12 파일럿,14 무기,16 정신기,17 파일럿 특수능력,18 기체 특수능력. 새 버전은 파서 근거로 다시 확인한다.
- 기체 능력 ID는 record+38..41, 보조 byte는 +42..45. 보조값의 의미가 검증되지 않았다면 ‘효과값’으로 단정하지 않는다.
- 파일럿 기본부23 bytes, +5..8 성장 nibble, +9..10 지형, +11..22 전투 수치. +23부터 정신기 ID/레벨 pair, 최대6개. 00/01 빈 슬롯과 00/00 종료, 이후 skill pair 분기는 기존 파서/TSRViewer와 함께 확인한다. 특수능력 명칭은 root17의 ID−32 연결을 사용한다.
- **성장 nibble ≠ 베어내기 같은 특수능력**. 성장 공식 확인 없이 ‘레벨당 +n’으로 설명하지 않는다.
- skill ID가 정신기 구분 경계(47)를 넘나들면 레코드 해석 자체가 바뀔 수 있다. 슬롯 수 보존만으로 쓰기가 안전한 것은 아니다. 미확정 ID는 읽기 전용으로 둔다.
- 일본 자료의 특정 보정/연인 보정 설명은 ROM 주소 근거가 아니다. 특정지원 명칭이 존재하는 것과 인물별 방향/거리/보정 테이블을 찾은 것은 구별한다.
- 그림을 record index로 매핑했다면 **이름·그림·수치가 같은 기체인지** 별도 확인한다. 이미지가 잘 렌더링됐다는 사실만으로 연결이 맞는 것은 아니다.

## 실제 화면과 비교하는 방법

기준은 `260702_srwfin_kor_v1/tmp/fin_editor_r110c_ui_reference_20260923/`의 MC6 Q, MC6 Q→Q, MC7 Q 캡처다. 원본 전체330×240과 내부 패널 crop 좌표계를 구분한다. 현재 웹 내부289×222 비율을 전체330×240이라고 보고 오차를 계산하지 않는다.

패널 경계→글자 baseline/실제 ink bounds→그림 불투명 영역→선택영역 순으로 측정한다. CSS font-size만 비교하지 않는다. Lv99 런타임 수치를 ROM 기본 능력치와 직접 일치시켜서는 안 된다.

초록 경계는 원래 한 띠 안에 밝은 가로선 두 개가 있다. 이것을 중복으로 오인해 지우지 않는다. 문제는 인접 패널의 전체 띠 두 개 또는 부모+자식 프레임이 겹치는 것이다. 공유 경계는 한 패널만 소유하게 한다. 현재 SVG는 재구성 자산이며 ROM에서 추출한 원본이라고 부르지 않는다. 실제 자산을 쓰려면 사용자 BIN에서 세션 내 추출한다.

390×844,433×844,desktop에서 긴 이름·최대 숫자·수정/reset 버튼을 확인한다. 숨겨서 문제를 없애지 않는다. 목록/상세 전환으로 편집 정보에 접근할 수 있어야 한다.

## 반복 사용 가능한 브라우저 probe

`scripts/editor-probe.cjs`는 실제 로컬 BIN을 선택해 해시 검증 후 세 화면을 desktop/390/433에서 캡처하고 HP 수정·focus·reset을 확인한다. CLI의 `--playwright`와 `--browser`는 설치된 경로를 넣는다. 설치/다운로드를 자동으로 하지 않는다.

```sh
node scripts/editor-probe.cjs --bin=/absolute/approved.bin --out=/private/tmp/editor-check --game=srwf-f --playwright=/absolute/node_modules/playwright --browser=/absolute/browser
```

F완결편은 `--game=srwf-final`로 별도 실행한다. 보고서에는 status/errors/각 화면 크기/가로 overflow가 남는다. **이 probe는 export 바이트, 모든 입력, 폰트 유사도를 검증하지 않는다.** 그 검증은 별도 항목으로 남긴다. 실패하면 failure.png와 report.json부터 읽고 무작정 timeout을 늘리지 않는다. proprietary BIN/캡처/추출 자산은 저장소에 추가하지 않는다.

## 2026-09-23 재점검 후 남은 검증 항목

- F 승인 BIN에서 세실리의 정신기/특수능력 표시와 모바일 경계 정리는 실제 캡처로 확인했다.
- F완결편은 승인 해시/세 화면 렌더링/HP reset은 확인했으나, 선택한 파일럿이 이름 fallback과 0 능력치를 보였다. 빈 record인지 이름 테이블 연결 문제인지 조사 전에는 파일럿 의미 검증 통과라고 하지 않는다.
- 전체 테스트에서 102 pass / 7 fail: 정적 페이지·cache revision 계약, 다운로드 결과 식별, 완료 처리 계약, 패치노트 이미지 revision, 폰트 preview 기대값. 단순히 테스트를 느슨하게 바꾸지 말고 해당 계약의 의도와 현재 UI를 대조한다.
- `editor-core` 단독 테스트는 통과했지만 실제 편집 BIN 재파싱과 에뮬레이터 실행을 대신하지 않는다.
