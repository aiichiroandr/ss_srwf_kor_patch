# F v0.4 검증 범위 — G93 a/b/c

## 공개 결정과 범위

사용자는 G93 a/b/c를 F v0.4로 공개하도록 지시했다. 이후 G93a에 대해 “콜드부트확인”이라고 직접 보고하고 1기·10기·9기 출격 화면 세 장을 제공했다.

이번 G92→G93 게임 수정은 한 자리 출격 수 옆 ‘기력’ 위치만 바로잡는 공통 코드다. a 실제 디스크 부팅 및 1/9/10기 화면, 앞서 사용자 PASS를 받은 c의 MC1/MC2 RAM 미리보기, 세 글꼴의 공통 실행 코드·주소·비대상 바이트 동일성 검증을 함께 사용해 이 수정의 런타임·화면 게이트를 판단했다. **b/c의 런타임 근거 재사용은 공통 코드 동일성에 근거한 판단이며, b/c 디스크를 각각 콜드부트했다는 뜻이 아니다.**

- 직접 확인: a 디스크 콜드부트, a의 1/9/10기 출격 화면.
- 선행 RAM 확인: G92c MC1/MC2에 동일한 G93 수정 적용, 사용자 PASS.
- 정적 확인: a/b/c 각각 대응 G92 부모 계승, 같은 공통 수정 적용, 다른 코드·글꼴 데이터 보존.
- 미검수: b/c 개별 디스크 콜드부트, 이번 버전의 저장·로드, 장시간 플레이·전 경로, CD-R 실기.

공개 영수증의 `runtimeConsumption`과 `visualLayout` PASS는 위 대표 실행과 공통 코드 동일성으로 범위를 제한한다. 세 폰트의 개별 디스크 플레이 완료나 모든 대사·화면의 완전 검수를 뜻하지 않는다. 장시간 진행은 `NOT_CLAIMED`다. 원 빌드 영수증과 RAM PASS 기록을 수정하지 않고 이 문서와 새 공개 승인 영수증을 별도로 연결한다.

## 고정 빌드

- 거래: `905b97d4-74fd-4989-ab96-8ccd7f34be90`
- 빌드 영수증: `448874fa-0f18-4a5b-8c00-633db23aabdc`
- exact plan SHA-256: `400886349463cf6ff5dc2a71418ba403a6a59337fc4b15e937deb024976b5cdc`
- execution-result.json SHA-256: `928a61cd795f6de08b31ffa0ba3945bc6f32090f5a02784f87ff503085b6e1fa`
- 빌드 저장소 commit identity: `ea1076d778df77815a4ac448ac2a21ec3d7ace8b`. 이 commit만으로 빌드 입력을 대신하지 않으며 위 exact plan·실행 영수증의 파일별 해시를 함께 사용한다.
- 최종 family bootstrap 8개 검사 PASS. 이는 게임 검수와 별개인 빌드·등록 감사다.

각 리비전 이름은 `V5.r001-fable-g93{a,b,c}-v01-rollup-on-g92c-20260915`이다. 의미상 부모는 각자 같은 글꼴의 G92 레인이며 이름의 `g92c`를 모든 글꼴의 binary donor로 해석하면 안 된다.

## 변경 경계

- BOOT literal `0x11B54..0x11B58`만 재지정.
- TSR decoded `0x2D260..0x2D280`에 32바이트 helper 삽입.
- 기존 G51 dispatch 128바이트와 나머지 BOOT bytes 보존.
- TSR glyph·root·비대상 decoded bytes 보존 및 native 압축 재현성 확인.
- BMESS, SCEDATA, DIC, EFFECT, MOVIE는 각 대응 G92와 동일.
- 3,259개 typed cell에 대한 helper 영역 충돌 검사, 로더 구조, raw sector 무결성 검증 PASS.

## 원본과 결과

원본은 일본판 F Rev. B 전체 디스크 578,512,032 bytes이며 SHA-256은
`c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8`이다.

