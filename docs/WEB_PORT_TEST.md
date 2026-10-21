# WEB PORT (TEST)

User-authorized trial deployment, 2026-10-21. This does not add or accept a new
patch release. Supported runtime: Final Korean v0.3 c only. Desktop retains immutable runtime
3c1c72226a61ee8d7631; optimized mobile uses its separate manifest as described below. Other fonts, editor-modified outputs, and F runtimes are
not claimed compatible. The existing accepted patch manifests remain unchanged.

The button below the editor launcher passes the already selected source Blob
using a random, per-launch BroadcastChannel. There is no ROM upload, IndexedDB
ROM persistence, or response cache. The sender closes the channel after receipt
or two minutes. An exact v0.3 c image is rehashed and used without patching again;
stock input is normalized, hash-checked and patched using the existing engine.
Unsupported edited images fail verification rather than silently losing edits.

GitHub Pages has no configurable COOP/COEP headers. A service worker scoped to
`web-port/` adds these headers without caching. It does not control the patcher
or editor pages. The first player visit may reload once; the sender retains the
Blob until the isolated player receives it. HTTPS/localhost and a browser with
SharedArrayBuffer, service workers, WebAssembly threads and enough memory are
required. Mobile layout support is distinct from successful play on every phone.

The original intermission is the default. The optional modern UI remains a
persistent toggle. Speed defaults to1x and standard CD rate. Touch controls use
pointer capture and release on cancellation/focus loss. Saves are browser-local
and exportable; ROMs are never saved alongside them.

Source snapshot and component notices accompany the WASM under `web-port/runtime/`.
The source archive includes runtime, generated C++ translation units and build
adapters, with Emscripten6.0.13 build instructions. It contains no ROM, BIOS,
extracted binary data, CUE, save, or save state. See its LICENSE and THIRD_PARTY.md.

Known limitations: BGM envelope correction has162 passing runtime tests and
1x/2x song-switch probes; this does not certify all instruments against hardware.
Native fade-shortening research is not included in this public runtime.

## Pre-publication observations

Header-free localhost: original Final BIN patched and booted; exact patched BIN
passed through a non-isolated sender to the isolated player and booted without
repatching. Browser console errors empty. This exercises the actual public
launcher module via a file-input harness; the desktop folder-picker UI itself
was not automated. Root button wiring is reviewed separately. 390x844 and
844x390 iframe viewports checked visually; this is not a physical-phone runtime
performance claim. Runtime stops/restarts and source selection remain explicit.

### Mobile audio transport update — 2026-10-21

Audio now travels directly from the game worker to an AudioWorklet through a
MessageChannel, bypassing the main-thread frame/UI handler. A 44.1 kHz stereo
FIFO starts/restarts after 120 ms has accumulated, caps backlog at 300 ms by
retaining the newest 120 ms, and resamples to the actual output sample rate.
Gain and recording remain downstream of this node. No WASM or ROM change.
The added buffering trades roughly 100 ms more startup headroom for scheduling
stability; it cannot compensate for sustained emulation slower than real time.

Three FIFO regression tests cover starvation/recovery, 48 kHz rate conversion,
and overflow/reset. A muted browser synthetic-worker test with a 400 ms main
thread stall completed with zero underruns/drops. Actual Final coldboot at frame
924 reported 678912 received frames, 116 ms queued, zero underruns/drops. These
are desktop browser transport checks, not physical-phone listening validation.

The FIFO's persistent sample storage is 22,050 stereo Float32 frames = 176,400
bytes, plus scalar bookkeeping and browser-managed message/output buffers.
It belongs to the browser host, not Saturn RAM; this transport is not a candidate
for copying into a physical Saturn patch. Stop/restart creates a new context,
worklet and channel. A same-page temporary-save restart at 2x also delivered
498688 audio frames with zero underruns/drops (frame 1394).

### Frame-copy optimization — 2026-10-21

Refresh the shared Wasm memory view once per synchronous screen copy instead of
once per pixel. The WASM file, game logic, presentation cadence and audio are
unchanged. The prior runtime is retained for immutable older-client URLs.
The source archive contains the original build sources and a deterministic
post-link script reproducing this JS-only optimization.

