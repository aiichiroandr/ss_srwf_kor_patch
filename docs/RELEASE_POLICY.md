# 공개 릴리스 정책

## 현재 상태

이 저장소는 현재 `HAS_ACCEPTED_RELEASE`이며,
[`manifest/releases.json`](../manifest/releases.json)에
기본 릴리스 `srwf-f-20260815-v0-1-2`와 이전 핫픽스
`srwf-f-20260814-v0-1-1`, 그리고 F 완결편 기본 릴리스
`srwf-final-20260814-v0-1` 시험판이 등록되어 있습니다. 각 payload는 독립된
영수증·릴리스 명세와 해시가 일치하는 희소 `.srwfp`입니다. v0.1.2는 v0.1.1에서
발생한 프롤로그 제목 화면의 그래픽 깨짐을 수정하며, v0.1.1은 재현과 비교를 위한
이전 공개판으로 남습니다. 철회된
`srwf-f-20260814-v0-1`의 manifest, acceptance receipt, payload는 공개 인덱스에서
제외되며 검증기에 고정된 SHA-256의 바이트 불변 역사 자료로만 남습니다.

게임 카탈로그의 `srwf-f`와 `srwf-final`은 모두 `HAS_ACCEPTED_RELEASE`입니다.
F 완결편 v0.1은 제한된 콜드부트·데모 경로만 확인한 공개 시험판이며, 장시간
실플레이·전 경로·정식 사용자 R7 완료를 주장하지 않습니다.

후속 `latest`, 새 빌드, 실행 가능 후보, 정적 검증 통과, identity rebuild 또는
일부 화면의 runtime 확인만으로 새 항목을 추가할 수 없습니다.

## 공개 가능한 상태

공개 인덱스가 허용하는 release row 상태는 오직 `ACCEPTED`입니다. 다음과
같은 내부 상태는 이름과 관계없이 공개 인덱스에 들어갈 수 없습니다.

- candidate, test, ready, frontier, draft, RC
- runtime gate가 일부만 끝난 build
- 실패하거나 철회된 build
- 정품 원본이 아닌 이전 작업 이미지나 집계 sector diff를 binary base로 쓴 build

승인 릴리스가 하나 이상 생길 때만 project status를
`HAS_ACCEPTED_RELEASE`로 바꿉니다. `NO_ACCEPTED_RELEASE` 상태에서는 schema와
검증기가 빈 배열을 강제합니다.

## source authority

공개 patch는 게임별로 아래 stock profile 하나에만 적용됩니다.

| field | exact value |
|---|---|
| profile id | `saturn-jp-stock-track01-mode1-2352-c198a930` |
| size | `578512032` bytes |
| SHA-256 | `c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8` |
| track | `TRACK 01 MODE1/2352` |
| geometry | `245966 × 2352`, user data `16 + 2048` |

| field | F 완결편 exact value |
|---|---|
| profile id | `saturn-jp-stock-track01-mode1-2352-ff7192ab` |
| size | `520408224` bytes |
| SHA-256 | `ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb` |
| track | `TRACK 01 MODE1/2352` |
| geometry | `221262 × 2352`, user data `16 + 2048` |

Rev. A `10M` CUE+BIN 세트는 별도의 stock profile이나 release가 아니라 위 F 완결편
canonical source의 고정 입력 표현입니다. 정규화 전 합본 SHA-256은
`b94fec3e4ddcbac5849a94b3bae17c4d38efe74c583714417deefffa7b57c976`,
Track 3 SHA-256은
`66f03f518c58106976cab1f83c19190103f10f66ccc40ce049c7e08cce58691b`입니다.
Track 1·2는 동일하고 Track 3은
`20 × 00 + 10M Track3[0:-20]`으로 길이 보존 정규화합니다. normalizer는 잘려 나가는
마지막 20바이트가 모두 `00`인지 확인하고, patch worker가 정규화된 전체 이미지의
SHA-256이 `ff7192…`와 같은지 다시 검증합니다. 어느 조건이든 맞지 않으면 fail closed
하며, 이 입력 표현은 새 ACCEPTED 릴리스나 별도 target을 만들지 않습니다.

