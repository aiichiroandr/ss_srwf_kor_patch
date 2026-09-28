# F v0.5 / F 완결편 v0.2 로컬 준비

## 작업 분리

- 배포 기준: `19987edb50efd005569df0693fc2eb631019fa8a` (원격 main과 일치 확인).
- 에디터: 기존 `codex/local-web-editor` 및 미커밋 작업을 원래 폴더에 그대로 보존.
- 릴리스: `codex/local-f-v05-fin-v02`, 별도 worktree `srwf-kor-patch-release-v05-v02`.
- 사용자 범위: 로컬만. push/Pages 배포 금지.

## 대상과 현재 증거

F는 G98 a/b/c, 완결편은 FIN.r111 a/b/c. 공개 버전은 각각 v0.5/v0.2.
F의 `reports/g98_delivery_20260924.md`와 FIN의 `FIN.r111{a,b,c}.json`은
모두 사용자 fresh coldboot/R7 대기라고 명시한다. 빌드 완료를 사용자 검수 PASS로 바꾸지 않는다.

현재 새 ACCEPTED 영수증은 없으므로 공개 인덱스에 후보를 넣지 않는다.
`AGENTS.md` Publication gate: “A build receipt, identity pass, static pass,
isolated runtime sample, or candidate registration is not a substitute.”
실제 검수 범위와 수용 결정을 확인한 후 해시가 일치하는 영수증·manifest·patch를 함께 등록한다.

## 패치 준비

`scripts/prepare_next_release.py`는 원본·등록 산출물을 읽어 메모리에서 패치를 계산하고
`NEXT_RELEASE_PREFLIGHT.json`에 수치만 저장한다. BIN/CUE/SRWFP나 등록부는 쓰지 않는다.
F는 원본과 같은 크기이므로 v1. FIN은 기존 G541 구조를 재사용하는 v2이다.
FIN r111은 TSR 논리 크기가 215,040바이트로 늘었지만 기존 105섹터 안에 들어가므로
G541 재배치는 그대로 두고 디렉터리의 TSR 크기도 새 값으로 검증한다.
사용자 원본 오디오 이동분은 COPY로 참조한다.

## 등록 때 지킬 사항

- a: DOS thin 커스텀, b: 갈무리11, c: Mona12.
- 버전 선택과 폰트 선택, 패치노트, 모바일 배치를 기존 배포 화면에서 이어간다.
- 버전이 하나여도 회색 disabled 처리를 하지 않는다.
- 2026.08.14 FIN 시험판을 목록에 복원하지 않는다.
- 현재 F v0.4/FIN v0.1의 자료·해시를 덮어쓰지 않는다.
- 새 패치노트는 별도 초안이며 등록 전에는 기존 배포 노트에 연결하지 않는다.
- 변경 후 npm test와 저장소 검증을 수행한다.

## G98 패치 상한 조정

메모리 계산 결과 a/b/c 압축 패치는 각각 69,579,611 / 69,580,790 /
69,583,098바이트로 기존 64MiB 상한을 넘는다. 로컬 패처·검증기·스키마의 패치 파일
상한만 80MiB로 조정했다. 압축 해제 body 128MiB, 레코드 200만 개,
모바일 다운로드 캡처 64MiB, v2 이미지 증가량 64MiB는 유지한다.
F는 같은 크기의 결과이므로 v2로 우회하지 않는다.

F 등록 이미지의 간이 CUE는 단일 트랙만 적고 있으므로 그대로 공개 출력에 쓰지 않는다.
실제 raw sector 모드 전환은 0/101568/244166/244987로 확인되어 기존 F v0.4의
4트랙 구성에 맞는다. 새 공개 CUE를 연결할 때 이 관측과 원본 track 2 INDEX를 함께 사용한다.

## 2026-09-24 메모리 검증 결과

- G98 a/b/c: 웹 엔진 parsePatch → buildVerifiedPatchedBlob → 독립 SHA-256 재검사 PASS.
- Node JavaScript heap 256MiB 제한. 세 판 모두 다운로드 캡처 44MiB.
- FIN r111 a/b/c: G541 full34 정적 검사와 독립 v2 parser/stream 재적용 PASS.
- FIN의 COPY는 원본 오디오 3,880,800바이트 1건, LITERAL은 0바이트.
- 이미지/패치 생성물은 메모리에만 유지하고 파일로 기록하지 않았다.
- 세부 해시·크기·실측 결과는 `NEXT_RELEASE_PREFLIGHT.json`에 기록했다.
- 이 검사는 실제 게임 콜드부트·실기·장기 진행을 검증하지 않는다.

## 2026-09-28 목표 갱신 — 아직 공개 반영 아님

최종 목표는 F G101 a/b/c와 FIN r115 a/b/c의 공동 반영이다. 위 G98/r111 계산은 당시의 역사적 준비 결과로 보존한다. F G101은 등록됐지만 사용자 fresh coldboot/R7을 기다리며 FIN r115는 별도 작업에서 발행 준비 중이다.

F 신규 계산은 V5 `reports/g101_public_patcher_preflight_20260928.py`에서 기존 준비 코드를 재사용해 수행한다. SHA로 확인한 stock/G101 입력과 현재 웹 패처 엔진을 사용하며 메모리 재적용만 검사한다. 결과 파일이 생성되고 통과를 확인하기 전에는 검증 완료로 취급하지 않는다. FIN은 등록된 r115 카드·payload가 준비된 뒤 검증한다.

현재 ACCEPTED 영수증·릴리스 목록·공개 패치 파일은 변경하지 않는다. 허용 범위는 로컬 준비이며 push/Pages 배포는 포함하지 않는다.

## 2026-09-28 최신 로컬 패치노트

대상은 F G103 a/b/c → v0.5, FIN r116 a/b/c → v0.2로 갱신했다. 이전 G98/r111 및 G101/r115 기록은 과거 준비 결과다. 사용자용 노트는 `F_V05_FIN_V02_PATCH_NOTES.md`, 반응형 브라우저 미리보기는 `next-release-notes-preview.html`이다. 가속키 + START, L BGM/R 전투장면 조작, 계열별 BGM 표를 포함한다. 새 공개 패치·영수증·인덱스 연결은 아직 완료되지 않았다. 원격 배포하지 않았다.

## 2026-09-28 로컬 등록 완료

사용자의 G103/r116 abc 패치·다운로드 목록 등록 지시를 수용 근거로 여섯 릴리스를 등록했다. 새 기본 버전은 F v0.5 / FIN v0.2이며 a/b/c 선택과 패치노트·BGM 표를 연결했다. 기존 미완료 기록은 과거 상태다. 실제 검증 결과와 한계는 `G103_R116_LOCAL_EXPORT.json` 및 `F_V05_FIN_V02_VALIDATION.md` 참조. 원격 main의 64b08cb 선택칸 수정은 로컬에 반영했으며 에디터는 포함하지 않았다. push/Pages 배포 없음.
