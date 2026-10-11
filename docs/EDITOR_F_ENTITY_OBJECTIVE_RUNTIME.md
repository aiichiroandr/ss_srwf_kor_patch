# F 제품 기체 종류 조건: 실제 실행 조사

2026-10-10. 사적 native 조사로 **F 물리 본문 47(slot 67)의 제품 OB03 mode 1 ‘있음’ 조건 불충족 대기·재개와 ‘없음’ 조건 성립→원래 승리 처리→34화 완료→게임 저장→MCA 없는 새 cold의 실제 Load까지 확인했다.** 제품 기능을 변경하거나 지원 본문을 늘리는 근거가 아니다. 실제 지원 본문에 정상 진입한 다음 최신 core의 `inspectPatchedImage → exportEditedImage`로 조건 하나를 만든 사적 APFS clone에서 실행했다. EXEC/IP helper 수정, RAM 변경, 치트, 다른 이미지의 MCA, 강제 media ID는 사용하지 않았다.

## 현재 제품 및 native 주소 확인

현재 F v0.5 a whole image SHA-256은 `b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9`다. 현재 accepted EXEC SHA-256 `308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1`를 기존 primary decoder로 읽었다. C0 main은 `06022244`, subdispatch는 `060B2944`, C0.0E leaf는 `06022B9C`, leaf 반환은 `06022C5A`, leaf 뒤 main C0의 반환 관측 위치는 `0602225A`다. F의 args `060C0900`, VM base `060C06F0`, VM count `+20`, predicate flag `+37`를 사용한다. Final 주소를 F에 대입하지 않았다.

현재 제품 inspector로 accepted F를 새로 연 결과 기체 종류 조건 지원은 물리 본문 `0/11/14/18/23/25/27/30/33/34/39/41/44/47`이다. 앞 8개는 같은 slot 번호이며 후반 `33/34/39/41/44/47`은 각각 `53/54/59/61/64/67` slot이다. 물리 본문 0/27/30/47의 hook은 root relocation, 나머지는 in-place다. 본문 1은 이 기능을 지원하지 않는다. 이 목록은 제품 구조 검사 결과이며 실제 게임 도달 증거가 아니다.

## 첫 정상 cold 및 기존 저장 확인

정상 accepted F와 핀된 4-track CUE를 사용해 새 private home을 만들고 복사된 MCA를 모두 제거했다. source BKR SHA-256은 `495ded0a2998da276db877f34cddba5c78a175611253e91ee30c4d0c00afcb94`, 32768바이트다. 설정은 정확한 `filesys.fname_sav pinned.2b4313177e2589aeecc87c2ed148a171.%x`이며 `.bkr`가 있는지 확인했다. `%x` 앞의 점 누락으로 다른 이름을 읽은 이전 Final 오류를 반복하지 않았다. game save 파일 복사와 실제 게임 불러오기는 구분한다.

`f-product-objective-baseline-cold-f-1`은 3605 frame, 50.71초, `returncode=0`, `timeout=false`, `sourceSaveState=null`, poke 0이다. 실제 색이 있는 타이틀에서 ‘시작/로드/이어하기/옵션’을 확인했다. 이 accepted image가 스스로 만든 MCA만 후속 source로 사용했다.

- `f-product-objective-baseline-load-menu-f-1`: 실제 ‘로드’를 선택했고 본체 RAM/카트리지 RAM 선택창을 확인했다. 12.48초, terminal 0, timeout false.
- `f-product-objective-baseline-load-slot-f-1`: 실제 본체 RAM을 선택했지만 **‘로드 데이터가 없습니다’**였다. 9.39초, terminal 0, timeout false.
- `f-product-objective-baseline-continue-f-1`: 동일 cold의 타이틀 상태에서 실제 ‘이어하기’를 선택했지만 **‘컨티뉴 데이터가 없습니다’**였다. 15.13초, terminal 0, timeout false. C0.0E·turn·callback native hit는 0회다.

따라서 이 BKR 파일이 있다는 사실만으로 정식 게임 저장이 있거나 지원 본문에 진입했다고 주장하지 않는다. 본체 로드와 이어하기의 부재는 실제 화면 근거다. 카트리지 RAM의 저장 유무는 별도 재고/정식 reader로 확인할 항목이다. 아직 이 경로에서 게임 본문에 진입하지 않았으며, 조건이 들어간 제품 사적 BIN도 생성하지 않았다.