Sequential Mac-browser 1x trials used identical WASM and fixed input. Baseline
completed 17000 frames; candidate was stopped at15139 at the user's request to
ship promptly. Both had one accumulated audio starvation by their endpoints,
which differ; this is not proof of an underrun fix. Screen-copy cost was reduced
substantially in measured common windows. No physical Galaxy S25 test has been
performed. Frame-rate reduction and the rejected audio-pacing experiment are
not included.

### On-device diagnostics — 2026-10-21

A collapsed, mobile-only performance panel reports simulation progress relative to selected
speed, generated PCM supply relative to44100 samples/s, worklet starvation
count/queue, and synchronous disc-read duration. Worker windows are approximately
two seconds and reset on speed changes. This measures production, not human
listening quality or an isolated CPU bottleneck. Slow progress can include
disc waits; a single window does not establish a root cause.

Copy exports the last30 windows plus browser/runtime/audio-context details.
It includes no ROM bytes, filenames or saves, performs no upload, and requires
the user to paste the report manually. Reports reset for each run. Game timing,
frame cadence, audio sample rate and file-read results remain unchanged.


### Mobile-only disc cache — 2026-10-21

Android, iPhone/iPad and iPadOS desktop-identifying devices default to the
`mobile-disc-cache-v1` host profile. Small desktop windows and touch Windows
laptops keep the standard path. The mobile settings switch can disable the
optimization before starting a new run; it cannot change during play.

Only the mobile profile wraps large BIN WORKERFS reads in a shared LRU cache:
256 KiB per block, at most 64 blocks / 16 MiB across all tracks. CUE and small
files retain ordinary reads. The complete disc is never copied into the cache,
and no ROM bytes are persisted or uploaded. This reduces repeated synchronous
Blob operations during sequential CD reads without changing emulated CD speed,
read bytes, game timing, frame cadence, or the existing 44.1 kHz audio FIFO.
The original WORKERFS read can also allocate a transient block-sized buffer;
16 MiB describes retained cache bytes, not total browser memory.

Mobile creates the recording audio branch on the first recording request,
rather than at game start. Desktop audio setup and uncached disc reads retain
their prior behavior. Diagnostic probes/read wrappers run only on mobile;
the report includes actual backing-read counts and bounded cache occupancy.
The player and worker URLs carry `mobile=1` to distinguish the frontend release;
the immutable WASM runtime and its source archive are unchanged.

Validation covers byte-exact sequential/random/block-boundary/EOF reads,
shared eviction and the memory ceiling, incomplete-read fallback, mobile vs
PC classification and disabling the optimization. These checks do not establish
that Galaxy S25 battle playback is smooth; no physical S25 result is claimed.


### Mobile speed guard and core v2 — 2026-10-21

The `mobile-core-v2` profile uses immutable runtime `0129dbf47402596f6a53`.
The `MOBILE · 2` label supersedes mobile v1. Only
optimized mobile Final sessions load `runtime/current-mobile.json`; desktop
and mobile with optimization disabled keep `runtime/current.json` and its
byte-identical JS/WASM. A missing or invalid mobile manifest falls back to the
existing runtime before boot. The source link follows the runtime actually
selected. Frontend module and worker URLs use `mobile=2`.

The mobile core removes repeated VDP1 framebuffer address/format decoding via
a read-only row view and specializes VDP2 composition when zero or one normal
background layer is active. With two or more active layers it retains the
original fixed layer traversal. Unsupported row formats retain the original
per-pixel path. Resolution, presentation cadence, game/audio clocks, sound
mixing and 44.1 kHz audio output are unchanged. Mobile v1 disc caching and
lazy recording setup remain enabled.

For requested 2x, after a four-second grace period and two consecutive settled
measurement windows, low progress plus low PCM production and new starvation
(or less than 40 ms queued audio) switch to 1x. Hidden pages, suspended audio,
stale reports and discontinuities do not trigger a decision. The switch and
status text update visibly and diagnostics record the transition. It does not
switch back to 2x automatically; a deliberate user toggle rearms the guard.
This reduces sustained starvation when the requested speed exceeds actual
throughput; it cannot guarantee every demanding scene reaches 1x.

