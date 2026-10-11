# 원본 전투 이미지 연결

브라우저는 검증된 사용자 디스크에서 전투 파일을 읽는다. 저장소에는 그림,
게임 파일, 전체 애니메이션 스크립트를 포함하지 않는다.
`assets/editor-battle-mapping.mjs`는 읽기 전용 참조 계획을 만들고,
`assets/editor-battle-assets.mjs`가 해당 물리 레코드의 그림을 해석한다.

## 확인한 공격 연결

현재 표시 단위는 **선택한 무기 애니메이션 헤더에 연결된 E_SPR 스프라이트**다.
다른 무기의 그림을 이름이나 수치로 골라 보여주지 않는다. 실제 게임의 장면
합성, 사용 순서, 시간, 명중·회피 분기는 이 연결만으로 재현하지 않는다.
한 레코드의 subimage를 재생 프레임이나 특정 자세라고 부르지 않는다.

검증한 기본 이미지는 F v0.5 a와 F완결편 v0.3 c다. 전체 BIN SHA-256은
각각 `b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9`,
`0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d`다.
실행 파일 `/0`의 SHA-256은 각각
`308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1`,
`2b17a510e9eb4758ada3aa954577222b848d15b573c56f63610e1cdc1d3320c0`다.
별도 폰트 변형에서 독립적으로 같은 조사를 수행했다는 뜻은 아니다.
제품 입력의 승인 계열·개인 수정본 provenance 검증은 기존 core가 담당한다.

| 연결 단계 | F 실행 주소 | F완결편 실행 주소 | 관찰 |
|---|---|---|---|
| 무기 root29 record+3/+4 읽기 | `0602DEC8..0602DEDC` | `06031CCC..06031CE0` | 두 byte를 BE16 word로 결합해 weapon work+46에 저장 |
| 전투 결과 레코드로 전달 | `06063BAA..06063BB0` | `0606A00A..0606A010` | work+46 word를 result+4에 복사 |
| 애니메이션 선택값 사용 | `060194CE..06019504` | `060199A6..060199DC` | 양쪽 result+4 읽기, 0x057f 상한 검사, TSR root6와 resource8로 loader 호출 |
| 디렉터리 loader | `0600B370` | `0600B66C` | bank=(selector>>8)&15, local=selector&255; bank의 pair2 경계를 읽어 파일 범위를 불러옴 |
| 헤더에서 스프라이트 선택 | `06018DEC..06018E90` | `060192C4..06019368` | animation base+(slot+4)*2의 BE16 값, 0x07ff mask, TSR root7와 resource9 사용 |

무기 header+3/+4를 막연히 연출 ID라고 추측한 결과가 아니다. 위 실행 코드의
복사·소비 경로와 실제 파일의 디렉터리를 함께 대조했다. 이 module에서는
좁은 의미의 `animationSelector`로 표현한다. 다른 header byte의 의미를
추가로 확정하거나 쓰기 가능 필드로 확대하지 않는다.

F완결편 resource 파일 핸들 표 `060B8AD4`의 slot8은 `D_ANIME.BIN`,
slot9는 `E_SPR.BIN`, slot10은 `E_BNK.BIN`, slot11은 `E_SC.BIN`,
slot12는 `E_PAL.BIN`, slot17은 `EFFECT.BIN`이다. `0600B7F6..0600B802`는
resource 번호를 4배 해 이 표에서 파일명을 읽고 open 함수에 전달한다.
F와 F완결편의 TSR root6/7/8/9/10은 각각 위 D_ANIME/E_SPR/E_BNK/E_SC/E_PAL
파일의 시작 디렉터리와 대조했다. TSR root6/7의 전체 segment 크기는 6,188B지만,
pair2 디렉터리는 **6,168B**다. 나머지 20B를 추가 디렉터리 셀로 사용하지 않는다.

## 좌표계와 헤더

TSR 무기 레코드의 포인터는 `셀 주소 + signed BE32 변위`다. 이름 키와 선택 키는
무기 `recordIndex`이며 이름 문자열은 참조 계산에 사용하지 않는다.

D_ANIME/E_SPR 시작의 여섯 BE32 값은 파일 시작 기준의 **절대 bank offset**이다:
24, 1048, 2072, 3096, 4120, 5144. 각 bank는 1,024B이며 128개의
`(start, end)` BE32 쌍을 담는다. 시작은 `bankOffset + localIndex*8`에서 읽는다.
TSR 상대 포인터 방식으로 해석하거나, 물리 unique record 순번으로 바꾸지 않는다.

