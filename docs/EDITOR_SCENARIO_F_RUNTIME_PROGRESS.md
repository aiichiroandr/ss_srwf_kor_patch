# F 기존 후속 사건을 보존하는 신규 증원 실험

2026-10-10. 이 문서는 저장소 밖 실험의 관측 근거다. 새 증원 기능의 제품 사용 허가나 패치 릴리스 승인이 아니다. 실험 BIN, 해제 데이터, 게임 저장, 에뮬레이터 상태와 캡처는 저장소에 포함하지 않는다.

**최초 pilot 323 후보는 실패다.** 실제 6턴의 원래 사건이 추가한 적을 원래 증원 기체 대신 선택하고 제거했다. 이후 pilot 322 대체 후보는 실제 Save·새 부팅 Continue 및 원래 5·6턴 대상 보존을 제한된 경로에서 통과했다. 전체 native 계약·미래 용량·helper 상주성은 미검증이며 신규 증원 제품 기능은 계속 비활성 상태다. 아래 각 단계의 통과 항목은 그 범위의 관측만 뜻한다.

## 입력과 사본 계약

- 입력은 승인 F v0.5 a의 전체 SHA-256 `b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9`와 일치했다.
- 조사 대상은 SCEDATA의 물리 본문 1이다. 슬롯 별칭이 있으므로 이를 특정 실제 화수로 부르지 않는다.
- 기존 root5의 해제 오프셋 `2544..2813`은 빈 코드가 아니다. 원래 5턴·6턴 equality 검사와 후속 사건을 포함한다.
- 후보는 원래 본문에서 root5 상대 포인터 셀만 바꾸고, 원래 root5 전체를 대기용·완료용으로 각각 옮겼다. 대기 사본의 시작으로 돌아가는 참조는 새 조건 검사로 이어지고, 완료 사본의 시작으로 돌아가는 참조는 원래 사건 검사로 이어진다. 원래 5·6턴 사건을 빈 콜백으로 교체하지 않았다.
- 기존 해석기와 현재 승인 EXEC의 명령 해석을 다시 실행하여 두 사본의 130개 명령, 50개 상대 참조, 78개 native pointer contract를 비교했다. 길이·참조·명령 동작 계약은 일치했다. 외부 로더 루프를 따라가는 `16.00` 두 곳과 `88.00` 한 곳은 원본과 사본 양쪽에서 같은 분석 상한에 도달하므로, 이것만으로 해당 사건 전체 실행이 증명되지는 않는다.
- 해제 크기는 `14741→15348`바이트, 압축 크기는 `7737≤7820`바이트 슬롯이다. F의 확인된 활성 버퍼는 `20211800..20219800`으로 최대 `0x8000`바이트다. 완결편의 `0x9000` 한계를 F에 적용하지 않는다. 현재 후보는 F 한계 안에 들어간다.
- 사적 IP 용량 검사 helper와 FC dispatch 수정은 이전 실험의 고정 해시를 재사용했다. helper의 모든 장면에서의 상주성과 원래 사건의 최대 추가 할당량은 아직 증명되지 않았다.

사적 후보 전체 SHA-256은 `61a352886e0399cec92bad838b921ad7a32614feb3f7a3d8ebee80b0c9d5e97f`다. APFS 공간 공유 사본에 변경 raw 섹터 6개만 쓰고 예상·실제 전체 해시를 비교했으며, 실행 전에 같은 해시를 다시 확인했다. 제품 출처 검사는 이 후보를 `EDITOR_REINFORCEMENT_INVALID`로 거부한다.

## 실제 적군 시작 1·2

게임을 새로 부팅한 뒤 실제 패드 입력으로 진행했다. RAM 변경, 치트, 강제 media ID는 사용하지 않았다. 첫 cold runner는 110초 관측 상한에서 정상 종료하여 자체 MCA를 남겼다. 그 프로세스의 종료를 확인한 뒤 그 후보가 만든 MCA만 이어받았다. 이 시작 1·2 확인까지의 후속 단계는 모두 `returncode=0`, `timeout=false`였다. 모든 단계의 source MCA 해시가 보고서에 있다.

네이티브 관측은 32개 peek 한도에서 추가 코드 전체 575바이트, argument cursor, VM 80바이트, callback 상태 16바이트, actor·pilot·unit 전체 6560바이트를 동시에 읽었다.

| 관측 | 적군 시작 1 | 적군 시작 2 |
|---|---|---|
| 새 생성 | 없음 | 정확히 1회 |
| 원래 조건 | 5·6턴 equality 검사 실행(둘 다 불충족) | 5·6턴 equality 검사 실행(둘 다 불충족) |
| root5 저장 재개 주소 | `202151C7` 대기 사본 | `202152D4` 완료 사본 |
| 다른 callback 포인터 | 보존 | 보존 |
| VM 반환 result·flags·stack | 기존 relocation baseline과 같음 | 기존 relocation baseline과 같음 |
| 전체 actor·pilot·unit | callback 동안 6560바이트 불변 | constructor 진입까지 불변, 빈 레코드 각 1개만 변경 |

시작 2의 용량 검사는 actor 56, pilot 108, unit 107의 빈칸 중 최솟값 **56**을 반환했다. helper의 PR 및 r1..r15는 보존됐다. 새 actor 62, pilot cache 20, unit cache 21이 연결됐고, 기체 184 무사이개·파일럿 323 DC병사·LV7·좌표 21,21·원래 AI `20211A24`를 확인했다. 나머지 모든 레코드는 그대로였다.

실험 코드와 proof는 저장소 밖 `f-native-enemy-composed-runtime-proof.py/json`이다. 근거 trace SHA-256은 시작 1 `57ebf1e9b5ba4e2aaf8d36e228c2e17d44d4c2fcb6b49c0d4e755c00be30fb01`, 시작 2 `bd9b33b822c756e4080f4565204dc4a545f00f30a42db5425a79503d6421ccc7`이다. 두 구간 모두 hit limit에 도달하지 않았다.

## 게임 내 저장과 새 부팅 후 이어하기

턴 3에서 실제 게임 메뉴의 저장을 실행하여 ‘세이브 완료’를 확인했다. 활성 BKR의 SHA-256은 `fe8fbb777788bf92d88931f0351d3fbadda6f9f9b6d4146823f5ee2b9d133d2c`에서 `7e240a29217a4e73ce0bf03687acf501619c823398ca19000007443c814538ab`로 바뀌었다. 새 home에 이 저장을 복사하고 복사된 MCA를 모두 삭제한 뒤, 이미지 전체 해시를 다시 확인하여 새로 부팅했다. cold 보고서는 `stateResumed=false`, `sourceSaveState=null`, `returncode=0`, `timeout=false`다. 제목에서 실제 ‘이어하기’를 선택했고, 이후 관측은 이 새 부팅과 BKR 불러오기가 만든 MCA만 이어받았다.

게임 상태 32바이트, callback 16바이트, 추가 코드 575바이트와 helper 256바이트는 저장 전과 재개 후에 정확히 같았다. 신규 actor 62·pilot 20·unit 21의 연결과 현재 AI 재개 `20211A4E`도 같았다. 현재 AI 주소는 최초의 `20211A24`에서 게임의 정상 실행으로 진행된 값이며, 이를 초기 주소로 되돌려 비교하지 않았다.

전체 6560바이트의 원시 테이블이 동일하다고 주장하지 않는다. pilot·unit 테이블은 전부 같고 actor 테이블은 기존 아군 actor 0의 `+3` 한 바이트만 `E9→A9`로 달랐다. 별도 같은 cold 상태에서 읽기·쓰기 관측을 반복하여 다음 순서를 확인했다.

1. BKR 복원 PC `0609FBC6`이 해당 첫 word를 원래 `0B1001E9`로 복원했다.
2. 이후 PC `060489FA`가 `+3`의 `0x40` 비트를 `E9↔A9`로 반복 토글했다.
3. 현재 승인 EXEC의 `060489B0..06048A06`도 표시 갱신 counter의 modulo 20 검사, bit 6 XOR, mask `BF`를 거친 해당 바이트 쓰기를 포함한다.

즉 저장 누락을 허용하는 일반 마스크로 차이를 숨긴 것이 아니다. 복원 직후 원시 값은 같고, 관측 시점 사이에 게임의 표시 점멸이 바뀐 것이 확인됐다. 이 별도 관측은 46개 write hit로 한도 100에 도달하지 않았다.

새 부팅 후 적군 시작 3에서는 완료 사본의 원래 5·6턴 검사를 다시 실행하고 `202152D4`를 저장했다. helper·F4 새 조건·CA02·constructor 호출은 모두 0회였으며, 그 callback 구간의 전체 6560바이트는 불변이었다. 동일 후보의 저장·재개·중복 생성 방지에 대한 한 경로의 증거다. 에뮬레이터의 사적 저장 파일명 패턴을 사용했으므로 원본 또는 다른 출력 이미지의 저장 파일명 호환까지 주장하지 않는다.

근거는 저장소 밖 `f-native-enemy-composed-save-proof.py/json`이며, 주요 trace SHA-256은 저장 전 snapshot `d68a573de05d0f9f3dedaf734521f4529cf81e40e8bd06c6e6bd8ce2c9383159`, 재개 snapshot `e6a4cd3bcd25f61b973bd6f65a6491055004b8227d48decdafe4a98dddecb714`, 점멸 write 관측 `99cab4664aeaa234e93211775451a8cd437e5ca4f99c57ea02183bb0d564bd5e`, 적군 시작 3 `3f9d2bc9b1e5f1b3f4051e19e43b53813bf5349184ea39cb7ee3d49ab5881fca`다.

## CA02 selector와 ID 연결의 범위

