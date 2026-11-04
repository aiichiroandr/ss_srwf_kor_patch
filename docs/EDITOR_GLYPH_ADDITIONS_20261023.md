# 사용자 입력 한글의 글리프 자동 추가

2026-10-23. 구현은 `assets/editor-glyphs.mjs`, 허용 셀과 승인 이미지 핀은 `assets/editor-glyph-pools.mjs`에 있다. 게임 추출 비트맵을 저장소에 배포하지 않는다. 원본 BIN을 바꾸는 작업과 새 패치 릴리스 배포는 별개다.

## 실제로 쓰는 공간

F v0.5 및 완결편 v0.3의 a/b/c 승인 6종을 각각 분석했다. TSR root36은 EB00 기준 2,816개 × 32바이트 셀이다. EB00~EBFF는 1바이트 글꼴 대역과 겹치므로 새 2바이트 글자에 배정하지 않는다.

| 게임 | atlas의 압축 해제 TSR 주소 | a/b/c 공통 허용 셀 | 원래 셀 |
|---|---:|---:|---|
| F v0.5 | `0x49b7b` | 44 | 비어 있지 않지만 확인한 소비자에서 미참조 |
| F 완결편 v0.3 | `0x4e8c4` | 10 | 미참조인 all-zero 셀 |

F의 all-zero 7개는 모두 기존 코드 참조가 있어 사용하지 않는다. 예를 들어 EEFF는 두 바이트 글자이며, FF가 들어 있다는 이유로 빈 종료 슬롯이라고 판단할 수 없다. F2E2 등 완결편의 빈 셀도 이름·패딩에서 참조하는 것은 배정하지 않는다. 완결편의 풀은 `F327 F385 F387 F38D F393 F396 F39E F3BD F3C3 F3CC`다.

전체 TSR에서 atlas 자체만 제외한 **모든 인접 바이트 쌍**, 전체 SCEDATA의 압축 해제 물리 body, EXEC 0, BMESS, M_DEAD, DIC를 대조했다. DIC는 압축 컨테이너의 원시 바이트와 압축 해제된 모든 section의 인접 쌍을 함께 제외했다. 별도로 기존 DIC 소비자 파서, 완결편 BMESS/M_DEAD 소비자 파서에서도 후보 참조가 없음을 확인했다. F BMESS/M_DEAD는 완결편의 고정 레코드 수를 대입하지 않고 비압축 파일 전체의 쌍을 검사했다. 한 바이트 오프셋이 어긋난 우연한 쌍도 제외하는 보수적 기준이다.

이 풀은 “모든 가능한 실행 경로를 증명했다”는 뜻이 아니다. 현재 해석한 게임 텍스트 소비자의 참조와 보수적인 쌍 검사를 통과한 셀이다. 외부 BCR의 사용자 이름에 쓰인 코드는 ROM만으로 알 수 없다. planner의 `reservedCodes`로 현재 불러온 BCR의 코드를 추가 제외한다. 따라서 실제 잔여량은 F 44개·완결편 10개보다 적을 수 있다. 기존 추가 매핑은 BCR과의 연계를 위해 자동 회수하지 않는다.

각 승인 이미지 SHA-256, 각 a/b/c atlas 전체 SHA-256, 각 허용 셀의 원래 SHA-256을 고정했다. 다른 버전·변조된 atlas·프로필 밖 셀·상한 초과 요청은 거부한다. 숫자상 atlas를 늘리거나 실행 코드를 패치하지 않는다. 원래 lookup 범위 안에서만 배정한다.

## 글자 생성과 라이선스

기존 문자표에서 읽을 수 있는 문자는 그대로 쓴다. NFC로 합친 입력의 새 현대 한글 음절만 Unicode 순으로 추가한다. 이름 코덱과 동일하게 한 글자인 NFC/NFKC 별칭도 기존 글자로 인정하므로 ASCII 숫자·영문·반각/전각 가나를 불필요하게 새 한글로 처리하지 않는다. 지원하지 않는 새 이모지·한자 등은 거부한다.