사적 정적 자료 `f-product-objective-baseline-inspection.json`, primary listing `f-product-unit-objective-native-primary.txt`, 각 단계의 `plan.json/report.json/trace.jsonl` 및 원 330×240 캡처를 보존했다. 다음 단계는 이미 작성된 전체 BKR/BCR read-only 재고를 재사용해 F 게임 기록이 있는 정상 저장을 찾고, 지원 본문으로 정상 Load→다음 전장 진입이 가능한지 확인하는 것이다. 정상 도달이 안 되면 그 한계를 기록한다. 원시 데이터나 0-hit 캡처를 실행 완료로 바꾸지 않는다.

## 후기 F 카트리지 기록의 포장과 새 cold

전체 read-only 재고에서 `fin_public_reference_r117/r117c/interactive/coldboot_home/b/.../2.bcr`의 F 기록을 찾았다. 파일 stem은 Final이지만 내부 `SROBOT_F_33`는 payload `0x1600`바이트, 진행 필드 `[34,67,29]`, checksum `(220350,220350)`으로 유효하다. payload SHA-256은 `48cebf0d6f41a1fac6f0d6ab2fe3debaddb9f2f8e81679e258735e39ab01fadb`다. 다음 slot 67은 제품이 지원하는 F 물리 본문 47에 해당한다. 원 저장을 생성한 이미지의 출처는 아직 확인되지 않았으므로 이 기록만으로 accepted 이미지와의 실제 호환이나 정상 진입을 주장하지 않는다.

원 보관 파일 SHA-256 `18526f5236c3131d036a39ecb843daf07b86e57d7fb7c04f63d62b07a6b3b737`는 gzip 두 겹이다. 이를 그대로 primary save 경로에 복사한 첫 `f-product-objective-cart33-cold-f-1`은 `Unexpected EOF`로 0.54초 만에 종료했다(`returncode=255`, snapshot 0). **이 실행은 Load 또는 본문 진입 증거에서 제외한다.**

핀된 정식 reader의 두 겹 압축 해제 결과인 524288바이트 raw backup을 별도 seed에 기록했다. logical raw 및 새 native 파일 SHA-256은 모두 `f9a954d834dcc38395e182fda9d418b6f8cb6945ecc56fa8540f6516cb4bc1be`다. 원 보관 파일과 새 파일을 같은 reader로 비교해 raw 전체와 58개 기록의 이름·길이·payload SHA-256·checksum이 모두 동일함을 확인했다. 게임 기록을 바꾼 것이 아니라 native primary가 읽을 수 있도록 외부 gzip 포장만 해제한 것이다. 원 파일은 수정하지 않았다. 이 계약은 `f-product-objective-cart33-raw-seed/record.json`에 남겼다.

새 MCA 없는 home에서 `f-product-objective-cart33-cold-f-2`를 실행했다. accepted F whole hash와 정상 CUE를 재확인했고 `sourceSaveState=null`, poke/cheat/mediaID override 없음, 3605 frame, 45.56초, terminal 0, timeout false다. 실제 색이 있는 F 타이틀을 확인했다. 카트리지 메뉴에서 게임 기록을 선택하는 단계는 이 이미지가 스스로 생성한 MCA만 사용한다. 타이틀 cold 성공은 아직 `SROBOT_F_33`의 실제 Load 성공을 뜻하지 않는다.

후속 `f-product-objective-cart33-ram-menu-f-1`는 실제 카트리지 목록 `1/1`, ‘데이터33 / 33화 완료 / 미나’를 표시했다. A로 선택한 `...-loaded-f-1`에서는 ‘제33화 …까지 완료’, 자금 745880·총 턴수 254의 인터미션을 실제 확인했다(terminal 0, timeout false, 22.79초). 따라서 이 저장의 실제 F Load는 관측했다.

