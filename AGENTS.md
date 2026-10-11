# SRWF Korean Patch Repository Rules

## Outcome lock

This repository is the public, static distribution surface for an accepted
SRWF Korean patch. It is not a continuation of an internal binary lineage and
it is not a candidate-testing area.

The current repository state is `HAS_ACCEPTED_RELEASE`. Keep the latest and
immediately preceding accepted version family for each game, including all
a/b/c font variants. The current retained families are F v0.5/v0.4 and
F Final v0.3/v0.2. Defaults remain `srwf-f-20260928-v0-5-a` and
`srwf-final-20261005-v0-3-c`.

F G103 v0.5 and Final r116 v0.2 were accepted in the user's 2026-09-28
instruction and subsequently authorized for remote publication. Their evidence
ceiling is `docs/F_V05_FIN_V02_VALIDATION.md`; fresh user coldboot, individual
a/b gameplay, long-play and CD-R are not claimed. F v0.4 evidence remains
bounded by `docs/F_V04_VALIDATION.md`; individual b/c coldboots, save/load,
long-play and CD-R are not claimed.

Final v0.3 a DOS thin / b Galmuri11 / c Mona12 was explicitly approved on
2026-10-05. Its a/b evidence is 18 actual display cases and per-font no-state
boot; audio and user R7 remain unverified. Evidence and limitations are in
`docs/FIN-v0.3-patch-notes.md` and
`docs/srwf-final-20261005-v0-3-c.build.json`. Final c target SHA is
`0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d`.

The user authorized archival and removal of older patch families on 2026-10-11.
Their exact payloads, manifests and receipts were backed up to private Google
Drive and downloaded again to verify full archive and member hashes before
removal. `docs/RELEASE_ARCHIVE_20261011.json` is the hash-pinned archive ledger;
it does not constitute a release index or new acceptance. Historical patch
notes and validation documents may remain, but archived artifacts and release
rows must not be reintroduced. Future retention changes require the same
verified-backup procedure and coordinated ledger, validator and test updates.

Withdrawal remains permanent. F `srwf-f-20260821-v0-2` violated v1 canonical
form by carrying 1,873,210 non-differing bytes (`NON_DIFFERING_BYTE`); the broken
F `srwf-f-20260814-v0-1` and historical Final trial
`srwf-final-20260814-v0-1` also remain non-indexed. Their original byte pins and
withdrawal status are preserved in the verifier and archive ledger. Do not
publish a new release row without another complete acceptance chain.

## Publication gate

- Publish release rows with `state: "ACCEPTED"` only.
- Never publish `READY`, `CANDIDATE`, `TEST`, `RC`, frontier, latest, or other
  unaccepted states.
- A public patch payload must be a sparse `.srwfp` file in the documented v1
  format, or — only when the accepted target image is larger than the pinned
  stock image — in the documented v2 format (`docs/PATCH_FORMAT_V2.md`). v1
  rules are unchanged, and an equal-size target must stay v1. Full images and
  aggregate undocumented deltas are forbidden.
- Do not add a `.srwfp` payload before its explicit acceptance receipt, release
  manifest, source/target hashes, and payload hash all agree.
- The accepted receipt is a release decision. A build receipt, identity pass,
  static pass, isolated runtime sample, or candidate registration is not a
  substitute.
- Do not copy from mutable candidate outputs or prior working images. The
  reviewed build repository remains the source of release evidence; this
  repository receives only the accepted public artifact set.

## Binary and legal boundary

- Never commit ROMs, disc or cartridge images, extracted proprietary game
  files, CUE sheets, full target images, save data, save states, emulator
  caches, generated discs, or build directories.
- Users must provide their own exact stock image. The only supported stock
  profiles are the game-specific sizes and SHA-256 values pinned in
  `manifest/releases.json`.
- An alternate input representation is not a stock profile or release. It may
  be accepted only when its identity and a deterministic, length-preserving
  transform are pinned in the browser source normalizer, every discarded byte
  is verified, and the transform yields a manifest-pinned canonical stock
  profile whose whole-image SHA-256 is verified before patching.
- Patch payloads must contain changed bytes plus bounded verification metadata
  (and, in v2 only, references to ranges of the user's own source), not a
  complete game image.
- In v2, original bytes that move unchanged (for example a displaced audio
  track) must be referenced from the user's own source with COPY records and
  must never be carried as literal bytes.
- Keep notices and user-facing copy clear that this is an unofficial fan
  project and that no game content is distributed.

## Static-site boundary

- The site must remain static and self-contained: HTML, CSS, JavaScript, and
  same-origin repository assets only.
- Do not add CDNs, analytics, trackers, remote fonts, telemetry, accounts,
  servers, upload endpoints, or network writes.
- The selected stock image is processed locally in the browser. Never upload
  it or retain it outside the user's browser session.
- Fail closed on an empty release index, an unknown stock hash, a manifest
  mismatch, a malformed patch, a record preimage mismatch, a COPY source
  mismatch, an extension-coverage error, or a target hash mismatch.

## Changes and validation

- Keep release index, release manifests, schemas, documentation, patch-engine
  constants, and tests in lockstep.
- All public URLs in manifests must be safe same-origin relative paths.
- Run `python3 scripts/verify_repo.py` and `npm test` before committing.
- Install the local hook with `git config core.hooksPath .githooks` if it is not
  already configured. The hook must remain network-free.
- Do not create a remote, push, publish GitHub Pages, or deploy unless the user
  separately asks for that external action.

## Editor investigation workflow

For F/F Final editor or CD-ROM reverse-engineering work, read
`docs/EDITOR_REVERSE_ENGINEERING_GUIDE.md` before investigating new offsets.
Luna-family models MUST read it at task start and consult its stuck-workflow
section after two repeated failures or ten minutes without new evidence.
Reuse existing parsers and analysis assets; distinguish observations from
hypotheses. Modify runtime layout in `assets/editor-runtime.css` instead of
adding competing overrides. Use `scripts/editor-probe.cjs` for bounded local
browser captures where applicable; its captures do not establish export or
binary-write correctness. This guidance does not authorize deployment or
change the release/publication restrictions above.

## Local editor release synchronization (2026-10-06)

The local editor now uses the already accepted public F v0.5 G103 a/b/c and F Final v0.3 a/b/c artifact sets from the published site checkout, including their pinned manifests and acceptance receipts. The current local index defaults are F `srwf-f-20260928-v0-5-a` and Final `srwf-final-20261005-v0-3-c`. This synchronization is not a new release acceptance or authorization to publish editor code. All binary and publication boundaries above continue to apply. The editor permits exact stock input (prepared locally with the current default accepted release family) or images derived from that latest family only, including a/b/c fonts. Older accepted releases and their personal edits must be rejected. Personal editor images require game identity, full hash, bounded provenance and data-structure checks, and must be explicitly distinguished from an ACCEPTED release.

## Public editor beta (2026-10-11)

The user explicitly authorized deployment of the existing browser editor and its bounded scenario beta. New event/reinforcement creation, Final region conditions, and history conditions remain disabled. This authorization does not accept new patch releases or widen existing release evidence.