각 결과를 원본과 등록된 raw sector payload로 다시 구성해 전체 SHA를 확인했고, 원장 밖의 모든 바이트는 원본과 같았다. 이어 원본과 결과 사이의 모든 변경된 연속 바이트만으로 공개 v1 패치를 계산했다. 동일 바이트를 레코드에 합치지 않았다.

| 폰트 | 패치 bytes | 레코드 수 | 압축 전 bytes |
|---|---:|---:|---:|
| a | 63,992,864 | 1,257,063 | 91,867,210 |
| b | 63,991,849 | 1,257,040 | 91,866,221 |
| c | 63,994,763 | 1,257,088 | 91,868,285 |

- a 결과 SHA-256: `f3292551e827ac66d4406a2994350342d9084a5d24a121a70185029fba574a3e`
- a 공개 패치 SHA-256: `f31ffbd24da40bc4355fa14878d0d24d80887e4ea2a6d88409099c9568ded0de`

- b 결과 SHA-256: `fe713fcab98279f8f6ffe6da45c145bcf75ab70ebe7361e733b71559b94f8589`
- b 공개 패치 SHA-256: `d6fcea57763bad838b1cfc73fedec75e485ffd541fb9783de7e37a0186f6c920`

- c 결과 SHA-256: `5489ed4e2d980a0010ecffba3801621b88cf20d7aa317811eddcd37eff13fe5f`
- c 공개 패치 SHA-256: `71bac68e81558b2d4ef24f16408e11a058c23140d1cfb57b77a05fa6be1db94a`

세 공개 패치를 실제 JavaScript 웹 엔진의 다운로드 생성 경로에 적용했다. 원본 전체 SHA, 각 레코드 원본 SHA 및 동일 바이트 금지, 결과 전체 SHA 검사를 모두 통과했다. 만들어진 Blob을 별도 SHA-256으로 재검사해 각 결과와 일치함도 확인했다. 전체 BIN 추가 파일은 만들지 않았다.

실제 데스크톱 브라우저에서도 원본 로컬 파일과 공개 패치 파일을 워커에 전달해 a/b/c 다운로드 결과를 만들었고, 세 결과 SHA가 모두 일치했다. 전체 BIN을 디스크에 추가 저장하지 않았다.

Node 검사에서 JavaScript heap을 256MiB로 제한했으며, 다운로드 변경 구간 캡처는 세 버전 모두 44MiB였다. 이는 휴대폰 실기 성능 측정이 아니다. 1,000,001개 레코드를 96MiB heap에서 읽는 합성 회귀 검사도 통과했다.

## CUE 구성

실제 a/b/c 이미지의 raw sector 모드 전환은 모두 0(MODE1), 101568(MODE2), 244166(MODE1), 244987(AUDIO)였다. 보존된 track 2 INDEX 01은 101718이다. 이 결과에 맞춰 브라우저가 다음 구성을 생성한다.

- Track 1 MODE1/2352, INDEX 01 00:00:00
- Track 2 MODE2/2352, INDEX 00 22:34:18 / INDEX 01 22:36:18
- Track 3 MODE1/2352, INDEX 01 54:15:41
- Track 4 AUDIO, INDEX 01 54:26:37

기존 v0.3의 CD-R 사용자 보고를 v0.4의 CD-R 실기 검수로 재사용하지 않았다.

## 새 사용자 스크린샷 근거

원본 PNG는 공개 저장소에 복사하지 않았다. 사용자가 제공한 리비전 prefix와 해시를 기록한다.

- 1기 `V5.r001-fable-g93a-v01-rollup-on-g92c-20260915-0000.png`: `4df97855710002e7fc8ecb295d8b9b72d2e6939d7d1d812ea9442da9cd976d36`
- 10기 `V5.r001-fable-g93a-v01-rollup-on-g92c-20260915-0001.png`: `56e12e7d118c0881820a409cec65461d45aaab2ec22353bec20b80b82a2f614c`
- 9기 `V5.r001-fable-g93a-v01-rollup-on-g92c-20260915-0002.png`: `8ed975ea3b329233d02f992f86c6338bcedb8f0e61b2b92316780e802184d27e`
