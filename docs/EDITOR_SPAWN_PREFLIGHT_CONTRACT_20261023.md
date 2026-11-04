# 즉시 증원 전 빈칸 검사의 최소 계약

2026-10-23. 실제 맵에 CA02로 한 기를 추가하는 기능은 보유 기체만 만드는
C2.04와 다르다. 기존 actor allocator의 FF 실패를 검사하지 않은 채 CA02를
호출하는 새 기능은 허용하지 않는다. 이 문서는 승인 F EXEC의 정적 재대조와
[기존 실패·FQ02 조사](EDITOR_SCENARIO_RESEARCH.md)를 재사용한다. 아래의
최초 설계, 과거 AQ01/AQ02와 현재 AQ03의 실제 구현·검증 범위를 구분한다.

## 기존 VM으로 확인 가능한 두 cache

| 목적 | F 명령 bytes | native 근거 | 판정 |
|---|---|---|---|
| 파일럿 빈칸1개 이상 | C1 0A 00 00 | C1.0A `06028894` → full16 ID lookup `0602A3E0` | 128개12바이트 cache의 firstword=0인 첫 항목을 찾는다. 성공 predicate면 빈칸이 있다. |
| 기체 빈칸1개 이상 | C0 0D 80 00 00 | C0.0D `06022AAC`, unit 경로 `06022B28..6A` | mode80의 low2=0은 속성 필터 없이 128개30바이트 cache의 firstword=0인 항목을 찾는다. |

C1.0A는 먼저 거짓 bit를 세우고 ID0 lookup이 FF가 아니면 cache +9 값을
VM+20에 쓰고 predicate bit를 지운다. 이 숫자는 빈칸 **개수**가 아니므로
F2/F4의 수치 비교로 해석하면 안 된다. 바로 뒤 F1.00의 실패 분기로 검사한다.
ID0을 조회할 때도 같은128칸의 유효 cache 주소 안에서만 +9를 읽는다.

C0.0D는 subcommand 뒤 mode1바이트와 ID2바이트를 받아 전체5바이트다.
mode80은 기체 cache를 고르고 low2=0은 필터를 생략한다. ID0은 기체의
일반 ID가 아니라 빈 레코드의 firstword와 일치시키기 위한 값이다. 이 명령도
참/거짓 predicate를 사용하며 빈칸 개수를 반환하는 것으로 만들지 않는다.
실제 C0 table cell은 `060B2978 → 06022AAC`다. C0.0F 사각형 조회와
번호·길이가 다르다.

두 검사는 한 기에 필요한 각 한 칸의 존재만 확인한다. 여러 항목을 한 번에
생성하거나 파생 cache를 추가 생성하는 다른 constructor에는 개수 검사가
필요하다. 기존 CA02 일반 생성 함수 `060256BC`와 CA00 아군·변형·합체
생성 경로를 같은 것으로 취급하지 않는다.

## actor allocator 자체를 조회 helper로 부를 수 없는 이유

F `060251EC`의 첫 검색은 actor74칸의 firstbyte=FF를 찾지만 함수 전체는
읽기 전용이 아니다. 검색 성공 뒤 기체·파일럿 연결과 배치 query를 거치고,
`0602532E`에서 actor 상태, `06025336/340`에서 좌표,
`06025360`에서 맵 점유표, 이후 연결·AI 포인터 등을 쓴다. 따라서 이 함수를
preflight에 한 번 호출한 뒤 CA02를 다시 실행하는 방법은 사용하지 않는다.
검색 중간 주소로 진입하면 원래 함수의 stack·레지스터·후속 분기 계약도
어긋난다.

기존 일반 생성자는 actor 반환 FF를 받은 뒤에도
`060257BE..060257D6`에서 `actorBase + FF * 16 + 3`에 접근하는 실패
경로가 있다. 파일럿·기체 cache에 빈칸이 있다는 사실은 이 문제를 막지 못한다.

D3 00도 actor 빈칸 조회로 쓸 수 없다. 전체 진영 mask7을 골라도 native
`06026DCC..06026DD4`가 상태 mask20000008에 걸린 점유 actor를 제외한다.
따라서 count<74여도 빈칸이 없을 수 있다. C0.25의 알려진 actor 검색은
상태 bit를 바꾸므로 순수조회 대안으로 사용하지 않는다. 확인한 명령 범위에서
부작용 없는 일반 actor 빈칸 조회는 아직 찾지 못했으며, 모든 VM 명령에
없다고 단정한 전수 증거는 아니다.

