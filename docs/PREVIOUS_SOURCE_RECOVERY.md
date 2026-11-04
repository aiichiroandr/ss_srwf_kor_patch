# 이전 공개 소스 기반 복구

이 도구는 고정된 Git 소스 `267c26b91f051577b0bf90a13182fd770de6c249`로
복구용 정적 사이트를 만듭니다. 과거 실제 GitHub Pages artifact와 바이트가
같다는 증명은 아닙니다. 과거 workflow가 올린 artifact를 확보하지 못했으므로
**이전 소스 기반 복구용**으로만 표시합니다.

`scripts/previous-public-source.json`은 해당 소스의 488개 파일 전체를 크기와
SHA-256으로 고정합니다. 원본 Git blob 번호도 추적 정보로 기록합니다.
알려진 파일이 빠지거나 바뀌거나 새 파일이 생기면 실패합니다. checkout의
최상위 `.git` 관리 정보만 검사에서 제외하며 복사하지 않습니다.

공식 Pages upload의 숨김 파일 규칙(`.[^/]*`, 어느 경로 구성 요소든 적용)에
따라 `.gitattributes`, `.githooks/pre-commit`, `.gitignore`, `.nojekyll` 4개를
산출물에서 제외합니다. 소스 파일 자체는 지우지 않습니다. 결과 payload는
**484개 / 946,595,034바이트**입니다. 1,000,000,000바이트를 넘으면 실패합니다.

## 준비와 확인

저장소 최상위에서 실행합니다. `build/recovery-source`는 위 commit을 별도로
checkout한 디렉터리여야 합니다. 출력과 lock은 존재하지 않는 전용 경로를
쓰며 lock은 payload 밖에 둡니다.

```sh
python3 scripts/prepare_recovery_site.py \
  --source build/recovery-source \
  --out build/recovery-payload \
  --lock-output build/recovery-payload-lock.json
```

macOS에서는 APFS clone을 먼저 시도합니다. 필요하면 `--copy copy`로 실제
복사를 선택할 수 있습니다. clone·복사 모두 산출물 전체의 파일 목록과
해시를 다시 검사합니다. 출력 경로가 이미 있으면 내용을 고치거나 지우지
않고 실패합니다. 실패 중 만들어진 부분 출력도 자동 삭제하지 않으며
승인된 산출물로 간주하지 않습니다.

대용량 복사 없이 고정 소스와 예상 payload lock만 확인하려면 다음을 씁니다.
이 명령은 실제 payload를 만들거나 확인한 것이 아닙니다.

```sh
python3 scripts/prepare_recovery_site.py \
  --source build/recovery-source --verify-only \
  --lock-output build/recovery-expected-lock.json
```

lock의 `files`는 `{path, bytes, sha256}` 형태입니다. JSON은 UTF-8, key 정렬,
공백 없는 구분자, 마지막 newline으로 결정적으로 기록합니다. workflow의
`expectedSiteLockSha256`와 생성한 lock의 SHA-256이 같아야 합니다.
이 고정 소스와 현재 도구의 예상 lock SHA-256은
`54474c050b0fbdf3455f0d4ef2efbd9b8fe8c2634d2bd67fe4157263754e730c`입니다.
그 다음 공식 `upload-pages-artifact`가 만든 **실제 tar의 파일 목록·크기·해시**를
이 lock과 검증한 뒤에만 게시 대상으로 사용할 수 있습니다. 폴더 검사 성공이
공식 tar 검사나 배포 성공을 대신하지 않습니다.

복구 workflow는 현재 workflow commit 확인값과 예상 lock 해시를 사람이
명시하는 manual dispatch로 제한합니다. 다른 source commit으로 바꾸려면
config와 도구의 고정 fingerprint를 함께 수동 검토해야 합니다. 임의 `--ref`,
임의 config, 자동 Git fetch 또는 원격 게시 기능은 제공하지 않습니다.

## 로컬 검증

```sh
python3 -B tests/test_recovery_site.py -v
node scripts/run-node-tests.cjs tests/pages-recovery.test.mjs
```

테스트는 작은 합성 파일로 새 파일·변조·누락·심볼릭 링크·payload 하드링크·
출력 경로 재사용·복사 도중 원본 변경을 거부하는지 확인합니다. 게임 원본,
세이브, 추출 리소스는 쓰지 않습니다.
