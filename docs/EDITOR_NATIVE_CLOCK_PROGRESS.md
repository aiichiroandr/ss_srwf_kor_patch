# Native battle clock — local implementation progress

`assets/editor-battle-clock.mjs` implements the observed actor scheduler in
integer ticks. It is not connected to the public frame gallery yet. The gallery
still uses its explicitly labelled 250 ms cadence; that cadence is not game
timing, and the full attack playback requirement is not complete.

The accepted executables have byte-identical instruction bodies for the
following contracts (addresses are runtime SH-2 addresses, not disc offsets):

| Contract | F | Final | Compared instruction bytes |
| --- | --- | --- | --- |
| Primary dispatch and delay | 0603271C | 060379A0 | 114 |
| Secondary dispatch | 06032798 | 06037A1C | 294 |
| C8 secondary installation | 06037F88 | 0603D254 | 58 |
| F8 counted backward/forward branch | 06038558 | 0603D824 | 86 |
| F9 relative jump | 060385B0 | 0603D87C | 34 |
| FA45 unit-specific anchor | 06033D70 | 06038FFC | 250 |
| FD palette setup | 0603869C | 0603D96C | 84 |
| C9 motion setup and yield | 06036C40 | 0603BF0C | 296 |

Primary delay byte `d` writes `(d-1)&255`, advances the cursor once, and yields.
Subsequent scheduler ticks decrement a nonzero counter without executing that
track. Consequently 1 holds for one tick and 0 holds for 256 ticks. A secondary
frame instead copies its period byte directly to its own delay counter. Its
hold is period+1 ticks. Primary executes before secondary in each actor; actors
are visited in increasing slot order. Neither delay convention is a fixed
250 ms interval.

F5 changes the shared global flag word. F6 keeps the same instruction cursor
while its condition is unsatisfied and sets delay=1 before yielding. Thus a
blocked flag check retries after the intervening decrement tick. F8 uses the
actor's shared loop-counter byte; it does not restart an independent loop
counter every time a gallery picture is visited. F9 jumps relative to its
operand cell. C8 installs its secondary cursor relative to its operand cell,
with an independent period. Secondary F8 ORs the bank bits into the existing
selector. Unsupported primary commands remain explicit frontiers.

The F beam sequence 16 timer/jump tail first selects picture4, then repeats
pictures5 and6. A three-picture slideshow wrongly includes picture4 in every
cycle. FA45 now reads the actual BTSR cell19 anchor table: 32 self-relative
BE16 cells followed by four-byte unit/offset rows, with FFFF as the default
unit. The direction bits determine horizontal sign, and actor flag bit3
determines its native fixed-point scale. Missing scene context remains a
frontier. FD records the asynchronous palette setup without inventing pixel
changes. C9 follows the native signed divider, remainder, yield latch and
movement/timer update order, including zero-duration division returning zero.

A private probe ran the complete sequence 16 from each user's accepted F/Final
disc for 12 scheduler ticks with unit1's actual anchor table. Both produced
`4,5,6,5,6,5,6,5,6,5,6,5`, no frontier, and the same anchor displacement.
Sequence18 starts with a global flag wait. Full playback still requires the
other scene state operations, main-VM timing, palette rendering, actor
creation/assignment, actual scene context, and measurement of scheduler ticks
against video frames. No milliseconds conversion is asserted here.

The clock also processes sequence 18's F4 sound cue, FABA presentation setup,
and FF removal. With its initial flag 8 explicitly satisfied in a private
probe, both game programs emit selectors 0,1,2,3 and then remove the actor on
the next tick, setting the native completion flags 16/17. This is a conditional
track test; it does not prove when the main program releases flag 8. A
cooperative 128-slot scheduler now preserves native slot order and shared
flags. Presentation and palette descriptors are retained; their pixel/audio
rendering is not implemented yet.

DF and F3 now retain the native global color state without consuming an
extra tick. DF's instruction body is identical at F 06038794 and Final
0603DA64; it passes channels 6F and RGB offsets 0/+255/-255 to the two VDP
offset banks. F3 is identical at F 06038804 and Final 0603DAD4 and writes
the operand byte and its wrapped negation to the two scene color bytes.
FA39 is identical at F 06034744 and Final 060399D0. Direction bit6 chooses
one of two combatant status bytes; that byte's bit5 enables the signed
operand-relative branch. Missing status context remains a frontier.

A private actual-BTSR probe executes common sequence9 in both games. With
the selected status bit5 clear it removes the actor immediately; with bit5
set it executes twelve color ticks `12,8,14,15,15,14,12,10,7,4,0,0` and
removes it on tick13. Both tracks finish without a frontier. This confirms
the conditional instruction timeline, not the status producer, displayed
pixel result, whole attack timing, or connection to the browser gallery.
The actor/main clock suites currently pass 62 focused tests.

`assets/editor-battle-main-clock.mjs` now separates the main VM's 32-bit wait
counter from actor delay bytes. Identical F 06017AB0 / Final 06017F44 bodies
initialize an empty counter from the BE16 operand, decrement it immediately,
and return D002 on completion. Completion advances the cursor and yields;
it does not execute the following command in the same invocation. Operand0
wraps to FFFFFFFF. Relative calls/returns and explicit common-program calls
retain this context across yields. Camera and other scene commands still
stop with a frontier; the main clock is not connected to the browser yet.

An actual all-entry beam probe exposed a separate boundary error: sequence
cells are entry points, not execution-length fields. F entry7 at1106 contains
a six-tick wait and falls through to entry8 at1107; Final uses1114/1115.
The actor sequence factory now validates the BE16 entry table and retains
the whole actor-code region for execution, allowing this native fallthrough
and backward jumps. The nearest following entry is retained as metadata,
not an execution barrier. All48 cells in each actual beam record validate;
entry7 reaches entry8's ED command after six ticks in both games.

CC/CD continuous signed velocity, D0..D3's render-mode byte, and ED parent-chain
detachment are now implemented. Instruction bodies match between F/Final:
CC 06038000/0603D2CC (78 bytes), CD 06038050/0603D31C (56), D0..D3
06038120/0603D3EC (20), ED 060382B4/0603D580 (126). CC uses the actor's
bit2 facing, rather than the global camera direction. CC/CD clear their
own timer and the movement-disable bit, then continue without a yield.
ED first sums the parent chain, copies root flag bit5, clears link bit4,
and resets the parent index. Missing parents or cycles cannot silently detach.

With an explicitly unlinked initial actor, actual entry7 in each beam record
now runs through entry8 and completes without a frontier in15 ticks. Selectors
are `0,0,0,0,0,0,256,256,257,257,257,258,258,259,259`; final displacement is
(-64,-128). The last tick stops the track and retains its final sprite. This
proves this conditional track execution, not its actual scene start time or
parent state. Native main assignment, camera and other beam tracks still
need integration before full attack playback can be claimed.

FA44 signed word displacement now follows the byte-identical instruction
bodies at F 06033D0C / Final 06038F98 (96 bytes). Its horizontal sign uses
the equality of direction bits6/7; its depth displacement is signed and
unscaled. CB at F 06037FC4 / Final 0603D290 (56 identical bytes) advances
once and yields with delay=max(xTimer,depthTimer), replacing zero with one.
It does not reuse the ordinary delay-byte subtraction rule. Actual beam
tracks5,7,9 complete under explicit facing and unlinked initial state in
17,15,23 ticks respectively in both games. Other track frontiers and scene
context remain open.

Source initializers also separate the pools used in the scenario common-call
investigation: F map state starts at20200000, map-unit records at20201AA0,
and the 128×76-byte graphics actor pool at20223000..20225600. Final's graphics
pool starts at20216000 via pointer cell060B8578. These are executable initial
pointer values, not an assertion that runtime replacement is impossible.
They narrow the alias proof for the common17 tag14 graphics calls without
authorizing scenario map writes yet.

FA2C/2D now copy the live slot1/slot4 selector, low two flag bits, and the
opaque render word at actor+58. Their instruction bodies match at F
06033744/06033798 and Final060389D0/06038A24 (76/78 bytes). They do not infer
a picture from a unit record or overwrite unrelated flags. The cooperative
scheduler resolves those live slots, including an earlier slot's selector
change in the same tick. Missing source actors remain explicit frontiers.

The complete queue-shift helper body at F06072C40 and Final060797C0 is
byte-identical for352 instruction bytes and contains no subroutine calls.
Its fixed queue, counter, presentation bytes and indirect sideband addresses
were enumerated separately from its unresolved symbolic loop iteration.
Under an explicit queue-count<=73 and retained-pointer precondition, the
queue/sideband destinations are disjoint from the map-number byte and map
pointer cell in both games. This is a conditional alias check, not proof of
the count producer, actual allocation capacity, all pending operation tags,
or the entire E1.11 call. No additional scenario placements are authorized.

A new private ordinary-controller run resumed the user's own product image
without RAM writes and reached an enemy counterattack-selection screen in a
later F scenario. Captures observed map-number32 at all recorded consumers.
The queue helper ran with pending count1; after its head shift, 81.01 consumed
tag3, not tag14. Therefore ordinary-constructor tag14 alone cannot close the
whole common17 call. Tag3's two dispatch cells both lead to41802, whose call
to36001 has a closed cursor path through two 6F commands, a28 sprite creation,
a24 yield, a one-tick05 wait and04 return. Native side effects of those
remaining commands are still required before granting map writes. The run
terminated normally (2405 video frames); this observation is neither F1 nor
Final coverage and does not prove universal map preservation.

Main24/25/26 now share the actor F5/F6 global flag word:24 waits for a set
bit, clears it and continues in the same invocation;25 sets it and26 clears
it without yielding. All use the operand's low five bits. The byte-identical
handler bodies are F060196C4/06019710/0601974C and Final06019B9C/06019BE8/
06019C24 (62/46/48 instruction bytes). The shift helper is a left shift,
not a division. Source execution covers every masked bit index with symbolic
flag state:128 terminal paths per game, only the fixed flag-word store,
no remaining opaque calls or indirect writes. Final's old symbolic reader
has a060A0000 constant-code cutoff; the private proof admits only its pinned
32-byte immutable shift jump table above that cutoff, equal to F's table.

The writable scenario reader admits these three map-preserving commands.
Both format tests edit coordinates, reparse the archive, verify all other
decoded bytes and masks, then reset. Combined focused checks pass51 tests.
A new authenticated whole-input audit still reports52 F bodies/1737 rows
(575 editable) and103 Final bodies/3105 rows (1094 editable): zero new actual
rows. Earlier common-call frontiers remain; these command contracts do not
stand in for E1.11 closure, coordinate BIN roundtrip or full-scene playback.

Main2B/2C now assign resolved sequences to the actual live slots1/4, retaining
their positions, selectors and unrelated flags and applying the operand's
start-delay byte. The handlers match at F06019D7C/06019DC0 and
Final0601A254/0601A298 (54 instruction bytes each). Their assignment helper
matches at F0603C09C / Final06041498 (188 instruction bytes).

That helper resets primary delay, motion and the secondary delay/period, but
retains the secondary pointer. The clock now retains the secondary's original
source buffer independently of the new primary buffer. Cross-record tests
verify that an old secondary selects its own next picture after reassignment,
even after the new primary selects a different bank. Invalid records leave
the actor unchanged, and assigning a removed slot is not treated as allocation.
Full scene allocation, assignment variants2A/2D/2E/2F/32/33 and actual scene
source/context resolution remain open; the clocks are still not the browser's
attack player.

Main32/33 now dispatch their native allocation request1/4 before assigning
the resolved sequence. F0601A3D4/0601A420 instruction bodies match
Final0601A8AC/0601A8F8 for60 bytes. A returned null skips assignment and
continues, as the source handler does; a missing allocation implementation
remains a frontier. Retained positions/selectors are preserved, rather than
inventing fresh zeroed records. This implements the command contract, not
the allocation pool itself. The real pool and2A/2D/2E/2F variants remain open.

The allocation function at F0603BD68 / Final06041164 has172 identical
instruction bytes. A new retained-record pool models its actual slot search,
byte0 store and flag1-bit7 allocation marking without clearing positions/selectors.
It requires128 distinct supplied records. Outside presentation mode1, bit7
requests a0..127 free-slot search and exhaustion returns null. Mode1 bit6
uses the literal32..64 search and65 fallback; bit7 alone still requests its
fixed masked slot. This models allocation, not native pool initialization or
the full removal/child-cleanup procedure.

A private combined fragment now uses that allocator, main32 assignment and
main24 completion wait with each actual beam sequence18. With explicit
synthetic retained records, initial flag8 and enabled palette updates, both
games select0,1,2,3, remove the track, and let the main fragment finish on its
sixth invocation. Completion flag16 is consumed and flag17 remains. This is
a conditional source-fragment test with an explicit caller order, not the
disc's whole main program, actual video timing or browser playback.

FF removal now applies the modeled fields of the real range-reset helper,
F0603BE20 / Final0604121C (384 identical instruction bytes), before the
FF handler's final delay1 write. The FF bodies match at F06038748 /
Final0603DA18 (58 bytes). Reset clears flag1 bit7, selector, positions,
motion, primary/secondary cursors and timers, preserves only flag2 bits2/3,
sets parent byteFF, and retains the exact opaque defaults at+12/+54/+64.
The retained pool can reuse that slot without leftover frame/velocity state.

Both actual beam sequence18 programs ran three consecutive conditional
fragments through main25/32/24 and the retained pool. Every cycle selected
0,1,2,3 and completed in six explicit main/actor invocations. The baseline
used the source-reset model, rather than arbitrary retained values. This
still does not establish the complete attack's startup, camera, palette
pixels, main/actor caller order or video cadence. Browser integration and
the actual scenario coordinate/BIN/UI requirements remain unfinished.

The unchanged accepted public F executable and the private production output's
`0` file both have SHA-256
`308fe51501cd70091fe1a9983101d6cd98b9fdc7d8857e4bac9e2bff3e9974f1`,
matching the executable used for these consumers. A real production-output
game run reached an arrival cutscene and executed the actual actor scheduler.
The active primary consumer was observed 34 times in video frames 1274..1308,
with frame 1306 absent. This is evidence of live scheduler execution, not a
claim of universal one-tick-per-video-frame or of BeamSaber combat playback.

Layout validation separately selected all seven authenticated F beam pictures
at 1440×1000, 390×844 and 320×568. The stage retained respectively 176, 128 and
62 CSS pixels of height across every picture, with no horizontal overflow or
browser errors. This proves stable layout only, not attack timeline accuracy.

The scenario investigation identified the actual F map-number byte as
`*(u32 at 060B2090)+4` through the C4.00 consumer. Common program17 is the TSR
root0 nested family2 entry17, not outer root2 entry17. Its unit-selection
branch includes a dynamic return/choice table. Its complete map side effects
have not been closed; the default-map display projection therefore still does
not authorize coordinate writes after that call. Initial enemy and
reinforcement binding, BIN roundtrip and all-scenario correctness remain open.

The writable scenario reader now admits 17.02/03/04 and 54.00 after independent
symbolic handler execution in both executables, with symbolic operands and
the dispatch subcommand fixed. Every terminal path returned normally; there
were no opaque calls or indirect stores. Stores were confined to presentation
work: F 060C05D1..060C05D4, 060C0B61..64, 060C1439..3C and 060C33B4..B5;
Final corresponding ranges 060C6A41..44, 060C6FD1..D4, 060C78A9..AC and
060C9824..25. These commands preserve map state. Synthetic source-archive
tests edit coordinates, reparse exports, reset them, and compare all decoded
bytes in both formats without changing write masks for other fields.

A fresh actual-source audit still finds F 52 bodies/1737 placements with 575
editable, and Final 103 bodies/3105 placements with 1094 editable. This narrow
parser addition grants **zero new actual-source placements**, because earlier
common-call frontiers still block the relevant paths. It is preparatory work,
not a resolution of F 1 or complete F/Final coordinate editing. The next map
task must close those common-call effects rather than add more unrelated
instruction widths or infer the default map after a call.

Further source reconciliation identifies F 060CAF30 as the shared eight-byte
pending-operation queue, not a character-name or menu-selection table.
Its head's operation tag is at +6; 81.01 reads its low byte at 060CAF37.
The independently inspected ordinary unit constructor and CA01 registration
call sites append tag14. In common17, both relative cells for tag14 at
41158/41160 lead to 41783. That narrows a relevant appearance-processing path;
it does not prove that all operations pending before E1.11 have tag14.

The tag14 handler begins with 85.1A. Its actual helper at F 06057E3C reads
060C071C and returns `5001 | (((byte >>> 6) & 2) + 1)`; it has no stores or
calls. The two operand-relative destinations are 41794 and 41789. The latter
executes 1D.01 and calls 35898 before joining 41794's 91.00 operation. These
callee effects still need closure before map preservation can be asserted.
The callee at 35898 has a closed five-instruction path: 81.0E, 17.02,
28, 05 (ten-tick wait), and 04 (return). Concrete execution of its 81.0E
consumer writes only the fixed presentation byte 060C05D2. Its 28 consumer
calls 0603BD68 and 0603BFB0 and stores through their returned actor pointer;
those indirect writes still require an actor-pool ownership proof. The joining
91.00 consumer calls 0605CAFC and writes through a unit/actor-derived pointer.
Thus a known command length is insufficient to call this entire path
map-preserving; these are the next specific callee/alias contracts to inspect.

The physical root0 bounds are [164,73123) in F and [164,79168) in Final,
obtained from the next distinct outer-root start. Family2 entry0 points back
to root0 itself in both games. Its first pointer therefore cannot establish
the family table length. Scanning family2 through the entire TSR would mix
unrelated roots and cannot prove either a switch bound or absence of map writes.

A further native-field audit corrected an implementation mistake: the last
byte of main2B/2C/32/33 is startup delay at actor+61, not the F8 counter.
F8 uses actor+66, which the assignment helper always clears. The outer
gate at F0603258A / Final06037800 decrements startup delay and skips primary,
secondary and movement for that entire invocation. The clock now separates
these fields, preserves ongoing primary/secondary timer values during startup,
and checks the255-invocation boundary. Earlier assignment tests that expected
immediate execution with a nonzero last operand were incorrect and replaced
with this source-derived timing contract. The prior zero-start-delay fragment
results are unaffected. Allocation bit7 is not used as a universal primary
execution gate: the outer scheduler subsequently checks the primary pointer.
Full attribute handling and main2D allocation/placement remain open.

Main2D now performs native positioned allocation: signed x/depth, parent1,
scene-direction mirroring, selector/render-word reset, attributes and startup
delay. Its280 instruction bytes match at F06019E08 / Final0601A2E0. The
attribute helper's210 instruction bytes match at F0603BFB0 / Final060413AC;
its exact bit stores and opaque word72 are modeled, with word72 reset onFF.

The actual beam program in both games contains the corresponding2D command
at102. Under explicit unit1/reset-pool context it starts actor24 sequence16
with the native fixed-point flag, so FA45's anchor displacement is(160,-152),
not the unscaled(20,-19) from the earlier isolated-track probe. The sampled
selectors are4,5,6,5,6,5,6,5,6,5,6,5. Following main commands remain held in
that probe: F reaches its ten-tick wait; Final encounters an extra2A creation
at113 that is still unimplemented. This is a positioned-prefix test, not
a full attack replay or proof of browser/game pixel agreement.

Main2A now follows F06019C94 / Final0601A16C (198 identical instruction
bytes). It retains native slot history, resets its specified selector/motion
fields, uses default attributesF011 (F111 when mirrored), and mirrors the
origin to09F8 before assigning the sequence and startup delay. The existing
parent byte is retained;2A does not set it to1 as2D does.

The pool updater now checks retained primary cursors rather than treating
allocation bit7 as a universal execution gate. It visits the128 slots in
ascending order, retains held poses, and freezes later slots after an unknown
command whose shared effects are unproved. With the actual main prefix at102
and explicit reset-pool/unit1 context, F creates slot24 and reaches its wait
at113. Final also creates slot48 and reaches its wait at118; slot48 then
stops at unimplemented FAE7 at1879. This replaces the earlier main2A frontier
with a specific actor-command frontier. Full attack start, camera, render
composition and map coordinate requirements are still unverified.

FAE6/E7 now implement the native displayed-word progression. Both134-byte
instruction bodies match; the actual Final dispatch selects E6 at0603AFA8
and E7 at0603B04C, corresponding to F06035D14/06035DB8. Each uses its real
total/step bytes, accumulated word and two direction-selected remaining words.
It divides the unsigned remaining word by(total-step), subtracts the truncated
signed quotient, accumulates it modulo65536 and advances the step. Completion
sets stepFF; an FF sentinel or zero denominator makes no update. Missing
scene words/counters remain a frontier and are not initialized to guessed
damage or zero.

The initial beam main680B macro supplies the two total bytes. Its32 instruction
bytes match at F06040990 / Final06045FD0, and source execution shows only
stores to F060CAC40/060CAC26. The main clock now applies those two source
operands while preserving the other progression state. Native scene producers
for step/accumulated/remaining words and the renderer still need connection.
The actor/main suites pass62 tests, including signed division, word wrap,
selected-side preservation and missing-context handling.

Main6A now follows F06044324 / Final06049AF8 (106 identical instruction
bytes), including the called background helper F06045DC0 / Final0604B59C
(188 identical instruction bytes). It reads a signed operand byte, initializes
the signed fixed-point origin and absolute movement speed, mirrors the origin
when direction bits differ, and applies the native signed multiply/arithmetic
shift to each background plane. The helper also writes the row at the group's
count on every iteration; the last plane's value remains there. A zero-count
group is unchanged. Its return word6001 advances without introducing a wait.

The clock requires the actual selected mode's two signed factors, both plane
groups, their counts and retained unsigned word factors. Missing context stops
before mutation; none of those values is synthesized from a gallery image.
The focused actor/main suites now pass64 tests. This extends the scheduling
kernel only: the browser player, actual scene-context loading, background
pixels and full game replay remain incomplete.

The factor source is now read from the user's BTSR directory cell1 +4,
followed by signed byte pairs selected by the scene mode. F0603F68E and
Final06044CB6 initialize that pointer through the same getter/cell/+4
instruction sequence; their globals are060CAC34 and060D20C4. The new
`readBattleBackgroundModeFactors` validates the self-relative directory,
physical member boundary and byte-sized mode before reading. Actual F/Final
BTSR probes each expose158 bounded pairs, starting with[-64,0]; those values
are observed data, not defaults. The focused suites now pass65 tests. Scene
mode selection and retained background plane groups are still required before
this data can drive a whole attack replay.

The following beam command69 is actor positioning, not a background-mode
selector. Its288 instruction bytes match at F060441C8 / Final0604999C.
The clock now applies the signed target words, native0500/0440 origin,
direction mirroring, fixed actor1/4 selection and flag1 bit6 control. It also
retains the global scene target. The native main-context word at+72 chooses
the pause path, which waits for and consumes global bit15 without placing an
actor again. The reaction-state byte's bit7 selects the separateF000 sequence
assignment path; unresolved source/context remains a frontier. Normal placement
sets bit15 in the same invocation, allowing the subsequent24 to consume it.
Focused suites pass68 tests. Background-mode initialization, retained scene
context and whole attack rendering remain open.

An actual-record prefix probe now starts each user's F/Final beam program at
46 and executes680B,6A,69 and24 through60 in one invocation. Under an explicitly
synthetic mode0 scene (not a captured game scene), actor1 reaches(1664,1088),
the bit15 completion is consumed and the two progression totals remain1.
Both records next stop at6F at60. This proves those actual instructions compose
under the stated context, not native-video agreement or full browser playback.
The next missing contract is6F's graphics setup, including its mode-dependent
selector helper and renderer allocation; it must not be skipped to reach later
frames. Background-mode producers and retained plane/actor state remain open.

The main6F dispatcher is now modeled from F060443F0 / Final06049BC4
(186 identical instruction bytes before literals). It passes the native request
word, count masked to7FFF, bank and selector to an explicitly supplied
retained graphics initializer. Mode1 additionally requires the real selector
resolver; other modes use the two source bytes. An initializer must explicitly
acknowledge completion. Missing or unresolved resource/renderer state keeps the
cursor at6F; no default/no-op initializer is installed. Count bit15 stores
the graphics completion word1 and yields after advancing seven bytes, matching
D006; otherwise6006 continues in the same invocation. Focused suites pass70.

This dispatch contract does not implement the0603A5E8 graphics helper or its
mode1 resource lookup, and does not remove the actual-record prefix frontier
without those real providers. Native rendering and browser integration remain
required. The earlier prefix result remains valid with no provider configured.

Reading the entire helper corrects the earlier graphics-setup interpretation:
6F transfers palette words, not actor sequences or sprite allocation. The
second word is a transfer count. F0603A5E8 / Final0603F9E4 have404 identical
instruction bytes. `editor-battle-palette.mjs` now implements the mode!=1
linear transfer from retained unsigned words: source bank*256+selector,
destination((request>>8)&3)*256+(request&255), copying count words. Crossing
an individual bank is supported when the retained physical extents permit it.
Out-of-bounds sources/destinations fail before mutation. No proprietary
palette is included in the module. Focused suites pass72 tests.

Mode1 uses a distinct sixteen-word bank stride and palette address-map lookup
with native partial/full-block loops. It remains unresolved and the initializer
returnsfalse for that mode, so its 6F frontier is preserved. Actual palette
source loading, mode1 selection/remapping, color rendering and web connection
still need implementation; the helper is not yet a complete battle renderer.

Mode1 palette transfer now implements its sixteen-word source-bank stride,
retained64-word destination address map, partial-row prefix, native full-block
loop and partial tail. The block loop compares a growing block index against
a shrinking remaining count; it does not mean a conventional count-word copy.
The implementation preserves that behavior, including the additional mapped
destination stride, instead of changing the game algorithm. A prefix longer
than the submitted count would underflow the native counter and is rejected
before mutation. All planned source/destination spans are validated atomically.

The existing SH2 analysis interpreter executed the pinned F helper for seven
concrete aligned/unaligned cases with explicit retained source/address-map
state. Every one of1024 destination words matched the JavaScript implementation
for all seven cases, including count32 copying16 words and count48 copying32.
The source helper's404 instruction bytes match Final as recorded above. Focused
suites pass74 tests. This is concrete instruction/data agreement, not a game
video or browser-rendering test. Actual source palettes, retained address map,
selector resolution, render connection and map coordinate work remain open.

`createBattlePaletteSelector` now resolves6F's mode1 selection word, including
the16-word bank-base map, direct0100..0105 banks andFF00..FF20 special paths.
Direction-dependent sentinels require the actual direction bit and the two
side-state words. No absent map or side state is replaced with zeros. The
native result is the rewritten word's low-byte bank plus the helper return's
low-byte selector, not the two original input bytes. Relevant selector-code
segments match at F0603A3C0 / Final0603F7BC. The existing concrete SH2 analysis
interpreter produced184 boundary/sentinel/direction/side-state cases; all
matched the JavaScript bank and selector. Focused suites pass76 tests.
Actual retained source/map initialization and pixel rendering remain required.

The existing authenticated asset decoder can now optionally retain sprite
color indices and the original16/256 BE16 palette words, using the same row
padding and source-boundary checks as its RGBA decoder. Its default response
is unchanged. `recolorBattleSprite` applies a supplied retained palette without
resizing the image or mutating source pixels, and keeps index0 transparent.
Fixtures for both4-bit and8-bit records reproduce existing RGBA exactly before
a palette change and change only the specified colors afterward. The combined
asset/clock/palette suites pass90 tests. Actual native palette-pool assignment,
live frame composition, browser connection and game-video comparison remain
open; this decoder extension alone does not complete native playback.

Authenticated `previewEditorBattleAsset` now accepts an own boolean indexed
option and returns indexed pixels/palette words from the user's checked carrier.
Existing non-indexed calls retain their response shape. Invalid option values
are rejected before reading the carrier. Worker routing continues to use its
existing session-token/cancellation guards. Combined core/worker/asset/clock/
palette suites pass111 tests. A private actual-disc probe decoded the three
selected beam track pictures from each latest accepted F/Final image through
this API, recolored each with its original words and compared every pixel and
dimension to the existing authenticated RGBA decoder: all six matched.
That proves source decoding/recoloring, not native palette-pool placement,
whole-attack timing, game video or browser playback.

`createBattlePalettePool` now models the loader's384 sixteen-color source
banks and retained two-byte occupancy records. F0603A7F0 rejects misaligned
source pointers(-1), null pointers(-2), zero counts(-3), range excess and
occupied banks before copying. Only occupancy byte0 is set; byte1 is retained.
The start bank is masked to its native low byte. An occupied first bank returns
code0 without loading, so the model exposes loaded separately from code rather
than treating every zero as success. Source extents are additionally checked
before mutation. The source copy uses the verified sixteen-word bank layout.
The helper's198 instruction bytes occur identically and uniquely in Final.
Combined focused suites pass113 tests. Retained occupancy initialization,
palette extraction/allocation order and native scene loading are not yet wired
to the browser, and full playback remains incomplete.

`resetBattlePalettes` now implements the observed palette storage reset at
F0603A2FC / Final0603F6F8 (146 identical instruction bytes plus identical
18-byte constants). It clears2000 hexadecimal bytes of source storage and800
hexadecimal bytes of destination colors, installs the six native16-color solid
banks(0,7FFF,001F,03E0,7C00,03FF), and sets only the first14 bank-base words
to128. The native bank-free helper clears occupancy byte0 across384 banks,
retaining byte1. The last128 source banks and final two base words are not
cleared by this function and remain retained state rather than invented zeros.
The graphics completion word resets to0; other scene globals are outside this
palette-only interface. Combined focused suites pass115 tests. Actual loading
order, extraction of whole record palettes, rendering and browser replay are
still required.

The investigated06032B60 loading path consumes background bk0 records through
0603B740; it must not be treated as the sprite image loader. Its bk01 descriptor
supplies the BE16 color count and palette at decompressed+4, and reserves the
count divided by16 native banks. The existing authenticated asset decoder now
supports a paletteOnly request for validated bk01 records, returning all palette
words and that native bank count without an RGBA sheet. It rejects mixed indexed/
palette requests and other formats. Existing normal image requests are unchanged.
Private latest-disc probes read an actual E_BNK bank in each game:80 original
color words, five native banks, with checked file/key identity. Focused115 tests
pass with new whole-bank palette assertions. This proves extraction, not the
beam's selected bank, allocation order or full replay. Sprite palette loading
and scene cache-to-base-map initialization remain separate pending contracts.

A bounded native F runtime cadence investigation used only the project's own
saved state and product BIN, with no RAM pokes. Two A-input runs produced
82 outer06032508 calls each, at most one per observed frame, median16715us
between consecutive frames. Both were preparation-screen transitions with
graphics mode0, not attack playback. C returned to the map; B opened the
opponent weapon-information list. No attack clock/frame mapping is established
by those runs, and no browser timing constant was added from them. The four
runs exited normally and their snapshots were inspected. Further measurement
must first resolve the actual attack-start input/command path, then compare
both games during attack scenes rather than reuse these UI-only observations.

`loadBattleBankPalette` now connects a checked whole-bank palette descriptor
to the retained pool/base map: native source bank is the current cache-base
word's low byte, bank count is colorCount>>4, and successful registration
updates the next cache-base word by that count. It supports only the bounded
known cache indices0..13; retained final cells are not allocated speculatively.
Refused pool admission does not advance the map. F06032B60's310 instruction
bytes also occur identically in Final. Sequential registration and failed-load
preservation are tested; focused suites pass117. This is the palette portion
of the background loader, not its DMA pixel loading, the sprite loader, or
proof of which cache the actual beam scene selects. Native cache-loading order
and browser wiring remain open.

Actual attack cadence was measured in both games using the UI-generated new
weapon images and their own states, with no RAM writes. F's Aphrodite and
Final's Wave Rider executed the borrowed blue charge; snapshots confirm the
attack, rather than a preparation transition. In the frame1250..2000 window,
the primary dispatcher reached each long-lived actor at most once per video
frame. Consecutive-frame emulated timestamp gaps have median16715 microseconds
in both games. This is a measured sample, not an exact universal fixed-period
constant. Other presentation modes and frame-duration variations still need
measurement before assigning browser milliseconds.

F main6F executions precede the outer scheduler and primary actors in the same
frame. `editor-battle-scene-clock.mjs` connects the existing main VM and retained
actor pool in that order, sharing the actual flag context. Main waits can be
released by an actor on the following update; a main flag write is visible to
actors immediately. An unknown main command freezes actors, and an unknown
lower actor freezes higher slots. The combined actor/main/scene suites pass75
tests. Whole-scene resource initialization, rendering, weapon coverage and web
integration remain incomplete. No gallery timing label has been changed to
claim native playback.

The sprite loading path is F060328C8, whose palette registration call returns
at060329AE; Final's matching registration returns at06037C32. It is separate
from the previously investigated background loader. In the actual blue-charge
attacks it registers four banks at128 followed by two banks at132. The two
decoded E_SPR records provide exactly64 and32 palette words. Authenticated
`paletteOnly` decoding now supports complete pX sprite palettes, including
intervening banks, rather than just the currently selected subimage's palette.
It rejects mixed indexed requests and invalid subimages before returning words.

No-poke native traces captured the original registration source words in both
games; every one of those96 words matches the corresponding authenticated disc
records. F's retained source pool at the observed runtime pointer also matches
both records word-for-word, and its actual scene graphics mode is1. The focused
asset/core/palette suites pass38 tests. This establishes the selected attack's
sprite color resources and allocation order, not complete scene initialization,
native frame rendering, all weapons or finished browser playback.

`inspectEditorBattleSceneSources` now reads the selected unit/weapon's complete
D_ANIME program, common actor program and physical body/effect records through
the authenticated local session. It validates ownership, the native actor entry
tables and actual carrier lengths. Authoring requests use the projected program
and current unit links. The worker's BATTLE_SCENE_SOURCES operation shares the
existing session-token, abort and late-result guards. No proprietary bytes are
included in repository assets.

`resolveBattleSceneSprite` maps the live selector's group and low-byte picture
index to one loaded physical record. Unloaded inherited, opponent or destruction
groups remain unresolved; it never chooses an arbitrary archive picture. In
actual latest F/Final disc probes, beam sequence16 executes12 native actor ticks
and decodes precisely pictures4,5,6,5,6,5,6,5,6,5,6,5 through this resource path.
The introductory picture4 is not placed in the repeating5/6 tail. Both games
also provide the correct1987-byte original charge program and verified unit
graphics identity, and reject selecting that weapon for a unit that does not
own it. The focused source/worker/resource/scene suites pass52 tests.

This is an authenticated program-to-picture execution path, not the complete
attack compositor. The main VM still requires native scene resource/context
initialization before palette commands can run; subsequent setup commands,
camera/background projection and retained opponent state remain unresolved.
The browser still uses its labelled reference gallery pending that integration.

The scene resource provider now resolves the existing24-cell common-program
family and validates both local and Fxxx common actor assignments. Programs
retain their whole native source bounds rather than stopping at the next alias.
The authenticated scene source also retains the selected unit's raw byte10;
BTSR cell0 supplies a requested metadata entry's type without defaulting to0.

