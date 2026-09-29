# 레이어 배포: 공통 패치 + 폰트 차이 패치

글꼴만 다른 a/b/c 변형 릴리스는 결과 이미지의 대부분이 같습니다. 레이어 배포는
**이미 승인된 각 변형의 결과 이미지(target)를 한 바이트도 바꾸지 않고**, 그 변형의
승인된 record 집합을 두 개의 일반 `srwf.sparse-byte-delta.v1` 파일로 나눠 싣는
배포 방식입니다. 새 patch 형식, 새 magic, 새 승인 결과가 아닙니다.

| layer | 원본 → 결과 | 내용 | 파일 |
|---|---|---|---|
| `base` | 고정 stock → 중간 이미지 | a/b/c 모두에 **완전히 같은** record | `patches/<group>.base.srwfp` (그룹 공유) |
| `font` | 중간 이미지 → 승인 결과 | 해당 변형에만 있는 record | `patches/<release-id>.font.srwfp` |

`<group>`은 `srwf-f-20260928-v0-5`처럼 `-a/-b/-c`를 뗀 릴리스 id입니다. 레이어
배포는 `-a/-b/-c` 글꼴 변형 id에만 허용되며, 결과 크기가 stock과 같은 v1 릴리스에만
씁니다(v2 성장 릴리스는 대상이 아닙니다).

## 경계

- 두 layer는 각각 [PATCH_FORMAT.md](PATCH_FORMAT.md)의 v1 정규형을 **자기 원본에
  대해** 지킵니다. base record의 모든 byte는 stock과 다르고, font record의 모든
  byte는 중간 이미지와 다릅니다.
- font record는 base record와 겹치거나 맞닿을 수 없습니다(한 byte 이상 떨어져야
  함). 따라서 두 layer의 합집합은 원래 승인된 단일 payload의 record 집합과 같습니다.
- 최종 결과 SHA-256은 해당 변형의 기존 `ACCEPTED` target SHA-256과 같아야 합니다.
  같지 않으면 레이어 배포가 아니라 새 릴리스이며, 별도의 전체 승인 절차가 필요합니다.
- 중간 이미지는 공개 결과물이 아닙니다. 브라우저도 생성기도 이를 파일로 쓰지 않고,
  SHA-256만 manifest·receipt·두 layer header에 고정합니다.

## release manifest

단일 payload 릴리스는 기존 `patch` 객체를 그대로 씁니다. 레이어 릴리스는 `patch`
대신 `patchLayers`와 `intermediate`를 가지며 두 형태를 섞을 수 없습니다.

```jsonc
{
  "schema": "srwf-kor.public-release.v1",
  "id": "srwf-f-YYYYMMDD-vX-Y-b",
  // state, version, title, publishedAt, source, target: 단일 payload 릴리스와 동일
  "patchLayers": [
    {
      "role": "base",
      "format": "srwf.sparse-byte-delta.v1",
      "url": "patches/srwf-f-YYYYMMDD-vX-Y.base.srwfp",
      "size": 0, "sha256": "<base SHA-256>", "recordCount": 0, "bodyUncompressedSize": 0
    },
    {
      "role": "font",
      "format": "srwf.sparse-byte-delta.v1",
      "url": "patches/srwf-f-YYYYMMDD-vX-Y-b.font.srwfp",
      "size": 0, "sha256": "<font SHA-256>", "recordCount": 0, "bodyUncompressedSize": 0
    }
  ],
  "intermediate": { "size": 578512032, "sha256": "<stock + base 결과 SHA-256>" },
  "provenance": { "v5Commit": "…", "buildReceiptSha256": "…", "acceptanceReceiptSha256": "…" }
}
```

- 순서는 항상 `[base, font]`이고 key 집합은 정확히 위와 같습니다.
- base header는 `source = stock`, `target = intermediate`, font header는
  `source = intermediate`, `target = 승인 결과`여야 합니다.
- 같은 그룹의 세 manifest는 같은 base 파일을 가리킵니다. payload마다 크기와
  SHA-256을 따로 고정하며, 공유 base도 다른 payload와 똑같이 검증합니다.

## acceptance receipt

레이어 릴리스의 영수증은 `patchSha256` 대신 다음 네 필드를 가집니다. 그 밖의 필드
(`acceptedAt`, `stockProfileId`, `sourceSha256`, `targetSha256`, `v5Commit`, `gates`)는
원래 승인 영수증 값을 그대로 유지합니다.