이전 작업 자료는 의미·번역 이관 근거일 수 있지만 binary donor나 암묵적인 build
base가 될 수 없습니다. 공개 artifact는 별도 빌드 저장소에서 stock-derived build와
각 owner의 검증을 마친 뒤에만 이 저장소로 옮깁니다.

## ACCEPTED 영수증 gate

승격에는 `receipts/<release-id>.acceptance.json` 형식의 명시적 영수증이
필요합니다. 영수증의 `state`는 정확히 `ACCEPTED`여야 합니다. 다음 세 gate는
반드시 `PASS`여야 합니다.

- static structure
- runtime consumption
- visual layout

`longPlayProgression`은 장시간 진행 검증을 실제 완료했을 때만 `PASS`입니다.
공개 시험판이 제한된 런타임 범위와 미검증 범위를 사용자에게 명시하고, 소유자가 그
경계로 공개를 승인한 경우에는 `NOT_CLAIMED`를 기록할 수 있습니다. 이를 장시간 검증
통과나 정식 검수 완료로 해석하면 안 됩니다.

영수증은 release id, stock profile/source hash, target hash, patch hash, 빌드
provenance identity, 결정 시각과 decision authority를 고정합니다. build receipt hash만
있는 경우에는 승격할 수 없습니다. 구조는
[`schemas/acceptance-receipt.schema.json`](../schemas/acceptance-receipt.schema.json)에
정의되어 있습니다.

`v5Commit`은 provenance object format에 맞는 완전한 lowercase identity만
허용합니다. Git 기반 빌드는 40자리 또는 64자리 commit id를 쓰고, 비-Git 기반
F 완결편 빌드는 hash-pinned 원장 파일의 64자리 SHA-256을 씁니다. 공개 문서에서
후자를 Git commit이라고 부르면 안 됩니다. 축약·가공 값은 허용하지 않습니다.

## 원자적 승격 순서

모든 입력이 준비된 뒤 하나의 검토 가능한 변경으로 다음을 추가합니다.

1. `receipts/<id>.acceptance.json` — explicit `ACCEPTED` receipt
2. `patches/<id>.srwfp` — 32 MiB 이하의 정규형 sparse patch
3. `releases/<id>.json` — source, target, patch, provenance 명세
4. `manifest/releases.json`의 `ACCEPTED` index row
5. 최초 릴리스라면 project status를 `HAS_ACCEPTED_RELEASE`로 변경

index의 `manifestSha256`은 release manifest 파일 bytes의 SHA-256입니다.
release manifest의 `patch.size`/`patch.sha256`은 payload와 같아야 하며
`provenance.acceptanceReceiptSha256`은 receipt 파일 bytes와 같아야 합니다.
release manifest와 receipt가 가리키는 source, target, patch, build commit도
서로 같아야 합니다.

완성 disc image와 CUE는 이 단계에서 추가하지 않습니다. CUE는 승인된
명세의 안전한 파일명으로 브라우저가 로컬 생성하며, target image는 사용자의
원본에서 로컬 생성됩니다.

## 공개 index row 계약

```json
{
  "gameId": "srwf-f",
  "id": "srwf-f-YYYYMMDD-version",
  "state": "ACCEPTED",
  "label": "표시 이름",
  "manifest": "releases/srwf-f-YYYYMMDD-version.json",
  "manifestSha256": "64 lowercase hex characters"
}
```

`manifest`는 same-origin 상대 경로여야 합니다. URL scheme, host, 절대 경로,
query, fragment, percent encoding, 빈 path segment와 `..` traversal은 허용하지
않습니다. 공개 manifest·patch·receipt 경로와 확장자는 문서에 적힌 lowercase
정규형만 허용하며, 대소문자 변형 artifact와 symbolic link도 차단합니다.

## release manifest 계약

아래는 key 모양만 보여 주는 비공개 schematic입니다. placeholder를 실제
값처럼 게시하면 안 됩니다.

