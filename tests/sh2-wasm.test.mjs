// Differential tests for the client-side recompilation prototype: every
// program runs in the reference interpreter and as a translated WebAssembly
// module, and registers, flags and RAM must match. Programs are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { GUEST_SIZE, GUEST_MASK, createState, decode, discover, interpret } from "../lab/sh2-wasm/sh2.mjs";
import { translate, swizzleInto, unswizzleFrom, MEMORY_PAGES, REG_BASE } from "../lab/sh2-wasm/emit.mjs";

const BASE = 0x06004000;
const RETURN = 0x06008000;
const two = (base) => (n, m) => base | (n << 8) | (m << 4);
const one = (base) => (n) => base | (n << 8);
const A = {
  movi: (n, i) => 0xe000 | (n << 8) | (i & 0xff), addi: (n, i) => 0x7000 | (n << 8) | (i & 0xff),
  mov: two(0x6003), add: two(0x300c), sub: two(0x3008), cmpeq: two(0x3000), cmphs: two(0x3002),
  cmpge: two(0x3003), cmphi: two(0x3006), cmpgt: two(0x3007), neg: two(0x600b), not: two(0x6007),
  extub: two(0x600c), extuw: two(0x600d), extsb: two(0x600e), extsw: two(0x600f), swapb: two(0x6008),
  swapw: two(0x6009), xtrct: two(0x200d), and: two(0x2009), or: two(0x200b), xor: two(0x200a),
  tst: two(0x2008), mull: two(0x0007), mulsw: two(0x200f), muluw: two(0x200e),
  stl: two(0x2002), ldl: two(0x6002), ldlinc: two(0x6006), stldec: two(0x2006),
  stldisp: (n, m, d) => 0x1000 | (n << 8) | (m << 4) | (d / 4), ldldisp: (n, m, d) => 0x5000 | (n << 8) | (m << 4) | (d / 4),
  stbdisp: (n, d) => 0x8000 | (n << 4) | d, ldbdisp: (m, d) => 0x8400 | (m << 4) | d,
  stwdisp: (n, d) => 0x8100 | (n << 4) | (d / 2), ldwdisp: (m, d) => 0x8500 | (m << 4) | (d / 2),
  shll: one(0x4000), shlr: one(0x4001), shar: one(0x4021), rotl: one(0x4004), rotr: one(0x4005),
  shll2: one(0x4008), shll8: one(0x4018), shll16: one(0x4028), shlr2: one(0x4009), shlr8: one(0x4019),
  shlr16: one(0x4029), dt: one(0x4010), cmppl: one(0x4015), cmppz: one(0x4011), movt: one(0x0029),
  stsmacl: one(0x001a), stsprdec: one(0x4f22 & 0xf0ff), ldsprinc: one(0x4f26 & 0xf0ff),
  jsr: one(0x400b), jmp: one(0x402b),
  andi: (i) => 0xc900 | i, ori: (i) => 0xcb00 | i, xori: (i) => 0xca00 | i, tsti: (i) => 0xc800 | i,
  cmpeqi: (i) => 0x8800 | (i & 0xff),
  nop: () => 0x0009, rts: () => 0x000b, clrt: () => 0x0008, sett: () => 0x0018,
};
const branch8 = { bt: 0x8900, bf: 0x8b00, bts: 0x8d00, bfs: 0x8f00 };
const b8 = (kind, from, to) => branch8[kind] | (((to - from - 4) / 2) & 0xff);
const bra = (from, to) => 0xa000 | (((to - from - 4) / 2) & 0xfff);
const bsr = (from, to) => 0xb000 | (((to - from - 4) / 2) & 0xfff);