기존 해석기의 `groupSelector`는 이 조사 단계에서 고유 기체 ID나 별도 group lookup의 키로 단정하지 않는다. F 템플릿의 실제 control byte는 hex `11`이다. CA02 `060243C4..060243CE`는 unit word 상위 값과 selector를 합쳐 `FC`로 마스킹하고, generic constructor로 `10`을 넘긴다. generic constructor·actor 초기화는 그 값을 분해하여 actor `+3`·`+4`의 비트에 반영한다. 읽은 이 경로에서 selector를 키로 GameState의 ID별 lookup을 덮어쓰는 동작은 확인되지 않았다. 다만 외부 consumer 전체를 닫은 증거는 아니며, map 점유표와 이후 사건의 ID 검색 경로도 계속 확인해야 한다.

## 남은 확인

시작 1·2·3에서 원래 5·6턴 검사를 거치는 것은 해당 턴의 후속 사건 자체를 실행한 증거가 아니다. 원래 5·6턴 사건의 호출·반환과 ID consumer, 원래 할당의 최대 범위, helper 상주성과 편집 출처 계약을 계속 확인해야 한다. 현재 제품 기능은 열지 않았다.

## 원래 5턴 증원의 실제 실행

추가 적이 생성된 뒤 같은 게임 저장을 새로 부팅하여 이어하기로 진행한 경로에서 실제 5턴에 도달했다. `native-fcomposed-enemy5-context-f-1`은 전체 코드·VM·세 pool을 동시에 관측하고 25개 native hit로 한도 1000에 도달하지 않았다. 첫 동일 source MCA의 read-range 관측은 한도 1000에 도달했으므로 전체 반환 증거로 쓰지 않는다. 아래 결과는 한도에 도달하지 않은 별도 관측이다.

원래 5턴 equality 분기가 실제로 성립했고, 기존 `16.00` 경로와 두 CA02 목록이 실행됐다. 원래 증원 5기는 다음처럼 할당됐다. 각 constructor 진입부터 반환까지 빈 actor·pilot·unit 레코드 하나씩만 바뀌고, 새로 추가한 actor 62는 그대로였다. 증원 사이에는 원래 게임 사건이 actor를 갱신할 수 있으므로 사건 전체의 모든 레코드 불변을 주장하지 않는다.

| 원래 기체·파일럿 ID | 좌표 | actor | pilot cache | unit cache |
|---|---|---|---|---|
| 184·323 | 22,21 | 61 | 21 | 22 |
| 107·80 | 21,22 | 60 | 22 | 23 |
| 80·243 | 20,20 | 59 | 23 | 24 |
| 80·322 | 19,21 | 58 | 24 | 25 |
| 80·322 | 18,22 | 57 | 25 | 26 |

새 wrapper의 helper·F4·constructor는 재호출되지 않았다. 추가 코드 575바이트는 모두 같았다. 뒤의 원래 이야기 진행 관측 `native-fcomposed-enemy5-dialog-f-1`에서는 원래 callback 슬롯 `+528`에 완료 사본 재개 주소 `202152D4`를 다시 저장했다. 실제 원래 5턴 증원 및 이야기 이후 callback 복귀를 확인한 것이다. 별도 증원 proof `f-native-enemy-composed-turn5-proof.py/json`의 trace SHA-256은 `900a068bcadfe96a4bf974234fcec05c4cca3e1ac82d0d3ac903c6c18569c2b7`이다.

그러나 별도 슬롯 할당은 ID 기반 사건의 대상 보존까지 증명하지 않는다. 원래 6턴의 `EE.0A 0143`·`EE.0C 0143`이 쓰는 `06024ABC`는 `0602A3E0`에서 pilot cache를 낮은 인덱스부터 찾아 첫 full ID 일치를 반환하고, `06024B00`에서 그 cache와 연결된 actor를 찾는다. 새 적의 pilot 323은 cache 20, 원래 5턴의 pilot 323은 cache 21이다. 이 native consumer는 새 적을 원래 사건의 대상으로 고를 수 있다. 실제 6턴의 반환 actor를 추가로 관측하기 전까지 이 후보를 통과한 것으로 분류하지 않는다. 기체 종류별 집계가 바뀌는 문제와, 원래 특정 사건이 다른 개체를 선택하는 문제를 구분한다.

## 원래 6턴 사건의 실제 대상 충돌 — 실패

`native-fcomposed-enemy6-f-1`에서 실제 적군 시작 6, 원래 equality 분기와 `BF.09` store가 실행됐다. 원래 5턴 무사이 actor 61·pilot cache 21·unit cache 22와 추가 무사이 actor 62·pilot cache 20·unit cache 21은 모두 살아 있는 레코드였다. 파일럿 full ID는 양쪽 모두 `0143`이다.

| 원래 명령 | frame | argument cursor | 실제 pilot cache | 실제 actor |
|---|---|---|---|---|
| `EE.0A 0143` | 432 | `202153A2` | 20 | 62 |
| `EE.0C 0143` | 435 | `202153AF` | 20 | 62 |
| `C0.03`(앞에서 지정한 `0143`) | 494 | `202153BF` | 20 | 62 |
| `C1.02 0143` | 524 | `202153CB` | 20 | 제거 결과로 아래 확인 |

첫 세 검색에서 native `0602A412`의 반환 `14`(cache 20), `06024AEE`의 반환 `3E`(actor 62)를 직접 확인했다. frame 494에서 추가 actor가 `14,19→14,24`로 이동했으며, frame 544의 callback 복귀에서는 그 actor의 첫 바이트가 `FF`로 바뀌고 pilot 20·unit 21의 첫 word가 `0000`으로 비워졌다. 반면 **원래 5턴의 actor 61·pilot 21·unit 22는 사건 진입과 복귀 사이에 원시 레코드가 전부 같았다.** 원래 제거할 대상을 남겨 두고 새 적을 이동·제거한 실제 반례다. 단순히 기체 종류의 존재 여부나 적 숫자 집계가 달라지는 문제로 설명하지 않는다.

원래 사건은 완료 사본 재개 `202152D4`로 반환했고 다른 callback 포인터와 추가 코드 575바이트도 그대로였다. 새 helper·CA02·constructor는 0회였다. 따라서 코드·재개 주소를 보존한 것만으로 특정 사건의 의미를 보존했다고 주장할 수 없다. 이 후보를 `FAIL_ORIGINAL_EVENT_TARGET_CHANGED`로 기록했다.

proof는 저장소 밖 `f-native-enemy-composed-turn6-counterexample.py/json`, trace SHA-256은 `83288c9bad99a9fc192b0ad0cc6c9c6fac904f2324522503ad7bebea93b5beb4`다. 119개 hit로 한도 800에 도달하지 않았고 `returncode=0`, `timeout=false`였다. 네이티브 PC watch 상한은 32개다. 추가로 요청한 C1 entry/return PC는 등록되지 않았으므로 그 PC를 보았다고 쓰지 않는다. C1 대상은 정확한 명령 argument cursor의 native cache 검색 반환과 이후 세 pool의 제거 결과로 확인했다.

이 경로로 가던 `native-fcomposed-enemy5-advance-f-2`는 105초 관측 상한에서 frame 5832까지 진행하고 `returncode=0`, `timeout=true`로 정상 종료하여 MCA를 남겼다. 프로세스 종료 후 그 MCA 해시를 기록하고 이어받았으며, 실제 6턴 메뉴와 위 사건 실행은 후속 단계에서 확인했다. 이 bounded 종료를 전체 구간 무제한 성공으로 바꾸어 표현하지 않는다.

다음 사적 후보는 원래 사건이 full ID로 참조하는 pilot 323·unit 184 템플릿을 제외해야 한다. 원래 root4의 pilot 322·unit 80·AI 548을 쓰는 entry 2122 등을 먼저 검토한다. 기존 CA02 템플릿, AI, callback 및 명시·간접 identity query의 native 계약이 닫히기 전에는 제품 사용을 허용하지 않는다. 미검증 부분을 명시한 사적 후보의 실제 실행은 그 계약을 조사하는 다음 단계다.

## 대체 pilot 322 후보의 준비 범위

별도 사적 런타임 반례 검사를 위해, 검증되지 않은 부분을 plan에 명시한 후보를 만들었다. 제품 사용을 허용하지 않는다. 원래 root4 CA02 command 2083의 entry 2122를 사용하며 control byte는 command `+2`의 `11`, 파일럿 source word `0942`(pilot 322·LV4), 기체 word `0050`(unit 80), AI 548이다. 이 항목은 CA02 목록의 첫 항목이 아니다. selector를 `entry-1`에서 읽는 단일 항목 가정 대신 실제 명령 시작과 12바이트 목록 stride를 검사했다. 생성 시점은 적군 시작 2, 좌표는 21,21이며 wrapper·기존 root5 두 사본과 용량 helper는 동일하다.

전체 사적 후보 SHA-256은 `a54c49a8b4f9e051f407fbf584b579d054cdac64f7e63cb0488aaa08c968c5ca`다. 승인 입력에서 exclusive APFS clone을 새로 만들고 raw 6개 sector를 쓴 뒤 expected·actual 전체 해시가 일치했다. 해제 15348바이트, 압축 `7742≤7820`바이트이며, 기존 130명령·50상대참조·78 native pointer contract의 동등성을 다시 확인했다.

입력·출력 전체 raw sector를 비교하여 실제 변경 LBA가 `2, 372, 244751, 244752, 244753, 244754`의 6개뿐임을 확인했다. 모두 Mode 1이며 각 sector의 sync·header 16바이트는 그대로다. 기존 CD user-extent 검증기로 source와 target 각각의 EDC·ECC를 다시 검사했고 모두 통과했다. plan에 각 원시 sector의 source·target SHA-256과 `sourceAndTargetEdcEccValid=true`를 남겼다. 이 검사는 사적 IP·EXEC·SCEDATA 수정의 정확한 쓰기 범위를 입증하며, 그 수정의 제품 허용 여부를 대체하지 않는다.

