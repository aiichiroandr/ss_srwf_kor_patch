// Differential tests for the client-side recompilation prototype. Every
// program runs twice: in the whole-program reference interpreter and as
// translated WebAssembly under the JS stand-in runtime (calls, returns, polls
// that behave like interrupts, I/O and traps). Registers, SR fields, GBR,
// MACH/MACL, PR, RAM and the I/O log must match. Programs are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { createMachine, decode, run, SENTINEL } from "../lab/sh2-wasm/sh2.mjs";
import { createHarness } from "../lab/sh2-wasm/harness.mjs";

const BASE = 0x06004000;
const STACK = 0x060ff000;

// ---- a tiny assembler ----------------------------------------------------------------
const two = (base) => (n, m) => base | (n << 8) | (m << 4);
const one = (base) => (n) => base | (n << 8);
const imm8 = (base) => (i) => base | (i & 0xff);
const E = {
  nop: () => 0x0009, rts: () => 0x000b, clrt: () => 0x0008, sett: () => 0x0018, div0u: () => 0x0019, clrmac: () => 0x0028,
  movi: (n, i) => 0xe000 | (n << 8) | (i & 0xff), addi: (n, i) => 0x7000 | (n << 8) | (i & 0xff),
  mov: two(0x6003), add: two(0x300c), sub: two(0x3008), addc: two(0x300e), subc: two(0x300a), negc: two(0x600a),
  cmpeq: two(0x3000), cmphs: two(0x3002), cmpge: two(0x3003), cmphi: two(0x3006), cmpgt: two(0x3007),
  neg: two(0x600b), not: two(0x6007), extub: two(0x600c), extuw: two(0x600d), extsb: two(0x600e), extsw: two(0x600f),
  swapb: two(0x6008), swapw: two(0x6009), xtrct: two(0x200d), and: two(0x2009), or: two(0x200b), xor: two(0x200a),
  tst: two(0x2008), mull: two(0x0007), mulsw: two(0x200f), muluw: two(0x200e), dmuls: two(0x300d), dmulu: two(0x3005),
  div0s: two(0x2007), div1: two(0x3004), macl: two(0x000f), macw: two(0x400f),
  stb: two(0x2000), stw: two(0x2001), stl: two(0x2002), ldb: two(0x6000), ldw: two(0x6001), ldl: two(0x6002),
  stbdec: two(0x2004), stwdec: two(0x2005), stldec: two(0x2006), ldbinc: two(0x6004), ldwinc: two(0x6005), ldlinc: two(0x6006),
  stbr0: two(0x0004), stwr0: two(0x0005), stlr0: two(0x0006), ldbr0: two(0x000c), ldwr0: two(0x000d), ldlr0: two(0x000e),
  shll: one(0x4000), shlr: one(0x4001), shar: one(0x4021), rotl: one(0x4004), rotr: one(0x4005), rotcl: one(0x4024), rotcr: one(0x4025),
  shll2: one(0x4008), shll8: one(0x4018), shll16: one(0x4028), shlr2: one(0x4009), shlr8: one(0x4019), shlr16: one(0x4029),
  dt: one(0x4010), cmppl: one(0x4015), cmppz: one(0x4011), movt: one(0x0029), tas: one(0x401b),
  stsmach: one(0x000a), stsmacl: one(0x001a), stspr: one(0x002a), ldsmach: one(0x400a), ldsmacl: one(0x401a), ldspr: one(0x402a),
  stsmachdec: one(0x4002), stsmacldec: one(0x4012), stsprdec: one(0x4022),
  ldsmachinc: one(0x4006), ldsmaclinc: one(0x4016), ldsprinc: one(0x4026),
  stcsr: one(0x0002), stcgbr: one(0x0012), ldcsr: one(0x400e), ldcgbr: one(0x401e),
  stcsrdec: one(0x4003), stcgbrdec: one(0x4013), ldcsrinc: one(0x4007), ldcgbrinc: one(0x4017),
  jsr: one(0x400b), jmp: one(0x402b),
  andi: imm8(0xc900), ori: imm8(0xcb00), xori: imm8(0xca00), tsti: imm8(0xc800), cmpeqi: imm8(0x8800),
  andbg: imm8(0xcd00), orbg: imm8(0xcf00), xorbg: imm8(0xce00), tstbg: imm8(0xcc00), trapa: imm8(0xc300),
  stbgbr: (d) => 0xc000 | d, stwgbr: (d) => 0xc100 | (d / 2), stlgbr: (d) => 0xc200 | (d / 4),
  ldbgbr: (d) => 0xc400 | d, ldwgbr: (d) => 0xc500 | (d / 2), ldlgbr: (d) => 0xc600 | (d / 4),
  stldisp: (n, m, d) => 0x1000 | (n << 8) | (m << 4) | (d / 4), ldldisp: (n, m, d) => 0x5000 | (n << 8) | (m << 4) | (d / 4),
  stbdisp: (n, d) => 0x8000 | (n << 4) | d, ldbdisp: (m, d) => 0x8400 | (m << 4) | d,
  stwdisp: (n, d) => 0x8100 | (n << 4) | (d / 2), ldwdisp: (m, d) => 0x8500 | (m << 4) | (d / 2),
};
// Label-relative forms, resolved in the second pass: [kind, ...args, label]
const RELATIVE = {
  bt: (pc, t) => 0x8900 | (((t - pc - 4) / 2) & 0xff), bf: (pc, t) => 0x8b00 | (((t - pc - 4) / 2) & 0xff),
  bts: (pc, t) => 0x8d00 | (((t - pc - 4) / 2) & 0xff), bfs: (pc, t) => 0x8f00 | (((t - pc - 4) / 2) & 0xff),
  bra: (pc, t) => 0xa000 | (((t - pc - 4) / 2) & 0xfff), bsr: (pc, t) => 0xb000 | (((t - pc - 4) / 2) & 0xfff),
  ldlpc: (pc, t, n) => 0xd000 | (n << 8) | ((t - ((pc & ~3) + 4)) / 4), mova: (pc, t) => 0xc700 | ((t - ((pc & ~3) + 4)) / 4),
};

