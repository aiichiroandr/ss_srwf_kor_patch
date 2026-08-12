# `.srwfp` 희소 패치 형식 v1

`srwf.sparse-byte-delta.v1`은 정확히 식별된 원본과 같은 길이의 결과물
사이에서 **달라지는 연속 바이트 구간만** 운반하는 이 프로젝트의 공개
패치 형식입니다. 파일 확장자는 `.srwfp`입니다.

이 형식 자체는 릴리스 승인 증거가 아닙니다. 공개 파일은 별도의
`ACCEPTED` 영수증, 릴리스 명세, 공개 인덱스가 모두 같은 해시를 가리킬
때만 유효합니다.

## 상한과 바이트 순서

- 패치 파일 전체: 최대 `33,554,432` bytes (32 MiB)
- 압축 해제한 body: 최대 `67,108,864` bytes (64 MiB)
- 모든 정수: unsigned, big-endian
- 모든 SHA-256 필드: 32-byte raw digest
- v1 source와 target: 같은 크기
- 압축: zlib stream (RFC 1950). raw DEFLATE나 gzip이 아닙니다.
- zlib `CINFO`가 선언한 window보다 먼 DEFLATE back-reference는 금지합니다.

크기 상한은 압축 해제 전에 검사합니다. 선언값, 실제값, 명세값 중 하나라도
다르면 즉시 중단합니다.

## 100-byte header

| offset | size | field | meaning |
|---:|---:|---|---|
| `0` | 8 | `magic` | ASCII `SRWFKP1` 뒤 NUL 1 byte (`53 52 57 46 4b 50 31 00`) |
| `8` | 4 | `recordCount` | body record 수 (`u32`) |
| `12` | 8 | `sourceSize` | 요구 원본 크기 (`u64`) |
| `20` | 8 | `targetSize` | 결과 크기 (`u64`) |
| `28` | 8 | `bodyUncompressedSize` | 압축 해제한 body의 정확한 크기 (`u64`) |
| `36` | 32 | `sourceSha256` | 원본 전체 SHA-256 |
| `68` | 32 | `targetSha256` | 결과 전체 SHA-256 |

byte `100`부터 파일 끝까지 정확히 하나의 zlib stream이 옵니다. stream 뒤
추가 데이터, 미완료 stream, 선언 크기를 넘는 출력은 허용하지 않습니다.

## 압축 해제 body와 record

body는 다음 record를 `recordCount`번 이어 붙인 것입니다.

| relative offset | size | field | meaning |
|---:|---:|---|---|
| `0` | 8 | `offset` | 원본/결과에서 교체를 시작할 byte offset (`u64`) |
| `8` | 4 | `length` | 교체 길이 (`u32`, 0 금지) |
| `12` | 32 | `preimageSha256` | `source[offset:offset+length]` SHA-256 |
| `44` | `length` | `targetBytes` | 같은 위치에 놓을 결과 bytes |

가장 작은 record도 45 bytes이므로 body 상한에서 가능한 `recordCount`의
이론상 절대 상한은 `1,491,308`입니다. 적용기는 그보다 낮은 hard cap
`1,000,000` records를 강제합니다.

### 정규형

공개 v1 patch의 record는 다음 정규형을 반드시 지킵니다.

- `length > 0`입니다.
- offset 오름차순이며 서로 겹치지 않습니다.
- 각 span은 source와 target 양쪽 범위 안에 완전히 들어갑니다.
- 모든 `targetBytes[i]`는 대응하는 `source[offset+i]`와 달라야 합니다.
- 생성기는 서로 바로 이어진 변경 bytes를 하나의 maximal consecutive run으로
  묶고, 동일 byte가 나타나는 지점에서 record를 나눕니다.
- 마지막 record 뒤에는 body 잔여 byte가 없습니다.

따라서 원본 전체나 긴 미변경 구간을 record 안에 숨기는 것은 포맷 오류입니다.
정규형은 원본을 읽은 적용 단계에서 record preimage와 함께 검증합니다.

## 검증·적용 순서

적용기는 다음 순서를 바꾸지 않습니다.

1. 공개 인덱스에서 `state: "ACCEPTED"`인 행만 선택합니다.
2. same-origin 상대 경로의 릴리스 명세와 `.srwfp`만 읽습니다.
3. patch 파일 크기와 전체 SHA-256을 릴리스 명세와 비교합니다.
4. header/body를 상한 안에서 해석하고 모든 구조 규칙을 검사합니다.
5. 사용자가 선택한 로컬 원본을 한 번 스트리밍하면서 전체 SHA-256, 각
   record의 preimage SHA-256, 모든 byte가 실제 변경이라는 조건을 검사하고
   offset 순서대로 별도 임시 출력에 기록합니다.
6. 같은 스트리밍 단계에서 완성 결과의 크기와 전체 SHA-256을 계산합니다.
7. 원본과 결과의 모든 검사가 끝난 경우에만 사용자가 고른 별도 출력 파일로
   확정합니다. 어느 하나라도 다르면 임시 출력을 중단합니다.

어느 단계든 실패하면 부분 결과를 다운로드하지 않습니다. 파일 선택은 로컬
브라우저 API만 사용하며 원본이나 결과를 네트워크로 전송하지 않습니다.

## JavaScript descriptor 계약

patch parser가 외부로 돌려주는 descriptor는 다음 camelCase key를 정확히
사용합니다.

```json
{
  "patchSize": 0,
  "patchSha256": "64 lowercase hex characters",
  "sourceSize": 0,
  "sourceSha256": "64 lowercase hex characters",
  "targetSize": 0,
  "targetSha256": "64 lowercase hex characters",
  "recordCount": 0,
  "bodyUncompressedSize": 0
}
```

위 숫자 `0`은 key 모양만 보여 주는 문서용 placeholder이며 유효한 공개
patch 예시가 아닙니다. 호출자가 기대값을 전달하면 parser는 여덟 항목을
모두 exact 비교합니다. 입력 hash 문자열은 대소문자를 받아들일 수 있지만
비교 전에 lowercase로 정규화하고, manifest와 descriptor에는 lowercase만
기록합니다. JSON 계약은
[`schemas/patch-descriptor.schema.json`](../schemas/patch-descriptor.schema.json)에
고정되어 있습니다.

## 버전 처리

magic이 다르거나 향후 버전의 구조를 만난 v1 적용기는 추측해서 적용하지
않습니다. 새 형식은 새 magic, 문서, schema, parser, 테스트와 별도 승인을
동시에 추가해야 합니다.
