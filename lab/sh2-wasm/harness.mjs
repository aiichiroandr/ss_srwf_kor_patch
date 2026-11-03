// A small stand-in for the saturn-recomp runtime, in JavaScript, so the
// translator's calling convention can be exercised without the real runtime
// or any game: one CPU context and the two work RAMs in a shared
// WebAssembly.Memory, dispatch that translates a function the first time it
// is called (with the functions it reaches by bsr, as one module), a poll
// that behaves like an interrupt (saves the context, scrambles it, restores
// it), and I/O and trap callbacks supplied by the caller.
//
// The real runtime would call the translator from sh2_call_unknown and
// sh2_program_start instead; see docs/WEB_PORT_CLIENT_RECOMP.md.

import { discover, SENTINEL, WRAM_SIZE, hex } from "./sh2.mjs";
import { translate, exportName, CTX } from "./emit.mjs";

const CTX_PTR = 256;
const WRAM_L = 0x10000;
const WRAM_H = WRAM_L + WRAM_SIZE;
const PAGES = Math.ceil((WRAM_H + WRAM_SIZE) / 65536);
const FIELDS = ["t", "s", "q", "m", "imask", "gbr", "vbr", "mach", "macl", "pr", "pc"];

export function createHarness({
  ioRead = () => 0, ioWrite = () => {}, trapa = () => {}, budget = 1000, batch = 64, limit = 4096,
} = {}) {
  const memory = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES });
  const words = new Uint32Array(memory.buffer);
  const ctx = (field) => (CTX_PTR + CTX[field]) >> 2;
  const view = {
    wramH: new Uint8Array(memory.buffer, WRAM_H, WRAM_SIZE),
    wramL: new Uint8Array(memory.buffer, WRAM_L, WRAM_SIZE),
    r: new Uint32Array(memory.buffer, CTX_PTR, 16),
  };
  const fns = new Map();
  const stats = { functions: 0, modules: 0, bytes: 0, calls: 0, polls: 0 };

  function ensure(entry) {
    const known = fns.get(entry);
    if (known) return known;
    const queue = [entry], functions = [], seen = new Set();
    while (queue.length && functions.length < batch) {
      const e = queue.shift() >>> 0;
      if (seen.has(e) || fns.has(e)) continue;
      seen.add(e);
      const code = discover(view, e, limit);
      functions.push({ entry: e, code });
      for (const ins of code.values()) if (ins.kind === "bsr" && !ins.slot) queue.push(ins.target);
    }
    const bytes = translate(functions, { h: WRAM_H, l: WRAM_L });
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: imports });
    for (const fn of functions) fns.set(fn.entry, instance.exports[exportName(fn.entry)]);
    stats.functions += functions.length; stats.modules += 1; stats.bytes += bytes.length;
    return fns.get(entry);
  }

  const imports = {
    memory,
    sh2_call(ptr, addr) { stats.calls++; ensure(addr >>> 0)(ptr); },
    sh2_poll(ptr) {
      // An interrupt: the handler saves what it uses, runs, and restores it.
      stats.polls++;
      const base = ptr >> 2, saved = words.slice(base, base + 26);
      for (let i = 0; i < 26; i++) words[base + i] = 0xdeadbeef ^ i;
      words.set(saved, base);
      words[ctx("budget")] = budget;
    },
    io_read: (a, size) => ioRead(a >>> 0, size) | 0,
    io_write: (a, v, size) => ioWrite(a >>> 0, v >>> 0, size),
    sh2_trapa: (ptr, imm, pc) => trapa(view, imm, pc >>> 0),
  };

  return {
    view, stats,
    // Load the context, run from `entry` until control returns to SENTINEL,
    // and return the context. A non-local return unwinds to here and resumes.
    run(entry, init = {}, maxResumes = 1000) {
      view.r.set(init.r ?? new Uint32Array(16));
      for (const f of FIELDS) words[ctx(f)] = init[f] ?? 0;
      words[ctx("pr")] = SENTINEL;
      words[ctx("budget")] = budget;
      let pc = entry >>> 0;
      for (let i = 0; i < maxResumes; i++) {
        ensure(pc)(CTX_PTR);
        pc = words[ctx("pc")];
        if (pc === SENTINEL) return this.state();
      }
      throw Error(`no return to the sentinel after ${maxResumes} resumes (at ${hex(pc)})`);
    },
    state() {
      const s = { r: [...view.r] };
      for (const f of FIELDS) s[f] = words[ctx(f)];
      return s;
    },
  };
}