인터미션에서 UP→A로 ‘다음 전장으로’를 선택한 `...-next-menu-f-1`는 정상 이야기 화면으로 진입했다(terminal 0, 12.57초). 이 실행이 스스로 만든 MCA를 기존 read-only `alite_probe.read_state_bytes/workraml_payload_offset/read_workraml_cpu`로 읽었다. GS 진행 필드는 `[34,67,29]`, encoded turn 2(게임 턴 1)이며, `20211800`의 **13084바이트 전체**가 최신 accepted F 물리 본문 47과 바이트까지 일치했다. live·expected SHA-256은 모두 `7827f6aaa0b775598ff6a441b684288cfa388411b1d7e5b766e1f26ed7a91543`다. 원래 root8 callback은 `20211FFA`다. 다음 정상 이야기 단계에서도 전체 본문 및 같은 GS/callback이 동일했다. 아직 전투 맵과 새 제품 조건 실행은 관측하지 않았다.

후속 `f-product-objective-cart33-story-f-2`에서 실제 전투 맵이 표시됐다. accepted 전체 본문 47은 그대로 일치했고 게임 턴 1이었다. native selector와 같은 actor 상태 mask `60000008`, faction 0..2, 연결 unit cache `+16=FF` 조건으로 완전한 6560바이트 actor/pilot/unit 풀을 읽은 결과 활성 기체 종류는 115/129/89/117/104/119/176/113/109이며 107은 0이었다. 이 수는 배치 파일의 명목 개수가 아니라 해당 terminal own MCA의 실제 캐시 관측이다.

## 최신 제품 export 사적 복제본

정상 지원 본문 도달을 먼저 확정한 뒤 최신 `inspectPatchedImage → exportEditedImage`로 본문 47의 승리 조건만 ‘107번 기체 종류 있음’(`victoryRule1=80D7`)으로 바꿨다. 나머지 목적 필드와 아군 전멸 패배 조건은 그대로다. 출력은 `f-product-unit-objective-present47.bin`, whole SHA-256 `426bfa86ab6490a50282c9082c0a86162916953a3e479e3ac7108d8ef47a3591`이다. 기존 APFS exclusive clone writer로 accepted 소스를 공간 공유 복제하고 core가 재생성한 SCEDATA 섹터만 기록했으며 core output Blob의 전체 SHA와 동일하다.

새 inspector의 fresh reopen은 `bounded-editor-profile`이고 모든 요청 목적 필드가 동일했다. F RAM 경계 `0x8000` 아래에서 본문은 13084→13248바이트, OB03 mode 1이다. 원 본문의 모든 바이트는 root8/root13 헤더 두 필드를 제외하고 동일하며 원래 victory `2076: EC01EA`, defeat `2079: EC02EA`도 보존했다. 다른 모든 물리 본문은 바이트까지 같고 raw BIN 전체를 섹터 단위 비교해 SCEDATA 밖은 모두 같았다. 실제 변경 LBA는 `244929..244933` 5개, 주소·mode 헤더는 동일하고 SCEDATA MODE1 EDC/ECC 검사도 통과했다. 따라서 EXEC/IP helper 변경은 없다. 이 계약은 `f-product-unit-objective-present47-plan.json`에 기록했다.

제품 사적 이미지의 새 MCA 없는 `...-cold-f-1`은 같은 hash-pinned 원 기록을 쓰고 정상 cold 타이틀을 확인했다(52.33초, terminal 0, timeout false). `...-load33-f-1`에서 같은 카트리지 데이터33을 실제 로드해 인터미션을 확인하고 다음 전장 이야기로 진입했다(47.19초, terminal 0). **새 이미지가 스스로 만든 MCA**의 `20211800` 13248바이트 전체가 제품 export 본문과 동일하다(live·expected SHA `50fb52e31d64421adf6b45cccd48ea2da088ac8953a85af61849a278132ab231`). GS `[34,67,29]`, 게임 턴 1, 새 root8 callback `20214B1C`도 일치했다. accepted 원본문과의 raw 동일은 이 후보에서 주장하지 않는다.

native C0 operand cursor는 `20214B3A`, F3 branch cursor `20214B3E`, E9 대기 cursor는 `20214B4C`다. 기존 current-F decoder로 새 51바이트 제어 코드를 명령별 확인했으며 E9는 1바이트 yield, 뒤 `01 FFCF`는 다음 재개 시 새 root8로 돌아가는 별도 jump다. E9.1이라는 별도 subdispatch로 오해하지 않았다. C0 조회의 symbolic 실행은 일반 풀 loop의 일부 경로에서 bounded loopcap/maxpaths를 만나므로 이것만으로 native 조회 완료를 주장하지 않는다. 이 정적 분석과 아래 실제 완전한 풀·leaf/branch/yield 관측은 별개의 근거다.