## 새로 작성한다면 필요한 최소 native 경계

기존 source를 찾지 못한 사적 FQ02를 동일하게 재현했다고 주장하지 않는다.
기존 기록의 FQ02는 직접 작성한170바이트 코드와86바이트 padding을 IP
`+1700..1800`에 두고 FC table cell4바이트를 바꿨다. 이 기록의 기능은
actor74/pilot128/unit128의 빈칸 수 중 최솟값을 VM+20에 쓰는 것이었다.
당시 ABI·읽기·실행 근거와 모든 장면의 상주 안전성이 미확정인 한계는 그대로다.

88.00은 SCEDATA tail의 SH-2 함수를 호출하는 대안이 아니다. 실제 F main
dispatch는88을 `0605FAE8`로 보내며, 이 handler는 subbyte×4로 고정
table `060B52F8`을 읽는다. sub00의 실제 cell 값은 `0605FB10`이다.
이 고정 AI 선택 handler는 이어지는1바이트의 flags를 읽으며 VM operands의
BE32 함수 주소로 분기하지 않는다. 기존 AI548에서 `0605FFC0`을 소비한
기록은 이 고정 native 함수 내부의 helper 호출 근거다. 이를 임의 native
함수 포인터 호출 권한으로 일반화하지 않는다.

현재 두 cache의 기존 predicate를 쓰는 한 기 증원에 한정한다면, 별도로
작성할 native shim은 다음으로 줄일 수 있다.

- actor pointer 전역 `060B207C`를 읽어74개16바이트 레코드의 firstbyte
  FF만 검사한다. actor·점유표·파일럿·기체에는 쓰지 않는다.
- 정확한 새 태그에만0/1 또는 빈칸 수를 VM+20에 쓰고 태그4바이트를
  소비하는6004를 반환한다. 다른 FC 입력은 원래 F000과 무변경을 유지한다.
- 일반 레지스터 r1..r15와 PR을 보존하고 허용 쓰기는 VM 결과와 자기 stack으로
  제한한다. 새 태그·정렬·빈칸0/1/74·첫/끝 빈칸·잘못된 pointer 거부를 검증한다.
- 실제 native 변경은 고정된 FC dispatch cell과 인증한 상주 코드 공간뿐이어야
  한다. 원문 IP 길이·대상256바이트의 원래 값·원 FC pointer를 먼저 확인한다.
  원복→정확 재생성→기존 승인 출처 검사 순서를 거치며 전체 EXEC/IP 허용
  마스크를 넓히지 않는다. IP 빈 영역이 모든 장면에서 비어 있다는 권한은
  이번 정적 검사가 새로 부여하지 않는다.

원래 allocator의 해당 근거 literal은 `060252F8 = 060B207C`,
`060252EC = 00FF`이고 순방향 index0..73을 검색한다. pool 주소는 literal
자체가 아니라 그 전역에 저장된 동적 포인터를 다시 읽은 값이다. 원래 검색
블록이 쓰는 r0/r1/r2/r3/r6/r7이나 성공 index r4는 독립 호출 규약이 아니므로
새 shim의 외부 ABI와 혼동하지 않는다. 새 leaf가 결과 r0 외 레지스터를
그대로 돌려주는 계약은 새로 작성·검사해야 한다.

실행 순서는 파일럿 조회→실패면 대기, 기체 조회→실패면 대기,
actor 조회→빈칸0이면 대기, CA02로 묶어야 한다. 성공 경로에서 조건을
만족했다는 이유로 F000 반환 분기를 거쳐 다음 프레임에 생성하면 검사 후
슬롯이 달라질 수 있다. 기존 FQ02 시안처럼 실패할 때만 yield하고 성공할 때는
같은 VM 호출에서 CA02까지 순차 진행해야 한다. 이는 다른 CPU·IRQ·DMA
사이의 원자성이나 이후 원래 사건의 최대 점유를 증명하는 주장과 구별한다.

이 최초 설계만으로는 actor 조회의 실제 native 구현·상주성·정확한
출처 정상화와 callback/once 연결을 완료한 것이 아니었다. 원래 constructor의
unchecked FF를 그대로 허용해 기능을 먼저 여는 대안은 사용하지 않는다.