```jsonc
{
  "schema": "srwf-kor.public-release.v1",
  "id": "srwf-f-YYYYMMDD-version",
  "state": "ACCEPTED",
  "version": "v0.1",
  "title": "표시 이름",
  "publishedAt": "YYYY-MM-DDTHH:MM:SSZ",
  "source": {
    "profileId": "saturn-jp-stock-track01-mode1-2352-c198a930",
    "size": 578512032,
    "sha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8"
  },
  "target": {
    "filename": "SRWF-KOR-YYYYMMDD-version.bin",
    "cueFilename": "SRWF-KOR-YYYYMMDD-version.cue",
    "size": 578512032,
    "sha256": "<accepted target SHA-256>"
  },
  "patch": {
    "format": "srwf.sparse-byte-delta.v1",
    "url": "patches/srwf-f-YYYYMMDD-version.srwfp",
    "size": 0,
    "sha256": "<accepted patch SHA-256>",
    "recordCount": 0,
    "bodyUncompressedSize": 0
  },
  "provenance": {
    "v5Commit": "<full build commit id or pinned non-Git ledger SHA-256>",
    "buildReceiptSha256": "<build receipt SHA-256>",
    "acceptanceReceiptSha256": "<ACCEPTED receipt SHA-256>"
  }
}
```

실제 공개 값에서는 patch `size >= 101`, `recordCount >= 1`,
`bodyUncompressedSize >= 45`여야 합니다. 상세 schema는
[`schemas/release.schema.json`](../schemas/release.schema.json)입니다.

## 정적·개인정보 경계

사이트와 모든 release URL은 same-origin 정적 파일만 사용합니다. CDN,
remote font, analytics, telemetry, tracker, account, upload API 또는 network
write를 추가하지 않습니다. 사용자가 고른 원본과 생성 결과는 브라우저
session 밖으로 전송하지 않습니다.

공개 binary UI asset은 기본적으로 하나도 허용하지 않습니다. 추가하려면 검토한
정규 repository path와 파일 bytes의 lowercase SHA-256을 검증기의 명시적
allowlist에 함께 고정해야 합니다. allowlist에 들어간 PNG, WebP, ICO, WOFF2도 각
파일 8 MiB, 전체 24 MiB 상한과 기존 container 구조 검사를 모두 통과해야 합니다.
단순히 확장자를 바꾸거나 유효한 container 안에 다른 payload를 넣는 것만으로는
승인되지 않습니다. `.srwfp`는 이 UI asset 절차에 포함하지 않고 기존의 ACCEPTED
index와 전용 parser gate를 그대로 거칩니다. 현재 allowlist에는 패치노트의
저해상도 AS-IS/TO-BE PNG만 들어 있으며, 실제 공개 빌드 반영 자료와 동일 기능의
선행 검증 화면을 화면에서 명확히 구분합니다. 전체 디스크 이미지, 세이브·상태 파일과
에뮬레이터 캐시는 이 절차로도 승인할 수 없습니다.

외부 URL·network write 검사는 `.html`, `.htm`, `.shtml`, `.xhtml`, SVG/XML/XSL, CSS,
JavaScript와 MJS 등 저장소의 active web source에 적용합니다. `tests/` 아래
JavaScript/MJS 회귀 fixture의 문면 검사는 제외할 수 있지만, 배포 HTML·CSS·SVG나
모듈이 그 fixture를 참조하는 것은 금지합니다. `index.html`의 CSP는 주석 속
문자열이 아니라 `<head>` 안의 실제 `Content-Security-Policy` meta와 정확한
directive 집합으로 검사합니다.

## 승격 전 검증

```bash
python3 scripts/verify_repo.py
npm test
```

검증기는 index/schema 관계, exact stock profile, receipt/manifest/payload hash,
`.srwfp` 구조와 상한, 금지 artifact 및 정적 사이트의 외부 network dependency를
검사합니다. 하나라도 실패하면 공개 변경을 만들지 않습니다.
구조 검사는 실제 indexed payload의 header, 단일 zlib stream, record 정렬·범위·
정규형과 manifest descriptor까지 포함합니다. 원본 byte가 필요한 record
preimage 및 모든 target byte의 실제 변경 여부는 브라우저 적용기가 exact stock
원본을 읽은 뒤 별도로 fail-closed 검증합니다.

설치된 pre-commit hook은 dependency 설치, `curl`, `wget`, `npx` 같은 네트워크
동작 없이 저장소의 고정된 `npm test` 명령 전체를 실행합니다.

원격 push와 Pages 배포는 저장소 소유자의 명시적 요청이 있을 때만 수행합니다.