원래 14 roots와 CA02 AI 참조를 기존 grammar로 탐색하고, grammar에 없는 F `C0.07`·`C0.08` 4곳의 현재 native 길이·후속 계약을 보충하면 1537개 명령에 unknown grammar frontier는 없다. 이 범위에서 명시 word operand 322 참조는 보이지 않았다. 그러나 모든 known key의 native 의미 동등성이나 간접 ID 조회가 닫혔다고 주장하지 않는다. AI 548의 16명령은 현재 native 길이와 일치하며, `88.00` 세 곳의 외부 `0605FFC0` 루프는 추상 실행 한계가 남는다. 자료는 사적 `f-body1-template322-proposal.json`, `f-body1-ai548-current-contract.json`이다.

새 plan은 사적 EXEC dispatch `060B25AC`(4바이트 `0601789C→06003700`) 및 IP `+1700`의 원래 zero 256바이트에 쓰는 helper의 source·target SHA-256을 명시한다. 원래 root5에서 앞으로 할당하는 5기는 알려진 수치로 기록했지만, 다른 callback의 최대 할당량은 `null`, 예약 용량 증명·전체 native identity closure·모든 장면 helper 상주성은 모두 `false`다. 단일 현재 경로의 빈칸 검사만으로 미래 용량을 보장하지 않는다. 제품 출처·허용 contract를 검토하려면 이 사적 EXEC/IP 수정도 함께 다뤄야 한다.

대체 후보를 MCA 없이 새로 부팅하여 동일 물리 본문 1을 실제 패드로 진행했다. cold 단계는 115초 상한의 정상 종료로 자체 MCA를 남겼고, 종료 후 그것만 이어받았다. 1턴 메뉴에서 실제 반격 명령을 ‘반격하지 마!’로 조정한 뒤 진행했다. `phase1-f-1`이라는 첫 사적 시도는 기체 메뉴였고 wrapper 진입이 0회라 적군 시작 증거로 쓰지 않는다. 실제 턴 종료 메뉴를 확인한 뒤 실행한 `native-f322composed-phase1-f-2`가 적군 시작 1의 근거다.

실제 시작 1에서는 생성 0회, 원래 5·6턴 불충족 검사와 대기 재개 `202151C7`가 확인됐다. 시작 2 `native-f322composed-phase2-f-1`에서는 capacity 56, constructor 1회, actor 62·pilot 20·unit 21에 pilot 322·LV4·unit 80·좌표 21,21·AI `20211A24`를 확인했다. constructor 이전 전체 6560바이트는 같고 각 pool의 빈 레코드 하나씩만 바뀌었다. helper 레지스터, 다른 callback 포인터, 부모 result·flags·stack도 기존 relocation baseline과 같았다. 이 두 구간은 221·102 hit로 각 한도에 도달하지 않았다.

근거는 사적 `f-native-enemy322-composed-runtime-proof.py/json`이며 trace SHA-256은 시작 1 `71630b60d83d1e2e830066bcc97d21b9df6948570bd450a856132bad326c4f1e`, 시작 2 `897231f41f4cd1ba5f8fa62a5888f7760b571bd7cbd26591aa1646e1174220d6`다. 원래 5·6턴 사건 대상의 보존은 이후 확인 사항이다.

## 대체 후보의 실제 Save·새 부팅 Continue

pilot 322 후보를 실제 아군 3턴에서 저장했다. 게임 Save 완료 전후 active BKR SHA-256은 `2eb9c903fe7605af241b502018f9a3a86f8cfaa8136099d313a9c3c5f75bd872`에서 `cbff17ac880e20cec85cdab9fa62e8b118b6b089fda0a46a1c64b3a1b8ad28e5`로 바뀌었다. 저장 이후 MCA `45c304fc34e4c7598d2fc2e74b60d6515443d139cf24ff724a3c5945515a74c5`를 모두 제거한 별도 home에서 후보 전체 해시를 다시 확인하고 새 부팅했다. 6205 frame·80.42초의 cold run은 `returncode=0`, `timeout=false`, `stateResumed=false`, `sourceSaveState=null`이었다. 실제 타이틀의 ‘이어하기’를 패드로 선택해 맵의 아군 3턴으로 돌아왔다. media ID 강제나 RAM 변경은 없다.

저장 직후와 Continue 후의 코드 575바이트, helper 256바이트, GameState 32바이트, callback 16바이트, pilot·unit pool 전체는 같았다. actor 62·pilot 20·unit 21의 연결, full pilot 322·unit 80, 실제 AI 재개 `20211A4E`도 같았다. 전체 pool 6560바이트에는 actor 0의 `+3`만 `E9→A9` 차이가 있었다. 별도 native write 관측에서 `0609FBC6`가 source 원시 첫 word `0B1001E9`를 먼저 복원하고, 그 뒤 `060489FA`가 UI bit 6을 45회 토글한 것을 확인했다. 이는 원시 복원이 먼저 같고 이후 UI 표시가 달라진 근거다. 마스크를 적용한 동등성을 raw 전체 동일로 쓰지 않는다.

Continue 후 실제 적군 시작 3에서는 helper·CA02·constructor가 0회였고 전체 pool은 callback 진입·복귀 사이에 같았다. 원래 5·6턴 검사를 실행한 뒤 완료 사본 재개 `202152D4`를 다시 저장했다. proof `f-native-enemy322-composed-save-proof.py/json`은 같은 후보의 BKR와 새 부팅 경로만 증명한다. trace SHA-256은 저장 직후 `f0b928640c141a0738acfcf2bdbf2be5a99f23e3f1bd8e02e6736d50a596f60c`, 재개 직후 `4d3d18a8956619d40ff528dee651c8d7db599147ee6ae5d847cedc436525c4c8`, 별도 blink `3254cc815b33b2f1c45d16c961581d1184e601dc8c8a53b8f43070bbb3401b6b`, 적군 시작 3 `55ebbc23bab6672e007c0a726dd631a189d0238b4b902f27804cb635a2018662`다. 다른 이미지의 저장 호환성이나 제품 사용은 증명하지 않는다.

## 대체 후보에서 원래 5턴 증원·재개 보존

위 실제 Save·Continue 경로에서 패드로 4턴 전투를 진행한 뒤 GameState의 아군 턴 5와 실제 ‘턴수 5’ 메뉴를 확인했다. `native-f322composed-enemy5-context-f-1`은 25 hit로 한도 1000에 닿지 않았고, 원래 equality 5 분기와 constructor 5회를 기록했다. 원래 무사이는 actor 61·pilot cache 21·unit cache 22에 pilot 323·LV7·unit 184·좌표 22,21로 만들어졌다. 나머지는 앞 최초 후보의 원래 5턴 표와 같은 ID·좌표·cache 배치였다. 각각 각 pool의 빈 레코드 하나씩만 바뀌었다.

새 pilot 322의 actor 62·pilot 20·unit 21 세 레코드는 이 capture의 모든 hit에서 원시 바이트가 같았다. 원래 5턴 CA02가 기존 추가 개체의 cache나 actor를 덮어쓰지 않았다는 실제 근거다. 추가 helper·F4는 호출되지 않았고 추가 코드 575바이트도 그대로였다. 후속 원래 이야기 `native-f322composed-enemy5-dialog-f-1`의 frame 242에서는 원래 callback `+528`에 완료 사본 재개 `202152D4`를 다시 저장했으며 다른 두 callback 포인터와 새 개체 세 레코드도 보존했다.

근거는 사적 `f-native-enemy322-composed-turn5-proof.py/json`이다. 증원 trace SHA-256은 `49ac19608ce6fd5046ae3aa70d4eba7f66cf726a1abe72758bacfe115ad270d1`, 이야기·재개 trace는 `501b0f5d3ce72e701ea4dbb9b79fc724466e4f1550524f6fb4174a4ec328c67c`다. 이후 원래 6턴의 full ID 조회가 원래 무사이를 선택하는지 별도로 확인해야 한다.

## 대체 후보에서 원래 6턴의 대상 보존 — 제한된 경로 통과

같은 Save·Continue 경로를 실제 아군 6턴 이야기까지 진행했다. GameState 턴과 ‘턴수 6’ 종료 메뉴를 각각 확인한 `native-f322composed-turn6-ready-global-f-4`에서 원래 사건을 실행했다. 그 전 `turn6-story-clear-f-1`은 이미 이야기가 끝난 맵에서 별도 분기로 잘못 시작한 것이어서 근거와 후속 source에서 제외했다. 실제 live PID를 확인한 뒤 종료하고 사적 `discarded.json`에 기록했다. 이 분기의 runner `timeout=false`를 요청 frame 전체 완료의 근거로 쓰지 않는다. 정식 global-f4는 종료된 원본 global-f3 MCA `362328e2837cf1e90c892d559b36e217c720040bf7f7a6c09ac5cd201b5232d4`를 독립적으로 이어받았다.

`native-f322composed-enemy6-f-1`은 `returncode=0`, `timeout=false`, 119 hit로 한도 800에 닿지 않았다. 정확히 32개 PC watch의 실제 등록을 확인했고, 최초 후보에서 상한 밖이었던 `C1.02` entry·cache 반환 이후·함수 반환 PC도 이번에는 직접 관측했다. 원래 D400은 턴 6을 반환했으며 원래 `BF.09`의 zero store가 `060C0715`로 실행됐다.

| 원래 명령 | frame | argument cursor | 실제 pilot cache | 실제 actor |
|---|---|---|---|---|
| `EE.0A 0143` | 432 | `202153A2` | 21 | 61 |
| `EE.0C 0143` | 434 | `202153AF` | 21 | 61 |
| `C0.03`(앞에서 지정한 `0143`) | 490 | `202153BF` | 21 | 61 |
| `C1.02 0143` | 520 | `202153CB` | 21 | native entry·cache 반환·제거를 직접 확인 |

