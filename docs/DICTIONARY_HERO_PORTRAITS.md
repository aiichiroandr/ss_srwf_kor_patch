# Hidden protagonist metadata in the Final person dictionary

The collection unlock exposes entries 304–319: eight protagonist pairs,
not sixteen independent ordinary pilot records. The original renderer treated
skill/name templates as ordinary records. Jess used FACE 0 (Matilda), names
and aliases retained katakana, and Hector's template produced the unrelated
work label “그레이트 마징가”.

Local exports correct the dictionary header only. Portraits use
`selectedDictionaryPilot | 1`. The eight existing accepted Korean full names
and aliases are supplied to the original name formatter. All sixteen entries
identify their debut work as “제4차 슈퍼로봇대전”. Ordinary pilots, including
Matilda, and the dynamic protagonist/partner entries 302/303 retain the
original behavior.

## Bounded composition

Four EXEC function-pointer literals at file offsets 0x8278C, 0x82790,
0x82824 and 0x8282C target authored DIC helpers. Original game instructions
and all TSR pointer tables on disk remain unchanged. The helpers use unused
space in DIC S1's existing 64 KiB buffer: work at 0x2029F200, names at
0x2029F240, approved text at 0x2029F400, scratch at 0x2029F580/588, and the
92-byte portrait/restore helper at 0x2029FF80. The end is 0x2029FFDC.

The original name formatter consumes temporarily redirected name cells.
Before the portrait call, both cells are restored and scratch ownership is
cleared. Native assertions compare the sixteen full-name and alias pointer
cells with their pre-render values after every entry. This does not rename
a pilot in gameplay or alter save data.

All original decoded S1 bytes and the other five compressed streams remain
exact. DIC grows from 79013 to 79673 bytes within the original 79872-byte
allocation. The private word-fill candidate remains within 100352 bytes.
Neither disc grows or relocates a file; only DIC's directory length changes.

Exact whole-allocation hashes, LBA, directory length and paired EXEC revision
identify original, earlier portrait-only, and complete metadata revisions.
Exports upgrade the earlier revision atomically. Inspection reverses only
these exact recipes before existing whole-image provenance checks; no
immutable mask is widened. Capacity composition preserves the incoming
revision, while export applies the latest matching DIC and EXEC together.
The battle preview restores these literals in its disposable compiled-host
input; the saved BIN retains the dictionary correction.

Public recipes cover accepted v0.3 only; private v0.4 recipes remain under
`editor-review/assets`. No accepted release payload or manifest is modified.

## Evidence and limits

Private ignored evidence: `build/dictionary-hero-metadata-20261101/`.

- `native-proof.json` and `index.html`: all 16 entries on v0.3 c and private
  v0.4 c, 32 captures, restored temporary pointers after every header, and
  byte-identical ordinary Matilda screenshots.
- `export-proof.json`: product-core save/reopen plus restoration of the exact
  source disc hash after normalizing dictionary/title corrections.
- Earlier portrait-only outputs reopen and upgrade through authenticated
  revision 1 recipes; unknown mixtures or mutations are rejected.
- Navigation uses isolated RAM registration flags and dictionary selection.
  Text, portraits and work labels come from saved disc content.
- The private native port adds the authored helpers and corresponding CRC
  metadata. This is native-port evidence, not hardware or long-play testing.
  A pre-existing edited BIN needs one new editor save to gain the correction.

## Revision 3: imported dictionary entries

The preceding size/layout description records revision 2. Revision 3 retains
its protagonist behavior, moves the portrait helper from FF80 to F500, and
adds gated imported-unit/ALICE entries. The pinned DIC window includes one
previously unreferenced CD sector; its exact preimage is restored on reset.
See [SRW4_DICTIONARY_ADDITIONS.md](SRW4_DICTIONARY_ADDITIONS.md) for current
lengths, independent enable conditions, original revision compatibility and
new native evidence. Original/1/2 recipes remain readable and reversible.
