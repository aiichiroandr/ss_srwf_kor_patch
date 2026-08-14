# SRWF Korean Patch Repository Rules

## Outcome lock

This repository is the public, static distribution surface for an accepted
SRWF Korean patch. It is not a continuation of an internal binary lineage and
it is not a candidate-testing area.

The current repository state is `HAS_ACCEPTED_RELEASE`. The default indexed
release is `srwf-f-20260815-v0-1-2`, and the superseded
`srwf-f-20260814-v0-1-1` hotfix remains indexed as historical evidence. Each is
backed by its own explicit, hash-pinned `ACCEPTED` receipt. The broken
`srwf-f-20260814-v0-1` artifact triplet is withdrawn, non-indexed, and retained
only as byte-immutable historical evidence. Do not reintroduce withdrawn
release rows or publish a new row without another complete acceptance chain.

## Publication gate

- Publish release rows with `state: "ACCEPTED"` only.
- Never publish `READY`, `CANDIDATE`, `TEST`, `RC`, frontier, latest, or other
  unaccepted states.
- A public patch payload must be a sparse `.srwfp` file in the documented v1
  format. Full images and aggregate undocumented deltas are forbidden.
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
  profile is the size and SHA-256 pinned in `manifest/releases.json`.
- Patch payloads must contain changed bytes plus bounded verification metadata,
  not a complete game image.
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
  mismatch, a malformed patch, a record preimage mismatch, or a target hash
  mismatch.

## Changes and validation

- Keep release index, release manifests, schemas, documentation, patch-engine
  constants, and tests in lockstep.
- All public URLs in manifests must be safe same-origin relative paths.
- Run `python3 scripts/verify_repo.py` and `npm test` before committing.
- Install the local hook with `git config core.hooksPath .githooks` if it is not
  already configured. The hook must remain network-free.
- Do not create a remote, push, publish GitHub Pages, or deploy unless the user
  separately asks for that external action.
