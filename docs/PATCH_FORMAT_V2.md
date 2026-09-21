# `.srwfp` 크기 증가 패치 형식 v2

`srwf.sparse-byte-delta.v2`는 결과 이미지가 고정 원본보다 **클 때만** 쓰는 공개
패치 형식입니다. 파일 확장자는 v1과 같은 `.srwfp`이고 magic으로 구분합니다.
결과 크기가 원본과 같으면 계속 [v1](PATCH_FORMAT.md)만 씁니다. 같은 결과를 두
형식으로 만들 수 없도록 크기가 같거나 줄어드는 v2 패치는 형식 오류입니다.

v1의 파서·적용기·정규형·오류 코드와 이미 공개한 v1 `.srwfp`는 v2 추가로 바뀌지
않습니다. v2는 별도 모듈(`assets/patch-core-v2.mjs`)과 형식 분기로만 동작하며
zlib·DEFLATE 검사기는 v1 것을 그대로 재사용합니다.

이 형식 자체는 릴리스 승인 증거가 아닙니다. 공개 파일은 별도의 `ACCEPTED`
영수증, 릴리스 명세, 공개 인덱스가 모두 같은 해시를 가리킬 때만 유효합니다.

## 왜 COPY가 필요한가

데이터 트랙이 커지면 뒤의 오디오 트랙이 그만큼 뒤로 밀립니다. 이때 원본 범위
끝부분은 새 파일·옮긴 post-gap·밀린 트랙의 앞부분으로 바뀌고, 원본 끝 뒤에는
밀린 트랙의 나머지가 붙습니다. 끝에 덧붙이기만으로는 표현할 수 없고, 옮겨진
원본 오디오를 바이트 그대로 실으면 게임 원본 데이터를 배포하게 됩니다. 그래서
v2는 **사용자 원본의 다른 위치를 참조하는 COPY**를 둡니다. 위치만 옮기는 원본
바이트는 반드시 COPY로 참조하고 LITERAL로 싣지 않습니다.

## 상한과 바이트 순서

- 패치 파일 전체: 최대 `67,108,864` bytes (64 MiB)
- 압축 해제한 body: 최대 `134,217,728` bytes (128 MiB)
- 레코드: 최대 `2,000,000`개, 그중 COPY는 최대 `65,536`개
- COPY 길이: `64` bytes 이상, `2^32 - 1` 이하
- 증가량 `targetSize - sourceSize`: `1` ~ `67,108,864` bytes
- 매니페스트 결과 크기: 2352의 배수, 고정 원본보다 큼, `333,000` 섹터
  (`783,216,000` bytes, 74분 CD-R) 이하
- 모바일 다운로드 캡처: 최대 64 MiB (REPLACE·LITERAL 창만 계산)
- 모든 정수: unsigned, big-endian. 모든 SHA-256 필드: 32-byte raw digest
- 압축: zlib stream (RFC 1950) 정확히 1개. `CINFO ≤ 7`, preset dictionary 금지,
  window보다 먼 back-reference 금지, 미완료 stream·뒤에 붙은 데이터·선언 크기 초과
  금지는 v1과 같습니다.

## 128-byte header

| offset | size | field | 규칙 |
|---:|---:|---|---|
| `0` | 8 | `magic` | ASCII `SRWFKP2` 뒤 NUL 1 byte (`53 52 57 46 4b 50 32 00`) |
| `8` | 4 | `recordCount` | ≤ 2,000,000 |
| `12` | 8 | `sourceSize` | ≥ 1, safe integer |
| `20` | 8 | `targetSize` | > `sourceSize`, 증가량 ≤ 67,108,864 |
| `28` | 8 | `bodyUncompressedSize` | ≤ 134,217,728 |
| `36` | 32 | `sourceSha256` | 원본 전체 SHA-256 |
| `68` | 32 | `targetSha256` | 결과 전체 SHA-256 |
| `100` | 4 | `replaceCount` | REPLACE 개수 |
| `104` | 4 | `copyCount` | COPY 개수, ≤ 65,536 |
| `108` | 4 | `literalCount` | LITERAL 개수. 세 개수의 합 = `recordCount` |
| `112` | 8 | `copyBytes` | COPY 길이 합과 정확히 일치 |
| `120` | 8 | `literalBytes` | LITERAL 길이 합과 일치, ≤ 증가량 |