D_ANIME의 선택 레코드는 46B 헤더를 갖는다. 첫 4B의 LE32 값은 46이다.
record+8..+18의 여섯 BE16 값이 E_SPR selector다. 실행 코드가 mask한
0x07ff 값으로 root7의 bank/pair를 찾는다. `ffff` 값은 loader에서 기존
resource 슬롯을 재사용하는 경로이며, 무조건 빈 그림이나 기체 자세라고
해석하지 않는다. module은 `reusedSlots`에 기록하고 새 E_SPR 참조를 만들지 않는다.

record+20..+30은 E_BNK loader의 별도 selector 영역이다.
`06019400..060194E8`은 root8/resource10과 pair3를 사용한다. E_BNK bank는
768B, 64개 triple이다. bk01 bank atlas가 해석된다고 SC02 장면 배치 및
해당 무기의 최종 배경이 확인되는 것은 아니므로 현재 공격 그림 계획에는 넣지 않는다.

record+4..+7의 LE32 값은 actor sequence table의 offset이다.
`060414E8..06041516`은 이 값에 sequence 번호*2를 더해 BE16 주소값을 읽고
animation base에 더한다. 따라서 D_ANIME 자체는 이미지 코덱에 넘기지 않는다.
아래 상태 갤러리는 검증한 명령만 읽으며, 타이밍과 합성은 재현하지 않는다.

## 반응 상태의 범위와 대표 조건

공격은 무기 헤더의 전체 연결 그림이다. 명중·회피·방어·격추는 main script의
결과 조건 분기 뒤 actor가 참조한 특정 subimage다. 저장소 밖 승인 디스크를
읽어 실행 코드와 원본 참조를 대조했으며, 이름으로 비슷한 그림을 찾지 않는다.
각 상태의 `ready`는 **확인한 참조의 갤러리**이며 전체 상태 연출의 완성을 뜻하지
않는다. 미지원 명령이 있으면 확인한 앞부분만 남기고 화면에 `일부 그림`을 표시한다.

선택 기체는 반응 샘플의 피격 측이다. 선택한 소유 무기를 같은 기체의 가상 상대가
사용하는 대표 조건을 만든다. 상대 기체 선택이나 실제 전투 기록을 읽지는 않는다.
실제 결과 word는 공격 측으로 인덱싱되고 HP 차감은 반대 측에 적용된다.
따라서 direction bit6이 켜진 샘플의 피격 기체는 cache8이며 cache9는 공격 측이다.
F의 `06062EE4..06062F08`, `06063610..0606364A`, `060640BC..060640E6`과
완결편의 `060692CC..060692D6`, `06069A38..06069A72`, `0606A518..0606A53C`을
각각 직접 대조했다. API는 다음 역할을 evidence에 기록한다.

- `selectedUnitRole: representative-defender`
- `selectedWeaponRole: incoming-effect-from-selected-owned-weapon`
- `opponentArrangement: same-unit-mirror-sample`

대표 조건은 일반 명중 `4000`, 회피 시도이면서 HIT가 꺼진 `0c00`,
일반 방어와 HIT `4800`, 명중·격추 `5000`이다. 실드는 `4180`, 베어내기는
`0080`으로 별도 분기한다. FD 회피 시도나 FC 방어 선택만으로 실제 HIT 여부를
단정하지 않는다. 장면 guard, 지원 공격, 배리어·critical은 기본 샘플에서 꺼져 있다.
이는 기체가 실제로 해당 능력을 보유한다는 판정이 아니다.

장면에 의존하는 main macro `2f`는 **명시된 샘플 metadata index0**을 사용한다.
양 게임의 BTSR outer cell0은 offset84..468, 384B의 192개 2B 항목이다.
entry0의 두 번째 byte에서 `(byte >> 5) & 3`을 읽으면 type2다.
원본 unit record+10의 bit4, bit3, bit2를 순서대로 검사해 네이티브 분기를 고른다.
type0에는 bit6, type1에는 bit5를 사용한다. 반환 분기의 셀은 macro ID 위치에서
1/3/5/7/9/11B 뒤이며, 목적지는 `셀 + signed BE16`이다.
실제 맵에서 어느 metadata index가 선택되는지는 미확인이므로 이 index0을
실제 전투 상황으로 주장하지 않는다. UI는 `대표 조건`을 표시하고 evidence에는
`sceneContext: explicit-sample-metadata-index-zero-not-current-map`,
디스크 셀·entry 위치·raw unit byte·선택한 분기 위치를 남긴다.

## 공통 프로그램, 프레임 선택과 정지 경계