function put16(mem, addr, v) { const a = addr & GUEST_MASK; mem[a] = v >> 8; mem[a + 1] = v; }
function put32(mem, addr, v) { put16(mem, addr, v >>> 16); put16(mem, addr + 2, v & 0xffff); }
function program(mem, words, at = BASE) { words.forEach((w, i) => put16(mem, at + 2 * i, w)); }

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runBoth(guest, init, host = () => assert.fail("unexpected call")) {
  const code = discover(guest, BASE);
  const memA = guest.slice();
  const s = createState();
  s.r.set(init.r ?? []); s.t = init.t ?? 0; s.pr = init.pr ?? RETURN; s.macl = init.macl ?? 0;
  const callsA = [];
  interpret(s, memA, code, BASE, (target, st) => { callsA.push(target); host(target, st); });

  const memory = new WebAssembly.Memory({ initial: MEMORY_PAGES });
  const heap = new Uint8Array(memory.buffer);
  swizzleInto(heap, guest);
  const regs = new Int32Array(memory.buffer, REG_BASE, 20);
  regs.set(init.r ?? []); regs[16] = init.t ?? 0; regs[17] = init.pr ?? RETURN; regs[18] = init.macl ?? 0;
  const callsB = [];
  const view = { r: regs.subarray(0, 16) };
  const { instance } = await WebAssembly.instantiate(translate(code, BASE), {
    env: { mem: memory, call: (target) => { callsB.push(target >>> 0); host(target >>> 0, view); } },
  });
  instance.exports.run();
  const memB = new Uint8Array(GUEST_SIZE);
  unswizzleFrom(heap, memB);

  assert.deepEqual([...regs.subarray(0, 16)], [...s.r], "registers");
  assert.equal(regs[16], s.t, "T");
  assert.equal(regs[17] >>> 0, s.pr >>> 0, "PR");
  assert.equal(regs[18], s.macl, "MACL");
  assert.equal(regs[19] >>> 0, s.pc >>> 0, "PC");
  assert.deepEqual(callsB, callsA, "calls");
  assert.ok(memB.every((b, i) => b === memA[i]), "RAM");
  return { s, mem: memA };
}

test("decodes delayed branch targets and rejects unknown encodings", () => {
  assert.equal(decode(bra(BASE, BASE + 0x40), BASE).target, BASE + 0x40);
  assert.equal(decode(b8("bfs", BASE + 8, BASE + 2), BASE + 8).target, BASE + 2);
  assert.equal(decode(0xffff, BASE), null);
  const mem = new Uint8Array(GUEST_SIZE);
  program(mem, [A.movi(0, 1), 0xffff]);
  assert.throws(() => discover(mem, BASE), /unsupported instruction/);
  program(mem, [bra(BASE, BASE + 8), A.rts()]);
  assert.throws(() => discover(mem, BASE), /delay slot/);
});

test("checksum loop with post-increment loads and a bf/s delay slot", async () => {
  const mem = new Uint8Array(GUEST_SIZE);
  program(mem, [
    A.movi(0, 0), A.ldlinc(1, 4), A.add(0, 1), A.dt(5),
    b8("bfs", BASE + 8, BASE + 2), A.addi(6, 1), A.rts(), A.nop(),
  ]);
  for (let i = 0; i < 8; i++) put32(mem, 0x06010000 + 4 * i, 0x01010101 * (i + 1));
  const { s } = await runBoth(mem, { r: [0, 0, 0, 0, 0x06010000, 8, 0] });
  assert.equal(s.r[0], 0x01010101 * 36);
  assert.equal(s.r[6], 8);
  assert.equal(s.pc, RETURN);
});

test("stack frame, literal-pool call target, jsr delay slot and rts delay slot", async () => {
  const mem = new Uint8Array(GUEST_SIZE);
  program(mem, [
    A.stsprdec(15), 0xd103 /* mov.l @(disp,PC) -> literal at BASE+0x10 */, A.jsr(1), A.movi(4, 5),
    A.add(9, 0), A.ldsprinc(15), A.rts(), A.addi(10, 1),
  ]);
  put32(mem, BASE + 0x10, 0x06005000);
  const host = (target, st) => { st.r[0] = st.r[4] * 3; st.r[2] = target | 0; };
  const { s } = await runBoth(mem, { r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0x060ff000] }, host);
  assert.equal(s.r[9], 115);
  assert.equal(s.r[2], 0x06005000);
  assert.equal(s.r[15], 0x060ff000);
  assert.equal(s.pc, RETURN);
});

test("bsr, mova, PC-relative word loads, byte and word displacement stores", async () => {
  const mem = new Uint8Array(GUEST_SIZE);
  program(mem, [
    A.stsprdec(15), bsr(BASE + 2, BASE + 0x100), A.nop(), 0xc703 /* mova -> BASE+0x14 */,
    0x9208 /* mov.w @(disp,PC) -> BASE+0x1c */, A.mov(14, 0), A.movi(0, -3), A.stbdisp(14, 1),
    A.stwdisp(14, 6), A.ldbdisp(14, 1), A.ldsprinc(15), A.rts(), A.nop(),
  ]);
  put16(mem, BASE + 0x1c, 0x8123);
  const { s } = await runBoth(mem, { r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x060ff000] }, () => {});
  assert.equal(s.r[2], (0x8123 << 16) >> 16);
  assert.equal(s.r[0], -3);
});

