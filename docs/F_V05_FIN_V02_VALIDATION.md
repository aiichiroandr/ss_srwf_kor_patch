# F v0.5 / F Final v0.2 — local release evidence

Targets: registered F G103 a/b/c and FIN r116 a/b/c. User decision on 2026-09-28 explicitly requests all six local patch/download release rows. No remote deployment is authorized in this step.

## Evidence ceiling

ACCEPTED is the user's local distribution decision, not a new emulator acceptance claim. Static structure and exact registered-media identities are checked against the build records. Runtime consumption and visual-layout evidence are limited to the existing exact-code copied-state previews and registered composition evidence; they do not establish fresh coldboot, lane-a/b individual gameplay, every unit/route, long play, or CD-R operation. Build-side PENDING_USER_R7 cards are not rewritten.

Sources:
- F reports/g103_exact_family_20260928/DELIVERY.md, execution-result.json, web-verification.json, drive-upload.json; reports/G103_BUILD_RECORD_20260928.md and reports/g103_mc8_release_review_20260928.
- FIN reports/fin_r116_final_20260928/SCOPE.md and R5_COMPOSITION_REVIEW.md; reports/fin_r116_media_20260928/projection.json, DELIVERY.md, R5_REVIEW.md.

Export receipts in docs/srwf-*-20260928-*.build.json pin the exact targets and patch hashes and record patch reconstruction checks. The upstream F Git commit is a historical source anchor; the actual later registered media identity is the pinned SHA-256, not a claim that the working build tree was clean.

F retains equal-size v1. Its compressed patch exceeds the old 64 MiB cap; the supported patch-file cap is 80 MiB consistently across engine, schema and verifier. Existing body and record bounds remain unchanged. FIN uses the existing G541 v2 layout; displaced original audio is a COPY from the user's input, not literal payload.

All old accepted artifacts stay byte-identical. Withdrawn artifacts remain non-indexed. No ROM, CUE, save or emulator state is included in the public repository.

## Browser download verification

All six releases passed real local source-file selection, worker patching, BIN and CUE downloads in headless Edge at a 390px mobile viewport. Each downloaded BIN matched the manifest target size and SHA-256; CUE filenames and track counts matched. Both BGM tables rendered without horizontal page overflow. Desktop layout was captured at 1440px. Only the OS directory picker was supplied by the harness; actual source files and the production patch worker were used. See `G103_R116_BROWSER_DOWNLOAD_VERIFICATION.json` and `scripts/check_local_release_downloads.cjs`. This is browser distribution verification, not emulator gameplay verification.

Final local checks: `npm test` passed (110 JavaScript tests, 41 Python tests, then `python3 scripts/verify_repo.py`: 164 files passed). `git diff --check` passed. No remote push or deployment was performed.

## Remote publication authorization

After the local checks above passed, the user explicitly requested “원격배포도해”. This authorizes publication of the same six accepted artifacts to the existing main-branch GitHub Pages site. It does not expand the gameplay evidence ceiling.
