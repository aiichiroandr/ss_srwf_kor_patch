# 조기 합류·신규 증원·대사·추가 글리프 재조사

2026-10-23. 제품의 신규 증원/이벤트 쓰기 권한은 변경하지 않았다. 이번 조사는 기존 분석·승인 이미지의 읽기·현재 JavaScript 파서를 사용했다. 에뮬레이터 실행, cold boot, 게임 자료의 저장소 반입은 하지 않았다.

## 이번에 새로 대조한 내용

### 합류는 맵 증원과 다른 생성 경로다

CA02는 맵 actor와 pilot/unit cache를 생성하지만 C7은 로스터의 pilot/unit을 만드는 경로다. 따라서 인터미션 조기 합류와 전투 중 증원을 같은 기능으로 구현해서는 안 된다.

| 네이티브 지점 | F RAM 주소 | F완결편 RAM 주소 |
| --- | --- | --- |
| C7 핸들러 | `0x0602B108` | `0x0602EA24` |
| C7의 로스터 생성 함수 | `0x0602D5B8` | `0x06031370` |
| 파일럿 생성 함수 | `0x0602A208` | `0x0602D7B4` |
| 128칸 파일럿 ID/빈칸 검색 | `0x0602A3E0` | `0x0602D98C` |
| C1.06 보조 파일럿 생성 | `0x06028600` | `0x0602B7A4` |
| C1.0B 파일럿 연결 | `0x06028904` | `0x0602BAA8` |

C7은 두 BE16을 읽는다. 첫 word는 파일럿 식별 값이고, 둘째 word는 하위 9비트 기체 ID와 상위 7비트 초기 레벨이다. 기존 UI의 읽기 힌트는 하위 ID만 보존하므로 조기 합류 writer의 근거로 그대로 재사용하면 레벨 정보가 빠진다.

이 표의 C7·로스터 생성·파일럿 생성/검색·C1.06·C1.0B 구간은 기존 stock disassembly와 최신 승인 F/Final EXEC의 실제 바이트가 같은지 대조했다. 이름 resolver처럼 후속 패치에서 본체가 다른 곳으로 이동한 함수를 stock 코드로 오인하지 않도록 분리했다.

생성 함수는 파일럿 빈칸을 먼저 만들고 기체의 128칸에서 첫 BE16이 0인 칸을 찾는다. F `0602A220..224` / Final `0602D7CC..7D0`은 파일럿 검색 함수에 **ID 0**을 전달한다. 기존 인물이 있는지 검사하는 호출이 아니다. C7 자체를 한 번 더 실행하면 기존 인물이 있다는 이유로 자동 중복 억제되지 않는다.

더구나 기체 칸 고갈은 파일럿 생성 뒤에 판정한다(F `0602D60C..632`, Final `060313C4..3EA`). 이 경로는 기체 생성 실패 시 이미 만든 파일럿을 되돌리는 일반 트랜잭션으로 취급할 수 없다. 새 C7 앞의 가드는 파일럿·기체 모두를 **생성 전에** 검사해야 한다. 후속 F native 재확인에서 변형·합체 연결 함수 `0602E524` 자체는 추가 기체를 만드는 allocator가 아니라 기존 기체 검색 `0602D02C`로 family 연결을 바꾸는 함수임을 확인했다. 따라서 해당 F C7의 직접 생성은 파일럿·기체 각 한 칸이지만, 기존 연결의 보존까지 임의의 기체에 부여하는 것은 별도 검증이다. Final 대응 함수 `060325C4`의 전체 side-effect를 이 F 재확인만으로 동일하다고 확대하지 않는다.

### 이데온의 실제 합류 묶음

기존 `readScenarioPilotAssignments`를 승인 F v0.5a와 Final v0.3a의 실제 SCEDATA에 적용했다. 읽힌 배정은 각각 98건 / 406건이다. 이것은 현재 문법으로 확인된 배정의 수이며 전체 등장·합류 수가 아니다.

Final에서 이데온 기체 #236 / 유우키 코스모 파일럿 #218의 C7은 다음 두 경로다. 화수는 기존 검증된 chapter binding을 사용했으며 선택 번호에서 계산하지 않았다.

| 해제 SCEDATA 본문 좌표 | 게임 자료 선택 번호 | 기존 화수 binding | C7 위치/값 |
| --- | --- | --- | --- |
| 물리 본문 34 | 131 | 완결편 28화, 우주 분기 | `+0xA2E`, pilot 218, unit word `0x64EC` = 기체 236 / Lv50 |
| 물리 본문 76 | 173 | 완결편 32화, 지상 분기 후반부 | `+0x1BEE`, 같은 기체/파일럿/Lv50 |

