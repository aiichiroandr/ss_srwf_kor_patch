// Manual benchmark for the client-side recompilation prototype. Synthetic
// SH-2 code only. Run with: node lab/sh2-wasm/bench.mjs
// Prints interpreter vs translated-WebAssembly time for two loops, and the
// translation + compile cost of a large straight-line function.
import { GUEST_SIZE, createState, discover, interpret } from "./sh2.mjs";
import { translate, swizzleInto, MEMORY_PAGES, REG_BASE } from "./emit.mjs";

const BASE = 0x06004000;
const put16 = (mem, a, v) => { a &= GUEST_SIZE - 1; mem[a] = v >> 8; mem[a + 1] = v; };

function measure(label, words, init, repeat) {
  const mem = new Uint8Array(GUEST_SIZE);
  words.forEach((w, i) => put16(mem, BASE + 2 * i, w));
  for (let i = 0; i < 0x40000; i++) mem[0x40000 + i] = (i * 2654435761) >>> 24;
  const code = discover(mem, BASE);

  let t0 = performance.now();
  let reference;
  for (let k = 0; k < repeat; k++) {
    const s = createState();
    s.r.set(init); s.pr = 0x06008000;
    interpret(s, mem, code, BASE, () => {});
    reference = s;
  }
  const interp = (performance.now() - t0) / repeat;

  const memory = new WebAssembly.Memory({ initial: MEMORY_PAGES });
  swizzleInto(new Uint8Array(memory.buffer), mem);
  const bytes = translate(code, BASE);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { mem: memory, call: () => {} } });
  const regs = new Int32Array(memory.buffer, REG_BASE, 20);
  const run = () => { regs.fill(0); regs.set(init); regs[17] = 0x06008000; instance.exports.run(); };
  for (let k = 0; k < 3; k++) run(); // let the engine tier up
  t0 = performance.now();
  for (let k = 0; k < repeat; k++) run();
  const wasm = (performance.now() - t0) / repeat;
  for (let i = 0; i < 16; i++) {
    if (regs[i] !== reference.r[i]) throw Error(`${label}: r${i} differs (${regs[i]} vs ${reference.r[i]})`);
  }
  console.log(`${label}: interpreter ${interp.toFixed(2)} ms, wasm ${wasm.toFixed(2)} ms, ${(interp / wasm).toFixed(1)}x`);
}

// 1) Checksum over 64 Ki words: mov.l @r4+,r1 / add r1,r0 / dt r5 / bf/s / slot.
measure("checksum 64Ki words", [0xe000, 0x6146, 0x301c, 0x4510, 0x8ffb, 0x7601, 0x000b, 0x0009],
  [0, 0, 0, 0, 0x06040000, 0x10000, 0], 20);

// 2) ALU mix 1M iterations: shifts, xor, extu, tst/movt, add, dt loop.
measure("ALU mix 1M iterations", [
  0x6013, /* mov r1,r0 */ 0x4001, /* shlr r0 */ 0x201a, /* xor r1,r0 */ 0x600c, /* extu.b r0,r0 */
  0x2208, /* tst r0,r2 */ 0x0329, /* movt r3 */ 0x343c, /* add r3,r4 */ 0x4510, /* dt r5 */
  0x8bf7, /* bf -> start */ 0x000b, 0x0009,
], [0, 0x1234567, 0x55, 0, 0, 1_000_000], 5);

// 3) Translation and compile cost of one large straight-line function.
const big = [];
for (let i = 0; i < 20000; i++) big.push([0x301c, 0x4001, 0x201a, 0x7101][i % 4]);
big.push(0x000b, 0x0009);
const mem = new Uint8Array(GUEST_SIZE);
big.forEach((w, i) => put16(mem, BASE + 2 * i, w));
let t0 = performance.now();
const code = discover(mem, BASE, 30000);
const bytes = translate(code, BASE);
const tTranslate = performance.now() - t0;
t0 = performance.now();
new WebAssembly.Module(bytes);
const tCompile = performance.now() - t0;
console.log(`translate 20,002 instructions: ${tTranslate.toFixed(1)} ms, ${bytes.length.toLocaleString()} bytes, compile ${tCompile.toFixed(1)} ms`);
