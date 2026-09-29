# v3 공용 payload 재배포 기록

이 문서는 F v0.4·F v0.5 글꼴 변형 여섯 개(`-a/-b/-c`)의 payload를 v1 파일 여섯 개에서 버전마다 공유 v3
payload 하나로 다시 싣는 **재배포**의 기록입니다. 형식은 [`PATCH_FORMAT_V3.md`](PATCH_FORMAT_V3.md), 측정은
[`PATCH_V3_MEASUREMENTS.md`](PATCH_V3_MEASUREMENTS.md)에 있습니다.

## 바뀌지 않은 것

- 릴리스 id, 결과 이미지의 `target.size`·`target.sha256`, 원본 stock profile, 표시 이름, 게시 시각은 그대로입니다.
- 영수증의 원래 증거 필드(`acceptedAt`, `stockProfileId`, `sourceSha256`, `targetSha256`, `v5Commit`, `gates`)는 바이트 단위로
  그대로입니다. `gates.longPlayProgression`은 여섯 개 모두 `NOT_CLAIMED`이며 증거 범위는
  [`F_V04_VALIDATION.md`](F_V04_VALIDATION.md)와 [`F_V05_FIN_V02_VALIDATION.md`](F_V05_FIN_V02_VALIDATION.md)가 정한 그대로입니다.
  **이 재배포는 새 콜드부트·개별 플레이·장기 진행·CD-R 검수나 새 runtime 검증을 주장하지 않습니다.**
- 각 변형은 자기 릴리스 id, 릴리스 명세, 영수증을 그대로 가집니다. `docs/*.build.json`과 두 검증 문서도 바이트 단위로 그대로입니다.
- F 완결편(v2)과 다른 모든 릴리스의 payload, v1·v2 형식, 그 규칙과 오류 코드는 바뀌지 않았습니다.

## 바뀐 것

| | 이전(v1) | 이후(v3) |
|---|---|---|
| payload 파일 | 릴리스마다 1개, 여섯 개 합계 400,747,543 bytes | 버전마다 공유 1개, 두 개 합계 42,614,467 bytes |
| record별 preimage 해시 | 있음(record마다 32 bytes) | 없음. 헤더의 canary 8개만 남음 |
| 변형 공통 record | 변형 파일마다 반복 | 한 번만 |
| 영수증 | 원본 그대로 | 같은 경로에서 재발급(`patchSha256`·`decisionAuthority` 갱신, `patchFormat`·`variantId`·`supersedes` 추가) |
| 릴리스 명세 `patch` | 여섯 키 | 여덟 키(`variant`, `commonRecordCount` 추가), `url`은 `patches/<그룹>.v3.srwfp`를 공유 |
| index | 행마다 `manifestSha256` | 여섯 행의 `manifestSha256`만 새 값 |

## 기준점: `3cb5e69`

여섯 v1 payload를 마지막으로 담고 있는 커밋은 `3cb5e690e7a8a629962719d80f909e7cc1dd6722`(`3cb5e69`,
"Publish the F v0.5-c font variant to complete the split release")입니다. 이 커밋의 원격 배포는 사용자의 2026-09-28
"원격배포도해" 지시가 승인한 범위입니다. **재인코딩한 payload의 원격 배포는 그 승인에 포함되지 않으며 사용자의 별도 요청이
있어야 합니다.** git 이력은 다시 쓰지 않으므로 `.git`에는 이전 payload 약 400 MB가 남고(v3 커밋으로 약 43 MB 더 늘어남),
작업 트리와 Pages가 올리는 파일만 줄어듭니다. 이전 payload는 언제든 `git show 3cb5e69:patches/<id>.srwfp`로 꺼낼 수 있고
아래 해시와 대조됩니다.

## 대체된 v1 payload (해시로 고정)

각 v1 파일의 SHA-256은 당시 영수증 `patchSha256`과 같았습니다. `recordSetSha256`은 변형 하나의 병합 record를 offset 순서로
`offset u64 BE ‖ length u32 BE ‖ targetBytes`를 이어 붙여 낸 SHA-256이며 v1에서는 record마다 32-byte preimage를 뺀 body와
같은 byte열입니다. 인코딩과 무관한 지문이라 v1과 v3에서 각각 계산해 같아야 하고, 같다는 것은 결과 이미지가 같은 record
집합에서 나온다는 뜻입니다. 이 값들은 `scripts/verify_repo.py`의 `V3_SUPERSEDED`에도 고정되어 있습니다.