// items: opcode numbers, ["label"], [kind, label, ...args] for RELATIVE, {long: value|label}, {align: 4}
function assemble(items, base = BASE) {
  const labels = new Map();
  let pc = base;
  const placed = [];
  for (const it of items) {
    if (typeof it === "string") { labels.set(it, pc); continue; }
    const object = typeof it === "object" && !Array.isArray(it);
    if (object && it.align) { while (pc % it.align) { placed.push([pc, 0x0009, 2]); pc += 2; } continue; }
    if (object && "long" in it) { placed.push([pc, it, 4]); pc += 4; continue; }
    placed.push([pc, it, 2]); pc += 2;
  }
  const resolve = (v) => (typeof v === "string" ? labels.get(v) : v);
  const out = [];
  for (const [at, it, size] of placed) {
    if (size === 4) { out.push([at, resolve(it.long) >>> 0, 4]); continue; }
    let op = it;
    if (Array.isArray(it)) {
      const [kind, label, ...args] = it;
      const t = labels.get(label);
      if (t === undefined) throw Error(`unknown label ${label}`);
      op = RELATIVE[kind](at, t, ...args);
    }
    out.push([at, op & 0xffff, 2]);
  }
  return { words: out, labels };
}

function load(target, program) {
  for (const [at, v, size] of program.words) {
    const i = at & 0xfffff;
    if (size === 4) { target[i] = v >>> 24; target[i + 1] = v >> 16; target[i + 2] = v >> 8; target[i + 3] = v; }
    else { target[i] = v >> 8; target[i + 1] = v; }
  }
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// I/O and trap behaviour shared by both sides, with a log of every access.
function devices() {
  const log = [];
  const regs = new Map();
  return {
    log,
    ioRead: (a, size) => { const v = (regs.get(a) ?? (a ^ 0x5a5a5a5a)) & (size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff); log.push(["r", a, size, v >>> 0]); return v; },
    ioWrite: (a, v, size) => { regs.set(a, v); log.push(["w", a, size, v >>> 0]); },
    trapa: (m, imm, pc) => { m.r[0] = (m.r[0] + imm * 3 + (pc & 0xff)) >>> 0; log.push(["t", imm, pc >>> 0]); },
  };
}

// Runs a program both ways and compares everything observable.
function runBoth(program, init = {}, { budget = 1000, data = [], batch = 64 } = {}) {
  const devA = devices(), devB = devices();
  const m = createMachine(devA);
  load(m.wramH, program);
  for (const [addr, bytes] of data) m.wramH.set(bytes, addr & 0xfffff);
  const h = createHarness({ ...devB, budget, batch });
  load(h.view.wramH, program);
  for (const [addr, bytes] of data) h.view.wramH.set(bytes, addr & 0xfffff);

  m.r.set(init.r ?? []);
  for (const f of ["t", "s", "q", "m", "imask", "gbr", "mach", "macl"]) if (f in init) m[f] = init[f] >>> 0;
  const steps = run(m, BASE);
  const b = h.run(BASE, { ...init, r: Uint32Array.from(init.r ?? new Array(16).fill(0)) });

  assert.deepEqual(b.r, [...m.r], "registers");
  for (const f of ["t", "s", "q", "m", "imask", "gbr", "mach", "macl", "pr", "pc"]) assert.equal(b[f] >>> 0, m[f] >>> 0, f);
  assert.ok(h.view.wramH.every((x, i) => x === m.wramH[i]), "WRAM-H");
  assert.ok(h.view.wramL.every((x, i) => x === m.wramL[i]), "WRAM-L");
  assert.deepEqual(devB.log, devA.log, "I/O and trap log");
  return { m, h, steps };
}

const regs = (values) => { const r = new Array(16).fill(0); for (const [i, v] of Object.entries(values)) r[i] = v >>> 0; return r; };

// ---- hand-written programs -------------------------------------------------------------

test("decoder covers the forms the runtime's recompiler emitted, and rejects the rest", () => {
  for (const [op, kind] of [[0x300e, "addc"], [0x3004, "div1"], [0x000f, "macl"], [0x4024, "rotcl"], [0x401e, "ldcgbr"],
    [0xc512, "ldwgbr"], [0xcc01, "tstbg"], [0x401b, "tas"], [0xc320, "trapa"], [0x300d, "dmuls"]]) {
    assert.equal(decode(op, BASE).kind, kind, kind);
  }
  assert.equal(decode(0xc512, BASE).imm, 0x24);
  for (const op of [0x002b /* rte */, 0x001b /* sleep */, 0x0023 /* braf */, 0x200c /* cmp/str */, 0xffff]) {
    assert.equal(decode(op, BASE), null, op.toString(16));
  }
});

test("recursive fib(15) through bsr, stack frames and delay slots", () => {
  const p = assemble([
    "fib", E.stsprdec(15), E.movi(1, 2), E.cmpge(4, 1), ["bt", "recurse"],
    E.mov(0, 4), E.ldsprinc(15), E.rts(), E.nop(),
    "recurse", E.stldec(15, 4), ["bsr", "fib"], E.addi(4, -1),
    E.ldl(4, 15), E.stldec(15, 0), ["bsr", "fib"], E.addi(4, -2),
    E.ldlinc(1, 15), E.add(0, 1), E.addi(15, 4), E.ldsprinc(15), E.rts(), E.nop(),
  ]);
  const { m, h } = runBoth(p, { r: regs({ 4: 15, 15: STACK }) }, { budget: 7 });
  assert.equal(m.r[0], 610);
  assert.ok(h.stats.polls > 0, "polls ran");
});

test("calls through literal pools, 64-bit add/negate with carry, and a callee that changes registers", () => {
  const p = assemble([
    E.stsprdec(15), ["ldlpc", "lit_add", 1], E.jsr(1), E.nop(),
    ["ldlpc", "lit_neg", 1], E.jsr(1), E.movi(3, 7), E.subc(3, 3), E.ldsprinc(15), E.rts(), E.nop(),
    { align: 4 }, "lit_add", { long: "add64" }, "lit_neg", { long: "neg64" },
    "add64", E.clrt(), E.addc(4, 6), E.addc(5, 7), E.rts(), E.movt(10),
    "neg64", E.clrt(), E.negc(8, 4), E.negc(9, 5), E.rts(), E.movt(11),
  ]);
  const { m } = runBoth(p, { r: regs({ 4: 0xffffffff, 5: 1, 6: 2, 7: 3, 15: STACK }) });
  assert.equal(m.r[4], 1);
  assert.equal(m.r[5], 5);
});

test("16-bit unsigned division with div0u/div1/rotcl and signed div0s", () => {
  const body = [E.shll16(0), E.div0u()];
  for (let i = 0; i < 16; i++) body.push(E.div1(1, 0));
  body.push(E.rotcl(1), E.extuw(1, 1), E.div0s(2, 3), E.movt(4), E.rts(), E.nop());
  const { m } = runBoth(assemble(body), { r: regs({ 0: 7, 1: 1000, 2: -5, 3: 9 }) });
  assert.equal(m.r[1], 142);
});

test("dmuls, dmulu, mac.l and mac.w with and without saturation", () => {
  const p = assemble([
    E.dmuls(1, 2), E.stsmach(3), E.stsmacl(4), E.dmulu(1, 2), E.stsmach(5),
    E.clrmac(), E.macl(12, 13), E.macl(12, 13), E.macw(12, 13), E.stsmacl(6), E.stsmach(7),
    E.stcsr(8), E.movi(9, 2), E.or(8, 9), E.ldcsr(8),                // S = 1
    E.ldsmach(10), E.ldsmacl(11), E.macl(12, 13), E.macw(12, 13), E.stsmach(0), E.stsmacl(1),
    E.rts(), E.nop(),
  ]);
  const data = new Uint8Array(64).map((_, i) => (i * 97 + 13) & 0xff);
  runBoth(p, { r: regs({ 1: -123456789, 2: 987654, 10: 0x7fff, 11: 0xfffffff0, 12: 0x06020000, 13: 0x06020020 }) },
    { data: [[0x06020000, data]] });
});

test("GBR addressing, read-modify-write bytes, tas.b, trapa and I/O registers", () => {
  const p = assemble([
    E.ldcgbr(14), E.movi(0, 0x55), E.stbgbr(3), E.stwgbr(8), E.stlgbr(16),
    E.ldbgbr(3), E.mov(1, 0), E.ldwgbr(8), E.mov(2, 0), E.ldlgbr(16), E.mov(3, 0),
    E.movi(0, 3), E.orbg(0x80), E.andbg(0xf0), E.xorbg(0x0f), E.tstbg(0x01), E.movt(4),
    E.tas(14), E.movt(5), E.tas(14), E.movt(6), E.trapa(0x21), E.stcgbr(7),
    ["ldlpc", "io", 9], E.movi(0, -2), E.stl(9, 0), E.ldl(8, 9), E.stw(9, 0), E.ldw(10, 9), E.ldbdisp(9, 1),
    E.rts(), E.nop(),
    { align: 4 }, "io", { long: 0x25f80010 },
  ]);
  runBoth(p, { r: regs({ 14: 0x06020000 }) });
});

test("SR fields through ldc/stc and the stack, and a poll after ldc sr", () => {
  const p = assemble([
    E.stcsrdec(15), E.movi(1, 0x7f), E.shll2(1), E.shll2(1), E.ldcsr(1), E.stcsr(2),
    E.ldcsrinc(15), E.stcsr(3), E.stcgbrdec(15), E.ldcgbrinc(15), E.rts(), E.nop(),
  ]);
  runBoth(p, { r: regs({ 15: STACK }), t: 1, s: 1, imask: 0xf }, { budget: 0 });
});

test("a jump table through jsr and a tail call through jmp", () => {
  const p = assemble([
    E.stsprdec(15), "again", ["mova", "table"], E.mov(1, 4), E.shll2(1), E.ldlr0(2, 1), E.jsr(2), E.nop(),
    E.add(6, 5), E.dt(4), ["bfs", "again"], E.nop(),
    ["ldlpc", "lit_tail", 3], E.ldsprinc(15), E.jmp(3), E.nop(),
    { align: 4 }, "table", { long: "case0" }, { long: "case1" }, { long: "case2" }, { long: "case3" },
    "lit_tail", { long: "tail" },
    "case0", E.rts(), E.movi(5, 10), "case1", E.rts(), E.movi(5, 20),
    "case2", E.rts(), E.movi(5, 30), "case3", E.rts(), E.movi(5, 40),
    "tail", E.addi(6, 1), E.rts(), E.nop(),
  ]);
  const { m } = runBoth(p, { r: regs({ 4: 3, 15: STACK }) }, { budget: 2 });
  assert.equal(m.r[6], 40 + 30 + 20 + 1);
});

test("a non-local return unwinds the translated callers and resumes where the guest went", () => {
  const p = assemble([
    E.stsprdec(15), ["bsr", "escape"], E.nop(), E.movi(1, 1),
    "landing", E.movi(2, 2), E.ldsprinc(15), E.rts(), E.nop(),
    "escape", ["ldlpc", "lit_landing", 3], E.ldspr(3), E.rts(), E.nop(),
    { align: 4 }, "lit_landing", { long: "landing" },
  ]);
  const { m } = runBoth(p, { r: regs({ 15: STACK }) });
  assert.equal(m.r[1], 0);
  assert.equal(m.r[2], 2);
});

// ---- random programs --------------------------------------------------------------------

// r12/r13 are mac pointers, r14 the data base (and GBR), r15 the stack: never
// written by the generated ALU instructions.
function randomProgram(rand) {
  const r = (limit = 12) => Math.floor(rand() * limit);
  const alu = [
    () => E.movi(r(), r(256)), () => E.addi(r(), r(256)), () => E.mov(r(), r()), () => E.add(r(), r()),
    () => E.sub(r(), r()), () => E.addc(r(), r()), () => E.subc(r(), r()), () => E.negc(r(), r()),
    () => E.cmpeq(r(), r()), () => E.cmphs(r(), r()), () => E.cmpge(r(), r()), () => E.cmphi(r(), r()), () => E.cmpgt(r(), r()),
    () => E.neg(r(), r()), () => E.not(r(), r()), () => E.extub(r(), r()), () => E.extuw(r(), r()),
    () => E.extsb(r(), r()), () => E.extsw(r(), r()), () => E.swapb(r(), r()), () => E.swapw(r(), r()),
    () => E.xtrct(r(), r()), () => E.and(r(), r()), () => E.or(r(), r()), () => E.xor(r(), r()), () => E.tst(r(), r()),
    () => E.mull(r(), r()), () => E.mulsw(r(), r()), () => E.muluw(r(), r()), () => E.dmuls(r(), r()), () => E.dmulu(r(), r()),
    () => E.div0s(r(), r()), () => E.div0u(), () => E.div1(r(), r()), () => E.div1(r(), r()), () => E.clrmac(),
    () => E.stsmach(r()), () => E.stsmacl(r()), () => E.ldsmach(r()), () => E.ldsmacl(r()), () => E.stcgbr(r()),
    () => E.shll(r()), () => E.shlr(r()), () => E.shar(r()), () => E.rotl(r()), () => E.rotr(r()),
    () => E.rotcl(r()), () => E.rotcr(r()), () => E.shll2(r()), () => E.shll8(r()), () => E.shll16(r()),
    () => E.shlr2(r()), () => E.shlr8(r()), () => E.shlr16(r()), () => E.dt(r()), () => E.cmppl(r()), () => E.cmppz(r()),
    () => E.movt(r()), () => E.andi(r(256)), () => E.ori(r(256)), () => E.xori(r(256)), () => E.tsti(r(256)),
    () => E.cmpeqi(r(256)), () => E.clrt(), () => E.sett(), () => E.stcsr(r()), () => E.ldcsr(r()),
    () => E.stldisp(14, r(), 4 * r(16)), () => E.ldldisp(r(), 14, 4 * r(16)), () => E.stl(14, r()), () => E.ldl(r(), 14),
    () => E.stbdisp(14, r(16)), () => E.ldbdisp(14, r(16)), () => E.stwdisp(14, 2 * r(16)), () => E.ldwdisp(14, 2 * r(16)),
    () => E.stbgbr(r(256)), () => E.ldbgbr(r(256)), () => E.stwgbr(2 * r(256)), () => E.ldwgbr(2 * r(256)),
    () => E.stlgbr(4 * r(256)), () => E.ldlgbr(4 * r(256)), () => E.tstbg(r(256)), () => E.tas(14),
    () => E.macl(12, 13), () => E.macw(12, 13),
  ];
  const items = [E.stsprdec(15)];
  const length = 25 + r(40);
  for (let i = 0; i < length; i++) {
    const roll = rand();
    if (roll < 0.07) items.push(["bt", `L${i + 1 + r(5)}`]);
    else if (roll < 0.12) items.push(["bf", `L${i + 1 + r(5)}`]);
    else if (roll < 0.17) { items.push([["bts", "bfs"][r(2)], `L${i + 2 + r(4)}`], alu[r(alu.length)]()); }
    else if (roll < 0.22) items.push(["bsr", "helper"], alu[r(alu.length)]());
    else if (roll < 0.26) items.push(E.movi(0, r(64)), [E.orbg, E.andbg, E.xorbg][r(3)](r(256)));
    else items.push(alu[r(alu.length)]());
    items.push(`L${i + 1}`);
  }
  for (let i = length + 1; i <= length + 6; i++) items.push(`L${i}`);
  items.push(E.ldsprinc(15), E.rts(), alu[r(alu.length)]());
  items.push("helper");
  for (let i = 0; i < 4 + r(8); i++) items.push(alu[r(alu.length)]());
  items.push(E.rts(), alu[r(alu.length)]());
  return assemble(items);
}

test("300 random programs with calls, polls and every supported form match bit for bit", () => {
  const rand = mulberry32(0x5a7);
  for (let p = 0; p < 300; p++) {
    const program = randomProgram(rand);
    const data = new Uint8Array(0x3000).map(() => Math.floor(rand() * 256));
    const r = Array.from({ length: 16 }, () => (rand() * 2 ** 32) >>> 0);
    r[12] = 0x06021000; r[13] = 0x06022000; r[14] = 0x06020000; r[15] = STACK;
    const sr = Math.floor(rand() * 0x400);
    runBoth(program, {
      r, t: sr & 1, s: (sr >> 1) & 1, imask: (sr >> 4) & 15, q: (sr >> 8) & 1, m: (sr >> 9) & 1,
      gbr: 0x06020000, mach: (rand() * 2 ** 32) >>> 0, macl: (rand() * 2 ** 32) >>> 0,
    }, { data: [[0x06020000, data]], budget: 1 + Math.floor(rand() * 8), batch: 1 + Math.floor(rand() * 2) });
  }
});
