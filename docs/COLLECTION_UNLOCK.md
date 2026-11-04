# Local FIN collection unlock (2026-10-24)

Local source implementation; no deployment or new accepted ROM release.

The ROM editor has an opt-in **기타 → 도감·영상 해금** setting in a peer category tab, without another disclosure popup. The category is shown for supported Final images only. It is OFF for an
unmodified accepted image, round-trips in JSON under `collections`, persists
in an exported personal BIN, and can be restored to the imported setting.
Only FIN is exposed; F has not been mapped.

## Native evidence (repo)

Accepted Final v0.3c source SHA:
`0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d`.
EXEC `0`: LBA 24, 758232 bytes, load address 06004000.

`0601BF80` reads a collection bit: base 060C6CE0, offsets table
060B8C98 = [0, 511, 991]. Consumers use categories 0 (character),
1 (robot), 2 (demo/media). Character/robot lists and percentages are built
at 06085B54 / 06085C28. Demo list tests category 2 at 06086C1A.
Seven getter pointer literals were found: 0601BE3C, 060469CC, 06047390,
06085C18, 06085CE0, 060861F0, 06086D80.

Overlay: 0601BFB4 `6083` (mov r8,r0) -> `E001` (mov #1,r0).
The 72-byte getter and literal pool must match exactly, except this exact
original/enabled instruction. Image reopening normalizes only a discovered
exact overlay before the existing immutable-disc hash check; no masks widen.
CD sector EDC/ECC are rewritten by the existing writer. Unknown code fails closed.

This is not a promise that saved registration stays unchanged. The native
alias routine at 0601BDE0 calls the getter and then the setter at 0601BE16.
Consequently, playing/saving with this option may retain alias registrations;
disabling the option does not erase an already saved bitmap. UI explains this.

## Bounded observations

A headless run of the existing webport recompiler engine, with ephemeral backup
memory (`--save -`), failed to enter an empty character dictionary before the
RAM change. Setting the 128-byte collection bitmap to FF allowed:
- Character dictionary: 100%, 12 pages; Mash's untranslated description visible.
- Robot dictionary: 100%, 14 pages; Gundam's untranslated description visible.
- Demo selection: 3 pages listed. Individual demo playback and karaoke are not verified.

The RAM fill is a diagnostic, not the exported ROM implementation. The latter
was checked statically and through the production editor export/reopen/reset
in RAM. The restored full-image SHA equals the accepted source SHA. No BIN was
written by that check. This is not user runtime acceptance or proof of all routes.

Capture artifacts and input replay remain outside this public repository.