예약 바이트는 없고 모든 필드를 정확히 비교합니다. byte `128`부터 파일 끝까지
zlib stream 하나가 옵니다.

## record

body는 다음 레코드를 `recordCount`번 이어 붙인 것입니다. 모든 레코드는
`kind u8 · targetOffset u64 · length u32`로 시작합니다.

| kind | 이름 | 나머지 필드 | 최소 크기 | 범위 | 원본 검증 |
|---|---|---|---:|---|---|
| `0x01` | REPLACE | `preimageSha256[32] · bytes[length]` | 46 | `t + n ≤ sourceSize`, 같은 오프셋 치환 | preimage SHA 일치, 모든 바이트가 원본과 달라야 함 (v1과 같음) |
| `0x02` | COPY | `sourceOffset u64 · sourceSha256[32]` | 53 | `t + n ≤ targetSize`, `s + n ≤ sourceSize`, `s ≠ t`, `n ≥ 64` | `source[s:s+n]`의 SHA-256 |
| `0x03` | LITERAL | `bytes[length]` | 14 | `t ≥ sourceSize`, `t + n ≤ targetSize` | 없음(원본이 없는 영역) |

### 정규형과 덮기 규칙

1. `targetOffset`은 엄격한 오름차순입니다. 이전과 같으면 `DUPLICATE_RECORD`,
   작으면 `UNSORTED_RECORD`, 이전 끝보다 작으면 `OVERLAPPING_RECORD`입니다.
2. 레코드 사이의 빈 구간은 **target offset < `sourceSize`에서만** 허용하며 같은
   오프셋의 원본 바이트로 채웁니다.
3. `[sourceSize, targetSize)`의 모든 바이트는 COPY 또는 LITERAL로 정확히 한 번
   덮여야 합니다(`EXTENSION_GAP`).
4. REPLACE는 `sourceSize`를 넘을 수 없습니다. 경계를 넘는 변경 구간은 생성기가
   `sourceSize`에서 REPLACE와 LITERAL로 나눕니다.
5. 병합: REPLACE끼리 인접 금지(v1과 같음), LITERAL끼리 인접 금지, COPY끼리는
   target과 source가 모두 이어지면 금지합니다. 종류가 다르면 인접해도 됩니다.
6. `s = t`인 COPY는 금지합니다(`IDENTITY_COPY`). 원본 범위 안에서 같은 오프셋
   원본과 똑같은 COPY는 사실상 빈 구간이므로 생성기와 독립 검증기에서 차단합니다.
7. body 잔여 바이트는 금지하고, 헤더의 종류별 개수와 바이트 합은 실제와 같아야
   합니다.
8. 크기가 같거나 줄어드는 패치는 허용하지 않습니다(`SIZE_NOT_GROWING`).

## 검사 순서

오류 코드가 한 가지로 정해지도록 순서를 고정합니다.

1. **헤더**(압축 해제 전): 크기 → 길이 → magic → safe integer → 원본 크기 → 크기
   증가 → 증가량 → body 상한 → 레코드 수 → COPY 수 → 종류별 합 → LITERAL 바이트
   상한 → 최소 body 크기(46R + 53C + 14L) → descriptor(패치 SHA 포함)
2. **압축 해제**: zlib 헤더 → 출력 상한 → Adler-32와 뒤에 붙은 데이터 → DEFLATE
   window
3. **레코드**(레코드마다): 잘림 → 알 수 없는 kind → safe integer → 빈 레코드 →
   중복·정렬·겹침 → target 범위 → 종류별 규칙 → 병합 → 덮기. 마지막에 잔여 바이트
   → 꼬리 덮기 → 실제 개수 → 실제 바이트 합
4. **적용**: 원본 Blob 크기 → preimage와 모든 바이트 차이·COPY 원본 SHA(target
   순서대로) → 원본 전체 SHA → 출력 길이 → 결과 SHA → 그다음에만 `close()`

