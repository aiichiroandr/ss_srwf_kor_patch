# F ALICE profile research (local implementation evidence, not acceptance)

This note records the implemented F editor path and its bounded local evidence. It
contains no ROM, save, BIOS, executable instruction, palette, or extracted game
asset bytes. Nothing here creates a release, publication, or acceptance claim.

## Supported local input and output scope

- The F path accepts only the latest F v0.5 `a` / `b` / `c` family and its
  verified editor provenance. Older F families are not a fallback input.
- The F ALICE writer additionally requires the verified Rev1 configuration. It
  fails closed if the inspected disc, native configuration, decoded data, FACE
  carrier, or paired scenario state is not the expected configuration.
- The implementation has exported, reopened, and re-inspected local F outputs
  for all three latest variants. This is editor/export evidence, not a new
  public artifact or a gameplay acceptance decision.
- The local browser/editor checks cover the authenticated export path, fresh
  inspection, unit/pilot/weapon previews, navigation, and a numeric edit/reset.
  They do not promise a complete playthrough.

## Rev1 unit and route contract

- The configuration has seven exact definitions for five owned hulls:
  S Gundam and its cruiser form, Ex-S Gundam and its G-cruiser form, plus
  Sirbine, Zwauss, and Blood Temple. The two cruiser entries are linked forms,
  not two additional ownership roots.
- Both Super and Real routes install the post-episode-1 first-clear grant.
  The grant is idempotent and checks either linked form before adding each
  ownership root.
- With ALICE enabled, the original reserved #399 path creates her as a
  subpilot and retains the separate SP initialization path. Local Real-route
  runtime inspection confirms distinct per-crew subpilot/SP rows; the target
  portrait and spell consumption/recovery remain unverified.
- With ALICE disabled, the same paired configuration grants only the five hulls;
  it does not create #399. An unlinked or incomplete configuration is a no-op,
  never a partial grant.
- Competing or inconsistent story edits are rejected. The writer does not
  silently discard a conflicting edit in order to continue.

## Save-editor catalog

- After verified Rev1 connection, regular F pilot and unit additions use the
  catalog re-inspected from the current edited ROM in memory. Ordinary additions
  do not require a manual BIN export/reopen; the matching edited BIN/CUE and
  edited same-game save must both be saved for gameplay.
- #399 is not admitted by a flag, copied object, or caller-supplied JSON. It is
  available only when the actual installed F reader returns its module-private
  authenticated state (the reader brand) and that state has ALICE registered
  with its crew enabled.
- There is no five-hull-plus-ALICE bundle button and no timing or progression UI
  in the save editor. The save editor adds one selected, authenticated catalog
  entry at a time.

## Local evidence and remaining limits

- The latest local exports/reopens cover ALICE-on for F v0.5a/b/c and the
  ALICE-off five-hull configuration. Fresh production inspectors accepted the
  corresponding local outputs. The existing Rev1 F to ALICE web-core
  export/reopen/repeat check also preserved the inspected development-disc
  identity.
- On local F v0.5a test BIN SHA-256
  `689d817b2938f370b97916b68ecd33db9821b217660c45c99c93817b175be6de`, a
  user cleared episode 1, reached the following intermission, boarded pilots,
  and completed episode 2 normally on the Real route (Hero77). The native
  internal save at episode-1 completion (money 5800) contained exactly roots
  348, 350, 354, 355, and 356 plus ALICE #399 at level 1. The cartridge save
  after episode 2 (money 33500) retained those five roots; S/Ex-S were boarded
  to normal pilots and 349/351 were not standalone hulls. A parent also loaded
  a byte-exact copy of that native internal episode-1 save into an empty
  Mednafen profile and observed the intermission state: money 5800, five roots,
  and #399 level 1/state 24/SP 25. The source save and profile were untouched.
- The latest native code/data inspection still found two configured primary
  pilots pointing to distinct #399 subpilot rows, with SP 35 at level 6 and SP
  41 at level 9. This supports per-crew independent SP setup, not repeated hull
  grants; it does not prove SP consumption/recovery or the target portrait.
- The episode-1 session used a user-requested enemy-HP=1 edit on a backed-up
  state; the ROM was not changed. It is assisted-combat evidence, not
  unmodified-difficulty validation. Static checks preserve the original packed
  scenario words except for the documented keep-unit bit and verify paired
  transform/selector behavior.
- Super-route natural first clear, ALICE target portrait and spell
  consumption/recovery, full branches, delayed VM state, long-play, and latest
  cartridge episode-2 native-load remain unverified. No new Final runtime run
  was performed; the earlier shared Final regression remains the applicable
  regression evidence.