## 실제 F C0.0E → 불충족 분기 → 대기·재개

제품 이미지에서 정상 이야기→출격 선택 완료 및 원래 출격 연출→전투 전 대화를 거쳤다. `...-activate-f-1`의 실제 ‘출격 유닛 선택’ 화면과 `...-deploy-f-1`의 원래 출격 연출을 확인했다. 원래 callback이 busy 상태에서 새 목적 wrapper의 E9로 곧바로 대기한 구간은 조건 조회 성공으로 세지 않았다. 이 단계들도 terminal 0, timeout false이며 source는 직전 제품 own MCA뿐이다.

`f-product-unit-objective-present47-battle-dialog-f-1`은 정상 대화 종료 뒤 실제 플레이 맵을 표시했다(2205 frame, 33.66초, terminal 0, timeout false). **frame 543과 544에서 생성 C0.0E를 각각 실제 실행했다.** operand cursor는 둘 다 `20214B3A`, root8 callback은 `20214B1C`이고 해당 164바이트 새 코드·목적·metadata가 실제 RAM과 바이트까지 같았다. 다음 결과를 각 호출별로 검증했다.

- F leaf `06022B9C`와 post-leaf `0602225A` 전후의 완전한 6560바이트 actor/pilot/unit 풀은 raw 동일했다. 풀 SHA-256은 `06dd06fdd077eb387fa35c7fd713a357784f63b1ded826f87641323ab25b6c78`다. native와 동일한 필터의 독립 oracle에서 107번 기체 종류는 0개이고 native count도 0이었다.
- 80바이트 VM은 count `+20` 및 predicate bit `+37` 이외에 달라진 바이트가 없었다. args 80바이트는 raw 동일했으며 r8..r15/PR이 보존되고 반환 r0는 `6003`이었다.
- native F3 handler `0601F2E0 → 0601F322`에서 count 0이므로 ‘있음’ 조건이 false였다. cursor `20214B3E`는 유지되고 r0=`6004`로 fallthrough해 pending jump를 거쳤다.
- native E9 `0601E37C → 0601E38E`는 cursor `20214B4C`를 VM 재개 위치에 저장했고 r0=`F000`으로 정상 yield했다. 다음 frame 544의 재조회 시 VM callback 위치가 새 root8 `20214B1C`로 돌아왔음을 실제 관측했다. 원래 guard·대기 흐름을 우회하거나 이미 끝난 콜백을 새로 주입하지 않았다.

terminal own MCA에서도 GS slot 67/게임 턴 1, 제품 본문 13248바이트 전체 지문, root8 callback이 동일했다. trace는 정상 close되고 poke 0, hit limit 미도달이다. checker는 전체 후보 SHA를 다시 확인한 뒤 위 두 호출의 native 근거를 통과시켰다. 사적 근거는 `f-product-unit-objective-present47-native-proof.py/json`, 입력 계약 `...-plan.json`, `...-battle-dialog-f-1/plan.json/report.json/trace.jsonl/own-state-inspection.json` 및 330×240 원 캡처다.

**범위:** 최신 제품 F export를 실제 게임에서 정상 Load→지원 본문 47→C0.0E→불충족 대기→다음 프레임 재개까지 확인한 것이다. 원래 victory `EC01EA`와 defeat `EC02EA` 바이트는 보존했지만 이 표본에서 실제 승리/패배 action 실행, 게임 저장 및 새 cold 재로드, 다른 13개 지원 본문, 종류 count 양수/부재 조합, 모든 장기 경로를 검증한 것은 아니다. 새 raw 파일을 만들 때 원 기록 payload를 바꾸지 않았지만 원 GameSave33 생성 이미지의 출처는 여전히 미확인이다. 제품과 저장소 바이너리는 변경하지 않았다.

## 별도 ‘107번 기체 없음’ 표본: 원래 승리 처리 조사