원래 5턴의 무사이 actor 61·pilot 21·unit 22가 선택됐다. 사건 진입의 실제 좌표는 20,20이고 제거 직전은 20,24였다. frame 540의 callback 복귀에서 이 actor의 첫 바이트가 `FF`, pilot 21·unit 22의 첫 word가 `0000`이 됐다. **전체 6560바이트의 진입·복귀 차이를 레코드 단위로 비교하면 actor 61·pilot 21·unit 22만 바뀌었다.** 새 pilot 322의 actor 62·pilot 20·unit 21 세 레코드는 원시 바이트가 완전히 같고 살아 있었다. 이는 최초 pilot 323 후보의 잘못된 이동·제거 반례와 구분되는 실제 대상 보존 근거다.

원래 callback은 완료 사본 `202152D4`로 반환했고 다른 callback 포인터와 추가 코드 575바이트도 그대로였다. 새 helper·CA02·constructor는 0회였다. 사적 `f-native-enemy322-composed-turn6-proof.py/json`은 결과를 `PASS_BOUNDED_ORIGINAL_EVENT_TARGET_PRESERVED`로 기록하며, trace SHA-256은 `c92b4309ce6cb4b959240719b81458f6f5e1c68086e68debd391a3eee70ca4c5`다. 실제 5·6턴 이후 후보 전체 SHA-256도 다시 검사하여 `a54c49a8b4f9e051f407fbf584b579d054cdac64f7e63cb0488aaa08c968c5ca`와 같음을 확인했다.

이 통과 범위는 물리 본문 1, root4 entry 2122의 pilot 322·LV4·unit 80·AI 548, 적군 시작 2의 21,21 추가 1기, 실제 Save3·새 부팅 Continue3·원래 5·6턴 경로다. 모든 간접 identity query, 다른 경로의 최대 할당량, 모든 장면에서의 helper 상주성 및 사적 EXEC/IP 변경의 제품 출처 계약은 아직 닫히지 않았다. **신규 증원 제품 기능은 비활성 상태를 유지한다.** 다음 최소 검토는 이 본문의 원래 14 roots·도달 AI에서 간접 ID가 native lookup으로 흐르는 계약과 기존 322 개체들을 고르는 다른 사건의 범위를 닫는 것이다. 사적 helper를 제품에서 쓰려면 별도로 상주성·정확한 source/target hash·dispatch 허용 범위를 검증해야 한다.

작은 다음 native probe로 AI 548의 offset 556 `EE.07 FFF9`를 잡을 수 있다. 현재 승인 F의 EE dispatch `060B2808`에서 handler `0601D744→06020430→06026C90`으로 이어지며 selector 인수는 `r6=-7`이다. 이 selector의 반환 배열, VM의 current actor 바이트 `060C0711` 및 후속 소비를 먼저 분류해야 한다. 이를 별도로 확인된 `EE.1B FFF9`의 direct-current-actor 계약이나 양수 full pilot ID 검색과 같은 의미로 가정하지 않는다.

선택적으로 실행한 원래 6턴 이후 helper 무결성 관측 두 개는 근거로 쓰지 않는다. 종료 MCA를 독립적으로 이어받아 opcode-fetch PC의 5 frame 관측 및 GameState 범위의 25 frame 읽기 관측을 했지만 모두 native hit가 0회였다. 이들 `returncode=0`은 에뮬레이터 종료의 근거이며 helper 바이트를 읽었다는 뜻이 아니다. helper의 실제 동일 바이트 근거는 앞의 Save·Continue3 범위까지다.

## AI 548의 EE07 FFF9: 대상 배열과 실제 소비

2026-10-10 추가 조사. 새 후보는 만들지 않았다. 동일 pilot 322 사적 이미지의 전체 SHA-256 `a54c49a8b4f9e051f407fbf584b579d054cdac64f7e63cb0488aaa08c968c5ca`를 다시 확인했다. accepted F EXEC SHA-256 `308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1`의 EE dispatch·EE07 leaf·selector·consumer·ED scheduler·flag/resume helper·C201 범위가 사적 EXEC의 같은 바이트와 정확히 같음을 이미지에서 다시 읽어 검증했다. 사적 EXEC 전체 해시는 `d5e363f7f1f6f115e2f870a549f1e03b594cf15718d72aadeebfc73789cb3874`이며, 앞에서 밝힌 별도 FC dispatch 변경을 포함하므로 accepted EXEC 전체와 같다고 하지 않는다.

AI offset 556의 명령은 `EE07FFF9` 4바이트다. 기존 native parser의 extent 4와 grammar 4가 일치하고 이 명령의 unresolved 항목은 없다. main EE handler `0601CF9C`는 `060B2808`의 subdispatch로 `0601D744`를 실행한다. leaf는 args의 subopcode 다음 두 바이트를 signed 16-bit `-7`로 읽고 `06020430`에 넘긴다. leaf의 실제 반환 `6003`은 subopcode CUR부터의 길이 3이며, 전체 opcode 포함 길이는 4다.

`FFF9`의 뜻을 다른 EE 명령에서 가져오지 않는다. 이 호출에서 selector `06026C90`의 `r7=0`, signed selector `-7` 분기는 `06026D16`이다. 기준 actor의 첫 바이트가 `FF`이면 0개를 반환하고, 상태 word `actor+4`의 `20000008` 비트가 있으면 0개를 반환한다. 유효한 기준 actor의 `+4` 바이트에서 `(byte>>1)&0F`로 대상 진영 마스크를 얻는다. 74 actor를 순서대로 스캔해 첫 바이트 `FF`와 상태 `20000008`을 제외하고, 각 actor `+3`의 `(byte>>1)&3` 진영 비트가 그 마스크에 있으면 1바이트 actor index를 출력 배열에 넣는다. `r0`에 개수를 반환하며 배열 뒤의 `FF` terminator는 쓰지 않는다. 이 분기는 `r10=-1`이므로 positive full-pilot-ID lookup `0602A3E0`/normalizer `0602A194` 경로를 건너뛴다. 같은 pilot ID의 두 actor를 이 selector가 하나로 합친다는 해석은 틀리다.

VM base는 `060C06F0`다. **기준 actor `060C0710`(VM+32), acting actor `060C0711`(VM+33), selected global `060C05F0`, args pointer `060C0900`, RESUME의 VM 첫 4바이트를 각각 구분한다.** selector는 기준 actor를 읽고 consumer는 acting actor를 stack+80에 저장한다. 이 경로의 integer result 주소는 `060C0704`(VM+20)이며 `+0x20`과 혼동하지 않는다. target actor byte는 `060C0714`, flag byte는 `060C0715`다.

`native-f322composed-ai548-ee07-array-f-1`은 종료된 실제 6턴 global-f4 MCA `eceaee5819fa4c688dec757763557910c0b68da215e31219e9df6c3b73f987cb`에서 정상 패드 입력으로 재실행했다. `returncode=0`, `timeout=false`, 117 hit/한도 500, poke 0이다. frame 543에서 실제 args `20211A2D`(본문 offset 556+1), VM 기준·acting actor 및 global은 각각 67이었다. selector 반환 `r0=9`, 실제 stack `060FFAF8`의 9바이트 배열 **`[0,1,2,3,4,5,6,8,9]`**이 전체 actor pool에서 계산한 마스크·유효 상태 oracle와 일치했다. 기준 actor 67의 대상 진영 마스크는 1이었다.

consumer `06020430`은 배열을 만드는 데서 끝나지 않는다. acting actor의 이전 대상 `+9`가 유효하고 목록에 있으면 그 하나를 우선한다. 그 뒤 `06020530`에서 실제 각 actor index를 소비하고, 좌표 sync `0601F478`와 위치 후보 helper `060202A0` 및 map cost `20290800`을 사용해 이동 위치를 정한다. 실제 해당 실행은 배열 index 0..8을 차례로 소비했고 consumer 반환 시 selected global actor 67의 좌표만 후보 `(13,15)→(12,15)`로 바꿨다. 후속 native engine의 외부 C201 args `2022FE47` frame 551에서는 시작 좌표 `(13,15)`와 원 actor record가 복원됐다. 따라서 이 후보 좌표 쓰기를 실제 이동 완료라고 해석하지 않는다. 전체 actor pool의 차이는 actor 67의 `+0` 한 바이트뿐이며 pilot·unit 테이블은 raw same이다. consumer 반환은 0, EE07 leaf 반환은 `6003`, flag bit7은 native clear됐다. EE07 진입부터 반환까지 args `20211A2D`와 VM RESUME `20212330`은 바뀌지 않았다. 이 RESUME를 AI 현재 args 또는 새로운 actor의 AI 재개 주소라고 부르지 않는다.

독립 `native-f322composed-ai548-ee07-context-f-2`는 같은 source MCA에서 두 actor-context 바이트의 native write만 관측했다. `returncode=0`, `timeout=false`, 127 hit/한도 1200, poke 0이다. 앞선 원래 EE0C가 frame 434에 두 VM actor를 원래 actor 61로 쓴 뒤, main opcode `ED`의 scheduler `0601EE6C`가 frame 540에 `0601F0F0`/`0601F0F2`에서 stack+`12B`의 값 67을 `060C0710`/`060C0711`에 각각 썼다. 그 뒤 EE07은 같은 값 67과 global 67을 소비했다. 두 바이트가 이번 관측에서 같았다고 주소와 계약을 동일하게 취급하지 않는다. 첫 context probe는 `0605FFC0` loop PC 관측이 1200 hit 한도를 먼저 채웠으므로 EE07 전체 또는 setter 전체 근거로 쓰지 않는다.

사적 `f-ee07-selector-concrete.py`는 기존 vmsym에 accepted native selector 바이트를 넣고 **합성 RAM**으로 84 case를 실행했다. 16개의 대상 마스크, 기준·대상 state의 각 32 bit, 무효 기준·대상, identity mapping이 없는 두 actor, 최대 74 actor 출력에 대해 oracle 배열·배열 이후 sentinel·배열 외 쓰기 없음이 맞았다. `0609E8B0` bit helper 외의 pilot/unit lookup은 없고 unmapped read는 실패하게 했다. 이것은 실제 에뮬레이터 또는 새 actor 62 실행 증거가 아니다.