| field | 의미 |
|---|---|
| `intermediateSha256` | stock + base 결과 SHA-256 |
| `basePatchSha256` | base layer 파일 SHA-256 |
| `fontPatchSha256` | font layer 파일 SHA-256 |
| `supersedes` | `{receiptSha256, patchSha256, decisionAuthority}` — 대체된 단일 payload 영수증의 파일 SHA-256, 그 payload SHA-256, 원래 결정 근거 |

`decisionAuthority`는 재배포 결정을 기록합니다. 원래 승인 결정 근거는
`supersedes.decisionAuthority`에 그대로 남고, 원래 영수증과 payload는 Git 기록에
남아 `supersedes`의 SHA-256으로 추적됩니다. 레이어 영수증은 새 승인이 아니며 결과
SHA-256이 같다는 사실만 근거로 기존 승인을 옮겨 적습니다.

## 브라우저 적용 순서

1. manifest의 두 layer를 same-origin 상대 경로에서 각각 한 번씩 받아 크기와
   SHA-256을 확인하고 v1 parser로 해석합니다. 공유 base도 다른 payload와 똑같이
   크기·SHA-256·header를 검증합니다.
2. base target = font source = `intermediate.sha256`, 모든 layer 크기 = stock 크기,
   base source = stock, font target = 승인 결과인지 확인합니다(`LAYER_CHAIN_MISMATCH`).
3. font record가 base record와 겹치거나 맞닿으면 멈춥니다(`LAYER_RECORD_OVERLAP`).
4. 사용자의 stock을 **한 번만** 스트리밍합니다. 각 조각마다 base record의 preimage와
   비변경 byte 금지를 stock byte로 검사해 중간 조각을 계산하고, font record의
   preimage와 비변경 byte 금지를 그 **중간 조각**으로 검사해 결과 조각을 만듭니다.
5. 끝에서 stock SHA-256(`SOURCE_HASH_MISMATCH`), 중간 이미지 SHA-256
   (`INTERMEDIATE_HASH_MISMATCH`), 결과 크기와 SHA-256(`TARGET_HASH_MISMATCH`)을 모두
   확인한 뒤에만 저장을 확정하거나 다운로드 Blob을 돌려줍니다.

데스크톱 폴더 쓰기와 모바일 다운로드(Blob 캡처) 경로 모두 같은 단일 스트리밍 엔진을
쓰며, 다운로드 캡처 창은 두 layer record의 합집합으로 계산합니다.

## 생성기 (소유자 로컬 실행)

v1 header에는 전체 이미지 SHA-256이 들어가므로 중간 이미지 SHA-256은 stock 없이는
계산할 수 없습니다. 저장소는 stock을 갖지 않으므로 소유자가 자신의 stock으로
실행합니다. 스크립트는 Python 표준 라이브러리만 쓰고 네트워크를 쓰지 않습니다.

```bash
# stock 없이: 분할 가능성·겹침·예상 크기만 보고, 아무것도 쓰지 않음
python3 scripts/split_font_variants.py --dry-run

# 실제 재배포 (F v0.5, v0.4 두 그룹)
python3 scripts/split_font_variants.py --stock /path/to/your/stock.img
python3 scripts/verify_repo.py && npm test
```

`scripts/split_font_variants.py`는 다음을 모두 통과해야만 저장소를 바꿉니다.

1. index row → manifest → receipt → payload SHA-256 사슬과 v1 구조를 검증합니다.
2. record를 `(offset, length, preimage, targetBytes)` 전체가 같은지로 공통/고유로
   나누고, 각 layer의 정규형과 layer 사이 겹침·맞닿음, 합집합 다운로드 캡처 예산을
   검사합니다.
3. stock을 한 번 스트리밍하며 stock SHA-256, base·font preimage와 비변경 byte,
   중간 SHA-256, 각 변형의 결과 SHA-256 = 승인 target을 확인합니다.
4. zlib level 9로 결정적으로 인코딩한 파일을 저장소 밖 임시 폴더에 쓰고, **다시
   읽어** 구조를 재검증하고 stock에 base→font를 다시 스트리밍 적용해 결과 SHA-256을
   확인합니다. Node가 있으면 브라우저 엔진(`tests/helpers/verify-layered-patch.mjs`)으로
   데스크톱·다운로드 두 경로를 한 번 더 재적용합니다.
5. 그 뒤에만 layer 파일, 레이어 manifest·receipt, index의 `manifestSha256`을 쓰고
   대체된 단일 payload 세 개를 지운 다음 `verify_repo`의 index 검증을 실행합니다.
   실패하면 설치 전 상태로 되돌립니다.

이미 레이어 형태인 그룹은 건드리지 않고(`already layered`), 레이어 파일만 남은 부분
상태는 거부합니다.