## 실제 native 모듈과 이전 버전

`assets/editor-spawn-capacity.mjs`에 새로 작성한 SH-2 함수와 정확한 component
profile을 구현했다. 사적 FQ02의 원문을 재사용·재현했다고 주장하지 않는다.
IP의 `+1700..1800` 256바이트와 EXEC의 `+AE5AC..AE5B0` 4바이트만 바꾼다.
후자는 런타임 FC dispatch cell `060B25AC`다. 원래 값 `0601789C` 대신
IP load 주소 `06003700`을 사용한다. 실제 F a와 c의 IP6144바이트와
EXEC731504바이트는 각각 같은 전체 해시로 확인했다.

| component | 원래 SHA-256 |
|---|---|
| IP | ad00e607e43b8dd6c52f0a58d10d0ce78a5a058e2c43bb9895ffec34558783ff |
| EXEC | 308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1 |

IP header+E0의 원래 길이는1800이고 +F0의 EXEC load 주소는06004000이다.
새 함수 영역256바이트는 원래 전부0이다. IP의 RAM 주소06002000과
06003700 실행 근거는 기존 IP helper 기록을 재사용하며, header+F0를
IP load 주소로 잘못 해석하지 않는다.

- `FC AQ01`은 전체5바이트이며 actor firstbyte74개를 읽어 빈칸 수를
  RESUME+20에 쓴다. 결과6004로 태그4바이트를 소비한다.
- `FC AQ02 x y mode`는 전체8바이트다. x/y는0..63, mode는0..15만
  받아 actor 빈칸이 있을 때 원래 `0602684C`를
  `r4=&localX, r5=&localY, r6=mode`로 호출한다. 반환이 음수면0,
  성공이면 확인한 actor 빈칸 수를 RESUME+20에 쓴다. 결과6007로
  태그·좌표·mode7바이트를 소비한다.
- 잘못된 동적 actor pointer는 표를 읽지 않고0을 반환한다. 미인식 태그는
  actor·VM 결과를 건드리지 않고 원래 FC의 F000을 반환한다. leaf가 직접
  CTX 커서를 바꾸지 않으며 기존 VM dispatcher가 반환 종류와 길이를 소비한다.
- wrapper는 r1..r15, PR, SR(T 포함), MACH/MACL을 보존한다. 자체 stack은
  60바이트이며 AQ02가 호출하는 원래 helper의 stack과 구분한다.

AQ02가 사용하는 원래 helper는 XY 두 byte를 보정하고 visited4096바이트
`20293800`, queue8192바이트 `20295A00`, 자기 stack을 쓴다. actor·pilot·unit
roster는 쓰지 않는다. 내부 `0604CEC0`는 TSR root34, 맵 환경·상태와
occupancy를 읽고 stack 이외 game state는 쓰지 않는다. 두 함수와 그 닫힌
조회 helper는 unitwork `060B2080` 또는 pilotwork `060B2084`를 재소비하지
않는다. 따라서 CA02가 새 work record를 만들기 전에 mode 인수로 같은
조회 경로를 실행할 수 있다.

새 기체의 mode는 현재 인증한 TSR root27 기체 레코드 `+25 & 0F`에서
유도해야 한다. 새 unit cache의 파츠칸 +17..20은 **0**이며 +16 FF는
linked-unit 표시다. 파츠ID0 경로는 override를 하지 않으므로
`initialPartsZero:true`인 신규 생성에서 이 기본 mode 계약이 맞는다.
기존 장착파츠가 있는 unit의 mode에 이 규칙을 그대로 적용하지 않는다.
AQ02가 보정한 XY는 로컬 scratch에만 있고 실제 CA02에도 같은 원래 XY를
넘겨 같은 검색을 다시 실행한다. 두 검사 사이에 yield하거나 occupancy·지형을
바꾸면 동일 검색 결과를 보장하는 근거가 사라진다.

v2 함수의 실제 길이는236바이트와20바이트0 padding이며 코드 SHA-256은
`fc2791dd0b6327229f67f8a751208e722930068e5659050175438b2832c0224b`다.
처음 구현한 AQ01 전용 v1의 정확한 코드 해시
`73070f03c3b54c202295dfa488fc9fc20962033d1a98770664bf2626ea69c019`도
reader가 인식한다. v1/v2는 원복할 수 있고 다시 enabled로 쓰면 아래 v3로 갱신된다.
새 v3 함수는 AQ01/AQ02를 실행하지 않으며, 해당 태그에도 원래 FC의 F000을
반환한다. 과거 코드 인식은 개인 출력물의 정확한 정상화·제거 호환을 위한 것이다.
일부 설치, 모르는 코드 바이트, 영역 밖 변경은 거부한다.