두 위치 모두 C7 직후에 C1.06과 C1.0B가 있다. 첫 경로는 파일럿 #219 생성과 #218/#219 연결을 포함한다. 따라서 **C7 5바이트만 건너뛰는 ‘이미 합류’ 기능은 충분하지 않다.** 보조 파일럿 생성·연결까지 포함한 묶음을 파악하고, 기존 로스터가 같은 구성으로 만들어졌는지 확인한 뒤 묶음 전체를 건너뛰어야 한다. 원래 대화·분기 플래그까지 모두 생략할지는 별도의 이야기 정책이다.

F 수치표에도 이데온 #236과 코스모 #218이 존재한다. 그러나 이번 검증된 C7 읽기로는 F에서 해당 배정이 나오지 않았다. F 후반의 원래 이데온 합류 이야기가 있다는 뜻으로 설명하지 않는다.

## 신규 맵 증원의 최소 구현 단위

기존 74칸 문제와 pilot 323 반례는 `EDITOR_SCENARIO_RESEARCH.md` 및 `EDITOR_SCENARIO_F_RUNTIME_PROGRESS.md`의 주소·실험을 유지한다. 후자의 F pilot 322 후보는 한 경로에서 게임 Save/Continue와 원래 5·6턴 대상을 보존했으므로 ‘기술적으로 전혀 불가능’이라고 볼 근거도 없다. 일반 기능을 열기 위한 남은 계약은 다음과 같다.

1. `assets/editor-scenario-spawns.mjs`는 계속 닫아 둔다. `tests/helpers/scenario-reinforcement-prototype.mjs`의 원시 CA 목록 과대 계수는 최대 점유 증명이 아니므로 권한 검사에서 재사용하지 않는다.
2. 첫 제품 후보는 F 물리 본문 1 / 원래 root4 entry 2122 / pilot 322 / unit 80 / AI 548의 **한정된 프로필**이다. callback, 시작 턴, 원래 사건으로 재합류하는 주소와 source/target hash를 프로필로 고정한다. 기존 pilot 323 후보는 제외한다.
3. actor 74칸(16바이트/첫 byte FF), pilot 128칸(12바이트/첫 word 0), unit 128칸(30바이트/첫 word 0)을 조회한다. F 포인터는 `060B207C/208C/2088`, Final은 `060B855C/856C/8568`이다. 살아 있는 아군/적 수를 세는 D3로 대체하지 않는다.
4. 여유 검사와 CA02 생성 사이에 VM yield를 넣지 않는다. 기존 사적 `FQ02 → F4 → CA02` 형태는 이 조건에 맞지만, 원래 후속 생성의 예약량과 ID lookup 충돌까지 보증하지 않는다.
5. 추가 pilot ID가 기존 모든 확인된 직접/간접 lookup의 대상에 끼어들지 않는지 별도로 검사한다. 같은 종류라도 첫 cache/actor 일치를 쓰는 명령은 생성 순서가 결과를 바꾼다.
6. 미래 원래 할당의 최대 점유/예약량, helper 상주성·FC 원래 반환, 실행 파일/IP 변경의 출처, callback·GameSave 재개를 각각 닫은 뒤에만 UI→JSON→BIN→새 세션 재열기를 연결한다. actor 할당 실패 뒤 FF를 인덱스로 쓰는 원본 생성 함수를 그대로 두고 사용자 ‘검증’ 체크로 허용하지 않는다.

## 조기 합류에서 ‘이미 합류’ 판정의 주의점

현재 제품 조건의 C0.11은 **현재 맵에서 해당 파일럿을 참조하는 actor 검색**이다. 미출격·모함 격납·등록됐지만 맵에 없는 인물은 부재일 수 있다. 이 결과를 ‘아직 동료가 아니다’로 바꾸어 C7을 실행하면 중복 등록될 수 있다.

최소 기능은 특정 기체 패밀리 하나를 대상으로 로스터의 full pilot ID, unit ID, 연결 구성과 진영을 직접 확인하는 별도 읽기 조건이다. ‘미합류/완전한 동일 구성/일부 구성만 존재/동일 인물의 다른 기체’ 네 경우를 구별하고, 뒤의 두 경우는 생성하지 않아야 한다. 최종 합류 지점의 C7·C1.06·C1.0B 묶음, 관련 플래그, 대화와 강제 출격의 소비까지 묶어 프로필로 관리한다. 일반 ‘시나리오 skip flag’ 하나로 전체 이야기를 자동 교정하는 기능은 아직 근거가 없다.

## 대사 편집·추가·삭제

