# 에디터 출력 안전 검사

`preflightEditedImage`와 실제 `exportEditedImage`는 같은 조합 경로에서 안전 검사를 한다. preflight는 압축·공간 계산까지만 하고 Blob/섹터/다운로드를 만들지 않는다.

## 적용 경계

- 요청 단계는 인증 세션 토큰, dense 목록, 중복/정수가 아닌 레코드 번호, 현재 root27/28/29 표 밖의 참조와 무기 복제 원본을 거부한다.
- 실제 조합 단계는 복원·기체/파일럿/무기 필드·무기 복제·기체 무장 추가·inline/compact 복구 뒤의 **losslessly expanded effective TSR**를 `splitRootSegments`, `dataRecordOffsets`, 기존 `weaponsOfUnit`와 행 reader로 다시 읽는다. 새/이전에 닫혀 있던 기체 무기 목록은 종료자·정확한 길이·출력 무기 표 참조를 모두 유지해야 하며, 바뀐 파일럿 습득/능력 꼬리도 닫혀 있어야 한다.
- 이 검사는 record 0 placeholder, 기존 pointer alias, hero 302/303/304..319 및 312..319 alias, Final의 짧은 이름표를 오류로 보지 않는다. 이미 인증된 오래된 불완전 행은 no-op 때문에 새로 거부하지 않는다. 따라서 알려진 구조 손상 방지이지 모든 게임 의미/충돌의 증명은 아니다.
- TSR decoded/staging 좌표와 ISO 물리 할당 좌표는 섞지 않는다. TSR slot/growth는 기존 `measureTsrSlot`/`requireTsrExportSize`가 검사한다. 새 composition 검사는 TSR, FACE, C_ROBOT, KOM/map, handpoint/motion/beam, SCEDATA/MAP_MAP 계획의 실제 file descriptor와 plan bytes 길이를 확인하고, ISO 전체 디렉터리의 다른 live extent를 덮는 확장/부분 overlap을 출력 전에 거부한다. 정확히 같은 alias allocation은 하나의 최종 owner로만 허용한다.
- 각 native writer의 기존 read-back은 그대로 유지한다. 모든 TSR/collection/critical/dictionary/title/save-compat/start-roster/campaign/Fv2 단계 뒤에는 최종 candidate BIN에서 TSR.BIN directory, MODE1 checksums, 압축 해제와 effective table 구조를 다시 읽는다. inspector와 공유하는 `normalizeStoredTsrLayout`이 inline auxiliary·글자·무기명·복제 기록·compact/scattered 저장을 논리 데이터로 복원한다. Fv2는 최종 writer의 예상 상태와 실제 TSR/FACE/IP/EXEC도 대조한다. 이 read-back은 caller hash/flag에 신뢰를 부여하지 않으며 게임 실행 검증도 아니다.

## 결과와 UI

실패는 source/session/request 또는 이전 완료 download를 바꾸지 않는다. worker는 실패 결과를 cache하지 않고 코드·제한된 상세값을 UI에 전달한다. 시나리오/지도/대사 실제 변경 요청에는 구조 검사와 별개로 진행 분기·장기 플레이 확인 경고를 보낸다. 기존 native/clone 설정을 그대로 echo한 것만으로 전투·변형 경고를 내지 않는다.

`bytesChanged`는 여러 writer가 같은 raw sector를 다시 쓸 수 있는 legacy writer-work accounting이다. unique changed-byte metric이 아니므로 최종 Blob 크기로 상한 검사를 하지 않는다. 최종 물리 geometry는 raw 2352-byte sector alignment와 각 owner의 실제 extent/format guard로 검사한다; campaign/Fv2의 허용 크기·reversion은 그 owner가 결정한다.

## 회귀 근거와 한계

`tests/editor-export-safety-production.test.mjs`는 authenticated synthetic ISO를 inspector로 열어 정상 편집 preflight/export를 모두 통과시키고, effective weapon-list corruption을 두 경로가 모두 거부하며, 모든 writer 뒤 checksum corruption을 final read-back이 거부함을 확인한다. `tests/editor-export.test.mjs`는 token-preserving compression, zero-tail/slot behavior, directory/checksum read-back을 계속 다룬다.

위 자동 검사는 합성 데이터 검사다. 실제 F v0.5 a 및 완결편 v0.3 c 개인 Rev1/ALICE 이미지의 HP+1 preflight·BIN/CUE 다운로드·독립 재열기 표본은 `MULTI_UNIT_EXPORT_VALIDATION.md`에 별도로 기록했다. 모든 a/b/c font variants, native game behavior, battle/transform/combination semantics, branch progression과 crash prevention 전체를 입증하지 않는다.