Validation: 170 native runtime tests passed. All existing VDP2 fixture calls
compare complete frames to the deployed compositor, with 96 additional
layer-mask/priority/gradation combinations. Bounded native synthetic composition
benchmarks found lower CPU time in all five tested layer counts; these are not
Galaxy or browser performance measurements. Browser module tests cover mobile
selection/fallback and the speed guard, including the user's reported low PCM
production despite zero disc-read time. No physical S25 post-change playback or
listening result is claimed. The user can disable mobile optimization for an
immediate return to the desktop runtime on the next launch.


### Mobile voice continuity v3 — 2026-10-21

The `MOBILE · 3` frontend / `mobile-audio-v3` profile retains the mobile v2
WASM, disc cache and speed guard. Desktop still uses the exact existing
`audio-worklet.mjs`, `audio-ring.mjs` and desktop runtime. Only optimized mobile
loads the new `mobile-audio-worklet.mjs` and `MobileAudioRing`.

The user's S25 v2 report confirms normal 1x and several steady 2x windows,
with remaining intermittent starvation. It does not contain dropped-PCM
counters, so that report cannot establish whether skipped syllables were
starvation, overflow trimming or both. The existing FIFO trims a queue above
300 ms down to 120 ms, discarding at least about 180 ms of actual queued PCM.
This mobile update removes that aggressive trim and preserves every sample
unless the existing hard 500 ms capacity is exceeded; real overflow discards
only the minimum required oldest frames. It retains source pitch, stereo order
and sample-rate conversion.

Mobile startup/recovery buffering is 240 ms instead of 120 ms to tolerate short
producer stalls. This adds about 120 ms of initial audio delay, and queued
sound can approach 500 ms behind the picture during bursts. The UI describes
this tradeoff. It does not fix sustained slow emulation or eliminate synchronous
disc-read pauses. Disabling mobile optimization restores the original transport
on the next launch.

Diagnostic rows now include cumulative dropped source frames (`drops`). The
mobile worklet also captures starvation/overflow events with their audio-frame
position and queue before/after. Notifications are limited to two per second;
repeated events of one type are coalesced with an occurrence count and summed
dropped frames. At most 16 events are retained by the player. Ordinary queue snapshots still arrive about every 371.5 ms at
44.1 kHz and must not be treated as the queue at the instant of a past underrun.
No telemetry is uploaded. No ROM, save data or filenames enter these counters.

Focused tests cover source-sample order in a 320 ms burst, the 500 ms hard bound,
minimum overflow removal, ring wrap, 44.1/48 kHz playback, startup/recovery and
short producer stalls. This is a transport change, not a claim that the user's
actual first-voice or battle-scene stutter has been fully eliminated. No physical
S25 v3 listening result is available at publication.

### Mobile onset and lifecycle v4 — 2026-10-21

`MOBILE · 4` / `mobile-disc-v4` adds optional session-only disc preparation.
On mobile devices reporting at least 8 GiB via deviceMemory it defaults on;
other mobile devices may enable it explicitly. Before emulation, BIN files
are copied in 8 MiB chunks into memory, bounded to 640 MiB total. Runtime
random reads then copy directly from those bytes instead of synchronously
reading cold Blob slices. This removes that specific first-seek stall, not
all core or browser scheduling costs. Startup takes longer and uses up to
one additional disc-sized allocation. Catchable preparation failures and
over-budget discs retain the existing 16 MiB cache. A browser process killed
by memory pressure cannot be recovered by JavaScript. Nothing is persisted
or uploaded. The option can be disabled before starting the next session.

Mobile visibility changes freeze the producer at a frame boundary and suspend
the AudioContext, preserving queued PCM. On return, audio resumes before the
producer is released. If the browser requires a gesture, a resume button is
shown and the game stays paused. Stop/dispose clears the gate. The optimized
mobile runtime `a5db802b820c047ee955` keeps exactly the v2 WASM and adds a
reproducible JS clock adjustment excluding the gate's waiting time; this avoids
short-pause catch-up. Non-optimized desktop-runtime fallback retains its original
native clock behavior. Performance windows reset at a resumed boundary.