기존 번역 도구는 활용할 수 있다. `fin_scedata_relocation_experiment.py`에는 B1/B3/B4의 5바이트 owner와 signed16 상대 참조, `fin_r100_scenario_near_record_plan.py`에는 FF 종료 전체 레코드의 길이 보존 이동과 실제 consumer head 대조가 있다. 텍스트 재인코딩만 필요한 문제는 아니다. F6/F7 페이지 처리·동적 삽입 이름·중간에서 읽는 별칭·speaker prefix를 보존해야 한다.

기존 B1 네이티브 핸들러(F `0601BA2C`, Final `0601BFC8`)는 바로 문자열을 그리지 않고 공통 TSR 스크립트 group2/entry3을 호출한다. 따라서 B1 바이트를 추가했다고 새 대화 이벤트의 호출/복귀·화자·표정 계약이 완성되는 것은 아니다.

다음 구현 순서는 (1) owner가 확정된 기존 문구의 읽기 전용 목록, (2) 같은 토큰 길이 안에서 일반 글자만 바꾸는 제한 편집, (3) 정확한 내부 참조·signed16·페이지 예산을 지키는 문구 확장, (4) 별도로 닫힌 callback에 새 발화 추가다. 이벤트 삭제는 기존 상대분기·호출 재개점이 삭제 범위 안을 가리키면 거부해야 하며, 문구를 빈 문자열로 만드는 것과 이벤트 삭제를 구분해야 한다. 원래 이야기 전체를 자동 재구성하는 writer는 아직 만들지 않았다.

## 없는 글자만 추가하는 아이디어의 실제 여유

추가 bitmap 생성기는 이미 있다. F 제작 도구 `glyph_dos_thin_composer.py`는 원래 DOS-thin BDF의 16×16 글자를 합성하며, Final 제작 도구의 `raster_fullwidth`는 Galmuri/Mona에 쓰는 32바이트 셀을 만든다. 따라서 생성 자체를 처음부터 연구할 필요는 없다. 웹에 옮기려면 글꼴 배포 권리·같은 픽셀 생성·기존 a/b/c 구분을 별도로 처리해야 한다.

이번에 최신 6개 승인 TSR 해제본의 root36을 실제 대조했다. 모두 2,816×32 = 90,112바이트다. 추가 슬롯 조사는 EC00..F5FF로 한정했다. F의 현재 글자에는 EB 영역도 있으므로 Final의 저대역 회피 규칙을 F의 기존 글자 판정으로 일반화하지 않는다.

| 계열 | EC00..F5FF 중 잉크가 전혀 없는 셀 |
| --- | --- |
| F v0.5 a/b/c | 각각 **7칸** |
| Final v0.3 a | **202칸** |
| Final v0.3 b/c | 각각 **198칸** |

이 수는 예약 가능한 칸 수가 아니다. F의 EEFF는 지형 이름표 root20에서 padding으로 반복 사용되고, F030은 정신기 이름표 root16 #54가 읽는다. Final의 F2E2도 지형 이름표 padding으로 쓰인다. 기존 텍스트/제어/이미지를 토큰 타입으로 구분하지 않은 raw pair 검색은 반대로 명령/그림을 글자 참조로 잘못 셀 수 있다. Final pilot legacy 판독표의 글자 수 역시 실제 atlas의 현재 잉크 수가 아니다.

과거 glyph-cell registry의 62칸 재할당은 짧은 1~2글자 UI 참조 누락으로 철회됐다. 최소 30칸이 현역임을 뒤늦게 발견했으므로 ‘문자표에 없다’나 ‘긴 문장 검색에 안 나온다’를 새 glyph 허가로 사용하면 안 된다.

첫 추가 대상은 Final의 a/b/c 공통 all-zero 셀 중 **모든 확인된 출력 경로에서 padding도 아니고 문자로도 읽히지 않는 칸**이다. 이를 font variant·주소·기존 셀 hash·Unicode mapping에 고정하고, 신규 문자만 배정하는 되돌릴 수 있는 manifest를 내보내야 한다. F는 고작 7칸 중 현역 공백 사용도 있으므로 같은 방식의 충분한 예약 풀이 있다고 아직 말할 수 없다. 세이브 단독으로 새 bitmap을 추가할 수 없다는 제한은 유지한다.

## 이번에 발견한 이름 입력 코덱 문제