앞선 present 후보나 MCA를 고쳐 쓰지 않고 accepted F v0.5 a를 새 core 세션으로 다시 열어 동일 물리 본문 47의 승리 조건만 ‘107번 기체 없음’(`victoryRule1=80D6`)으로 export했다. 새 exclusive APFS clone `f-product-unit-objective-absent47.bin` whole SHA-256은 `c87a047699c9a9169184a059d6dbe42b0989fcaabe09fa34cc2c99b454fe8167`이다. 13084→13248바이트, mode 1, fresh reopen `bounded-editor-profile`, 요청 필드 일치, SCEDATA MODE1 EDC/ECC, 다른 모든 본문 동일, 원본문의 root8/root13 헤더 이외 모든 바이트 동일, 실제 변경 LBA `244929..244933` 5개 및 raw SCEDATA 밖 전체 동일 계약을 다시 통과했다. EXEC/IP 변경은 없다. 별도 `...-absent47-plan.json`에 기록했다.

같은 hash-pinned 원 데이터33 BCR을 사용하되 MCA 없는 새 home에서 cold했다. `...-absent47-cold-f-1`은 3605 frame, 54.85초, terminal 0, timeout false, `sourceSaveState=null`, poke/cheat/mediaID override 없음이며 실제 타이틀을 확인했다. 다음 단계는 이 이미지가 스스로 만든 MCA로 실제 Load33→slot67→출격을 진행하고, count0의 absent 조건이 원래 `2076: EC01EA`에 도달하는지 확인하는 것이다. 게임 결과 공유 consumer 주소와 설정 값을 F의 current EXEC에서 직접 관측하며, 결과까지 가기 전에는 실제 승리를 주장하지 않는다.

`...-absent47-load33-f-1`에서 데이터33의 실제 인터미션을 확인했고 다음 전장 slot 67로 정상 진입했다(51.75초, terminal 0). own MCA의 13248바이트 전체가 absent export 본문과 raw 동일했다(SHA-256 `de26476e55ac4ddb43d421486a817191c8401ab121cd755c62550adae545f2f4`). 이후 원래 도입→출격 선택 완료→출격 연출→전투 전 대화를 정상 입력으로 진행했다. 모든 source는 해당 absent 이미지가 직전 terminal run에서 만든 own MCA다.

`f-product-unit-objective-absent47-deploy-clear-f-1`의 frame 2603/2604에서 실제 C0.0E count107=0을 관측했다. 각 호출 전후 전체 6560바이트 풀 raw 동일, 독립 oracle 일치, args 80바이트 및 r8..r15/PR 보존, VM 변경은 +20/+37뿐이며 r0=`6003`였다. native F2 `0601F28C → 0601F2CE`는 cursor `20214B3E`의 count0 조건을 성립시켜 `20214B45`로 jump했고 r0=`F000`였다. 원 victory 명령 `2076: EC01EA`의 operand cursor `2021201D`에서 native EC handler가 실제 실행됐다.

EC setter `0601EE10 → 0601EE52`는 VM byte37의 기존 predicate `80`을 보존하면서 outcome bits `10`을 넣었다. 실제 전체 byte는 **`90`**이며 이것을 raw `10`이라고 쓰지 않는다. 이후 shared cursor `2022FD9B`에서 실제 operand `FF` decode를 관측했고 native consumer `0601EE3E`가 r0=1을 `060C08F0`에 썼다. `0601EE54`에서는 저장된 결과 byte `01`을 실제 확인했다. 게임 도입의 결과0 소비와 조건 승리의 결과1 소비는 순서·cursor·register 값으로 구분했다. `...-absent47-native-proof.py/json`이 후보 전체 SHA/current EXEC hash 및 위 두 호출과 원 action/shared consumer를 재검증해 pass했다.

조건 처리 직후 조작 중인 이동 범위가 남은 맵을 실제 완료로 부르지 않았다. 정상 B 입력으로 UI를 정리한 `...-absent47-menu-f-1`에서 **전투 후 보너스 EXP/레벨업 지급 화면**을 실제 확인했다(12.84초, terminal 0). 후속 A 입력에서 브라이트의 레벨 및 정신커맨드 습득창도 확인했다. 이는 native result1을 썼다는 VM 내부 근거에 더해 게임이 실제 전투 후 보상 흐름에 들어갔다는 별도 화면 근거다. 게임 저장과 새 cold Load는 아직 진행 중이다.