Main682F is implemented from F060431C8 / Final06048898:346 instruction bytes
and all six5001..500B return constants match. With explicit metadata type and
raw unit byte10, it chooses the native operand-relative word cell; absent
context blocks without advancing. Actual common6 source probes using explicitly
selected metadata index0 (not a claim about the current map) read type2 and
unit1 byte102 in both games and reach the positioned actor creation. An
explicit reset-pool/variant1/unmirrored probe then allocates the common actor
and reaches macro6848. The combined actor/main/source/worker suites pass124.

The next unresolved common6 contract is6848 at F06043DCC / Final060494B0.
Its86 instruction bytes and6001 return match, and its fixed source base is
202C4840 in both games. It reads distinct bytes at F060C0580 and060C06C0,
not the previously modeled scene direction byte. Its producer/context and
control block at F060CACC0 must be established before it can drive rendering.
Full web playback and per-weapon browser/game comparison remain incomplete.

Main6848 now models the native control-block stores, retaining low six bits
of byte0, setting its top two bits and byte1 from the first source byte's
bit7, clearing long12 and choosing202C4840/202C4940 from the independent
second byte's bit6. It requires those actual source bytes and retained byte0;
missing context blocks rather than becoming a no-op. Other block fields are
preserved. This control block's full rendering meaning is still unresolved.

No-poke actual attack traces reached the helper in F frame1560 and Final
frame1618. Source bytes were[0,1] and[0,0] respectively. Replaying the command
from each captured before-state reproduces every byte of its16-byte native
after-state. The source addresses in Final are060C69E0/060C6B30 and its
control block is060D2150. The focused suites pass125 tests. Explicit common6
prefix probes now pass6848 and stop at6826; this remains a fragment with an
explicit reset pool/sample metadata, not a complete native scene or web movie.

Main6826 now implements F06041D3C / Final06047408's scene fade. Their276
instruction bytes and initialization return constants match. The helper
handles its source-byte gate, mode1/flag7 fast completion, normal-255 setup,
two signed32-bit counters, signed16-bit RGB writes, secondary limit and mode2
secondary-color retention. Missing required retained state blocks before a
running invocation mutates its counters. The pure helper exposes native return
values; the main VM consumes the three-byte instruction on D002 and increments
context+72 on2000, using context+71 bit7 for immediate re-entry. These return
rules were read from the actual dispatcher, not assigned browser delays.

Eight concrete executions of the native helper match all modeled counters,
flags, RGB registers and return values. The analysis interpreter explicitly
implements its previously omitted GBR operations and overlapping long/word
counter reads; treating ignored hardware stores as native no-ops was rejected.
No-poke actual attacks in F frame1560 and Final frame1618 follow the mode1
fast path, and both match every captured counter/flag/RGB result. Those runs
do not prove the slower fade branches occur in those particular attacks.

The explicit common6 prefix now passes this fade and reaches its allocated
common actor's anchor requirement in both games. The focused suites pass130
tests. Authentic anchor/context wiring, pixel composition and browser/game
weapon coverage remain pending; the public gallery still does not claim full
native replay.

Scene resolvers now expose bounded BTSR cell19 anchors, validating all32
self-relative entry cells before actor execution. The explicit common6 fragment
in both games reaches slot32, selector1000 and coordinates(64,-128), without
an actor frontier. This remains an explicit reset-pool/sample-context fragment.

Native sprite loader traces independently establish group16 from BTSR cell7
and group18 from cell20 in both games. Their original physical bytes match the
observed loaded RAM records. The F loader starts060328C8; Final starts06037B4C
but uses different register allocation, so byte identity was not assumed.
Authenticated scene sources retain these records as candidates. The resource
resolver uses them only when the native bootstrap explicitly loads the groups;
merely having the file does not make an inherited group active.

This probe found a palette omission: common cell7 references9 banks in its
images but contains18 banks before the first pixel stream. Whole sprite palette
decoding now retains that complete block instead of deriving its size from the
largest referenced palette index. All288 words match native source bank74;
cell20's16 words match bank96, independently in F and Final. Actual decoded
first images are72x16 and50x96. The focused battle/worker suites pass184 with
one optional browser test skipped. Exact native projection, full scene context,
browser playback and per-weapon UI/game agreement remain required.

Native sprite geometry is now decoded for the scene renderer. Each16-byte
entry starts at decoded+2: width/height are entry+8/+10 and signed pivotX/Y
are entry+12/+14. PivotY is explicitly stored; height/2 disagrees with real
frames (for example common frame36 has height37 and pivotY21). Native texture
width is rounded up to8 pixels, retaining every stored row pixel. The existing
gallery crop remains unchanged; indexed nativeTexture requests expose the full
native texture and its pivots. The authenticated API validates the option and
requires indexed decoding before reading the carrier.

The same header declares its complete BE32 palette count after the entry table.
Whole palette decoding now uses that declaration and checks it against both
referenced banks and pixel bounds, superseding the previous boundary-derived
count. Unused banks remain retained. The original charge records still yield
four/two banks in both games. Synthetic fixtures now include that actual count
field, and malformed whole-palette declarations are rejected.

All50 common frames in each game's checked disc match the observed native
width, height and both pivots, including noncentral/odd-height pivots and row
padding. This compares100 decoded textures against actual retained game display
data, not guessed centers. The focused suites pass186 with one optional browser
test skipped. Actor-to-screen projection, scene composition and finished web
attack playback are still required.

`editor-battle-draw-command.mjs` now decodes emitted VDP1 normal, scaled and
distorted sprite vertices, texture identity and flip bits. Geometry follows
the local emulator's native VDP1 consumer: sprite coordinates are signed13-bit,
local origins signed11-bit, and vertices are inclusive pixel endpoints.
Scaled zoom-point handling retains native odd/negative arithmetic rather than
using CSS transforms. State commands provide real system/user clips and local
origin; missing origin is not replaced with0.

An actual F frame1600 command prefix supplies clip(319,223), origin(160,112)
and a64x16 centered sprite at vertices(145,129),(208,129),(208,144),(145,144),
texture offset15F40. The bounded texture-target probes did not match the
initially selected first pictures; their command prefixes still expose real
display state. Palette-bank count was not used as sprite count after the
native cache showed eight pictures in the two-bank effect record. The next
probe must correlate live actor selector/parent positions with those commands,
not assume that the explicit sample-context actor matches the actual map.

The focused suites pass191 with one optional browser test skipped. This
decoder is ground truth for displayed geometry, not actor-to-command generation
or a finished battle compositor. Browser native playback, game comparison for
both games and complete weapon UI coverage remain incomplete.

### Retained actor layout and native placement

The CPU-order actor record is76 bytes. Position longs are+4/+8, current
selector is+56, color flags/render mode are bytes+62/+63, and parent index
is byte+65. They must not be confused with scheduler delay bytes. The new
`editor-battle-actor-layout.mjs` preserves these fields and resolves parent
positions with signed32-bit wrapping, rejecting missing/cyclic parents.

F0603C23A..0603C276 and Final06041636..06041670 provide the renderer's
projection. Flag1 bit3 selects eighth-pixel coordinates, divided toward zero
after summing parents; two signed-byte display offsets are then added. This
differs from the arithmetic floor shift used by another scheduler consumer.
Native alignment uses the24-byte table at F0603C174, stored asymmetric
pivots, padded native width, and independent flip bits. The placement helper
keeps scale/rotation/VDP vertex generation separate; it does not claim to
generate a whole native draw command.

Read-only headless probes reached F0603C18C492 times and Final06041588280
times, with corresponding post-draw probes at F0603C524/Final06041920.
The held visible attacker body has no active sequence address and still draws;
a linked effect with flag1=98 is hidden and must not be painted. The leading
common64x16 sprite command was previously interpreted as a shadow, but its
producer has not been established. The2026-10-13 source-only review identifies
the traversal's first helper as debug text, not shadow drawing. Capturing only
the leading command prefix missed the
attacker body. Actual post-draw commands expose its144x112 texture and stored
pivots. Direct native draw-helper placement inputs match the new projection:
F frame1601=(183,96), Final frame1600=(164,96). Final's captured camera bytes
are both0. Its VDP command list at that function boundary still represents an
earlier position, two pixels away; it must not be treated as the current CPU
draw-helper output. Command publication/flush timing remains to be connected.

The current focused native/resource/worker suites pass161 tests. Actual web
native playback, complete scene composition and the requested F/Final weapon
UI audit are still pending. The existing250ms gallery is not native playback.

### Native draw-helper dispatch inputs

The draw helper path is selected by flag1 bit0 and flag2 bit7, not by the two
flip bits. F0603C468..0603C494 matches Final06041864..06041890 exactly.
Path0 supplies a16-byte position/depth record and angle0; path2 supplies the
same record with the stored rotation word+52. Paths1/3 add separate raw
32-bit scale fields+44/+48 and use that rotation word. A field equal to100
is replaced by the native0x0000FFFF sentinel. Other values remain raw fixed
point; interpreting them as percentages would be incorrect. The scale
consumer at F0603C4FA matches Final060418F6 exactly.

`createBattleActorDrawInputs` now generates those CPU-order helper records,
including signed16.16 positions relative to(160,112) and explicit render-mode
depth. Its F/Final unscaled records match the16 bytes captured at the native
draw-helper boundary. Native actor reset now also restores both scale fields
to100 and rotation to0, as the original reset routine does. Eight actor-layout
tests and the expanded163-test native/resource/worker suite pass.

The headless draw traces also show that successive rendering invocations are
not universally one captured display frame apart. During the sampled attack,
two-frame intervals predominate with some other intervals. No fixed60Hz
promise follows from integer sequence delays alone. Native library queue
publication, screen refresh timing and web scene bootstrap still need to be
connected before the existing gallery can be replaced by actual battle replay.

### Frozen draw traversal and native material attributes

`editor-battle-scene-draws.mjs` snapshots the native draw traversal separately
from scheduler activity. F0603BCFA..0603BD16 matches Final060410F6 exactly;
F0603BD36..0603BD3C matches Final06041132. The loop starts at pool+2600,
with counter128, decrementing by76 through slot0. It therefore reads129
records, unlike the128-slot allocator/scheduler. The extra record must be
provided explicitly. The caller requires flags1 bits6 and7; the body helper
also exits when bit5 is set. A retained visible body with no sequence cursor
is still included. Native shadows remain a separate path.

Prepared body/effect inputs resolve each live selector to its authenticated
asset key, retain descending slot order and frozen parent positions, and
reject mismatched decoded images. Unresolved inherited groups stop the frame
instead of falling back to archive pictures. Cancellation after an image read
prevents an old selection from entering a new frame. Four traversal/preparation
tests pass. This is frame preparation, not finished queue composition.

