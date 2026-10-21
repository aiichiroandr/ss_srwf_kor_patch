# WEB PORT (TEST)

User-authorized trial deployment, 2026-10-21. This does not add or accept a new
patch release. Supported runtime: Final Korean v0.3 c only, immutable runtime
3c1c72226a61ee8d7631. Other fonts, editor-modified outputs, and F runtimes are
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
