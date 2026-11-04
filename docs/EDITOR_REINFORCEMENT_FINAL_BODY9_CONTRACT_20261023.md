# 완결편 현재 전투 증원 — 첫 host 및 명령 계약

2026-10-23. 승인 완결편 v0.3-a를 메모리에서 읽어, F 전용 증원 구현을
옮길 때 필요한 첫 실제 host와 명령 차이를 좁혔다. 이 문서는 쓰기 권한이나
새 기능 완료 선언이 아니다. 에뮬레이터·콜드부트·전체 BIN 생성은 하지 않았다.

## 실제 source와 host

| 항목 | 값 |
|---|---|
| 입력 전체 SHA-256 | `fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e` |
| 현재 EXEC / 길이 | `17c8bbf01e5fd0af708ff43b157e41d6cbd656104ccc3e4e03e7d07c687d61ac` /758,232 |
| TSR root0 / 길이 | `695abe94fc447914b34e02464e71a4105d8d0d3a6b4e70aee887b8e6ca839b5b` /79,004 |
| physicalIndex / scenarioSlots |9 /[106]|
| 본문 길이 / 원문 SHA-256 |12,645 /`d874925d9b8878b60ca52a7fe080aa73f16344d6955d3a01a02eabb496ecb575`|
| root4 /root5 /root8 |2311 /2790 /2805|
| 원래 pending E9 / 교체 범위 |2835 /2835..2838|
| mapIndex /physicalIndex /slots |30 /30 /[30]|
| 실제 맵 크기 |30×52|
| 지도 불변 context identity 후보 |`c1bbeab36f4c1cb8b51ada2bb8c6b9b6276a8083fc42785515214cb83e096993`|

현재 EXEC은 예전 문서의 `2b17a5…` 추출본과 다른 해시다. 위 값은 실제
승인 a ISO에서 다시 읽은 파일이다. 아래 handler·literal assertions도 이
실제 바이트를 대상으로 한다. 물리9/선택106을 게임9화/106화로 부르지 않는다.

103개 물리 본문에서 현재 `inspectPendingObjectiveHook`와 일치한 곳은
20곳이다. 초기241 guard가 있는 실맵 후보는3/4/5/6/7/9다. 본문0 및
69/70/71/94..102는 가드 없는 기본·공유 구조이므로 같은 권한을 주지 않는다.
이번에는 기존 페이즈 조건 연구가 닫힌 본문9 한 곳만 선택했다.

## 초기화 guard와 남은 직접 할당

원 root4의 CA02 22항목 및 CA00 출격은 flag241보다 앞이다. 마지막
`2782 D0.00 00F1` 이후에는 `2786 E9;2787 JMP2786`만 남아 있다.
root8의 `2813 D0.02 00F1;2817 F1`은 초기 완료 전2835 pending으로 간다.
공통 root0+525의 `D0.03 224..255` 초기화는 +557의 root4 wrapper 호출보다
앞이다. +557은0A/BE32 상대 call이며 `558+0x4D17=0x4F45`를 가리킨다.
F의 같은 모양이라는 이유로 call 길이·주소를 복사하지 않았다.

root5는2790..2805의 기존 정확4턴→flag250→E9 loop이고 생성 명령이 없다.
root8의 원래 action에는 CA02+2843의1항목과 +2949의3항목이 있다. 그
경로는 원래 EC01/EA(+3126/+3127) 또는 EC02/EA(+3157/+3158)로 끝나고
pending으로 되돌아오지 않는다. 따라서 이 **세 callback의 직접 생성**에
대한 초기241 이후 보수적 상한은 pilot4/unit4/actor4다. 새 한 쌍까지
보호하는 요구 빈칸 후보는 **5/5/5**다. 원문을 인증해 기존 action을 보존하는
경우에만 적용하며, raw 표식 부재만으로 다른 callback의 할당을0이라 하지 않는다.

기존 수치와 결합할 고정 CA02 entry mask 후보는
`2356+12*i (i=0..21)`, `2846`, `2952+12*i (i=0..2)`의26항목이다.
각 x/y2바이트 및 reward(+6)1바이트를 가린 `immutableBytesHash`는
`8328dc103f9f0e9b5f807949be5754e8960269d827b7ecd21c9e068288c1dff8`다.
C7 level mask는 없다. 이 목록을 제출된 opcode에서 새로 유도해서는 안 된다.
기체 `[idHi,idLo,+7,+8&30]` 서명은
`01d6ebfaae78962e862ee8eb2c9b0323769be17039ed09e0dd3fdd116145a043`다.

## full pilot 존재 분기는 완결편에서도 확인됨

실제 C1 table `060B9048+0A*4→0602BA38`은 먼저 `06020998`로 predicate를
설정한 뒤, BE16 ID를 `0602D98C`로 넘긴다. 이 helper는 `*060B856C`의
128×12 레코드 firstword를 full16 ID로 비교한다. actor 존재나 기체 배정
여부를 요구하지 않는다. 찾으면 +9 기력을 RESUME+20에 쓰고 `06020984`로
predicate를 지운다. 반환6003/전체4바이트다.

따라서 기존11바이트 C1.0A→F0.00 present→JMP absent의 분기 의미는
완결편에서도 같다. 숫자 기력값을 존재 횟수로 쓰거나 actor query C0.11로
대체하지 않는다. once는 해당 파일럿 cache가 유지될 때만 성립한다.

## plain CA02와 수동 입력의 완결편 근거

실제 main CA `060B869C+CA*4→0602666C`, subtable
`060B8F5C+2*4→06026810`이다. 이 handler는 selector1바이트와12바이트
항목들을 읽어 `06027544`를 부르며 전체 목록 뒤6003을 반환한다. 생성 전
F000/yield 분기는 없다. constructor는 pilot `0602D7B4`, unit `06030F70`,
actor `06029A8C`를 각각 한 번 부른다. NULL 상대 AI reference는
`0602689C..060268AC`의 명시적0 경로로 지원한다.