main `7e`는 TSR root0의 nested cell3 프로그램을 호출한다. 이 내부 표는
자기 셀 기준의 signed BE32 포인터다. 24개 확인한 항목만 사용하며 첫 target을
표 크기로 추정하지 않는다. alias와 뒤쪽에서 앞을 가리키는 항목이 있다.
하위 프로그램에서 미확인 명령, 잘못된 경계, 반복·깊이·step 한도에 도달하면
호출자도 멈춘다. 미확인 호출을 정상 return으로 취급해 뒤 그림을 표시하지 않는다.

actor의 Fxxx 공통 sequence는 BTSR outer cell3을 사용한다. 실행 getter의
`extu.b`가 번호를 low8로 줄이고, BE16 표의 값은 **표 시작 기준**의 주소다.
F의 cell3 offset4750..9128과 완결편의4886..9264는 4,378B가 동일하며 SHA-256은
`bf7bc97735a2aa0591f836d91a0220c792e5dc63d8d8f2a777dd5ef442041554`다.
F getter `0603C09C..0603C11C`, 완결편 `06041498..06041518`을 대조했다.

main 조건 명령은 `[68][macroId][signed BE16]`이다. true 목적지는 offset의
첫 byte 위치+변위이고 false는 명령 다음이다. HIT/fatal/miss/critical/ability와
실드·베어내기 조건은 각 게임의 결과 생산자와 조건 소비자를 함께 확인했다.
macro `0d`는 context bit5만 토글한다. `26`의 fade/wait는 완료 시 다음 명령으로
투영하고 `48`의 display buffer 설정은 selector를 바꾸지 않는다. 시간과 hardware
대기는 재현하지 않는다. 다음 주소와 독립 비교 metadata가 근거다.

| 좁은 계약 | F 실행 주소 | F완결편 실행 주소 |
|---|---|---|
| main macro0D, 인자 없음, bit5 토글 | `06040B4C` | `0604618C..060461B2` |
| main macro26, 인자1B, wait/fade | `06041D3C` | `06047408..0604751A` |
| main macro48, 인자 없음, display buffer | `06043DCC` | `060494B0..06049504` |
| main macro2F, metadata/raw unit 조건 | `060431C8` | `06048898` |
| BTSR cell0 metadata 포인터 설치 | 초기화 동형 대조 | `06044C98..06044CA6` |

actor BF는 selector high byte를 **교체**하고 기존 low byte를 유지한다. C0는
low byte만 교체하고 C1/C2는 word 전체를 ±1 한다. BF/C0의 중간 값은
실제 표시로 승격하지 않으며 delay/yield에서 완성된 selector를 모은다.
F6의 global-flag wait가 대기 중이면 renderer가 현재 selector를 소비한다는
코드 근거로 그 자세를 모으되, wait timing은 진단에 남긴다.

C8은 별도 frame track을 설치한다. native scheduler는 primary 뒤 secondary를
실행하고 secondary F8은 기존 word에 bank bits를 OR한다. primary의 뒤 C0가
어느 bank로 표시되는지 시간 없이 판정할 수 없어 C8에서 해당 actor의 후속
해석과 selector history를 중단한다. 실행 중 secondary를 고정 폭으로 건너뛰거나
오래된 bank를 재사용하지 않는다. 상대 주소 child ID bit7과 동적 할당 bit6도
공통 Fxxx 번호로 오인하지 않고 미지원으로 기록한다. linked child reset 뒤에는
다른 actor의 history를 무효화한다. FA35의 실제 장면 metadata 조건,
FAF8의 runtime damage digit, F7의 global flag 조건도 미확인 시 멈춘다.

## 기체 몸체, 실드와 격추 그림

몸체 selector는 editable image 값이 아닌 원본 unit root27 record+2/+3에서 읽는다.
F `0602C250`, `0602C2BE..0602C2E4`와 완결편 `0602FF8C`,
`0602FFFA..06030020`은 이 BE16을 `01ff`로 mask한 뒤 runtime descriptor+016c에
저장한다. result body selector 생성자 F `0606399A..060639A8`, 완결편
`06069DFA..06069E08`도 함께 대조했다. TSR root1은 C_ROBOT의 상대 8B pair이며
각 start/end 셀 자체에 signed BE32를 더한다. 반환 subIndex는 actor가 명시적으로
선택한 자세만 사용한다. 미확인 inherited/copy history에는 전체 몸체 레코드를
붙이지 않는다.

실드 선택은 common F007의 native 실드 분기와 F7 몸체 selector에서 확인한
cache8/sub1만 반환한다. 지원 기체가 없는 샘플의 fallback 경로다. 실드 분기를
바꿨다는 이유로 incoming 탄환을 실드 그림으로 표시하지 않는다. 베어내기의
조건은 확인했지만 전용 몸체/effect 참조는 아직 지원하지 않으므로 `unmapped`다.