Final 일반 글꼴과 오래된 파일럿 이름 판독표는 다른 코드 배정이다. 현재 신규 세이브 이름을 legacy 표로 역인코딩하면 실제 root36에서 빈 셀인 코드가 선택될 수 있다. 예를 들어 legacy의 ‘경’ F2E2는 위 padding 칸이고, 현재 일반 글꼴의 같은 글자는 다른 코드다. v0.3a 기준 현재 hero 인코더가 선택하는 한글 가운데 202개가 이 경우이며 무기 인코더는 0개였다.

최신 실제 v0.3a EXEC에서 `0601D05C`는 `20289B58`로 점프한다. 이 shared helper는 기존 R075 resolver를 먼저 실행하고 불일치 때만 R100/R101의 옛 alias 추가 matcher를 실행한다. 따라서 R068의 옛 본체 주소만으로 최신 실행 경로를 설명하지 않는다. R075의 8명 stock/승인 legacy full-name 정확 일치는 계속 새 한글행으로 연결되며 custom mismatch는 입력 14바이트 포인터 그대로 T=0으로 돌아간다.

기존 `fin_r100_name_machine.py`의 bounded SH-2 실행기를 전체 번역 빌드 의존성 없이 상수 context만 주입해 재사용했다. 실제 승인 EXEC a(`17c8bbf0…`)와 실제 a/b/c TSR의 현재 코드 바이트를 실행했다. 8명 × stock/legacy/custom × 본인/애인 × 3폰트 = **144건**에서 stock/legacy 96건은 정확한 expanded row(+32)를 반환(T=1), 현행 글꼴로 쓴 custom 48건은 원래 live full-name pointer를 반환(T=0)했다. PR·SP·보존 레지스터 검사도 유지했다. 이것은 실제 바이트를 합성 메모리에서 실행한 근거이며 게임 화면 검증은 아니다.

최소 수정은 신규 세이브 이름을 현행 일반 글꼴로 인코딩하고, 판독에서는 저장 얼굴 ID로 한정한 8명 stock/legacy full-name의 정확한 fingerprint를 먼저 확인한다. 일치하지 않으면 현행 문자표로 읽고, 그 표로 해독할 수 없는 기존 이름만 legacy 표로 읽는다. 기본 이름 fingerprint는 a/b/c에서 같음을 확인했으며, FF 뒤 padding을 강제로 일치시키지 않는다. 기존 `hero` legacy codec와 무기 codec는 변경하지 않는다.

실제 56슬롯 BCR의 메모리 복사본에서 첫 슬롯 주인공을 ‘경미나’, 애인을 ‘아무로’로 바꿔 다시 열었다. 같은 승인 BIN을 실제 inspector로 재파싱해 사용한 6개 글자 코드가 root36에서 모두 잉크를 갖는지 확인했다. 변경 28바이트는 두 14바이트 이름 필드와 체크섬 안에만 있고, 다른 세이브/얼굴 정보/입력 파일 SHA는 그대로다. 이것은 글꼴 참조·직렬화·체크섬 근거이며 게임 내 이름 표시 검증은 아니다. 사적 evidence는 `actual-save-glyph-audit.json`과 `actual-name-machine-audit.json`이다.

## 후속 한정 검토: 웹에서 기존 대사 읽기 전용 목록

최소 기능은 **현재 명령 경계로 도달한 B1의 텍스트 참조 보기**다. 전체 대사/화자/이야기 실행 순서라고 표시하지 않는 조건에서 지금의 파서 자산으로 시작할 수 있다. 제품 파일은 이번 한정 검토에서 수정하지 않았다.