## 현재 AQ03: 후속 생성에 필요한 빈칸까지 예약 검사

v3의 유일한 새 명령은 다음 전체11바이트다.

```
FC 41 51 30 33 x y mode requiredPilot requiredUnit requiredActor
```

각 required 값은 순서대로1..128 / 1..128 / 1..74다. 새 기체 한 기뿐 아니라
원래 후속 사건의 생성에 필요한 슬롯 수도 호출자가 보수적으로 더해 전달한다.
외부 사용자 JSON에 이 안전 예산을 임의 지정하게 하는 계약은 아니다.
명령은 세 표를 순서대로 검사하고 하나라도 부족하면 placement helper를 부르지
않고0을 쓴다. 모두 충분하고 원래 `0602684C`의 반환이 음수가 아니면1을
RESUME+20에 쓴다. 빈칸 **수**가 아닌 참/거짓 결과이며, 반환600A는
태그·좌표·mode·세 요구량의10바이트를 소비한다. 요구량0과 실제 상한보다
큰 byte 값도 성공할 수 없다. 각 표는 최대 원래 레코드 수만 읽는다.

| 표 | 동적 pointer 전역 | 최대 레코드 × stride | 빈칸 조건 |
|---|---|---|---|
| pilot cache | 060B208C | 128 × 12 | record+0 BE16 = 0000 |
| unit cache | 060B2088 | 128 × 30 | record+0 BE16 = 0000 |
| actor | 060B207C | 74 × 16 | record+0 byte = FF |

pilot lookup `0602A3E0/A3E8..A40A`, unit lookup `0602D1E2..D204`와
actor 검색 `06025236..276`의 실제 조건을 사용한다. actor는 첫 word를
읽어 상위 byte만 FF와 비교하므로 둘째 byte 내용이 빈칸 판정에 영향을 주지
않는다. 각 pointer가 짝수이고 전체 count×stride가 uncached LWRAM
`20200000..20300000` 안에 들어가는지 원래 표를 읽기 전에 검사한다.
상한 계산 전에 pointer 자체의 상한도 검사하므로 덧셈 wrap으로 통과할 수 없다.
기존 v2처럼 모든 표에 같은 가장 보수적인 상한을 부여한 구현이 아니다.

ABI는 실제 호출자의 소비 규칙에 맞췄다. F dispatcher `06004E72`의
JSR 뒤 `06004E76`이 결과 r0를 r9에 옮기고, `06004E78/7A`는 r1/r2를
즉시 덮어쓴다. 600x 경로 `0600503C..50CE`와 F000 경로
`060050C2..50CE`는 r3..r7 및 MACH/MACL의 호출 전 값을 소비하지 않는다.
따라서 v3은 r1..r7과 MACH/MACL을 volatile로 취급한다. 실제 표 범위
계산의 MULU.W도 MACL을 바꾼다. 호출자의 r8..r14, PR, stack과 **전체 SR**
(T·IRQ mask 포함)은 보존한다. r13/r14는 사용하지 않으며, r8..r12/PR/SR을
stack에 보관한다. STC.L/LDC.L SR 및 기존 delay slot을 활용하여 자체 stack
36바이트, 함수250바이트와6바이트 zero padding으로 기존256바이트 안에
들어간다. IP 길이·배치 범위·FC cell은 확장하지 않았다.

현재 v3 코드 SHA-256은
`2f4c844884953f5524f8a7f180d1ab0f156773259fcd196e626f51832b8f3876`이다.
`actorCapacityQueryCode({version:1|2|3})`는 각 정확한 코드를 재생성하고 기본은3이다.
전체 component를 원복해 검증한 다음 현재 v3를 적용하는 방식으로 기존
v1/v2 코드와 새 이벤트 명령의 버전이 묵시적으로 뒤섞이는 것을 막는다.