근거는 사적 `f-native-enemy322-ee07-proof.py/.json`과 `f-ee07-selector-concrete.py/.json`이다. 배열 trace SHA-256 `dc1d629d07d3b0fbcb7e0d8dd55f0f256ada0798b627e055405dfe5684edc9be`, context trace SHA-256 `51192050f990821ee004df7f7a93ebb6974c560d18bbd8b73036dce2c7e26c60`. 이 최초 최소 계약은 **다른 actor 67의 실제 실행**을 관측한 범위다. 새 actor 62의 실행은 아래 별도 own-MCA native 진행으로 확인했으며, 그 두 근거를 구분한다. ED 전체 eligibility/queue 선택, AI548의 `88.00` loopcap `0605FFC0`, 나머지 외부 consumer·전체 roots/AI lookup closure·미래 최대 할당·모든 장면의 helper 상주성 및 EXEC/IP 제품 출처 계약은 남아 있다. 신규 증원 제품 기능은 계속 비활성 상태다.


## 새 actor 62의 동일 EE07 실제 실행

위 array-f1의 종료 MCA만 이어받아 세 번의 bounded native 진행으로 같은 이미지의 적군 행동을 더 관측했다. 모든 source MCA와 앞 단계의 output MCA whole SHA-256 연결이 맞고, 모두 `returncode=0`, `timeout=false`, poke 0이며 hit 한도에 닿지 않았다. A 패드 입력으로 전투를 정상 진행했고 새 후보·RAM 조작·강제 media ID는 없다. 각 단계는 다음과 같다.

| 사적 단계 | 종료 시간 | hit / 한도 | EE07에서 실제 acting actor |
| --- | ---: | ---: | --- |
| `native-f322composed-ai548-ee07-advance-f-1` | 33.14초 | 26 / 700 | 70, 65 |
| `native-f322composed-ai548-ee07-advance-f-2` | 51.20초 | 26 / 700 | 66, 68 |
| `native-f322composed-ai548-ee07-advance-f-3` | 47.15초 | 28 / 700 | 64, **62** |

세 번째 source MCA SHA-256은 `4f820ad6661c61ce01e83617349fb5718e9eb4c8a2795351db37cbb8dede38bb`이고 실제 trace SHA-256은 `35f3636177cab0321490c93e6160ffd78d74c98f091662d7a4d5595044fa2755`이다. frame 2529의 C201 args `20211A28` 다음 frame 2532에 **새 actor 62**의 EE07 args `20211A2D`를 실제 관측했다. actor 62의 `+2`는 unit cache 21, 그 unit의 `+15`는 pilot cache 20이다. 실제 unit word는 80, pilot word는 322, LV는 4, linked unit cache `+16`은 `FF`여서 원래 5턴의 LV7 pilot 322 개체와 혼동하지 않는다. actor의 저장된 AI resume `20211A4E`는 해당 순간의 args `20211A2D`와 다르다.

VM 기준 actor `060C0710`·acting actor `060C0711`·global `060C05F0`은 각각 62였다. selector 호출의 signed selector `-7`, `r7=0`, 배열 주소 `060FFAF8`, `r0=9`를 실측했다. 배열 9바이트 **`[0,1,2,3,4,5,6,8,9]`**가 이 순간의 전체 actor pool과 새 actor 62의 대상 마스크 1로 계산한 oracle와 일치했다. 소비자의 stack+80에는 acting actor의 **32-bit 값 62**가 저장돼 있었다. 이 stack 필드를 1바이트 actor 배열이나 VM actor byte와 혼동하지 않는다.

EE07 진입부터 consumer 반환까지 전체 actor pool의 바뀐 레코드는 새 actor 62뿐이고 그 레코드의 `+0,+1` 좌표만 후보 `(15,17)→(12,16)`로 바뀌었다. pilot·unit pool은 raw same이다. consumer 반환 0, leaf 반환 `6003`, native flag bit7 clear, args `20211A2D`와 VM RESUME `20212330`의 유지도 확인했다. **frame 2540의 후속 외부 C201 args `2022FE47`에서는 원 좌표 `(15,17)`와 진입 시의 raw actor record가 복원됐다.** 따라서 이 근거는 새 actor가 원래 AI의 대상 배열을 만들고 소비자가 후보 좌표를 쓰는 경로를 실행했다는 뜻이며, 이후 이동·공격 engine이 후보를 끝까지 실행했다는 증거는 아니다.

사적 `f-native-enemy322-ee07-actor62-proof.py/.json`의 결과는 `PASS_BOUNDED_NEW_ACTOR62_EE07_FFF9_NATIVE_EXECUTION`이다. 후보 이미지 whole SHA-256은 재검사 후에도 `a54c49a8b4f9e051f407fbf584b579d054cdac64f7e63cb0488aaa08c968c5ca`다. selector의 `-7`은 full pilot ID 조회를 하지 않는 actor 마스크 분기라는 최소 계약과, 그것을 새 actor 62가 실제 실행한 근거를 확보했다. 남은 최소 frontier는 후보 좌표의 후속 이동·공격 engine 소비, ED scheduler의 전체 eligibility/queue 계약, `88.00` 외부 loop, 전체 roots/AI의 간접 lookup, 다른 경로의 최대 미래 할당, 모든 장면에서 helper 상주 및 EXEC/IP 제품 출처 계약이다. 제품 신규 증원은 여전히 비활성 상태다.

## 승인 원본만으로 진행한 별도 F 기준 경로

2026-10-11 갱신. 위의 사적 EXEC/IP 변경 후보와 구분하기 위해, 승인 F v0.5 a 전체 이미지 `b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9`를 수정하지 않고 새 부팅부터 정상 패드 입력으로 진행했다. 이 경로는 selector 1의 초기 본문을 거친 뒤 selector 51 / 물리 본문 31로 전환된다. 본문 31은 13,804 bytes, SHA-256 `550413260020cd30dd4f746632ddf48672d47026fab54d9b8e884200914cbd8b`다. 이 관측을 본문 1 / unit 80 / pilot 322의 원본 생성 경로 증명으로 사용하지 않는다.

첫 11개 창의 기준 보고서 `baseline-11-stage-proof.json` SHA-256은 `3172fa9c2beef77194a2e9b6e4f6cc89bd2d7ce80e9bfbd0f9979d80d0fe3444`다. 별도 아군 3턴 후속 보고서 `player3-followup-proof-v2.json` SHA-256은 `d4424e6fe3d06a627c5ead16e3af0decf28af4f4f84cc38326986bdad92fedfd`다. 후속 여섯 창은 11,430 frames / 1,609 hits였으며 정상 종료하고 시간·hit 한도에 닿지 않았다. 아군 2·3턴의 원래 분기, 원래 E9의 저장점 2335, 부모의 새 수치 조회까지 확인했다. 전체 풀의 같은 스냅샷이 중간의 모든 쓰기 부재를 뜻하지는 않는다. CA01의 메모리 할당 entry를 별도로 보지 않은 창에서 generic constructor hit가 없다는 이유로 할당이 없었다고 하지 않는다.

초기 로딩 중 helper RAM이 0인 종료 상태도 있다. 실행된 native 명령과 종료 시 상주 바이트 검증을 구분하며, 모든 종료 상태에서 helper가 상주했다고 주장하지 않는다. 원래 적 5턴 사건의 true 경로, 게임 내 저장·새 부팅 이어하기는 이 기준 보고서의 완료 범위가 아니다.

## 본문 31의 원래 CA02 생성 관측

원래 CA02 offset 1861 / 행 1864의 x=8, y=16, pilot 88, LV6, unit 320을 별도로 관측했다. 처음 1,800-frame 창에는 constructor hit가 없었고 준비 창으로만 분류했다. 다음 1,800-frame 창에서는 정확한 selector·본문 포인터·명령 cursor·원문 행·caller·레지스터 인수가 맞는 생성 한 건을 인증했다. entry seq74부터 return seq107까지 전체 6,560-byte 풀을 읽었으며, 종료 스냅샷의 변경 레코드는 unit 4, pilot 4, actor 73 각각 하나였다. 이는 각 단계의 전체 write set이나 할당 실패의 원상 복구를 증명하지 않는다.

생성 직전의 같은 원본 자체 MCA에서 재생한 80-frame 관측은 실제 stack 첫 long의 unit 320도 확인했다. 원래 배치 query는 x=8, y=16, mode=6, r7=-1이며 signed result 0으로 성공했다. mode 0으로 가정하지 않는다. 실제 점유·지형 포인터는 각각 `2028D800` / `2028E800`, 요청 셀은 `2028DC08` / `2028EC08`이다. 이 값은 entry·query·return의 raw trace에서 각각 확인했다. 단위 descriptor의 byte 37은 `68`에서 `66`으로 바뀌었지만 이 경우 상위 nibble은 6이었다. 이전 descriptor 값을 다른 기체의 배치 mode로 사용하는 근거가 되지 않는다.

descriptor의 320-byte clear, visited의 4,096-byte clear, 후속 descriptor clear의 DMA submit / return / wait 경로도 관측했다. 실제 소프트웨어 DMA 문맥과 호출 인수의 근거이며, 관측 도구가 지원하지 않는 하드웨어 레지스터를 0으로 읽어 완료를 증명한 것이 아니다. pending-operation registry count는 이번 생성에서 0→1이었다. 모든 후속 사건의 queue 최대치나 신규 증원 여유를 뜻하지 않는다. pointer-discovery 보고서 SHA-256은 `4b8d25d230de298f15f0ae1254d637385ac22ebe104a18ea6033579402019fc0`이다. 원문·trace·MCA·스크린샷과 분석기는 저장소 밖에 보존한다.

## F 페이즈 이동 시안: 정적 통과와 남은 실제 소비