- `assets/editor-scenario-display.mjs`의 `displayCommand`/`readScenarioDisplay`는 root4/5의 분기·동일 본문 호출·명령 겹침·budget/frontier를 관리한다. `DISPLAY_INSTRUCTION_LENGTHS`는 B1/B3/B4=5, B6=8을 구분한다. B1을 만났을 때 marker, operand=marker+1, target=operand+signedBE16를 별도 읽기 전용 row에 붙일 수 있다. map 추론/기존 writer mask와 분리해야 한다.
- 실제 Final v0.3a SCEDATA를 현재 grammar와 같은 root4/5 경계로 탐색한 한정 probe에서 B1 참조 **1,838개**가 나왔다. 전부 본문 안의 target과 token-boundary FF 종료를 가졌고, 최대 읽기 길이는 428바이트였다(한 참조 최대 4,096바이트/2,048토큰 제한). 이 범위에 F6/F7 1,568개·F8/F9 1개가 포함됐다. 미해석 경계는 163개 남았다. 실제 `readScenarioDisplay`로 103개 본문을 별도 검사했을 때 명령 겹침/budget 실패는 0이었다. 이 수는 sealed owner 전체 수·유일 문구 수·실제 실행 횟수가 아니다.
- 문자열 프레이밍은 `fin_page_safety.runtime_tokens`와 `fin_scenario_popup_layout.runtime_tokens_to_terminator`의 의미를 그대로 옮겨야 한다. F6/F7은 1바이트, F8/F9는 인수 포함 2바이트이며 다른 `>EA` 문자는 2바이트다. `assets/editor-text-codec.mjs`는 이름용이므로 F6/F7/F8/F9가 있는 대사를 그대로 맡기면 안 된다. 동적 삽입은 값을 꾸며 넣지 않고 원래 인수와 함께 placeholder로 표시한다. 모르는 글자도 삭제하지 않고 코드 표시로 남긴다.
- `fin_scedata_typed_owner_audit.load_owners`와 `fin_r099_scedata_alias_closure.known_consumers`는 과거 sealed pre/post root 17,270개와 R072 68개를 합친 **17,338개**의 owner 식별자를 관리한다. 이 TSV들은 현재 로컬의 문서상 경로에 없고 R099 부모에 묶여 있으므로 숫자를 현재 에디터 전체 지원 범위로 옮길 수 없다. 전체 owner 표시를 하려면 원장을 복구한 뒤 최신 승인 SCEDATA의 marker/폭/target/소비문자열을 다시 고정해야 한다.
- 화자·얼굴은 B1 뒤 descriptor를 단순 pilot ID로 읽지 않는다. `fin_scedata_typed_owner_audit.PARAMETER_CONSUMERS`의 B3 packed descriptor/B6 parameters/shared bitfields와 별도 consumer 계약이 필요하다. 텍스트 안의 `이름「…」` prefix가 보인다는 사실과 실제 얼굴/표정 배정은 구분한다. B6/B9·중간 문자열 진입·선택지 테이블·root0/다른 callback은 첫 최소 목록에서 제외한다.

따라서 첫 구현의 row는 `본문/루트/명령 위치/참조 target/읽은 토큰·페이지/미해석 표시`면 충분하다. 대사 추가·삭제·길이 변경·증원/합류 flag·실제 실행 순서 편집 권한은 붙이지 않는다. F도 같은 방식의 별도 실제 opcode/토큰 대조가 필요하며 Final 1,838개 결과를 F의 지원 근거로 쓰지 않는다.

## 후속 구현: 기존 B1 일반 글자 구간의 제한 편집

사용자의 후속 구현 지시에 따라 위 최소 범위를 실제 writer까지 연결했다. `assets/editor-scenario-dialogue.mjs`는 root4/5에서 기존 명령 문법으로 도달한 B1만 읽는다. F/Final의 실제 메모리 표본은 각각 B1 owner 966/1,838개, 일반 글자 구간 3,189/7,851개, 초기 편집 가능 구간 2,705/6,302개다. 전체 대사·이벤트·화자 원장이 아니며 `coverage.complete`는 계속 false다.

편집 단위는 제어 토큰 사이의 일반 글자 run이다. `F6/F7`, 인수를 포함하는 `F8/F9`, token-boundary `FF`와 미해석 코드는 그대로 보존한다. 두 byte 글자의 뒷 byte가 FF인 경우 종료로 오인하지 않는다. 확인된 B1 참조와 원래 root, 보수적인 내부 참조 guard가 구간 중간을 가리키면 원래 글자 경계에서 분리하며, 글자 중간 진입·해석 충돌·미해석 glyph는 읽기 전용이다. raw B1..B9 패턴 검사는 쓰기 권한을 만들지 않으며 정상 run을 보수적으로 차단할 수 있다.

첫 구현은 원래 run의 byte 폭 이내에서만 인코딩했다. 후속 구현은 확인된 B1 문자열의 길이 확장과 같은 화자 2~4페이지를 지원한다. [확장·페이지 구현과 범위](EDITOR_DIALOGUE_EXPANSION_20261023.md)를 참조한다. 짧은 문구 뒤는 확인된 공백 `00`으로 채운다. 새 VM 발화·화자·표정 추가, 대화 이벤트 삭제 권한은 아직 없다. 기존 이벤트/기한 wrapper는 먼저 정확히 정규화한 본문에서 B1 owner를 확인하고, 실제 stored 본문의 해당 글자 bytes가 같은지도 대조한다.

`SRWDIA01` trailer는 canonical 본문 SHA-256, 변경 run의 원문 bytes·식별 좌표·현재 UTF-8 문자열을 보존한다. 읽을 때 원문을 복원하고 동일한 writer로 전체 출력을 재생성해 대조한다. 이 자체 해시는 출처 권한이 아니며 복원된 본문은 기존 scenario scope 해시를 반드시 통과해야 한다. F `0x8000`, Final `0x9000`의 작업 공간 제한 및 원래 압축 body span은 그대로다. 추가 기록이 맞지 않으면 출력하지 않는다.