| 릴리스 | v1 payload bytes | v1 payload SHA-256 | record 수 | `recordSetSha256` |
|---|---:|---|---:|---|
| `srwf-f-20260928-v0-5-a` | 69,587,546 | `a309a7951effdbde05d5bd4c853eb41ccd8a5b00bb2be8a57df380734f28df59` | 1,330,782 | `6a76996aa051966c5e58e7881c370daa99a6e3ec23b468b8c45fdf61125e098f` |
| `srwf-f-20260928-v0-5-b` | 69,588,190 | `0a49422528c142bd24cbbf975fdcfb4f09f059069e5025e48e81ad8efae70345` | 1,330,773 | `745eea13ea71c641fee1ef9cf710fe1d63035b3c50002b572b74b0169c7073d3` |
| `srwf-f-20260928-v0-5-c` | 69,592,331 | `9981ea581a400807fbc6dc6c935dba39f18615f0223ded23c4675ed7f5d78f1d` | 1,330,842 | `bd73b53ad9e320da95c585d9b616a40df98e492de10473b1207f3e73097966bb` |
| `srwf-f-20260915-v0-4-a` | 63,992,864 | `f31ffbd24da40bc4355fa14878d0d24d80887e4ea2a6d88409099c9568ded0de` | 1,257,063 | `53761d693ea140c94d43a58ad4ecb7f860fbe91c3e102e1e96fd8ae9f9246870` |
| `srwf-f-20260915-v0-4-b` | 63,991,849 | `d6fcea57763bad838b1cfc73fedec75e485ffd541fb9783de7e37a0186f6c920` | 1,257,040 | `4e3af45347418d1a4c3f321b52c900688c424c1aaef1eb42934b4490b056fe8b` |
| `srwf-f-20260915-v0-4-c` | 63,994,763 | `71bac68e81558b2d4ef24f16408e11a058c23140d1cfb57b77a05fa6be1db94a` | 1,257,088 | `604c9c44ebfe82afe9e1e8413d8c3f2cb0cce89938de7ac73c7b5effb4dab854` |

## 새 payload

| 그룹 | 파일 | bytes | SHA-256 | 헤더 | zlib | body(압축 해제) | 공통 record |
|---|---|---:|---|---:|---:|---:|---:|
| F v0.5 | `patches/srwf-f-20260928-v0-5.v3.srwfp` | 22,152,354 | `5fdc0b2549ff505e3ed5d29805e593d13df93a23df9c781c117752ab8dccf0cb` | 515 | 22,151,839 | 39,438,740 | 1,330,116 |
| F v0.4 | `patches/srwf-f-20260915-v0-4.v3.srwfp` | 20,462,113 | `2832fda0cc01f9aa51a7131e5dfd0e95ffc8b0be289f63e55919e0758e78ab9e` | 515 | 20,461,598 | 39,251,814 | 1,256,388 |

payload 해시는 이 생성기와 CPython zlib 1.3(level 9, `memLevel` 9, `wbits` 15)의 결과입니다. **압축기는 형식의 일부가 아니라서**
다른 zlib 빌드로 다시 만들면 다른(똑같이 유효한) 해시가 나옵니다. 그래서 생성기는 한 번만 돌려 그 산출물을 커밋하고, 손으로 고치지
않습니다. 커밋된 파일의 정당성은 아래 무손실 검증이 보증하며 바이트 단위 재현은 같은 zlib에서만 기대합니다.

## 재발급 해시 사슬

payload → 영수증 `patchSha256` → 영수증 파일 SHA-256 → 명세 `provenance.acceptanceReceiptSha256` → 명세 파일 SHA-256 →
index `manifestSha256`. 재발급 영수증의 `decisionAuthority`는 다음 문구(103자)이며 `V3_REDISTRIBUTION_DECISION_AUTHORITY`로
고정됩니다.

> 사용자 2026-09-29 지시: 기능·정확도 유지, 낭비 용량 제거. 동일 승인 결과의 v3 공용 payload 재배포이며 신규 검수·승인 주장 없음. 원 근거는 supersedes.

이 문구가 한 글자라도 달라지면 아래 영수증·명세 해시와 index의 `manifestSha256`이 모두 달라집니다.