selector20/packed unit flags0/callbackNULL은 actor 인수 `[2,0,0,1]`과
진영0을 만든다. 원래 보유 아군 CA01의 `060278C8..060278DC`도 affiliation0일
때 같은 actor 인수 형태를 쓴다. 추가 unit family 연결·특수 상태의 모든
부작용을 이것만으로 없앤다고 주장하지 않는다.

완결편85.01의 실제 handler는 **0605CE68**이다.85.00은0605CD10이며
서로 바꾸어 인용하지 않는다. `0605CECA..0605CEDA`는 actor+3 진영0과
actor+12 NULL AI를 수동 경로로 통과시킨다. 행동 가능 상태는5003
(literal0605CF0C), 불가능/AI 경로는5005(literal0605CF0A)다. 공통 TSR
+121F의5003 분기 cell1223→1229 JMP→12A7(050001)/12AA(520010)은 원래
입력 대기 루틴이다.

실제 selector20/flags0/aux0 예시는 본문4 command3010/entry3013의
pilot212/unit287이다. 이 원본의 callback은 nonzero다. 완결편 전체 source에
F 표본과 **정확히 같은 NULL17바이트 원본 항목은0개**였으므로 원문17바이트
동일성을 근거로 쓰지 않는다. NULL 지원과 수동성은 위 native 분기에서 나온다.

## 위치 조회는 F처럼 그대로 붙일 수 없음

실제 C0 table `060B8EB8+0F*4→06024BC0`, 반환6007/전체8바이트다.
selector 목록 helper06028834는 caller stack에 목록을 쓰지만, 이어지는
`060209E0→06020A30`은 링크 actor의 좌표를 동기화하고 잘못된 링크의
actor+4 bit40도 지울 수 있다. C0.0F 자체는 `*060BB298`의 목록257바이트를
쓴다. F readonly C0.0F 계약과 다르다.

확인 범위에서 부작용 없는 다른 VM 사각형 명령은 닫지 못했다. 최소의
이미 근거 있는 보완은 [기존 NR03 연구](EDITOR_REGION_OBJECTIVE_CONTRACT.md)의
**actor74×16=1184바이트+공유 목록257바이트 snapshot→원 C0.0F→복원** helper다.
문서의336바이트 구현은 CPU 검사 근거이고, 세 번의 실제 경계 보존은
그 이전 helper의 근거다.336바이트 코드의 실제 실행·현재 소스 위치까지
확보한 것은 아니다. 현재 AQ03 설치·정상화에도 이 helper는 없다. 새 helper의 위치·
ABI·source pin·원복과 조건 코드 전체의 결정적 재생성을 함께 연결해야 한다.
단순히 Final도 regionContext에서 허용하도록 바꾸면 안 된다.

턴 D4.00은 기존 제품에서 검증된 readonly 대안 **trigger 종류**다. 좌표
조건과 같은 뜻이 아니며, 이번 조사에서는 UI/API를 추가하지 않았다.

## 파일럿 수명과 제품 활성화 전 남은 경계

완결편 C0.05 `060243F0`의24430..24432 및 C0.0A `06024528`의2455C..2455E는
진영0 cache 삭제를 건너뛴다. C0.15 `060245F8`도24682..24684에서 진영0이면
pilot/unit clear를 건너뛰어 actor clear246B8로 간다. 실제 clear literal은
pilot0602D90C/unit06030B50/actor06029F94며 공통+4962에 C01500이 있다.
이는 일반 cleanup 보존 근거다.

본문 전체의 C103/C008/C133/C134/C137/C212 원시 후보는0개다. 현재 일반
후보에 기존 부정 전용 ID 필터를 적용하면358pilot/413unit이 남는다. 제외
pilot은 `[12,27,37,63,64,66,67,68,135,189,236,239,275,276,277,278,292,294,324,325,346]`이며
추가 제외 unit은0이다. raw false-positive는 허용한다. Final getter06053FF0의 kind0은 raw unit+8 bit4가0이면FFFF를 반환한다
(06054090..060540AE).bit5는0603010E..06030118에서 work+176 bit3로
옮기며 실제 literal06030158=0176이다. 따라서 두 비트를 제외하는 후보
정책은 보수적으로 유지할 수 있다. 다만 Final C1.37의 실제 handler는
0602E584로 특수 기체 값 조절이며, F 임시 파일럿 helper0602EE44와 같은
명령이라고 명명하면 안 된다. Final 특수 cleanup의 모든 소비자 및 공통
간접 생성 경계는 F에서 자동 상속하지 않는다.

따라서 다음 구현의 정확한 선행 조건은 안전 위치 조회(또는 별도 턴 trigger),
Final의 특수 cleanup 제외 규칙 확인, 선택 source의 공통 할당·로스터 수명
고정이다. callback host·C1.0A·CA02 문법 자체는 위 실제 source 근거가
충분하다. 이후 스토리 합류·재합류 중복 억제는 이 현재 전투 계약과 별도다.

사적 재현 probe는 `story-font/reinforcement-final-host.mjs`,
`reinforcement-final-contract.mjs`와 profile JSON이다. 현재 실제 바이트 및
literal source assertions39개가 모두 통과했고 입력 크기·mtime은 유지됐다.
처음 계산에서 잘못 대입한85.00/85.01 및 패드 진입 주소는 실제 subtable과
분기 cell을 검사해 위 값으로 바로잡았다. 게임 실행·출력 재열기 완료 근거로
이 정적 assertion을 대신하지 않는다.