SCEDATA 연결은 `inspectScenarioScopes`/`repackScenarioDeployments`에서 대사를 복원한 뒤 기존 event/deadline 정규화를 수행한다. 원래 `rawArchive`는 실제 stored bytes를 보존하고, 반환된 `dialogues`는 현재 문자열과 canonical `originalText`를 함께 제공한다. 대사 저장은 이전 차이와 이번 요청을 병합한다. 빈 요청은 기존 차이를 보존하고, `originalText`의 명시 제출은 해당 차이를 제거한다. 직접 writer의 `replace:true`는 전체 snapshot이다. 기존 placement/turn/objective/phase 수정을 함께 저장해도 대사와 canonical scope를 보존한다.

`glyphMap`은 목표 글자표, 선택적인 `sourceGlyphMap`은 기존 저장 대사의 판독표다. 추가 glyph를 지우면서 같은 요청에서 원래 대사로 돌리는 경우 두 표를 분리한다. 여전히 사용 중인 glyph 제거는 거부한다. 글꼴 자체의 추가·이름 writer·UI는 별도 모듈의 검증을 사용하며 이 대사 writer가 빈 글꼴 칸을 임의로 허용하지 않는다.

`tests/editor-scenario-dialogue.test.mjs`, `tests/editor-scenario-dialogue-integration.test.mjs` 및 기존 archive/deadline/export 묶음 **40개**가 통과했다. 합성 F/Final에서 대사+새 glyph 참조+배치+턴+기한 동시 저장, 새 파싱, 부분 재수정/원복, source/target glyph map 분리, 원래 압축 span 부족과 허위 trailer/루트 변경 거부를 확인했다. 실제 ROM 검사는 사적 메모리 Blob으로 수행하며 전체 BIN을 디스크에 저장하지 않는다. 게임 화면·장기 플레이 검증은 이 근거에 포함하지 않는다.

승인 F v0.5a와 Final v0.3a의 실제 BIN에서도 `inspect → 대사+힣 bitmap+무기명 수정 → export Blob → 새 inspect → 배치 숫자만 재수정 → 새 inspect`를 확인했다. F는 `힣=ED6D`/대사 `14:7506`, Final은 `힣=F327`/대사 `10:10771`를 사용했다. 두 게임 모두 대사·무기명·추가 글자표와 기존 scenario scope를 보존하고, 사용 중인 글자를 글꼴에서 제거하는 요청은 `EDITOR_DIALOGUE_INVALID`로 거부했다.

F는 대사·무기명을 원래대로 돌리며 추가 글꼴도 지운 출력까지 새로 열어, decoded TSR이 승인 원본과 정확히 같음을 확인했다. Final의 같은 원복 요청은 대사 archive 복원까지 성공했으나 TSR 재압축이 **216,338바이트 > 원래 ISO slot 215,040바이트**라서 `EDITOR_TSR_GROWTH_UNSUPPORTED`로 출력하지 않았다. 이 용량 한계를 우회하거나 전체 BIN을 확대하지 않았다. 사적 근거는 `actual-editor-dialogue-srwf-f.json`/`actual-editor-dialogue-srwf-final.json`이다. 원본 파일 크기·수정 시각은 그대로이며, 생성한 BIN은 디스크에 기록하지 않았다.

이후 core의 재압축 경로를 보완한 후속 실제 Final 재검사에서는 같은 동시 원복이 **209,948 / 215,040바이트**로 들어갔다. 새 inspector에서 대사·무기명·glyph 제거와 decoded TSR 원본 일치를 다시 확인했다(`actual-editor-reset-fixed-srwf-final.json`). 위 압축 초과는 최초 검사 때의 관찰이며 현재 남은 실패로 세지 않는다.

## 후속 구현: 기존 C7 합류의 초기레벨

기존 배정 reader의 98/406행에는 C2.06 배정도 포함돼 있었다. opcode를 다시 대조한 **C7만의 수는 F 86행, Final 382행**이다. `assets/editor-scenario-roster-levels.mjs`는 이 기존 C7을 시나리오·파일럿·기체·현재 초기레벨로 표시하고, 초기레벨 1..99만 수정한다. 원래 레벨 0/100 이상·다른 packed pilot 형식·body0 debug 설정은 쓰지 않으며, 원본 일본어 stock 레이아웃은 읽기 전용이다. 합류 시점·기체·파일럿·C2.06은 바꾸지 않는다. C1.06의 별도 보조 파일럿 레벨까지 바뀌는 기능도 아니다.