이어 실제 전투 후 리리나 일행의 대화가 나왔고 GS progress5는 34→35로 증가했다. 적 캐시는 사라졌으며 원래 전투 후 진행이었다. `...-absent47-poststory-f-2`에서 정상 이야기 뒤 인터미션 저장 메뉴에 도달해 본체 RAM을 선택했다. game backup을 기존 hash-pinned reader로 읽은 결과 본체 BKR에 **새 `SROBOT_F_01`**(이름의 01은 저장 슬롯)이 생성됐다. payload `0x1600`, 진행 `[35,73,67]`, checksum `(199226,199226)`, payload SHA-256 `fd41d61c24e2d1b315eca566a8bcce872ab9f2eb93284de5063cca1f50b578d7`이다. BKR 전체 SHA-256은 `f2abeae7cf98ec47ec84a3a7660e8653be1383fe91a868321150e1317c863414`다. 원래 카트리지 `SROBOT_F_33` payload와 logical raw 전체는 동일하다. Save 번호를 완료 화수와 섞어 `SROBOT_F_34`라고 부르지 않는다. 다음 실제 cold Load에서 ‘데이터1 / 34화 완료’를 직접 확인할 단계다.

저장 알림을 기다린 `...-absent47-saved-f-1`은 terminal 0, timeout false, 10.93초이며 새 `SROBOT_F_01` payload 및 전체 BKR SHA가 그대로였다. 이 실행의 home에서 새 cold home을 만들고 모든 MCA를 제거했다. `...-absent47-reload-cold-f-1`은 copied BKR hash `f2abe...3414`와 후보 전체 hash `c87a...8167`을 확인했고 `sourceSaveState=null`, poke/cheat/mediaID override 없음, 58.39초, terminal 0이다. 실제 타이틀 뒤 정상 Load→본체 RAM을 선택한 `...-absent47-reload-load1-f-1`에서 **‘데이터01 / 34화 완료 / 제34화 마지막의 그림자’, 총 턴수 255, 자금 745880**을 실제 표시했다. 원 데이터33의 총 턴수 254와 구분되는 새 저장이었다.

A로 데이터01을 실제 로드한 뒤 인터미션의 ‘제34화 …까지 완료’ 및 F완결편으로 이어 쓸 수 있는 클리어 데이터 안내를 확인했다(2405 frame, 38.39초, terminal 0, timeout false). own MCA의 GS `[35,73,67]`는 새 GameSave payload와 동일했다. 이후 실제 활성 slot 73은 물리 본문 51이며, 10494바이트 전체가 현재 후보 이미지의 해당 본문과 raw 동일했다(SHA-256 `48a9e00cb4d45b96532e7d0f7e66cdb1774e84b6f0983400ba66da0eae3d1697`). 저장 직전의 동일 전투 후 본문 지문과도 일치했다. **전투 후에는 본문 47이 계속 활성이라고 주장하지 않는다.** 화면 전체나 actor cache의 raw 동일을 저장/Load 근거로 주장하지도 않는다.

최종 사적 checker `f-product-unit-objective-absent47-save-reload-proof.py/json`은 native 조건 승리·원래 EC01·shared result1, 실제 보상/전투 후 진행, 정상 Save로 만든 체크섬 유효 GameSave, 그 정확한 BKR을 복사한 MCA-free cold, 실제 본체 RAM Load01, GS 및 전투 후 본문 전체 지문을 함께 통과했다. 원 330×240 캡처와 각 terminal report/closed trace를 보존했다. 저장·새 Load 표본에서도 정상 CUE와 해당 이미지의 own MCA만 사용했다.

**최종 범위:** F 최신 제품 export의 mode 1 본문 47에서 count0의 present 불충족 대기·재개 및 absent 성립 승리·보상·34화 완료·실제 GameSave/새 cold Load를 확인했다. 107번 종류의 count 양수, 패배 action, 다른 13개 지원 본문, 모든 장기 경로나 실제 F완결편의 클리어 데이터 수입은 이번 근거에 없다. 기록을 생성한 이전 원 GameSave33 이미지의 출처 한계도 그대로다. 새 acceptance나 제품 배포, 증원 기능 활성화의 근거로 확대하지 않는다. 저장소 바이너리와 제품 코드는 변경하지 않았다.
