# Local battle sound envelope reference

`assets/editor-battle-tone-envelope-times.mjs` uses the nominal attack and
decay duration data published in the MAME SCSP implementation by ElSemi and
R. Belmont, with contributions from kingshriek:
<https://github.com/mamedev/mame/blob/master/src/devices/sound/scsp.cpp>.
That implementation is published under BSD-3-Clause. The duration data and
effective-rate calculation are analysis references, not evidence of a fresh
hardware measurement on F or F Final. No emulator is executed by this work.

Register fields and envelope state transitions are described in Sega's
SCSP manual, sections 4.1 and 4.2.2:
<https://www.infochunk.com/saturn/segahtml_en/hard/scsp/hon/p04_22.htm>.

The local note plan currently retains the parsed envelope registers,
pitch-dependent effective indices, nominal durations and quantized sample
increments. `reference` timing status does not establish full synthesis,
native audio fidelity or connection to the public player. Loop-linked
transitions, release tails, LFO, DSP routing and dynamic channel controls
require their own implementation and verification.

### Software pitch modulation clock (2026-10-15)

The shared F/Final driver reloads timer A with `0x004E` at `0x3ADC`
(initialization) and `0x112E` (poll service). It tests pending bit 6 at
`0x1124..112A`, clears that pending bit at `0x1134`, and calls the active
voice pitch update at `0x1142`. The curve routine `0x1540..15E4` consumes
four driver units on each invocation. Its signed word/long operations,
delay, ramp turn counter and boundary interpolation are modeled in
`editor-battle-software-pitch-lfo.mjs`.