필드 근거는 native 로스터 생성 함수다. F `0602D5D8..EA` / Final `06031390..A2`는 둘째 word를 unsigned `>>9`로 추출해 파일럿 생성자에 넘기고, F `0602A248`에서 그 값을 파일럿 slot의 +2 byte에 저장한다. writer는 따라서 C7 시작 +3 byte의 `FE` 비트만 바꾸고 하위 기체 ID의 첫 비트는 보존한다. 파일럿/기체의 생성 수·명령 길이·분기·루트·물리 span을 늘리지 않는다.

원래 anchor SHA에는 초기레벨도 포함돼 있어 단순 변경 후에는 anchor 행이 사라질 수 있었다. 기존 full SHA가 승인 실제 본문과 같음을 먼저 대조한 뒤, C7+3의 FE 비트만 지운 `levelMaskSha256`를 anchor metadata에 추가했다. 변경 후 reader는 5byte stride·C7 opcode·레벨 1..99·masked SHA를 모두 확인한다. 다른 ID/명령/하위 기체 비트 수정은 이 경로에 일치하지 않는다.

`tests/helpers/editor-roster-level-profile-pins.mjs`는 실제 승인 a 본문의 기존 decodedLength·mask SHA·immutable SHA가 이전 profile과 전부 같은지 대조하고, 새 C7 level mask와 이전 mutable mask가 겹치지 않는지도 확인한다. F 23본문 / Final 14본문의 pins만 추가했다. 최신 각 a/b/c의 이전 scenarioScopes는 게임별로 완전히 동일하고, 이전 mask에는 새 C7 레벨이 포함되지 않으므로 이 출처 핀은 font별 C7의 동일성도 고정한다. 기존 raw carrier/TSR/disc mask·크기·hash 권한은 넓히지 않으며 stock 두 profile은 그대로다. 원래 labels/chapters의 presentation pin과 새 편집 scope는 정확한 metadata 대응을 통해 유지한다.

실제 F v0.5a의 엘가임/다바(본문2+1195, Lv8)와 Final v0.3a의 이데온/코스모(본문34+2606, Lv50)를 각각 Lv99로 내보내 새 inspector에서 열고, 원래 레벨로 다시 저장·재열기했다. 행 수·ID·identity·canonical scope를 유지했고 변경된 해제 본문 byte는 각각 level byte **1개**였다. 원본 파일은 보존하고 BIN은 메모리 Blob으로만 처리했다. 사적 근거는 `actual-roster-level-srwf-f.json`/`actual-roster-level-srwf-final.json`이다. 별도 합성 export 회귀는 대사·배치·턴·기한과 동시 저장/재수정, stock 거부, ID byte 위조 거부도 확인한다.

### 제한된 조기 합류 이동에서 추가로 확인된 조건

이번 F 검증 대상인 엘가임/다바 C7(본문2+1195) 뒤에는 `C1.06 04A8`(파일럿168/Lv2 생성)과 `C1.0B 0097 00A8`(151/168 연결)이 있다. Final 이데온 C7(본문34+2606) 뒤에도 `C1.06 60DB`(파일럿219/Lv48)와 `C1.0B 00DA 00DB`가 이어진다. 따라서 보조 구성 누락은 이데온에만 있는 특이 사항이 아니다. 보조 파일럿을 함께 옮기는 변환이 필요하다.

또 F 같은 본문의 +1210은 pilot154/unit205/Lv5, +1215는 pilot153/unit205/Lv3인 **별개의 C7**이다. `unitId가 이미 있다`는 조건으로 원래 C7을 생략하면 이 정상적인 동일 기종의 다른 파일럿 합류를 잃을 수 있다. 중복 억제에는 full pilot ID와 그 인물의 기체/연결 구성을 함께 확인해야 한다.

원래 C7 5byte 자리에 `01 00 04 00 00`을 놓아 다음 명령으로 점프하는 길이 보존 변환 자체는 기존 VM 분기 문법으로 표현할 수 있다. 새 도착점에는 기존 root를 보존하는 C7 묶음+원래 root로의 signed16 점프를 덧붙이는 제한 template을 생각할 수 있다. 그러나 이것만으로 제품 기능을 열지는 않았다. 최소 한 쌍의 실사용 이동을 열기 전에도 (1) 원래 C7·보조 생성/연결 묶음의 끝과 모든 내부 진입 참조, (2) 해당 callback의 진영·분기·F 인계 조건, (3) 새 도착 callback의 최초 실행과 Save/Continue 재실행 계약, (4) 이미 가진 full pilot/unit/연결 구성의 읽기 조건, (5) 양쪽 roster 용량과 변형 파생 슬롯을 생성 전 검사하는 경로, (6) 원래 도착 뒤 대화·출격·부품 부여가 검색하는 대상을 고정해야 한다. 현재 C0.11 맵 actor 검색은 이 로스터 중복 조건을 대신하지 못한다. 이 template의 검증되지 않은 allocator/실행 파일 변경 권한은 추가하지 않았다.