### 오류 코드

| 분류 | 코드 |
|---|---|
| 형식·버전 | `BAD_MAGIC`, `TRUNCATED_HEADER`, `UNSAFE_INTEGER`, `PATCH_FORMAT_MISMATCH` |
| 크기 | `BAD_SIZE`, `SIZE_NOT_GROWING`, `GROWTH_TOO_LARGE`, `PATCH_TOO_LARGE`, `PATCH_SIZE_MISMATCH` |
| 압축 해제 | `BODY_TOO_LARGE`, `BODY_SIZE_MISMATCH`, `BAD_ZLIB_BODY` |
| 개수·길이 | `TOO_MANY_RECORDS`, `TOO_MANY_COPY_RECORDS`, `RECORD_COUNT_MISMATCH`, `RECORD_BYTES_MISMATCH`, `EMPTY_RECORD`, `TRUNCATED_RECORD`, `TRAILING_BODY_DATA`, `UNKNOWN_RECORD_KIND` |
| 순서·중복 | `DUPLICATE_RECORD`, `UNSORTED_RECORD`, `OVERLAPPING_RECORD`, `NON_MAXIMAL_RECORDS`, `IDENTITY_COPY`, `COPY_TOO_SHORT` |
| 범위 | `RECORD_OUT_OF_RANGE`, `REPLACE_OUT_OF_SOURCE`, `LITERAL_INSIDE_SOURCE`, `COPY_SOURCE_OUT_OF_RANGE`, `EXTENSION_GAP` |
| 원본 불일치 | `SOURCE_SIZE_MISMATCH`, `SOURCE_HASH_MISMATCH`, `PREIMAGE_MISMATCH`, `NON_DIFFERING_BYTE`, `COPY_SOURCE_MISMATCH` |
| 결과 불일치 | `OUTPUT_SIZE_MISMATCH`, `TARGET_HASH_MISMATCH`, `DESCRIPTOR_MISMATCH`, `DOWNLOAD_BLOB_SIZE_MISMATCH`, `DOWNLOAD_CAPTURE_TOO_LARGE` |

원본 불일치 코드(`COPY_SOURCE_MISMATCH` 포함)가 나면 워커는 준비한 원본 상태를
폐기하고, 사용자는 원본 폴더를 다시 선택해야 합니다.

## 적용 알고리즘

### 디렉터리 출력 (스트리밍)

1. 원본 Blob 크기가 `sourceSize`인지 확인합니다.
2. 원본을 앞에서부터 한 번만 읽는 순차 리더를 엽니다. 읽은 모든 바이트는 원본
   전체 SHA-256에 들어갑니다.
3. target offset 순서로 처리합니다.
   - 빈 구간: 같은 오프셋 원본 바이트를 방출합니다.
   - REPLACE: 순차 리더에서 `n` bytes를 읽어 모든 바이트 차이와 preimage를 검사한
     뒤 레코드 바이트를 방출합니다.
   - COPY: 원본 범위 안에서 가려지는 같은 오프셋 바이트는 순차 리더로 읽어 해시만
     하고, `blob.slice(s + k, …)`를 1 MiB씩 임의 접근으로 읽어 해시하며
     방출합니다. 합계가 `sourceSha256`과 다르면 `COPY_SOURCE_MISMATCH`입니다.
   - LITERAL: 레코드 바이트를 방출합니다.
4. 원본 전체 SHA, 출력 길이 = `targetSize`, 결과 SHA = `targetSha256`이 모두 맞을
   때만 `close()`합니다. 어느 단계든 실패하면 `abort()`만 부르고 부분 결과를
   남기지 않습니다.

진행률은 방출한 위치 / `targetSize`로 보고합니다. 정규화한 원본 Blob(CUE+BIN
가상 결합 포함)을 slice로 다시 읽으므로, 다시 읽은 바이트는 레코드 SHA와 최종
결과 SHA로 두 번 확인됩니다.

### 모바일 다운로드 Blob