| 릴리스 | 이전 영수증 SHA-256 | 새 영수증 SHA-256 | 이전 명세 SHA-256 | 새 명세 SHA-256 |
|---|---|---|---|---|
| `srwf-f-20260928-v0-5-a` | `6241ba3f5c04aa98209222130cbd008b5afa44b5e734201a08ac5e4ebb52de78` | `9038b28d38d75d0367fd94e21304a0110143603b7ec52e61e6c94d9c7369ad3f` | `97d5311fcb740f5acd6b5573bbe8c0b9362878abbb44e5312f95fb6942b45fde` | `3827b0bdf026be023584e8a5b0581db972343b9ad68a086479e2d67b46caddff` |
| `srwf-f-20260928-v0-5-b` | `b21f2d8979e54eabefe75a77d0d42b7eb15231c71594784306d70c43c0ef6d56` | `1eda03606fb903e6e07dc21f9f928ab3c48b3d6ae8bfcd738abd443151625ed3` | `658f7b9e8d14fa5ff91c3281f39ceaf8b1e36834e9a2396f86bde5078381d0df` | `1297aa4afe33cedc5f487819e425de8b297a7b786157545664c9ecec0b6b2675` |
| `srwf-f-20260928-v0-5-c` | `08b0cf5db0aa1e669dfc4c6a4a4db8b9a5ba988a9cd86372b34a90113d102bf3` | `49dfefb3e394f1fc87fd53723f142f1ab933f4c603ab6a8a19d34f31b171dadc` | `d1e2d20dd3490ee40760c9ce885f4788a127f2153b753f47c8537b511c99a87f` | `f0125d651966399eced54eb17bd939c8fbed474c38e9a53d4831168e0f32c9d2` |
| `srwf-f-20260915-v0-4-a` | `8de9609f460d7696d1d2e6c1c58a3ba31464140d2c7b5497c5a304459366d017` | `99c608ea371b066198a10361b9023841895b3b96b8304ce7ad0993108c4770dc` | `b4db01d8bb70c4910293e124a89f6645a1ce408020d9b4474eb3f533ec1bfd5e` | `05df44b79298298c75ea9d64697566a0768afb8e88d57ec73d82c5ce4da962b2` |
| `srwf-f-20260915-v0-4-b` | `84a436ca53a06ca93551e0ad678aa663832f908502a8cc7bdad0755869f05e91` | `2bbdf90c9bdcc56cd6b21804b628cb2b4bfc9590f44b2e166741059899d9db68` | `a3317c1c0cdf23d57f5422aca9c16506a42904f78a399f1374be6b7dcefc840d` | `6137eccad9d3bb546ffcf08a335bba8c5246a762e418a49a54b3585c6c525fcf` |
| `srwf-f-20260915-v0-4-c` | `5f2a993d021751ea93fce4e0b8811b1f7892fc4fb6d84571a5469064a159635a` | `8d3fe669f04aeb062553e4cd6c7b891dc68a903d80200ab9c4ef79b3ab62b637` | `be3c993c889c3af22d6e7265d56b8eba19497842f0308d6186b1e1b95db79f5e` | `5646954250264fd9202787feac19b0a706df13f92b3e1d4de38687f1dda6fc74` |

이전 영수증 SHA-256은 재발급 영수증의 `supersedes.receiptSha256`과 같습니다.

## 재현과 검증

모든 명령은 표준 라이브러리만 쓰는 `scripts/convert_to_v3.py`이며 네트워크를 쓰지 않고, 정품 이미지가 **필요 없는** 것과 있어야 하는
것이 나뉩니다.

정품 이미지가 필요 없는 것:

