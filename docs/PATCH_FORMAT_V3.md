# `.srwfp` 공용 다중 변형 패치 형식 v3

`srwf.sparse-byte-delta.v3`는 **같은 버전의 글꼴 변형 a/b/c가 공유하는 하나의 파일**에
변형 공통 변경 구간을 한 번만 싣고, 변형마다 다른 구간만 따로 싣는 공개 패치
형식입니다. 원본과 결과의 크기가 같은 경우에만 쓰며 파일 확장자는 v1·v2와 같은
`.srwfp`이고 magic으로 구분합니다.

v1·v2의 파서, 적용기, 정규형, 오류 코드와 이미 공개된 v1·v2 `.srwfp`는 v3 추가로
바뀌지 않습니다. v3는 별도 모듈(`assets/patch-core-v3.mjs`)과 형식 분기로만
동작합니다.

이 형식 자체는 릴리스 승인 증거가 아닙니다. 공개 파일은 별도의 `ACCEPTED`
영수증, 릴리스 명세, 공개 인덱스가 모두 같은 해시를 가리킬 때만 유효하며, v3 payload는
그 payload가 담는 **모든 변형**의 영수증이 그 해시를 가리킬 때만 유효합니다.

> 문서 상태: **설계 확정안, 구현·공개 전.** 소유자의 2026-09-29 지시("기능·정확도는
> 유지하고 낭비되는 용량을 모두 없앤다")에 따라 설계했습니다. 형식 채택, AGENTS.md
> 개정, 재발급 영수증 문구, 공개 범위는 [20절](#20-소유자-결정과-잔여-위험)에서 소유자가
> 확인하기 전까지 확정이 아닙니다. 측정 근거는
> [`PATCH_V3_MEASUREMENTS.md`](PATCH_V3_MEASUREMENTS.md)에 있습니다.

## 1. 무엇이 바뀌고 무엇이 그대로인가

v1 패치 3개(변형 a/b/c)는 실제로는 **99.95%가 같은 record**입니다. F v0.5에서
a/b/c는 1,330,116개 record를 공유하고 변형마다 다른 record는 657~726개(약 62 KB)뿐인데,
v1은 이를 세 번 싣고 record마다 32-byte preimage 해시까지 붙여 파일 하나가 69.6 MB입니다.
v3는 낭비의 세 원인만 제거합니다.

| 낭비 | v1 | v3 |
|---|---|---|
| 변형 공통 record를 파일마다 반복 | 변형당 파일 1개, 공통 record 3회 | 그룹당 파일 1개, 공통 record 1회 + 변형별 고유 record |
| record마다 32-byte preimage 해시 (압축 후에도 파일의 약 50%) | record 1,330,782개 × 32 B | 없음. 고정 개수(최대 8개)의 canary 해시만 남김 |
| 고정 12-byte `offset`·`length` | `u64`+`u32` | 이전 record 끝에서 이어지는 간격과 길이의 LEB128 column |

바뀌지 않는 것(기능·정확도):

- 결과 크기 = 원본 크기(같은 크기 전용). 모든 record byte는 원본 byte와 달라야 하며
  (`NON_DIFFERING_BYTE`), 원본 전체를 record에 숨길 수 없습니다.
- record는 offset 오름차순이고 서로 겹치지 않으며 **바로 이어지지도 않습니다**(간격 ≥ 1).
  병합한 record 집합에서도 같습니다.
- 원본 전체 SHA-256과 **변형별** 결과 전체 SHA-256이 그대로 최종 관문입니다.
  둘이 모두 맞기 전에는 저장을 확정하지 않고 다운로드 Blob도 돌려주지 않습니다.
- 압축은 zlib(RFC 1950) stream 하나이며 브라우저 `DecompressionStream('deflate')`로 풉니다.
  새 압축기, brotli, zstd, 제3자 코드는 없습니다.
- 변형을 바꿔도 같은 payload를 다시 받지 않습니다(17절).

### 1.1 preimage 해시를 뺀 근거

결과 이미지는 `(원본, record 집합)`의 함수입니다. 원본 전체 SHA-256이 원본을, 변형별 결과 SHA-256이
결과를 고정하므로 record별 preimage는 더 일찍 실패시킬 수 있을 뿐 새로운 보증을 더하지
않습니다. record가 실제로 원본과 달라야 한다는 정규형 검사(`NON_DIFFERING_BYTE`)는 원본
byte를 직접 비교하므로 그대로 남습니다. 잃는 것은 잘못된 원본을 **일찍** 알아채는 능력뿐이며,
canary(8절)가 이를 고정 크기 메타데이터로 되살립니다.

### 1.2 범위

- 대상: 같은 버전의 `-a/-b/-c` 글꼴 변형이 서로 같은 원본·같은 크기를 쓰는 그룹.
  현재 F v0.4(`srwf-f-20260915-v0-4-a/b/c`)와 F v0.5(`srwf-f-20260928-v0-5-a/b/c`).
- 대상이 아닌 것: 비-글꼴 릴리스(v1 유지), F 완결편 v0.1·v0.2(크기가 커지는 v2 유지),
  철회·역사 자료. 새 v3 그룹은 새 승인 없이 만들지 않습니다.

## 2. 상한과 바이트 순서

| 항목 | 값 |
|---|---|
| 패치 파일 전체 | 최대 `50,331,648` bytes (48 MiB), 최소 `헤더 + 8` (`≥ 202`) |
| 압축 해제한 body | 최대 `100,663,296` bytes (96 MiB) |
| `imageSize` | `1` ~ `783,216,000` bytes (333,000 섹터, 모든 offset·길이 `< 2^30`) |
| 변형 수 `variantCount` | `2` 또는 `3`. `variantId`는 ASCII `a`~`c`, 헤더에서 엄격한 오름차순 |
| 공통 record 수 | `1` ~ `2,000,000` |
| 변형 고유 record 수 | `0` ~ `65,536` |
| 병합 record 수 (공통 + 변형 하나) | 최대 `2,000,000` |
| 변경 바이트 (공통 + 변형 하나의 `dataBytes`) | 최대 `67,108,864` (64 MiB) |
| canary | `1` ~ `8`개, 각 길이 `16` ~ `4096` bytes |
| 간격(gap) varint | 최대 5 bytes, 값 `≤ imageSize - 1` |
| 길이(len) varint | 최대 4 bytes, 값(`length - 1`) `≤ min(imageSize - 1, 67,108,863)` |
| 모바일 다운로드 캡처 | 최대 `67,108,864` (64 MiB), v1과 같음 |
| 정수 | 모두 unsigned. header 고정폭 정수는 big-endian, body는 LEB128 |
| SHA-256 필드 | 32-byte raw digest |

크기 상한은 압축을 풀기 전에 검사하며, 헤더 산술(합계)도 상한과 비교한 뒤에만 메모리를
할당합니다. 상한은 실제 F v0.5/v0.4 그룹(파일 약 22.2 MB, body 약 39.4 MB, 병합 record
약 133만 개)의 각각 약 2.3배, 2.4배, 1.5배입니다.

## 3. 파일 구조

```
HEADER (72 + 40·C + 41·V bytes) │ zlib stream (byte headerSize 부터 파일 끝까지 정확히 하나)
```

`C`는 `canaryCount`(1~8), `V`는 `variantCount`(2~3)입니다. F v0.5/v0.4 그룹은
`C = 8`, `V = 3`이므로 헤더는 515 bytes입니다.

## 4. Header

### 4.1 고정 부분 (72 bytes)

| offset | size | field | meaning |
|---:|---:|---|---|
| `0` | 8 | `magic` | ASCII `SRWFKP3` 뒤 NUL 1 byte (`53 52 57 46 4b 50 33 00`) |
| `8` | 8 | `imageSize` | 원본 크기 = 결과 크기 (`u64`, 1 ~ 783,216,000) |
| `16` | 8 | `bodyUncompressedSize` | 압축 해제한 body의 정확한 크기 (`u64`, ≤ 100,663,296) |
| `24` | 32 | `sourceSha256` | 원본 전체 SHA-256 |
| `56` | 4 | `variantCount` | `V` (`u32`, 2 또는 3) |
| `60` | 4 | `commonRecordCount` | 모든 변형이 공유하는 record 수 `Nc` (`u32`, 1 ~ 2,000,000) |
| `64` | 4 | `commonDataBytes` | 공통 record 길이의 합 (`u32`) |
| `68` | 4 | `canaryCount` | `C` (`u32`, 1 ~ 8, `≤ Nc`) |

### 4.2 canary 표 (`40·C` bytes, offset `72`부터)

| relative | size | field | meaning |
|---:|---:|---|---|
| `0` | 4 | `offset` | 원본에서 이 canary가 가리키는 span의 시작 (`u32`) |
| `4` | 4 | `length` | span 길이 (`u32`, 16 ~ 4096) |
| `8` | 32 | `sha256` | `source[offset:offset+length]`의 SHA-256 |

### 4.3 변형 표 (`41·V` bytes, offset `72 + 40·C`부터)

| relative | size | field | meaning |
|---:|---:|---|---|
| `0` | 1 | `variantId` | ASCII `a`~`c`. 표 안에서 엄격한 오름차순 |
| `1` | 32 | `targetSha256` | 이 변형의 결과 전체 SHA-256 |
| `33` | 4 | `recordCount` | 이 변형만의 고유 record 수 `Nv` (`u32`, 0 ~ 65,536) |
| `37` | 4 | `dataBytes` | 고유 record 길이의 합 (`u32`) |

`headerSize = 72 + 40·C + 41·V`. byte `headerSize`부터 파일 끝까지 정확히 하나의 zlib
stream이 옵니다. 예약·패딩 byte는 없고 모든 필드를 정확히 비교합니다.
`targetSha256` 값들은 서로 달라야 하고 `sourceSha256`과도 달라야 합니다.
**중간 이미지도 중간 해시도 없습니다.** 원본 해시와 변형별 결과 해시는 이미 승인된
v1 헤더·영수증에 있는 값이므로 파일은 원본 이미지 없이 만들 수 있습니다.

## 5. zlib stream 규칙

- 첫 byte(`CMF`)는 정확히 `0x78`(CM 8, CINFO 7 = 32 KiB window)입니다.
  `CMF·256 + FLG`는 31의 배수이고 `FLG` 비트 5(`FDICT`)는 0입니다. `FLEVEL`은 정보일 뿐
  검사하지 않습니다.
- CINFO를 7로 고정하므로 "선언한 window보다 먼 back-reference 금지"(v1 규칙)는
  DEFLATE 형식 자체가 보장합니다. 출력보다 먼 back-reference는 inflate가 거부합니다.
- stream은 파일 끝에서 끝납니다. **파일의 마지막 4 bytes는 압축 해제한 body의 Adler-32
  (big-endian)와 같아야** 합니다. 이 위치 검사는 `DecompressionStream`이 뒤에 붙은
  데이터를 허용하는 엔진에서도 뒤 데이터를 잡아 냅니다.
- 압축 해제 출력은 `bodyUncompressedSize`를 넘을 수 없고(넘으면 즉시 중단),
  끝났을 때 정확히 같아야 합니다. 미완료 stream, 뒤에 붙은 데이터, preset dictionary는 거부합니다.
- v3 경로는 v1의 JS DEFLATE 구조 스캐너를 다시 돌리지 않습니다(측정: v3 body에서 3.7 s).
  위 규칙이 같은 성질(단일 stream, window, 뒤 데이터, 크기)을 보장합니다. 저장소 검증기
  (Python)는 커밋된 파일에 대해 `zlib.decompressobj`로 `eof`, `unused_data == b""`,
  정확한 크기, Adler-32 위치를 확인합니다.
- 생성기는 zlib level 9, `memLevel` 9, `wbits` 15, 기본 strategy, 타임스탬프 없이 압축해 같은
  입력에서 같은 bytes를 냅니다. **압축기는 형식의 일부가 아닙니다.** 다른 zlib 빌드로
  다시 압축해도 유효하지만 payload 해시는 달라집니다(측정: Node의 zlib은 같은 body를 0.24%
  작게 냅니다).

## 6. body

body는 다음 구간을 이 순서로 이어 붙인 것입니다. 집합 순서는 `common`, 그다음 헤더
변형 표의 순서(`a`, `b`, `c`)입니다.

| 순서 | 구간 | 내용 | 크기 |
|---:|---|---|---|
| 1 | `GAP(common)` | `Nc`개의 LEB128 간격 | 가변 |
| 2 | `LEN(common)` | `Nc`개의 LEB128 길이 코드 | 가변 |
| 3 | `GAP(v₁)` | 변형 1의 `Nv`개 LEB128 간격 | 가변 |
| 4 | `LEN(v₁)` | 변형 1의 `Nv`개 LEB128 길이 코드 | 가변 |
| … | … | 나머지 변형도 `GAP`, `LEN` 쌍 | |
| 3+2V | `DATA(common)` | 공통 record의 targetBytes를 record 순서로 이은 것 | `commonDataBytes` |
| 4+2V | `DATA(v₁)` | 변형 1 고유 record의 targetBytes | `dataBytes₁` |
| … | `DATA(v_k)` | 나머지 변형 | `dataBytesₖ` |

앞쪽의 `GAP`/`LEN` 구간 전체를 **index 영역**, 뒤쪽의 `DATA` 구간 전체를 **data 영역**이라
부릅니다. index 영역의 크기는 헤더에서 유도합니다.

```
indexBytes = bodyUncompressedSize − commonDataBytes − Σ dataBytes(변형)
2·N ≤ indexBytes ≤ 9·N        (N = Nc + Σ Nv)
```

이 산술은 압축을 풀기 전에 검사합니다(`INDEX_SIZE_INVALID`).

### 6.1 record 복원

집합 하나(record `n`개)에서 `i = 0 … n−1`:

```
gap_i     = GAP 구간의 i번째 varint
lenCode_i = LEN 구간의 i번째 varint
length_i  = lenCode_i + 1                          (≥ 1, 0 길이 record는 표현할 수 없음)
offset_0  = gap_0
offset_i  = end_{i-1} + 1 + gap_i                  (i ≥ 1)
end_i     = offset_i + length_i                    (배타적 끝)
```

`gap`을 "이전 record 끝 + 1"에서 잰 값으로 저장하므로 **한 집합 안에서는 겹침·역순·맞닿음을
표현할 수 없습니다.** `end_i ≤ imageSize`, `Σ length_i = dataBytes`이고, `DATA` 구간의 i번째
record는 앞 record들의 길이 합 위치에서 `length_i` bytes입니다.

### 6.2 varint (LEB128)

- 하위 7비트 group부터, 최상위 비트 1은 "다음 byte 있음"입니다.
- **정규형만 허용합니다.** 두 byte 이상인 varint의 마지막 byte는 `0x00`일 수 없습니다.
- gap은 최대 5 bytes·값 `≤ imageSize − 1`, lenCode는 최대 4 bytes·값 `≤ min(imageSize − 1, 67,108,863)`.
- JavaScript는 `value += (b & 0x7f) * 2 ** shift`처럼 곱셈으로 누적합니다. `<<`는 int32이므로 쓰지 않습니다.
  `imageSize < 2^30`이므로 모든 offset·끝·간격·길이와 그 합은 `2^31`보다 작아 핫패스에서 int32
  산술을 써도 됩니다.
- index 영역을 정확히 소비해야 합니다. 남으면 `TRAILING_INDEX_DATA`, 모자라면 `TRUNCATED_VARINT`입니다.

## 7. 변형별 record 집합과 병합

변형 `v`가 적용하는 record 집합은 `R_v = common ∪ section_v`이며 offset 순서로 병합합니다
(두 커서를 offset이 작은 쪽부터 진행).

병합한 순서에서 다음이 모두 참이어야 합니다. 어느 하나라도 아니면 그 payload는 **통째로**
거부합니다(브라우저는 선택하지 않은 변형까지 파싱 시점에 전부 검사합니다).

- `next.offset > prev.end`(겹치면 `OVERLAPPING_RECORD`, 맞닿으면 `NON_MAXIMAL_RECORDS`)
- 모든 record가 `imageSize` 안
- 병합 record 수 ≤ 2,000,000, 변경 바이트 `commonDataBytes + dataBytes(v)` ≤ 64 MiB

공통 record와 같은 위치의 변형 record는 겹침이므로 거부됩니다.

### 7.1 정규 분할

- `common`은 **모든 변형의 병합 집합에 들어 있는 `(offset, length, targetBytes)`** 3-tuple 전체입니다.
- 각 변형 구간은 나머지입니다. 따라서 모든 변형 구간에 동시에 들어 있는 tuple은 없어야 합니다.
- 생성기와 저장소 검증기가 위 정규 분할을 강제합니다(브라우저는 강제하지 않음). 정규 분할이면
  같은 결과에 대한 표현이 하나뿐입니다. 검증기는 디코드한 body를 다시 정규 인코딩해 압축 해제한
  body와 byte 단위로 같은지 확인합니다(압축기와 무관).

## 8. canary

v1은 record마다 원본 span의 SHA-256을 실어 잘못된 원본을 첫 record(offset 47,306, 첫 1 MiB 안)에서 거부했습니다.
v3는 이 성질 일부를 헤더에 든 **고정 개수의 span 해시**로 되살립니다. canary는 진단용 조기 실패
장치이며 보안 관문이 아닙니다. 관문은 원본 전체 SHA-256과 결과 전체 SHA-256입니다.

브라우저 규칙:

- canary는 offset 오름차순이고 서로 겹치지 않으며 `offset + length ≤ imageSize`, `16 ≤ length ≤ 4096`,
  `C ≤ Nc`(`BAD_CANARY_TABLE`).
- 각 canary는 **공통 record 하나와 정확히 같은 `(offset, length)`**여야 합니다(`CANARY_NOT_COMMON_RECORD`).
  공통 record이므로 어느 변형을 고르든 적용되는 span입니다.
- 원본이 스트리밍되어 span이 끝나는 window에서 SHA-256을 비교하고, 다르면 원본 전체를 기다리지 않고
  즉시 `SOURCE_CANARY_MISMATCH`로 중단합니다.

생성기 규칙(브라우저는 몰라도 됨, 저장소 검증기가 강제): 후보 `E`는 길이가 16~4096 bytes인 공통 record를 offset 순서로 나열한
것입니다(길이 1 byte 같은 짧은 span은 해시가 식별력이 없어 제외). `C = min(8, |E|)`이고 i번째 canary(`i = 0 … C−1`)는
`E[⌊i·|E| / C⌋]`입니다. 해시는 그 record의 v1 preimage SHA-256이며 모든 변형에서 같아야 합니다. 원본 이미지가 필요 없습니다.

F v0.5/v0.4에서 `|E|`는 각각 464,887 / 431,560개이고 첫 canary는 원본 offset 49,288의 104-byte record이므로 잘못된 원본은 첫
1 MiB window에서 거부됩니다(합성 578 MB 실험: 1 MiB를 읽고 0.0 s). 나머지 7개는 변경이 몰린 188~215 MB 구간에 고르게 놓입니다.
canary가 없는 곳만 다른 원본은 전체 pass(약 6~13 s) 뒤 `SOURCE_HASH_MISMATCH`로 거부됩니다.

## 9. 정규형 규칙 요약

| 규칙 | 브라우저 | 저장소 검증기·생성기 |
|---|:---:|:---:|
| record 길이 ≥ 1, 집합 안 정렬·비중첩·비맞닿음(표현 자체로 보장) | ✓ | ✓ |
| 병합 집합의 정렬·비중첩·비맞닿음(모든 변형) | ✓ | ✓ |
| `end ≤ imageSize`, 헤더 개수·바이트 합·index 영역이 실제와 일치 | ✓ | ✓ |
| varint 정규형, 상한, index·body 정확 소비 | ✓ | ✓ |
| canary가 공통 record와 일치, 형식 | ✓ | ✓ |
| 모든 record byte ≠ 원본 byte (선택한 변형의 병합 집합) | ✓ | (원본이 있을 때 모든 변형) |
| 원본 전체 SHA-256, 변형 결과 전체 SHA-256 | ✓ | (원본이 있을 때) |
| 정규 분할(common = 모든 변형의 교집합) | – | ✓ |
| 정규 재인코딩 = 압축 해제한 body | – | ✓ |
| canary 선택 규칙(offset·length) | – | ✓ |
| canary 해시 = v1 preimage | – | 생성기(v1 원본이 있을 때: `install`, `verify --v1-git-rev`) |
| 헤더 변형 집합 = 그 URL을 가리키는 ACCEPTED 행 집합 | – | ✓ |
| 변형 tuple 집합의 `recordSetSha256` = 승인된 v1 값 | – | ✓ |

브라우저는 선택하지 않은 변형의 record byte가 원본과 다른지는 확인할 수 없습니다(원본 byte가
없는 것이 아니라 그 변형은 적용하지 않기 때문). 이는 `recordSetSha256`(15.2절)이 승인된 v1의
원본 검증 통과 record 집합과 byte 단위로 같음을 CI에서 증명하는 것으로 대신합니다.

## 10. 검증 순서

오류 코드가 한 가지로 정해지도록 순서를 고정합니다. 이 순서는 브라우저 엔진과 저장소 검증기가 같습니다.

0. **워커 입력**(v1·v2와 같음): 응답 크기 = 명세 `patch.size`(`PATCH_SIZE_MISMATCH`), 전체 SHA-256 = 명세
   `patch.sha256`(`PATCH_HASH_MISMATCH`), magic이 descriptor의 `format`과 일치(`PATCH_FORMAT_MISMATCH`).
   파싱은 payload 해시 확인 뒤에만 시작합니다.
1. **파일 크기**: `> 50,331,648` → `PATCH_TOO_LARGE`.
2. **헤더**(압축 해제 전, 할당 없음): 72 bytes 미만 `TRUNCATED_HEADER` → `BAD_MAGIC` → `imageSize` 범위 `BAD_SIZE` →
   `bodyUncompressedSize` 상한 `BODY_TOO_LARGE` → `BAD_VARIANT_COUNT` → `canaryCount` 범위 `BAD_CANARY_TABLE` →
   전체 헤더 + 8 bytes 미만 `TRUNCATED_HEADER` → `commonRecordCount` 0 `BAD_RECORD_COUNT`·상한 초과
   `TOO_MANY_RECORDS` → `canaryCount > Nc`·canary 표 검사 `BAD_CANARY_TABLE` → 변형 표
   `BAD_VARIANT_ID` → 결과 해시 중복·원본과 동일 `VARIANT_TARGET_NOT_DISTINCT` → 집합별 개수·바이트
   (`TOO_MANY_RECORDS`, `RECORD_BYTES_MISMATCH`: record 수 > dataBytes) → 변형별 병합 상한(`TOO_MANY_RECORDS`,
   `CHANGED_BYTES_TOO_LARGE`) → body 산술(`BODY_SIZE_MISMATCH`: body < 바이트 합, `INDEX_SIZE_INVALID`).
3. **payload descriptor**(변형과 무관한 항목): `patchSize`, `patchSha256`, `sourceSize`, `sourceSha256`,
   `targetSize`(= `imageSize`), `bodyUncompressedSize`, `commonRecordCount`가 헤더·payload와 정확히 같아야
   합니다(`DESCRIPTOR_MISMATCH`).
4. **압축 해제**: zlib 헤더(`BAD_ZLIB_BODY`) → 출력이 선언 크기를 넘으면 즉시 `BODY_SIZE_MISMATCH` → 완결된 단일
   stream이 아니면 `BAD_ZLIB_BODY` → 선언보다 짧으면 `BODY_SIZE_MISMATCH` → 마지막 4 bytes가 Adler-32가 아니면
   `BAD_ZLIB_BODY`.
5. **index 영역**(모든 집합): varint(`TRUNCATED_VARINT`, `VARINT_TOO_LONG`, `NON_CANONICAL_VARINT`,
   `VARINT_OUT_OF_RANGE`) → 범위 `RECORD_OUT_OF_RANGE` → 집합별 길이 합 `RECORD_BYTES_MISMATCH` → 끝까지
   소비 `TRAILING_INDEX_DATA`.
6. **canary 대응**: `CANARY_NOT_COMMON_RECORD`.
7. **병합 검사**(모든 변형): `OVERLAPPING_RECORD`, `NON_MAXIMAL_RECORDS`.
8. **변형 선택**(파싱이 끝난 payload에서, 적용할 때마다 반복): `VARIANT_REQUIRED`(기본 변형 없음) →
   `VARIANT_NOT_IN_PAYLOAD` → 헤더의 그 변형 `targetSha256` = descriptor의 `targetSha256`
   (`VARIANT_TARGET_MISMATCH`) → `descriptor.recordCount = Nc + Nv`(`DESCRIPTOR_MISMATCH`).
9. **적용**: 원본 Blob 크기(`SOURCE_SIZE_MISMATCH`) → 스트리밍 중 canary(`SOURCE_CANARY_MISMATCH`)와 record byte
   (`NON_DIFFERING_BYTE`) → 끝에서 원본 길이 → 원본 전체 SHA-256(`SOURCE_HASH_MISMATCH`) → 모든 record 적용
   (`INTERNAL_RECORD_STATE`) → 출력 길이(`OUTPUT_SIZE_MISMATCH`) → 결과 SHA-256을 **descriptor가 고정한**
   변형 값과 비교(`TARGET_HASH_MISMATCH`) → 그다음에만 `close()`.

원본 해시 오류가 결과 해시 오류보다 먼저 보고되므로 잘못된 원본은 "지원하는 원본이 아닙니다"로,
깨진 패치는 "패치 데이터 검증 실패"로 나옵니다.

## 11. 적용 알고리즘

### 11.1 디렉터리 출력 (스트리밍)

원본 Blob은 메모리에 통째로 올리지 않고 앞에서부터 한 번만 읽습니다.

1. 원본 Blob 크기 = `imageSize`(`SOURCE_SIZE_MISMATCH`). 선택한 변형의 두 커서(공통, 변형)를 시작 위치에
   놓습니다. 작업 window는 **절대 offset에 정렬된 1 MiB**(마지막 window만 짧음)이며 v1의 쓰기 크기와 같아
   578,512,032 bytes에 정확히 552번 씁니다.
2. 원본 chunk(크기 무관, 실제 64 KiB~2 MiB)를 window 버퍼에 채웁니다. window가 차면(또는 스트림이 끝나면):
   1. 아직 패치하지 않은 window를 원본 전체 SHA-256에 넣습니다.
   2. window와 겹치는 canary span을 해당 canary의 SHA-256에 넣습니다. span이 끝나면 비교해 다르면
      `SOURCE_CANARY_MISMATCH`로 중단합니다.
   3. window와 겹치는 record를 병합 순서로 처리합니다. record가 window 경계에 걸리면 경계에서 자르고 커서는
      record가 window 안에서 끝날 때만 전진합니다. **아직 패치하지 않은 원본 byte와 record byte를 모든 위치에서
      비교**해 같으면 `NON_DIFFERING_BYTE`, 다르면 같은 버퍼에 제자리로 씁니다. 이 검사는 chunk·window
      경계와 무관해야 하며(1-byte chunk에서도 같은 결과), 속성 테스트로 확인합니다.
   4. 패치한 window를 결과 SHA-256에 넣고 `writer.write(window)`를 부릅니다. write는 버퍼를 detach할 수
      있으므로 새 버퍼를 할당합니다.
3. 스트림이 끝나면 원본 길이 = `imageSize`, 원본 전체 SHA-256 = `sourceSha256`, 모든 record 적용, 출력
   길이 = `imageSize`, 결과 SHA-256 = descriptor의 변형 `targetSha256`을 순서대로 확인하고 모두 맞을 때만
   `close()`합니다. 어느 단계든 실패하면 `abort()`만 부르고 부분 결과를 남기지 않습니다.

레코드마다 객체·해시기를 만들지 않으므로 v1이 record마다 하던 preimage 해시(약 13초) 작업이 사라지고,
record 처리 자체는 578 MB·133만 record에서 약 0.7초입니다.

### 11.2 모바일 다운로드 Blob

v1과 같은 희소 캡처 writer를 씁니다. 캡처 창은 선택한 변형의 병합 record가 걸리는 1 MiB 정렬 창의 합집합
(합계 64 MiB 이하)이며, F v0.4/v0.5의 여섯 릴리스 모두 v1과 같은 4개 창·44 MiB
(0~6, 14~15, 176~210, 547~550 MiB)입니다. 적용기를 이 writer에 연결해 실행하고, 원본 SHA-256과 결과
SHA-256이 모두 맞아야만 `close()`되며 그 전에는 Blob이 존재하지 않습니다
(`DOWNLOAD_CAPTURE_NOT_COMMITTED`). 조립은 창 안은 캡처한 byte, 창 밖은 `blob.slice`입니다.
신뢰 모델은 v1과 같습니다(다운로드 시 원본 slice를 다시 읽음).

### 11.3 메모리

파싱 후 상주: payload(약 22 MB) 해제 후 버림, body 39.4 MB, 공통 집합 `Uint32Array` 쌍(starts, lens) 10.7 MB.
다운로드 경로만 병합 계획 16 MB와 캡처 44 MiB가 추가됩니다. 최대는 약 110 MB(payload + body + 배열),
파싱 후 상주 약 66 MB로 v1의 약 240 MB보다 작습니다. record 객체는 만들지 않으며 JS heap은 8 MiB
미만입니다. body를 통째로 푸는 이유는 구조 오류를 578 MB를 흘려 보내기 전에 잡기 위함입니다.

## 12. 오류 코드

v1·v2와 같은 이름은 같은 뜻입니다. 새 코드에는 한국어 문구(사용자 화면용 제목과 본문)를 함께 정합니다.
표시 문구가 없는 구조 오류는 `app.mjs`의 `malformedPatchCodes`에 넣어 "패치 데이터 형식이 올바르지 않습니다"로
표시하며, 어떤 코드도 일반 문구로 떨어지면 안 됩니다.

| 분류 | 코드 |
|---|---|
| v1·v2와 공통 | `BAD_MAGIC`, `TRUNCATED_HEADER`, `BAD_SIZE`, `PATCH_TOO_LARGE`, `PATCH_SIZE_MISMATCH`, `PATCH_HASH_MISMATCH`, `PATCH_FORMAT_MISMATCH`, `BODY_TOO_LARGE`, `BODY_SIZE_MISMATCH`, `BAD_ZLIB_BODY`, `TOO_MANY_RECORDS`, `RECORD_BYTES_MISMATCH`, `RECORD_OUT_OF_RANGE`, `OVERLAPPING_RECORD`, `NON_MAXIMAL_RECORDS`, `DESCRIPTOR_MISMATCH`, `SOURCE_SIZE_MISMATCH`, `SOURCE_HASH_MISMATCH`, `NON_DIFFERING_BYTE`, `OUTPUT_SIZE_MISMATCH`, `TARGET_HASH_MISMATCH`, `INTERNAL_RECORD_STATE`, `UNSUPPORTED_BROWSER`, `DOWNLOAD_BLOB_SIZE_MISMATCH`, `DOWNLOAD_CAPTURE_TOO_LARGE`, `DOWNLOAD_CAPTURE_NOT_COMMITTED` |
| v3 구조 | `BAD_VARIANT_COUNT`, `BAD_VARIANT_ID`, `VARIANT_TARGET_NOT_DISTINCT`, `BAD_RECORD_COUNT`, `CHANGED_BYTES_TOO_LARGE`, `INDEX_SIZE_INVALID`, `TRUNCATED_VARINT`, `VARINT_TOO_LONG`, `NON_CANONICAL_VARINT`, `VARINT_OUT_OF_RANGE`, `TRAILING_INDEX_DATA`, `BAD_CANARY_TABLE`, `CANARY_NOT_COMMON_RECORD` |
| v3 변형 선택 | `VARIANT_REQUIRED`, `VARIANT_NOT_IN_PAYLOAD`, `VARIANT_TARGET_MISMATCH` |
| v3 원본 불일치 | `SOURCE_CANARY_MISMATCH` |

`PREIMAGE_MISMATCH`, `COPY_SOURCE_MISMATCH`, `TRAILING_BODY_DATA`는 v3에서 발생하지 않습니다
(index 영역이 헤더에서 유도되어 body 끝은 항상 정확합니다).

새 구조 오류의 뜻(로그·테스트용 이름):

| 코드 | 뜻 |
|---|---|
| `BAD_VARIANT_COUNT` | 변형 수가 2~3이 아님 |
| `BAD_VARIANT_ID` | 변형 id가 `a`~`c`가 아니거나 오름차순이 아님 |
| `VARIANT_TARGET_NOT_DISTINCT` | 변형 결과 해시가 서로 같거나 원본 해시와 같음 |
| `BAD_RECORD_COUNT` | 공통 record가 0개 |
| `CHANGED_BYTES_TOO_LARGE` | 변형 하나의 변경 바이트가 64 MiB 초과 |
| `INDEX_SIZE_INVALID` | 유도한 index 영역 크기가 `2·N`~`9·N` 밖 |
| `TRUNCATED_VARINT` / `VARINT_TOO_LONG` / `NON_CANONICAL_VARINT` / `VARINT_OUT_OF_RANGE` | varint가 잘림 / 길이 초과 / 비정규형 / 값 범위 초과 |
| `TRAILING_INDEX_DATA` | index 영역이 다 소비되지 않음 |
| `BAD_CANARY_TABLE` | canary 개수·길이·순서·범위 오류 |
| `CANARY_NOT_COMMON_RECORD` | canary가 공통 record와 일치하지 않음 |
| `VARIANT_REQUIRED` | 적용에 변형이 지정되지 않음(기본 변형 없음) |
| `VARIANT_NOT_IN_PAYLOAD` | 요청한 변형이 payload에 없음 |
| `VARIANT_TARGET_MISMATCH` | 요청한 변형의 결과 해시가 헤더와 명세에서 다름 |
| `SOURCE_CANARY_MISMATCH` | 원본이 canary span 해시와 다름 |

### 12.1 화면 문구 (복사해서 쓸 수 있는 형태)

| 코드 | 제목 | 본문 |
|---|---|---|
| `SOURCE_CANARY_MISMATCH` | 지원하는 원본이 아닙니다 | 원본의 일부 구간이 공개 명세와 달라 전체 검사를 기다리지 않고 작업을 중단했습니다. 수정하지 않은 정품 이미지인지 확인해 주세요. |
| `VARIANT_REQUIRED` | 글꼴 변형이 선택되지 않았습니다 | 공유 패치 데이터를 어느 글꼴 변형(a/b/c)에 적용할지 정해지지 않아 작업을 차단했습니다. |
| `VARIANT_NOT_IN_PAYLOAD` | 선택한 글꼴 변형이 패치에 없습니다 | 공유 패치 데이터에 선택한 글꼴 변형이 들어 있지 않아 작업을 차단했습니다. |
| `VARIANT_TARGET_MISMATCH` | 패치 명세와 데이터가 다릅니다 | 선택한 글꼴 변형의 결과 SHA-256이 공개 릴리스 명세와 패치 본문에서 서로 달라 작업을 차단했습니다. |
| 구조 오류 전부 | 패치 데이터 형식이 올바르지 않습니다 | 공개 패치의 구조를 안전하게 확인하지 못해 작업을 차단했습니다. |

`SOURCE_SIZE_MISMATCH`, `SOURCE_HASH_MISMATCH`, `NON_DIFFERING_BYTE`, `SOURCE_CANARY_MISMATCH`가
나면 워커는 준비한 원본 상태를 폐기하고 사용자는 원본 폴더를 다시 선택해야 합니다(`PREIMAGE_MISMATCH`,
`COPY_SOURCE_MISMATCH`는 v1·v2 전용으로 그대로 둡니다).

## 13. JavaScript descriptor 계약

v3 descriptor는 v1의 여덟 키에 `format`, `variant`, `commonRecordCount`를 더한 **열한 키**이며 모두
exact 비교합니다.

```json
{
  "patchSize": 0,
  "patchSha256": "64 lowercase hex characters",
  "sourceSize": 0,
  "sourceSha256": "64 lowercase hex characters",
  "targetSize": 0,
  "targetSha256": "64 lowercase hex characters",
  "recordCount": 0,
  "bodyUncompressedSize": 0,
  "format": "srwf.sparse-byte-delta.v3",
  "variant": "a",
  "commonRecordCount": 0
}
```

숫자 `0`은 키 모양만 보여 주는 placeholder이며 유효한 공개 예시가 아닙니다. 엔진은 **`format` 값으로**
고릅니다. 키 개수로 형식을 추측하지 않습니다(v2의 아홉 키 판별을 v3로 확장하지 않습니다). v1·v2
descriptor가 `SRWFKP3` 본문을 가리키거나 v3 descriptor가 다른 magic을 가리키면
`PATCH_FORMAT_MISMATCH`입니다. JSON 계약은 `schemas/patch-descriptor-v3.schema.json`에 고정합니다.

파서 API는 두 단계입니다.

- `parsePatchV3(bytes, payloadDescriptor)` — 변형과 무관한 payload 항목(10절 3단계)까지 검사하고 4~7단계를 모두
  수행한 뒤 **불변 그룹 객체**를 돌려줍니다. payload SHA-256으로 캐시할 수 있습니다.
- `selectVariantV3(group, { variant, targetSha256, recordCount })` — 8단계를 **적용할 때마다** 다시 수행하고
  병합 계획(두 커서)을 돌려줍니다. 기본 변형은 없습니다.
- 워커는 준비 단계에서 파싱 직후 `selectVariantV3`를 한 번 불러 잘못된 변형을 원본을 읽기 전에 거부하고, 적용마다 다시 부릅니다.
- `applyPatchV3ToWritable(blob, writable, plan, options)` / `buildVerifiedPatchedBlobV3(blob, plan, options)` —
  결과 해시를 **descriptor에서 온 값으로** 비교합니다(헤더 기본값 사용 금지).

## 14. 릴리스 명세의 patch 객체

v3 명세의 `patch`는 **정확히 여덟 키**입니다(v1·v2는 여섯 키 그대로). 그룹의 모든 행이 같은 파일을
가리킵니다.

```json
"patch": {
  "format": "srwf.sparse-byte-delta.v3",
  "url": "patches/srwf-f-20260928-v0-5.v3.srwfp",
  "size": 22152354,
  "sha256": "5fdc0b2549ff505e3ed5d29805e593d13df93a23df9c781c117752ab8dccf0cb",
  "recordCount": 1330782,
  "bodyUncompressedSize": 39438740,
  "variant": "a",
  "commonRecordCount": 1330116
}
```

| 키 | 규칙 |
|---|---|
| `format` | `srwf.sparse-byte-delta.v3` |
| `url` | `patches/<group>.v3.srwfp`. `<group>`은 릴리스 id에서 `-a/-b/-c` 접미사를 뺀 값(예 `srwf-f-20260928-v0-5`). 패턴 `^patches/[a-z0-9][a-z0-9._-]{0,63}\.v3\.srwfp$`. 그룹의 모든 행이 같은 값 |
| `size` | `202` ~ `50,331,648`. payload 파일 크기와 정확히 일치. 그룹 공통 |
| `sha256` | payload 전체 SHA-256. 그룹 공통이며 그룹의 모든 영수증 `patchSha256`과 같음 |
| `recordCount` | `commonRecordCount ≤ 값 ≤ commonRecordCount + 65,536`. 이 변형의 병합 record 수이며 승인된 v1의 `recordCount`와 같음 |
| `bodyUncompressedSize` | `3·commonRecordCount` ~ `100,663,296`. 그룹 공통 |
| `variant` | `a`/`b`/`c`. **릴리스 id 접미사와 같아야 함.** `target.filename`은 `-<variant>.bin`, `cueFilename`은 `-<variant>.cue`, `title`은 `(<variant>)`로 끝남 |
| `commonRecordCount` | `1` ~ `2,000,000`. 그룹 공통이며 헤더 값과 같음 |

추가 규칙:

- v3는 `-a/-b/-c` 행에서만 허용하며, `target.size = source.size`는 고정된 stock 크기 중 하나입니다.
- 그룹(같은 `url`)의 행들은 `format`, `url`, `size`, `sha256`, `bodyUncompressedSize`, `commonRecordCount`가 같고
  `variant`와 `recordCount`만 다릅니다. 그룹 안에서 한 행이 v3이면 모든 행이 v3입니다.
- payload 헤더의 변형 표 집합 = 그 `url`을 가리키는 `ACCEPTED` 행의 `variant` 집합(양방향). 각 헤더 `targetSha256`
  = 그 행 명세의 `target.sha256` = 그 영수증의 `targetSha256`. 승인되지 않은 변형은 payload에 실릴 수 없습니다.
- `source`와 `provenance.buildReceiptSha256`은 바뀌지 않고 `provenance.acceptanceReceiptSha256`은 재발급 영수증의
  해시로 갱신합니다.
- 명세 JSON 계약은 `schemas/release.schema.json`의 `patch` `oneOf`(6키 v1·v2 / 8키 v3)로 고정합니다.

## 15. 재발급 영수증과 record 지문

v3 payload는 이미 승인된 결과를 다시 배포하는 것이므로 새 승인이나 새 검수 주장이 아닙니다. 같은 경로
`receipts/<release-id>.acceptance.json`의 영수증을 **덮어쓰되 원래 증거를 보존**해 재발급합니다.

```json
{
  "schema": "srwf-kor.acceptance-receipt.v1",
  "releaseId": "srwf-f-20260928-v0-5-a",
  "state": "ACCEPTED",
  "acceptedAt": "2026-09-28T22:04:20+09:00",
  "stockProfileId": "saturn-jp-stock-track01-mode1-2352-c198a930",
  "sourceSha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
  "targetSha256": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
  "patchSha256": "5fdc0b2549ff505e3ed5d29805e593d13df93a23df9c781c117752ab8dccf0cb",
  "v5Commit": "ea1076d778df77815a4ac448ac2a21ec3d7ace8b",
  "gates": {
    "staticStructure": "PASS",
    "runtimeConsumption": "PASS",
    "visualLayout": "PASS",
    "longPlayProgression": "NOT_CLAIMED"
  },
  "decisionAuthority": "사용자 2026-09-29 지시: 기능·정확도 유지, 낭비 용량 제거. 동일 승인 결과의 v3 공용 payload 재배포이며 신규 검수·승인 주장 없음. 원 근거는 supersedes.",
  "patchFormat": "srwf.sparse-byte-delta.v3",
  "variantId": "a",
  "supersedes": {
    "receiptSha256": "6241ba3f5c04aa98209222130cbd008b5afa44b5e734201a08ac5e4ebb52de78",
    "patchSha256": "a309a7951effdbde05d5bd4c853eb41ccd8a5b00bb2be8a57df380734f28df59",
    "recordSetSha256": "6a76996aa051966c5e58e7881c370daa99a6e3ec23b468b8c45fdf61125e098f",
    "decisionAuthority": "사용자 2026-09-28 지시: G103/r116 abc 로컬 패치·다운로드 목록 등록. 기존 복사 상태 검증 범위로 수용. 신규 콜드부트·a/b 개별 플레이·장기 진행·CD-R 검수는 주장하지 않음. 원격 배포 제외."
  }
}
```

- 원래 필드(`schema`, `releaseId`, `state`, `acceptedAt`, `stockProfileId`, `sourceSha256`, `targetSha256`,
  `v5Commit`, `gates`)는 **바이트 단위로 그대로**입니다. `gates`와 증거 범위는 넓히지 않습니다.
- `patchSha256` = 공유 v3 payload의 SHA-256(위 값은 참조 인코더 결과 예시).
- `decisionAuthority` = 재배포 결정(160자 이하). **위 문구와 날짜는 초안이며 소유자가 확인해야 합니다.**
  새 검증을 주장하는 문장을 넣으면 안 됩니다.
- `patchFormat`, `variantId`, `supersedes`는 셋 다 있거나 셋 다 없어야 합니다(JSON Schema `dependentRequired`).
  `supersedes`는 닫힌 네 키이며 `receiptSha256`은 이전 영수증 **파일**의 SHA-256(= 이전 명세의
  `provenance.acceptanceReceiptSha256`), `patchSha256`은 이전 v1 payload, `decisionAuthority`는 이전 문구 그대로입니다.
- 검증기는 `V3_SUPERSEDED` 표(릴리스 id → 이전 영수증 해시, 이전 payload 해시, 이전 `recordSetSha256`,
  `acceptedAt`)를 코드에 고정해 이력을 조용히 다시 쓸 수 없게 합니다.

### 15.1 재발급 해시 사슬

payload → 영수증 `patchSha256` → 영수증 파일 SHA-256 → 명세 `provenance.acceptanceReceiptSha256` →
명세 파일 SHA-256 → 공개 index의 `manifestSha256`. 여섯 행의 `manifestSha256`만 바뀌고 index의 나머지는
그대로입니다. `docs/*.build.json`은 바이트 단위로 그대로 둡니다.

F v0.5-a의 참조 예시(문구가 위와 같을 때): 영수증 SHA-256 `9038b28d38d7…ad3f`, 명세 SHA-256
`3827b0bdf026…ddff`(이전 `97d5311fcb74…5fde`). 전체 값은
[`PATCH_V3_MEASUREMENTS.md`](PATCH_V3_MEASUREMENTS.md)의 사슬 표에 있습니다.

### 15.2 `recordSetSha256`

변형 하나의 병합 record를 offset 순서로 이어 SHA-256을 한 값입니다.

```
SHA-256( ‖ over records: offset u64 BE ‖ length u32 BE ‖ targetBytes )
```

이는 승인된 v1 body에서 record마다 32-byte preimage를 뺀 것과 같은 byte열입니다. **인코딩과 무관한 지문**이라
v1 payload와 v3 payload에서 각각 계산해 같아야 합니다. 결과 이미지는 `(원본, record 집합)`의 함수이므로 지문이
같다는 것은 v3로 만든 결과가 v1로 만든 승인 결과와 같다는 뜻입니다. 이 증명에는 원본 이미지가 필요 없습니다.
여섯 릴리스 모두 일치함을 확인했습니다.

## 16. 생성기 계약

`scripts/convert_to_v3.py`(표준 라이브러리만, 네트워크 없음. 하위 명령 `encode`·`verify`·`verify-stock`·`install`·`pins`)는 다음을 지킵니다.

1. **입력**은 이미 승인된 그룹의 v1 payload 세 개와 그 영수증입니다. 각 파일의 SHA-256이 영수증의
   `patchSha256`과 같지 않으면 즉시 중단합니다. 원본·결과 이미지는 필요 없습니다.
2. v1 규칙으로 엄격히 파싱하고(정규형 위반 시 중단), 변형 사이에서 `imageSize`와 `sourceSha256`이 같고 결과
   해시가 서로 다르며 원본과 다른지 확인합니다. 영수증의 `sourceSha256`/`targetSha256`과 헤더가 일치해야 합니다.
3. 정규 분할(7.1절)로 `common`과 변형 구간을 만들고 canary(8절 규칙)를 v1 preimage에서 뽑습니다. 공통 record의
   preimage는 변형 사이에서 같아야 합니다.
4. body와 헤더를 인코딩하고 5절 설정으로 압축합니다. payload는 **저장소 밖**에 씁니다(검증기가 인덱스에 없는
   `.srwfp`를 금지하므로).
5. **무손실 검증(원본 불필요)**: 독립 디코더(인코더 코드를 쓰지 않음)로 payload를 풀어 각 변형에 대해
   (a) 디코드한 `(offset, length, targetBytes)` 목록이 승인된 v1 목록과 record 단위로 완전히 같고,
   (b) `recordSetSha256`이 v1에서 계산한 값과 같고, (c) 헤더 `sourceSha256`·`targetSha256`이 영수증과 같고,
   (d) canary 해시가 v1 preimage와 같고, (e) 정규 재인코딩이 압축 해제한 body와 같음을 확인합니다. 하나라도
   어긋나면 중단합니다.
6. 그룹 단위로 원자적입니다(모든 변형 또는 없음). 영수증·명세·인덱스를 15.1절 순서로 갱신하고
   `python3 scripts/verify_repo.py`가 실패하면 되돌립니다. 여섯 개의 이전 payload는 삭제하되 git 이력(`3cb5e69`)과
   `supersedes`가 고정합니다. 산출물을 손으로 고치지 않습니다.
7. **소유자 stock 실행**(`convert_to_v3.py verify-stock --stock <이미지>`): 소유자가 자신의 정품 이미지로 독립 디코더와 실제 브라우저 엔진
   (`scripts/check_local_release_downloads.cjs`를 v0.4·v0.5 a/b/c에 맞게 일반화)을 돌려 원본 해시와 **모든 변형의**
   결과 해시가 승인된 `targetSha256`과 같음을 확인합니다. 무손실 검증(5)이 데이터 변환을 원본 없이 증명하므로 이
   실행은 출시할 **디코더·브라우저 구현**을 확인하는 것입니다. 통과 기록 없이 push·배포하지 않습니다.

참조 구현(비규범): `encode_v3.py`(인코더), `decode_v3.py`(독립 엄격 디코더·`verify-stock`),
`roundtrip_v3.py`(v1 대조), `selftest_v3.py`(골든 벡터와 실패 시험), `check_v3.mjs`(Node 교차 검증). 이 코드는
저장소의 `scripts/convert_to_v3.py`(인코더·독립 디코더·v1 대조·재발급·`verify-stock`·원자적 `install`)와
`tests/test_convert_to_v3.py`로 옮겨졌습니다.

## 17. 클라이언트 요구: 변형 전환에서 다시 받지 않음

- 워커의 payload 캐시 키는 payload SHA-256(+ URL + payload 수준 descriptor 지문)입니다. 변형 수준 필드(`variant`,
  `targetSha256`, `recordCount`)는 지문에 넣지 않고 `selectVariantV3`가 적용할 때마다 다시 검증합니다.
- 같은 세션에서 a/b/c를 바꿔도 payload를 다시 내려받거나 다시 파싱하지 않습니다.
- 원본 초기화(`RESET`)는 준비한 원본 상태만 지우고 내용 주소 지정 payload 캐시는 유지합니다. 캐시는 한 번에 하나의
  payload 그룹만 보관합니다.
- payload와 명세 fetch는 `cache: "no-store"`를 유지합니다. 오래된 HTTP 캐시는 해시 검증에서 fail closed 하며,
  세션 안 재사용은 워커 캐시가 담당합니다.
- 소스 해시는 형식의 일부가 아닙니다. `assets/sha256.mjs`를 그대로 써도 동작하며(측정 약 13 s), 형식과 독립인
  드롭인 구현이 약 1.4배 빠릅니다([측정 문서](PATCH_V3_MEASUREMENTS.md)). WASM은 CSP(`script-src 'self'`)에서
  쓸 수 없습니다.

## 18. 버전 처리

- v1(`SRWFKP1`)과 v2(`SRWFKP2`)의 형식·적용기·정규형·오류 코드는 바뀌지 않으며 다른 릴리스에 계속 쓰입니다.
  v1 문서의 "같은 크기는 v1" 원칙에는 이 문서의 그룹 예외가 더해집니다: **같은 크기이고 같은 버전의 승인된 a/b/c
  글꼴 변형은 하나의 v3 payload를 공유할 수 있습니다.**
- v3는 같은 크기 전용입니다. 크기가 커지는 그룹(F 완결편)은 v2를 씁니다.
- 새 형식은 새 magic, 문서, schema, parser, 테스트와 별도 승인을 동시에 추가해야 하며, 알 수 없는 magic이나
  구조를 만난 적용기는 추측해서 적용하지 않습니다. 압축 기법이나 도메인 특화 재생성(예: CD 섹터 EDC/ECC 재생성, 장거리
  중복 제거 단계)을 추가하려면 **새 magic(`SRWFKP4`)**으로 하며 v3에 선택 비트를 두지 않습니다.
- 병행하던 "layered" 분할(`claude/font-split-payloads`)은 이 형식으로 대체되며 그 영수증 필드
  (`intermediateSha256`, `basePatchSha256`, `fontPatchSha256`, `patchLayers`)는 들어오지 않습니다.

## 19. 함께 바꿔야 하는 곳

형식은 단독으로 출시할 수 없습니다. 아래를 하나의 검토 가능한 변경으로 동시에 바꿉니다.

**정책·문서**

- `AGENTS.md`: Outcome lock에 "F v0.4·v0.5 a/b/c payload는 버전마다 하나의 공유 v3 payload로 재인코딩된다. 이는 승인된 결과의
  재배포이며 모든 target SHA-256, gate, 증거 범위는 그대로이고 새 runtime·콜드부트·장기 플레이 주장을 더하지 않는다.
  재인코딩한 payload의 push는 사용자의 별도 요청이 필요하다." 추가. Publication gate 세 번째 항목에서 "an equal-size
  target must stay v1"에 "except that the accepted -a/-b/-c font variants of one version may share one documented v3
  payload (`docs/PATCH_FORMAT_V3.md`)" 예외를 넣고 존재하지 않는 layered 문단(`docs/LAYERED_RELEASES.md`,
  `scripts/split_font_variants.py`)을 지웁니다. "A shared v3 payload only redistributes already-accepted results.
  Each variant keeps its own release id, manifest and receipt (a superseding receipt that keeps the original
  evidence), the payload may not carry a variant without an ACCEPTED row, it is built by the repository generator, and the
  owner's stock run must have confirmed every variant's target SHA-256 before it is pushed or deployed." 새 bullet과,
  binary boundary에 "In v3 the changed bytes applied to any one variant stay within the documented cap and every one of
  them must differ from the stock byte at its offset.", fail-closed 목록에 "a source hash mismatch, an unchanged byte inside a
  record, a v3 variant, section or merge violation. Nothing is committed or returned before both whole-image hashes
  match." 를 넣습니다.
- `docs/PATCH_FORMAT.md`·`docs/PATCH_FORMAT_V2.md`의 "버전 처리", `docs/RELEASE_POLICY.md`(영수증 필드, 원자적 승격 순서 2번,
  명세 예시, "preimage를 브라우저가 검사" 문장, v3 재배포 절), `README.md`(174~178행), 새 `docs/V3_REDISTRIBUTION.md`
  (이전·새 해시, 지문, 변경 전 commit `3cb5e69`, 증거 범위가 그대로라는 명시).
- `docs/F_V04_VALIDATION.md`, `docs/F_V05_FIN_V02_VALIDATION.md`, `docs/*.build.json`은 바이트 단위로 그대로 둡니다.

**스키마** (`verify_repo.py`의 `validate_schema_documents`가 리터럴로 고정하므로 pin도 함께)

- `schemas/release.schema.json`: `patch`를 닫힌 6키(v1·v2)와 닫힌 8키(v3)의 `oneOf`로, `format` enum 확장, v3 `allOf`
  규칙(14절 표).
- `schemas/acceptance-receipt.schema.json`: 선택 `patchFormat`(const v3)·`variantId`(enum a,b,c)·`supersedes`(닫힌 4키),
  `dependentRequired` 전부 또는 전무. `patchSha256`은 계속 필수. `schema_object_properties()`가 properties = required를
  요구하므로 선택 집합 지원 필요.
- `schemas/patch-descriptor-v3.schema.json`(신규, 11키), `schemas/releases.schema.json`은 그대로.

**런타임**

- `assets/patch-core-v3.mjs`(신규): `parsePatchV3`, `selectVariantV3`, 적용기, 다운로드 빌더, 상한 상수(verify_repo가
  정규식으로 고정).
- `assets/patch-worker.mjs`: `PATCH_ENGINES` 항목(magic `SRWFKP3\0`), `descriptor.format` 기준 분기, payload 수준
  지문, `RESET`이 payload 캐시 유지, `{variant, expectedTargetSha256}` 전달, `isSourceAuthenticationError`에
  `SOURCE_CANARY_MISMATCH` 추가.
- `assets/app.mjs`: `PATCH_FORMAT_V3`, 형식별 상한(전역 `MAX_PATCH_BYTES = 80 MiB`를 형식별로), `manifest.patch` 키를 형식별
  (6키/8키, 알 수 없는 형식은 `PATCH_FORMAT_UNSUPPORTED`), 공유 URL용 `expectedPatchReference`, `variant` ↔
  `fontReleaseIdentity(row).revision`·파일명·제목 접미사 검사, 열한 키 descriptor, 새 코드의 `malformedPatchCodes`와
  오류 문구 표, `STATIC_ASSET_REVISION`과 모든 `?v=` import.
- `assets/release-notes.mjs`, `assets/patch-core-v2.mjs`, `index.html`: 리비전 문자열만(계약 테스트가 고정).

**검증기·도구**

- `scripts/verify_repo.py`: 상수, 독립 `inspect_srwfp_v3`(Python `zlib.decompressobj`), 정규 재인코딩 대조, 변형별 병합·
  캡처 창·`recordSetSha256`, v3 명세·영수증 분기, 그룹 검증기(14절), `V3_SUPERSEDED` 표, 스키마 pin, `REQUIRED_FILES`,
  `patch-core-v3.mjs` 정규식 pin. 선택: v3 도입 후 새 `-a/-b/-c` v1 행 금지(v2는 허용)와 `.srwfp` 총량 예산.
- `scripts/convert_to_v3.py`(신규), `scripts/check_local_release_downloads.cjs` 일반화,
  `register_g103_r116.py`·`prepare_next_release.py`·`finalize_local_release_ui.py`가 새 글꼴 그룹을 v3로 만든다는 문서화.
- 테스트: `tests/patch-core-v3.test.mjs`(변형별 적용, chunk 경계 불변, 아래 모든 공격 종류, 상한 ±1, varint 정규형,
  int32 경계, 열한 키 descriptor), `tests/patch-worker-v3.test.mjs`(캐시 재사용, 기본 변형 없음, 원본 오류 시 초기화),
  다운로드 경로(커밋 전 Blob 없음, 캡처 상한), `tests/patch-memory.test.mjs`(v3 상한), `tests/frontend-contract.test.mjs`,
  `tests/test_verify_repo.py`, `tests/test_convert_to_v3.py`, 그리고 부록 A의 골든 벡터를 JS와 Python이 모두 풀어
  같은 값이 나오는 교차 언어 테스트. `.srwfp` 파일은 검증기가 인덱스에 없는 것을 금지하므로 테스트 벡터는 인라인 hex/base64입니다.
- `manifest/releases.json`: 여섯 행의 `manifestSha256`만.

## 20. 소유자 결정과 잔여 위험

소유자가 확인해야 하는 항목입니다. 권고는 굵게 적었습니다.

1. **형식 채택과 AGENTS.md 개정**(19절 문구). 채택 전까지 이 문서는 확정이 아닙니다.
2. **추가 압축 단계**: 현재 v3는 표준 zlib만 씁니다. 별도 형식(`SRWFKP4`)에서 (a) CD 섹터 EDC/ECC 재생성(변경 바이트의 12.5%가 섹터
   패리티)으로 F v0.5 그룹 22.14 → 16.85 MB(−24%), (b) 자체 구현 장거리 중복 제거 단계(window 4 MiB)로 → 17.54 MB(−21%)를 줄일 수 있고,
   둘을 합치면 12.79 MB(−42%)입니다(압축 분석 측정, F v0.4는 20.45 → 12.20 MB). **지금은 넣지 않기를 권고합니다.** (a)는 재생성 결과가
   원본 섹터 내용에 의존해 원본 이미지 없이는 무손실 검증을 할 수 없고(실측 증거는 일부 섹터뿐), (b)는 합의된 "zlib만" 방향을 넘는 새 압축
   계층이며, 사이트 총량은 이미 약 103 MiB로 1 GB 한도와 무관합니다.
3. **재발급 영수증의 `decisionAuthority` 문구와 날짜**(초안은 15절). 새 검증을 주장하면 안 됩니다.
4. **공개 범위**: AGENTS.md의 원격 배포 승인은 `3cb5e69` 시점의 여섯 payload에 대한 것입니다. 재인코딩한 payload는 **로컬
   커밋까지만 하고, 소유자 stock 실행(16절 7단계) 통과 뒤 별도 요청이 있을 때 push**하기를 권고합니다.
5. **SHA-256 드롭인 구현을 형식과 별도로 먼저 출시할지**(**권고: 예**, 1.4배, node:crypto 대비 14,678건 비트 일치 확인 후).
   중첩 hash Worker는 추가로 1.4배이나 복사·역압·중단 처리가 늘어 **권고: 지금은 아니오**.
6. **검증기 정책**: v3 도입 뒤 새 `-a/-b/-c` v1 행 금지와 `.srwfp` 총량 예산(예 192 MiB) 추가 여부(**권고: 예**).
7. **canary**(8개, 헤더 약 320 B): **권고: 유지.** 없애면 잘못된 원본이 전체 pass(약 6~13 s와 임시 파일) 뒤에야 거부됩니다.
8. **URL 이름** `patches/<group>.v3.srwfp`(**권고**) 대 `patches/<group>.srwfp`.
9. **git 이력**: 이전 payload 약 400 MB가 이력에 남습니다(`.git` 약 511 MB, v3 커밋으로 약 43 MB 늘어남). Pages는 작업 트리만 올리므로
   사이트는 줄어들지만 이력은 줄지 않습니다. **이력을 다시 쓰지 않기를 권고합니다.** `3cb5e69`를 `docs/V3_REDISTRIBUTION.md`에 기록합니다.
10. F 완결편(v2, 각 약 3.6 MB)과 비-글꼴 릴리스는 이 형식의 범위 밖입니다.
11. 변형 id 공간은 `a`~`c`입니다. `d` 이상은 헤더 검사, `FONT_RELEASE_ID_PATTERN`, 스키마, 글꼴 선택기를 함께 바꿔야 합니다.

잔여 위험(측정하지 못한 것):

- Firefox·Safari에서 `DecompressionStream`의 뒤 데이터 처리와 중첩 Worker는 시험하지 못했습니다. v3는 이 동작에 의존하지 않도록 Adler-32 위치 검사와
  payload SHA-256 고정을 함께 씁니다.
- 실제 정품 원본, 휴대 기기의 SHA-256 속도·메모리는 측정하지 못했습니다(합성 578,512,032-byte 원본과 4-vCPU Xeon VM으로 측정).
- 선택하지 않은 변형의 record byte가 원본과 다른지는 브라우저가 그 세션에서 확인할 수 없고 `recordSetSha256`(CI)이 대신합니다(9절).

## 부록 A. 골든 벡터

합성 4096-byte 원본(`stock[i] = (i·131 + 17) & 0xFF`)과 세 변형의 아주 작은 예입니다. 게임 데이터는 없습니다.
JS와 Python 디코더는 이 payload를 풀어 아래 값이 나와야 합니다.

- `imageSize` 4096, `variantCount` 3, `commonRecordCount` 4, `canaryCount` 2, 헤더 275 bytes, zlib 596 bytes, 파일 871 bytes
- 파일 SHA-256 `e5af84b8ae1d97463c7f2ac3e9f419e380664564b7b0652afa470ccd8690e34c`
- `sourceSha256` `c741eee93580a334bae702208e5c0595d8e32eb07d562c52d56ca5f86e78f8a8`, `bodyUncompressedSize` 585 (index 24 bytes + data 561 bytes)
- 공통 record `(offset,length)`: `(5,3) (9,1) (300,200) (3000,50)`. a 고유: `(600,2) (1200,300)`. b 고유: `(600,4) (2000,1)`. c 고유: 없음.
- canary는 길이 16 이상인 공통 record 둘: `(300,200)`, `(3000,50)` (`|E| = 2`, `C = 2`)

| 변형 | 병합 record 수 | `targetSha256` | `recordSetSha256` |
|---|---:|---|---|
| a | 6 | `1c37d284fcf1fb4e85eb398f0e76d2aecf1233172845141e4d36d47897a39be7` | `0172de0b976da3ac372c01aa1af228f738dcdce3652529c6781b3dcfb11c35ad` |
| b | 6 | `b0fb49bfd578b189dba19b5d362d357cf8322158e85c5732b05952362555dffd` | `e3de0cacfd2f13f26b038827589d0b62eb00defba3ab58b5b1575eff63d80b1b` |
| c | 4 | `50a16a3e7e18e7c4a0c3e10613708f4cfbf9d757311f91c06de25dabe0596599` | `a634a448bfe9d4950fa9bc0c6fa7362ddd4c313045dd4d0cb47f7778e69b5139` |

index 영역(24 bytes, `05 00 a1 02 c3 13 | 02 00 c7 01 31 | d8 04 d5 04 | 01 ab 02 | d8 04 f3 0a | 03 00`):

| 집합 | GAP 구간 | LEN 구간 | 복원 |
|---|---|---|---|
| common | `05 00 a1 02 c3 13` = 5, 0, 289, 2499 | `02 00 c7 01 31` = 2, 0, 199, 49 | offset 5(3), 9(1), 300(200), 3000(50) |
| a | `d8 04 d5 04` = 600, 597 | `01 ab 02` = 1, 299 | offset 600(2), 1200(300) |
| b | `d8 04 f3 0a` = 600, 1395 | `03 00` = 3, 0 | offset 600(4), 2000(1) |
| c | (없음) | (없음) | – |

zlib stream은 `78 da`로 시작하고 마지막 4 bytes는 `12 1f 20 0f`(body의 Adler-32)입니다. payload(base64):

```
U1JXRktQMwAAAAAAAAAQAAAAAAAAAAJJx0Hu6TWAozS65wIgjlwFldjjLrB9VixS1Wyl+G54+KgAAAADAAAABAAAAP4AAAACAAABLAAAAMitq4OFFskN
LvH7jRbxZlNfI4CDEetpxi/aS79rP2HO5gAAC7gAAAAylUCxYQ0J6hrCRZ63qD58//T94/s3R6XvJJU9OFeHb95hHDfShPzx+06F6zmPDnbSrs8SMxco
RRQeTTbUeJejm+cAAAACAAABLmKw+0m/1Xixiduhm102LTV8+DIhWOhcVzKwWVI2JVXf/QAAAAIAAAAFY1Chaj5+GOfEoMPhBhNwj0z7+ddXMR+RwG3i
XavgWWWZAAAAAAAAAAB42gFJArb9BQChAsMTAgDHATHYBNUEAasC2ATzCgMApw/3p7pM4oBizKkZ9U0R8VUuiB5E7gC+x2+333evF3zWCGbcJoDlPWkJ
tV3xslT6iCrEowPjWzuLazKQcrTaeKrFYYEtRZk5bNYwlsw2mOdPp/+nT+eeNM6QPtRuOZ1FIYF9xah63LJwkjxriztD4wOj+iiK/FKw9V25CWU94Y4k
3ngO1H4Xr3ffh2/HoAbsRhj2LFHxFU35GaXCYILkSrgac7MTc8sreyTCYAKkSui9VfGxHfWoBvxGIIZcR+8Xv9cPt95ojiR+oA5l/FYv9x+37we/wG6E
3kiuFHHRDXXZKY3iwGIMuljqs1Pzkyv7WwziQCKMajmVDbHRda1EHpZ4JY1hwaUN2boUkjBS9Cpb+wOjwyOL6Fq0ElCyFGnJ3YUhwX0GqHYctlDWvxfP
px/nTyT+KE70HrDtFbnJbYXgQqwaeMosc9Mzixu7awKgQuyKWPqtEfFVDelZJI5gPuQOqN93j9d/ly9G3AZgxjyG6TWd8bFV/ahK5IIgwmQ760szk3M0
mnjKpAKgzWWZOU2VMVbsNpjGLIb/R68HX7fvkD7UjjjeZAGhfSWJed2ycNK8Cug6Y4MjQ/sLq/wSsPJcuulFvQFhxR14LtR+EM50H6dP579nz6YY9kwW
8FYt+RlF7QGhxGq42nSyEHOrC3vbI4PixGoIulTysV31iSn9pgDmXCaIVj+Xb7ffd6/EfoAuRJ4IbdUxkc01mepMogCiTPqbK/OTM9NrOEcft29aEh8g
Dw==
```

(위 base64를 줄바꿈 없이 이으면 정확히 871 bytes를 냅니다.)