격추 type은 원본 unit+6의 상위3bit다. F `0602C33E`, 완결편
`0603007A..06030094`의 생산자와 macro11 소비자를 대조했다.
type0/1/2/3/4의 반환값은 각각5003/5005/**5005**/5007/5009로,
type1과 type2가 같은 분기를 가리킨다. 500B를 type4로 선형 대응하지 않는다.
macro06에 실제 도달한 뒤에만 cache19 그림을 해석한다.

| 격추 type | cache19 sprite source | 범위 |
|---|---|---|
| 0 | macro06에서 새 그림을 읽지 않음 | 이전 로딩이 미확인인 참조는 거절 |
| 1/2/3 | BTSR outer cell10 | 실제 cache19 로더 이후의 subIndex만 |
| 4 | BTSR outer cell16 | cell17은 별도 background이며 sprite로 사용하지 않음 |
| 5/6/7 | 미확인 | fail closed |

완결편 macro06 `06045B50`, 분기표 `06045BD4`, type1/2 loader `06045BDE`,
type3 `06045C94`, type4 `06045D9C`이 근거다. 격추 갤러리는
`common-destruction-sprite`를 앞에 두고 그 경로의 incoming 무기 그림은
`weapon-state-sprite`로 따로 표시한다. 공격 잔여 스프라이트를 폭발 자체로
부르지 않는다.

## 공통 방어·회피능력 표시

BTSR cell7은 macro05가 cache16으로 불러오는 원본 pX record다.
F offset14236..26646과 완결편14391..26801은 동일한12,410B이고 SHA-256은
`ff0d5d6147d3be5263a050e41324f80cfac8fcc110629e2c9638fcced7645f6e`다.
F macro05 `060403B4`, 완결편 `060459F4`는 getter 결과에 각각 cell7의 28B를
보정한 실제 record를 전달한다. 45개 subimage와 참조된 palette index0..8을
독립 decoder가 확인했다.

FAEF의 discriminator별 원본 표시 그림은 빔코팅4→sub4,
I필드8→sub6, 오라배리어12→sub7, AT필드1→sub8, 이데배리어2→sub11이다.
FAEE의 회피능력 표시 그림은 unit record key DB→sub1,25→sub2,28→sub3,
나머지→sub0이다. 이는 raw icon ID나 editable 이름을 기준으로 선택하지 않는다.
F와 완결편 FAEF 실행 구조는 다르지만 이 수치와 두 offset 분기 계약을 각각
확인했다. 실제 실드 word0180과 이 discriminator를 혼동하지 않는다.
해당 선택은 `display-sprite-only`이며 공간 배리어, 분신 기체, 합성 effect,
기체의 능력 보유 여부를 재현했다고 주장하지 않는다.

독립 근거 metadata는 개인 임시 경로의
`accepted-final-result-static-proof.json`,
`accepted-f-final-common-battle-static-proof.json`,
`battle-verified-opcode-widths.json` 및 `battle-main-macro-width-proof.json`에 있다.
실행 주소·정수 계약·해시만 문서화했으며 실제 script/그림/실행 byte를 저장소에
복사하지 않는다.

## API

```js
await resolveBattleAssetPlan({
  gameId, weapon, unit, mode, defenseId,
  root, decodedTsr,
  readFile: async fileName => sessionOnlyBytes,
});
```

게임 ID는 `srwf-f`/`srwf-final`, 상태는
`attack`/`hit`/`evade`/`defense`/`destroyed`다. 테스트는 `readFile` 대신
`battleFiles`에 `D_ANIME.BIN`과 `BTSR.BIN`을 제공할 수 있다. 공격은 헤더의
의존성 그림을 반환한다. 나머지 상태는 검증한 main/actor 명령을 따라 실제로
참조되는 `subIndex`만 반환한다. 모르는 명령에서 해당 경로의 해석을 멈추며,
참조가 하나도 확인되지 않으면 `unmapped`다. 상태 분기 전에 쓰는 공격 그림은
반응 상태의 결과에 포함하지 않는다.

반환 asset의 `recordOffset`/`recordEnd`는 해당 source 파일 내부 물리 byte 경계다.
`recordIndex`는 반환하지 않는다. catalog의 `tableCells`는 4B 포인터 셀 주소/4이며
semantic 무기 번호, bank-local 번호, 물리 그림 순번과 서로 다르다.
동일 물리 레코드의 헤더 슬롯은 합쳐 `headerSlots`로 유지한다. 디렉터리/경계,
46B 헤더, TSR root6과 D_ANIME 파일 디렉터리의 일치가 실패하면 자산을 반환하지 않는다.