- 캡처 창은 REPLACE·LITERAL 레코드에서만 만듭니다(1 MiB 정렬, `targetSize`에서
  자름, 합계 64 MiB 이하). COPY 구간은 캡처하지 않습니다.
- 위 적용기를 희소 캡처 writer에 연결해 실행하고, 결과 SHA가 맞아야만 close됩니다.
- 조립: 창은 캡처한 바이트, 창 밖은 바이트의 출처로 채웁니다. 같은 오프셋 원본이면
  `blob.slice(x, y)`, COPY면 `blob.slice(s + (x - t), s + (y - t))`입니다. 창 밖에
  REPLACE·LITERAL이 걸리면 `DOWNLOAD_ASSEMBLY_INVALID`, 조립 Blob 크기가
  `targetSize`와 다르면 `DOWNLOAD_BLOB_SIZE_MISMATCH`입니다.
- 신뢰 모델은 v1과 같습니다. 최종 다운로드 때 원본 slice를 다시 읽습니다.

### 메모리

레코드 색인은 레코드당 body 위치 4 B와 종류 1 B만 보관합니다. 스트리밍 중에는
원본 청크 1개, 쓰기 버퍼 1 MiB, COPY 읽기 1 MiB만 추가로 씁니다. 100만 개가 넘는
레코드도 96 MiB JavaScript heap 안에서 파싱되는지 테스트로 확인합니다.

## JavaScript descriptor 계약

v2 descriptor는 v1의 여덟 키에 `format`을 더한 **아홉 키**이며 모두 exact 비교합니다.

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
  "format": "srwf.sparse-byte-delta.v2"
}
```

숫자 `0`은 키 모양만 보여 주는 placeholder입니다. 키가 여덟 개면 v1이며 기존 규칙을
그대로 따릅니다. v1 descriptor가 `SRWFKP2` 본문을 가리키거나 v2 descriptor가
`SRWFKP1` 본문을 가리키면 `PATCH_FORMAT_MISMATCH`로 멈춥니다. JSON 계약은
[`schemas/patch-descriptor-v2.schema.json`](../schemas/patch-descriptor-v2.schema.json)에
고정되어 있습니다.

릴리스 명세의 patch 객체 키 여섯 개는 v1과 같고 `format` 값만 v2입니다. v2 명세는
`target.size`가 고정 원본보다 크고 2352의 배수이며 증가량 64 MiB·333,000 섹터
이하여야 하고, `patch.size ≥ 129`, `bodyUncompressedSize ≥ 14 × recordCount`입니다.

## 생성기와 독립 재적용 검증기

생성기(제작 측)는 배치 계획의 이동 목록마다 `target[t:t+n] == source[s:s+n]`을
바이트 단위로 확인해 COPY를 만들고, COPY 밖 구간은 원본 범위 안에서 서로 다른
바이트의 최대 연속 구간을 REPLACE로, 원본 끝 뒤는 LITERAL로 만듭니다.
REPLACE·LITERAL이 덮는 결과 섹터 가운데 원시 2352 B나 2048 B 사용자 데이터가 다른
위치의 stock 섹터와 같은 것이 있으면(0으로 찬 섹터 제외) 중단합니다. zlib level 9,
wbits 15로 타임스탬프 없이 압축해 같은 입력에서 항상 같은 바이트를 냅니다.

독립 재적용 검증기는 생성기 코드를 쓰지 않고 v2 파서로 전체 규칙을 확인한 뒤 stock에
스트리밍으로 적용해 제작 측 최종 이미지와 비교합니다. Node에서는
`fs.openAsBlob(stock)`에 실제 `assets/patch-core-v2.mjs`를 해시만 하는 writable로
적용해 결과 SHA와 조립 Blob을 확인합니다. BIN·CUE 일치(트랙 모드 경계, PVD 볼륨
크기 = 섹터 수, COPY target = 트랙 3 INDEX 00 × 2352)도 함께 확인합니다.

## 버전 처리

magic이 다르거나 알 수 없는 구조를 만난 적용기는 추측해서 적용하지 않습니다. 새
형식은 새 magic, 문서, schema, parser, 테스트와 별도 승인을 동시에 추가해야 합니다.