`normalizeSpawnCapacity(ip,exec,{gameId,baseSha256?})`는 두 원본 component를
복구하고 `previouslyEnabled/previouslyVersion`에 입력 상태를 남긴다.
`applySpawnCapacity(...,{enabled:true|false})`도 현재 상태를 먼저 검사한 뒤
정확한 두 범위의 입력/출력 bytes를 `patches`로 돌려준다. component pin은
전체 이미지 출처 검사를 대신하지 않는다. 호출자는 정상화한 전체 이미지를
기존 불변 출처 검사로 계속 인증해야 한다. 다른 게임이나 원본 무패치판 EXEC에 이 profile을 교차 부여하지 않는다.
Final은 아래의 별도 정확한 profile만 사용한다.

## F완결편 v0.3 별도 AQ03 profile

F의 주소 이동량 하나를 모든 함수에 적용하지 않는다. 실제 v0.3a에서 ISO
실행 파일0과 IP를 읽고 다음 차이를 확인했다. 실행 파일0은 LBA24/Mode1이고,
시나리오 SCEDATA의 Mode2와 혼동하지 않는다.

| 항목 | F | F완결편 |
|---|---|---|
| EXEC 크기 | 731,504 | 758,232 |
| FC table cell | 060B25AC | 060B8A8C |
| 원래 기본 handler | 0601789C | 06017D30 |
| VM cursor 전역 | 060C0900 | 060C6D70 |
| 결과 문맥 base | 060C06F0 | 060C6B60 |
| pilot / unit / actor pointer 전역 | B208C / B2088 / B207C | B856C / B8568 / B855C |
| placement helper | 0602684C | 060283F8 |
| 내부 지형·점유 조회 | 0604CEC0 | 06052908 |

표의 축약 pointer 주소도 `060`으로 시작하는 전체 RAM 주소다.
완결편 IP는6144바이트, 원래 `+1700..1800`이 모두0이고 선언 길이1800,
EXEC load06004000이다. 원래 component SHA-256은 다음과 같다.

- IP: `7e2a2f3da06ea64ad85162a29bd6263c7286669654ddbf20a5521b08d9f4588d`
- EXEC: `17c8bbf01e5fd0af708ff43b157e41d6cbd656104ccc3e4e03e7d07c687d61ac`
- 새 완결편 AQ03 코드: `f5683b302047bd923e32592350dfdc36f8ae2506c17844cbd1a0ffbb89acb309`

완결편 helper `060283F8..06028538`의320바이트는 F helper의 실제 코드와
완전히 같다. 포인터·하위 helper의 literal은 별도로 읽었다. 인수는 같은
`r4=&X, r5=&Y, r6=mode`, stack은20바이트와 저장 레지스터, 보존은
r8..r14/PR이다. 쓰기는 caller XY, 같은 visited4096/queue8192 scratch와
stack이다. 아래 `06052908`은186개 명령,18개 쓰기가 모두 자기 frame에
있다. r2를 통해 쓰는 두 위치도 `06052A06..16`에서 frame+1/+2로 만든
alias임을 실제 바이트로 확인했다. 해당 함수는 unitwork/pilotwork 전역을
다시 읽지 않으며 TSR root34, 맵 환경 `060D2231`, occupancy `060D2380`,
맵 상태 `060D2280`을 조회한다. 사용하는 pointer resolver06004CC8은
읽기 전용이고, shift helper060A4CE8/060A4D78의32개 jump table 대상은
각 자기 함수 안에 닫혀 있다.060A4ED8도 register shift만 수행한다.
이 근거를 helper의 실제 게임 실행이나 모든 맵의 안전성으로 확대하지 않는다.

신규 unit의 기본 mode 복사는 완결편 `0602FF32..54`에서 원래 기체 레코드
+25의 low4를 work+37의 high4로 옮긴다. 파츠 네 칸은 `0603113E..4C`에서
0으로 초기화한다. 이 조건은 기존 장착 기체의 mode를 단순화하는 허가가 아니다.

공개 API는 `spawnCapacityInfo(gameId)`로 게임별 `ipByteLength`,
`execByteLength`, `execOffset`, `address`, `version`, 코드·원본 해시를
고른다. 기존 `EDITOR_SPAWN_CAPACITY_INFO`는 F 호환을 유지한다.
`actorCapacityQueryCode({gameId,version:3})`는 해당 코드를 반환하며
기본 gameId는 F다. 완결편 v1/v2 조회 코드는 제품에서 지원한 적이 없어
버전1/2를 거부한다. apply/normalize의 인수 형태는 그대로이고 gameId와
전체 component pin을 함께 검사하므로 F code를 완결편에 적용할 수 없다.
승인 a/b/c 전체 이미지 hash는 allowlist에 있지만 실제 component 읽기·
검사는 a로 수행했다. b/c도 해당 IP/EXEC 전체 해시가 정확히 같을 때만
이 profile을 통과하며, 전체 이미지 출처 검사는 호출자가 별도로 유지한다.