본문 31의 기존 적 5턴 사건을 아군 시작으로 옮기는 시안은 메모리 안에서만 생성했다. 원래 14 roots, 초기 저장점 1588 / 2315, 반복 저장점 2335를 유지하고 첫 진입과 반복 진입을 따로 처리한다. 원본 제어 시안은 253개 컴파일 사례와 5,140개 CPU 사례를 통과했다. 추가 가드 시안은 최대 압축 6,865 bytes로 원 슬롯 6,973 bytes 안에 들어가고, 정확한 재생성·복원·변조 거부 및 독립 상대참조 검토를 통과했다. 이 CPU 검증에서 행동·그림·C003·C102의 일부는 명시적으로 opaque 경계다. 실제 게임의 사건 완료 검증을 대신하지 않는다.

원래 C00E는 미등록 파일럿의 FF lookup을 먼저 검사하지 않는 경로가 있다. 합성 RAM에 정확한 승인 native 바이트를 실행한 한 반례에서는 파일럿 89가 없는데 조건을 통과하고 C003가 다른 actor의 좌표를 바꿨다. 이 상태가 실제 원본 플레이에서 발생했다는 주장은 하지 않는다. C011 가드는 이 반례를 차단했으나 정상 true 경로에서 임시 수치 RES+20을 metric으로 바꾼다. 등록된 alias, linked-unit FF, 대사 이후의 인물 상태, 원래 행동·지연·부모의 수치 소비도 따로 닫아야 한다. 원문 끝의 `050014`는 CTX countdown 20이며 RES+20 clear가 아니다.

가드 시안의 동결 manifest SHA-256은 `d579cb3075c301963bb4a8cb88d2ef7da7eb4135326c0060430e602ab2cc327c`다. **F 페이즈 변경과 신규 이벤트·증원 제품 기능은 아직 활성화하지 않았다.** 다음 실제 검증은 원래 적 5턴의 대상 조회→대사→이동·제거→지연→부모 복귀에서 임시 수치와 대상의 소비를 관측하는 것이다. 이 조사로 승인 릴리스, 출처 허용 범위 또는 배포 권한을 바꾸지 않는다.

## 같은 원본 생성의 배치 입력 조각과 실제 셀 변경

같은 자체 pretarget MCA와 정상 A 입력을 사용한 별도 80-frame 창은 2.53초 / 175 hits로 정상 종료했고 시간·hit 한도에 닿지 않았다. 32개 고정 span, dynamic peek 0, master PC 32개를 확인했다. target는 frame 9의 seq53..92 한 건이며 앞서 관측한 unit 320 / pilot 88 / LV6 / 좌표 8,16과 실제 stack 인수가 일치했다. query의 mode는 6이고 raw 반환은 0이다. 점유 셀은 `FF→49`(actor 73), 지형 셀은 7로 유지됐다.

root34 포인터 셀과 mode6의 선택표 두 조각도 같은 창에 읽었다. 표와 해당 지형 index의 값은 관측한 175개 event에서 승인 TSR 원문과 일치했다. WRITE 범위 `060CADA1..060CAEE3`에는 전체 창에서 명령 해독 기준 master store 56개(동일값 44개)가 있었고 target 구간에는 0개였다. 이것은 선언한 범위의 명령 관측이며, 실제 버스 쓰기 전체나 모든 CPU·DMA 쓰기, consuming instruction의 전체 read set, query→commit 원자성을 증명하지 않는다. registry 전체 표와 entry 전체 pool을 이 32-span 구성으로 동시에 읽었다고 하지 않는다. 독립 분석 보고서 SHA-256은 `f8d78414dc9503f9aa74dc58e3c0aab4ad011495eaf6cdb9d7ba52997a6dcd2c`, 단일 창 요약은 `9820e4c51566c262103ee49cb37a7a4ca855d7c8545a08887ef1a76809387f14`다.

앞선 넓은 READ 관측은 target 전 frame 6에서 8,000-hit 한도를 채워 실패로 보존했다. 이를 target 인증에 쓰지 않는다. 그 runner의 종료 보고서에서 range 주소가 elapsed 타이머 변수를 덮은 문제도 발견하여 별도 버전에서 고쳤고, 기존 보고서·스크립트는 변경하지 않았다. 이 mode6 관측은 별도 source1 / unit80 / pilot322의 mode0 계약이나 신규 증원 제품 허가로 확대하지 않는다.

## 실제 배치 query 입력의 승인 코드 재실행

위 원본 관측의 query 진입 seq77에서 읽은 32개 영역만 사용해 승인 EXEC의 명령을 bounded CPU로 실행했다. 기본 합성 RAM과 opaque 함수 대체는 제거했으며, query·root 조회·확인된 shift helper 외 PC 또는 읽지 않은 메모리에 접근하면 실패한다. 375 instructions / 450 reads / 25 writes로 끝났고, 반환 `r0=0` 및 16개 일반 레지스터·PR·GBR·SR 전부 실제 query 반환 seq78과 일치했다. 쓰기는 해당 호출이 소유한 stack 60바이트 안에만 있었다. 입력 영역 누락·허용되지 않은 helper·step/read/write 한도 위반의 9개 거부 검사도 통과했다.

이 호출의 반환 0은 **배치 mode 0이 아니라 선택표의 첫 번째 후보 순번**이다. 실제 mode6 표의 후보는 2, 1, 0이고, 지형 7에서 첫 후보 2의 compatibility byte `81`이 유효하여 순번 0을 반환했다. 뒤 후보 1의 `02`는 이 실행에서 읽히지 않았다. 보고서 `source31-actual-query-cpu-20261010-1/report.json` SHA-256은 `78616f4506e140a70c4191772b17fa7625baefa779a35e2459aa30ee21f10c38`이다.

이는 실제 입력에 대한 **코드 모델의 구체적인 read set**을 닫은 근거다. 실제 버스의 모든 읽기나 두 CPU·IRQ·DMA 사이의 배타성을 증명하지 않는다. 현재 native adapter는 선택한 CPU 하나만 기록하고 IRQ vector/stack 자동 관측은 비활성이다. 실제 SR의 interrupt mask도 0이므로 같은 frame과 관측한 master store 0개를 critical section으로 해석하지 않는다. 신규 증원과 source1의 다른 생성 경로는 계속 별도 검증 대상이다.

## F 턴 증가 명령의 99 상한

승인 F EXEC의 D4.02 경로를 모든 GS+16 byte 값 256개와 GS+14 word 경계값 4개에 대해 별도로 실행했다. 1,024개 사례에서 GS+14는 16-bit 증가·wrap을 하고, GS+16의 턴은 `min((기존 unsigned byte >> 1) + 1, 99)`로 증가하며 하위 페이즈 bit를 보존했다. 한 사례의 최대 25 instructions / 31 reads / 3 writes였고, 독립 검토에서 경계 64개 재실행과 4개 제한 위반 거부를 확인했다.

이 명령으로 증가한 턴은 99에서 유지되므로 그 경로만으로 5·6턴 equality가 숫자 wrap 때문에 다시 참이 되지는 않는다. 99턴 equality를 한 번만 실행하려면 별도의 완료 상태가 필요하다. 이 source 검증은 100턴 실제 플레이, 다른 GS writer, 콜백 실행 횟수 또는 증원 queue의 미래 여유를 증명하지 않는다. 원 보고서 SHA-256은 `fdae9a19f867cee14deab33b10b8e10856a930c80efa6021aebdd1b3d213eeec`, 독립 검토 SHA-256은 `2966a801f2c5ff6f3e7acf2c82460db0803afce3cfc3c9e447b202c50147ae0a`다.

## 원본 적 5턴 true 사건과 정상 저장 재현

2026-10-11. 승인 F v0.5-a의 정상 플레이에서 88의 등록이 사라지고 89가 남은 적 5턴에 도달했다. 원 본문31 전체13804바이트를 확인한 실제 경로는 C00E88=0 → C00E89=1 → 대사 → C002/C003 → C102 → 지연 → E9 → 부모/root8이다. RES+20은 원 행동 전체에서 1이었고, 부모 복귀 뒤 root8의 새 C00E 조회가 0으로 덮었다. C003 관측에서는 전체6560바이트 풀이 그대로이며 이를 이동 완료라고 부르지 않는다. C102의 정확한 창에서는 unit5/pilot5/actor72만 달라지고 다른 레코드는 모두 같다.

실제 아군5턴 게임 저장 뒤 MCA 없는 새 부팅에서 이어하기를 선택했다. 저장·복원의 전체 풀, GS 및 슬롯·승인 본문이 동일했고 정상 적5턴 사건을 다시 실행했다. 재실행의138개 행동 hit가 첫 원본 실행과 PC·cursor·reason·RES+20·flag·풀·GS·슬롯까지 일치했다. cold 초기 RESUME/+20이0이었다는 사실은 이전 임시 수치의 저장·복원을 뜻하지 않는다. 이 저장은 아군5턴 콜백이 이미 반환된 뒤라, 새 아군5턴 사건이 이어하기 직후 실행된다는 근거도 아니다.

원본 실행 보고서 SHA-256은 `5c47259b7085ce76a19d05e60f25fbaa8180e1a5eb5f7b5ae53d405dddf5d6a1`, 정상 저장·새 부팅 재현은 `571d0df68f1314ebd8f79cfac8e97785a9ff52ce8d3ae982c85cf35f3bf673d2`다. 별도 정상 GameSave4도 만들었으며 보고서 SHA-256은 `bcbfe5d8244c7583df56d416c99e9eca923c35872a747275b0fa863422e2ec54`다. 이 정상 저장이 아군5턴 이전의 후보 비교 입력을 제공하지만 아직 새 후보 실행 증거는 아니다.

## 후기 가드의 원래 count 재조회 시안

사적 복원 시안은 후기 C01189/F1 뒤에 원 C00E89/F1을 다시 실행한다. 따라서 선언한 동기 등록88/89 fixture에서 C002 직전 값은 원본1/시안1이다. 생성189바이트·metadata128바이트,197컴파일 사례의 최대 압축6869바이트≤원 슬롯6973바이트,28053단일바이트 훼손 거부,5140 CPU 사례·41450 native leaf 호출·1070884명령을 확인했다. 독립 검토는 압축10개·훼손95개·CPU50개를 별도로 재현했고 metric0/1/65535에서도 count1 복원을 확인했다.