```
# 변환 전(v1 상태)의 저장소에서: 이력 표를 v1 payload로부터 다시 계산해 V3_SUPERSEDED와 대조
python3 scripts/convert_to_v3.py pins
# 변환 계획과 무손실 검증만 하고 아무것도 쓰지 않음
python3 scripts/convert_to_v3.py install --dry-run
# 변환(원자적, 되돌림 포함, 두 번째 실행은 "already converted")
python3 scripts/convert_to_v3.py install
python3 scripts/verify_repo.py

# 변환된 저장소에서: 엄격한 독립 디코드 + 모든 변형의 recordSetSha256·헤더 해시·영수증 대조
python3 scripts/convert_to_v3.py verify
# 이전 v1 payload를 git 이력에서 꺼내 record 단위(offset, length, bytes)까지 전부 비교하고 canary 해시를 v1 preimage와 대조
python3 scripts/convert_to_v3.py verify --v1-git-rev 3cb5e690e7a8a629962719d80f909e7cc1dd6722
# 같은 zlib 빌드에서는 payload를 바이트 단위로 다시 만들어 비교
python3 scripts/convert_to_v3.py verify --v1-git-rev 3cb5e690e7a8a629962719d80f909e7cc1dd6722 --reproduce
# 재인코딩 결과를 저장소 밖에 쓰기
python3 scripts/convert_to_v3.py encode --v1-git-rev 3cb5e690e7a8a629962719d80f909e7cc1dd6722 --out-dir /tmp/v3-out
```

`install`은 v1 payload 각각을 영수증·명세·index와 이력 표(`V3_SUPERSEDED`)에 대조한 뒤에만 인코딩하고, 인코딩 결과를 독립
디코더로 풀어 여섯 릴리스의 (offset, length, targetBytes) 목록이 이전 v1과 record 단위로 완전히 같음, `recordSetSha256`이 같음,
헤더의 원본·결과 해시가 영수증과 같음, canary 해시가 v1 preimage와 같음, 정규 재인코딩이 압축 해제한 body와 같음을 확인합니다.
그다음 파일을 쓰고 `verify_repo.validate_index`가 실패하면 모든 파일을 이전 바이트로 되돌립니다. v1 payload는 검증이 끝난 뒤에만
지웁니다. 반쯤 변환된 상태(형식 혼합, 빠진 파일, 남은 v1 payload 등)를 만나면 아무것도 건드리지 않고 거부합니다(종료 코드 2).
고정된 그룹(F v0.4·v0.5)은 한 번에 함께 변환하며, 검증기가 남은 v1 `-a/-b/-c` 행을 거부하므로 일부만 변환하려는 시도도 거부합니다.

**소유자의 정품 이미지가 필요한 것**은 `verify-stock` 하나입니다. push나 배포 전에 소유자가 자신의 정확한 stock으로 돌립니다.

```
python3 scripts/convert_to_v3.py verify-stock --stock /path/to/stock-track01.bin
```

각 그룹에서 원본을 한 번 스트리밍하면서 원본 전체 SHA-256, canary, "record byte는 원본 byte와 달라야 함" 규칙, 그리고 **모든
변형의** 결과 SHA-256이 승인된 `targetSha256`과 같음을 확인합니다. 결과 이미지는 쓰지 않습니다. 통과 기록 없이 push·배포하지
않습니다. 무손실 검증이 데이터 변환을 원본 없이 증명하므로 이 실행은 출시할 디코더·적용기 구현을 정품 이미지로 확인하는 것이며,
브라우저 엔진(`assets/patch-core-v3.mjs`)의 여섯 릴리스 적용은 별도로 확인합니다.

## 정책 결과

- `scripts/verify_repo.py`는 v3 payload를 `zlib.decompressobj`로 엄격히 디코드하고(같은 header·varint·병합·캡처 창·canary 규칙,
  정규 분할, 정규 재인코딩), 헤더의 변형 집합이 그 URL을 가리키는 `ACCEPTED` 행의 집합과 양방향으로 같은지, 변형별 결과 해시가
  명세·영수증·헤더에서 같은지, 재발급 영수증의 `supersedes`와 `recordSetSha256`이 이력 표와 같은지 확인합니다.
- 같은 크기의 `-a/-b/-c` 글꼴 변형에는 새 v1 행을 둘 수 없습니다(v2 성장 행은 그대로 허용). v3는 `V3_SUPERSEDED`에 있는 재배포
  대상만 쓸 수 있습니다. 따라서 **다음 글꼴 그룹을 공개하려면 새 승인 사슬과 함께 검증기 규칙을 넓히는 별도 변경이 필요합니다.**
- `.srwfp` 전체 예산은 192 MiB(`SRWFP_TOTAL_MAX`)이며 검증기가 저장소의 모든 `.srwfp`(철회된 역사 자료 포함)의 합을 검사합니다. 변환 뒤
  합계는 107,240,802 bytes(102.3 MiB)입니다. 이전에는 465,373,878 bytes(443.8 MiB)였습니다.