test("bt, bf and bt/s choose the same paths as the interpreter", async () => {
  for (const t of [0, 1]) {
    const mem = new Uint8Array(GUEST_SIZE);
    program(mem, [
      A.cmppl(3), b8("bt", BASE + 2, BASE + 8), A.addi(1, 1), A.addi(1, 2),
      A.cmpeqi(t), b8("bts", BASE + 10, BASE + 16), A.addi(2, 4), A.addi(2, 8),
      A.rts(), A.nop(),
    ]);
    await runBoth(mem, { r: [t, 0, 0, t ? 5 : -5] });
  }
});

// Random straight-line and forward-branching programs. r14 is the aligned
// memory base and is never written, so every access stays aligned.
function randomProgram(rand) {
  const words = [];
  const r = (limit = 14) => Math.floor(rand() * limit);
  const alu = [
    () => A.movi(r(), r(256)), () => A.addi(r(), r(256)), () => A.mov(r(), r()), () => A.add(r(), r()),
    () => A.sub(r(), r()), () => A.cmpeq(r(), r()), () => A.cmphs(r(), r()), () => A.cmpge(r(), r()),
    () => A.cmphi(r(), r()), () => A.cmpgt(r(), r()), () => A.neg(r(), r()), () => A.not(r(), r()),
    () => A.extub(r(), r()), () => A.extuw(r(), r()), () => A.extsb(r(), r()), () => A.extsw(r(), r()),
    () => A.swapb(r(), r()), () => A.swapw(r(), r()), () => A.xtrct(r(), r()), () => A.and(r(), r()),
    () => A.or(r(), r()), () => A.xor(r(), r()), () => A.tst(r(), r()), () => A.mull(r(), r()),
    () => A.mulsw(r(), r()), () => A.muluw(r(), r()), () => A.stsmacl(r()), () => A.shll(r()),
    () => A.shlr(r()), () => A.shar(r()), () => A.rotl(r()), () => A.rotr(r()), () => A.shll2(r()),
    () => A.shll8(r()), () => A.shll16(r()), () => A.shlr2(r()), () => A.shlr8(r()), () => A.shlr16(r()),
    () => A.dt(r()), () => A.cmppl(r()), () => A.cmppz(r()), () => A.movt(r()), () => A.andi(r(256)),
    () => A.ori(r(256)), () => A.xori(r(256)), () => A.tsti(r(256)), () => A.cmpeqi(r(256)),
    () => A.clrt(), () => A.sett(),
    () => A.stldisp(14, r(), 4 * r(16)), () => A.ldldisp(r(), 14, 4 * r(16)), () => A.stl(14, r()),
    () => A.ldl(r(), 14), () => A.stbdisp(14, r(16)), () => A.ldbdisp(14, r(16)),
    () => A.stwdisp(14, 2 * r(16)), () => A.ldwdisp(14, 2 * r(16)),
  ];
  const length = 20 + r(40);
  const at = (i) => BASE + 2 * i;
  for (let i = 0; i < length; i++) {
    const roll = rand();
    if (roll < 0.1 && i + 4 < length) {
      const kind = ["bt", "bf"][r(2)];
      const to = i + 2 + r(Math.min(6, length - i - 1));
      words.push(b8(kind, at(i), at(to)));
    } else if (roll < 0.15 && i + 5 < length) {
      const kind = ["bts", "bfs"][r(2)];
      const to = i + 2 + r(Math.min(6, length - i - 2));
      words.push(b8(kind, at(i), at(to)), alu[r(alu.length)]());
      i++;
    } else words.push(alu[r(alu.length)]());
  }
  words.push(A.rts(), alu[r(alu.length)]());
  return words;
}

test("300 random programs match the interpreter bit for bit", async () => {
  const rand = mulberry32(0x5a7);
  for (let p = 0; p < 300; p++) {
    const mem = new Uint8Array(GUEST_SIZE);
    program(mem, randomProgram(rand));
    for (let i = 0; i < 64; i++) mem[0x20000 + i] = Math.floor(rand() * 256);
    const regs = Array.from({ length: 16 }, () => (rand() * 2 ** 32) | 0);
    regs[14] = 0x06020000;
    await runBoth(mem, { r: regs, t: rand() < 0.5 ? 1 : 0, macl: (rand() * 2 ** 32) | 0 });
  }
});