이는 합성 source CPU의 복원 검증이다. 대사 중 count·alias·연결 상태 변화, opaque 행동의 실제 실행, 새 부모/once/저장 콜백 수명과 후보 게임 실행은 별도다. saved2315의 주소는 유지하지만 그 opcode는 D4에서 JMP로 바뀌며, 원 E9와 반복점 바이트 유지와 구분한다. **F 페이즈 변경 제품 기능은 계속 비활성이다.** 시안 delivery SHA-256은 `5f744b660574d943b1732852dd7c6d360bff541aaa0d8801db993851e87cb9b5`, 독립 검토는 `27a4a68521a42df64838e7aef61579c74d23cd35411aa5dad5b9b4403c4be400`이다.

## 후기 count 복원 시안의 실제 디스크 생성

2026-10-11. 위 후기 가드 시안의 아군5턴 변형을 승인 F v0.5-a에서 사적으로
생성했다. 전체 출력은 578,512,032바이트이며 SHA-256은
`a484920e89d1507ddfe6a0f053aa5dff2b1d010b42a8d1efe60ed7053198e019`다.
본문31은 14,121바이트, 압축6,869바이트로 원 슬롯6,973바이트 안에 들어갔다.
raw 245,966개 섹터 중 SCEDATA의 지정4개 섹터만 바뀌고 실제 디렉터리,
나머지51개 본문·모든 원 루트, EXEC/IP·오디오·전체 길이는 그대로다.
SCEDATA 원본·출력 각각201섹터의 MODE1 EDC/ECC를 확인했다.
현재 제품 검사와 이전 동결 제품 검사는 이 사적 BIN을
`EDITOR_CUSTOM_PROVENANCE`로 거부한다. 제품 출처 권한은 넓히지 않았다.
물질화 보고서 SHA-256은
`c7a8d5722c53e8ea0cc1328b0ea9ea317d410848c7b6135508c523aedb398124`다.
이는 디스크 생성 근거이며 새 시안의 행동·once·저장 수명 실행 성공은 아니다.

## 원본 master IRQ와 프레임 콜백의 별도 관측

승인 원본 본문31의 같은 정상 생성 장면을 읽기 전용으로 재생했다.
관측80프레임 창은 4,486 hits로 정상 종료했고 시간·hit 한도에 닿지 않았다.
adapter의 경계에서 마지막 hit가81프레임인 점은 명시적으로 기록했다.
실제 master 공통 dispatcher와 간접 호출에서 벡터64/65/66/71/74를 확인했고,
프레임 콜백은 `0603A264`, `0604A058`, `06048EA4`, `06048FC4` 네 곳이었다.
생성→query→반환의 특정 창에 관측 IRQ/store가 없었던 사실을 배타성 증명으로
사용하지 않는다. IRQ 관측 보고서 SHA-256은
`3250103107f0262ee3dae9551e54bee84cd8bda00a28b3f02c13fe6830771794`다.

기존 SH-2 해석기로 네 콜백과 `06048FDC`의 지역 분기·반환 경계를 확인했다.
간접 호출의 전이적 쓰기와 동적 descriptor는 여전히 별도다. 승인 DMA helper
`060A7504`의 r4는 source/SAR0, r5는 destination/DAR0이며 두 인수를 뒤집어
해석하지 않는다. 같은 창에서 관측한31개 DMA 제출의 실제 목적 범위는 주소
별칭을 정규화해도 이 mode6 query의 구체적 읽기 범위와 겹치지 않았다.
이는 미관측 DMA·slave CPU·이전 진행 중인 전송·다른 descriptor 값까지
배제하지 않는다. source1/mode0과 미래 할당 여유도 확인한 것으로 계산하지
않으며 신규 증원은 계속 비활성이다. 별도 source 검토 보고서 SHA-256은
`454cbb295db009a921d98d975d0a63b4f4b3b12f08426cadd6ebbf71c0093917`이다.

### F 페이즈 형식과 기존 턴 편집의 조합 준비 (2026-10-11)

현재 승인 F a를 실제 편집기 검사 경로로 열어 본문31·선택51의 기존 변경
마스크를 다시 산정했다. 허용된 해제 데이터 변경은 `2600`의 턴 값 한
바이트뿐이며, 초기 진입부·복제 대상 action·상대 참조·등장 좌표는 이
본문의 기존 편집 마스크에 포함되지 않는다. 최신 a/b/c의 해당 본문은
해제 길이13804, 마스크 해시와 불변 데이터 해시가 모두 같다.

사적 G2 컴파일러의 원문 전체 해시 검사는 기존의 합법적인 턴 변경
98개를 모두 거부한다. 이를 그대로 제품에 연결하면 기존 편집과 페이즈
변경을 함께 사용할 수 없다. 별도 사적 어댑터에서 이 한 바이트만 기존
정규값5로 복원하고 나머지 원문 전체를 인증한 뒤, 현재 선택한 턴을
G2 조건에 보존하는 방식을 검사했다. 열린 턴1~99와 대상 아군 턴
2·4·5·6·99의 495개 왕복 및21개 위조·범위 거부 검사를 통과했다.
적군 시작으로 되돌릴 때는 기존 턴 필드만 고치며 추가 trailer를 남기지
않는다. 아군5턴 해제 데이터는 실제 게임 검증 중인 G2 표본과 전체가
같다(`317471c561732030457459e716d5dae6e9ee4c6fbeeb5d123716fcbc8cd68310`).

이 어댑터는 제품에서 import하지 않는다. 현재 제품의 F 페이즈 권한은
변하지 않았고, 실제 action·저장·새 부팅 근거와 모델·복원·JSON·BIN
출력의 완전한 연결은 별도로 필요하다. 조사 보고서 SHA-256은
`faae27d99d95dfd365b1fed240c7803dce2fef0559b79c94647237e102988ff0`,
왕복 검사 보고서는
`ec371bc1ffd4cd9b6ee029feefc8876fc770cbe8be8f9005f5d5ba59caeaa3f9`다.

## FP01 로컬 제품 통합과 후속 실제 실행 — 20261011-19

위의 사적 거부·조합 준비 상태 뒤에, 본문31·선택51의 기존 사건 한 곳을
제품 형식 FP01 rev3으로 연결했다. 원 초기2턴 사건 유지, 아군5턴 발동·
원 처리, 새 게임 저장5·MCA 없는 cold Continue5와 적군5턴 중복 억제를
각 실제 경로로 확인했다. 제품 worker 출력의 전체 BIN은 앞선 실제 G2
물질화 파일과 같은 해시이며 기록 없는 새 브라우저에서 별도 개인
영수증 없이 bounded 프로필로 열린다. 변경 목록·복원·JSON·재편집을
포함한 연결과 모바일의 불필요한 조합 행 제거도 로컬 코드에 반영했다.
이 통합은 새 이벤트·증원·인물 사망/도착 이력 기능의 완료가 아니다.
구체적 원문·출력·실행 범위는 [F 페이즈 기록](EDITOR_PHASE_CALLBACK_RESEARCH.md)을
따르며, 모든 턴과 다른 사건·분기의 실행을 주장하지 않는다.

## 신규 증원 두 진입부의 동일 디스크 시험 — 20261011-20

본문1과31의 별도 신규 증원 시안을 한 사적 디스크에 함께 넣은 뒤,
MCA가 없는 새 부팅부터 정상 타이틀·새 게임·주인공 선택까지 진행했다.
각 단계의 입력은 직전 실제 화면을 확인한 뒤 한 번씩 실행했다.
외부 MCA, 미디어 ID 강제 지정, RAM 수정이나 분기 강제 선택은 사용하지
않았다. 디스크 전체 해시는
`49311730f61c589477a9fd8a0f74f5621a0e2e0713a08f72f1eb444859bd12e7`이다.

현재 실제 화면은 ‘이대로 진행하시겠습니까?’의 ‘예’가 선택된 확인
메뉴다. 마지막 입력은 정상 종료했고 관측 한도에 닿지 않았다.
현재 본문1의 전체15192바이트와 selector1·원시 턴2, IP256 및 연결 셀은
시안과 일치한다. 마지막 메뉴 입력 전후의 고정6560바이트는 같으며
관측한 생성자 호출은0회다. 이6560바이트를 이후 전체 할당 여유나 다른
CPU·DMA 쓰기의 부재 증명으로 사용하지 않는다.

따라서 이 시험은 두 진입부가 들어간 디스크의 정상 초기 진입 근거다.
추가 기체의 출현, 원래 기체11기의 보존, 이후 턴의 재할당·중복 억제,
게임 저장·새 부팅 이어하기까지 완료한 시험으로 확대하지 않는다.
첫 주인공 확인 입력의 별도 실행 근거 해시는
`6d20a229804e68d51a8586132a3c73bebd92f846098ce8bdee72fda637fe61d7`이다.
신규 증원과 이력 조건의 일반 제품 권한은 계속 비활성이다.

### 정상 확인 뒤 본문31과 첫 대화 진행

이후 실제 확인 메뉴의 ‘예’를 정상 A 입력으로 확정해, 본문31·선택51의
사야카 대화로 진입했다. 이어 A 한 번으로 코우지의 응답이 나타났다.
두 실행은 정상 종료했고 관측 한도에 닿지 않았다. 본문31 전체14140바이트의
SHA-256은 `c9277bb34873df70ccc5463892d443a6bd0372f384278cee4a624be86c835124`로
결합 시안과 같다. 마지막 대화 입력 전후에는 고정6560바이트 풀·콜백·
IP256·연결 셀과 게임 백업이 유지되며 생성자 호출은 아직0회다.

