# WEB PORT (TEST)

User-authorized trial deployment, 2026-10-21. This does not add or accept a new
patch release. Supported runtime: Final Korean v0.3 c only, immutable runtime
704d9f64b5fa48104414. Other fonts, editor-modified outputs, and F runtimes are
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
