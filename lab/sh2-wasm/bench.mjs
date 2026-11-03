// Manual benchmark for the client-side recompilation prototype, through the JS
// stand-in runtime (harness.mjs). Synthetic SH-2 code only.
// Run with: node lab/sh2-wasm/bench.mjs
import { createMachine, run, WRAM_SIZE } from "./sh2.mjs";
import { createHarness } from "./harness.mjs";
import { translate } from "./emit.mjs";
import { discover } from "./sh2.mjs";

const BASE = 0x06004000;
const STACK = 0x060ff000;
const put = (mem, words) => words.forEach((w, i) => { mem[(BASE & 0xfffff) + 2 * i] = w >> 8; mem[(BASE & 0xfffff) + 2 * i + 1] = w & 0xff; });

function measure(label, words, r, repeat) {
  const m = createMachine();
  put(m.wramH, words);
  let t0 = performance.now(), reference;
  for (let k = 0; k < repeat; k++) { m.r.fill(0); m.r.set(r); run(m, BASE); reference = [...m.r]; }
  const interp = (performance.now() - t0) / repeat;

  const h = createHarness({ budget: 10000 });
  put(h.view.wramH, words);
  h.run(BASE, { r: Uint32Array.from(r) });                   // translate and warm up
  for (let k = 0; k < 2; k++) h.run(BASE, { r: Uint32Array.from(r) });
  t0 = performance.now();
  let state;
  for (let k = 0; k < repeat; k++) state = h.run(BASE, { r: Uint32Array.from(r) });
  const wasm = (performance.now() - t0) / repeat;
  if (state.r.some((v, i) => v !== reference[i])) throw Error(`${label}: results differ`);
  console.log(`${label}: interpreter ${interp.toFixed(2)} ms, translated ${wasm.toFixed(2)} ms (${(interp / wasm).toFixed(1)}x), `
    + `${h.stats.functions} functions in ${h.stats.modules} modules, ${h.stats.polls} polls`);
}

// 1) Recursive fib(22): calls, stack frames, delay slots.
const fib = [
  0x4f22, 0xe102, 0x3413, 0x8903, 0x6043, 0x4f26, 0x000b, 0x0009,
  0x2f46, 0xbff5, 0x74ff, 0x64f2, 0x2f06, 0xbff1, 0x74fe, 0x61f6, 0x301c, 0x7f04, 0x4f26, 0x000b, 0x0009,
];
measure("fib(22) recursive", fib, [0, 0, 0, 0, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, STACK], 3);

// 2) ALU loop, 1M iterations: shifts, xor, extu, tst/movt, add, dt.
measure("ALU loop 1M", [0x6013, 0x4001, 0x201a, 0x600c, 0x2208, 0x0329, 0x343c, 0x4510, 0x8bf7, 0x000b, 0x0009],
  [0, 0x1234567, 0x55, 0, 0, 1_000_000], 2);

// 3) Translation and compile cost of one large straight-line function.
const big = [];
for (let i = 0; i < 20000; i++) big.push([0x301c, 0x4001, 0x201a, 0x7101, 0x2e12, 0x63e2][i % 6]);
big.push(0x000b, 0x0009);
const view = { wramH: new Uint8Array(WRAM_SIZE), wramL: new Uint8Array(WRAM_SIZE) };
put(view.wramH, big);
let t0 = performance.now();
const code = discover(view, BASE, 30000);
const bytes = translate([{ entry: BASE, code }], { h: 0x110000, l: 0x10000 });
const tTranslate = performance.now() - t0;
t0 = performance.now();
new WebAssembly.Module(bytes);
const tCompile = performance.now() - t0;
console.log(`translate 20,002 instructions: ${tTranslate.toFixed(1)} ms, ${bytes.length.toLocaleString()} bytes, compile ${tCompile.toFixed(1)} ms`);