The [official timer description](https://www.infochunk.com/saturn/segahtml_en/hard/scsp/hon/p04_2b.htm)
defines the nominal interval as `(255 - TIMA) * 2^TACTL / 44100` seconds.
For this reload that is 177 source samples (about 4.014 ms), not an exact
four milliseconds. The frame helper retains sub-update remainder across
web audio blocks. This is a reference clock: the original driver polls
the pending bit, so main-loop service latency and missed/coalesced timer
requests are not established by static analysis. No emulator was run.
The helper is not yet connected to the product BGM transport, and CC1
activation semantics remain unresolved.

Browser integration check: on 2026-10-15 the private local audio QA page was
operated with owned F v0.5-a and Final v0.3-c discs. Both passed the added
software-pitch normal-start and 10 ms seek cases. Maximum Float32 output
error against the independently scheduled block-render reference was
`2.529246090343662e-8` (normal) and `2.5871426667656294e-8` (seek).
The exercise used actual disc PCM with an explicit synthetic modulation row
and bend command; it does not establish the on-disc MIDI modulation mapping
or native full-song fidelity. It exposed and corrected rejection of finite
fractional-microsecond pitch timestamps in the transport. No game executed.

### CC1 active-note modulation (2026-10-15)

The shared driver CC dispatch table at `0x2B5C` maps controller 1 to
`0x2CC6`. `0x2CC6..2D12` scans existing active voices matching both channel
and sequence group. If tone byte 14 is zero it skips the write. Otherwise
it writes tone byte 21 to slot LFO low-byte register 19; values below 64
mask that byte with `0x18`, preserving amplitude waveform while clearing
pitch/amplitude depths. Values 64..127 restore the original byte. Pitch
wave/frequency in the high register byte and oscillator phase are unchanged.
This is a threshold, not proportional depth. It does not initialize the
software curve at `0x3718`, mutate the tone table or remember a future-note
flag. `resolveBattleModulatedToneLfo` preserves caller phase context.
Dynamic event scheduling into the AudioWorklet remains to be connected;
this decoder alone does not establish complete BGM playback.

CC1 scheduling is now connected through PCM preparation, transport,
AudioWorklet generation and per-note loop expansion. The 2026-10-15
browser QA with owned F/Final PCM passed synthetic source-decoded CC1
on/off cases and a 10 ms seek into an enabled interval; maximum errors
were `1.6412498582418777e-8` and `2.2207197802881495e-8` respectively.
The composed bank0 QA explicitly supplies retained oscillator phase zero
as a reference test input; this is not a claim of native phase discovery.
The all-65-bank F preparation probe without invented phase now prepares
137225 of 139127 notes: 1705 have unresolved LFO phase, 137 unresolved
infinite-release lifetime and 60 differing reverse-loop endpoints. Only
21 banks contain no rejected notes under these conditions. Earlier 59-bank
counts predate CC1 scheduling and are not current completeness evidence.
Control events in the decoded sequence use type `control`; tests and the
compiler use that actual parser contract. The product battle UI still has
no BGM/SE selection and playback connection.

### SE file-bank binding (2026-10-15)

F `06018A5C..06018AC0` and Final `06018F30..06018F9A` choose
area-map entry indices 1/5 for a nonzero SE directory bank, or 2/3 for
bank zero. The first transfer length is directory sequence-start minus
tone-start; the second is end minus sequence-start. F transfer helper
`06006074..060060DE` reads destination address from the selected eight-byte
area-map entry, then marks that entry transferred. With map0 these resolve
to tone1/sequence2 (nonzero) and tone2/sequence0 (zero). The battle
sequence-start representation uses doubled sequence-bank identity.
`resolveBattleSeBindings` now expresses this distinction and bounds both
transfers against the explicit selected map.

Owned-disc all-bank check: map0 binds 255/256 F and 254/256 Final directory
banks. F/Final bank26 and Final bank92 exceed map0 capacity and require
investigating map selection rather than enlarging the map arbitrarily.
This checks source transfer bounds; it does not prove scene-selected file
bank, sound playback, or all-song correctness.

SE voice-reference check: supplying the actual bank0 common tone package
alongside each nonzero weapon tone package resolves 607/608 F and 592/593
Final sequences from the capacity-compatible banks. The optional common
binding is validated as SE directory bank0 and copied into the explicit
bank map; it does not alias an absent bank to an arbitrary instrument.
Both remaining voice-plan exceptions are bank38 song0: channel0 receives
pitch-bend commands at ticks18/39 without a resolved tone bank, while three
notes on other channels were decoded. Handling an unused channel's bend
requires checking native initialization rather than dropping that exception.
The capacity-excluded banks are not included in these sequence counts.
This still establishes voice references, not PCM mixer/envelope support or
battle cue playback. Original loader residency/lifecycle must accompany
scene-level selection when this is connected to the product.

SE direct PCM preparation without a substituted DSP effect or oscillator
phase prepares 230 F and 218 Final sequences from the compatible packages.
F has 2086 prepared notes and unresolved reasons: retained LFO phase276,
DSP route348, differing reverse endpoints11, missing bend context2. Final
has 1852 prepared notes: phase260, DSP372, reverse endpoints20, bend2.
The counts do not include capacity-excluded directory banks.
`prepareBattleEffectSoundCues` resolves explicit scene-global sequence-start
requests to these per-song PCM plans and retains stop control identities.
Repeated requests share a prepared source plan; missing bank/song or partial
PCM remains unresolved. Native stop/replacement lifetime and actual battle
UI playback are still separate pending requirements.

### Sequence stop and replacement (2026-10-15)

Shared driver command2 dispatch `0x1BA2` enters `0x1CD6`. It accepts control
numbers0..7 and dispatches stop for active sequence states through
`0x46D2/0x4710` to `0x4D52`. `0x4D52` calls `0x4FFC` with d7=1:
the loop removes matching pending gate records and sends note-off via
`0x50E8`; it does not immediately delete sample data or bypass release.
Start initialization `0x4BA2` also calls that note-off loop before replacing
sequence state.

Cue preparation now bounds nonloop note gates at the next matching control
stop/replacement, drops future note starts and recompiles reference envelopes
so finite release tails extend beyond that interruption. It preserves scene
request timestamps separately from sequence-relative times. Same-time
replacement can suppress the superseded start. Loop expansion on interruption
remains explicitly unresolved and actual battle playback is not connected yet.

Bounded loop note-off is now implemented in voice planning via explicit
`stopAtUs`. It expands the decoded loop event body and reprocesses commands
through the same channel state, rather than cloning first-cycle note values.
This preserves late controller changes into the next cycle. Tempo conversion
uses the original rational loop span. Stops remove later starts, shorten
current gates, and PCM preparation recompiles release envelopes. Repeated
work is bounded to100000 events and stop times at most1000 seconds.
Cue preparation uses this for a matching stop/replacement; loops without an
explicit interruption remain unresolved until continuous cue playback is
connected. Tests distinguish controller carry-over from resetting each loop.

`editor-battle-effect-sound-transport.mjs` now assembles prepared cue notes
onto scene-global time, shifting their gain/pitch/pan/LFO automation exactly
once and retaining shared source PCM. Reference release tails may extend the
audio plan beyond the scene boundary. It wraps the existing PCM transport for
play/pause/pump/seek/speed and battle-frame synchronization. Any unresolved
cue prevents creating a playable transport. Unit checks cover offsets, tail
bounds and refusal to discard unresolved inputs. Browser cue playback and the
product worker/UI connection are still pending; this module alone is not a
claim that the local weapon player now produces effects.

F SE file selection is dispatched through the auxiliary task table at
`060B26CC`, entry16 (`060189F8`). It reads command byte1 through the current
program pointer, tests its upper nibble against F0, and either sends that
literal byte to `0600626C` or uses its low nibble to read a two-byte-stride
subject row's bank byte at `060CAC01`. `resolveBattleSeFileBank` requires an
explicit subject-bank map for that dynamic case. Deriving those runtime rows
from the browser battle context and integrating the auxiliary loader timeline
are pending; weapon record number alone is not a file-bank mapping.

The selector table is mutable general battle work data, not a static
weapon-to-SE table: for example F `060730C8..06073110` writes explicitly
selected word slots, and `06035ED0..06035EE0` decrements a selected slot.
The sound loader reads the low byte of its selected word. A bounded
`readBattleSeSubjectBanks` snapshot helper preserves this behavior from
sixteen explicit web work words. Runtime snapshots need to be refreshed at
load events; associating a fixed bank with a weapon record would be unjustified.

Correction after transfer-helper review: map sizes are not enforced by the
owned loader `06006074..060060DE`; its copy call receives requested r7 length
without a capacity comparison. Treating those sizes as mandatory web package
limits imported a hardware layout restriction incorrectly. Web tone/sequence
buffers are independent, so bindings now retain overruns as `transferWarnings`
while preserving bounded source buffers and map identities. F/Final bank26's
sequence is1886 bytes against1792 mapped bytes; Final bank92's is1798 against
1792. No sound RAM is copied or emulated by this change.
The new all-bank result binds all256 banks each: F609 sequences/608 voice
plans ready/230 direct PCM ready; Final598/597/219. Phase/DSP/loop and bank38
bend exceptions still apply. Earlier capacity-excluded counts above are
historical and superseded; these counts still do not prove battle cue playback.

Private browser integration on2026-10-15 operated the local disc chooser
for F v0.5-a and Final v0.3-c, read SE.BIN and executable area-map metadata
inside the browser, and resolved common bank0/song0 into an explicit test
cue scene. Both normal start and10ms timeline seek passed: zero output
before the50ms cue and nonzero audio for both50ms/350ms requests; peak
0.32523131370544434 and5588 nonzero stereo samples per request. Offline
Web Audio output includes the source PCM, envelope and scene transport.
This is not an audible/live-device test or a weapon-specific cue mapping
proof. Since this source sound is short, these nonzero counts alone do not
prove the exact stop/release boundary; that needs a sustained-source test.

Sustained-source browser check supersedes the short-song stop limitation:
owned F/Final common bank0/song7 has a source note at15ms held until3855ms
before its natural release. Explicit scene cues start at50/350ms and stop
at250/550ms, so this tests early note-off rather than natural sound completion.
Both discs passed seeks at0,10,260 and400ms. Normal output peak was
0.6281246542930603; the250..260ms release region remained nonzero (peak
0.09796469658613205), while280..350ms and all samples after580ms were zero.
Seeking to260ms produced no first-request samples; seeking to400ms resumed
inside the second request. This proves the web reference envelope/PCM/scene
transport combination for this owned sustained sound and synthetic cues.
It still does not prove a specific weapon's cue/bank selection or native
waveform fidelity, and no game/emulator ran.

Product integration begun: `BATTLE_WEB_ACTION` now optionally prepares common
SE bank0 cues from the authenticated session and exports readiness/unresolved
metadata; original-session asset caching remains in use for projected weapons.
The player adds an effect checkbox and shares its owned speech AudioContext
with scene effect transport. Pause/seek/loop synchronization and cancellation
are connected. Voice mute and effect mute are independent. A partial cue set
is not silently played as complete.
Focused speech/audio/frontend checks passed127 cases. The actual editor was
opened through the private local directory-chooser adapter with F v0.5-a;
Gundam/Beam Saber player and effect checkbox on/off were directly clicked,
returned to ready state with no browser error. This selected scene reported
no exported effect cues, so that interaction proves UI/lifecycle behavior,
not a weapon producing sound. Event capture diagnostics were added for the
next check. F/Final weapon-specific effect playback remains unverified.

Product follow-up: the app's readScene adapter initially omitted effect fields
from the worker response. It now forwards effectSoundPrepared/status/reason/
trace explicitly. Focused worker/speech/cue tests passed66 cases. With F
v0.5-a, Gundam Beam Saber and Beam Rifle were directly selected after reload;
both reached ready state with observedEvents=0 and capturedEvents=0 and no
browser errors. Therefore the remaining silence is upstream of capture in
these selected scene clocks, rather than merely a dropped response field.
Their scene-entry/common setup and native sound trigger path still need to
be connected. The UI must not label these weapons as sound-complete.

Latest asset revision is20261015-effects3. All existing versioned module,
stylesheet and page references plus the frontend revision contract were
updated together; the frontend checks passed87 cases. On a fresh F editor
load, Beam Saber now reports5 observed/captured sound events and4 FD starts.
The earlier zero-event diagnosis was invalidated by the refreshed asset
results and must not be used as evidence that the selected source path lacks
sounds. Source static inspection also found FD commands in Beam Saber,
Beam Rifle and Vulcan in both games (private per-record reports retained).

Binding identity correction: actor FD mode1 is converted to sequence identity2
by its source handler; that is already the area map's sequence id2. The SE
binding must expose the map id directly, not multiply it again to4. The binding
and tests now use2. This supersedes earlier wording about doubled map identity.
Common id0 remains unchanged. Actual weapon file-bank selection, non-FD scene
effect sound mapping and final UI playback remain pending.

FABA sound-label correction: F FA table060B2C44 entryBA points to06033504
(Final table060B9218 entryBA ->06038790). F06033504..06033618 chooses preset
ids1/3 or34/35 and calls0603C624. That helper queues screen-effect state at
060C9F50;0603D9A2 consumes its byte0 through visual dispatch table060B3458.
These ids are visual presets, not SE sequence requests. The actor model now
stores `sceneEffect.presetId` and emits no sound event for FABA, preserving
all its visual fields. Actor/scene regression checks passed142 cases.

Observed candidate mapping requiring a native consumer proof: D_ANIME header
word44 is3 for Beam Saber (both games),20 for F Beam Rifle/19 for Final,
and17 for Vulcan. Those SE packages have2/1/2 songs respectively and all
mode1 FD song references in the three programs fit those candidate package
counts. This is a correlation and is not yet used to choose product audio.
The exact loader/work-table assignment must establish the meaning first.

Loop preparation correction: alternating mode3 has a continuous forward/
reverse path retaining both LSA and LEA values, so unequal endpoints are no
longer rejected by the forward-loop PCM converter. The source path is
LSA..LEA thenLEA-1..LSA+1; no fabricated endpoint is used. Reverse-only
mode2 still rejects unequal endpoints because its wrap discontinuity cannot
be reproduced by the existing ordinary forward-loop interpolation. A dedicated
coordinate sampler is needed for that case. Ten loop/PCM regressions passed.
Primary loop reference: https://www.infochunk.com/saturn/segahtml_en/hard/scsp/hon/p04_21.htm

All65 F BGM packages after the alternating-loop change prepare137285 notes,
22 complete source plans; the60 previously rejected differing-endpoint notes
are all recovered. Remaining notes are1705 unresolved LFO phase and137
unresolved infinite-release lifetime. Native waveform fidelity is still not
established by this source preparation count.

Header44 investigation checkpoint, following the reverse-engineering guide:
- Hypothesis: D_ANIME footer word44 selects the weapon SE directory bank.
- Observation: the three weapon candidates match their mode1 FD song counts in both games.
- Counter-evidence/limit: no pointer flow from that footer to the SE loader is proved; matching counts alone are insufficient.
- Next minimal probe: identify the cached animation-header copy and follow its advancing source cursor, instead of repeating direct add44 searches.

All-package loop follow-up: F and Final BGM now have identical preparation
counts22/65 complete plans and137285/139127 notes;1705 phase and137 release
lifetime cases remain unresolved. SE direct preparation is now F236/609
sequences and2097 notes, Final225/598 and1878 notes; differing-endpoint
rejections are gone from these owned packages.
The private browser chooser QA directly tested BGM bank61 voice3/layer0's
unequal-endpoint alternating PCM from each disc, seeking1second into its
converted loop and rendering2048 frames. Both passed with output peak
0.2762135863304138 and max error6.011988851195582e-9 against the source-index
reference. This establishes the web loop conversion/playback boundary for
that waveform, not native full-song fidelity or a completed battle BGM UI.

Effect preparation cancellation now accepts an AbortSignal, checks before
compiling and again after asynchronous worklet registration, and attaches no
transport for a cancelled scene. Player weapon change/close invalidates and
aborts pending effect preparation; effect off also cancels that preparation,
so toggling it back on cannot revive the old pending request. New scene reset
clears stale diagnostic errors. Focused effect/speech checks passed41 cases.
The cancellation test currently covers already-aborted preparation; the
post-registration cancellation race still needs a dedicated integration case.

Post-registration cancellation unit case now passed: worklet registration was
held pending, scene cancellation issued, registration then completed. The
preparation rejected with AbortError and constructed zero AudioWorklet nodes.
This closes the dedicated deferred-registration unit coverage gap noted above;
it does not substitute for an actual rapid weapon-switch browser integration
case once a fully mapped effect scene is available.