완결편의 실제 두 component를 메모리에서 apply→normalize하여 정확히
원복했고 재적용은 변경0개였다. 변경 범위는 IP+1700의256바이트와
EXEC+ B4A8C의4바이트뿐이다. 별도 한정 실행8사례는 실제 완결편 dispatcher의
600A 경로06005204와 F000 경로0600528A에서 네 cursor 정렬을 시험했다.
600A는10개 피연산자 뒤 다음 opcode를 읽어 cursor를11바이트 전진시켰다.
이 native profile의 지원은 새 완결편 시나리오 사건이나 C0.0F 영역 조건의
편집 권한을 부여하지 않는다. 별도의 source-derived 조건 계약이 필요하다.

집중12개 검사는 새 함수의 실제 SH-2 opcode를 한정 CPU로 실행한다.
AQ03은 각 표의 첫/끝 빈칸·부족한 예산·최대128/128/74·요구0/상한초과,
네 VM cursor 정렬, 표별 완전 extent 경계·짝수 정렬, 잘못된 XY/mode,
미인식 태그 전체 단일 byte 변조와 AQ01/AQ02 fallback을 확인했다.
r8..r15/PR/전체 SR 보존과 명시적인 volatile register 파괴도 검사한다.
허용 쓰기는 VM 결과·자기 stack뿐이고, 실제 placement helper 대신 명시적
ABI stub이 caller XY를 수정하고 r1..r7/MACH/MACL/SR을 파괴하게 하여
wrapper의 계약을 검사한다. 이 stub은 실제 지형 검색·기체 생성 실행의
증거가 아니다. 기존 v1/v2의 정확한 코드 hash와 설치·재적용·제거·정상화·
v3 갱신 및 일부 설치·모르는 영역 변경 거부도 확인한다. 추가 완결편 검사는
게임별 native 주소·최대 예산·부족한 표·helper 반환·ABI·다른 게임 overlay
거부와 정확한 두 범위 적용/제거를 확인한다.

별도의 사적16사례는 승인 F EXEC의 **실제 dispatcher fetch 바이트**를
실행했다. 6004/6007/600A/F000 반환과 네 커서 정렬에서 각각4/7/10/0개
피연산자를 넘긴 뒤 다음 opcode를 한 byte 읽어 CTX 커서에 저장했다.
600A이면 호출 직전의 피연산자 pointer에서 정확히11바이트 전진한다.
이 검사는 native placement의 실제 지형 계산이나 프레임 전체 실행을
대신하지 않는다. 전체 BIN·콜드부트와 기존 전수 검사 반복은 수행하지 않았다.

AQ03의 조회 성공만으로 완료 flag, callback 호출 시점, 신규 pilot identity의
후속 삭제·충돌, 원래 사건의 총 생성 예산까지 증명되는 것은 아니다.
즉시 생성 직전에 source에서 유도한 보수적 요구량으로 호출하고, 성공한
같은 VM 호출에서 yield나 맵 상태 변경 없이 CA02로 이어져야 한다.
UI·즉시 증원 전체 완성 여부는 이 모듈의 완료와 별도로 보고한다.

### 2026-10-26 승인 폰트별 EXEC 확인

위 완결편 EXEC `17c8bbf0…`는 승인 v0.3a다. 승인 v0.3b/c의 EXEC는
`2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0`다.
사용자 원본의 EXEC 영역에 각 승인 `.srwfp`의 해당 영역을 재적용해 세 해시를
확인했다. 생산 normalizer는 기반 해시별 EXEC를 정확히 결합하고, 아직 기반이
확정되지 않은 탐색에서도 이 두 해시만 허용한 뒤 기존 전체 출처 검사를 유지한다.
관련 없는 바이트와 기반/EXEC 불일치는 거부한다. ALICE 동승 코드의 정확한
정규화 뒤 AQ03을 처리하는 실제 v0.3c 동시 설치·무수정 출력도 확인했다.
