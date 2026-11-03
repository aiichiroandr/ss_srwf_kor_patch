# 공개 히스토리 정리 (2026-11-03)

사용자 승인에 따라 이 저장소의 모든 브랜치 히스토리를 다시 쓰고 강제
푸시했습니다. 전체 커밋 대응표는
[HISTORY_REWRITE_20261103.json](HISTORY_REWRITE_20261103.json)에 있습니다.

## 지운 것

| 경로 | 이유 |
|---|---|
| `web-port/runtime/` 전체 (wasm 9종, 로더, 소스 아카이브 11개, 매니페스트) | 게임 실행 파일을 정적 재컴파일한 코드가 들어 있었음 |
| `web-port/images/f-ja.png`, `f-ko.png`, `final-ja.png`, `final-ko.png` | 디스크 `EFFECT.BIN`에서 디코드한 타이틀 로고 |
| `patches/srwf-f-20260821-v0-2.srwfp` | 철회된 F v0.2. 원본과 같은 바이트 1,873,210개를 담고 있었음 |

- 지운 blob은 46개입니다. 나머지 파일, 커밋 작성자, 날짜, 메시지는 바뀌지 않았습니다.
- 브랜치 8개 모두 지운 경로를 뺀 내용이 정리 전과 같음을 확인했습니다.
- `main`의 최종 내용은 정리 전과 완전히 같습니다.
- F v0.2 패치는 소유자 구글 드라이브 백업(`srwf-previous-public-releases-20261011.zip`,
  [RELEASE_ARCHIVE_20261011.json](RELEASE_ARCHIVE_20261011.json))에 남아 있습니다.
- F v0.2의 해시 고정과 철회 상태는 검증기와 보관 장부에 그대로 있습니다.

## 바뀐 커밋 해시

2026-08-21(F v0.2 추가) 이후의 모든 커밋은 해시가 바뀌었고, 그 이전 커밋 18개는
그대로입니다. 기록 문서와 검증기는 정리 전 해시를 그대로 둡니다. 보관 장부처럼
해시로 고정된 기록이 있기 때문입니다. 자주 참조하는 것은 아래와 같습니다.

| 정리 전 | 정리 후 | 커밋 | 참조하는 곳 |
|---|---|---|---|
| `0781ed9` | `67cd896` | v2 성장 패치 형식 추가 | `docs/FIN_V01_R110_BUILD_RECEIPT.json` |
| `19987ed` | `a9bd8bb` | 완결편 선택기 캐시 갱신 | `docs/NEXT_RELEASE_PREFLIGHT.json`, `docs/NEXT_RELEASE_PREPARATION.md`, `scripts/prepare_next_release.py` |
| `64b08cb` | `6d4e8cc` | PR #21 병합 | `docs/NEXT_RELEASE_PREPARATION.md` |
| `8346a78` | `721eedd` | 보관 장부의 기준 커밋 | `docs/RELEASE_ARCHIVE_20261011.json`, `scripts/verify_repo.py` |
| `267c26b` | `6725c9f` | 웹 포트 철회 직전 | `docs/WEB_PORT_TEST.md` |
| `02c2492` | `e19f0ed` | 웹 포트 철회 | — |
| `f886784` | `f0052bd` | 브라우저 내 변환 설계 | — |

## 이 저장소 밖에 남은 것

- **GitHub PR 참조:** 닫힌 PR #13~#21(F v0.2 포함)과 #22(웹 포트 런타임 포함)의
  `refs/pull/*/head`는 GitHub가 따로 보관하므로 강제 푸시로 지워지지 않습니다.
  예전 커밋 URL과 캐시도 마찬가지입니다. 완전히 지우려면 저장소 소유자가
  GitHub 지원팀에 요청해야 합니다.
- **포크:** `securityrimo/ss_srwf_kor_patch`는 2026-08-24에 만들어진 다른 계정의
  사본이라 이 저장소에서 정리할 수 없습니다. 웹 포트보다 먼저 만들어졌으므로
  wasm은 없지만, F v0.2 패치는 들어 있을 수 있습니다.
- **로컬 저장소:** 정리 전에 받은 로컬 저장소는 예전 히스토리를 그대로 갖고
  있습니다. 그 상태로 푸시하면 지운 파일이 되살아납니다. 다시 받거나 원격에
  맞춰 초기화해야 합니다.