`editor-battle-sprite-attributes.mjs` implements the10-byte native material
helper, whose94 bytes at F060099E0/Final06009C08 match exactly. Texture index,
PMOD, CRAM bank/drawing/color-mode fields and alignment/flip controls remain
separate. Two read-only headless runs captured pre-helper register/stack inputs
and post-helper outputs. After requiring the observed battle stack addresses
(rather than treating other callers' stack data as these arguments), all346 F
and134 Final outputs match the new helper across three distinct attribute
records. Three material tests pass. Native library queue conversion and web
scene bootstrap still remain; no all-weapon UI or completed playback claim.

### Native unrotated queue and VDP conversion

`createBattleUnrotatedQueueRecord` reproduces the28-byte positive-scale,
zero-angle request created by F060A7792..060A785E. Those204 instruction bytes
match Final060ADC82. Actual retained body requests from both games match the
new request serializer when supplied their native draw inputs/material and
post-culling depth word. Other helper paths and negative perspective scales
remain separate contracts.

The slave CPU dispatches queue tags through the table at F060AB40C. Tag28
calls F060B1AF6, tag24 calls F060B1B5C, and tag40 calls F060B1F08.
`editor-battle-queue-command.mjs` implements the tag28 consumer and shared
setup at F060B1A98..060B1B5A. These196 bytes match Final060B7F78. It uses
the native geometry table, low32-bit width/height multiplication followed by
unsigned16-bit extraction, explicit loose culling bounds, native centered
zoom defaults and flip controls. A144x112 body at the0xFFFF scale produces
the native143x111 inclusive endpoint spans. The serializer keeps link and
depth-sort publication separate from VDP drawing fields.

The private headless adapter now also logs readable R11 spans, and an optional
hit-start frame prevents menu calls from exhausting bounded trace limits.
Neither changes game RAM. An initial8000-hit trace stopped during menus and
was not used as attack evidence. The subsequent bounded slave-CPU traces
cover F frames1501..1750 and Final1516..1789. All4000 F and4000 Final tag28
outputs across23 distinct native geometry records match CTRL, PMOD/color,
texture source/size, placement, endpoint spans and Gouraud address. Their
retained sorting-depth words also match. Unused words and published CMDLINK
are not claimed. Three queue-consumer tests pass. Native rotation/scaling
paths, command ordering, web pixel output, scene bootstrap/timing and full
weapon UI coverage remain required for complete battle replay.

### Rotated queue consumer

`decodeBattleRotatedQueueCommand` implements tag24's fixed-point edge vectors,
all16 native zoom selectors (including fallback-to-center), anchor-dependent
texture flips, four-vertex loose clipping and native corner reordering.
Inputs retain the original integer sine/cosine terms; JavaScript trigonometry
is not substituted. Signed64-bit multiplication and arithmetic half shifts
preserve the original fractional/negative rounding. Native viewport and
window bounds must be supplied explicitly.

A bounded private concrete execution of each game's original consumer
(F060B1B5C, Final060B803C) supplies960 cases:16 zoom selectors, six signed
rotation-term pairs and five screen placements in each game. All defined
command fields and culling outcomes match. The existing analysis interpreter
needed explicit DMULS/MACH, SUBC, XTRCT, SWAP/NOT, MOVA, GBR access and
overlapping-byte memory support; its original missing SWAP support caused
two discarded variable-jump failures. ISA semantics were checked against the
local SH7095 implementation. This is original-code concrete execution with
synthetic inputs, not an emulator battle or full weapon proof.

Read-only headless traces also watched the real tag24 entry and slave queue
dispatcher during the existing charge-motion tests. No tag24 calls occurred
in those captures (F1501..2701, Final1500..2565); those runs therefore cannot
establish rotated battle rendering. The first Final probe used an invalid
entry after a whole-block search failed and was excluded. The corrected
Final entry came from its actual dispatch table, not a guessed address shift.
Native rotation-term resolution, direct transformed paths, live rotating
weapon captures and web composition/timing remain to be connected.

### Browser command presentation

`editor-battle-canvas.mjs` now paints resolved native commands with textures
identified by their authenticated asset keys. It validates every requested
texture and supported color operation before clearing the canvas. Native
system clipping defines the fixed stage dimensions, independent of sprite
size. Axis-aligned commands retain inclusive endpoint spans and independent
flip controls. Distorted commands retain their four corners using two Canvas
triangles; that sampling is explicitly a browser presentation approximation,
not Saturn VDP1 DDA emulation. Gouraud/color math, solid-pixel/endcode modes
and outside-user clipping remain explicit unsupported operations.

A private headless browser harness loaded authenticated F(unit34/weapon151)
and Final(unit6/weapon24) sources through the current core APIs, decoded their
real144x112 C_ROBOT textures, and painted previously captured native body
commands. Actual buttons were clicked for both games at720x480 and390x844.
Every output pixel in each body rectangle matches the decoded source texture,
with no stage overflow. Missing texture requests preserve both previous
pixels and stage dimensions. The screenshots were visually inspected; Final
shows the actual Wave Rider sprite. The first isolated harness inherited site
CSS that overlapped its buttons; that failed click was excluded and the
standalone harness styles were isolated before the successful run.

This is presentation-component verification of single native body commands.
It is not the editor's end-to-end native attack player, a full-scene game
comparison, animation timing proof or the required all-weapon editor UI audit.
The existing reference gallery has not yet been replaced.

### Carrier entry and full owned-weapon source audit

`resolveBattleSceneMainProgram` now reads the carrier's little-endian main
entry, validates it independently of the actor-table location and preserves
bounded access to the whole carrier. The resolver factory exposes that entry
instead of requiring callers to hard-code the beam sample's offset46.

An authenticated latest-family audit checks one verified nonzero owner for
every owned weapon row:1190 F and1279 Final selections. The first run revealed
132 F and135 Final carriers rejected by the new clock's table validator:
each has unused actor entries pointing exactly to its carrier end. The
existing mapping parser already permits those unselected cells. The clock
now agrees: it accepts end cells as metadata, rejects them when selected,
and still rejects any pointer beyond the carrier. Regression tests cover
both local and common tables and actual executable selection after a sentinel.

After correction, all1157 F and1277 Final source bundles that pass source
inspection also resolve their main entries. Their observed main entries are46.
Remaining source refusals are explicit: two actor-directory cases in each
game (weapons862/1163, owners230/303), plus31 F selections whose unit graphics
are outside that game's supported source directory. These were not dropped
from coverage or substituted with unrelated pictures. This audit is source
structure inspection, not all-owner coverage, UI clicking or runtime playback.

### Backward trailing cells in two missile carriers

The remaining actor-directory refusals were traced to actual Buster Missile
(weapon862, owner230) and Sizzler Missile (weapon1163, owner303) carriers.
Their main entries are46 and their tables contain48 cells. In both games,
the last cell(index47) points back to the table start:616 or608 respectively.
The other47 cells point to normal executable sequence data. These are not
missing or empty whole files.

The clock and mapping parsers now allow that exact backward final cell as
unselected metadata. Selecting it still fails as an empty/non-executable
entry; other backward pointers and all beyond-end pointers remain invalid.
Tests cover clock selection and the source-inspection path, including a
one-byte malformed backward target. The authenticated one-owner-per-weapon
audit now resolves all1279 Final selections and1159 of1190 F selections.
The31 F refusals remain unsupported unit graphics, not actor-table failures.
This widens valid carrier reading without inventing an animation for cell47.

### Whole-program frontier: scene control readiness

A bounded whole-beam clock fixture now starts at the resolved carrier entry
and runs main/actors with an explicitly synthetic retained pool, palette
source and identity CRAM map. It is not game playback. Both programs reached
offset97 after eight updates: main6808, previously unimplemented. The new
handler follows F060408E4/Final06045F24 (56 identical bytes including6002
return): thresholds above127 compare the full unsigned control byte; lower
thresholds compare its low seven bits. It consumes three main bytes only on
completion, otherwise retaining its cursor without an invented wait duration.
Missing control state is still a frontier. Native headless entry/return pairs
match50 F and32 Final predicates (78 waits, four completions).

The synthetic fixture now waits correctly at that instruction rather than
skipping it. The native value is readiness state, not a sprite flipbook clock.
The actual scene control producer is F06046FD8/Final0604C7D8, the latter
verified through its gate/control literals. `editor-battle-scene-control.mjs`
implements its gate, delayed/idle states, packet15 advancement, packet-end
acknowledgement and unactivated packet17/18 flags. Actual captured packets
end withFFFF after a resource packet; the end acknowledgement sets byte1=FF
and permits6808 to continue. Active resource packets still stop at an explicit
unimplemented consumer rather than being acknowledged without their work.

Read-only producer entry/return captures match all modeled control fields
and gate words in164 F and135 Final invocations:90 idle,76 waiting and133
complete. One resource-consuming invocation per game remains deferred and
is not counted as verified. Two wait tests and four control-prefix tests pass.
The resource consumer, its ordering relative to the scene update, renderer
state bootstrap and actual attack timing/playback remain incomplete.

### Resource packet fields and grouped delay data

`readBattleSceneResourcePacket` decodes the10-byte16/17/18 packet fields
read at F060470F4..06047164: subjectIndex=word2>>6, low subject flags,
group=word4>>7, one-based selection=word4&127 and payload address. Captured
F packet fields are86/30/1 and Final22/2/4, with payload202C4A40. Native
processing resolves the subject through TSR root28 and grouped duration
records through root5; those references are separate from weapon sprite IDs.

Source inspection now exposes a session-owned copy of root5's directory.
`readBattleSceneDurationRecord` reads its24-bit group offsets and six-byte
entries, respecting aliases/group bounds and refusing zero or cross-group
selections. The same selected source/end-block values are present in the
authenticated disc metadata and observed F runtime root: F group30/1 has
source19763/end143, Final group2/4 has source517/end71.

`battleScenePacketDelay` follows the unsigned multiply/high-word/shift steps
at F060471F4..0604720E. Its reciprocal is supplied as retained state: the
observed F RAM value is A01A01A1, whereas initial executable bytes at the
mutable location are A00401A1. Treating the latter as a fixed constant would
be wrong. The observed reciprocal yields29/14 update counts for the two
selected records. Those are not asserted as elapsed seconds or as executed
branch timing. The native option-bit22 branch, payload task, actual resource
consumer and update/display cadence still need to be bound and verified.

### Timed resource branch plan and payload evidence

`planBattleSceneTimedResource` now prepares the option-bit22 timed branch's
control changes, grouped delay and exact four native task arguments plus
payload pointer. Subject303 additionally requires its explicit native flag.
It preserves the original control object: a plan is not a successful task
registration, and the message branch remains explicitly unimplemented.
The task constructor is F0601736C; argument1=2 selects a separate processing
path. Its payload cannot be replaced by a success boolean or omitted while
claiming the resource has been consumed.

Read-only retained payloads at202C4A40 contain encoded text and a3FFF ending:
F begins EC41 EC22 F265 F63E..., Final F25F F242 F296 F63E... . Subject
resolution through root28 yields pilot records; the grouped root5 entries
and separate command state are involved in the accompanying processing.
This changes the next action: bind the actual dialogue/task path rather than
treating packet16 as a texture-only loader. No audio decoding, text task
execution or elapsed-time matching is claimed by the current timed plan.

### Message branch state and corrected callee classification

`planBattleSceneMessageResource` now models F06047210..06047322. It plans
command words at offsets64/66/68/70, byte1 increment and cursor+10 without
committing an uninitialized display. The ordinary subject word's3E00 field,
shifted by9, determines the native command mode;302/303 require their actual
mutable special bit. Root28 subject records are now exposed as session-owned
data and resolved through bounded relative records, not a guessed face record.

Actual message-branch entry/store traces match all36 retained command words
and byte1 for one F and one Final consumption. The comparison uses each
authenticated disc's own subject record. It does not verify display output
or cursor commit after the callee. The timed branch remains separate.

The earlier “task constructor/registration” wording was premature. Further
F0601736C..0601758A inspection shows this call initializes a message display:
argument1=2 selects a special display path, it accesses2264-byte display
records, and passes the payload into text setup helpers. Both plans therefore
now expose `messageRequest`, not a generic `taskRequest`. Complete glyph
decoding, display initialization/update and audio-command completion still
remain. Payload3F FF may be closing quote plus terminator; it must not be
assumed to be an indivisible end opcode without the text consumer contract.

### Encoded message enqueue, independently checked in both games

`editor-battle-message.mjs` implements the mode0 text ring writer at
F06016688 / Final06016B1C. The native ring has512 bytes; its write pointer
identifies the previous written byte. Each store advances and wraps first.
An encoded byte count precedes the text, and the FF terminator is not copied.
EB..F5 consume a second byte, so an FF second byte is not a terminator.
Control bytes and the3F closing quote remain encoded; no Unicode or control
display semantics have been inferred. Unsupported lengths above255 fail
before modifying the supplied ring.

Read-only headless captures of the user's editor-exported images paired the
actual entry and caller return. At F frame1560,15 encoded bytes plus length
were enqueued; Final frame1618 enqueued17 plus length. All512 resulting ring
bytes and the final write pointer match the JavaScript implementation in
both samples. These are separate actual calls, not a synthetic disc fixture.
Three tests cover token boundaries, wraparound, and rejection without partial
mutation. Display rendering, completion, timing, and full scene playback
remain unverified; this module is not yet connected to the preview UI.

### Actual F8 display-program entry and retained return state

The ordinary byte/word ring readers (F06014B08/06014B38 and
Final06014F8C/06014FBC) are implemented, but are not called in these retained
battle samples. The actual program28 initializer directly dispatches F8 to
F06015364 / Final060157E8. Inline ring-pointer read captures confirm that
path, rather than an inferred use of the ordinary reader helpers.

`consumeBattleMessageChunk` implements all F8 operand distinctions:0 reads
the queued length;1..127 give a literal count;129..255 reserve operand-128
bytes and read a queued count;128 reads both reservation and count. It copies
encoded bytes, fills a left prefix with zeros when reservation exceeds count,
and appends a fresh FF. `enterBattleMessageChunk` retains the following caller
byte, increments the packed three-bit return depth while preserving low flags,
and enters only the copied program. FF returns to that saved context; depth0
yields from the display executor and is not a scene-ready acknowledgement.
The overflowing native depth7 slot overlaps the packed flag byte, so that
unsupported layout is rejected before queue mutation.

Scene sources now expose the authenticated TSR root24 message programs. Its
cell0 is an ordinary self-relative pointer, not a directory byte count: both
original roots begin with1162, and some neighboring pointers escape their
physical root. The selected byte-indexed program is resolved against the
whole physical root without using those neighbors to invent a table count or
truncate its instruction stream. Escaping selected pointers remain unresolved.
This is the same conservative carrier-bound approach used for native common
programs, not an assertion that all root24 entries are executable styles.

Read-only entry/exit captures of actual program28 F8 calls match the complete
64-byte retained control block, ring read pointer, copied scratch prefix, and
unchanged scratch remainder in both games. The operand is at relative byte16;
F copies15 encoded bytes and Final17. These comparisons resolve the source
through each authenticated latest accepted disc, not a synthetic input. Nine
message tests additionally cover wrap, operand modes, returns and rejected
state; source tests cover aliases, missing data and external neighbors.
Glyph rendering, the remaining display commands, scene integration and frame
cadence are still incomplete. The editor UI continues its labelled250ms
reference gallery; this evidence does not prove native battle-loop playback.

FF entry/exit samples now separately match all64 control bytes and the native
return value for both the nested return and top-level yield in each game
(four actual calls total). The authentic disc's first20 bytes of program28
also match the retained runtime program in both games:
FD0000 F70000 F10000 F70040 FC0714 F800 FE00 FF. This verifies that the F8
operand came from the correct owned program, not merely a matching zero byte.

### Executed display setup and owned-font message pixels

`editor-battle-message-clock.mjs` now executes bounded control dispatch rather
than treating the message payload as a finished task. F1, F6, F7, FC and FD
model the native field stores; F8 enters its copied text and FF returns through
the retained context. In wide text mode, EB..F5 encode glyphs, so F1 is a glyph
lead there while it is a control in narrow mode. Missing font context, narrow
tile text, FE and other unsupported commands stop without advancing or being
acknowledged. Supplied state must already be initialized; no millisecond timer,
default native window, or display-completion flag is invented.

Five actual setup transitions per game match all64 control bytes and the
source cursor. Separate F6 entry/exit captures match all64 bytes in each game,
including restoring column7 and moving to row22. Composed execution of the
owned program28, rather than isolated handler calls, reproduces the F8 entry
result in both games.

`editor-battle-message-glyph.mjs` reads32-byte slots from the user's TSR
root0x24 (decimal36), now exposed as a session-owned copy in scene sources.
Each source bit is a separate monochrome pixel: native expansion maps pairs
of bits into two4bpp pixels using the display color byte's low/high nibbles.
The normalized width threshold is **0100**, not the dispatcher's EA threshold:
values above256 draw16 columns, the others the first8. Full Final message
comparison caught the erroneous earlier EA assumption on EBF4→00F4; the fix
preserves that glyph's half-column bit and advances only one column. Boundary
tests cover256/257 and the actual Final00F4 case.

Glyph writes use the active native rectangle and8C00-byte packed arena, with
native start-position culling, row stride, half-column bit, credit decrement
and column/row advancement. The rectangle and initialized arena are required
inputs; unknown geometry is not replaced with a guessed viewport. The clock
can now draw owned wide-mode text through its return, then stops before FE.

Read-only actual first-glyph calls match all256 indexed pixels and all64
control bytes in both games. More strongly, composed program28 execution
matches the **entire264×48 indexed dialogue page (12,672 pixels)** and all64
control bytes at FE entry in each game. Each page contains9 glyphs; the clock
executes17 commands including setup, line break and return. The font bytes
come from each authenticated latest accepted disc. These two complete page
samples do not establish every dialogue, CRAM colors, final display publication,
native elapsed cadence, scene bootstrap or the full battle preview. FE remains
an unresolved display operation; its exact effects still need to be bound.

### Display registration and actual FE upload are now distinct implemented stages

`editor-battle-message-display.mjs` models the initializer's earlier call to
F06014058 / Final06014354. It allocates the next texture definition from the
previous physical definition and palette format, aligns its byte extent to32,
creates the8-byte palette record and existing10-byte sprite attributes, and
prepares XY using the actual double scale. The retained scale in these calls
is65536, so XY are signed16.16 coordinates, not float32 coordinates. Z is
preserved. It stores the chosen texture ID at record+70 and increments the
counter at record+0912. Registration does not upload pixels.

Actual initializer entry/exit comparisons match all80 selected record bytes,
the texture definition, complete affected palette/attribute table ranges,
XY and unchanged Z, and counter in both games (IDs62 and64 respectively).
The native palette stride is8, not6: the shift followed by adding the shifted
value doubles4×ID into8×ID. Corrected probes resolve those physical entries.

FE calls F06015988 / Final06015E1C, rather than the initializer above. It stores
the font source pointer in that texture's palette record and invokes the
synchronous upload helper (F06009AA4). Width×height/2 packed bytes are copied
to the registered VDP1 texture address. A nonzero record+090C pointer separately
copies28 rows of40 words into a tile destination with64-word row stride.
That copy is modeled with explicit source/destination views; the two actual
wide-mode dialogue samples have this pointer zero. No optional tile source,
palette, previous texture, rectangle, scale or VRAM is guessed.

The message clock now executes FE when its explicit display context owns the
same generated glyph arena. FEFE selects the active display, FEFF stages four
displays, ordinary0..3 select that display, and other byte indices retain the
native no-op. A whole batch is validated before mutation. Missing state blocks
without consuming the opcode. The root FF then yields; this is not by itself
the caller's later active-flag or scene-ready acknowledgement.

Read-only native FE entry/exit captures match all6,336 uploaded VDP1 bytes,
the8-byte palette record including source pointer, and all80 unchanged selected
record bytes in each game. Composed execution of each authenticated disc's
program28 and font slots now draws9 glyphs, executes19 steps through FE/rootFF,
and reproduces those same uploaded bytes. F's sample upload completes on
frame1561 and Final's on1619. This is an output comparison, not proof that the
web VM models elapsed CPU/DMA waits or native update/display cadence.

The product preview is still the labelled250ms gallery. Scene bootstrap,
caller activation/readiness, native draw publication/compositing, full battle
timing, and the requested F/Final complete clicked-weapon audit remain open.

### Message activation and resource cursor completion are now linked

The constructor's final store at F06017578 / Final06017A0C ORs80 into
display0's active byte for the supported0/2/FFFF/0 request. Entry and **after
store** captures (F0601757A / Final06017A0E) confirm00000000→80000000 in
the two actual samples. The first probe stopped at the store instruction and
therefore still saw the previous bytes; it was not an after-store observation.

`activateBattleMessageClock` now requires a clock-created, actually executed
root yield and completed display0 upload. It verifies the live registered
texture, palette entry and copied VRAM before setting the active byte. Its
opaque receipt binds to the exact native request object and values; a JSON
success flag, a forged public yielded property, a receipt for another packet,
or overwritten upload cannot substitute. Consumption is single-use and models
the resource consumer's subsequent record+64 OR80 store.

`beginBattleSceneResource` stores command words and byte1/delay **before**
the constructor, matching F06047190..0604730E and the Final counterpart.
`finishBattleSceneResource` advances source4 by10 only after real activation.
Factory plan snapshots and pending-control identities reject foreign plans,
parallel constructors and changed retained state. During this pending phase,
the control consumer does not decrement delay, and the scene-clock wrapper
does not advance main/actors. This prevents main6808 from treating intermediate
byte1 as a completed constructor. Once finish succeeds, normal ticking resumes.
This cooperative execution boundary does not establish actual task ordering
outside the constructor or elapsed CPU/DMA/display cadence.

Scalar message control fields32..63 now remain coherent with retained display0
data during execution; address/return words0..31 remain explicit bounded VM
contexts rather than fabricated physical addresses.

Composed latest-disc source→resource plan→begin→19 message steps→upload→
activation→finish comparisons now match all16 pre/post control bytes, all36
command words, all80 display bytes, all4 active bytes, and6,336 uploaded VDP1
bytes for one F and one Final message. Address words are compared using the
observed native carrier base and the VM's actual cursor/return offsets.
Synthetic integration tests additionally show pending initialization freezing
the main and actors, followed by6808 and actor execution resuming after finish.
The preinitialized context still comes from bounded probes in these comparisons;
product scene bootstrap and packet/payload loading remain unfinished. The UI
continues its labelled250ms gallery, and no full battle-loop or full weapon
clicked audit is claimed by this bridge.

### Dialogue payload input now comes from the owned disc

Scene sources now read BMESS.BIN through the same authenticated, checksum-checked
session cache. It is explicitly excluded from picture catalog/texture APIs and
remains read-only; no exported image or receipt includes it. Its source copy and
encoded-name view stay owned by the active session.

`editor-battle-dialogue-source.mjs` reuses the source-build CFG audit's BMESS
grammar:384 F /400 Final self-relative BE32 directory cells,20-byte record
headers and10-byte16/17/18 actions. The selected action supplies its packed
subject/selection words and record-relative body offset. Bounds, aliases and
token-boundary FF termination are checked without an archive scan or fallback
sentence. This reader does not choose a branch or invent runtime eligibility.

Ordinary payload composition copies a resolved encoded short name, appends F6,
then the body's own FF-terminated bytes. Packet construction retains the first6
action bytes and replaces the body offset with the composed text's arena address.
Runtime speaker overrides (including hero names), selector ownership and
conditional/random action selection are not inferred by these helpers.

Short-name reading follows the existing editor name decoder. A signed name-cell
target may escape the physical root13 into another part of the same bounded
decoded TSR; cell0 is not a count. The first physical-root-only version failed
on actual accepted relocated names and was replaced before claiming a pass.
The reader keeps the encoded bytes and the161-byte bound rather than mapping
through browser fonts or guessing a label.

For the retained F record86/action+068C and Final record22/action+054C samples,
owned-disc body/name composition matches all16/18 runtime payload bytes and
all10 queued packet bytes. Multiple reachable actions share those same bodies;
this match does not prove which control-flow path selected the sampled action.
Re-running the composed resource bridge with a fresh ring and these disc-derived
payloads (rather than copied runtime text) matches all16 control bytes,36 command
words,80 display bytes,4 active bytes and6,336 uploaded texture bytes per game.
Preinitialized display/scene context still comes from bounded native probes.
Full bootstrap, branch selection, scene composition, elapsed frame timing and
the complete clicked F/Final weapon audit remain open; UI playback is still the
labelled250ms gallery.

### BMESS physical selector bounds (2026-10-13)

`readBattleDialogueSelectors` reuses the source-build CFG audit grammar: ten
self-relative unsigned BE16 header roots and two consecutive six-byte key/root
tables, each retaining its inclusive FFFF fallback. Every root must point to a
complete opcode inside the selected physical record. The tables retain their
physical order; runtime ownership and branch eligibility are not inferred.
The locally owned F BMESS has 384 valid records / 7,421 selector sources;
Final has 400 / 7,557, with no bounds failures. Focused dialogue tests: 6 pass.
This is a data-structure audit, not a whole-weapon UI or replay verification.

Native producer entry candidates identified from actual instruction bodies:
F 06047998 uses R4 record base, R5 relative root, R6 channel; Final 0604D1B0
has the same inputs but retains the relative root in R9 rather than F's R10.
Headless, RAM-poke-free owned sample probes completed normally, but watches
starting at F frame 1450 / Final 1550 recorded zero entry hits. Therefore no
selected-root runtime match is claimed; an earlier capture window is needed.
Private traces remain outside the repository in native-dialogue-selector-entry
probe directories. Production preview still uses the disclosed 250ms gallery;
these selector readers do not yet replace that preview with full battle replay.

### Native selected roots and opcode 000D (2026-10-13)

Earlier capture resolves the missing producer calls: all four channels are
prepared at frame 1366 in the owned F sample, frame 1418 in Final. Channel0
enters record86 root0680 in F and record22 root04E8 in Final. Producer calls
occur before the later display initialization, not during the sampled upload.

`selectBattleDialogueRandomBranch` implements opcode000D from F060482F0 and
Final0604DA7E: explicit native random result, MUL.L low32 product by BE16 count,
logical shift16, then selected record-relative BE32 target. It neither creates
a seed nor guesses condition operands. Tables/destinations remain bounded.
Seven focused dialogue tests pass, including selection thresholds and failure
on an out-of-range result. Headless traces without RAM pokes compare actual
random-return values and next interpreter PCs: F roots0680/039B choose
068C/03B7; Final subject22 roots04E8/01BC choose054C/0214. All four match.
Final defender roots0020/03F4 choose002C/0484, also matching a header-compatible
source record. Several defender records share the captured32-byte prefix;
this does not uniquely prove the defender's identity. No whole-disc contiguous
runtime address mapping is assumed. Private native-dialogue-random-branch
reports retain the captures; no proprietary payloads enter this repository.

This improves the real producer path but does not yet supply scene bootstrap,
all conditional opcodes, production preview integration, or full UI audit.

### Bounded dialogue producer traversal (2026-10-13)

`readBattleDialoguePath` follows opcode000D with explicit captured random results,
retains 0010/0011/0012 actions in execution order, and terminates on FFFF.
Unknown conditional/metadata commands block explicitly, missing random values
wait explicitly, and a1024-command budget bounds cycles. This is producer
traversal, not a timing claim. Focused dialogue tests:8 pass.
The independent native path comparator matches all four F channels through
FFFF: [0680,068C,0696], [0020,002A], [002C,0036], [039B,03B7,03C1].
Final's defender32-byte prefix matches multiple distinct records; a candidate
produced a different path ([0020,0038,0042] instead of native [0020,002C,0036]).
Therefore that prefix is insufficient to identify the complete runtime record;
a bounded256-byte exact-memory probe is required before claiming its path match.

The subsequent exact256-byte headless probe identifies Final defender record323
uniquely among400 directory records. Using that source record, all four Final
producer paths match the actual interpreter through FFFF:
[04E8,054C,0556], [0020,002C,0036], [03F4,0484,048E], [01BC,0214,021E].
F's defender245/246 remain indistinguishable by32-byte prefix but both produce
the two captured paths; no unique F defender identity is claimed. The producer
path comparator checks native random values, every executed relative offset,
and completion across all four channels of each owned sample. It does not
establish any other weapon's paths, scene timing or production UI behavior.

### Scene-owned native random state (2026-10-13)

`editor-battle-random.mjs` implements F060A6448 / Final060AC928:
state = low32(state * 41C64E6D + 3039); result = high16(state) + bit15(state).
Both routines read/write GBR+828 and preserve MACL. Return65536 is possible;
the existing branch table guard rejects an out-of-table selection instead of
silently reducing it modulo count. No default seed is manufactured.
`readBattleDialoguePath` now accepts explicit scene `randomState`, consumes it
per000D and returns retained state. Captured result arrays remain an independent
comparison input; mixing both inputs is rejected.

Fresh headless RAM-poke-free watches compare198 F and196 Final random entry
states, plus their2/4 dialogue returns. All observed consecutive state changes
and return registers match. With only each channel's native initial seed,
the producer traverses all four previously verified channel paths identically.
The comparisons are in private native-dialogue-random-state reports; proprietary
source data remains outside Git. Twelve focused random/dialogue tests pass and
`git diff --check` is clean. These tests prove producer randomness, not UI replay,
real elapsed scene timing, all-weapon ownership or complete scene bootstrap.

### Source-derived producer stream to message display (2026-10-13)

`buildBattleDialogueStream` joins complete producer paths to the existing native
message resource/display bridge. It constructs each10-byte packet, allocates
composed text sequentially in a256-byte channel slice, retains the128-byte
command slice and terminates with FFFF. Speaker resolution is explicit per
action so hero/name overrides cannot silently use an ordinary subject name.
Unfinished paths, unresolved speakers, address overflow and slice overflow
are rejected. Thirteen focused random/dialogue tests pass.

A fresh private comparison replaces the previously hand-selected action with
the complete source-derived channel0 path and native initial random state:
F record86/root0680/seed2506326737 and Final record22/root04E8/seed141161605.
The entire12-byte command stream (packet and FFFF) matches native memory.
Its source-derived payload runs the existing19-command message program.
Both games still match pre/post control16 bytes,36 command words,80 display
bytes,4 activation flags and6336 uploaded VRAM bytes. Private report:
native-source-driven-message-resource-bridge-comparison.json.
This proves a sampled source-producer-to-display path, with ordinary speaker
names verified for these actions. The display still begins with captured native
constructor state. Full source-only scene bootstrap, actor/body/background
composition, native elapsed timing and editor UI wiring remain incomplete.

### Native message program preparation (2026-10-13)

`prepareBattleMessageFields` implements the program-entry preamble at
F06015A28 / Final06015EBC: memset the owned glyph arena's8C00 bytes, clear
scalar byte32 bit2, set byte60=16. It validates both retained contexts before
mutation. Program resolution/address-word storage and the other constructor
fields remain separate; this is not a complete scene initializer.
Fresh headless no-poke before/after probes match all60 retained fields after
the source pointer word and three256-byte arena samples (start,1800,8B00).
Both call sites retain identical operations. Focused message-clock tests:10
pass. A source-derived producer/display comparison now starts from the native
*pre-program* fields and executes this preparation rather than copying the
already prepared dispatcher state. The19-step source-derived message still
matches complete native control/words/display/activation and6336 VRAM bytes in
F and Final. Private report native-prepared-source-message-resource-bridge.
Constructor registration/rectangle/palette context is still captured: source-only
boot, complete attack composition, actual timed playback and UI audit remain.

### Battle message rectangle initialization (2026-10-13)

Fresh bounded native write watches identify the setup stores, rather than
assuming the rectangle from the later message record. In the owned F sample,
F06045F38/40/48/50 write columns33,rows6,left7,top20 at frame1428; Final's
0604B714/1C/24/2C writes the same at frame1487. Each setup writes textureID
FFFF and clears the active bit before display0's flags receive7C. Later texture
registration is separate (F sameframe; Final1488).

`initializeBattleMessageRectangles` implements the source's four-iteration
loop at F06045F20 / Final0604B6FC, retaining opaque fields, resetting each
textureCount, writing texture IDs70/72FFFF, and setting display0 word74=0110.
The following global palette/texture/source-pointer setup is explicitly outside
this helper. Seven display tests pass. Private write traces are retained under
native-message-rectangle-writes-{f,final}-1; captures verify display0's writes,
while the four-record loop is verified from both actual instruction bodies.
A combined native before/after four-record comparison remains to be added.
The production preview remains the disclosed250ms gallery; actual full-scene
bootstrap and playback/UI ownership audit are not finished by this change.

### Four-record initialization and registration bridge (2026-10-13)

Fresh no-poke before/after captures compare every byte of the four80-byte
records and all four counters at F1428 / Final1487. They exposed a missed
physical alias: counter offset0912 minus record stride08D8 is003A, so clearing
a counter also clears the next display's word58. The initializer now reflects
that write in its separate retained record views. All320 bytes and four
counters match both native captures after this correction. The display test
checks that alias explicitly;7 display tests pass.

The integrated private native-registered-source-message-resource comparison
now starts before rectangle initialization, performs it, calls the modeled
texture registration using explicit native retained predecessor/scale/palette
context, then prepares and executes the source-derived dialogue program.
It no longer copies a prepared display record or its generated texture/palette
entry from the upload capture. Both F and Final still match16-byte control,
36 command words,80-byte display,4 activation flags and6336 VRAM bytes.
The earlier opaque display allocation state and global resource context remain
captured; this is not full source-only battle bootstrap or timed UI playback.

### Direct editor click audit started (2026-10-13)

A fresh headless Edge session loads each owned accepted image through the actual
folder picker and editor opening buttons. Initial direct selections1/2/51/245
in both games succeed with zero page errors; screenshots are private. BeamSaber1
shows7 referenced pictures. This remains the explicitly labeled250ms gallery,
not native timed playback.

The whole displayed weapon-list audit enumerates1,222 F rows, clicks every row,
then selects every ready asset through the real select control, retaining each
canvas's cropped dimensions, SHA256 and stage height. The first journal snapshot
compares99 F weapon/owner pairs and935 rendered pictures to separately decoded
owned-disc references: every status, ready asset key, cropped dimension and
pixel hash matches; no stage-height variation in those935 selections.
This is renderer/reference correspondence, not proof that every native battle
uses those images. F/Final all-weapon game comparison remains incomplete.

The initial QA run terminated on a hidden selector for a sole ready image.
The probe now records that actual canvas directly. It also excludes hidden
stale options in an unmapped preview from rendered-picture comparisons; no
canvas exists for those states. Its private checkpoint was resumed after the
terminal error, not after an observation timeout. The new all-list run remains
live at the time of this note; continue polling the same process handle.
Private artifacts: native-preview-all-click-audit-20261013/report.json and
renderer-comparison.json; the native-preview-render-compare.mjs rechecks a
journal snapshot. No proprietary pixels are saved in the repository.

### Repeatable actual UI audit and further journal verification (2026-10-13)

The same live all-list browser probe continues; it was not restarted for polling
latency. A newer journal snapshot verifies625 F weapon/owner pairs and4,566
rendered pictures against separately decoded input-disc references. Every ready
asset key, cropped size and normalized canvas pixel hash matches; no stage-height
variation in these selections. This remains a gallery/reference audit, not
native battle-frame order verification. Final all-list coverage is still pending.

`scripts/editor-battle-click-probe.cjs` provides a bounded repeatable actual UI
probe with owned `--bin`, fresh `--out`, game, URL and optional runtime/browser
paths. It clicks the folder opening/editor/weapon controls, every selected row,
all its owners and each ready asset; it records pixel hashes/dimensions/stage
heights without copying the disc. Optional screenshots remain in the chosen
output directory. `--limit` bounds selected weapon rows (default2000); the
report includes available/attempted rows so a bounded run cannot be mistaken for
whole-list coverage. Unmapped hidden options are excluded from reported assets;
a sole image is inspected directly when the selector is hidden.
Fresh repository-probe executions with limit2 passed both real Fv0.5a and
Finalv0.3c, zero page errors. These validate the reusable probe, not the entire
game. Full timed replay, source-only battle setup and native/UI comparison for
all weapons remain unfinished. No release artifacts or deployment changed.

### Message scene resource setup (2026-10-13)

`prepareBattleMessageScene` models F06045E90 / Final0604B66C, using a cloned
retained native arena so physical field aliases remain coherent. It resets
message control, copies explicit retained graphics/GPU pointers, resolves the
font-source address supplied from owned TSR root36, sets palette bank48,
allocates the native texture-counter word, initializes four rectangles, and
applies the observed later display0 metadata stores. It does not manufacture
the earlier graphics allocator or opaque pre-battle display allocation state.

Fresh headless no-poke before/after captures match all observed stores in seven
message-storage slices (400 compared bytes, including overlapping slices of
records1/2), all16 control bytes and the allocator counter. Font address is
computed from the actual decoded TSR cell36 and explicit observed runtime base,
not copied from the post-state. Both F1428 and Final1487 match. Eight focused
display tests pass. Private comparison native-message-scene-setup-comparison.

The same live whole-list UI audit finishes the displayed F weapon list and starts
Final's1,305 displayed rows. It remains live; poll the same process handle rather
than restart. A complete decoded-reference comparison of the completed F journal
and advancing Final journal is running separately. This does not establish native
battle timing. Full source-only battle boot and production timed playback remain.

The journal comparison completes for1,351 F weapon/owner pairs /9,794 pictures,
and the initial50 Final pairs /498 pictures: all agree with independent decoding,
no stage-height variation. F journal has1,190 unique owned weapon rows; its
1,222-row UI list also includes32 rows without a selectable owner. Those were
clicked but the current journal has no per-owner record for them, so their
empty-state coverage is not established by the pixel comparison. The reusable
repository probe records attempted row IDs; the old private audit does not.
All-list ownership/empty-state completion still requires that missing evidence.

### Scene setup through actual message completion and empty-owner coverage (2026-10-13)

The integrated native-scene-setup-source-message-resource comparison now runs
scene resource setup, the modeled6848 control command with independently captured
input bytes, source-derived random dialogue traversal, command/text construction,
texture registration, program preparation, glyph rendering, upload and activation.
Font address is derived from scene.shortNames.bytes' full owned TSR root36.
Channel0 text address uses the separately verified native producer arena, not the
observed packet's payload pointer. Registration uses setup-derived base/count/bank;
upload uses setup-derived arena/tile addresses. Both games still match complete
control/command/display/activation and6336 VRAM bytes. Earlier opaque display
allocation and graphics/GPU resources remain explicit captured inputs; no full
source-only scene boot or native timing claim is made.

A separate real F UI session clicks the32 empty-owner rows missing from the
per-owner journal. Every row has zero canvases and statusunmapped, zero page errors.
The initial QA wrongly required the entire status panel to be hidden; native UI
intentionally keeps an unmapped explanation visible. The corrected check asserts
no rendered assets, preserving that valid UI behavior. The repository click probe
now journals empty-owner states too. Private empty-owner report ends in -20261013-2.
These32 rows plus1,190 unique owned rows cover the default displayed F list1,222.
The optional unused-record list is not yet included in this coverage. Final's same
live probe continues. A newer snapshot matches650 Final owner pairs /4,814 pictures,
with no pixel/reference or stage-height mismatches; it is not full Final coverage.

### Optional unused weapon list clicked in both games (2026-10-13)

A separate real editor session enables the actual unused-record checkbox and
clicks only the rows newly revealed by that checkbox. All57 F and102 Final
additional rows have no selectable owner, zero canvases and unmapped/idle state,
zero page errors. No previous weapon picture persists. Private report:
native-preview-unused-owner-audit-20261013/report.json. The repository probe
now accepts `--include-unused=1` and records empty-owner outcomes; an idle clear
state is valid for an unpreviewable record as long as no assets are rendered.
Its syntax check and `git diff --check` pass.

An advancing native-preview-all-click-audit snapshot independently verifies
1,250 Final weapon/owner pairs /9,417 pictures: all ready asset keys, cropped
sizes and canvas pixels match, no stage-height variation. The same live default
Final all-list run is not yet terminal. F's default-owned and empty-owner runs,
plus the57 unused rows, cover the displayed F catalog's1,279 unique rows.
That is direct UI/reference/empty-state coverage, not actual gameplay-frame
mapping or full timed battle replay. All-game runtime and timing work remains.

### Whole displayed catalog renderer/empty-state audit terminal (2026-10-13)

The original all-list browser process completed normally with zero page errors.
Its final independent owned-disc comparison passes1,351 F weapon/owner pairs /
9,794 pictures and1,669 Final pairs /12,762 pictures. Every ready asset key,
trimmed dimension and normalized canvas pixel hash agrees; no stage-height
variation. Separate fresh UI sessions fill all missing empty-owner rows:
32 F /26 Final, each zero canvases and unmapped. Additional unused-checkbox
coverage passes57 F /102 Final rows, also with zero canvases. Combined coverage
is1,279 distinct F /1,407 Final displayed weapon rows including unused rows.
Private final reports remain outside Git. This proves actual gallery selection,
reference correspondence and empty-state behavior, not native battle ownership
of every referenced frame, animation order or actual timing.

A new no-MCA coldboot flag-write probe completed at2,200 frames without timeout
or RAM pokes. Its first two writes to the sampled address occur at101 and546;
no verified font-mode initialization is established from them. Their code/data
identity must be checked before interpreting them as game display setup. Do not
substitute this observation for a startup contract. The private runner now
supports removing only its cloned MCA files for an explicit coldBoot plan and
reports stateResumed:false; no source state is deleted. Scene initialization,
production timed replay and native/UI whole-battle comparison remain unfinished.

### Fresh display storage and setup-program normalization (2026-10-13)

Accepted F coldboot with no MCA reaches the Korean title and then the main menu;
its early writes at101/546 are not demonstrated battle display initialization.
Do not interpret those reused RAM-address writes using later battle symbols.
The coldboot-menu snapshot is private. This question does not block the supported
message program: FD/F7/FC initialize its consumed cursor, width and home fields.

An independent native-fresh-source-message-resource comparison replaces the
captured pre-battle display storage and control with zero-filled buffers.
Scene setup and the owned program still reproduce the source-derived dialogue,
control16 bytes,36 command words, consumed display fields, activation4 bytes and
uploaded6336 bytes in both games. Program source address is computed from owned
TSR root24 and the explicit observed runtime base, not copied from a post-state.
Inactive return slots8..31, unused header bytes and unused tile words76..79 do
not match old UI leftovers and are expressly excluded; this is not full80-byte
memory equality. Earlier comparisons with retained native storage still match
all80 bytes. Retained graphics allocator/predecessor context is still supplied.

A regression exercises fresh/narrow, previous-wide and previous-alternate-window
flags with old cursor/home values. The actual-style setup program generates the
same two-line glyph arena, scalar result and VRAM in all three cases. It checks
known foreground pixels on both lines, not just mutual equality. Eleven focused
message-clock tests pass; `git diff --check` passes. Full actor/background scene
bootstrap, real elapsed timing and production replay integration remain open.

### Library render admission connected to queue generation (2026-10-13)

`editor-battle-render-gate.mjs` models F060ABD8C / Final060B226C from64
identical instruction bytes. It sets the request flag, increments the16-bit
attempt counter, checks queue capacity, repeatedly logically shifts the retained
reference depth, subtracts it in the branch delay slot, checks signed near/far
bounds, and commits queue count only when admitted. Rejection restores the outer
native PR and bypasses emission. Shift0 or signed-negative shift counters would
enter an enormous native DT loop; unresolved inputs fail before model mutation.

Fresh headless no-poke captures compare750 admitted calls per game. Normalized
R2, candidate count R7 and request/attempt state all match. Watched success PC is
before the native count store, so the comparison uses R7 rather than claiming
a post-store memory match. No actual rejection occurred in these samples;
near/far equality, overflow/delay-slot and capacity cases have focused source-
grammar regression tests, not native runtime rejection coverage.

`createBattleAdmittedUnrotatedQueueRecord` joins admission to the existing
positive-scale unrotated emitter: its sort word is derived from normalized
library depth, rather than caller-supplied raw movement depth. Culled requests
emit no command. Invalid/negative-scale requests remain explicitly unsupported
and cannot partially mutate the admission context. Nine combined gate/attribute
tests pass. With separately captured retained admission settings, the two existing
F/Final body-request fixtures still match all28 native queue bytes without using
their observed depthWord as an input. Private native-render-gate-comparison and
native-admitted-queue-comparison retain the evidence. Full scene composition,
negative/scaled/rotated emitter paths, native sorting and timed UI playback remain.

### Native record ordering connected to Canvas (2026-10-13)

Publication F060B1958..060B1A04 / Final060B7E38..060B7EE4 uses two128-head
physical tables (0400 bytes total), with256 temporary low-byte heads after them.
Producer depth words0..32767 index the selected pass's high-byte table. The
upper physical table/pass0 publishes first, lower/pass1 second. Within each,
descending high/low traversal and double prepend preserve emission order for
equal depths. `orderBattleRenderCommands` reproduces that algorithm; explicit
pass/depth are required. It does not synthesize pass-transition state commands.

Fresh CPU1 headless no-poke captures match60 completed F publications /1,960
record addresses and62 Final publications /1,966 addresses. Consumer record+30
supplies depth, recorded flag169 bit0 supplies pass, and the actual publisher's
R6 supplies each output address. All order agrees, including equal-depth records.
The unclosed hit-quota tail is excluded. Only pass0 occurred in these samples;
pass1 order is source-grammar tested, not native runtime verified. Three tests
pass for depth boundaries, tie order, pass order and invalid contexts.

`paintBattleSceneCommandFrame` now sorts scene commands before the existing
Canvas painter. Pass1 blocks explicitly pending its state-change descriptors.
A real headless browser draws overlapping synthetic near-red/far-blue sprites
with opposite emission order and verifies the final red pixel in a stable320x224
canvas; unsupported pass1 leaves that existing pixel unchanged. No game fixture
is embedded. The Canvas's rotated rasterization remains an approximation and
its unsupported color operations remain blocked. Full source scene initialization,
pass transitions, scene playback timing and production UI wiring are still open.

### Explicit second-pass state commands in the Canvas stream (2026-10-13)

Publisher transition literals resolve to retained commands060FFF00 /060FFF2C
in F and Final. Private state samples decode respectively as user clipping
(min0,0/max319,223) and local coordinates160,112. These are explicit inputs;
commands are not synthesized from sprite/catalog dimensions. Earlier native
publication captures exercised pass0 only, so actual pass1 execution remains
unverified by those traces.

`paintBattleSceneCommandFrame` now inserts supplied clip/local descriptors
between ordered pass0/pass1 commands. Missing/wrong transition descriptors still
block. The painter processes state changes on a private state clone and freezes
each draw's own clip, preventing a later pass from changing earlier draws. All
commands are resolved before canvas mutation. Unresolved system-clip resizing
still blocks; fixed frame dimensions are retained.

A real headless browser overlap test combines different clip rectangles/local
coordinates and verifies red at0,0, black at1,1, blue at2,2 and black at7,7 in
320x224, with the caller's state unchanged. This exercises per-draw state snapshots
and transition ordering. F/Final stored transition commands decode to the expected
native values. No proprietary pixels or snapshot fixtures enter Git. Full native
pass1 scene comparison, renderer color/rotation fidelity, source-only actor and
background initialization, and actual timed production playback remain open.

### Combined battle regression verification (2026-10-13)

After admission, sorting and pass-state integration, the entire current
`tests/editor-battle-*.test.mjs` set completes:291 cases,290 pass,1 skipped,
0 failures. Both actual headless Canvas proofs are rerun against the current
local served modules: depth overlap and per-pass clip/local snapshots pass.
These cover the assembled helpers, not production timed replay. No completion
claim is made for full scene bootstrap, hardware rasterization or native timing.

### Mutable actor render-layer depth lookup (2026-10-13)

F0603C428..0603C466 / Final06041824..06041862 select variant1's first
four-long table or the adjacent second table for other variants. `resolveBattleRenderDepth`
reads explicit retained32-byte table state; it does not assume EXE defaults.
`createBattleSceneResolvers` accepts explicit rendererContext and exposes the
lookup to drawing. Missing context stays unresolved, and live table/variant
changes are observed by subsequent calls.

Fresh headless no-poke captures match280 F /100 Final table lookups against R2
and the actual variant byte. Only mode2/variant1 occurred in these samples;
other selections have source-grammar tests. The table addresses are F060B3430
and Final060B9A68 with their second tables+16. Native retained values are not
interchangeable with original executable initialization bytes. Twenty-one
actor-layout/resource tests pass, including table mutation, explicit variant
selection and missing context. This fills the layer-to-depth resolver contract;
it does not implement the game routine that initializes/updates those tables.
Full source-only scene bootstrap and actual timed production preview remain.

### Correction: sampled depth tables retain executable defaults (2026-10-13)

Reinspection of every depth lookup gives R2=0 for mode2/variant1:280 F
and100 Final calls. All32 table bytes are identical to the owned executable's
initial tables. The earlier handoff claim that native mode2 changed to -5*65536
was incorrect: that value comes from the synthetic mutation test, not a native
capture. No runtime mutation is established. Master/slave cached/uncached
write watches, plus master watches without the change-only filter, completed
without a matching write. This is consistent with unchanged tables and does not
prove that every game path leaves them unchanged.

`readBattleRenderDepthTables` now copies a bounded32-byte range from an owned
executable using explicit load base/address. It never substitutes a captured
table or guessed load base. F's verified address is060B3430 and Final's
060B9A68, with executable load base06004000. Production scene bootstrap and
timed UI replay remain unfinished.

### Owned-disc depth initialization integrated into scene sources (2026-10-13)

`resolveBattleSceneSources` reads the session-local executable0 and attaches
its bounded32-byte `initialRenderDepthTables`. A present but truncated executable
blocks with `scene-render-depth-bounds`; an absent source leaves initialization
unresolved. `createBattleSceneRendererContext` requires an explicit variant and
copies these tables per scene. No captured table is supplied as initialization.

A fresh authenticated read of both owned accepted discs compares every table
byte and mode lookup against the existing no-poke game traces:280 F /100 Final
calls match. Native variant bytes remain explicit comparison inputs, so this
does not prove variant/bootstrap derivation or whole-battle playback. Mapping,
resource, core and worker regressions pass59/59. The combined battle suite passes
295/296 with1 skipped. Production remains the250ms reference gallery; graphics
initialization, complete scene composition and native timed UI playback are open.

### Native per-texture sprite palette assignment (2026-10-13)

`resolveBattleTexturePaletteBanks` models the sprite loader's material lookup:
read BE16 at attribute+4, shift right4, mask63, add explicit baseBank,
store low8 bits. Native loop F060329C6..06032A02 / Final06037C4A..06037C86
uses ten-byte texture attributes. Final carries baseBank in R13 rather than
F's R12; its otherwise matching mapping cannot be verified by treating the
entire routine as byte-identical.

Fresh no-poke headless captures at the completed loop compare all newly
assigned entries for four loads per game. Every69 texture-bank byte matches
in F and Final, including shared resources and the two attack effect records
at bases128/132. Source attributes and observed baseBank are explicit inputs;
this does not derive allocation order from disc alone. Thirteen palette tests
pass, including byte wrap and material-bit masking. No game assets enter Git.
The production preview still uses250ms gallery playback. Palette context
bootstrap, full scene composition and native timed playback remain required.

### Live palettes and coherent asynchronous frame preparation (2026-10-13)

`prepareBattleSceneDraws` can now consume an explicit live palette resolver.
It requires matching asset identity, a bounded word array and explicit offset;
missing/foreign palettes stop rather than use original gallery colors. Each
prepared image retains its own copied colors. A later palette update changes
the next frame without modifying an already prepared frame.

All resource links and signed layer depths are resolved before asynchronous
texture reads. Palette application occurs in one synchronous phase after all
reads, avoiding different color generations within a frame. A race regression
changes resource generation, layer depth and colors during reads and verifies
that both drawings retain the original links/depths and use the same final
colors. Missing depth blocks before any texture reads. These are pipeline
regressions, not full native scene/video agreement. Actual palette context
bootstrap and production native-timed playback remain unfinished.

### Sprite-loader completion counters and allocation discontinuities (2026-10-13)

Fresh no-poke completion watches at F06032A44 / Final06037CCE each record
four completed loads. Observed nextBank values are92,97,132,134 in both games.
Texture totals are57,62,74,82 in F and59,64,76,84 in Final. Paired with the
previous mapping-entry captures, bases are74,96,128,132 and loaded texture
counts45,5,11,8. Thus a simple contiguous allocator inferred from header slots
would be incorrect: intervening initialization changes the next source base.
The attack effect pair itself advances128→132→134.

Source disassembly shows the texture total increments by the difference of
new/end and previous texture indices; the source bank total adds an unsigned
byte count. Mode1 also updates a slot base from the preceding base plus that
count. Actual map addresses are F060B32CA / Final060B9902; bank-total globals
are F060CAC52 / Final060D20E2. The first Final completion probe mistakenly
peeked060D10C2: those36 bytes are not used as bank evidence. Next-bank register
R13 and texture-total060C6EF8 are correctly sampled. All probes terminate
normally. The next required probe is the intervening reset/base updates and
actual slot-map writes; do not manufacture sequential allocation across loads.

### Correction: explicit load bases rather than intervening bank resets (2026-10-13)

Watching the actual bank-end globals across both full attacks catches exactly
the four sprite-completion writes:0→92→97→132→134. No intervening write
changes those globals in these samples. The prior statement that intervening
initialization changes that counter was an unverified hypothesis. Loader
R6 supplies the base independently; completion stores suppliedBase+unsigned
byte bankCount, not old bankEnd+bankCount. The slot-base map is separate.

`advanceBattleSpriteLoadCounters` now implements the two bounded16-bit
completion stores with explicit load inputs and validation before mutation.
Texture totals advance by the loader's end-minus-old count, which need not
equal the material-mapping loop count (the third sampled completion adds12
but the material map covers11). Tests reproduce both observed counter series
and16-bit wrap. Fourteen palette tests pass. Source-only derivation of caller
bases and slot-map writes, full scene initialization and timed UI playback
remain open.

### Preserve source loader slots and capture explicit caller bases (2026-10-13)

Scene sources now include six `weaponGraphicLoads` actions in header order:
each retains its raw selector, load/reuse kind and exact physical record bounds.
Repeated physical records remain distinct slot actions; unique gallery records
are still shared separately. FFFF means reuse and does not manufacture a record.
The mapping regression checks duplicate slots0/2 and reused slots3/4/5.
Twenty-four mapping tests pass.

Fresh entry watches F060328C8 / Final06037B4C confirm four sprite-load calls
per sampled attack. Common cache16 receives base74 and cache18 receives base96
from callers F060403E6/06040412 and Final06045A26/06045A52. Weapon cache0
receives base128 and cache5 receives132 from F0601A49A / Final0601A972.
R5 is4 in all these calls. The two weapon inputs share the staging pointer
202D0000 at different times: their contents must not be treated as one immutable
record. Both headless probes terminate normally. This establishes caller/cache
identity for the sampled attack, not all-weapon base derivation or complete
source-only initialization. The next code inspection is that weapon caller's
slot-to-base calculation. Production timed playback remains unfinished.

### Weapon loader command-to-cache context (2026-10-13)

F0601A470..0601A498 / Final0601A948..0601A970 reads the command's second
byte, multiplies it by2, loads a cache byte from F060CAC01 / Final060D2091,
then reads the16-bit base word at that cache index from F060B32C8 /
Final060B9900. The previously documented mapCA/9902 is the next-slot write
origin, not the read origin. The caller passes format4 and a separately loaded
staging record to the sprite loader.

`resolveBattleSpriteLoadContext` implements these explicit retained-map inputs
and rejects absent/truncated maps or cache indices outside the bounded native
16-word source. Tests exercise remapping, aliasing, full unsigned word values
and missing context;15 palette tests pass. Fresh pre-command/loader-entry
comparison probes are tracked privately; no whole-scene or production playback
claim follows from this resolver alone.

The fresh pre-command/entry comparisons completed normally. In both games,
the two weapon calls resolve cache0/base128/format4 and cache5/base132/format4
exactly against loader registers. No observed loader output is supplied as the
resolver's input: it uses the preceding captured command byte/cache map/bank
words. Scene resource resolvers now expose this lookup through explicit renderer
context; missing maps remain unresolved and later bank changes are read live.
Twenty-eight palette/resource tests pass. Retained-context comparison does not
prove source-only creation of the cache map or full scene playback.

### Cache15 is a script-controlled counter, not a static header map (2026-10-13)

Fresh write watches over the actual cache bytes complete in both games. During
the sampled weapon setup, F060411F6 / Final06046836 sets logical cache15's
word to0; F06041262 / Final060468A2 increments it1..5, later6. The two
weapon load commands both request logical index15: its changing low byte
selects physical cache0 and then5. Therefore assigning fixed headerSlot mappings
to logicalIndex15 would be incorrect. Cache words are stored at F060CAC00 /
Final060D2090; the load helper reads their low bytes from+1.

Disassembly shows the setters read command bytes2/3 as a BE16 word, while
the incrementer performs a16-bit word increment. Other sampled writes include
FFFF termination through separate helpers. The next implementation must track
these script-controlled cache words, including word wrap and low-byte lookup,
and identify their main opcode dispatch before wiring scene execution. These
observations change the bootstrap plan; no source-only initialization or full
playback claim is made.

### Cache-counter commands implemented in the main VM (2026-10-13)

F's main68 dispatcher resolves the subtable at060B4848. Subcommand12 points
to060411D0 (set),13 to06041208 (signed comparison),14 to0604124C
(increment). Set returns6004 and increment6002, continuing the same native
invocation after respectively4/2 bytes following main68. Main VM commands
`68 12 index BE16` and `68 14 index` now mutate explicit retained
`resourceCacheWords`, consume5/3 total bytes and continue without extra ticks.
Missing/truncated context blocks before mutation. Uint16 storage preserves wrap.

The sprite-load resolver now reads a supplied counter's low byte directly,
without manufacturing a static slot map. Supplying both representations is
rejected to prevent divergent state. Scene resource resolvers expose these live
words to later loads. A regression runs source-shaped setup plus five
increments in one tick and resolves cache15 to physical5/base132; it also
checksFFFF→0000 and absent/truncated operands. Fifty-eight main/palette/resource
tests pass. Main6813 signed comparison and its native zero-return semantics
remain unresolved and are not skipped. Full source bootstrap, actual battle
composition, native presentation timing and production playback remain open.

### Main6813 signed cache comparison and zero-return pause (2026-10-13)

Main6813 now compares the cache word and BE16 threshold as signed16-bit
values. Counter≤threshold returns6004 and continues after5 total bytes.
Counter>threshold returns0, retaining the current command and exiting the
invocation. The dispatcher F06004E76..06004EAC routes exact0 through
06004FA2..06004FA8 directly to its return; it does not end the program or
advance the cursor. Nonzero low-nibble cases use separate paths and are not
conflated with0.

Fresh no-poke helper-return captures at F0604123C / Final0604687C compare
36 calls each. JavaScript agrees with native0 and6004 for every captured
operand pair. Tests additionally cover signed boundary values, equality,
retained cursor, release after counter changes and actors continuing while
main pauses. Thirty-eight main/scene-clock tests pass. Runtime captures compare
the helper's result; they do not claim whole-scene cursor/video equivalence.
Source-only cache initialization, native resource loader execution, complete
composition and actual production timed replay remain unfinished.

### Actual common-program frontier and main6809 readiness gate (2026-10-13)

A bounded authenticated-disc common-program inventory executes one invocation
per source entry with explicit exploratory cache words, recording unknown
commands/context requirements. This is not a native bootstrap: several entries
are descriptors or need actual caller context. Common10 in both discs stops
at main6809. Its handler F06040924 selects a word by flag bit6, then requires
that word, a second unconditional word and a byte to be zero. Nonready returns0
at the same cursor; ready returns6001 and continues after2 total bytes.

The VM now consumes explicit `sceneLoadGate` state: flagsByte, two selectedWords,
pendingWord and pendingByte. No default ready/zero state is installed. Tests
check selected-side distinction (an unselected nonzero word does not block),
both unconditional gates, retained cursor and missing context. Thirty-two main
clock tests pass. This implementation is source-grammar checked, not yet a fresh
native readiness comparison or source-derived producer for those globals.
Actual common-program execution now exposes missing gate context; native whole
scene initialization, composition and timed production replay remain unfinished.

### Main6809 instruction-level verification and absent runtime coverage (2026-10-13)

Fresh headless return watches F0604096A / Final06045FAA complete normally
but yield no calls during the sampled blue-charge attacks. Therefore those
runs do not verify the readiness helper and are not counted as native agreement.
The actual globals are F060C06C0,060C0864,060C068C,060CABCA,060CABF4;
Final060C6B30,060C6CD4,060C6AFC,060D205A,060D2084.

The existing SH2 analysis interpreter executes each owned executable's actual
handler over216 concrete retained-state combinations (flag bytes0,64,128,255;
selected words0,1,FFFF; unconditional word0/FFFF; byte0,1,255). All432
returned results agree with the VM's ready6001/wait0. These are synthetic
input instruction comparisons, not runtime battle evidence. Source-state
producers and a game route that executes this helper remain required before
claiming full scene correctness. No proprietary fixtures enter the repository.

### Selected source main first stops at background initialization (2026-10-13)

A fresh authenticated read executes the selected weapon1 main carrier in each
latest accepted disc. The first stop is main6A at carrier offset50, operand16,
with `background-context-missing`. This is a source-context frontier, not a
reason to substitute empty background groups.

Scene sources now retain six `bankGraphicLoads` actions from D_ANIME+20..30.
Root8's six768-byte banks contain64 start/bankEnd/mapEnd triples. Each load
retains its exact tile-bank and paired map spans in E_BNK; reusedFFFF slots
remain explicit, and malformed directories/selectors/carrier extents block.
Absent root8 leaves the bank-loading context null, never fabricated. These
references do not claim background plane placement or DMA reproduction.

Scene resource resolvers also expose signed background factors from the owned
BTSR cell1 and an explicit mode through the existing bounded parser. Missing
mode data does not become zero factors. Twenty-five mapping, fourteen resource
and twenty-two core/worker regressions pass. Both owned-disc scene reads still
complete and the prior280 F/100 Final executable-depth comparisons remain
valid with the added bank reads. Actual background-group initialization,
mode selection, full scene composition and production timed playback are open.

### Source-derived VDP2 background groups and corrected record origins (2026-10-13)

`editor-battle-background.mjs` reads canonical BTSR cell2's mode-indexed
BE16 self-relative offsets (native16-bit wrap), four count bytes and paired
BE16 factor/control entries for the two groups. Native constructor
F0604595C..06045B9A repeats each group's rows twice, clears both offsets and
adds a0/0200/0/0 end row when count≤63. Larger counts retain native end-row
state, so source-only initialization remains unresolved for them.

The first source/native comparison exposed a header-origin error: adding8
again gave count16 instead of native13. Actual runtime pointer matching finds
the layout at canonical BTSR cell2 target788, and factor data at cell1
target468 in both owned files. Native getter +8/+4 is already accounted for
by those canonical file targets. The layout parser and existing factor reader
now use those targets directly; prior documentation claiming an additional
+4 factor offset is superseded by this observed evidence.

Fresh no-poke constructor captures compare source-derived factors, controls
and both offset longs for every initialized row: F two initializations in
modes2/1,72 records; Final one initialization in mode0,6 records. Every field
and group count matches. Mode is the only captured initializer input; table
contents come from the authenticated owned disc. Scene resolvers expose a
combined background context for explicit mode. Forty-eight background/main/
resource regressions pass. Mode selection, background pixel publication,
other startup contexts and complete timed production playback remain open.

### Actual body startup and correction to actor activation (2026-10-13)

With explicit exploratory mode0/direction context and source-derived background
groups, selected weapon1 main execution passes6A and stops at69/offset52
in both games. It still needs actual main/actor startup context; this probe
is not a source-only complete scene.

Fresh no-poke slot1 write watches confirm pool bases F20223000 and
Final20216000 before/after the attack. Startup allocates flag80, then
F0603FE8A..0603FE92 / Final060454CA..060454D2 writes selector0800,
x0500 and depth0440. The native attribute helper stores flag88, color2,
mode2; main69 later makes the body visible withC8.

This reveals a real VM error: active flag7 was mapped from attribute bit10
instead of bit4. F0603BFBE..0603BFDC performs signed right3 then left6,
equivalent to `(attributes<<3)&128` for this flag. The code now maps bit4.
A011 therefore retains native88 instead of incorrectly dropping to08.
Existing synthetic tests that encoded the erroneous bit mapping are corrected
to the observed/source behavior; the inactive-cursor scheduler test now uses
F001, whose bit4 is actually clear. The whole battle test set passes310/311,
with1 skipped. This corrects rendering admission for bodies/new actors, but
body startup sequence/context derivation and complete production playback
remain unfinished.

### Retained body-record startup helper and native comparison (2026-10-13)

`initializeBattleBodyActor` now models the post-allocation body setup at
F0603FE84..0603FEF4 / Final060454C4..06045534: selector0800, x0500,
depth0440; flag2 bit1 follows unequal direction bits6/7; attributes are
A011/A111. It requires an actually allocated/live record and explicit
direction, preserving existing cursors, delays, secondary track and parent
state rather than manufacturing/resetting a pool record.

Fresh no-poke pre/post captures compare every field returned by the current
native76-byte layout reader. One F and one Final initialization match exactly
using pre-state and its observed direction as input. This is all modeled
fields, not a claim that all76 raw bytes or whole scene state are reproduced.
Mirrored/source-mask boundaries and retained-track preservation are additionally
tested;48 actor-clock tests pass. Source-only pool allocation/bootstrap,
defender setup, scene metadata, frame timing and complete production replay
remain unfinished.

### Exact raw actor reset, including opaque retained bytes (2026-10-13)

The pool reset caller F0603B9F8 invokes F0603BE20 with start0/end127.
`resetBattleActorRecord` models one bounded iteration in canonical CPU byte
order: slot byte, cleared flag1, flag2&0C, clears4..73, then depthA00000,
scales100/100, word54=00FF, byte64=10 and parentFF. Byte3 and word74
remain unchanged. Native flag1&1 followed by long maskFFFE7FFF actually
clears flag1 bit0; flag2's intermediate mask8C is preceded by clearing bit7.
The combined masks agree with existing model-level reset defaults.

Fresh no-poke per-iteration pre/post captures compare all76 bytes for slot1
in five resets per game. Every reset matches exactly. Eleven layout tests
pass, including retained header/tail, immutable caller bytes and invalid slot
rejection. This verifies the reset recipe, not all128 slots' startup history
or adjacent draw record128, and does not create unknown prior bytes from zero.
Whole scene bootstrap, defender state and timed production replay remain open.

### Defender initialization and authenticated opponent body binding (2026-10-13)

Post-allocation defender setup F06040020..06040090 /
Final06045660..060456D0 uses selector0900, origin0500/0440, opposite
facing from the attacker, and attributesA211/A311. The body initializer
now accepts an explicit defender role; native rendering word72 becomes16.
Fresh no-poke pre/post captures agree for every modeled field in one F and
one Final record. Mirrored variants have source-mask tests, not runtime claims.
Forty-nine actor-clock tests pass.

`inspectEditorBattleSceneSources` accepts optional own-data opponentUnitIndex
and validates it within the same authenticated session. Source mapping reads
that unit's actual raw graphics selector and C_ROBOT range, attaching an
explicit group9 record plus its own unitByte10. Missing opponent remains null;
unknown/truncated records block rather than borrow the attacker body.
Mapping/core/worker regressions pass48 cases; the optional accessor is never
evaluated, consistent with existing own-data request handling.

Fresh latest-disc reads in both games bind attacker1 and opponent2 to distinct
body records and decode the opponent's native padded144x112 texture through
the checked source API. Invalid opponent999999 is rejected. This proves
identity/resource binding, not those units' complete battle timeline. UI
opponent selection, pool/startup metadata and full native timed production
playback remain unfinished.

### Assembled retained startup clock, progressing real main carriers (2026-10-13)

`createBattleSceneStartupClock` combines validated source programs/background
with129 explicit retained76-byte records. It resets0..127, preserves the
adjacent draw record128, builds distinct actor clocks from the owned common
program, allocates attacker1/defender4 and runs their verified startup helpers.
Direction, main flags/pause/reaction byte, renderer variant/depth tables and
background mode are required. No missing startup state becomes a default.
Caller records and scalar shared state remain unchanged.

A synthetic integration regression runs69 after assembled startup and verifies
attacker C8 at1664/1088, separate defender0900, retained opaque bytes and
record128, plus rejection of absent state. Fifty-nine scene/actor/background
regressions pass.

Fresh actual-disc carrier runs for weapon1/attacker1/opponent2 now pass6A and
69, stopping at6F offset60 with missing graphics initialization. These runs
use explicit exploratory mode0/direction/flags and retained pool bytes from
the private own-game state; they do not derive all startup state from disc
alone and do not claim native timeline agreement. This assembles the existing
verified pieces into one execution path. Source-only startup, palette/queue
publication and complete timed production replay remain open.

### Owned executable palette mapping and startup transfer bindings (2026-10-13)

Scene sources read bank-base words and the64-word address map from owned
executable0: F060B32C8/060B32E6, Final060B9900/060B991E. The last
base word overlaps the first address-map word; source reader and per-scene
renderer context preserve this alias in one158-byte semantic word arena.
Source bytes stay immutable. Native table snapshots before and after the
sampled attack agree with all64 source-derived address-map words in both
games. This validates those maps, not all dynamic bank-base allocation.

`createBattleScenePaletteBindings` joins the existing selector and6F word
transfer to explicit live source/destination words and renderer tables. The
assembled startup accepts optional prepared paletteState; missing palette
data remains a frontier. No placeholder colors or no-op transfer are installed.
A pipeline regression exercises FF14 selection, actual mapped destination
writes, untouched surrounding words and live mutation of the overlapping
base/map word. Thirty-nine palette/resource/scene-clock tests pass. Source
palette loading/allocation still needs complete initialization before the
production preview can use this transfer. Full source-only startup, scene
composition and native timed playback remain unfinished.

### Authenticated body colors and reserved-palette registration (2026-10-13)

Fresh no-poke body pre/post captures read the source pool pointer and banks
58..65. Authenticated C_ROBOT palettes for F unit34 (Aphrodite) and Final
unit6 (Wave Rider) match all16 declared color words in both captures per
game. Existing pool-entry traces show actual calls58/count1 and62/count1.
Inspection at F0603FE30..0603FE42 confirms count>4 aborts before registration;
this is a real body-loader limit, not a guessed palette capacity.

`loadBattleBodyPalette` now connects a checked complete body palette to the
existing retained pool at58/62, requiring an explicit valid source address.
It does not update the generic effect bank-base map. Unsupported counts,
occupied banks and malformed records preserve the pool refusal behavior.

`readBattleSceneBodyPalettes` freezes both body asset identities before
asynchronous checked reads, copies resulting color words and rejects foreign
keys, invalid declarations, overlarge banks or cancelled reads. Missing
opponent remains unresolved. Thirty-three palette/resource tests pass,
including duplicate occupancy, count limit and mid-read selection races.
Source arena initialization and complete common/effect palette allocation
still must be connected before production native-timed playback is complete.

### Body palette preparation assembled into source startup (2026-10-13)

`prepareBattleSceneBodyPaletteState` validates explicit retained source/destination
words, occupancy bytes, executable-derived renderer tables and aligned temporary
source addresses. It snapshots palette state before asynchronous checked body
reads, resets the private arena with the verified native recipe, registers
both body palettes and returns prepared state only after success. The caller's
words, table bases and occupancy state are never partially changed. The last
128 source banks and occupancy side bytes retain their native reset semantics.

Actual-disc startup probes now use this preparation with the authenticated
attacker1/opponent2 palettes, then execute real main carriers. Both games pass
6F and enter common6. An explicit metadataIndex option resolves branch context
from owned BTSR type and the selected unit's actual byte10; metadata0 is an
exploratory environment choice, not a claim about the captured battle map.
The current first stop is6848: F common6 offset15747 / Final16900, missing
scene-control source/state. Forty-two palette/resource/scene-clock tests pass.
These probes still supply retained pool/arena bytes and explicit startup flags;
they do not establish source-only startup or complete native frame timing.
Scene-control/message context, common/effect resources, composition and
production replay remain unfinished.

### Retained scene-control record bound into assembled startup (2026-10-13)

`readBattleSceneControl` decodes the currently modeled fields from an explicit
16-byte CPU-order record. `writeBattleSceneControl` writes those fields on a
copy of retained bytes, preserving bytes2/3 and8..11. It does not claim to
implement consumers of those opaque fields. Startup accepts explicit
controlState bytes and two source bytes, snapshots them and binds the existing
6848 helper without introducing default readiness or skipping message work.

The control codec/helper regression verifies mode bits, packet buffer selection,
cleared timer and preserved caller/opaque bytes. Nineteen control/scene-clock
tests pass. Fresh authenticated-disc startup runs with the private retained
control inputs now pass6848 in both games, stopping at6826: F common6
offset15749 / Final16902, missing fade context. Startup context remains partly
retained/exploratory; this is assembled source execution, not whole-battle
frame/video agreement or source-only initialization. Fade/main-task state,
message production, complete resources and timed production replay remain open.

### Retained fade/task binding and changed native reaction path (2026-10-13)

`readBattleSceneFadeState` binds explicit84-byte task state, renderer shadow
register/RGB words and signed limit word into the existing fade helper. It
reads the run-through byte71, unsigned pause word72, signed counters76/80
and separate color banks; caller bytes remain immutable. Startup accepts
optional explicit fadeState instead of manufacturing fade counters or colors.
Fourteen fade/scene-clock regressions pass.

Static pointer verification corrects the private Final control-source seed:
6848 reads060C69E0, not060C69F0. Final's fade limit is060D269A, not the
previous inferred060D26A8. These corrections affect private state extraction,
not committed game bytes. Source/menu states in both games contain main byte71
128, pause0 and reaction131.

Using this actual retained reaction byte changes main69 from the earlier
exploratory direct placement into assignment of common actorF000. The old
private assertion expecting immediate visibleC8 is therefore contradicted and
not used as verification for that input. A separate diagnostic shows the
current first stop is actor1/common source offset160:FA42, a movement command
not implemented yet. Consequently these runs do not prove that fade executes
or that whole scene timing agrees with the game. The next required work is
FA42's target-movement contract, followed by the remaining startup/message
and renderer publication. Production timed replay remains unfinished.

### FA42 movement and FA45 side selection continuation

FA42 is now modeled from F060339C4. Its BE16 operand is a completion
branch; movement speed comes from the long at060CAC54, written by main69
at060442B0..060442B4 using control&63. Native zero-denominator division is
preserved. Owned-source startup diagnostics for both games now reach26
ticks, then stop at FA45 with missing unit context; these diagnostics still
use retained state and explicit exploratory startup parameters.

Startup now binds the owned BTSR anchor table. FA45 selects the side unit
word using direction bit6, matching F side structs060C0640/060C0660 and
Final060C6AB0/060C6AD0, word offset10. A headless Final run reached the
consumer06038FFC at frame1618 with side IDs6/88 and direction bytes0000.
The corresponding F run had no FA45 hit, so it supplies no F runtime
comparison. Private evidence: native-anchor-side-comparison.json. The
clock/main/scene focused suite passes91 tests. Full replay, presentation
timing, and final UI audit remain unverified.

### Authenticated side IDs and surfaced display wait

Startup binds selected/opponent record indices in direction-bit6 side order.
Owned F and Final diagnostic inputs now run120 ticks without an unsupported
actor command. Extending the same probes to2000 ticks reveals a stable
main cursor97:6808/80 waiting for sceneControl.byte1>=128, with byte1 still0.
This is a missing asynchronous display-consumer update, not proof of a
complete battle or2000 ticks of visible animation. Scene results now expose
control/load/flag waits while continuing actor updates. Focused tests92 pass,
including both side orders and visibility of the wait. Next integration must
run the actual packet/message consumer; forcing its completion byte would
hide required work and is not an acceptable fix.

### Scene display-task integration

`advanceBattleSceneDisplay` now joins packet consumption, branch planning,
message initialization and activation receipt validation. It is a separate
task boundary; its call frequency and ordering must still be wired from the
native scheduler. Pending initialization prevents scene updates. Timed
packets select their duration branch before requiring any message-only
command words. Failure to activate retains the pending source cursor.

Private native-scene-display-task-compare.mjs runs the integrated API using
owned-disc payloads and retained native constructor state. Both F(frame1561)
and Final(frame1619) match pre/post16 control bytes,36 command words,80
display bytes,4 activation bytes and6336 uploaded VRAM bytes. It still uses
explicit sampled dialogue actions, not a verified arbitrary-weapon selection
path. The23 focused scene/control tests pass, including asynchronous waiting,
forged receipt rejection and timed packets. Full source-only bootstrap,
native task cadence and production replay remain unfinished.

### Sampled actor/display task ordering

Fresh headless runs watch outer actor F06032508/Final0603778C and packet
consumer F06046FD8/Final0604C7D8. Among frames containing both calls, all
258 F and231 Final frames show actor before display. Native traces also have
variable outer-update gaps: mostly2 video frames during this attack, plus
single-frame startup and transition gaps. Do not reinterpret the earlier
16715us video-frame measurement as a universal actor tick duration.
Private evidence: native-scene-task-order-comparison.json, both terminal
runs exit0 with no RAM writes. These are sampled borrowed-charge attacks,
not all-weapon cadence coverage.

`advanceBattleSceneTasks` joins main/actors followed by display at an
explicit caller-scheduled cycle. Display completion reaches main on the
following cycle. Its focused ordering test passes; it adds no invented
milliseconds and is not yet wired to production browser playback. Full
battle-focused suite before this last addition:329 cases,328 pass,1 skip.

### Native callback registration and timing export

F0603F70A..0603F718 registers0603F8C4 in callback table0 slot8 and0603F95C
in table1 slot7 through06004638. That registrar selects separate callback
tables by its first argument; CPU ownership is not proven by that argument.
The earlier CPU0/CPU1 interpretation was unsupported. F0603F8CA invokes the actor pool; subsequent
render/resource jobs depend on the live word at060C08F2. This establishes
separate update/render jobs, not their universal presentation duration.

`scripts/editor-battle-task-timing.mjs` converts private PC traces to
content-free observed frame/task timelines. Running it on the two fresh
traces reproduces258/231 paired actor-before-display frames and preserves
variable gaps and the Final same-frame double call. Private generated reports
are native-task-timeline-f.json/final.json. No proprietary memory peeks are
copied into these reports. Rendering cadence and browser integration remain
open; these traces cannot be applied as every weapon's timing.

### Callback CPU ownership correction and transfer traces

Separate callback tables do not mean separate CPUs. Fresh master-CPU traces
hit F0603F95C/0603F9C4 in579 before/after pairs and Final06044F94/06045002
in526 pairs. Slave probes had zero hits and are not completion evidence.
Both callbacks test the busy byte060FFC13 before consuming task-word bits
8000/4000. Final additionally calls060437C4 when not busy; F has no such
call. Final's later side-state increment is at+24 versus F+16. Thus sharing
the entire callback without game-specific behavior would be incorrect.
Private native-transfer-task-comparison.json records observed busy/state
transitions. All four headless probes are terminal exit0, with no RAM writes.
The earlier claim that these table indices establish CPU0/CPU1 scheduling
is explicitly withdrawn. Presentation-time integration remains incomplete.

### Transfer-request gate model

`editor-battle-transfer-task.mjs` models the busy-byte gate and task-word
consumption, including reload after the first consumer and Final's extra
consumer. It invokes explicit consumers rather than pretending uploads are
complete. Private native-transfer-gate-compare.mjs matches all579 F and526
Final before/after task words using no-op consumers only for the gate
comparison. That limited comparison does not prove transfer pixels or the
side-state tail. Four focused tests cover asynchronous callback order,
live-word reload, busy retention and missing consumers. Full render transfer
and production integration remain outstanding.

Fresh combined master traces (native-full-task-order-comparison.json) show
transfer callbacks on frames without actor updates, and frame grouping can
place transfer before or after actor/display calls. Most three-call groups
are transfer/actor/display (218 F,191 Final), but actor/display/transfer also
occurs (22 F,21 Final). Therefore frame grouping does not establish one
universal combined cycle. Keep transfer scheduling separate until the engine
callback-phase and video boundary are resolved; do not append one transfer
unconditionally to each actor tick.

### Timestamp-preserving replay transport

The timing exporter now retains each observed task's frame, timestamp and
execution sequence, not only grouped frame counts. `editor-battle-task-timeline.mjs`
consumes an explicit native schedule with no250ms/60fps default, preserves
multiple tasks in one frame and variable gaps, and stops after cancellation
or a failed consumer. It does not infer another weapon's schedule.
Private native-task-timeline-replay-comparison.json verifies exact timestamp
and task order for614 F and559 Final calls. Three focused tests pass. The
transport currently exercises callbacks without a completed battle renderer;
native video/logic boundary, source-only schedule generation, automatic loop
reset and production integration remain outstanding.

### Selector-resolved scene to command assembly

`editor-battle-scene-commands.mjs` joins prepared actor pictures to the
unrotated native admission, queue and VDP command helpers. Texture material
keys must match the current selector asset; foreign keys or unsupported
producer paths stop before publication. Admission works on a private gate
copy so incomplete preparation cannot consume the live queue. Per-slot
canvas material keys retain authenticated source keys and distinct live
palettes even when two actors reference the same physical sprite.
Focused integration verifies the retained native body's depth80 and
vertices288/41..431/152, and rejects foreign/rotated materials. This helper
is explicitly unrotated: the rotated producer, shadow/background composition,
native material registration bridge and production UI wiring remain open.

### Angle-driven positive-scale queue producer

F060A7808..060A784E resolves integer sine/cosine from the owned quadrant
bytes at060A7870 and BE16 sine table060ABEE8 (Final060ADD60/060B23C8).
`resolveBattleRotationTerms` preserves lookup XOR,3FFE mask,+2 bias and
one's-complement signs. Owned F/Final tables both give cardinal pairs
(2,65536),(65536,-3),(-3,-65537),(-65537,2); these are source-code/table
observations, not new runtime comparison claims.
`createBattleAdmittedAngleQueueRecord` emits tag24/36-byte records for
the direct positive-scale angle emitter, or tag28 for zero angle. The earlier
connection to actor path2 was incorrect and has been removed: path2 calls
matrix wrapper060A7FD6 rather than direct emitter060A7788. Seven focused tests pass.
Scaled actor paths1/3, negative perspective scale, native runtime comparison
of the new producer and Canvas rasterization fidelity remain unresolved.

### Owned rotation-table plumbing

Scene source extraction now reads rotation tables from the authenticated
selected executable, checks their physical bounds, and exposes owned copies.
Renderer contexts copy these tables for their session. Mapping regression
tests verify both games'16384-byte sine data and16-byte quadrant data cannot
mutate the executable source. Full battle suite:340 cases,339 pass,1 skip.
Fresh no-poke angle-emitter probes in the borrowed-charge sample had zero
hits in both games. These terminal runs are explicitly not rotation runtime
verification; a genuinely rotating native action or instruction-level probe
is still required before claiming the producer's native output agreement.

### Exhaustive lookup instruction comparison and matrix-path correction

Private rotation-instruction-probe.py executes the original28 SH2 instructions
F060A7808..060A783E / Final060ADCF8..060ADD2E with explicit input registers
and owned executable memory. All65536 angles per game match the browser
lookup helper, including bias/complement edge cases. Private proof:
rotation-instruction-comparison.json. This proves lookup terms only, not
native battle frame placement or the entire queue producer.

Inspection of F0603C550/554/558 shows actor paths0,2,1/3 dispatch to
060A7788,060A7FD6,060A8134 respectively. The path2 wrapper applies a matrix
dot product and depth admission before its own emitter. Directly feeding
path2 into the untransformed emitter was therefore wrong; assembly again
blocks that path until the matrix contract is implemented. The direct
lookup-angle helper remains valid for its own emitter contract. Palette
preparation also snapshots rotation tables before asynchronous body reads.

### Matrix projection contract

`editor-battle-matrix.mjs` models path2's unsaturated64-bit MAC.L rows,
16-bit extraction/wrap, translations, unsigned depth culling and signed
perspective quotient. It requires live48-byte matrix and GBR-derived depth
context. Undefined/overflowing division remains blocked; no substitute
divisor is chosen. Three tests cover translated perspective, culling and
precision beyond Number's exact integer range. This has not been connected
to queue publication or claimed as native runtime agreement.
The matching Final wrapper is060AE4B6 (not a guessed constant delta).
Fresh no-poke wrapper probes in the borrowed-charge attack have zero hits
in both games; both runs are terminal exit0. A source-selected action that
actually uses rotation is needed for the next runtime comparison.

### Actor rotation command discovery

Primary FA16 resolves to F06033154: signed operand*18 is stored at actor+52,
rotation bit(flag1 bit0) is enabled, and -1 disables/clears it while retaining
the scale bit. FA17/F060331C0 adds the same scaled delta only when rotation
is enabled. These commands are now implemented in the actor VM; focused
clock tests52 pass, covering disable, negative wrap and retained scale.
The private candidate scan is exploratory and must not be described as a
complete rotation-weapon audit: authoring/scene parsers can reject records,
and raw byte matches alone would not establish instruction boundaries.

### Empty-loader fix and common rotation candidate

The exploratory weapon scan exposed TypeErrors on51 F/70 Final selections:
zero-length sprite spans are omitted from gallery assets but were dereferenced
as nonempty native loader assets. Source extraction now preserves kind:empty
separately from kind:reuse, retaining physical span metadata and never borrowing
another image. Its regression passes; full battle suite345 cases/344 pass/1 skip.
The repeated scan no longer throws those errors. It covers1190 F/1279 Final
owned weapon records;31 F scenes still return unmapped, so this is not a
complete execution audit. No FA16/17 byte candidates were found in the
successfully read individual weapon program records.

Owned common actor tables in both games contain matching rotation instructions
in sequenceF022, span1717..1774. FA16 begins at1726, with FA17 at1743/1756
and final disable at1769. This common sequence is the next source candidate;
its scenario/outcome trigger and native execution are not yet verified.

### Common rotation execution in the actor VM

FA10/F06032E88 sets scale using signed operand*655, clamps to655..524288
and enables the scale path bit. Zero disables scaling, stores655 in both
scale fields and retains rotation. FA11/F06032F28 applies wrapped deltas
only while scaling is enabled and clamps each axis independently. These are
now implemented; focused actor tests53 pass.
Owned common actorF022 runs20 ticks to FF removal in both games with explicit
variant1/unmirrored parent context, without unsupported commands. This is
source VM execution, not a native game comparison. Root0 common program10
references F022 at offset329 from its entry in both games (physical16351 F,
17504 Final). The exact outcome selecting that program remains to be traced.

### Repeat transport with isolated scene cycles

`createBattleLoopTimeline` recreates each cycle through an explicit scene
factory, consumes native timestamps and requires a resolved cycle duration
rather than guessing an end from the last image. It retains the final hold,
releases each old cycle, aborts stale asynchronous initialization and rejects
failed consumers without retrying partial effects. Five timeline tests pass,
including private state reset and cancellation during factory reads. This is
transport plumbing, not production native battle playback: a full source scene
factory, native end condition/duration and final renderer are still required.
Further root0 inspection shows a6811 setup command preceding program10's
branch data; its outcome trigger is not yet resolved, so no game-state label
has been assigned to F022.

### Matrix queue assembly

`createBattleAdmittedMatrixQueueRecord` now joins path2's matrix projection
to its own admission counters and tag24/tag28 queue fields. It does not use
direct unrotated admission. The scene assembler selects it for path2 and
snapshots matrix, rotation tables and queue context before resolving materials.
Focused tests11 pass, including transformed coordinates/scale, normalized
depth120, counter wrap and capacity refusal. This is source-derived assembly,
not yet a captured native queue comparison or production UI integration.

The path1/3 wrapper060A8134 instead invokes direct admission, reads live
texture geometry and delegates scaled/rotated geometry to060B0048. Its output
contract differs from path2. Implementing it by reusing matrix projection
would be incorrect; these paths remain blocked while their native clipping
and render-record emission are investigated.

### Zero-angle axis-scaled command path

`editor-battle-scaled-command.mjs` models the defined VDP command fields
written by F060A8134/060AFFC0 for path1/3 with angle0: direct admission,
signed low32 texture-dimension multiplication, separate axis flips, fixed
one-pixel subtraction and native zoom default. It serializes defined fields
instead of inventing retained RAM link/unused words. Scene assembly connects
this path while nonzero scaled rotation remains blocked. Four focused
command/assembly tests pass, including different horizontal/vertical scales,
negative-axis flip and subpixel span. Its endpoint span differs by one from
the unrotated queue path at0xFFFF scale, as the original subtraction dictates.
Native runtime/instruction output comparison of this new helper remains
unverified; it must not be presented as a complete battle renderer.

### Axis instruction and browser assembly checks

Private scaled-axis-instruction-probe.py executes the original size/flip/zoom
instruction block in both game executables. The symbolic helper's unsupported
SWAP/XTRCT instructions are supplied with their SH2 register semantics and
all output values must be concrete. The initial opaque XTRCT results were
rejected, not counted. Corrected1320 cases per game match span/control fields
of the new helper, including signed overflow and subpixel values. Private
proof: scaled-axis-instruction-comparison.json. Position culling and complete
native attack presentation are outside this instruction comparison.

Private scaled-scene-browser.cjs clicks six headless browser cases using the
previously authenticated owned F/Final body pictures and the new scene
assembler: full/half/negative horizontal scale. All publish one command with
the original source key, nonempty pixels and unchanged320x224 canvas size.
scaled-scene-browser-proof.json and scaled-scene-final.png record the check;
the image was visually inspected. This is an isolated assembly test, not the
production editor's native timeline, full battle or all-weapon UI audit.

### Center-anchored rotated axis scaling

`createBattleScaledRotatedCommand` now models the center/default-anchor
path at F060B0048/060B0272: integer lookup terms,64-bit product extraction,
32-bit half-edge placement, loose bounds, viewport corner selection and
defined distorted-sprite command fields. Valid alternate anchors still
return an explicit unresolved result; invalid zoom codes use the native
center fallback. Scene assembly connects this path for scaled actors with
nonzero angle. Focused scaled/assembly tests5 pass. The new corner-selection
and clipping implementation still needs original-instruction/runtime output
comparison; it is not yet established as native rendering fidelity.

Private scaled-rotated-scene-browser.cjs clicks six owned F/Final body cases
with actual executable lookup tables, full/half/negative horizontal scale and
angle4096. All retain their authenticated source key, publish one command,
produce nonempty pictures and keep320x224 canvas dimensions. The resulting
scaled-rotated-scene-final.png was visually inspected. This remains isolated
browser assembly; Canvas distorted rasterization is approximate, and no
production timeline/all-weapon battle audit completion is claimed.

### Full rotated-scale anchor instruction comparison

Original center geometry/corner blocks match450 synthetic input combinations
per game in rotated-corners-instruction-comparison.json. After reading the
remaining anchor handlers, the implementation now supports all nine valid
anchors and native fallback for all other four-bit codes. The expanded private
scaled-anchors-instruction-probe.py executes actual handler branches and
compares7200 cases per game: ready/cull result, all four packed vertices and
control word match. These are original-instruction comparisons with explicit
register/GBR inputs, not captured native attacks. SWAP/XTRCT/SUBC/GBR reads
are supplied with SH2 semantics; outputs must be concrete. Nine quarter-turn
anchor results are retained as numerical regression fixtures, without game
assets. The full initial scene/resource/timing and Canvas rasterization are
still outside this proof and production battle replay remains incomplete.

### Atomic source-scene frame bridge

`prepareBattleSceneFrame` now joins live selector resolution, actor snapshots,
owned-disc indexed pictures, explicit registered materials/palette offsets,
native depth and command generation into one frame. It copies source links,
loaded groups, palette words, depth tables, matrix, rotation tables, material
records and presentation state before asynchronous picture reads. Missing
registrations block before reading a substitute asset; cancelled selection
cannot return a publishable frame. Two integration tests deliberately mutate
actor/source/palette/geometry/clip state during reads and verify consistent
original output with no live admission-state mutation.
This bridge still requires resolved native renderer/material context. It is
not a source-only full scene factory, background compositor or production
timeline integration, and does not establish final all-weapon coverage.

### Native standard material registry

`resolveBattleActorMaterial` models F0603C2F4..0603C41A for ordinary
selectors: group texture-base+subindex, nativeWord72+128 palette selection,
variant1 address-map lookup, source draw-color table, special color flags and
alignment/flip control. Geometry is copied from the live native texture table.
High-bit custom selectors remain explicitly unresolved. The normal body
material matches the previously captured10 bytes00000080428000000A02.
Owned executable color tables at F060B3450/Final060B9A88 are now read with
checked bounds and copied into renderer contexts.

The frame bridge can use that registry to derive per-slot materials and
palettes instead of assuming one material per physical file key. A regression
uses the same body picture for slots1/4 with separate native palette mappings
and verifies distinct red/green pixels despite identical source keys and
mid-read map mutation. Five focused material/frame tests pass. Native registry
construction/loading, custom-selector binding, whole-scene background/time
and production UI integration remain unfinished.

### Captured standard material verification

Fresh no-poke master probes capture actor records,32 texture-base words,
64 palette-map words, source color table and live geometry around the native
material constructor. The first comparison read the advanced output pointer
at its final field and was rejected. Repeated bounded probes capture the
complete10-byte output at R4-8. Native material registry comparison matches
254 F and134 Final ordinary-selector samples exactly. No ordinary sample
is missing actor memory in the captured windows. Private evidence:
native-material-registry-comparison.json; all runs terminal exit0.

146 high-bit samples per game are excluded from that proof: selectorsF006
andF008 on slots1..5 use the separate explicit-palette/custom-index branch.
Their stage/asset ownership is not yet established, so they must not be
silently replaced by ordinary unit images. This verifies material values,
not full sprite ownership, palette pixels, timeline or all-weapon behavior.

### Custom material values and explicit source ownership

High-bit selectors use textureIndex=selector&03FF. Bit0800 chooses actor+72
as palette word; otherwise the native10-byte texture attributes provide
word+4 shifted right4. F006/F008 are the registered-palette branch, correcting
the earlier imprecise "explicit-palette" description. The material resolver
now implements both variants. Fresh probes add the real attribute table and
confirm its live pointer. All400 F/280 Final samples match the complete
native10-byte output, including146 custom samples in each game; uncaptured0.
Private native-material-registry-comparison.json replaces the limited earlier
standard-only comparison. These are sampled registration values, not ownership.

Custom selectors cannot be resolved through ordinary group masking. The
sprite resolver/frame bridge now require an explicit custom texture-index
to owned source-record map, otherwise block before reading any replacement
picture. Regressions cover both palette-word variants and prevent F006 from
falling back to ordinary group16. Native loader ownership-map construction,
full scene/bootstrap/time and production playback remain incomplete.

### Directory-verified texture ownership ranges

Record inspection now returns physical bounds and declared sprite texture
count independently of gallery pagination/unsupported subimages. The core
`inspectEditorBattleTextureRecord` and authenticated worker BATTLE_TEXTURE_RECORD
route expose this metadata for owned C_ROBOT/E_SPR/BTSR records. Non-sprite
records have no inferred native texture count. Worker regressions check session
identity and metadata-only replies without pixel transfers.

`planBattleTextureSourceLoad` retains every declared subimage slot in a bounded
native allocation range. Single-use commit verifies session/base/capacity and
collisions before changing ownership. Tests prove unsupported gallery slot1
does not shift slot2, and foreign/stale registrations leave the map untouched.
The owner map is committed only after corresponding native registration.
Private owned-texture-source-plan-proof.json checks seven real source records
per game through the new API; allocation bases are exploratory and no native
publication is claimed. Native loader sequencing/geometry initialization and
complete scene production replay remain unfinished.

### Session-bound ownership publication into scene frames

Scene-source API results now carry the authenticated source session token.
When a completed texture-source registry is supplied, the frame bridge checks
that token, snapshots ownership and selects pictures by the actual native
texture index for both ordinary/custom selectors. Unregistered indices cannot
fall back to a current weapon's unrelated gallery entry. A registration/frame
integration test verifies missing source stops without reads, completed custom
source uses the owned picture, mid-read ownership mutation cannot change it,
and another input session is rejected before reads. Six focused frame/range
tests pass. This connects ownership planning to frame preparation; native
pixel/geometry registration completion and full scene factory remain required.


### Native sprite loader row alignment

Read F06009D18 registration/decompression library through0600A21C. Its
format descriptor starts [2,8,4], with p selecting index1 and P index2;
06009F32..06009F56 rounds the stored width to that selected unit. Therefore
4bpp rows align to8 pixels (4 bytes), while8bpp rows align to4 pixels
(4 bytes). The asset decoder previously aligned both to8 pixels. Corrected
8bpp row stride and nativeTexture output width; a two-row fixture explicitly
checks retained padded indices and second-row offsets. Focused battle/worker
suite384:383pass,1skip,0fail. Owned source-count probe completed for seven
F and sevenFinal records; this only checks owned ranges/counts, not native
pixel registration, rendered battle equivalence or final UI click audit.
Further loader observations: geometry records are8 bytes, palette records8,
attributes10, pivot records4; physical uploads follow registrations atA114.
Do not publish source ownership before those native registration/upload steps
are implemented and checked. Full scene production replay remains unfinished.


### Owned native texture registration and publication

Added editor-battle-texture-registration.mjs and the authenticated
prepareEditorBattleTextureRegistration entrypoint. Directory-verified sprite
records are decoded once with all declared subimages retained. The plan derives
8-byte geometry (including physical address/packed size), 10-byte attributes,
4-byte signed pivots and exact packed pixel transfers from the native loader.
4bpp uses format3, 8bpp format2; allocations are rounded to32 bytes and begin
at texture address unit2000 only for native textureIndex0. Prior allocation is
explicit. 8bpp palette base aligns via(base+15)&F0. Unsupported/overflowing
loads fail before publication; native overflow/wrap outside modeled VRAM is
not silently reused. The native opaque palette-source pointer is not modeled.
applyBattleTextureRegistration validates every destination and previous
allocation before any write, uses private retained plan bytes, rejects reuse,
and updates a separate textureFormats array. Formats come from native8-byte
palette records, NOT the mode field of the10-byte attribute table. An initial
private group9 comparison used that wrong field and was rejected; corrected
using actual retained palette records from the fresh capture state.
completeBattleTextureSourceLoad prechecks ownership/session/ranges, completes
geometry/attribute/pivot/VRAM writes, then publishes actual native indices.

Private native comparison: Funit34/opponent138 andFinalunit6/opponent88,
blue-charge donor245 via existing authored weapon1248/1331. Each game matches
all geometry/attribute bytes in groups8,9,0,5:5+5+11+8=29textures/game.
Prior allocation and palette base were retained from native captures. This is
not source-only complete initialization. Fresh headless post-loader probes
F0603299A/Final06037C22 terminated normally with no RAM pokes. First/last
up to256 bytes of each of5body textures (10windows/game) match owned source
packed transfers at every sampled loader completion. No whole-VRAM comparison
or final production UI playback claim. Focused battle/worker390cases:389pass,
1skip,0fail. Local8844 responds200. Full task timing/background/native scene
factory and replacing production gallery playback remain required.


### Uploaded texture frame bridge and update-task gates

prepareBattleSceneFrame accepts an uploaded textureState with session-bound
ownership. It freezes VRAM/geometry/pivots/formats with the rest of the frame,
checks geometry against the material registry, and reads indexed pixels by
actual textureIndex. No archive re-decode is performed in this path. Sprite
reads carry textureIndex/slot, so two allocations of one physical source key
can retain different runtime contents. A pipeline test completes registration
and ownership, changes one VRAM byte, and sees the changed live color in the
rendered frame while an archive-reader callback would throw. Missing/mismatched
physical state fails rather than choosing a gallery picture.
Private owned-upload-frame-browser.cjs clicks F andFinal in an isolated
registration/upload/frame/canvas assembly with own approved source pictures.
Both render one command at textureIndex0, canvas320x224; Final screenshot
visually inspected (WaveRider). This is not the production editor UI, a whole
battle, native actor placements or native timing. Source images stay private.
Focused battle/worker394cases:393pass,1skip,0fail.

Added runBattleUpdateTask for the native table0slot8 wrapper, F0603F8C4 and
Final06044F00. F calls actor consumer unconditionally; Final checks taskWord0200
before calling it. Both set8000 beforebit1 consumer and4000 after the always
consumer. Every conditional reloads taskWord after earlier consumer effects;
F additionally dispatchesbit32. Native consumer semantics are explicit caller
callbacks, not successful no-ops. The main VM is an earlier separate task-table
callback. This wrapper must not be equated to a fixed video frame or per-loop
actor period.
Fresh no-poke headless probes native-update-wrapper-f/final-1 terminated
normally. Native dispatch order and task word match248F/233Final complete
wrapper invocations when real recorded consumer effects are supplied. All
samples called actors; Final's disabled0200 branch is established by code and
unit test, not by a sampled disabled game state. Individual consumers/full
presentation timing remain unimplemented.
Additional native actor-entry observation for subsequent integration:
F0603252A..32540 andFinal0603779A..377B0 check mainContext+71 bit7 and
skip the pool when clear (F060C0947,Final060C6DB7). Prefix copies two side
bytes to shadow fields before this gate. Final alone calls060434DC at377B4
before iterating the pool. Do not describe F's unconditional outer call as
unconditional actor advancement, or bind tickBattleActorPool directly while
omitting those native entry operations. Complete scene factory and production
UI/native timing integration remain required; the goal is not achieved.


### Native actor-entry gating and Final buffer preparation

Added runBattleActorPoolTask with explicit native mainContextByte71,
side/shadow byte views and Final's retained four-buffer state. Prefix side-byte
copies occur even when bit7 disables actor progression. On enabled Final,
060434DC clears buffers0/2 toFF and flags&CF if flagbit7 is set, otherwise
buffers1/3 and flags&F3; every buffer is1024 bytes. These operations precede
pool commands. Missing enabled Final state fails before partial writes. The
underlying tickBattleActorPool remains a lower-level opcode-loop helper.
advanceBattleSceneUpdateTask connects this entry to the native table0slot8
wrapper, keeping the earlier main VM task separate so it is not ticked twice.
Tests cover outer0200 gate, inner+71bit7 gate, side copies, both buffer pairs,
unknown-context rejection, and unchanged main-clock tick count.

Fresh native-actor-entry-final-1 probe, no pokes, normal exit. Compared133
actual enabled entry calls: side shadow copies match133; full4096 buffer bytes
and flag result match133, including66 alternate and67 regular branches.
This proves entry preparation for the sampled Final attack, not every actor
command or the whole scene factory/presentation schedule. Disabled inner gate
is supported by disassembly and test, not sampled in this probe. F prefix was
read directly; no fresh F shadow-copy probe in this step. Final function4558
is byte-fill helper (R4dest,R5valueFF,R6size1,R7count0400), not a new graphics
transform. Full native battle replay and production UI remain unfinished.


### Native portrait subranges and initial owned texture scene

Fresh native-all-texture-sources-f/final-1 probes observe every compressed
sprite-library call, F06009D18/Final06009F40, with actual source bytes and
cursor pointers. Both terminate normally without pokes. Physical FACE prefix
matching resolves Fface86/246 andFinal22/244/22/22. Fresh face-subrange probes
capture incoming stack arguments: Ftwo loads choose expression0; Finalfour
loads choose0,0,1,3. Each load registers exactly one expression, drawColor7,
initial palette byte42..45; texture indices10..11 or10..13. Native portrait
queue loader F0601A730..1A83C stores the group12 base and loops16 cache entries;
flags&3 choose the source subimage, with count1. Do not load all expressions
just because they share an archive record.

Registration/source planning now support explicit subimageStart/count, preserve
actual source indices, and validate source-range equality before completion.
FACE is supported through checked authenticated source APIs. Added
inspectEditorBattlePortraitSources with explicit pilot/expression identities,
root28's original packed9-bit face identity, directory bounds and expression
count checks. Runtime hero placeholders stay unresolved; no reference-portrait
fallback is used. BATTLE_PORTRAIT_SOURCES worker route preserves session and
cancellation handling. Native portrait registration comparison matches all
geometry/attribute bytes for twoF/fourFinal loads. A source-table pilot alias
was selected to exercise the API; this does not prove runtime pilot assignment.

prepareEditorBattleSceneTextures creates owned1024-slot tables/VRAM/ownership,
registering bodies8/9, supplied portrait queue12, common BTSR16/18 in order.
Weapon groups remain uninstalled until their timed native requests. Body
palette metadata is returned and native>4bank inputs are rejected. Source-only
initial geometry/attributes match the native retained prefix62F/64Final
textures. First comparison rejected incorrect attribute palettes: body/common
registration starts its local palette byte at0, whereas palette pool loads
use separate58/62/74/96 bases. Corrected this distinction; portrait byte42+i
is explicit. These bases are not substitutes for palette initialization.
Native weapon groups start63F/65Final because one separately generated message
texture follows this prefix. Message registration/glyph arena, palettes,
actors, background and timing are still separate and unfinished. The factory
is not a finished battle replay or final product UI. Assets/evidence stay
private, no deployment. Goals remain unachieved.


### User-directed web timeline architecture and player prototype

User clarified that RAM tracing should establish sprite/keyframe rules and the
web should implement an optimized battle scene, not reproduce all engine buffer
operations during playback. Preserve all useful selection/timing evidence, but
compile source-driven scene updates once into cached pictures/draw commands and
presentation timestamps. Added editor-battle-web-timeline.mjs: exact explicit
timestamps, native-end requirement, partial/unknown-command diagnostics, picture
deduplication retaining palette changes, binary-search seeking/looping, optional
Canvas texture cache. No gallery250ms fallback. Private browser proof with owned
native picture/command samples and a synthetic irregular time fixture verifies
indices0,0,1,2,0,1 acrossseek/loop, one sourceCanvas creation for six draws/game.
This is compile/cache/seek correctness, not completed beam weapon playback.

Added reusable player UI and battle-player-prototype.html. Local main weapon
panel opens the player; authenticated BATTLE_UNIT_PREVIEW reads original unit
pictures. Single owner is immediate/disabled selector, multiple owners selectable;
Jegan defaults as target; outcome/loop controls and compact three-track timeline.
Weapon list has owner labels/search and excludes ownerless records. Fixed its
long-list grid sizing so desktop viewer/transport do not overflow into timeline.
Mobile uses compact weapon selector; modal keyboard loop/Escape/focus return and
session reset drops the player. Playback/frame controls remain disabled because
no complete native battle timeline has been supplied yet. Prototype numerical
values are examples; real main editor reads selected weapon fields (energy/EN,
ammo and ranges). No false fullbattle preview. Old reference gallery no longer
autoplays; explicit picture cycling is labelled as source pictures, not battle.

Private player-editor-qa.cjs loads both own approvedBINs, clicks beam saber,
opensplayer, verifiesGundam/Jegan images anddefaulttarget, desktop1440x900 and
mobile390x844 bounds, visibletransport beforetimeline, no page errors.
Independent prototype QA checks single/multiple-owner behavior, target changes,
mode/loop controls andno document horizontal/vertical overflow. Screenshots in
private tmp only. Focused battle/worker407:406pass,1skip (at current timeline
cache revision). Full beam saber/rifle attack motion remains unconnected;
F/Finalfullweapon/outcome/native timing audit is NOT complete. No deployment.

2026-10-13: inspected top-level main opcode 4 in owned executables. F handler
0601796C and Final 06017E00 read the return-stack count at main context +68;
nonzero pops a saved program pointer, zero returns 2. F interpreter 06004FAA
handles that return by setting context +71 bit 6 and invoking 060A746C,
which ORs 0x8000 into the GBR-relative task word. It does not clear +71 bit 7
there. The proposed immediate actor-gate shutdown is disproved. Final handler
stack behavior matches; Final outer completion dispatch was not checked yet.
Scene-clock results now expose scriptEnded separately from actor-pool exhaustion.
This is a script completion request, not proof of the final presented frame or
actual presentation duration. Persistent idle actors must not be used alone to
infer animation duration. No complete timeline or new playback claim follows.

Scene-message integration now assembles the existing queue, owned root24
program, glyph writer, texture upload and activation receipt. Its initializer
can be passed directly to advanceBattleSceneDisplay; malformed ownership and
unresolved glyphs cannot issue a completion receipt. Focused scene/message
tests: 21/21 passed. Private native-scene-message-initializer-compare.mjs uses
the new initializer with F and Final owned BMESS payloads and original glyphs:
19 commands per sample, control16, command36words, activation4bytes, consumed
display fields and 6336 uploaded bytes match retained native execution samples.
Prepared registration/context still uses sampled native inputs; this does not
establish source-only startup, whole attack playback, or presentation timing.

Connected the sampled native message context to the owned-program startup
diagnostic. Both games pass the packet16 frontier and reach main opcode75.
Owned EXE handlers F060444F0/Final06049CC4 increment scene-control byte0's
upper two bits up to3, retain low6bits, and return6000 (advance1, continue).
Implemented this opcode with exhaustive input-byte regression coverage.
Also fixed startup to propagate renderer variant to actor presentation effects;
the allocator had received it but the actor's shared context had not.
Focused main/scene/message tests: 51/51 passed. Private diagnostic with explicit
exploratory paletteFadeDisabled=false now reaches F actorF7 at tick40/pc813,
and Final FAE7 missing progression state at tick28/pc1879. Without that option
assumption both stop at the palette fade context. These are task ticks, not
video frames; sampled dialogue belongs to the native reference battle context,
so this is not a source-only beam-saber battle or full native-timing proof.

Implemented actor F7 from owned EXE dispatch tables: F060384D4 and
Final0603D7A0 branch on shared flag bit operand&31, taking the branch when
the bit's truth value equals operand bit7. Signed BE16 displacement is based
at opcode+2; fall-through consumes4 bytes; neither path yields or clears flags.
Regression covers both polarities, bits0/31, backward targets, and missing
flag context. Actor clock54/54 tests pass. The same private exploratory startup
now reaches F task tick97, common program8 at15758 (6807); Final remains at
FAE7 due missing real word-progression state. F6807 handler06040888 performs
scene-state stores and calls helper routines; it has not been implemented or
skipped at that checkpoint. No complete clip, actual timing, or full UI audit is established.

Fresh headless native-main6807-source-f-1 (no RAM pokes, exit0) captured the
actual6807 lookup at native frames1749/1784. Native table base2028D800 has
cell6 raw displacement3163; getter yields20290963 and caller adds24 to
2029097B. Canonical BTSR cell-relative target is317B: adding24 again would
misread the compressed stream. Added a bounded sc0 screen decoder reusing the
existing LZSS parser and a cached common-screen resolver. Both owned discs
decode format31 and16856 packed bytes. F's entire16856 bytes match the fresh
native RAM output at202D0000; Final decoding matches F data but was not sampled
in a new native run. Main6807 now loads these cells and retains the native
mode4/control3100 stores. It does not claim a composed background picture.
Main/background/scene/resources70tests pass. Private exploratory F startup
passes6807 and reaches actorFA at pc1125/slot33; Final still needs its numerical
progression state. Whole clip/native presentation timing/UI audit remain open.

Next F frontier is FAC4, operands13,0,0,4,32 and13,0,0,12,34. Owned handlers
F060353BC/Final0603A650 reference a screen resource slot and call the screen
copy helper F0603AEC4. This is not sprite selection. For sc01, native descriptor
base is decoded+4, stride8; data target is decoded-4+descriptor.offset, and
width/height are descriptor bytes6/7. Added bounded selected-fragment decoding,
retaining exact16-bit cells without guessing graphics banks or making a sheet.
F/Final source fragment0/1 are40x8 at offsets216/856. F data is covered by the
prior whole16856byte native match; Final native transfer has not been captured.
Background tests4/4 pass. FAC4 mirror/plane/destination composition remains
unimplemented, so the scene stays at its frontier rather than skipping copies.

Added64x64 packed screen-plane composition: preserve source cells,16-bit
tile/palette addition, horizontal/vertical destination traversal and tile flip
XOR, including ordinary and vertical edge wrapping. Native mode1's wrapped
tail starts0 rather than63; that unusual case remains explicitly unresolved.
Fresh headless native-fac4-copy-f-2 captured originalFAC4 helper calls at1751.
Private native-screen-copy-compare.mjs matches4x80byte VDP2 windows per call
for normalflags20 atx0/y4 and verticalflipflags22 atx0/y12, using actual native
tileOffset3100. Total640 compared bytes; unused earlier calls are excluded.
No full plane, horizontal-flip native sample, Final sample or actual pixel
composition is claimed. Background tests5/5 pass. ActorFAC4/context binding
is still pending; this primitive is not yet full battle playback.

Connected FAC4 actor dispatch to an explicit per-scene screen copier. Native
variant1 plane overrides (bits4/8), side mirroring and selected loaded-resource
resolution are retained; other variants require further state and are refused.
Unknown resources cannot borrow the common screen. Actor/background/copier
tests61/61 pass. The connected copier matches the same two fresh native sample
windows (640bytes); these are sampled rows, not a whole-plane proof.
Private native-screen-copier-connected-diagnostic uses exploratory blank planes
(no native initial-plane equality claim) and real decoded common screen13:
F progresses past FAC4 and its flag wait to main680D at tasktick111/pc15767.
Final remains at FAE7 missing real word-progression state. The product lacks
complete startup binding, tile-bank pixels and full battle timeline/UI audit.

Implemented680D using owned handlers F06040B4C/Final0604618C: toggle bit5
of native scene byte F060C06C0/Final060C6B30, preserving every other bit;
return6001 continues without an added wait. Missing full byte stays unresolved
rather than reconstructing it from two direction Booleans. Focused main/scene
tests50/50 pass. Fresh headless native-main680d-{f,final}-1 both exit0 with no
RAM pokes. Original execution matches web update F1->33(frame1779), Final0->32
(frame1801), adjacent byte unchanged. The private exploratory scene supplied
these sampled bytes advances F to6801/FF atpc15769; Final still atFAE7.
This proves the sampled command semantics, not the complete battle or cadence.

Investigated next6801/FF: F0603FBA8 chooses a side background, decodes sc0,
copies fragments0/1 to planes25E68000/25E6C000, then calls the existing native
background layout builder0604595C. Fresh headless native-main6801-source-f-1
exits0/no RAM pokes; actual decoder inputs at frames1435/1779/2197 are sc02
inside side buffers whose starts are bk01. Side1 buffer202B8000 uses screen
offset2FFB; side0 buffer202B1800 uses3E4C. These are paired bank/map buffers,
not standalone sprites or the earlier BTSR sc01 HUD fragment. Need resolve the
owned-disc bank records and sc02 cell composition before implementing6801.
Source trace/summary remain private; full playback is still not achieved.

Matched both native side-bank64byte prefixes to owned BBACK.BIN in F and
Final: bank22332/map38280/end40776 (directory row1), andbank40776/map53059/
end55213 (row2). BBACK uses192 cell-relative start/map/end triples. Added exact
pair-directory lookup and native sc02 fragment parsing that retains full32bit
cells; it cannot be fed to the16bit HUD copier. Sc02 has two64x64 fragments,
not the existing generic single-map-at16 layout. Generic catalog now recognizes
BBACK bank/map binding but explicitly refuses its unsupported screen compositor.
Actual owned F andFinal all192 pairs decode their two bounded fragments without
errors (private background-pair-coverage.json). Graphics/background/copier28/28
tests pass after correcting the new catalog methods Array check. This is data
coverage, not full rendering, bank palette/flip correctness or battle UI audit.

Added source background fragment RGBA composition with cell-selected palette
and H/V tile reflection. Native game sc02 copy toggles mode<<30; local Mednafen
src/ss/vdp2_render.cpp378..388 confirms palette=highword&7F, flips4000/8000,
special priority2000/colorcalc1000, character=lowword&7FFF. Initially61 pairs
failed because special priority bits were interpreted as palette bits; corrected
the mask from3FFF to7F and kept special effects outside the source pixel lookup.
Owned F/Final each render all384 fragments without bounds errors. Synthetic
palette/flip/special-flag regression plus graphics/background27tests pass.
Private background-f-1-{0,1}.png visually inspected: separate foreground/cloud
layer and grass/sky background. These are raw512x512 layers, not the native
scrolled battle viewport. Full priority/color calculation, plane composition,
native screenshot comparison and player scene hookup are still incomplete.

Added32bit sc02 plane copying with64x64 destination wrapping, low character
base addition, flags high-nibble palette addition shifted12, and mode<<30
H/V flip XOR. Unlike sc01's peculiar mode1 wrap, sc02's native mode1 tail
starts63. Synthetic background tests7/7 pass. Fresh headless
native-background-copy-f-1 exits0/no RAM pokes; native-background-copy-compare
matches128bytes per background plane at nativeframe1780 (tilebase0400,flags0),
256bytes total, using owned BBACK row1's two fragments. This is sampled-cell
agreement; native full-plane/Final/scroll/pixel viewport comparisons remain open.
Main6801 still needs its scene-side resource and palette initialization binding.

Added bounded6801 FE/FF background-side planning from the owned F branch
code: FE chooses direction^1, FF direction; side0 uses tilebase0400 and palette
start22, side1 uses tilebase0/start6. Full native scene byte and prepared side
pair/mode are required; explicit other selectors are not guessed. The selected
mode rebuilds the already decoded native layout groups. Tests8/8 pass. Owned
F/Final sampled BBACK row1/mode1 yield groups12/4; row2/mode2 yield13/5.
These match the source binding investigated so far; they do not establish the
general terrain-to-side selection or completion of native palette initialization.
This is planning, not a6801 completion acknowledgement or player playback.

Connected6801 to prepared background-side execution: existing native palette
initializer performs the4x4 transfers (requests64+row16+column256, count16,
bank=paletteStart+column), followed by both sc02 copies and decoded mode/layout
reset. Prepare palette/planes on copies and publish together so a malformed
second fragment cannot partially commit. Main dispatch requires this real
switch callback and retains an unresolved instruction when missing. Main/
background/switch46tests pass. Private diagnostic with owned BBACK side1/2,
retained palette context and exploratory blank initial planes now returns from
common program8 to F D_ANIME pc165/main10 at tasktick111. This passes the prior
preparation frontier but does not prove native complete startup or frame times.
Final remains atFAE7 awaiting real numerical scene inputs. Native palette-state
comparison of the new composite switch and full player hookup remain pending.

Owned main10 handlers F06017DB0/Final06018244 OR80 into distinct execution
flag bytes060C071C/060C6B8C and return8000. Interpreter8000 clears the wait
counter, advances1 and exits the main task; it is not a texture load. Added
explicit retained flag-byte requirement and this invocation boundary. Focused
main/scene51tests pass. Fresh native-main10-{f,final}-1 headless probes exit0
without RAM pokes but contain zero handler hits: the selected donor scene does
not establish this command's live behavior. Native comparison remains pending
until a matching scene is selected; do not use these probes as validation.

Revalidated native comparison-scene identity through headless UI. The stored
native-weapon-product-gundam-action-f-1 label is misleading: actual spirit/
attack menus show Bright and naval cannons, not Gundam beam weapons. It must
not be used for beam-saber/10 coverage. New native-gundam-map-identity-f-1 moves
from the map cursor UP then RIGHT; its actual ability screen shows Gundam and
Mina(Rank32). native-gundam-map-weapons-f-1 opens the current selected unit's
weapon screen. No RAM pokes, all bounded runs exit0. Roster-only Gundam screens
were confirmed separately; they do not establish a combat target or attack.
These source-selection checks change the next native probe, not full gameplay
or web timing verification. The earlier donor samples retain their explicitly
bounded command/state scopes, not Gundam beam battle identity.

User reprioritized web playback and explicitly stopped further native-game
verification. Connected compiled web timelines to the player transport: autoplay,
pause, repeat, seek and source-presentation-time previous/next frame steps,
requestAnimationFrame playback, end stop, selection cancellation and close cleanup.
Seek overlays the existing ruler without adding vertical layout height; player
state resets on unit/weapon/outcome changes. Private player-transport-qa.cjs
clicks these controls at desktop1440x900/mobile390x844 with no page errors or
document overflow. Its timeline is a synthetic transport fixture, not a weapon
battle. Actual app readScene still supplies standing pictures only: complete
disc-script timeline production and hookup remain the priority and incomplete.

Connected owned BBACK images to the actual browser player through authenticated
BATTLE_BACKGROUND_PREVIEW. Core reads the selected exact pair and renders both
layers; worker cancellation/session guards and transfer apply as for unit images.
BBACK was missing from the core read whitelist on the first browser attempt;
added it and repeated the actual UI check. F andFinal own accepted inputs now
show Gundam/Jegan on disc-derived background. Desktop1440x900/mobile390x844
captures pass viewer/transport bounds with no page errors; background canvas
layout is a static placement preview, not native scrolling or attack playback.
Focused worker/background/timeline23tests pass. Complete scene production and
actual weapon playback are still unconnected. No further emulator run occurred.

Added transferable web timeline export/import. Worker metadata alone cannot
carry the compiled WeakMap, so wire data keeps a deduplicated picture table,
source presentation timestamps and cloned commands/state. Browser import
revalidates references and rebuilds the drawable cache; cancelled selection
cannot import an old scene. Worker includes wire picture buffers in transfers.
Focused timeline/worker16tests pass. Private transferred-timeline browser QA
clicks autoplay/pause, seek/source-frame stepping, end stop and close at desktop
and mobile without overflow; its fixture is synthetic and not a disc attack.
Actual app still has no completed disc-script timeline producer: this removes
the worker/UI boundary obstacle but does not make current weapon playback ready.

Added the scene-update/render-to-web-timeline producer bridge. It advances scene
tasks, snapshots rendered frames, accepts scheduler-provided timestamps/end,
then exports a browser wire timeline. Unknown script/display/render work remains
a reported frontier; no fixed gallery interval or invented clip ending is used.
Source-session replacement during asynchronous reads prevents publication.
Also implemented main6834/6837 selected-side status branches from F/Final owned
executable handlers (bit6/bit5, signed displacement relative to operand cell).
Focused main/timeline/producer44tests pass. The producer still needs the complete
disc-derived initial scene/context and presentation scheduler in the actual app.
No emulator validation was resumed; actual weapon playback remains incomplete.

### Fresh browser scene initialization (2026-10-13)

`editor-battle-web-scene.mjs` initializes separate browser actor, control, fade,
HUD-plane and palette arenas on every cycle. It uses existing disc-program
interpreters and authenticated body/common palettes; no emulator save or retained
RAM is imported. Nonzero aligned palette allocation handles identify browser
allocations and are never dereferenced. `prepareEditorBattleWebScene` binds those
reads to the selected scene and prepares an owned BBACK pair, its palettes and
6801 screen-switch consumer. FAC4 uses the current loaded common-screen resource.
The fresh arena is a preview initialization choice, not a native-state equality
claim. In particular metadata0 and background1 are preview inputs, not a selected
scenario's environment. The extra draw record is deliberately inactive.

A private owned-disc probe on both accepted local images identifies a dialogue
control wait with neutral source flags. An exploratory source flag128 allows the
interpreter to proceed without fabricating a completion: F reaches main opcode2E
in common program9 after93ticks; Final reaches FAE7's missing displayed-word
progression after9ticks. These are interpreter updates, not presentation frame
counts or game timing evidence. The flag remains a private probe input and is
not silently enabled in the product. No emulator verification was run.

Focused scene/palette/screen/background/timeline tests:29pass. No completed
attack timeline is supplied to the player yet; the feature is not ready to claim
actual attack playback, all-weapon coverage or source-accurate timing.

Fresh web execution now handles main2E (defender parent4). Its F280-byte
instruction body is byte-identical to main2D except the parent immediate; Final
has the corresponding handler at0601A418. Main6845 selects direction bit6's
side word+6 and uses native6003/5001 skip/operand-relative branch returns
(F06043B0C, Final060491E0). Web preview's neutral sideWord6 is explicit0.

FAD0 is decoded from F06034A54 / Final06039CE8: nonzero side word+6 selects
that side's primary animation byte, otherwise the alternate byte; low2bits1
branches from the operand. It does not use the D_ANIME archive header byte.
Both byte arrays are explicit neutral web inputs for now. Fresh numeric
progressors start inactive (step255,total0,words0) because web numeric HUD/damage
values have not been supplied; actor instructions and their waits are preserved.
This is a web preview state, not a native combat-value calculation.

Both owned-disc probes with exploratory presentation flag128 now reach FAD3
in common actor slot5 atpc602 after93interpreter updates. That instruction and
subsequent reaction/HUD consumers remain unresolved; actual player playback is
still not connected. No emulator/game verification was resumed.

Fresh web scene progress: FAD3 now branches from the opposite side's byte+1
(bit4 set, bit2 clear; F06034BB8 / Final06039E4C). This is the low byte of the
status word, whereas FA39 and main6834/6837 use byte+0. An initial shared-field
implementation was corrected to separate `sideSecondaryStatusFlags` from
`sideStatusFlags`; tests deliberately give those bytes conflicting values.
Main6836/6838/683C implement high-byte bit6-clear, high-byte bits2..3==1,
and full-word bits7..8==1 predicates, respectively. Main6849 consumes only its
macro byte and initializes the secondary dialogue control; following04 is a
common-program return. Main6822 tests the same input's bit7.

FAF9 consumes flag1 bit2 once, toggles horizontal facing, negates signed-word
velocity, and mirrors parent-relative or screen/fixed-point x coordinates.
FAFC publishes its byte to the scene-load gate's pending byte (F060CABF4),
not to the palette-fade-disabled flag. No asynchronous completion is fabricated.
Focused actor/main/mapping tests125pass. The private owned-disc interpreter
probe now reaches FAEE at common actorpc530 after130updates in both games.
The full picture/render/timing producer remains unfinished and not connected to
actual player playback. All progress here is local; no emulator was run.

FAEE now performs the actual opposite-side high-byte condition and selected
primary/alternate unit lookup (F06035F50 / Final0603B1E4). Unit219/25/28 select
common texture1001/1002/1003; other IDs select1000. Nonmatching condition branches
from the signed operand. Fresh browser scenes use selected owned units for both
records when no support substitution is configured. Main34 resets an inclusive
actor range through the existing pool reset; missing slots are preflighted.
Main23 clears the animation flag word. Main70 publishes transition mode/flags
and task-word bit3 while preserving a pending nonzero mode1 request; publication
is not an asynchronous completion receipt.

Private probes with both presentation input bytes explicitly128 now reach
main6811 in common program10 after168updates for F and Final. With the second
byte0, the source program correctly waits on dialogue-control completion.
Those preview input changes remain private and have not been silently installed
in the product. Focused actor/main/web-scene tests103pass. Render production,
source presentation timing, full attack completion and UI connection remain
unfinished. No emulator/game verification or publication occurred.

Main6811 branch planning is now explicit (`editor-battle-phase-exit.mjs`).
Owned F06041028..060411CC and corresponding Final code choose selected-side
status/death/support data. Death classes1/2 alias the same operand; the permitted
counter direction flips bit6 and clears bit5, and full flags-word classes select
separate support/non-support cells. Main VM branches from the selected signed
word cell only after a phase-preparation consumer reports ready. It does not
pretend that the preceding host/map/renderer restoration has been performed.
The branch and consumer interface tests48pass (main/phase/playback suites).

Both private owned-disc probes now stop specifically at
`phase-exit-preparation-unresolved`, rather than an unknown6811 opcode, after
168updates with explicit presentation inputs128. This is an identified missing
web consumer, not a completed battle or evidence of a drawable loop. The full
scene-to-render producer and source scheduler remain incomplete. No emulator
verification or deployment was performed.

### Source frames into browser Canvas

`createBattleWebFrameContext` connects the fresh owned scene to completed
body/common/selected-weapon texture registrations and live palette words.
Clip margins and queue capacity are explicitly web viewport policy; no retained
GBR or matrix equality is claimed. The owned depth/rotation/address/color tables
remain the source. Optional weapon preload registers only the selected scene's
records; ordinary group aliases are bound to the resulting source ranges.
This is browser prefetch, not native timed-loader equivalence.

Found a concrete unrelated-picture path: a default-zero group base could select
a registered body texture for an unregistered weapon group. Source-frame
resolution now compares the actual registered source identity/subindex with the
selector's scene/group identity, and rejects group/record overlap. A regression
test uses conflicting weapon/body registrations and a subindex crossing into
the following record. Common16/18 resolve their owned BTSR records explicitly.

Owned F/Final weapon1/unit1/opponent2 generate168 successive command frames
before the identified phase-exit preparation frontier (private explicit128
presentation controls). Seven frames per game were painted through the actual
Canvas renderer at320x224, all returnedready; tick80 has no visible foreground
because its bodies are outside the viewport. First captures exposed black body
colors: the fresh destination palette had never received the owned body banks.
Initialization now publishes them through the disc address map, using logical
row stride0100. Repeated browser captures show colored bodies and beam-saber
pixels. This is private Canvas QA, not full editor UI coverage or source timing
agreement. Focused scene/resource/web-frame/web-scene tests27pass.

No complete timeline/end/timestamp producer is installed in the player yet;
background scrolling, numeric/message layers, palette-fade consumption, some
projection paths and phase-exit preparation still require work. No emulator was
run and no generated game assets were added to the repository or published.

### Local source-step player connection

`BATTLE_SCENE_FRAME` now reaches the authenticated core and transfers only the
current frame's RGBA buffers. The real worker API binding is included; initial
UI QA caught its omission before the fresh verification run. Core retains only
the current scene, rebuilds on backwards seek/selection change, and discards
partially advanced state on cancellation or execution failure. An owned F/Final
API probe checks0→20→9→20, compares command/source identity at the repeated20,
then verifies that a blocked168 does not prevent reconstructing167.

The local player uses previous/next controls for source interpreter updates
while no source presentation-time timeline exists. It labels them “연출 단계”,
keeps timed autoplay disabled, and does not treat interpreter ticks as video
frames. This is an intermediate connection toward full playback, not a
replacement completion criterion. Attack mode alone is connected; other results
still use the earlier placement preview. Dialogue-display-off is explicit in
the frame request. Background is the existing fixed staging projection; native
scrolling and complete compositing remain unfinished.

Fresh actual editor UI QA with each accepted local disc selects weapon1 beam
saber, Gundam and default Jegan, then clicks next20times. Both reachstep20,
produce desktop1440x900/mobile390x844 screenshots without overflow or page errors.
Synthetic timed transport regression also passes. Focused worker/source-frame/
web-scene/web-frame-context tests22pass. Native custom physical selectors are
rejected by the browser preload layout until their allocation producer is known;
they cannot borrow an ordinary preloaded picture.

Remaining: complete phase-exit consumer, presentation scheduler/timestamps,
background/numeric/message/palette composition, all outcomes and all-weapon/
owner direct UI coverage. Full source-timed looping is not yet available.
No emulator verification or public deployment was performed.

### Video-field timing without guessed actor cadence

Added a progressive NTSC VDP2 clock from the local primary emulator source:
master clock19215000000/11, horizontal427*65==455*61, four clocks/dot and
263lines/field. Cumulative rational conversion produces16715us for the first
field without accumulating per-field rounding drift. Interlaced/PAL/unresolved
modes are rejected by this profile. This specifies video-field time, not how
many actor/main callbacks run in a field.

Task assignment conversion preserves gaps and multiple calls in one field.
The two archived task-field reports retain614calls in356fields (F) and559calls
in327fields (Final), including the Final double actor call. Those records concern
previous samples and are NOT assigned to the current beam-saber selection.
Sub-field CPU callback instants are still unresolved. No new emulator was run.

`compileBattleScheduledPlayback` now compiles at supplied source display-field
boundaries, executes separate main/actor/display/transfer tasks in supplied order,
and presents once after all calls for that field. It preserves explicit gaps,
checks actual main-script completion before accepting an end, and stops later
same-field work on source replacement or missing consumers. Focused scheduler/
producer/timeline tests16pass with synthetic fixtures. Current player still has
source-step controls only; its selected-scene task assignment, phase-exit consumer
and full presentation-time timeline remain unfinished. No fixed60fps or250ms
substitute was installed as game-accurate playback.

Exploratory phase-exit acknowledgement in a PRIVATE diagnostic (not product)
reaches main680E after169updates in both games. It does not implement or verify
native host restoration and cannot establish complete playback.

### Restoring bodies and correcting the preview outcome

Main680E now restores source actor1/4 selectors, opposite-facing placement,
optional actor5 support and auxiliary actor6/7 selectors. Its first invocation
copies source62/63 into logical128/384; native9000 yields without consuming the
macro, then pause2 copies58/59 into144/400, marks graphics completion and clears
scene bits3/4. F06040B7C..06040E12 and corresponding Final code were read locally.
The main interpreter retains these invocation boundaries. No emulator was run.

Fresh resource-cache words now have an initialized-index set: source cache
writes initialize a cell, while compares/increments/load lookups cannot borrow
an invented zero. The exploratory host-acknowledged path reaches main5D sub1,
whose source dispatch loads an asynchronous sprite resource. That path remains
private and does not verify or implement native6811 host restoration.

Found a correctness issue in the earlier fresh preview: all-zero outcome bytes
were neutral, not the explicit attack/hit condition. The selected side now gets
source mask4000 (other preview masks are typed separately, not a damage formula).
Consequently the real hit path encounters different commands; previous neutral
168-update coverage does not establish current hit-path completion. FAD7 now
latches selected alternate-record byte+27 once using marker00FF, and FACF branches
on selected full status bits7..8 rather than a single byte. Both games advance
to FA52 in the common hit/HUD sequence around update130; its consumer and the
following numeric/screen processing remain unfinished.

Focused body/main/actor/outcome/web-scene tests110pass. Fresh actual editor UI
still reaches beam-saber source step20 with Gundam/Jegan in both games at desktop
and mobile without page errors or overflow. Automatic complete source-timed
looping, all outcome/weapon coverage, the hit/HUD consumer and phase exit remain
incomplete. No neutral-path fallback was used to make the hit path look finished.

### Source hit/HUD state stores

Added FA52/53 and FA55 state stores from owned F0603567C/060356AC/06035710
and corresponding Final code. The shared HUD view retains unknown bytes; modes
write words+2/+4 and long+32, and toggle only byte+1 bit3. Positioning writes
words+62/+64 and mirrors x as319-x when scene direction bits6/7 differ. The
fresh browser allocation currently covers the known66-byte extent; larger
bounded views preserve their other bytes. This is not a complete native HUD
record layout claim or a substitute for rendering the glyphs.

FA56's parent-coordinate projection is implemented separately from sprite-body
projection. It shifts each fixed-point node arithmetically and wraps intermediate
sums to signed16bits, including negative values; the sprite helper's final
truncation would give different results. Parent loops/missing records are refused.

Both owned-disc hit-path probes now stop specifically at FA56 after the preceding
mode/position stores around update130 (Fcommon actorpc1289, Final1297). The glyph
constructor/upload and following screen updates are still unfinished; the actor
has not been advanced past those operations. Focused HUD/actor/mapping tests91pass.
This is local source interpretation only; no emulator verification or publication.
Full source-timed looping and all-weapon/outcome UI coverage remain incomplete.

### Correction: FA56 is displacement calculation, not glyph rendering

Further owned-code inspection corrects the earlier FA56 interpretation. It
projects the actor/parents, subtracts that position from signed target words
+62/+64, converts each integer difference to double, multiplies by the owned
constant40F0000000000000 (65536), converts to signed32, and stores results at
+124/+128. The software arithmetic implementation uses integer significand
multiplication. These in-range products are exact in JavaScript. Unresolved
out-of-range float-to-int behavior is refused rather than guessed as wrapping.

The fresh display view now covers132bytes. FA56 performs these stores through
the existing HUD-state module; it is not skipped or acknowledged by a dummy
render callback. Tests preserve all unrelated bytes, exercise parent projection,
and refuse missing fields/overflow without publishing motion values.

The actual next hit-path frontier is FAC4 resource0 (Fcommon actorpc1291,
Final1299), around update130. Only common screen resource13 is currently loaded;
resource0's producer/mapping remains unresolved. An unloaded resource now yields
an explicit structured actor frontier at the same PC instead of an uncaught
exception. It never receives blank or borrowed plane contents. Focused HUD/
screen/actor/mapping tests95pass. No emulator was run, no publication occurred,
and full source-timed looping/all-weapon UI verification remain incomplete.


### Web-only continuation: selected weapon bank screen directory

User steering removes emulator/game validation from the active work; prioritize the browser player. No emulator was started. The selected Beam Saber E_BNK sc02 screen directory has a four-byte FFFFFFFF terminator before its first cell stream, in both owned F and Final images. The bounded fragment-list reader now accepts that terminator and rejects other trailing words. Whole-bank palette reads and cell-selected rendering no longer interpret gallery tile attributes; ordinary gallery decoding still rejects unknown attributes. Owned F/Final selected slots 0/1/2 decode to 4/17/17 fragments and bounded RGBA images; reused slots remain unresolved. Focused regression checks passed. This fixes resource parsing only: FAC4 resource publication/compositing and timed playback remain unfinished, and this is not a claim of completed automatic playback or game equivalence.


### Web continuation: FAC4 wide screen copy

Static source F0603AEFA..0603AF18 dispatches screen format32 to F0603B32A, distinct from the format31 word-plane path. The FAC4 web consumer now accepts separately owned four-byte planes and routes sc02 cells through the existing 32-bit copy implementation, preserving palette/flip attributes instead of truncating cells. Missing wide planes still stop the actor without consuming its instruction. Focused screen/background tests: 13 pass. Resource publication and display placement remain unfinished. The dynamic bank producer at F0601A4BC maps a script selector via F060B32D4 to a 12-byte resource row at F060B336C: +0 tile start, +2 plane mode, +4 decoded screen pointer; mode3 selects tile counter F060B342E, others F060B342C. This source evidence is the next connection point; no emulator was used.


### Selected bank plane-mode producer

F06018EEA..06018F24 explicitly builds selector mode bytes [0,1,2,0,3,0,0,0,4]; F06018FF0..06019004 indexes the first eight by (sourceSelector >> 12) & 7 and writes the 12-byte resource row mode. This separates source E_BNK directory bank from destination plane identity: Beam Saber selectors4101/4102 map to mode3, plane2. The inspector now returns that source-derived mode alongside decoded images. ReuseFFFF is still unresolved rather than assigned a plane. Focused screen/background tests14 passed. Canvas plane publication, source displacement/presentation scheduling and timed looping remain open.


### Browser-owned bank plane copies and actor palette transfer

Connected selected E_BNK frame images to browser-owned pixel planes, keyed only by authenticated selected slots. FAC4 applies source plane mode, override flags, facing, tile-coordinate wrapping and transparent overwrite; snapshots are immutable. Unresolved palette overrides still stop, rather than using another bank. Both owned Beam Saber hit programs now pass resource0 FAC4 and reach actorE0 at update135. ActorE0 uses the existing palette selection/transfer bindings (F06037200, seven-byte instruction) and EC stores the palette publication request (F0603829C, one-byte instruction). Focused bank/HUD checks7 passed; earlier plane checks16 passed. Bank plane state is not yet presented by Canvas: source scroll/displacement, live palette changes, remaining actor commands and the video scheduler still need connection. No emulator was run.


### Gundam booster color correction

User reported incorrect booster color during the approach. Owned-disc tick20 shows common actor slot32 selector1024, nativeWord72=112: the native material resolves logicalF0 to destination bank60. The fresh web scene had loaded common source colors but never published that destination, so it rendered black. F060403E6..060403FA explicitly transfers bank75 to00F0 and bank74 to01F0. Added these transfers after common loading; missing the second common source bank now blocks instead of copying uninitialized zeros. Both owned F/Final slot32 tick20 images contain14 nontransparent colors, including yellow/orange fire colors. Direct headless player UI selects Gundam/Beam Saber/default Jegan and clicks20 source steps in each game; desktop/mobile captures and page error checks pass. Screenshots player-source-steps-{f,final}-{1440,390}.png stay private. Seven web-scene/HUD tests pass, including distinct common-bank destination assertions. No game execution or completed timed-playback claim. Also added source FA54 stores (4/7 mode,00040000 priority, clear bit3); next actor frontier remains FA06 plane reset.


### Hit continuation: plane reset and gradual body-color restore

FA06 now consumes the selected plane clear and resets source HUD scroll/motion fields: source selector lookup0..4 maps [0,0,1,0,2], uninitialized tail is refused. Browser-owned bank pixel planes clear through an explicit consumer; this is a rendering abstraction, not a native VRAM-byte comparison. ActorE1 uses source negative-step RGB555 approach from F0603AC1C/F0603AA74, each channel moves one toward its selected source per command. Live palette selector and destination are reused; the explicit browser no-support context sets sideWords[0,0], allowing FF15 to resolve the selected ordinary defender palette. Twenty-six palette/HUD/web-scene regressions pass, with convergence/no-overshoot and untouched-neighbor checks. Both owned Beam Saber hit programs now run216 source updates before the existing main6811 phase-exit-preparation boundary. Canvas source-frame generation remains ready through that prefix. Timed playback, bank-plane display position and whole weapon/outcome UI audit remain open. No emulator was started.


### PixiJS web scene renderer integration

Vendored PixiJS8.22.0 standalone ESM with MIT license and pinned SHA. Included official CSP polyfills with a minimal ESM wrapper adaptation; the page CSP is unchanged and no CDN asset loading occurs. Added a preparation adapter producing web pictures/quads/UVs/clips, without native addresses/instructions in renderer input. Pixi meshes and textures are reused, selection/close release cached resources; pending initialization is shared. Compiled timeline frames now retain this web representation so GPU playback does not decode game commands per frame. Existing worker transfer remains v1 pending the full semantic timeline conversion. Updated previously non-renderable timeline fixtures to real supported commands; four timing/cache tests pass. Direct F/Final UI clicks20 Beam Saber source steps and asserts Pixi WebGL, nonempty GPU pixels, no page errors, desktop/mobile bounds. Private player-pixi-source-steps captures show the corrected orange booster. Automatic owned-disc timeline generation remains unconnected, so the play button is still disabled for source-step previews; this is not a completed-loop claim. No game validation or deployment.


### Web action autoplay and Pixi-only timeline transfer

The standalone selected-weapon action compiler now stops at the source phase-exit boundary; game map restoration/counterattack hosting is excluded from the preview. Source pictures/poses are prepared once. The player receives battle-web-timeline-v2 containing timed web quads, UVs, clips and shared pictures, not native command byte streams. Playback uses Pixi meshes/textures with automatic looping, pause, source-frame stepping and seek. Source wait units currently use an explicit fixed web clock of two NTSC fields per update; this is not a claim of all native task stalls/cadence having been verified. Bank effect planes are projected by source fixed-point displacement in the web preview's zero camera; broader camera/palette variants remain open. Prepared timelines have a per-disc-session LRU of3 entries /64MiB and are cloned before transferable buffers detach.

Initial owned F/Final action reads: Beam Saber216 frames /7.220928s, Beam Rifle101 /3.376452s, Vulcan159 /5.315405s. Additional preparation semantics: FAF6 body frame, FAF2 completion counter, main2F explicit parent/delay, D8 palette-only choice, E5 semantic sound event, and6839/683E conditional paths. Audio events are not played yet. Direct visible weapon-list clicks in both games tested these three attacks, time advances, pause holds, seeking works, loop stays running after a whole clip, WebGL pixels nonempty, no page errors, desktop1440x900/mobile390x844 bounds. Private player-pixi-auto-{f,final}-{1,2,3}-{1440,390}.png and QA report remain outside repo. The local in-app browser tab6 was opened visibly at8844/?v=20261013-pixi-loop.

107 actor/main regressions and19 timeline/worker regressions pass. Broader weapon/outcome coverage, precise timing/camera validation, audio and authoring review remain unfinished; no whole-editor completion, game execution or publication claim.

### Live effect palettes and thin web quads (2026-10-13)

Corrected fresh-web E_BNK palette registration: its slots use bases6..11,
independently of E_SPR slots0..5. Previously6000/8010/8020 read sprite colors.
Owned Beam Saber now resolves these selectors to its authenticated bank
palettes in both games. Indexed effect pixels retain palette/color references;
the compiler reads the live published colors, including later palette changes
and screen-copy palette overrides. Startup CRAOFA word offsets are256/256/512/768
for planes0..3 in both games (F0603F4D8/0603F504/0603F52E/0603F55A;
Final06044B00/06044B2C/06044B56/06044B82). The player still receives only cached
RGBA pictures and web quads. No native palette execution occurs during playback.

Owned F/Final Saber plane2 histograms at130/132/134/135 are equal, including
yellow/orange impact colors; the white defender flash follows actorE0 thenE1.
Rifle palettes differ by source: F chooses6030 and sprite4060/4070, Final6000
and4000/4010. Do not normalize their colors just because both weapons share a name.
Private GPU/browser captures remain outside the repository.

Fixed coincident inclusive quad edges so8x1/1x8 pictures cover eight pixels;
private WebGL checks confirm both, with no GL errors. Timeline playback skips
unchanged source frames and renderer resize only runs on changed dimensions.
Focused battle/worker regressions:487pass,1skip. FA02/03/04 palette easing and
actorF0 child effect creation have source-only regression coverage; Getta Beam
and Breast Fire now stop at the still-unimplementedD9 rather than pretending to
finish. No emulator was run and no deployment occurred.

Separate source review found6839 conflates unit traits with outcome packet
flags. An explicit-context planning helper is tested but not wired: the normal
battle trait producer is unresolved. Current generic evade/defense routes and
precise scheduler timing therefore remain incomplete; UI transport QA does not
establish their native semantic equivalence.

### Ground motion, owned common effects and web transport (2026-10-13)

The normal response producer is now resolved. A fresh ordinary preview has no
barrier/equipment/support substitution; unit traits and the attack outcome are
separate inputs to6839/683E and actorD0/D1. Actor motion descriptors are selected
from owned root34 movement/terrain tables and BTSR metadata. The previous
unconditional descriptor0 selected the air path for Gundam/Jegan; the default
plain5 profile correctly selects descriptor1/type0. FA35, FA00 and FA46 now
consume their source-derived fields. Missing compatibility remains an explicit
failure, not an invented descriptor: three water-only units in each game need
a sea environment. The player now exposes all owned terrain rows; sea9 opens
the actual underwater source path for these units. Weapon-specific commands
may still stop later in that path.

The ground Saber path requires FAC4resource15. The F/Final producers use BTSR
cell8's bk01 and cell9's sc02, plane3 and palette bank92. These common effects
are now separately authenticated and registered. They are not taken from the
selected weapon's E_BNKslot0. D9 restores all16 background banks; FA02/03/04,
F0, FAF0/F1/43, main30, and FAD2 have bounded source-only implementation and
regression coverage. Current owned ground Saber actions compile216updates in
both games. Rifle hit/defense/destroyed compile101 and evade119. The action end
is still the standalone phase-exit preparation boundary; this does not claim
that the destroyed outcome includes the later game-host destruction sequence.

Corrected6801 side selection using F0603FBE0..0603FC4E and Final06045220..
0604528E: FE selects side0, FFside1, then directionbit6 inverts the selection.
Side0 uses palette6/tile0; side1 uses palette22/tile0400. The earlier helper
inverted both side identity and bank convention, hiding the defect when both
units shared the same ground background. Prepared frames now carry the resolved
background index, and the web action changes its cached backdrop when the source
switches sides. Full source background scrolling, per-cell color calculation,
priority and display-blend interpretation remain open.

The nominal battle update interval is source-derived, rather than gallery
cadence: F0603F6FA..FE and Final06044D22..26 set the SDK period to2; the outer
loop invokes table0 callbacks once before sync, while vertical blank decrements
the countdown once per field. The web timeline uses2NTSCfields/update (about
33.43ms), preserving decoded waits. Hardware loading/rendering stalls are
excluded; exact runtime task-to-field scheduling is not claimed.

Effect pictures are cropped to occupied pixels before timeline transfer without
raising the64MiB budget. The Saber impact GPU image stayed byte-identical in the
bounded pre/post-crop check. Frame preparation now snapshots only selected
indexed pictures synchronously before asynchronous work, retaining live palette
and source-generation coherence without copying the entire texture arena for
every update. The player is created when opened, and opening no longer starts
an extra cancelled action compilation.

The three visible timeline tracks now show actual web object presence and pose/
picture changes. Track clicks seek to the real segment start;4x zoom changes the
actual time window, labels and keyframe positions, and follows playback without
changing viewer height. Unsupported combinations report their limited state
instead of leaving a perpetual preparation message. Direct F/Final UI checks
cover Saber1, Rifle2 and GettaBeam100 transport, real zoom, desktop/mobile bounds,
page errors and local-only requests. This is bounded coverage, not an all-weapon
claim. A separate60distinct-program audit per game found24ready/30partial/
5blocked/1error at its recorded revision;243/258 physical programs were not yet
sampled. Source bytes, captures and movies remain private outside the repository.
No game or emulator was run in this continuation and nothing was deployed.

Latest60-program rerun after common15: F/Final each30ready,29partial,1preparation
error (Drill Storm103 paired-bank cell bounds). This remains a representative
sample, not whole-game coverage. Full local npm suite passed1664tests with102
skips, followed by59Python tests; standalone verify_repo.py passed. Later
per-object blend and environment selection work requires its own verification.

User clarified the apparent cutout problem is the Saber hit burst around Jegan,
not the blade color. Source pixel audit of updates130/132/134/135 shows index0
is already transparent and no opaque RGB0000 pixels. The dark red boundary
is nonzero index13, palette0003 -> RGB24/0/0. At update132 the lossless web PNG
and GIF are pixel-identical, while H264/YUV420 adds some color spill. The
source HUD display controls are active in that window; their display consumer
and composition weighting remain under investigation. Do not remove palette
index13 or arbitrarily expand the RGB555 conversion to255.

The clarified Saber hit-edge issue is now corrected in the bounded web path.
F0603C788..0603C80E and Final06041B84..06041C0A consume the same HUD blend
state: plane2 top ratio19 resolves to effect12/32 plus lower20/32, normal blend.
The source priority update places the enabled effect at6 above ordinary body
selector4 at4. A validated HUD composition helper feeds semantic opacity and
foreground ordering into the web scene. Other priority selectors or unresolved
blend modes stay partial; source callback transition timing is not claimed.
The Pixi texture upload now premultiplies once, preventing a second alpha
attenuation. Original indexed effect colors and the transparent-zero mask are
unchanged. Direct F/Final UI captures each cover216 logical updates, seek,
frame stepping and looping. Updates130..135 use opacity0.375 above both bodies,
with fixed viewer height and no page errors. Private corrected PNG/MP4/GIF
artifacts are under web-pixi-saber-alpha-video-20261013-0616. GIF quantization
is not the pixel-accurate reference; the retained PNG is. Full npm validation
confirmed1680passed/102skipped and59Python tests, and standalone repository
verification passed534files. No game/emulator was run and nothing was published.

Further bounded web progress, 2026-10-13 (no game/emulator/deployment):

- FA3E selected complete status-word branching is implemented with signed
  operand-relative displacement and no new wait. Owned HyperHammer5/Gundam1
  toJegan21 is ready203updates in both games; real UI transport/seek/loop and
  fixed desktop/mobile viewer bounds passed.
- Main08 uses a separate wrapped byte loop counter, shared across main calls,
  and continues without another tick. F060179A8/Final06017E3C handler78bytes
  plus interpreter return scopes agree. BreastHurricane126/Mazinger30 now
  compiles143updates in both games with exact selected-picture whitelist.
- Both256entry main dispatch tables send99explicit reserved opcode bytes to
  the same pureF000 handler. Their semantics are one-byte continuation, not
  the actor VM's instruction meanings. F FinFunnel42/Nu9 now compiles185updates;
  Final still reaches an explicit FAD6 frontier at tick80 rather than silently
  continuing. Main/actor/scene focused suites passed160tests.
- FA54 retains NBG2 pixels but disables the plane. Visibility is now resolved
  separately from color calculation using the source BGON low-byte mask.
  Source startup requests24/28/32/36/40 are1/2/00040000/8/00100000,
  initialized without altering other HUD fields. The core omits the disabled
  effect plane. Owned F/Final Saber/Rifle/GettaBeam boundary checks pass;
  source ratio19 belongs to Saber, while sampled Rifle/GettaBeam top mode
  uses ratio0. Unresolved activeFA53 second-image composition remains separate.
- FAC4's exact sc02 terminal descriptor with zero width or height is a no-write
  copy preserving existing pixels. Other unregistered fragments still fail
  closed. ColdBeam120/Mazinger30 compiles176updates in both games; large beam
  paths proceed beyond terminal46 but stop at unverified next descriptor47.
- A balanced6bank audit before these latest fixes checked60distinct physical
  programs per game (one owner each),24ready/35partial/1error. Exact selected
  physical source post-validation found0mismatch in315picture links pergame.
  This is not whole-game coverage; full distinct-program audit is queued with
  immutable private JS snapshot and per-row revision evidence.

A bounded source-only Boomerang99/110/144 probe still finds selector0131 while
its group1's authenticated source contains only3registered pictures. NativeC0
really preservesFF00 and replaces the low byte; native material reads
textureBase1+49 before clipping. The effect is active/visible and on-screen.
Missing texture ownership/history remains unresolved; no unrelated picture or
blank image is substituted.

The full Node suite at the recorded pre-core-baseline snapshot passed1703 with
102skips; latest HUD baseline/core/web-scene focused40tests passed separately.
All analysis artifacts and screenshots remain outside the repository.

Subsequent source-backed continuation (no game execution or publication):
FAD6 now applies the source actor64 low-nibble alignment store. FinFunnel42/Nu9
compiles185updates in F and160 inFinal; both real web UI transport/seek/loop
cases passed. FA05 now moves the selected plane's fixed-point scroll with the
source facing signs and signed32 wrap. E2 changes exactly one source plane
request. Foreground/rear visibility is consumed in both automatic background
assembly and manual source stepping, with explicit plane identity retained
through reverse background ordering; selected bank planes are also gated.
CE/CF add signed16 velocity deltas to the existing motion consumers.
ShineSpark112/GettaDragon27 still has an explicit DA frontier after457updates
at the recorded revision; its palette recovery callback is being implemented.

Fresh F/Final UI checks cover Saber1, Rifle2, GettaBeam100 and RustHurricane126,
including no retained effect after sourceFA54 disables it. Both games'216Saber
sourceframes were captured and encoded at the original2field/update cadence,
not a fixed gallery delay. Private report/MP4s are in
player-pixi-fa54-fourweapons-qa-20261013T065741236Z. The visible mobile stage
height is stable, though its tall letterbox remains a UX refinement.

The whole F physical-program inventory audit is finished in an immutable
private JS snapshot ba7c3ea1edec1e82b8446a31a3c1fdb85b81e62657b107269aaa84ec331d6eb6:
303programs,168ready/126partial/9errors,0unexaminedprograms and0physical source/
background mismatches in prepared paths. It checks one owner each;876other
program-body combinations and other terrains/reactions remain unverified.
Final318programs are still running against that same snapshot. These status
labels describe bounded timeline preparation, not complete visual or game
accuracy, and later actor fixes are verified separately from the frozen run.

A source scan found actualFA53 in3physical programs pergame:438/109,441/110,
466/118. A pure guarded second-layer picture preparer is available; runtime
connection awaits explicit lower-layer and glyph-plane emptiness proof.
FA53 cannot be replaced by a single effect-wide opacity, nor can the ordinary
layer order be claimed for all program paths.

### 2026-10-13: palette publication and source-only web coverage

The frozen full inventory run above finished for both games: F168/303 and
Final171/318 representative programs reached the phase-exit boundary. Their
programs are shared by870/957 editable weapon records respectively. This is
not verification of every owner, terrain or reaction variant. The immutable
run remains separate from the later source changes.

F2 controller support cleared14 of20 formerly blocked representative programs
in each game. ReflectorBits397, DancougaSword724 and OmegaLaser838 passed actual
web transport, seek and repeat checks in both games. No emulator was executed.

DA now publishes its one-channel palette recovery through the selected scene.
BBACK pictures retain validated color/palette indices for preparation and use
the same captured destination palette generation as the sprites. The playback
bundle receives RGBA only. The background switch had incorrectly repeated its
first4 source palette banks; the proved outer-loop increment now publishes all
16 banks. Source-frame background RGB matches the owned original after the
ordinary Saber/Rifle background switch. Explicit opaque black Back remains
visible when both background planes are disabled.

ShineSpark112 now prepares500 updates,16,715,111 nominal microseconds in both
games. Actual web UI playback and the E2 sky-disable boundary were checked.
The updated Saber/Rifle/GettaBeam/RustHurricane UI run checked8 combinations,
including autoplay, pause, exact seek, activity and repeat. Its source revision
was unchanged during captures; no external requests or page errors occurred.

DE/DD use a source-backed shared phase and a semantic color-offset callback.
Actual clicks exposed a publication alias: replacing the closed-over offset
object left the returned prepared scene on its initial RGB. Updating its
properties while preserving object identity fixes that defect. Fresh F/Final
CosmoNova source-step captures show the background reaching black while body
colors and opaque alpha remain. These programs still stop at FA07; complete
autoplay is not claimed for them.

FA53 preparation now has explicit Back ratio, rear-null semantics and
per-pixel top-role color offsets after mixing. The former no-replacement
conclusion for Qubeley438/441 was incomplete: it counted copies but missed
FA06 clears. Actual UI/source guards reject tick42. Source checks prove that
these paths clear both background maps and that the owned BBACK0/1 tile0 is
transparent. Binding those clears to explicit empty background content remains
pending, as does the later glyph-overlay composition. No guard was weakened.

The full Node and Python tests at the initial continuation snapshot passed
1780/102skips and59 respectively. Repository verification first rejected a
source-reference URL in a runtime comment; the URL was removed, with the proof
kept privately, and standalone verification passed. Later fade-alias fixes and
helper extensions have separate focused/owned-web evidence. All disc data,
sprites, screenshots and videos remain outside this repository.

### 2026-10-13: backdrop content, line scroll and compact web pictures

FA06 clears are now bound to semantic backdrop content independently of the
display-enable mask. The selected BBACK side's actual 8×8 tile0 must be fully
transparent before a cleared map can be represented as empty; unresolved
nonempty clears still stop preparation. Later real cell copies mark replacement
content, and background publication restores its presence. FA53 therefore uses
an explicit absent rear after a proved clear rather than fabricating a picture
or relaxing its lower-layer checks.

The initial background also needs the action-entry context. Static source
evidence shows common programs1/3 publishing `6801 FE` before `6804` enters
D_ANIME, with no intervening background clear. Preparation now reconstructs
that initial terrain publication semantically. It does not execute the host
prelude in the web player. In particular Stoner retains its two initial
backgrounds until the script changes their state; it is not made smaller by
omitting them.

FA07 was previously misidentified as rotation. Register-consumer evidence
instead identifies NBG line-scroll control. Its proved identity-row case and
FA57/58/59/5A scroll-anchor tracking now feed the existing semantic viewport
offsets. The unresolved nonzero row mode remains blocked. CosmoNova298/67
prepares391updates in each game and passed actual web transport, seek, activity,
repeat and fixed desktop/mobile bounds. CaloricSmash324/73 still stops at its
resource0 fragment28: the selected owned sc02 has descriptors0..26 and the
terminal27, so expanding the read boundary would not be justified.

The web-only timeline now uses v3 pictures: decoded RGBA is losslessly mapped
to a local web color table with one/two-byte indices when this costs less than
RGBA. Pictures with too many colors keep RGBA. These indices are independent
of game palette numbers. No source commands, palette addresses or mutable
palette state cross into playback. Source preparation and legacy transfer
remain separate. Worker transfer and the retained-cache budget count the
encoded arrays; Pixi reads the local color table on the GPU. Arbitrary alpha,
opaque black, transparent colored pixels, subviews and odd-width rows are
preserved. The shader's tight rows use explicit unpack alignment1.

Private GPU regression compares41 cases to the retained RGBA renderer with
zero differing pixels and zero GL errors. The frozen152-module Stoner audit
revision2d301c15…4fca50 separately proves both games reach429updates,
14,341,565 nominal microseconds. Each retains410 indexed pictures totaling
28,314,336bytes versus113,182,976bytes expanded RGBA, within the unchanged
64MiB budget. Every retained picture and1,975 web objects matches its independently
prepared RGBA baseline. The31 selected physical picture links have no source
mismatch. Both initial512×512 backgrounds match the owned BBACK images, and
actual WebGL seeks0→261→388→428→0→128→0 restore the initial colors exactly.

These selected fixes do not revise the earlier full621-program coverage count
without another complete inventory audit. The latest full npm run at this
pre-performance snapshot passed1819Node tests with102skips and59Python tests;
repository verification passed546files. No game/emulator was run and nothing
was published. All owned game data and rendered evidence remain private.

### 2026-10-13: first-selection latency and source-bound no-write operations

The original v3 encoding path was lossless but slow: actual cold Stoner clicks
took44.35s in F and44.51s inFinal. Profiling identified repeated validation of
every candidate picture as the main cost. Source RGBA signatures now select a
small candidate bucket, with an exact RGBA-to-indexed byte comparison before
reuse; signatures are never accepted as equality proof. Deliberate collisions
and mutable-source reuse are covered separately.

Background preparation registers a private immutable source lookup once per
selection, then repaints only when an actually used RGB555 word changes. It
does not omit backgrounds, alter alpha, or discard source validation. Every
palette/offset is still checked. Detached worker output is regenerated. A
preparer certifies only its own immutable RGBA views; copied or differently
shaped views use the ordinary comparison path. The timeline's private owned
pictures are validated once per action. Default scene compilation and all v3
wire imports retain strict validation.

The same cold source action fell32.52s→9.16s→4.42s→1.95s in bounded Node
profiling. Fresh real UI clicks finally measured F2.179s andFinal2.162s; warm
return after another weapon measured0.292s/0.293s. Actual first Pixi frames
were2.164s/2.147s. All429 timestamps, poses and410 encoded pictures match the
earlier immutable wire exactly. Sixteen selected GPU/RGBA comparisons have
zero differing pixels. Desktop/mobile viewer height is unchanged and no
horizontal overflow or page error occurred. This is one measured Mac mini,
not a browser/device-wide latency guarantee.

Caloric's later original FAC4 operands27..32 need a separate consumer result,
not an expanded image directory. The selected owned sc02 blob contains each
entire8-byte reference, and the aliases28..32 are zero windows in its cell
stream. Static source proves all four copy modes return without writing tiles
at height0. Preparation now requires the original7-byte FAC4 to match every
copy operand, a valid selected sc02 directory terminator, a wholly bounded
window, and all-zero alias bytes. It returns a typed no-write operation,
retaining existing pixels/revision and updating destination bookkeeping.
Directory/gallery decoding and malformed-reference rejection are unchanged.
Both games' Caloric324/Granveil73 prepare340frames/11,366,275µs.
Their actual autoplay, pause, seek, step, repeat, end-stop and fixed-height
checks pass.

A separate complete621-program audit at revision15a55c7c…1936af (before these
latest no-write/performance changes) finds F217ready/86partial/0exceptions and
Final227ready/91partial/0exceptions, using exactly the earlier representatives
and terrain policy. Physical source and mapping mismatches are zero. Background
output color in52/53 program rows remains explicitly unverified; this is not
whole-game visual validation. The remaining most frequent frontiers include
DC, FA34, FAC4, FA36, FABB andDB. Later selected fixes are not silently added
to this frozen coverage count.

### Owned battle dialogue on the web timeline (2026-10-13)

The local action compiler now prepares selected attack/response dialogue from
the owned BMESS directory, actual weapon record byte2 &63, explicit pilot IDs,
the original short name/body packets, root36 glyph masks and FACE expressions
selected by subjectFlags &3. Hero profile/crew/event conditions without a
proved selection remain partial. No unit-to-pilot binding or fallback quote is
invented. Channels0/1 evaluate current/opponent unit conditions against attacker
and defender, even when channel1 speaks as the defender.

Root5's first BE24 word is lastGroup254, not a directory byte extent. Entries
at group*3, the768-byte directory and final pointer55248 delimit the original
six-byte duration records. The original reciprocal A01A01A1, initial period2
NTSC cadence and silent option22-set branch determine nominal update delays.
Packets16/17/18/FF, main6848/6849 and activation stages drive a semantic cue
scheduler. It retains the visible page through the selected action boundary;
counterattack hosting, native audio and hardware stalls are outside this
profile. No fixed invented per-caption duration is used.

The default random seed0 is a reproducible web preview choice, not the game's
live random state. Evade/defense/destroyed dialogue profiles remain partial;
their synthetic presentation flags are not used to invent response captions.
Pages appear as completed source glyph composites, not incremental typing.

Dialogue-on also exposed the shared FAEF/FAF8 result-popup consumers. Their
bounded selectors, decimal digits, branch operands and game-specific x carry
were proved from both owned executables. They consume an explicit web result
context; this preview neither computes combat damage nor claims a numeric HUD.
FAF9 remains its original two-byte hierarchy/facing operation, without an
extra operand or delay.

Prepared cue IR contains only timed web pages, portraits and speaker metadata.
It rejects native fields and remains in the combined64MiB action cache budget.
Worker transfer deduplicates buffers and retains cancellation/session guards.
The same Pixi renderer draws cached caption quads after the scene. Pause, seek,
step and loop use the same action clock, including cue-only redraws between
identical body frames. The original text page's arena crop stays264x48 at56/160.
The completed window comes from owned BTSR cells4/5, sc01 fragment1:320x64 at
0/160, with its original mechanical corners and two palettes. FACE is40x40 at
16/172. The centered page quad is60/168 through324/216 with the original
320x224 viewport clip. All18 measured pages have zero glyph ink in their final
12columns, so this overscan loses no measured characters. Font slot0 is
transparent,1..14 whiteRGB248 and15 opaque black. This replaces the temporary
colored rectangle without altering cue timing or body poses.

Eight independent owned-source cases (F/Final, Saber/Stoner, seeds0/2) yield18
cues and36 page/portrait comparisons with zero different pixels. Independent
packet/root5/main activation calculations match every cue start. Ordinary
HP100/no active barrier selected attack and response are the measured scope.
Both products' real browser controls prepare, autoplay, pause, seek and repeat;
desktop and320/360/390px viewport checks retain fixed height without overflow.
These results are not whole-game, all-dialogue-condition, audio or emulator
validation, and no public publication occurred.

### Ordinary web background camera correction (2026-10-13)

The action path reused the static placement helper's512-to320 shrink. That
put the horizon near grounded sprite feet while sprite quads kept their
original pixel scale. Both owned initializers publish horizontal0 and
vertical280.0; the line initializer advances sourceY one pixel per row. The
SDK initial VDP2 zoom increments for both planes are00010000. Action
backgrounds now retain one-pixel scale and consume prepared HUD scroll
coordinates at108/112 and116/120. The512x512 planes wrap as cached web quads,
with the initial view at0/-280. Manual FA58/5A positions use those same
coordinates. Body quads and cue clocks stay unchanged; flying Getter retains
its source air profile.

This covers the initial ordinary crop and existing scalar/manual scrolls.
Broader per-row parallax bands remain a separate preparation task. Common
flat ellipse artwork does not establish a native shadow consumer, so no
shadow or arbitrary body-foot shift is presented as source-proven.

### EN presentation completeness for numeric edits (2026-10-14)

A bounded F source-only probe cloned Saber1 into weapon1248, set power4100,
EN20 and unit EN120. The isolated calculator returned damage3400 and
attacker EN100. The selected action's HUD remained120. The source carrier
has2406bytes: main680B at46 specifies HP1/EN1; actor38 starts1858 with
FAE6 and ends immediately, while actor41 starts1871 with the separate FAE7.
The preparation observer saw actor38 assigned to slot49 and no E7 execution.
Neither a missing EN count nor a source cost calculation explains the gap.
No game or emulator was executed for this probe.

The result packet's lowbyte bit4 is not a positive-EN-cost flag. Owned F
0602C5D0..0602C5EC and Final0603026A..06030286 copy raw unit byte8 bit4 to
working unit176hex bit2. F0606533E..06065356 and
Final0606B9C0..0606B9DA publish it as packet lowbit4. Its gameplay meaning
is unresolved; the shield boolean is a distinct raw byte9 bit4. Lowbits2/3
come from a separate lookup result. These bits must not be fabricated to
start an EN actor.

The pure resolveBattleHudEnergyPresentation helper separately checks retained
cost, released-but-pending HUD reduction and the observed final readout.
An EN timing gap stays partial while the numeric calculation and edited row
remain independently valid. Final's displayed999 exception still requires
both retained and pending costs to finish. Playback receives semantic status,
roles and expected/observed values only; it does not receive native counters.
The helper neither schedules a timer nor replaces the observed final number.
Numeric edits do not establish a new animation schedule. Explicit animation
authoring or a proved source assignment remains required to connect an EN
actor that the selected original path does not start.


### 2026-10-14: source body-shadow startup restored in web preparation

The earlier separate-shadow-helper assumption is rejected. Existing owned
trace data (no fresh game execution) identifies common selector100E in slot6
with parent1. Its group16 texture14 matches the original64x16 command. Owned
root0 common entry0 explicitly constructs slots6/7 with2D/2E, origin0/0,
attrsAE11 and commonseq8, then calls6803. The dispatch resolves to
F06040258/Final06045898; it publishes100C+(packed-sizebyte>>5&3) and hides
both pictures initially. Source scene-entry phase4 explicitly initializes the
attachment policies to0. The two packed size bits derive from rawunit+10 low2
in both games, with independently checked constructors and packet writers.

`readBattleStartupAttachmentPlan` verifies both constructor commands, their
following6803 and the six-byte ownedseq8(FA4301F9FFFC). Fresh web preparation
reuses the existing attributes/sequence behavior and selector publisher, then
FA43 supplies actual visibility, facing and parent linkage. The timed Pixi
player receives ordinary pictures and quads only. Source16/48/64/80x16 art
uses index15 of palette1, RGB(0,0,24), and transparent index0; its original
color is retained. Active shadows are assigned to their body timeline track;
a reused slot is not permanently classified as a shadow.

Actual latest browser checks cover both games, ground/air/space and four sizes
(12 selected profiles): source RGBA/hash mismatch0, parent-follow error0,
pause/seek recovery, fixed320px layout and overflow0. Independent GPU checks
for Saber/Stoner retain every contributing shadow pixel; the air attacker
and space pair follow the source hide conditions. These are browser
presentation checks, not new game execution or full weapon coverage.

### 2026-10-14: guarded web light-rim presentation correction

The owned F/Final Rifle2 effect at ticks 33 and 75 comes from E_BNK on
NBG2. Indexed and expanded RGBA GPU output agree exactly. Its dark rim is
opaque source palette data, not texture padding or an incorrect alpha key.
The source top-ratio mode is normal, so switching to screen is explicitly
a reversible web presentation enhancement, not a native-mode correction.

The full C_ROBOT/E_SPR/BTSR structural audit parsed 5,942 F and 6,182 Final
pictures without errors. All 40 padded pictures per game use index0 for
padding; index15 and opaque dark colors are legitimate art, including the
body shadow. That audit does not cover every E_BNK plane animation.

Preparation pins each screen-copy record's source carrier. A mixed or
unknown carrier fails closed. The correction requires only E_BNK data on
plane2, the original animation donor's beam bit, an authenticated normal
top-ratio profile, transparent regions, a bright core and a multilevel
palette with a dark boundary. It changes GPU blend state only; source
RGBA, alpha, export bytes, playback geometry and timestamps are unchanged.
The default-on conditions checkbox is applied with the other draft values
and can restore the original composition. Canvas supports the same style.

Actual UI checks toggled F/Final Rifle2 on/off and repeated the warm paths:
18 corrected frames per game, source-picture and HUD hashes unchanged,
outside-effect GPU difference0, exact normal/screen restoration. At tick33
the 193 tested dark-rim pixels no longer darken their background; tick75
similarly covers 136 visible rim pixels. Six nonmatching Saber, Stoner,
Bazooka and Hammer profiles remain untouched. The 320x568 conditions panel
has no internal scroll or clipping, and play/pause/seek/loop retain fixed
viewer height. GPU style tests compare 51 indexed/RGBA fixtures exactly;
eight analytic colors agree within one byte with the screen formula. These
are bounded browser and pixel checks, not game execution or all-weapon
manual coverage. Captures and owned image data remain outside the repository.

### 2026-10-14: source gauge pieces connected to timed HP/EN values

The numeric HUD replacement had omitted its changing gauge consumer. Source
F0604697C / Final0604C17C uses common picture26..34 for 0..8 filled pixels,
with palette0 published through physical bank61. The ordinary caller supplies
HP width88 and EN width24; a zero maximum takes the source full-width branch.
`prepareBattleHudBars` validates the owned common carrier, picture geometry,
palette and pivots, then supplies nine ordinary web pictures. Preparation
includes them in the 64MiB picture budget and worker transfers.

The web HUD renders current/max ratios from the same timestamped `hudCues`
as the native numeric glyphs, so seeking and looping cannot independently
accumulate damage or energy costs. Source gauge coordinates are HP left48 /
right200, y12, and EN left112 / right264, y18. Each original8x8 piece has
opaque rows2..6 only. HP gauge row18 touches EN digit ink; the compositor
preserves numeric ink by comparing each owned glyph with its owned blank
pair. This explicit web legibility choice does not resolve a hardware
priority tie or use an RGB-key heuristic. The 18 owned gauge pictures compare
exactly with an independent decoder; synthetic composition and warm-transfer
tests cover value changes, cutouts, bounds and cache restoration.

Original cost profiles already release EN correctly: GettaBeam822 costs40
in both games and displays200->160 at source ticks32..45. Stoner823 costs80
in F, displaying200->120 at ticks135..150, and90 in Final, displaying200->110
at ticks135..151. Independent browser checks of16 numeric states agree with
the owned glyph output. No numeric release timing or game-data writer was
changed for the gauge fix. Edited zero-cost animations without an EN release
remain explicitly partial as documented above.

Fresh UI gauge checks cover F/Final Stoner823 and GettaBeam100: 144 owned
picture hash comparisons and 122,880 opaque HUD GPU pixels match, with no
numeric-ink overwrite. EN floor widths are24->14 for F Stoner,24->13 for
Final Stoner and both Getta100 profiles. A separate F Stoner sample at
10,162,787us verifies partial HP1748/3400 at45/88 pixels and EN120/200 at
14/24 pixels. Gauge pixels retain their source color; the prior HUD colors
outside the gauge rectangles are unchanged. All four profiles restore on
seek/loop and retain fixed320/390px layout without overflow. No game was run.

### 2026-10-14: automatic source reaction labels on the web timeline

Preparation now invokes the existing F46C0C / Final4C40C indicator consumer
with `(sceneFlagsByte << 8) | sceneFlagsLowByte` and the two result packet
high bytes. Header high-byte bit6 selects a packet; packet bits2..3 select
guard2 (防), evade3 (避), or the counter candidate0/1 (反). Header word
bits7/8 suppress only the latter. Both source consumers are byte-identical.
The separate source config producer sets those suppression bits, but its
complete UI/eligibility enum remains unresolved. Fresh header0 stays an
explicit ordinary-response preview profile, not a real counterattack roll.

Only timestamped semantic choices and display sides leave preparation in
`hudIndicatorCues`. Playback selects the cue at its current position and
draws the owned16x16 art at source x136/288,y8. The HUD cache includes choice
and side, restoring blank areas when markers change or disappear. The manual
counter checkbox is removed; the conditions panel explains the marker's
scope. No 攻 art or fabricated producer has been added.

Resolved selected-evasion previews previously lost class3 when the dialogue
outcome builder reduced them to an ordinary miss. The F5BFDA..5BFE4 choice
setter and Final6B8BC..6B8C6 producer independently prove packet0C for that
selection. The explicit `responseAction: 'evade'` now retains0C00 for hitfalse
and defense-none only. Ordinary misses retain class0, afterimage retains
class1, and shield/parry/barrier activation keeps the selected action class.
Evade button selection also clears an earlier guard choice. This changes
the selected response preparation, not game-data writes or counter replay.

Fresh actual UI checks cover16 selected F/Final profiles: ordinary, guard,
selected evade, shield, parry, afterimage, AT-field and Rifle/I-field. Source
class and timed labels agree; 576 source-picture hash comparisons and32
start/end HUD samples (327,680 opaque pixels) have no mismatch or ink loss.
Guard-to-evade clears the guard choice and produces0C00 in both games. The
manual checkbox is absent, 320/390px panels fit, and pause/seek/loop retain
the selected marker and unchanged numeric/gauge rendering. These remain
web-profile checks and do not claim counterattack replay or game execution.


### 2026-10-15: proved empty texture slots and remaining command97 context

The current `20261015-empty2` preparation distinguishes unused, source-cleared
texture slots from unresolved asset ownership. F initializer0600989C and
Final06009AC4 clear geometry, attributes and pivots. The accepted relocated F
wrapper060B31DC clears its relocated geometry/attribute arena and pivot arena;
its helper calls and bounded ranges are validated from the user's executable.
Only a branded fresh state, an index beyond its registered tail, and unchanged
zero geometry/attribute/pivot/format bytes permit an empty draw. The local draw
copy is culled; live actor flags, selector and clock remain intact. Unknown,
allocated, mutated or unproved entries still block. This is not a fabricated
sprite, a selector mask or proof of historical native load order.

Actual accepted F/Final Tomahawk99/unit24 prepare all four response modes:
149 attack/guard frames,155 evade frames and215 destruction frames. Rechecking
95 previously failing non-MAP cases yields33 ready,26 partial and36 blocked.
The latter36 have unresolved unit graphics. Remaining partials include Drill
Storm background tile260 outside its declared260 tiles, Dossbrecher command97,
BattleReturn completion counter and SuperElectromagneticSpin cache word1.
These are preparation checks with dialogue/voice/SFX disabled, not exhaustive
web playback, all combat conditions or gameplay fidelity.

Static command97 handlers are F0606F9A4 and Final06076340. Both read a selected
16-byte host row, use its byte2 to index a30-byte table, call a lookup, and
conditionally write bytes20/21/22 of a second host table. The last write keeps
low6 bits and sets bit7. The handlers return6000 (advance one opcode and continue), with no
visual-resource load or actor queue call in the inspected body. The table
meaning and complete lookup/context remain unresolved; the command has not
been replaced with a no-op. Private evidence pins both executable hashes,
instruction bytes and pointer literals in
`pixi-command97-host-state-proof-20261015.json` outside the repository.

A frozen source snapshot is now being audited across F5404 and Final6676
linked weapon/owner/response combinations. Its result files have a distinct
prefix and source/code hashes; older partial scans are not relabeled as current.
The scan tests static preparation with a default target and conditions; it
cannot establish GPU rendering, arbitrary pilot/opponent branches, audio or
editing/export correctness. Full product tests before this documentation edit:
2337 JavaScript pass,102 skip,59 Python pass and repository verification703 files.


### 2026-10-15: actor cache increment/set commands

ActorFAF3 andFAF4 now share the same retained word cache asFAF2 and main6812/13/14.
The owned F auxiliary dispatch table060B2C44 and Final060B9218 point F2/F3/F4
at F06035ECC/06035EF0/06035F14 and Final0603B160/0603B184/0603B1A8.
Static instruction inspection proves increment/decrement with16-bit wrap and
F4's unsigned BYTE operand stored as a WORD. F4 consumes4 total bytes; F2/F3
consume3. They continue within the same actor invocation without adding waits.
Only the setter marks a previously unknown word known. Unknown reads, invalid
word storage/known-set context and out-of-range indices still stop before
mutation, retaining the command cursor. Shared main6813 observes the actor's
updates directly. The bounded authoring reader now understands these widths,
without granting edits to counter or source-reference operands.

236 focused tests pass, including setter255→increment256→main wait→actor
completion255→main continuation, word wrapping, missing provenance and invalid
index/storage contexts. Both source dispatch triples and cache literals were
independently checked; the instruction/hash proof remains outside the repo.
Current web revision is20261015-counters1. The ongoing full matrix uses the
frozen older empty2 snapshot, explicitly labeled as such; it is not a current
counters1 completion audit.

A bounded unique-selector scan of linked weapons inspects299 F and314 Final
programs. Its reachable actor instructions contain162/191 F2 occurrences, and
no F3/F4 occurrences. Four source programs in each game fail this authoring
reader, and6994/7432 incomplete paths remain. This cannot exclude F3/F4 in
unvisited or unlinked paths. The new commands are implemented from source;
they do not establish that SuperElectromagneticSpin's initial counter or
BattleReturn's miss-path counter has been resolved. Neither is seeded from
boot-zero assumptions.


### 2026-10-15: secondary period authoring contract and admission ceiling

The C8 secondary installer exposes a bounded `frameInterval` operand contract.
The UI value is1..256 actor updates, encoded as the original period byte0..255;
users do not need to subtract one. Source and reparse readers use the inverse
conversion. The pointer bytes, opcode and program length remain unchanged.
The secondary stream remains noneditable and the primary reader still stops
at its concurrency boundary. No sprite, palette or reference editing is
implicitly admitted. The field participates in preset validation, carrier
normalization, reset and authenticated synthetic-disc export/reopen.

Tests prove first/second-picture timing for1,2 and256 updates, preserving all
bytes except the period, with carrier rewrite/removal and invalid bounds.
The owned F/Final C8 instruction bodies at06037F88/0603D254 match58 bytes.
69 focused tests passed before adding the additional full-disc round trip;
the latest complete JavaScript suite has2343 passes and102 skips.

Admission investigation: hypothesis—linked D_ANIME weapon2 would expose an
editable C8 period. Observation—it does not, in either game. The broader
bounded unique-selector scan likewise finds no admitted C8 field. This
refutes a claim that the current user's original weapons already expose this
new control; unknown paths and BTSR common tracks have not been admitted.
Next minimal probe—identify the actual primary-to-secondary installation
source for a reachable weapon and preserve its common/private ownership when
creating a per-weapon editing allocation. This field contract is groundwork,
not completed original-weapon keyframe composition or proven owned-disc
period export. Synthetic protocol exports are a separate evidence ceiling.
Current web revision is20261015-period1.


Fresh period1 browser smoke: accepted Final v0.3 c selected locally, weapon110
DoubleTomahawkBoomerang automatically playing at1.45/6.02 seconds, ready,
no console errors. The counter-only predecessor also played its evade path
at4.94/5.85 seconds. This is a bounded browser smoke, not every outcome or
proof of a C8 editing control on original weapon records. The latest JS suite
passes2343 with102 skips; the counter predecessor's complete npm run passes
its59 Python tests and repository verification703 files. No game was run.


### 2026-10-15: authoring inspection now follows already implemented commands

The bounded actor reader omitted widths that the playback clock already uses.
C6/CB, D0..D3, D9..DE, E2/E5 and source-proven display/palette/attachment
auxiliary commands now advance over their complete operands. F7 follows both
flag-branch paths; FA35 follows both motion-mask paths with the native
`pc+2+sign16(word+1)` target, including7FFF→8000 wrap. Addresses and opaque
operands remain noneditable. Concurrent secondary tracks and unresolved paths
retain explicit diagnostics rather than being treated as complete.

Tests check branch-to-operand rejection, both conditional paths, the signed
wrap edge, and opcode-looking sound/policy operand bytes. Only the known
movement/hold field changes; state/palette/sound values cannot be submitted as
edits.69 focused tests pass; the latest full JS suite passes2346 with102 skips.
Current cache revision is20261015-widths1. The full matrix still runs the
explicitly frozen empty2 snapshot and is not a latest-widths1 completion audit.

Actual accepted F/Final Tomahawk99 inspection grows678→730 instructions and
admits26 previously omitted hold operands in each game. A newly reached hold
at record offset1894 changes1→2, survives private carrier reparse and prepares
an attack timeline with149 frames in both games. The sampled attack's total
frame count is unchanged; this does not prove that this conditional hold runs
in that outcome, nor constitute owned whole-image export/gameplay evidence.
The C8 control remains groundwork: no admitted original C8 editing point has
been found in the inspected linked D_ANIME sources. The new concrete benefit
is wider existing primary movement/hold editing, not complete composition.


The frozen F scan has now reached1760 combinations (1575 ready,109 partial,
76 blocked). New failure class: rear-additive-sprite-priority-unresolved,
first observed on BlackHoleCluster305/Granzon69;12 response profiles fail
that layer-priority requirement. Additional named-owner graphics remain
unresolved, including Char'sZakuII340/HeatHawk347. These are discoveries from
a partial frozen scan, not a current support percentage or full-game audit.


Fresh Final web authoring check: Tomahawk99 now exposes record offset1894 as
motion152. Its hold changes1→2, survives the apply/reload of the editor panel,
and opens the actual auto-playing player at2.72/6.22 seconds with no console
errors. Closing playback and resetting that movement restores1. This confirms
UI/application/preview integration, not that the sampled attack executes the
specific conditional hold. F and owned full-BIN reopen checks continue.


### Actual owned full-image authoring validation and reset limit

Product exports from accepted F v0.5 a and Final v0.3 c now reopen through the
production inspector as personal images. The newly admitted Tomahawk99 hold
at1894 is retained as2. Full output sizes are578512032/521680656 bytes;
private hashes/reports are in `pixi-widths-owned-export-20261015` outside the
repository. No game image or extracted asset is committed or served.

Fresh personal reopen permits another export with hold3. Reopening reads3
in both games. Removing the project produces a valid personal image with no
weaponProject, and its entire decoded TSR equals the accepted input. Whole
BIN hashes do NOT match the original accepted hashes. The current evidence
proves decoded-data restoration/project removal and successful authenticated
reopen, not exact raw-image restoration; the raw difference cause is not yet
localized. The first private probe incorrectly assumed empty edit tables
were legal, and was corrected to submit the complete product table snapshot.
No product acceptance check was relaxed. Game execution and remote publishing
remain absent.

F web smoke also retains2 after apply and automatically plays at0.40/6.35
seconds without console errors; closing/resetting restores the original hold.
These tests establish UI and data integration, not execution of every
conditional edited instruction. Inspection-only widths now have distinct
maps: admitting a conditional instruction's length for authoring cannot make
the representative sprite reader silently skip an unresolved branch. Current
revision is20261015-widths2. Full latest widths2 JS verification passed2346 with102 skips after
that separation.


Final fresh widths2 F browser check selects the owned accepted disc, opens
Tomahawk99 and automatically plays at1.32/6.35 seconds, ready and without
console errors. This starts from a clean source session after test edits were
reset. Latest full JS results:2346 pass,102 skip,0 fail. No gameplay was run.


### 2026-10-15: rear additive priority3 and independent visible-owner masks

The old rear-additive guard stopped even on sprite selectors3/4. The same
owned startup profile used by top-plane composition proves selector3 resolves
to priority3: F0603F492 / Final06044ABA load r10=3; the priority helper writes
that byte at shadow060FFDB2, PRISB's high byte. The source NBG2 publisher
selects priority3 in rear mode. With the already established sprite-over-scroll
tie rule, selector3 stays above that plane. Selectors0/2 remain unresolved.
Private source/hash proofs include both helpers and the actual byte stores.

`resolveBattleHudRearSpriteOrder` admits only the owned rear-additive profile.
All3+ sprites keep the plane behind them; all1 sprites put it in front. Mixed
streams carry an independent rear ownership bit per sprite. Web preparation
keeps the original sprite queue/depth order. Pixi renders a second reusable
coverage target using the same geometry, so a later low sprite erases an
earlier high sprite's ownership, and priority3/6 planes cannot share the wrong
mask. Indexed/RGBA pictures, clips, frame changes and cleanup are covered.
A masked rear plane combined with sprite color calculation remains guarded:
its native second-visible-image selection is not proved by priority alone.

24 focused tests pass. Real WebGL fixtures pass21 cases /324 pixels,
including7 new rear cases with reversed overlap, indexed pixels, transparent
sprites, higher6/7 sprites, simultaneous front/rear planes and clipping.
These are synthetic GPU composition proofs, not game execution or full owned
frame pixel comparisons. Actual accepted F/Final BlackHoleCluster305/unit69
prepare all4 outcomes; frames1816/350/1816/1882. NeoGranzon309/310 also prepare
16/16 profiles before the final coupled-blend guard; fresh guarded rechecks
are running. Current revision is20261015-rear3a. Latest JS2351 pass,102 skip;
the preceding full npm run also passed59 Python tests and repository703-file
verification. No emulator or remote publication was used.


Final guarded rear3a recheck is24/24 ready (305/69,309/70,310/70 ×4 outcomes
×F/Final). All24 have zero rear-mask frames, so the owned profiles prove the
priority3 tie admission, while mixed rear masks remain synthetic-GPU coverage.
Existing front masks occur across4956 prepared frames. The private verification
JSON pins the current root-module hash, source scope, result grid and limits.
F fresh actual web checks confirm305 attack/evade/guard/destruction autoplay:
35.85/62.92,10.03/11.93,55.78/60.71 and33.03/62.92 seconds, no console errors.
Final attack/evade/guard checks also autoplay; destruction check is pending.
These are bounded actual web smoke checks rather than every-frame native
pixel comparisons. Full JS2351 pass,102 skip, and prior full npm59 Python /
703-file repository verification remain green. No game was executed.

### Exact unedited project copies (2026-10-15)

Project writing now skips operand enumeration only when the submitted edit list
is empty; reopening first validates the source record span and exact payload
length, then accepts a byte-identical source payload without instruction walking.
Changed payloads still require the existing proven-operand parser. This enables
unchanged copies of playable programs whose overlapping branches the authoring
walker cannot enumerate. It grants no new keyframe or opaque instruction edits.

Regression fixture exercises a branch into a CC operand: exact copy, repeated
save and carrier reset succeed; an operand edit and changed stored byte fail.
42 authoring/project/core tests passed; git diff --check passed. Actual owned
F v0.5a and Final v0.3c preparation for weapons 305,309,310 (selectors 548,549,550)
passed six source-payload equality, repeated-save and exact D_ANIME carrier-reset
assertions. Private evidence: pixi-exact-copy-20261015.mjs/json. This is carrier
and product preparation evidence, not new whole-BIN export or UI evidence.

Frozen empty2 baseline F audit finished all 5404 linked weapon/owner/outcome
combinations: 4688 ready,256 partial,460 blocked. Those are static preparation
results at snapshot hash 14184784b7820f18003c692bfdaa77ad745e2804eebf0e5d1eb10b32e58c93c1,
not current rear3a support totals or browser rendering coverage. Final's distinct
parallel audit remains live. The original job's duplicate Final phase was stopped
only after confirming F completion and the original process command ownership.

### Exact-copy UI and whole-image reopen follow-up (2026-10-15)

The add button first calls animation inspection. Inspection now exposes a
copy-only result for the two specifically recognized overlapping-instruction
errors, after structural span validation. It grants no editable fields; malformed
records and other exceptions still fail. UI explains unchanged copying is
available while individual motion edits remain unsupported. Strict editing still
uses inspectWeaponAnimation. 49 authoring/UI/project/core tests pass.

Actual full-BIN product export and authenticated personal-image reopen passed:
F new weapon1248, 578512032 bytes, SHA256
97209d0f7b3abc5f5411806cd990906454624a1709f75c21b973afc4b2b80cc3;
Final new weapon1331, 521680656 bytes, SHA256
9a8406c468dc89ca86ed1f16f9cd923408b3e4c01d1dcd75e6f1194346014fa3.
Both preserve source selector548 and custom name 복사검수, no operand edits;
reopened cloned attack timeline is ready with1816 frames. Private artifacts and
report: pixi-exact-copy-owned-export-20261015/. No game execution.

Actual fresh F browser UI on8897: opened weapon305, clicked 무기 추가, received
새 무기 추가 · 원형의 사용 속성 유지; new-name input 블랙홀클러스터 and 신규 무기 삭제
visible; opening 연출 편집 displays the copy-only limitation. Console errors empty.
This browser check covers F addition, not yet Final addition or cloned playback
in the browser. Tab32 retained for next verification.

### Cloned animation browser playback and inspector contract (2026-10-15)

F weapon305 was added through the actual browser UI, then its player opened:
재생 준비됨,2.07/62.92 seconds, pause button visible, console errors empty.
A subsequent read showed4.79/62.92. This is actual cloned browser playback,
not just timeline preparation. Closing/pausing through the browser-control tool
hit CDP observation/input timeouts; the tab remained present and ready, so it
was preserved rather than restarted. Deletion was not completed or claimed.

Inspection now reports editScope exact-source-copy-only when it cannot expose
safe motion operands. A synthetic full inspector/export/reopen regression checks
original inspection, free-slot admission, cloned inspection and refusal of edits.
14 core tests pass. The full JS suite immediately preceding this metadata-only
edit had2353 pass,102 skip,0fail (2455 total); git diff --check clean.

Frozen F failures were grouped rather than counted as unsupported unique weapon
programs:428 scene-unit-graphics-invalid cases concern21 owners (primarily
extended records326..344 plus352/353),192 MAP cases,32 web-motion-pose-unavailable.
No owner was silently excluded or assigned substitute graphics. Final audit
process57560 remained live at8m27s, with656/6676 results at the last report read.
These frozen results are not latest-code support totals.

### Funnel main69 inactive-slot positioning (2026-10-15)

Current-code weapon493/unit125 preparation in both games stopped at main69,
sceneTick55,pc285. Bounded diagnostics proved slot1 existed but was removed;
direction and reaction state were valid. Native F0604424E..060442DA and
Final06049A22..06049AAE select retained slot1/4 and directly write record+4/+8,
without checking active bit7 or allocating a record. Private disassembly with
source executable hashes: pixi-main69-inactive-slot-proof-20261015.json.

Removed the extra web-only active-record precondition for main69. No actor is
allocated or reactivated by coordinate assignment. A four-control regression
checks coordinates change while removed/ended remain true and bit7 stays clear;
missing actor and unknown context still block. Main-clock68 tests passed.

Owned current source weapon493/unit125, target21, dialogue/voice/SFXoff:
F and Final attack176,evade154,defense176 frames ready. Destroyed progresses to
sceneTick241, then blocks on unresolved priority2 sprite composition. Evidence:
pixi-funnel-position-outcomes-20261015.json. These are static timeline outcomes,
not actual browser rendering or a claim of complete funnel support. Browser
control of the retained clone-playback tab continues to time out during clicks;
read-only DOM still works, no restart was inferred from those timeouts.

### Priority2 investigation and fresh funnel browser QA (2026-10-15)

Static ordinary-scene initialization F0603F5BC..F5F8 and
Final06044BE4..4C20 writes PRIS selectors1,3,4,5,6,7, but not selector2
(helper offset-5). Separate scene setup contains value5 at that offset; therefore
selector2 cannot safely be treated as identity2 or as transparent. No layer guard
was relaxed. Private source hash/disassembly: pixi-priority2-initializer-audit-20261015.json.
The outstanding destroyed-outcome blocker remains unresolved.

Old browser tab32 was authoritatively absent from the browser session; listTabs
returned empty. Created fresh hidden tab34 at8897/?v=20261015-funnel69, loaded
owned F v0.5a, clicked weapon493 and its battle player. DOM showed ready,
0.61/5.88seconds, automatic playback, attacker125 규네이전용야크트도가,
console errors empty. Clicked 회피; preparation in progress, retained tab34.
Final frozen audit process57560 verified live at11m45s,960/6676 prepared results.
Fresh F weapon493 UI follow-up: evade ready0.60/5.15sec and defense
ready5.08/5.88sec; autoplay present, console errors empty. F attack/evade/defense
have now been clicked and observed in this fresh browser session. Final actual
browser coverage is still pending; static source outcomes do not replace it.

### Display request19 / beam ribbon (2026-10-15)

Request19 independently resolved from F table060B3458→0603CF18 and
Final table060B9A90→06042314. On uncached entry it writes HUD words2/4=4/3,
sets bit6, calls CCCTL setter with0107 (retains high nibble, enables additive
bit8), then publishes word2 as the low enable byte; cached entry preserves
caller words. Helpers F060A8198/81A8 and Final060AE678/E688 are verified.
Private source hashes/disassembly: pixi-request19-source-proof-20261015.json.

Implemented this consumer and its exact cached4/3 effect-only additive
composition, using existing proved NBG2 priority/mask pipeline. No broad mode
fallback.36 display request/composition tests pass, including cached-word
preservation, top/rear priority and refusal of uncached/multiplane inference.
Owned weapon981/unit255 target21, default conditions, dialogue/voice/SFXoff:
both games attack171,evade142,defense171,destroyed237 frames ready. Evidence:
pixi-beam-ribbon-request19-20261015.json. Actual browser QA remains pending for
this new request19 implementation.

Expanded source check for826/219,862/230,1163/303 across F/Final and four modes:
22/24ready;826 destroyed in both games stops later on priority2 atsceneTick248.
862 and1163 all modes ready, including destruction. Private report:
pixi-main69-rear3-expanded-20261015.json. Not all conditions or browser evidence.

Final actual browser weapon493: default owner124 야크트도가 attack1.12/5.88sec,
evade3.10/5.15sec. Explicitly switched owner125 야크트도가: evade5.09/5.15sec,
defense2.30/5.88sec, autoplay true, no console errors. Owner125 attack preparation
was started next. Do not label Final owner names using the F name table.
Final owner125 attack follow-up: ready2.85/5.88sec, autoplay true, console errors
empty. F and Final owner125 attack/evade/defense now have actual UI observations.

### Request19 browser finding and cached-mode correction (2026-10-15)

Fresh Final web click of981/255 exposed a real omission: player fell back to
단계별 미리보기 instead of autoplay. Adding the same explicit unresolved-mode
guard used for request18 localized it tosceneTick80, mode7 without top flag8.
The previous permissive path had silently rendered an unresolved composition;
its eight ready results were insufficient proof of correct full playback.

Source request19 cached path calls only the low-enable-byte publisher, preserving
CCMD bit8 originally written by0107. Consequently later FA54 words4/7 still
select additive mode, like request18. Added that exact cached mode7 case and
regression; retain explicit failure for unresolved request19 compositions.48
focused display/composition/core tests pass. Guarded owned source rerun underway;
F four outcomes are ready again. Fresh Final web source reloaded for recheck.

Boot code06004086..96 in both games clears SDK shadow060FFC00..060FFFFF,
including selector2 shadow060FFDB3. Private proof:
pixi-priority2-boot-clear-20261015.json. This is boot evidence only: intervening
writers still need establishing before treating selector2 as invisible. No
sprite-priority guard was relaxed or visible sprite silently discarded.
Guarded request19 rerun completed all8 ready (171/142/171/237 frames per game).
The new cached-mode test initially expected all uncached mode7 states to be
partial, overlooking the valid existing top-ratio mode; corrected the assertion
to prohibit additive inference while preserving that valid ratio path.48 focused
tests then passed. No runtime behavior was changed merely to satisfy that test.

Browser reload still showed stage-only preview, so actual request19 web playback
remains unverified. Module cache identity was unchanged across iterations; bumped
all source import/index identities consistently to20261015-request19b and began
a fresh owned Final reload. This is a cache hypothesis, not a confirmed cause.
New fullJS run session13126 pending. Earlier fullnpm session52608 is still in
Python validation; its JS results predate request19 changes and must not be
reported as validation of those changes.
Fresh browser confirmed app.mjs?v=20261015-request19b. Final981/255 attack
now ready5.50/6.59sec with autoplay and no console errors under default dialogue/
voice/SFX settings. Changing module identity and reloading resolved the observed
stage-only behavior; prior stale-session results are not counted as latest QA.
Clicked destroyed, preparing. Latest complete JS run:2459total,2357pass,
102skip,0fail,24.12sec (/private/tmp/pixi-request19b-all-js-20261015.log).
Final981/255 destroyed browser follow-up ready8.23/8.69sec, autoplay true,
console errors empty. Actual web coverage now attack/destroyed for this weapon;
evade/defense and all F browser outcomes remain pending.

### Request19 complete Final outcome clicks / validation (2026-10-15)

Latestrequest19b Final981/255 actual UI: evade ready3.67/5.42sec,
defense ready0.29/6.75sec, autoplay true and no console errors. Together with
previous attack/destroyed observations, all four Final outcomes have now been
clicked and observed under default dialogue/voice/SFX settings. This does not
prove pixel identity or every dialogue branch. F source loaded next, still
awaiting editor readiness. Tab34 retained.

Earlier fullnpm session52608 exited0:59 Python tests in327.043sec, repository
verification703files passed. Its JS portion predates request19; latest JS result
is the separate request19b2357pass/102skip run. Explicit current-state
python3 scripts/verify_repo.py launched as session99970.
Frozen Final full-matrix process57560 verified live at18m47s;1424/6676 completed,
1323ready101partial. These are old frozen-code default-condition preparation
results, not latest support or UI coverage. F complete failure grouping saved
privately as pixi-f-failure-groups-20261015.json for prioritization.
F981/255 actual browser outcomes completed: attack4.11/7.89sec,
evade4.07/5.55sec,defense2.83/6.65sec,destroyed3.91/8.86sec. All autoplay,
console errors empty on attack/destroyed reads. With Final's four observations,
request19 beam-ribbon has been clicked in all8 game/outcome cases onrequest19b.
Durations include default dialogue/voice timing; do not compare directly to the
silent static source counts or claim exhaustive dialogue/audio branch fidelity.

Aquatic compatibility probe changes terrain only to9 (sea), target21,
weapons550/146,570/152,1149/299, all four outcomes. F12/12ready; Final11ready
at last read, last outcome still running. This disproves treating the default
plain-terrain pose refusal as missing animation implementation for these cases.
Other weapons on those owners are not implicitly verified. Private evidence:
pixi-aquatic-compatibility-20261015.mjs/json. Preparation only, not browser QA.
Aquatic probe terminal0, final report24/24ready. All three selected aquatic
weapons across both games/outcomes prepare under sea terrain. No blanket
movement compatibility bypass was introduced.

### Terrain incompatibility notice (2026-10-15)

The existing player already distinguished terrain incompatibility from missing
animation, but did not identify which side caused it. App now carries only the
bounded blocked side index to the player; notice names the affected attacker or
defender and current terrain and points to the terrain selector. aria-invalid is
set for incompatibility and cleared when a new preparation starts. Selection is
never changed automatically. Syntax check and95 frontend/motion tests pass.
Revision20261015-terrain1 consistently replacesrequest19b to avoid stale imports.
Fresh F source loaded and weapon550/146 opened on default plain terrain for UI
verification. Static24/24 aquatic outcomes from previous probe remain scoped to
sea terrain; no game movement rule was bypassed.
Actual F550/146 UI onterrain1: plain shows 지형 선택 필요 and
해저요새부드 · 평원에서 이동 불가. 위 지형을 바꿔주세요.; terrain aria-invalid=true.
Manually selected sea9: ready2.56/5.95sec,autoplay true,aria-invalid removed,
console errors empty. This verifies incompatible→compatible recovery without
reloading the disc or replacing the weapon. Standalone verifier process73760
confirmed live at3m08s; Final audit1712/6676, original process still running.

### All aquatic weapon recheck, not just representatives (2026-10-15)

Expanded selected aquatic owners to all eight default-plain pose-refusal weapons:
550,551,552,553/146;570,571,572/152;1149/299, target21,sea9,four outcomes,
F/Final.64 total,56ready8partial. All failures are572 Marine Vortex, same
bank fragment9 tile260/palette127 boundary as DrillStorm. Thus environment
compatibility does not imply all weapon programs are supported. Report:
pixi-aquatic-all-linked-20261015.json, terminal0.

Bounded bank tail probe in both games: decoded bank payload8648 bytes,
32colors,260tiles,pixelStart328,declared pixel end8648,zero trailing bytes.
Tile260 has no stored pixels. Empty slice .every()==true in the exploratory
probe is vacuous and DOES NOT establish a transparent tile. No virtual blank
tile, palette wrap or out-of-bounds skip was added. Native loader/scroll-cell
semantics must explain this reference before rendering it. Private script:
pixi-bank-tail-probe-20261015.mjs.

Started latest terrain1 recheck of64 frozen F non-MAP, non-invalid-graphics,
non-environment failures, keeping source modules unchanged while it runs.
Session53925, report pixi-terrain1-f-failure-recheck-20261015.json;19 processed
at last read (6ready13partial). Other failure categories remain in baseline;
they were excluded only from this explicitly scoped recheck, not total coverage.

### bk01 descriptor versus out-of-bank screen reference (2026-10-15)

Current paired source metadata for DrillStorm: E_BNK bank838303..844335(F),
852026..858058(Final), sc02 payload10968 bytes,14 true fragments. Fragment9
is a valid directory entry,40x6cells at6168. The offending00FF0104 is at134;
other cells include00FF0106. Thus this is not merely a false terminator fragment.
Private bounded report: pixi-drill-screen-metadata-20261015.json.

Native bk01 descriptor construction F0603B7B2..7F4 and Final06040BAE..BF0
is68 byte-identical instructions. It reads BE16 colors/tiles and computes
palette+4,attribute+4+2colors,pixels+4+2colors+tiles,matching the web parser.
Private hashed disassembly: pixi-bank-pointer-provisional-20261015.json
(status updated after exact Final comparison). No extra stored tile was found.
Native sc02 loop F0603B3D8..3E6 reads32bit cells, XORs flip mode, adds the
registered relocation and writes the plane; it has no paired-bank bounds test.
A cross-allocation/retained tile reference is therefore a hypothesis to trace,
not a reason to skip the invalid cell or assign arbitrary zeros. Next bounded
question: resource tile allocation and ownership around producer0601A4BC.

Standalone python3 scripts/verify_repo.py completed:703files,fail-closed release
policy. Original Final matrix remains live;1936/6676 at last report read.
Latest terrain1 F residual-failure recheck39/64 at last read; left running.

### Native global tile allocation producer (2026-10-15)

F0601A4BC producer chooses resource table060B336C (12byte rows), uses
counter060B342E for plane3 and060B342C otherwise, stores the start tile in the
resource row, then uploads declaredTileCount*32 bytes at25E00000+startTile*32.
It increments the selected counter by exactly declaredTileCount. No reserved
extra tile is inserted by this function. Final producer prefix found uniquely
at0601A994; its340 instruction bytes through return are byte-identical.
Private hashed evidence: pixi-bank-vram-allocation-20261015.json. This confirms
global placement, but source upload order and cross-bank tile/palette ownership
still need resolving. A neighboring resource is not assumed to be transparent.

Latest terrain1 F recheck completed64/64:33ready31partial, session53925 exit0.
Explicitly excluded MAP,invalid graphics and plain-terrain motion failures
remain tracked in baseline; this is a residual-failure recheck, not full current
coverage. Report pixi-terrain1-f-failure-recheck-20261015.json. Source code was
held unchanged while that run completed.

### Tile allocation starting points and refuted neighbor shortcut (2026-10-15)

Ordinary setup writes counters800/2000: F0603F626..630 and
Final06044C4E..58, corresponding constants F0603F72A/72C and
Final06044D52/54.12 instruction bytes and both literal values match. Private
hashed proof: pixi-bank-start-counters-provisional-20261015.json (both offsets
subsequently verified). Normal/plane3 allocations are separate regions.
DrillStorm's owned six-slot list contains load0 plane3/32colors and load1
plane1/32colors; slots2..5 reuse unknown prior data. Consequently slot1 is not
the immediate next tile after slot0. No cross-bank borrow was implemented.
Private source report: pixi-drill-all-resources-20261015.json.

Hypothesis: invalid tile260/262 can reference a previously loaded/global tile.
Observation: per-bank pixels end exactly at tile260; native global allocation
and raw-cell relocation permit external references, but selected slot1 lives in
a different allocation region.
Refutation: neither an extra stored tile nor the next declared slot explains
this reference; an empty read cannot establish transparent pixels.
Next minimal probe: bound initialization/uploads in the effect region after
common resource loading; do not widen rendering until that ownership is known.
This remains an explicit unsupported fragment, not completed playback.

### Common resource allocation and frame-choice feasibility (2026-10-15)

Common dust loader F06040414..04B0 registers BTSR cells8/9 as resource15,
plane3, palette92. It reads the same effect-region counter, uploads
count*32 bytes and advances that counter. This links common resources to the
same allocator, but does not yet prove their timing relative to every weapon
load or retained out-of-bank pixel ownership. No atlas was guessed.

Before exposing frame-index editing, scanned owned weapon1,2,99,245,493,981
in both games for branch-free blocks containing explicit BF bank and multiple
C0 selections. None of12 inspected programs supplied that proposed easy profile.
Private script/report: pixi-frame-choice-candidates-20261015.mjs/json. Therefore
no dead or synthetic-only frame-choice UI was added. Native actor code also
uses C1/C2 selector increment/decrement and secondary tracks; correct bounded
frame replacement needs selector/dataflow plus original asset registration and
post-edit timeline validation, not a free numeric C0 field. Existing project
frameBank/frameIndex write guards remain unchanged.

### Scale keyframe editing connected (2026-10-15)

Added native FA10 signed scale setter and FA11 signed scale delta to authoring
inspection, fixed-length editing, project validation/reparse, preset schema and
UI fields 크기/크기 변화. No sprite bank/index references or instruction widths
change. Raw native signed range is preserved; tooltip explains0=default and
100approximately100%, with native clamp above801. Delta retains native enable
condition and per-axis signed clamp. UI still preserves untouched original values.
Source F06032E88/32F28 and Final06038114/381B4: respective160/104 bytes identical,
with pinned hashes in pixi-scale-authoring-source-proof-20261015.json.

An initial six-weapon sample had no scale fields, so scanned all768 D_ANIME
selector entries per game before claiming practical availability.62 entries per
game contain admitted scale operands; this is not a deduplicated program count.
Linked examples include233 GoFlasher,823 StonerSunshine,112 ShineSpark,297 Akashic
Buster. Evidence pixi-scale-all-programs-20261015.json. No synthetic-only UI claim.

38 focused authoring/project/UI tests pass, including signed word exact writes,
actual actor-clock scale/delta effects, preset roundtrip, repeated carrier saves
and exact carrier reset. Latest fullJS:2461total2359pass102skip0fail,24.17sec.
Private owned full-BIN export/reopen for GoFlasher233/unit51, setter offset762
100→150 confirms project value150 and authenticated personal image in both games:
F SHA1328450dec2781c0e3e8615b652b600dafe5a37b0972540a3b8386f013b6b143,
Final SHA f7d40a07acb1152adfb9e6771d473811387b7ef1b0f16f6a709928d729334df1.
Report pixi-scale-owned-export-20261015/report.json. This first setter can be
overwritten before display, so metadata persistence alone is not visual proof.

Separate visible setter offset766300→150, product projected project, attack,
target21,dialogue/voice/SFXoff: both games252frames, frame74 has changed vertices
for slots17..20. Quads359x335 become179x167,center preserved; comparison uses
vertices/slot only, not picture keys or metadata. Report pixi-scale-geometry-
20261015.json. One affected source frame, not an assertion all animation changes.
Matching visible-setter full-BIN export/reopen launched session32318 and remains
pending. Actual browser control editing and replay still pending; cache revision
will be bumped after source probes finish to avoid mixed module identities.

Visible-setter owned full-BIN export/reopen completed in both games,session32318 exit0.
srwf-f SHA256 8d2b4be9e124b8cfdfe355d03fc6766d9c8bea989a93ac9715b8ede92646ae70, offset766 scale150 authenticated.
srwf-final SHA256 9129381a92d100c5208982d6b8ef615d93b4be59dca8f27810753dc7015ff890, offset766 scale150 authenticated.
Report pixi-scale-visible-owned-export-20261015/report.json. Cache revision updated consistently to20261015-scale1 after probes/tests completed.

### Scale UI end-to-end in both games (2026-10-15)

Actualscale1 F233/unit51: selected motion offset766 (동작15 · 크기), input300,
changed150 and clicked 적용. Input retained150. Opened player: ready2.14/10.70sec,
autoplay true,console errors empty. Closed player:150 preserved. Clicked
이 움직임 초기화:300 restored. Final same original field300→150 apply, player
ready6.64/10.70sec/autoplay/no errors, close retained150, reset restored300.
This verifies UI apply/replay/reset plus the separately authenticated owned BIN
writes. It is scale editing, not arbitrary frame-bank swapping or full NLE
composition. Scale delta serialization/clock covered by tests; direct UI delta
editing is not separately claimed. Tab34 preserved on Final editing panel.

### Frozen Final remaining audit partition (2026-10-15)

To reduce wall time on8cores/16GiB, prepared two workers on the SAME frozen
snapshot. Verified original PID57560 command ownership, deliberately terminated
it (not an observation-timeout restart), then preserved its last complete JSON
with3216results. Anchor immutable file:pixi-empty2-final-shard-anchor-20261015.json.
Unwritten in-flight results, if any, are simply included in remaining work.
Remaining3460 keys partitioned disjointly by stable pending order parity,
1730 each. Coordinator records anchor SHA256,source/code hashes and every
expected key:pixi-empty2-final-shard-coordinator-20261015.json. Asserted anchor+
partitions=6676 and no overlap. No source modules were edited by partitioning.

Workers PID89630/session98151 andPID89631/session47340 both verified live,
each32 stored results at31sec; report keys verified inside assigned partitions.
Reports pixi-empty2-shard0/1-matrix-srwf-final-20261015.json. Later merge MUST
validate coordinator, source/code hashes, exact expected key coverage and no
duplicates, then combine with anchor. These remain old frozen default-condition
static timeline results, never latestscale1 or all web rendering coverage.

### Explicit effect creation placement/timing authoring (2026-10-15)

An attempted FA16/17 rotation-field addition was removed after scanning all768
D_ANIME selectors in both games found zero admitted uses. Native setter/delta
consumers exist, but a synthetic-only editable field would not complete actual
weapon authoring. Private rotation source proof/scan retained; product/preset/UI
rotation changes and their provisional tests were reverted exactly.

Instead added F0/F1 explicit child spawnX/spawnDepth signed-word and spawnDelay
unsigned-byte editing. Inline request bit7 excludes all these fields because
its program-pointer aliases need independent proof. Request,parent,attributes,
sequence pointer and instruction extent stay unchanged. F06037A68/37C20 and
Final0603CD34/3CEEC native consumers reuse established child-clock behavior;
first96 instruction bytes identical for each pair, source hashes recorded in
pixi-spawn-source-proof-20261015.json (prefix proof is not full-function equality).
Preset bounds enforce delay0..255; other signed operands retain native ranges.
41 focused tests pass, including actual child-clock facing, delay, parent,
sequence and attributes after editing, exact allowed-byte diffs, inline refusal,
project repeat/reset and preset roundtrip. FullJS before the last focused clock
assertion:2463total2361pass102skip0fail,24.91sec.

Initial GoFlasher233/offset1712 spawnX64→164 serialized and reopened in both
full owned BINs, but did not alter default attack geometry. HeavenDart1008's
F1offset1406 also did not change default geometry. Those are persistence-only
observations, not visual feature proof. Direct prepare+tick probing did not run
the complete web host pipeline (1000ticks without script exit) and was rejected
as execution-path evidence. Wrapping the retained pool allocator could not see
its current actor's uncommitted pc and produced empty candidate lists, also not
used to infer inactivity.

A private frozen copy of the current product modules instead logs inside the
actual F0/F1 interpreter and passes through the real web action pipeline, with
only bounded trace writes. Product code is not instrumented. For GoFlasher,
these outcomes never run those F0/F1 commands. HeavenDart attack runs F0 at816,
828..924 seven times each,2094 nineteen times; source program identity and
scene tick are recorded. Evidence pixi-spawn-exact-pipeline-trace-20261015.json.
This resolved the two failed visual probes before picking a genuinely executed
command; no visual assertion was weakened.

HeavenDart1008/unit261, source offset816 spawnX-128→-28: both games262frames,
44 frames have changed actual slot/vertex geometry,first145. First affected
slot32 quad moves288..344 to300..356 at unchanged95..119 vertical extent.
Evidence pixi-spawn-live-geometry-20261015.json. No picture-index-only comparison.
Matching full owned BIN output/authenticated reopen completed in both games:
pixi-spawn-live-owned-export-20261015/report.json. Current private BINs retained.
No game/emulator execution or publication. UI input/replay/reset still pending;
revision updated consistently to20261015-spawn1 after root-source probes finished.

Live spawn edit full-BIN identities:
srwf-f ffedfc06afb239adf2394a7c9ac75f2fd3f22962e5c462863756129e8f045b9e;816 spawnX-28 authenticated.
srwf-final 14bbec8076eab42bab6c8209d9b0cacfd3491594cfde143c40f351e4cf20b39f;816 spawnX-28 authenticated.
Actualspawn1 F1008 UI selected offset816, showed spawnX-128/depth64/delay0; changedX-28 and clicked 적용, retained-28. Player ready4.78/8.79sec, autoplay true, console errors empty. Closed player retained-28; clicked 이 움직임 초기화 restored-128. Final UI still pending.
Public local8844 index checked to serve20261015-spawn1. Frozen Final shard reports1200/1730 and816/1730 at last read; not completion or latest-code support totals.

### Final spawn placement UI and exact delay effect (2026-10-15)

Actualspawn1 Final1008: offset816 input-128→-28, 적용 retained-28; player
ready5.46/8.79sec,autoplay true,no console errors. Close retained-28, 이 움직임
초기화 restored-128. Then set spawnDelay0→5, 적용 retained5, player preparation
started. This completes position apply/replay/reset UI in both games; delay UI
replay/reset still pending.

Separate current-product owned source probe for spawnDelay0→5,1008/261,
attack,target21,dialogue/voice/SFXoff: both games262frames before/after,
51 changed slot/vertex frames. Native selected child slot32 first visible145→150,
asserted exactly5frames later. Report pixi-spawn-delay-geometry-20261015.json.
This proves the delay affects actual web scene timing, not a rewritten metadata
value. It does not establish every branch or combined delay edits.

Frozen Final coordinator validated again: anchor hash/source/code identities,
partition memberships, no duplicate keys or overlap.5744/6676 unique cases
stored (anchor3216,shard0=1536/1730,shard1=992/1730),still incomplete.
Local hook core.hooksPath confirmed .githooks. No commit or publication.
Final delay5 UI follow-up: ready0.56/8.79sec,autoplay/no console errors; close
retained5; reset restored0. Delay actual UI apply/replay/reset now verified in
Final. F delay effect has compiled geometry evidence, not separately clicked UI.

### Cross-weapon isolation and player/editor selection handoff (2026-10-15)

Current playerlink1 UI: Final opened outer weapon1008, switched inside player
to weapon2, reached ready2.75/5.58sec, then closed. Outer weapon-option-2
aria-selected=true. Original sprite-gallery count0; console errors empty.
Closing now passes current record index to existing jumpToEditorRecord helper,
so authoring selection follows the weapon actually selected in player.
Earlier spawn1 combined1008 offset816 X-28/delay5 survived switch2 then1008;
reset restored X-128/depth64/delay0.
Private pixi-authoring-isolation-20261015.json: both games entire transferred
timeline deep-equal for weapon2 with versus without another weapon1008 edits;
summary separates preview owner1 from edited owner261. Silent default branch.

Frozen empty2 Final audit completed6676 unique cases:6191ready,453partial,
32blocked. Anchor/partition hashes and exact coverage validated by
pixi-merge-final-shards-20261015.py; complete report
pixi-empty2-complete-matrix-srwf-final-20261015.json. This is the older frozen
snapshot preparation matrix, NOT latest-code exhaustive support or browser QA.
344 cases explicitly MAP scenes;32 unavailable terrain poses. Remaining
failures include priority composition, bank-global tile ownership, native cache
and position context. Current targeted fixes must be rechecked separately.
Current playerlink1 full JavaScript suite:2464total,2362pass,102skip,0fail
(25.45sec), pixi-playerlink-all-js-20261015.log. No emulator or deployment.

### Latest-code exhaustive preparation audit and condition UI regressions (2026-10-15)

Captured immutable playerlink1 module snapshot; code SHA256
054e4c373b361ab3e002c0d4469fdbca6f4b8c8da630d0b61b9900d2c1cf0f18.
Started full owned-image F5404 / Final6676 weapon-owner-outcome matrices, with
independent processes and incremental reports. At first validated observation
both64cases ready; processes3424/3583 confirmed live. Sessions71775/64400.
Private scripts pixi-playerlink1-audit-srwf-f-20261015.mjs and Final equivalent,
reports pixi-playerlink1-matrix-{game}-20261015.json. Default target21/terrain5,
dialogue/voice/SFXoff: this tests scene preparation, not exhaustive rendering,
audio, all terrain branches or arbitrary combat conditions. No old result reuse.

Actual Final playerlink1 UI: selected attacker pilot2 (Ramba Ral) on weapon2,
then switched1008 (Heaven Dart); explicit pilot2 retained. Opened battle
conditions: defenderHP3400. Destroyed mode changedHP1, returningattack restored
3400. These are direct UI regressions of user's sticky casting and HP complaint,
not proof of every branch nor separate F UI execution.

### Native0x97 dispatch identity revalidated (2026-10-15)

Rechecked actual owned F table060B21BC / Final060B869C cell0x97 against
executables: handlers0606F9A4 /06076340. All110 instructions per game in
existing host-state proof matched source bytes. Important numeric distinction:
0x97 is decimal151; decimal97 (0x61) points to the reserved no-op handler
0601789C /06017D30 instead. New private proof
pixi-command97-dispatch-recheck-20261015.json pins hashes and identities.
The handler copies selected external-row bytes into dynamic-record bytes20/21
and updatesbyte22=(byte22&63)|128. Which prepared host row and lookup result
applies is still unresolved; no no-op or fabricated capture semantics admitted.

Latest-code matrix interim: F256checked244ready12partial; Final240checked
236ready4partial. F64 폭도색/unit14 explicitly MAP scene unavailable, separate
from this host-state command frontier. Default-silent preparation only.
MAP research reviewed: pattern-type table is coordinate eligibility, not an
animation-selector table. EFFECT resource17 loading uses shared main CTX, so
raw CTX-pointer xrefs across all handlers do not isolate its MAP producer.
Next probe must follow a bounded selected program/caller instead of classifying
global CTX references as effect-program evidence. No product changes or runtime
execution made from this incomplete mapping.

### Local child-effect composition, first bounded implementation (2026-10-15)

Added spawnSequence for explicit F0/F1 children. Choices are only local, nonempty
actor entries already called by F0/F1 in the same source record. Merely being
in the directory is insufficient, since it also carries main programs. Inline
bit7 carriers, common F000 references, unrelated entries and new pointers stay
uneditable. Only the two-byte sequence operand changes; no directory, request,
parent, attributes, allocation or program length changes. Canonical-source
choices survive projected changes and resets in editor inspection.

Connected u16 operand decoding/writing, project change/reparse whitelist, preset
bounds and a compact effect selection control. Existing runtime sequence
resolver supplies the actual child actor. Focused43tests pass, including both
F0/F1 spawning picture9 instead of7, rejecting unused local entry3 and main0,
project/preset repeat/reset. Full JS Node23 run was deliberately stopped after
its sole remaining patch-core-v2 worker was confirmed sleeping; rerun using
bundled Node24 is in progress, not counted as a test pass yet.

Native consumers captured from owned executables in
pixi-spawn-sequence-native-consumers-20261015.json: F06037A68/37C20,
Final0603CD34/3CEEC. F0 explicit branch06037AB6..ACC builds BE16 from
operands9/10 then calls sequence assignment; inline branch stays separate.

Owned source product preview1008/261 offset816 sequence23→8:
both F and Final262frames;50changed scene-geometry frames, first145,
slot32 before288..344 x95..119, after281..337 x96..112. Evidence
pixi-spawn-sequence-owned-preview-20261015.json, silent target21.
Whole exported BIN Blob authenticated reopen passed both, fieldvalue8:
F bb47d392ea45f0ed00ebb9af584a57fb2d7d3b85926249fd71ee69cb30c589e4;
Final33ea194b113d7ae02a69d458b74dd56e962d91561011a5ec00aa23a4588f4874.
Report pixi-spawn-sequence-owned-export-20261015/report.json. No extra full
BIN persisted, gameplay or deployment. This is same-record existing child-effect
composition, not arbitrary keyframe insertion or a complete NLE. UI click
apply/replay/reset still pending before declaring this feature fully verified.
Current exhaustive playerlink1 audits are frozen before this feature; retain
their code hash and do not label them exhaustive tests of this new authoring.

Composition follow-up: bundled Node24 full JS suite2466total,2364pass,
102skip,0fail in26.44sec (pixi-spawn-sequence-node24-all-js-20261015.log).
After all owned source probes finished, module identities uniformly advanced
from playerlink1 to20261015-compose1. Current UI still needs fresh-session QA.

Actual compose1 Final UI: selected1008, motion816. Original sequence23
(display24 · 기본), local choices7,8,9,10,12,16,23,24,25,26,27. Changed
to8 (display9), 적용 retained8 and canonical23 choice still present. Player
ready4.66/8.79sec,autoplay true,console errors empty. Browser close-button
input then failed twice at focus emulation; authoritative observation still
showed player visible, so reset was NOT performed or claimed. Tab34 preserved.
Apply/autoplay confirmed Final; actual reset and F UI remain pending.
Post-revision frontend contract87pass0fail. Standalone repo verifier running
session59015, not yet counted passed. Latest playerlink1 frozen audits remain
live; intermediate F816/5404(732ready48partial36blocked), Final784/6676
(732ready52partial). First F blocked rows are invalid source graphics for
unnamed owner352, not evidence to substitute a different unit's picture.

### Source-derived default pilot selection (2026-10-15)

Wired previously unused getPilotForUnit provider. Disc-observed registration
examples and fixed placements replace universal pilot10/323 and hardcoded
recommendation fallbacks. Explicit casting remains global per side within the
disc session, including across owner/weapon changes. Unknown defaults remain
unselected, not fabricated. Source registration examples are NOT proof of
activation of all CFG paths or current save-game assignments. Corroborated
C1/04 examples take priority over fixed placement defaults, then scenario C7,
then common-root0 C7 examples. Multiple examples use count then stable ID.

C7 consumer F0602B108→0602D5B8 and Final0602EA24→06031370 reads
pilot BE16 and packed level/unit BE16 (level>>9, unit&511). Source proof
pixi-pilot-default-c7-native-proof-20261015.json. Adjacent registration context
is required; isolated opcode-like bytes are ignored. No binary write authority.
C1/04 operand consumer independently captured in
pixi-system-pilot-default-native-20261015.json. Earlier experimental full
scenario walk and header-unit speculation were discarded; no A8 grammar
expansion or header-field change remains in the product.

Owned source probes both games: Z5→Kamille22, Bilbine48→Show126,
Cybaster67→Masaki233; FinalDendrobium14→Kou76. Private final result
pixi-pilot-default-probe-20261015.json (script pins owned image hashes).
Final current browser pilotdefault1: selected weapon18/unit5, auto pilot22
カミーユ; manually selected10Amuro then weapon1008, pilot10 retained. Closed
player, outer1008 selected, temporary QA tab38 closed. No game/emulator.
Full JS before last presentation-only preference cleanup:2469total,2367pass,
102skip,0fail. Final revision+focused frontend/default/display tests98pass0fail.
Revision20261015-pilotdefault1; public localhost8844 serves same worktree.
Cleanup checked the prior full-audit PIDs against exact worker paths. No
matching worker was stopped or restarted by that action; incremental reports
remain retained. No broad goal run was restarted for this user request.

### Compatible terrain recovery for owned aquatic bodies (2026-10-15)

`20261015-terrainchoice1`: unavailable movement poses are no longer a dead-end
instruction to guess another terrain. On that specific failure, the preparation
API resolves both selected bodies against all120 F /144 Final terrain rows using
the same owned movement-vector and picture-descriptor reader as normal playback.
Only joint ready environments are returned; an unknown/malformed table produces
no fabricated recommendation. Explicit map-class constraints are preserved.
The player offers the first matching named terrain with a direct retry button.
It changes only the preview environment, never the editor rows, body sprites or
weapon scripts. Other scene errors retain their original failure.

Private owned-image probe `pixi-terrain-choice-owned-20261015` authenticates both
accepted discs and checks weapons550/551/552/553(unit146),570/571/572(unit152),
each with attack/evade/defense/destroyed. Original terrain5 fails movement;
joint terrain9 is accepted. Each game:24ready /4partial. All4 partial results
are572 Marine Vortex, now revealing the existing FAC4 fragment9 paired-bank cell
bounds error (tile260 at count260, palette127); it was not bypassed. This is56
preparation cases and does not establish exhaustive support, audible playback,
GPU fidelity, or binary-write correctness. No emulator or game execution.

Actual Final browser: weapon550 on terrain5 shows named movement failure and
`바다에서 재생`. At320x740 retry button90px client/scroll90, rect114..206 inside
viewer10..310; direct click reaches ready and4.69/4.78seconds, terrain바다,
accepted-image identity unchanged. F browser execution is recorded below when
verified. Node suite2532total/2430pass/102skip/0fail before the final sparse-array
input guard; focused motion-metadata tests after that guard pass. Repository
verification and Python test phase are tracked separately rather than inferred
from the Node suite.

F actual browser on the same latest page also selected weapon550, changed to
terrain5, observed the retry button, clicked it and reached ready3.13/4.78seconds
on바다 with accepted-image identity unchanged. Final viewport override was reset.
No editor values or output disc were changed in either UI check.

### Explicit standalone visual projection for main97 (2026-10-15)

`20261015-hostvisual1` separates the proved nonvisual host-table operation from
standalone battle rendering. This is not an implementation or verification of
the external table write. The existing F0606F9A4 / Final06076340 static proof
shows conditional host-table byte20/21/22 stores and native6000 continuation,
with no actor, graphics, palette or visual-task call. The called canonical TSR
record getter is read-only; lookup receives mode0. No meaning for unproved host
rows or lookup results is fabricated.

The main interpreter still blocks97 without an explicit deferred-event consumer.
Only owned standalone scene preparation registers that consumer, retains the
source/pc/opcode/main tick, and advances the one-byte command without a wait.
The resulting visual timeline reports `battlefieldStatePresentation:deferred`
with those events; player visibly says `전투 연출만 재생 · 맵 상태 변경 제외`.
Source bytes, editor recipes, exported programs and scenario state are unchanged.
Native/stateful replay and external map-side consequences are NOT complete.
This projection permits a visual-only player to finish the action without
pretending the stateful game command has been executed or is a reserved no-op.

Private owned-image `pixi-host-visual-projection-20261015` checks #168 unit39
against target21 terrain5, dialogue/voice/SFX off. Both accepted games prepare
attack185/evade246/defense185/destroyed251 frames, each retaining one event at
main tick124 (pc193, evade255).8/8 visual preparations ready. This is not GPU
fidelity, combat/map state equivalence or audio verification. No game/emulator.
Main interpreter tests69pass, including absent/rejected consumer refusal,
retained event, no extra wait and no repeated emission across real waits.
Full Node2533total/2431pass/102skip/0fail; Python phase still running separately.
The previous terrainchoice1 npm test completed all59 Python tests in317.113s,
and its repository verifier completed708files with fail-closed release policy.

Actual F hostvisual1 browser selected #168 and opened normal player: ready,
2.27/7.76seconds with dialogue on, explicit deferred note. Switching to evade
also reaches ready8.81/9.80seconds. These browser durations include enabled
speech, unlike the silent preparation counts. Final web check follows below.

Additional static read-only helper proof is private
`pixi-command97-callee-readonly-20261015.json`: lookup F0604E494 length314 /
Final06053FF0 length270 through each RTS delay slot, all stores are stack saves.
Their canonical TSR getters F06004B00 / Final06004CC8 read relative directory
bytes and return a target, with no external stores. This supports excluding the
host mutation from a visual-only projection; it does not determine its actual
external lookup result or claim to perform that mutation.

Final hostvisual1 UI also prepared #168 with dialogue and audio ready,
3.91/8.83seconds. Mobile320x740 destroyed selection prepared and progressed
1.55/10.73seconds. Found that active speech deliberately hides stage notes,
including this limitation, so hostvisual2 adds persistent header status
`연출만 재생` with title `맵 상태 변경은 미리보기에서 제외됩니다.`. Stage note remains
available between speech. Other weapons clear both the metadata and title.
Current latest-header browser verification is recorded separately below.

Owned source-preservation proof (`pixi-host-visual-source-preservation-20261015`):
for both games, successful visual preparation leaves full decoded TSR SHA,
selected D_ANIME program SHA and weaponProject JSON unchanged. Shared original
program SHA is e53697b18146de78c2c2f1bec9245327c7b507f98411c9e2acd5c3f6c994e8ec.
No BIN was exported or saved by this read-only preview check.

Final hostvisual2 actual320x740 browser: header `연출만 재생`, limitation title,
not hidden, client/scroll54/54, right274 within viewport320; playback3.57/8.83s.
Latest header/frontend/main/web-scene focused159pass. Source97 is still not a
stateful game implementation; these checks prove the standalone visual boundary
and unchanged input, not external host-table correctness.

Same Final mobile session switched to beam saber1: header returned to
`재생 준비됨`, empty title, battlefieldState:none, playback4.15/7.22seconds.
Switched back168 and reset viewport before leaving the QA tab available.

### sc02 source XOR/ADD order correction (2026-10-15)

Owned F0603B3D8..3E6 / Final060407D4..7E2 are byte-identical and perform
XOR flip bits before adding the registered tile/palette relocation. The pure
32-bit plane copier previously reversed those operations. Corrected it and
added carry cases: FFFFFFFF plus20400 yields000203FF/C00203FF/800203FF/400203FF
for four flip modes. It is a write, not an assumed no-write sentinel in this
raw plane consumer.15 background/screen-copy tests pass. Private static proof
`pixi-sc02-xor-add-order-20261015.json` pins both executable hashes and bytes.
This does NOT solve paired-bank pixel ownership outside the bank or permit
blanking DrillStorm's invalid tile260. The bank-image renderer keeps that error.