추가 글자는 **SRW Editor Hangul Fallback**을 사용한다. [갈무리 공식 저장소](https://github.com/quiple/galmuri)의 Galmuri11 2.403 TTF를 12px monochrome으로 rasterize하고, ink를 crop해 16×16 셀의 x=0/y=2에 둔 11,172자 bank다. 이는 기존 로컬 갈무리 atlas 제작 흐름과 같은 배치다. 입력 환경에 설치된 시스템 폰트나 원격 웹폰트에 의존하지 않는다. 원본 TTF SHA-256과 전체 bitmap bank SHA-256을 고정하고, 경량 LZSS bank를 동기로 해제한 뒤 hash를 검사한다.

bank 모듈은 약 74KB다. 원본 TTF·게임 글리프는 포함하지 않는다. [OFL 원문](https://github.com/quiple/galmuri/blob/main/ofl.md)과 저작자 표시를 `assets/editor-hangul-OFL.txt`에 포함한다. 로컬 DOS thin BDF는 재배포 허가를 확인하지 못해 반입하지 않았다. a/c를 포함해 **새 글자만 갈무리 기반 보조 글꼴**이므로 기존 DOS·Mona와 획 모양이 다를 수 있다는 안내를 반환한다. 3개 글꼴의 완전한 모양 일치를 주장하지 않는다.

## 데이터와 원복

`planGlyphAdditions(decoded, texts, options)`는 원본 atlas를 인증하고, 기존 추가 매핑·외부 BCR 예약 코드를 피해서 결정적으로 배정한다. 기존 코드가 가진 Unicode 별칭을 덮어쓸 때는 그 옛 별칭을 제거한다. 이 때문에 입력 안의 다른 글자가 사라진다면 그 글자도 다시 배정하거나, 공간이 없을 때 전체 요청을 거부한다.

entry는 아래와 같다. 원래 비트맵은 사용자가 가진 ROM의 메모리에서만 가져와 개인 출력의 metadata에 보관한다.

```js
{
  unicode: '힣',
  code: 'F327',                 // 대문자 4자리 hex
  bitmap: '…',                 // 새 32바이트: 소문자 hex 64자
  originalSha256: '…',
  originalBitmap: '…'           // 원래 32바이트: 소문자 hex 64자
}
```

`writeGlyphAdditions`는 요청 entry의 bitmap을 신뢰하지 않고 bundled font에서 다시 생성해 비교한다. 원래 셀의 핀·현재 원본 atlas hash까지 재검사한다. 바뀌는 것은 선택한 셀과 TSR 끝의 bounded 정규 metadata다. 전체 metadata는 32KiB 이하이고, TSR의 기존 live-memory 상한 `0x002b1800`도 유지한다. 압축 디스크 할당 검사는 상위 writer가 별도로 유지한다.

footer는 `SRWGLY01` + 기존 decoded 길이 u32 + JSON 길이 u32의 16바이트다. JSON은 버전·게임·승인 base hash·atlas hash·코드순 entries다. 이름/다른 확장을 먼저 쓰고 glyph footer를 가장 바깥에 붙인다. 재열기에서는 glyph footer를 먼저 읽어 mapping을 복구한 다음 각 셀을 원래 비트맵으로 되돌린다. 원복한 atlas의 전체 hash도 검사한다. 그 뒤 상위 editor가 이름 포인터·기체 저장소 등 기존 확장을 원복하고 기존 immutable provenance를 검사한다. 글꼴 때문에 전체 writable mask를 넓히지 않는다.

`readGlyphAdditions(decoded, {gameId})`는 승인 base hash가 아직 판정되기 전에도 metadata에서 해당 핀을 찾을 수 있다. 반환 base hash는 이후 전체 provenance가 확인한 값과 상위 코드에서 다시 대조해야 한다. 임의 hash 프로필을 허용하지 않는다. 분리 payload가 필요한 경우 `encodeGlyphManifest`/`decodeGlyphManifest`를 쓸 수 있다. 제품 API는 승인 프로필에 고정되어 있으며 `createGlyphEditor`는 게임 데이터 없는 독립 합성 fixture용 trusted-profile seam이다.

BCR에는 글꼴이 없다. 신규 글자를 쓴 세이브는 그 mapping이 든 개인 수정 ROM과 함께 사용해야 한다. 세이브만 저장해 다른 ROM에서도 신규 글자가 표시된다고 주장하지 않는다. 천지인 입력 화면 개선은 이 구현에 포함하지 않는다.

## 검증 범위

전용 합성 회귀 13건을 통과했다. 모든 현대 한글 셀·정규화 별칭·예약과 기존 매핑·비zero 원복·문자 alias 연쇄 보존·상한·외부 코드와 bitmap/원본 변조·footer 정규형·기존 확장 tail 보존을 검사한다.

승인 sparse patch의 파일 SHA-256을 확인하고 **TSR extent만 메모리에서 복원**해 실제 F/완결편 a/b/c 6종으로 production API를 실행했다. F는 44칸, 완결편은 10칸 모두 실제 추가→쓰기→재열기→원래 TSR 바이트 정확 복원→다시쓰기 바이트 동일을 확인했다. 동적 이름 codec 왕복, 선택 셀 밖 불변, 입력 원본 불변, BCR 예약 제외, 풀 고갈 거부도 6종 모두 통과했다. F c와 완결편 a는 실제 승인 BIN에서 읽은 전체 TSR과 이 extent 복원본이 완전히 같음을 별도로 확인했다. 완결편 b/c는 a와 atlas 밖 8바이트도 다르므로 글꼴 영역 외 전체 sibling 동일성을 주장하지 않는다.

이 검사는 정적 파일·writer·codec 검사다. 게임 안에서 모든 이름 창·대사 창의 신규 글자 표시, 장시간 진행, 외부 세이브 전체 호환을 검증한 것은 아니다. 새 전체 BIN·CUE·상태·동영상 덤프는 만들지 않았다. 작은 로컬 근거 JSON `story-font/glyph-additions-six-variants.json`만 남겼다.