### 완결편 원복 저장 수정 (2026-10-23 후속)

위 Final 원복 용량 거부를 해결했다. 이름·글꼴 확장 제거 후 canonical 길이와
stored 길이가 달라 토큰 재사용이 불가능한데, 기본 압축은 3바이트 해시만
탐색해 2바이트 근거리 참조를 놓쳤다. 축소 원복의 기본 압축이 기존 할당을
넘을 때 기존 completeNearMatches 압축으로 재시도하고 더 작은 결과만 쓴다.
토큰 재사용 여부도 canonical 길이가 아닌 실제 storedDecoded 길이로 판단한다.

동일 Final a 실제 수정본에서 원복 압축은 **209,948바이트**, 기존 공간은
**215,040바이트**이며 추가 공간 0이다. 대사·무기명·글꼴 동시 원복 BIN을
새 inspector로 열었고 decoded TSR은 승인 원본과 정확히 같았다. 전체 BIN은
521,680,656바이트로 유지됐다. 근거는 사적 `actual-editor-reset-fixed-srwf-final.json`.
합성 회귀는 확장 유지 시 토큰 재사용, 확장 삭제 시 완전 근거리 압축, 디스크
크기·extent·디렉터리 길이·원본 decoded 일치와 기존 성장/패딩 거부를 확인한다.

### B1 화자 변경의 실제 초상화 후보 검증

`assets/editor-dialogue-speakers.mjs`는 현재 TSR root28의 실제 파일럿 head와
동일 디스크 `FACE.BIN`의 실제 블록을 대조해 `speakerOptions`를 생성한다.
이름·레코드 번호로 초상화를 추정하거나 F의 참고용 Final 초상화를 가져오지
않는다. 동적 주인공302/303, 주인공 head/list304..311, 공유 레코드/별칭,
고정 face0, 실제 블록 범위 밖인 ID는 후보가 아니다. face0 그림 자체는 두
게임에 존재하지만 원래 파일럿 head의 0은 고정 초상화 없음이며, 실제 승인
자료에서도 주인공 head 또는 빈 placeholder만 사용한다.

B1 packed low2의 변형 번호는 F `0601C4DC`→`0601C630`→`0601736C`→
`060143E8`→`060141F0`→`06009D18`로 전달된다. 마지막 함수의
`06009E36/06009E3C`는 해제 이미지 첫 BE16 count를 읽고 index가 범위
밖이면 중단하며, `06009E52..58`은 index×16의 subheader를 선택한다.
Final은 `06017800`→`06014860`→`060144EC`→`06009F40`, count/bound
`0600A05E/0600A064`, index×16 `0600A07A..80`이다. 따라서 첫 byte가
0일 것이라고 추정해 두 번째 byte만 읽지 않고 BE16 전체를 검증한다.

각 후보의 실제 압축 frame을 기존 bounded LZ reader로 해제해 1..64개
subframe 전부의 header·픽셀·팔레트 경계를 확인한다. 첫 정상 frame만
보여주는 기존 정지 초상화 preview보다 엄격하다. 원래 B1 low2가 새 후보
frame 수보다 작아야 한다는 writer 제약을 이 실제 count로 검증할 수 있다.
identity는 game/파일럿 ID/원래 불변 head4byte/face ID/실제 압축 이미지
block SHA만 사용한다. 파일럿 수치나 특수능력을 바꿔도 동일하다.

F 실제 FACE338블록에서 검증 후보342명, Final FACE342블록에서 후보379명을
얻었다. 여러 파일럿이 같은 face를 사용하므로 후보 수와 이미지 수는 다르다.
참조된 잘못된 frame은 두 게임 모두 0개였다. 별도의 전체 FACE 구조 probe도
F338/Final342블록 전부 유효한 1..4 frame임을 확인했다. 두 ROM 모두 읽기만
했으며 원본 크기·mtime은 유지됐다. 작은 사적 JSON 근거는
`dialogue-speaker-options.json`, 집중 합성 회귀는
`tests/editor-dialogue-speakers.test.mjs` 6건이다. 이는 화자/초상화 선택의
바이트·참조 계약이며 새 실기 실행을 했다는 의미는 아니다.