Desktop runtime, audio ring and worklet are unchanged; desktop has no pause
gate or disc preparation. Focused tests cover exact random disc bytes, fallback,
visibility races, failed resume, and short/long pause clock continuity. These
checks do not establish physical S25 listening quality or complete elimination
of foreground onset stutter. A new phone report should show `frontend: mobile-4`
and `discMode: memory` when preparation is active.

### Mobile timing and response v5 — 2026-10-21

`MOBILE · 5` / `mobile-timing-v5` retains disc preloading and lifecycle pause.
The user's v4 visible-window report showed near-zero disc-read time but remaining
starvation at roughly 52 simulated FPS, with normal queue depths of 300–370 ms.
This establishes remaining supply shortfalls and appreciable queued latency,
not the exact native function causing each stall.

Mobile startup/recovery is reduced from 240 to 100 ms. The mobile worklet writes
source-frame queue depth and a heartbeat into shared memory every render quantum;
the native host reads this directly via its mobile timing adapter, without the
main thread or the 371 ms diagnostic message interval. Host deadlines gradually
rebase by at most 2 ms per frame toward a 110 ms queue, with a 15 ms deadband.
Excess queue is drained through pacing, not by deleting speech or resampling.
A missing/stale heartbeat disables feedback. Device/output latency is additional;
100 ms is not a guaranteed button-to-sound latency.

When queue depth falls below 65 ms, the host temporarily composes every other
otherwise-presented frame (about 30 presentations/s at either game speed).
At 110 ms it restores normal composition. This deliberately trades temporary
visual smoothness for audio production headroom. CPU/game/input and sound-chip
execution continue; sound channels, DSP, pitch and simulation clocks are not
skipped. Screenshot/movie requests still force composition. Mobile PCM packet
size is reduced from 1024 to 256 source frames (~23.2 to ~5.8 ms), reducing the
batching delay before the worklet receives sound. The hard queue bound remains
500 ms; it is not increased.

Desktop runtime and audio modules are unchanged. Mobile optimization OFF retains
the desktop runtime/transport. Focused tests cover queue feedback, stale-state
handling, composition hysteresis, intact PCM, source-rate conversion and a
bounded synthetic workload; that workload is not a physical-phone benchmark.
No claim of complete S25 stutter elimination or physical-device latency
measurement is made at publication.

Immutable mobile runtime: `dfc11254e0a8f556f1bc`. A bounded Mac browser check
confirmed WASM initialization, the timing adapter and live AudioWorklet shared
queue feedback. This is not Android performance or listening validation.

### Mobile response v6 — 2026-10-21

`MOBILE · 6` / `mobile-latency-v6` retains the exact v5 runtime and 256-frame
PCM packets. The user's v5 report showed no new starvation across its displayed
windows, but typical queues remained 110–160 ms. Mobile startup/recovery now
requires 60 ms instead of 100 ms; host pacing targets 60 ms instead of 110 ms,
with a tighter 5 ms deadband. Composition relief starts below 50 ms and ends
at 65 ms: it intervenes after only a 10 ms deficit from the target, rather
than the previous 45 ms deficit. This can reduce presentation smoothness more
often under load. It does not skip game/input/sound-chip execution.

Queued PCM is not trimmed to achieve the new target. Existing pacing drains
excess naturally, and source rate/pitch are unchanged. The 500 ms hard capacity
is unchanged. Desktop runtime, audio ring/worklet and defaults are unchanged.
The 60 ms value is a queue goal, not measured input-to-ear latency; packet,
game and output-device delays remain additional. Focused tests cover the lower
startup threshold, recovery, preserved sample order, pacing convergence and
composition hysteresis. Physical S25 post-change latency is not yet measured.

### Mobile queue pacing and diagnosis v7 — 2026-10-21

`MOBILE · 7` / `mobile-paced-v7` keeps the 60 ms queue/startup goal, 256-frame
packets, disc preloading and existing composition relief. It replaces accumulated
host-clock phase corrections with a current-depth wait: below/equal to 60 ms,
request no sleep; above that, wait only for the excess, capped at 20 ms per
frame. No prior future deadline is carried into the next valid-feedback frame.
A stale/missing heartbeat retains native wall-clock pacing. Legacy cached
native glue sees a zero phase correction, so it cannot accumulate new windup.

