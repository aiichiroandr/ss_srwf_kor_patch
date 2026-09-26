# SRWF Korean Patch Repository Rules

## Outcome lock

This repository is the public, static distribution surface for an accepted
SRWF Korean patch. It is not a continuation of an internal binary lineage and
it is not a candidate-testing area.

The current repository state is `HAS_ACCEPTED_RELEASE`. The default indexed
release is `srwf-f-20260915-v0-4-a`, with b/c font variants. Its acceptance evidence
ceiling is documented in `docs/F_V04_VALIDATION.md`; b/c individual coldboots,
save/load, long-play and CD-R tests are not claimed. The prior v0.3 remains
indexed, and the superseded
`srwf-f-20260814-v0-1-1` hotfix remains indexed as historical evidence.
`srwf-f-20260821-v0-2` was withdrawn on 2026-08-23: its payload violated the
public v1 canonical form by carrying 1,873,210 bytes inside records that match
the source, so the browser rejects it with `NON_DIFFERING_BYTE`. Its three
artifacts stay byte-immutable in the withdrawal allowlist and must never be
re-indexed. Each is
backed by its own explicit, hash-pinned `ACCEPTED` receipt. The F Final public
trial `srwf-final-20260814-v0-1` is also indexed and is limited to its documented
cold-boot and demo-route evidence; it does not claim long-play or full-route
completion. The broken
`srwf-f-20260814-v0-1` artifact triplet is withdrawn, non-indexed, and retained
only as byte-immutable historical evidence. Do not reintroduce withdrawn
release rows or publish a new row without another complete acceptance chain.

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