이는 본문1에서31로 정상 이동하고 대화가 진행되는 근거이며 신규 증원
발동 근거가 아니다. 현재 CTX 옆 `D0.02`를 입력 대기 명령52로 해석하지
않는다. 정상 확인과 첫 대화의 별도 실행 근거 SHA-256은 각각
`dded54dbb737a6982dd36af31129c05098db0ab3cc780a260262539b3ac4f5fc`,
`cac361bdb0f498b8ffe42e20130cadbae4220b373ca6f89e85fc7dedfbb8587e`다.

### 후속 대화의 실행 기록 복구와 정상 진행

다음 사야카 대화 관측에서는 실행 뒤 MCA 해시 검사기가 읽은 시각(atime)
변화를 파일 변경으로 잘못 판정했다. 원 trace의 종료와 화면·본문·풀은
복구 감사했지만, 당시 native 종료 코드는 기록되지 않아 미확인으로 남겼다.
그 출처를 정상 종료 자료로 바꾸거나 같은 실행을 다시 수행하지 않았다.

검사기는 장치·inode·크기·수정 시각·상태 변경 시각을 비교하도록 수정했고,
실제 `proc.wait` 결과를 후속 해시 검사보다 먼저 저장·flush·fsync한다.
수정한 실행기로 해당 자체 MCA에서 정상 A 한 번을 입력한 다음 관측은
요청165프레임·3.86초·496 hit에서 정상 종료했다. 시간·hit 한도에 닿지
않았으며, 실제160프레임 화면의 코우지가 잠을 더 자겠다는 응답으로 진행했다.

모든496 hit의6560바이트 풀·GS32·콜백 슬롯·두 registry 구간과 종료 시
본문14140바이트·56바이트 루트·IP256·연결 셀·공통34바이트는 입력 전과
같다. CTX의 부모 한 바이트와 RES 네 바이트는 달라졌다. 부모948→953은
원래 `B3` offset948의5바이트 진행과 일치한다. 저장 파일7개는 같고
SMPC의 시각 변화는 따로 기록했다. 관측한 생성자 호출은0회다.

이번 정상 종료는 이전 단계의 미확인 종료 코드를 보완하지 않는다.
신규 증원·중복 억제·게임 저장·새 부팅 완료를 주장하지 않는다.
후속 실행 검증 묶음 SHA-256은
`6396ef1034a4473ad846d7056eaed49e728e671e200996104b22cbb52353a853`이다.

### 다섯 후속 대화와 무입력 장면 전환

같은 자체 이미지와 MCA를 이어서 실제 화면을 매번 읽고 A 입력을 다섯 번
따로 실행했다. 다섯 실행 모두 `proc.wait=0`, 시간·hit 한도 미도달이다.
마지막 화면은 인물 대화에서 검은 전환을 거쳐 일본의 지리 배경으로
바뀌었다. 이를 전술 지도 조작 화면으로 판정하거나 추가 A를 입력하지
않았다. 실제 CTX cursor는 본문1056, 원래 B3 시작1055의 인수 위치이고
부모 word는0이다. 이0을 음수 본문 offset이나 시나리오 번호로 해석하지
않는다. 다섯 실행의 동결 보고서 SHA-256은
`e3738ba119e93f8d94e0f89f4e8389309eb43cd81db00ddf5b4962b9904ef308`이다.

이 자체 종료 MCA에서 별도로 버튼 없이245프레임만 관찰했다. 실제
1프레임은 지리 배경,120·240프레임은 코우지의 인사 대사다. 관측은
5.35초·709 hit에서 정상 종료했고 시간·hit 한도에 닿지 않았다.
CTX는 공통 D0.02.00 대기 문맥으로 돌아왔고 부모1060은 원래 B3의
5바이트 진행과 일치한다. 이 한 전환은 무입력으로 진행된 실제 근거이며
모든 B3의 시간 대기·입력 대기 규칙을 해석했다는 뜻은 아니다.

모든709 hit의6560바이트 풀·GS32·콜백·두 등록 구간과 종료 본문14140
바이트·IP256·연결 셀·공통34바이트는 그대로다. 관측한 생성자 호출은
아직0회다. 신규 기체 출현, 원래11기 보존, 미래 재할당·중복 억제 또는
결합 시안의 게임 저장·새 부팅 완료를 주장하지 않는다. 무입력 관측의
동결 보고서 SHA-256은
`59469f7d3d497ffe5f42be89eb515232336c4e140d0ef914541e65bfe1f6ffb8`이다.

### 도입 대화 종료 직전까지의 개별 입력

위 인사 대사에서12번, 그 자체 종료 상태에서 다시10번의 A 입력을 각각
독립 실행했다.22개 실행은 모두 실제 종료코드0이고 시간·hit 상한에
닿지 않았다. 담당 에이전트는 실제66개 PNG를 읽었으며 부모 에이전트는
12번째 사오토메 대사와 마지막 유미 교수 대사를 별도로 확인했다.
각 관측의 본문·IP·연결 셀·GS·콜백·전체6560바이트 풀과 등록 구간은
유지됐다. 그 사실로 도입 뒤 생성이나 게임 저장을 검증했다고 하지 않는다.

첫12개 묶음은 지정한 실행 수에서 멈췄다. 다음 별도10개 묶음은 원본
B4 시작1517·부모 반환1522의 마지막 대사 경계에서 멈췄으며11번째
입력·출력을 만들지 않았다. 원본 다음 명령은1522의 `50.01.00`이고
그 뒤 C7·E9·root4 진행은 아직 관측하지 않았다. 생성자 관측도0회다.
두 동결 보고서 SHA-256은 각각
`c5f66ee6098d00896572c1c0d8935a98a52276a6542a541e88a79030fbdde366`,
`100434a7dd5addcd666a9d7410f3fc510fadfab468b224ae1d33e77f30e60cb1`이다.

### 이력 조건 설치를 위한 원본 시나리오 복원 경계

승인 원본 F에서 정상 Continue5를 한 번 실행해 실제 resource14·member51·
file27의 새 읽기와 해제를 관측했다. 실행은28.361초·376 hit·실제 종료코드0이고
시간·hit 상한에 닿지 않았다. 같은 handle의 새 읽기에서 복사 byte 수는
0→2048→4096→6144→8192→10240으로 진행했다. provider의 상태4 반환
명령은 복사8192·T52=0일 때 먼저 나타났으므로 이것만 완료 조건으로
사용할 수 없다. 뒤의 복사10240·T52=6, read 반환10240과 decoder 반환
13804를 각각 확인했다. 압축 입력의 끝은6973바이트이며 세 길이를 구분한다.

복원 목적지는20211800이고 종료 본문 전체는 승인 원문과 같았다. 실제
메모리 관측은 압축 입력604개 고유 바이트를 대조했으므로6973바이트 전체를
native 캡처했다고 주장하지 않는다. 이 결과는 해제 직후의 좁은 설치
경계를 고르는 근거다. 다른 목적지 쓰기·취소·리셋의 소유권 해제,
격파·도착 이력 저장과 새 부팅 복원, 완결편 적용은 여전히 미완성이다.
앞선12000 hit 상한 관측은 별도 부분 결과로 보존한다. 실제 성공 감사
보고서 SHA-256은
`b80cc462fe5bd591abf99aba22c4ebce9e47a655791f17da4d304abbfc4d1cd6`이다.
### 마지막 도입 대사 뒤 지도 진입의 실제 관측

같은 사적 조합 출력의 자체 마지막 대사 상태에서 정상 A를 한 번 입력했다.
805프레임의 관측은 실제 프로세스 반환 0으로 종료했고, 1,339개 기록에서
시간 초과·관측 상한 초과·오류가 없었다. 네 캡처에는 이전 마지막 대사,
검은 전환, 숲 지형, 지형과 커서가 차례로 나왔다. 작업자는 네 장을 읽었고
루트 검수도 마지막 지도 캡처를 직접 확인했다.

원래 root2의 E9 뒤 공통 E8.FFFC가 첫 root4를 호출해, 원래 E9의 재개 주소
1588을 슬롯에 보존하는 경로를 관측했다. 원문·IP·디스패치는 그대로였고,
기체·파일럿 각 네 레코드의 정상 초기화가 관측됐다. 전체 풀에서 바뀐
51바이트는 그 두 표의 변화이며 맵 개체 표는 바뀌지 않았다. 이 관측에
새 가드·기체 생성 함수 호출은 없다. root4의 두 번째 초기 경로와 추가
배치 행은 아직 실행되지 않았으므로 원래 배치와 추가 배치의 생성 성공으로
해석하지 않는다. 원래 본문1의 11기 생성 검사와 현재 본문31의 배치는 서로 다른 경로다. 현재 자체 상태에서 추가 입력 없이 멈췄다.

동결 보고서 SHA-256은
`617a2e3d588ce8989157fdd3c6e72f3cb2af5d377a81c3fee0c8cdbb4190cd0a`이며,
독립 재검사는 33개 핀을 통과했다. C7 근처에서 읽은 커서는 명령 다음의
인수 주소라는 용어 보정도 별도로 보존했다. 이 관측은 신규 증원의 제품
활성화, 반복 실행 억제나 게임 저장·새 부팅 검증 근거가 아니다.

별도 원 실행 파일의 D4.05 초기화 명령은 현재 페이즈 비트를 유지하며
턴을 1로 설정한다. F·완결편의 경계값 16사례를 실제 명령 CPU로 검사했고,
해당 상태 바이트와 스택 이외의 쓰기는 없었다. 원래 공통 group2의 8번
진입점은 조건부 길이 해석으로 각 14명령을 연결했지만, 내부 호출들의
실제 완료와 현재 상태에서의 실행을 증명한 것은 아니다. 조사 보고서
SHA-256은 `6d9e1b81c28664da8a1b4fbecfcd9289527517d76a3856308b06641adf2f9aaf`다.
이는 슬롯 선택과 초기화 순서를 조사하는 근거이며 화수·분기 매핑이나
새 증원 권한을 부여하지 않는다.