Static analysis found that the previous integrated base-clock correction could
retain a future deadline after a queue deficit. This is a control flaw, not
proof that it explains every S25 underrun. Focused tests cover high-to-low queue
transitions, convergence with explicit emulation/work/sleep durations, and
absence of inherited waits. The queue is now also published immediately upon
packet receipt, instead of only after the next AudioWorklet render quantum.

Diagnostics separate requested sleep, actual elapsed sleep, maximum oversleep,
and time outside the preceding sleep (`nonSleepMs`, not pure CPU time; it also
includes scheduling). Pace sums cover frames with active queue feedback.
Transport records include sent-but-not-acknowledged source frames, packet count,
and sum/max delivery time from worker send to worklet receipt. Delivery time
uses Date.now with millisecond resolution and clamps clock anomalies; it is not
physical input/output latency. Shared counter snapshots can straddle a receipt
and are approximate window diagnostics. They contain no game bytes and are
never uploaded. PCM is not trimmed or time-stretched. Desktop artifacts and
execution selection are unchanged. Physical S25 validation remains pending.

Runtime `aa21406c80f5516d83db` passed bounded Mac browser initialization and
AudioWorklet receipt/feedback checks. This is not physical S25 latency validation.

### Mobile v8 regression containment

The user reported worse stutter with v7 before the CRT UI was deployed.
Mobile selection is restored to runtime dfc11254e0a8f556f1bc and the v6
bounded host-clock correction. The 60 ms startup target, PCM preservation,
256-frame packets and desktop path are unchanged. The v7 transport diagnostics
remain available. This rolls back the reported regression; it does not claim
to resolve pre-existing v6 underruns or establish the precise S25 cause.
The two runtime source archives differ only in BUILD.md and host_web.cpp.

## Mobile v9: function dispatch cache

The user's mobile-paced-v7 report shows near-zero disc read time, normally 1–2 ms audio transport, and sustained non-sleep processing above the 16.7 ms frame budget. A 106-call window spent 1918 ms outside sleep (~18.1 ms/call). This is elapsed time, not isolated CPU execution.

A local native sample with identical dispatch source found `sh2_lookup` at 520/3417 main-thread top-of-stack samples (~15.2%). The mobile-only runtime now caches successful address-to-function lookups in 4096 tagged entries. Every overlay activation and active-slot restoration clears the cache. Full-address checks preserve collisions; cache-through aliases normalize exactly as before; misses retain the original behavior. Desktop runtime artifacts are unchanged.

No PCM, sound-chip clock, sample rate, channel count, buffer target, or packet size changed. The prior v6 timing controller remains in use, with a 60 ms mobile target and 256-frame packets.

Validation: 172 runtime tests pass, including new overlay/restore, alias, collision and slot-precedence cases. The first run hit the pre-existing 4 ms wall-clock CD test under build contention; the repeat passed. A native 18,000-frame first-battle replay produces byte-identical 53,073,808-byte WAV and four PNG checkpoints. A synthetic Node/WebAssembly repeated-lookup benchmark reduced this lookup workload by ~91%; this is not a whole-game or Galaxy performance claim. Physical S25 validation remains user-side.

### Mobile recovery v10 (2026-10-21)

The v9 S25 report still records starvation (80 to 98 over the displayed
roughly one-minute window) despite mostly 59–60 guest fps and negligible disc
reads. This does not establish that dispatch optimization resolved audio.
Mobile v10 retains the v9 WASM, original PCM, 60 ms startup/recovery target and
500 ms hard capacity. Below 30 ms queued audio it temporarily composes one in
three guest frames (one in six at 2x), returning to the existing display policy
after recovery. Below 40 ms it advances the host deadline by up to 8 ms instead
of 2 ms, without changing guest or sound-chip clocks. Desktop paths are unchanged.
A deterministic FIFO/host-deadline model with sustained 24 ms composition /
11 ms uncomposed work produced 16 underflows with v9 and zero with v10; this is
a synthetic scheduling regression test, not a Galaxy measurement. Actual S25
audio and visual smoothness remain to be confirmed. Diagnostics identify
`mobile-recovery-v10` and count critical composition skips and recovery corrections.