`status: ready`는 반환된 자산 참조가 확인됐다는 뜻이다. 상태 계획의
`evidence.coverage`와 `diagnostics`는 읽지 못한 시퀀스를 따로 기록한다.
`timeline: not-reproduced`이며 실제 게임 재생 검증을 뜻하지 않는다.

## 검증과 남은 범위

합성 테스트는 상대 포인터/절대 bank 구분, 잘못된 경계, 헤더 길이, alias,
FFFF 재사용, 이름·수치로 연결을 바꾸지 않는 계약을 검사한다. 추가 반례는
미확인 common 호출 뒤 fallthrough 금지, C8 stale bank, relative/dynamic child,
BF/C0 중간 값 배제, wait 중 실드 자세, 실드·베어내기의 일반 탄환 대체 금지,
cache19 로더 도달 전 그림 금지, 격추 type1/2 alias, 잘못된 effect ID,
반복·잘린 명령의 진단을 검사한다. 이 module의 합성18개 테스트가 통과했다.
실제 승인 BIN은 디스크를 수정하거나 추출물을 저장하지 않고 메모리에서 읽었다.

| 읽기 전용 전체 무기 조사 | F v0.5 a | F완결편 v0.3 c |
|---|---:|---:|
| root29 행의 공격 계획 ready | 1,279 | 1,407 |
| 서로 다른 연결 E_SPR record | 194 | 199 |
| reference/record parser 예외 | 0 | 0 |
| 연결 subimage가 64개를 넘는 무기 행 | 139 | 150 |
| 한 무기에서 확인한 최대 subimage 수 | 118 | 118 |

최대 118개는 두 게임의 개틀링건 #51이다. 이 수에는 공통으로 재사용되는
스프라이트가 포함될 수 있다. 모든 행의 연결 확인이 모든 무기를 실기 재생했다는
뜻은 아니다. 빈 이름/미사용 템플릿 행도 표에 포함된다. decoder의 독립적인
실제 E_SPR 7 record 대조에서 경계·압축 END와 55개 subimage 해석이 일치했다.
스토너선샤인 #823 연결 record(F offset244764, Final offset245623)의 sub21은
`IMAGE_DIMENSIONS` 진단으로 제외됐으며, 나머지 subimage는 유지한다.

반응 상태는 같은 전체 raw 무기 행에 unit record1, 지원 기체 없음,
장면 metadata index0의 대표 조건을 적용해 읽기 전용으로 조사했다.
2026-10-12 최종 mapper 조사 결과는 다음과 같다. `ready`에도 미지원 시퀀스의
진단이 있으며 전체 연출이나 기체별 모든 자세 검증으로 확대하지 않는다.

| 대표 조건의 반응 계획 | F ready / unmapped | F완결편 ready / unmapped |
|---|---:|---:|
| 명중 | 1,075 / 204 | 1,173 / 234 |
| 회피 | 586 / 693 | 636 / 771 |
| 방어 | 1,075 / 204 | 1,173 / 234 |
| 격추 | 1,232 / 47 | 1,357 / 50 |

각 계획 생성 예외는0이며 최대 그림 참조 수는48이다. 미사용 템플릿을 포함하는
raw 행 조사와 실제 편집기 소유 무기 행 조사는 모수가 다르다. 이 표는
상태 script 참조 계획만 확인하며 emulator/실기 재생, 시간, 합성, binary export를
검증하지 않는다. 베어내기 전용 그림은 별도 미지원이며 공통 표시 옵션의
성공을 기본 반응 연출의 성공 수로 합산하지 않았다.

원본 코덱 근거는 기존 로컬 도구 `fin_effect_lzss.py`의 `parse_record`,
`sub_geometry`, `palette_for_sub`와 `extract_fin_disc_images.py`의
`decode_subs`, `unpack_pixels_strided`, `collect_record_offsets`다.
이 도구가 그림을 읽는다는 사실과 무기/상태를 의미상 연결한다는 사실은 구분한다.

기존 R116 베어내기·배리어·분신 연구는 **맵 전투 연출(전투 장면 OFF)**에서의
event55/56/57/58 등의 제한된 근거다. 현재 F/Final 전투 장면 ON의 명중·회피·방어·격추
자산으로 확대하지 않는다. 새 상태는 실행 코드의 조건→script→자산 참조를
별도로 확인한 뒤 추가해야 한다.
