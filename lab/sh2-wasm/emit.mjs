// Translates discovered SH-2 functions (sh2.mjs `discover`) into one
// WebAssembly module, in memory, in the browser or Node. This is the
// client-side half of docs/WEB_PORT_CLIENT_RECOMP.md: the translated code is
// produced from the user's own disc and never leaves the user's device.
//
// The module follows the saturn-recomp runtime's calling convention, so the
// runtime can call its functions like the recompiled ones it used to link:
//   each export  f_XXXXXXXX (ctx: i32) -> ()   ctx points at the CPU context
//   imports      env.memory                     shared with the runtime
//                env.sh2_call  (ctx, addr)      calls through a register, unknown targets
//                env.sh2_poll  (ctx)            the safe-point budget ran out
//                env.io_read   (addr, size) -> value      anything outside the work RAMs
//                env.io_write  (addr, value, size)
//                env.sh2_trapa (ctx, imm, pc)
// The context layout (CTX) and the work-RAM byte order are the runtime's: the
// RAMs hold guest (big-endian) bytes at addresses the caller passes in, and
// every access outside them goes through io_read/io_write.
//
// Registers live in wasm locals inside a function and are written back to the
// context before every call, poll or trap and on exit, and reloaded after.
// After a call the caller checks that the callee returned to it (ctx.pc), and
// returns at once otherwise, as the runtime's recompiled code does.
// Literal-pool reads stay memory loads at run time, so a translated module
// holds no data bytes of the program it was made from.

import { REGION_MASK, WRAM_H_BASE, WRAM_L_BASE, WRAM_INDEX, isDelayed, hex } from "./sh2.mjs";

export const CTX = {
  r: 0, t: 64, s: 68, q: 72, m: 76, imask: 80, gbr: 84, vbr: 88,
  mach: 92, macl: 96, pr: 100, pc: 104, budget: 108, cpu: 112, size: 116,
};

// Function indices: imports, then the memory helpers, then translated functions.
const F = { call: 0, poll: 1, ioRead: 2, ioWrite: 3, trapa: 4, ld8: 5, ld16: 6, ld32: 7, st8: 8, st16: 9, st32: 10 };
const FIRST_FN = 11;

// Locals of a translated function: the context pointer, then the CPU state.
// `target` and `cond` hold a delayed branch's destination and condition across
// its delay slot; no single instruction uses them, so a slot cannot clobber them.
const L = {
  ctx: 0, r: 1, t: 17, s: 18, q: 19, m: 20, imask: 21, gbr: 22, vbr: 23, mach: 24, macl: 25, pr: 26,
  blk: 27, tmp: 28, tmp2: 29, c: 30, target: 31, cond: 32, x: 33, y: 34, z: 35,
};
const I32_LOCALS = 32;   // 1..32
const I64_LOCALS = 3;    // 33..35
const STATE = [
  ...Array.from({ length: 16 }, (_, i) => [L.r + i, CTX.r + 4 * i]),
  [L.t, CTX.t], [L.s, CTX.s], [L.q, CTX.q], [L.m, CTX.m], [L.imask, CTX.imask],
  [L.gbr, CTX.gbr], [L.vbr, CTX.vbr], [L.mach, CTX.mach], [L.macl, CTX.macl], [L.pr, CTX.pr],
];

const OP = {
  unreachable: 0x00, block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b, br: 0x0c, br_table: 0x0e,
  return: 0x0f, call: 0x10, get: 0x20, set: 0x21, tee: 0x22, i32: 0x41, i64: 0x42,
  load: 0x28, load8u: 0x2d, load16u: 0x2f, store: 0x36, store8: 0x3a, store16: 0x3b,
  eqz: 0x45, eq: 0x46, ne: 0x47, lts: 0x48, ltu: 0x49, gts: 0x4a, gtu: 0x4b, ges: 0x4e, geu: 0x4f,
  i64lts: 0x53, i64gts: 0x55,
  add: 0x6a, sub: 0x6b, mul: 0x6c, and: 0x71, or: 0x72, xor: 0x73, shl: 0x74, shrs: 0x75, shru: 0x76,
  rotl: 0x77, rotr: 0x78, i64add: 0x7c, i64mul: 0x7e, i64and: 0x83, i64or: 0x84, i64xor: 0x85,
  i64shl: 0x86, i64shrs: 0x87, i64shru: 0x88, wrap: 0xa7, extS: 0xac, extU: 0xad,
  ext8: 0xc0, ext16: 0xc1, void: 0x40, ti32: 0x7f, ti64: 0x7e,
};

function uleb(out, v) {
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
}
function sleb(out, v) {
  for (;;) {
    const b = Number(BigInt.asUintN(7, BigInt(v)));
    v = typeof v === "bigint" ? v >> 7n : v >> 7;
    const done = typeof v === "bigint" ? (v === 0n && !(b & 0x40)) || (v === -1n && (b & 0x40)) : (v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40));
    if (done) { out.push(b); return; }
    out.push(b | 0x80);
  }
}

class Body {
  constructor() { this.b = []; }
  op(...codes) { for (const c of codes) this.b.push(c); return this; }
  i32(v) { this.b.push(OP.i32); sleb(this.b, v | 0); return this; }
  i64(v) { this.b.push(OP.i64); sleb(this.b, BigInt.asIntN(64, BigInt(v))); return this; }
  get(l) { this.b.push(OP.get); uleb(this.b, l); return this; }
  set(l) { this.b.push(OP.set); uleb(this.b, l); return this; }
  tee(l) { this.b.push(OP.tee); uleb(this.b, l); return this; }
  br(depth) { this.b.push(OP.br); uleb(this.b, depth); return this; }
  call(fn) { this.b.push(OP.call); uleb(this.b, fn); return this; }
  mem(code, align, offset) { this.b.push(code); uleb(this.b, align); uleb(this.b, offset); return this; }
  ctxLoad(offset) { return this.get(L.ctx).mem(OP.load, 2, offset); }
  // [value on stack] -> stored at ctx + offset
  ctxStore(offset, push) { this.get(L.ctx); push(); return this.mem(OP.store, 2, offset); }
  reload() { for (const [l, off] of STATE) this.ctxLoad(off).set(l); return this; }
  spill() { for (const [l, off] of STATE) this.get(L.ctx).get(l).mem(OP.store, 2, off); return this; }
  R(i) { return this.get(L.r + i); }
  setR(i) { return this.set(L.r + i); }
}

// ---- one instruction --------------------------------------------------------------

function poll(f) {
  f.get(L.ctx).ctxLoad(CTX.budget).i32(1).op(OP.sub).tee(L.tmp2).mem(OP.store, 2, CTX.budget);
  f.get(L.tmp2).i32(0).op(OP.lts).op(OP.if, OP.void).spill().get(L.ctx).call(F.poll).reload().op(OP.end);
}

const SR_FIELDS = [[L.m, 9, 1], [L.q, 8, 1], [L.imask, 4, 15], [L.s, 1, 1], [L.t, 0, 1]];
function pushSr(f) {
  f.get(L.m).i32(9).op(OP.shl).get(L.q).i32(8).op(OP.shl).op(OP.or)
    .get(L.imask).i32(4).op(OP.shl).op(OP.or).get(L.s).i32(1).op(OP.shl).op(OP.or).get(L.t).op(OP.or);
}
function setSrFrom(f, local) {
  for (const [l, shift, mask] of SR_FIELDS) f.get(local).i32(shift).op(OP.shru).i32(mask).op(OP.and).set(l);
}

// MACH:MACL as one i64 on the stack, and back.
const pushMac = (f) => f.get(L.mach).op(OP.extU).i64(32).op(OP.i64shl).get(L.macl).op(OP.extU).op(OP.i64or);
function setMacFrom(f, local) {
  f.get(local).i64(32).op(OP.i64shru).op(OP.wrap).set(L.mach).get(local).op(OP.wrap).set(L.macl);
}

const SIZE = { b: 1, w: 2, l: 4 };
const LOAD = { 1: F.ld8, 2: F.ld16, 4: F.ld32 };
const STORE = { 1: F.st8, 2: F.st16, 4: F.st32 };
// [address on stack] -> sign-extended value, as mov.b/mov.w load it
function loadS(f, size) {
  f.call(LOAD[size]);
  if (size === 1) f.op(OP.ext8);
  if (size === 2) f.op(OP.ext16);
}
const loadU = (f, size) => f.call(LOAD[size]);
// store `value()` at `address()`
function store(f, size, address, value) { address(); value(); f.call(STORE[size]); }

const PAIR_REGS = { mach: L.mach, macl: L.macl, pr: L.pr, gbr: L.gbr, vbr: L.vbr };

// Emits one instruction that is not a branch. Returns true if it may have
// lowered the interrupt mask (a safe point follows).
function emitStep(f, ins, pc) {
  const n = ins.n, m = ins.m, k = ins.kind;
  const bin = (code) => f.R(n).R(m).op(code).setR(n);
  const toT = () => f.set(L.t);
  switch (k) {
    case "nop": return;
    case "clrt": f.i32(0).set(L.t); return;
    case "sett": f.i32(1).set(L.t); return;
    case "clrmac": f.i32(0).set(L.mach).i32(0).set(L.macl); return;
    case "div0u": f.i32(0).set(L.m).i32(0).set(L.q).i32(0).set(L.t); return;
    case "mov": f.R(m).setR(n); return;
    case "movi": f.i32(ins.imm).setR(n); return;
    case "add": bin(OP.add); return;
    case "addi": f.R(n).i32(ins.imm).op(OP.add).setR(n); return;
    case "sub": bin(OP.sub); return;
    case "addc":
      f.R(n).set(L.tmp).get(L.tmp).R(m).op(OP.add).set(L.tmp2).get(L.tmp2).get(L.t).op(OP.add).set(L.c);
      f.get(L.tmp).get(L.tmp2).op(OP.gtu).get(L.tmp2).get(L.c).op(OP.gtu).op(OP.or).set(L.t).get(L.c).setR(n);
      return;
    case "subc":
      f.R(n).set(L.tmp).get(L.tmp).R(m).op(OP.sub).set(L.tmp2).get(L.tmp2).get(L.t).op(OP.sub).set(L.c);
      f.get(L.tmp).get(L.tmp2).op(OP.ltu).get(L.tmp2).get(L.c).op(OP.ltu).op(OP.or).set(L.t).get(L.c).setR(n);
      return;
    case "negc":
      f.i32(0).R(m).op(OP.sub).set(L.tmp2).get(L.tmp2).get(L.t).op(OP.sub).set(L.c);
      f.get(L.tmp2).i32(0).op(OP.ne).get(L.tmp2).get(L.c).op(OP.ltu).op(OP.or).set(L.t).get(L.c).setR(n);
      return;
    case "cmpeq": f.R(n).R(m).op(OP.eq); toT(); return;
    case "cmphs": f.R(n).R(m).op(OP.geu); toT(); return;
    case "cmpge": f.R(n).R(m).op(OP.ges); toT(); return;
    case "cmphi": f.R(n).R(m).op(OP.gtu); toT(); return;
    case "cmpgt": f.R(n).R(m).op(OP.gts); toT(); return;
    case "cmppl": f.R(n).i32(0).op(OP.gts); toT(); return;
    case "cmppz": f.R(n).i32(0).op(OP.ges); toT(); return;
    case "cmpeqi": f.R(0).i32(ins.imm).op(OP.eq); toT(); return;
    case "neg": f.i32(0).R(m).op(OP.sub).setR(n); return;
    case "not": f.R(m).i32(-1).op(OP.xor).setR(n); return;
    case "extub": f.R(m).i32(0xff).op(OP.and).setR(n); return;
    case "extuw": f.R(m).i32(0xffff).op(OP.and).setR(n); return;
    case "extsb": f.R(m).op(OP.ext8).setR(n); return;
    case "extsw": f.R(m).op(OP.ext16).setR(n); return;
    case "swapb":
      f.R(m).i32(0xffff0000).op(OP.and).R(m).i32(0xff).op(OP.and).i32(8).op(OP.shl).op(OP.or)
        .R(m).i32(8).op(OP.shru).i32(0xff).op(OP.and).op(OP.or).setR(n);
      return;
    case "swapw": f.R(m).i32(16).op(OP.rotl).setR(n); return;
    case "xtrct": f.R(m).i32(16).op(OP.shl).R(n).i32(16).op(OP.shru).op(OP.or).setR(n); return;
    case "and": bin(OP.and); return;
    case "or": bin(OP.or); return;
    case "xor": bin(OP.xor); return;
    case "tst": f.R(n).R(m).op(OP.and).op(OP.eqz); toT(); return;
    case "andi": f.R(0).i32(ins.imm).op(OP.and).setR(0); return;
    case "ori": f.R(0).i32(ins.imm).op(OP.or).setR(0); return;
    case "xori": f.R(0).i32(ins.imm).op(OP.xor).setR(0); return;
    case "tsti": f.R(0).i32(ins.imm).op(OP.and).op(OP.eqz); toT(); return;
    case "mull": f.R(n).R(m).op(OP.mul).set(L.macl); return;
    case "mulsw": f.R(n).op(OP.ext16).R(m).op(OP.ext16).op(OP.mul).set(L.macl); return;
    case "muluw": f.R(n).i32(0xffff).op(OP.and).R(m).i32(0xffff).op(OP.and).op(OP.mul).set(L.macl); return;
    case "dmuls": f.R(n).op(OP.extS).R(m).op(OP.extS).op(OP.i64mul).set(L.x); setMacFrom(f, L.x); return;
    case "dmulu": f.R(n).op(OP.extU).R(m).op(OP.extU).op(OP.i64mul).set(L.x); setMacFrom(f, L.x); return;
    case "div0s":
      f.R(n).i32(31).op(OP.shru).set(L.q).R(m).i32(31).op(OP.shru).set(L.m).get(L.q).get(L.m).op(OP.xor).set(L.t);
      return;
    case "div1":
      // As the runtime's sh2_div1: rm is read after rn has been shifted.
      f.get(L.q).set(L.tmp);                                            // old Q
      f.R(n).i32(31).op(OP.shru).set(L.q);
      f.R(n).i32(1).op(OP.shl).get(L.t).op(OP.or).setR(n);
      f.R(n).set(L.tmp2);                                               // tmp0
      f.get(L.tmp).get(L.m).op(OP.eq).op(OP.if, OP.void);
      f.R(n).R(m).op(OP.sub).setR(n).R(n).get(L.tmp2).op(OP.gtu).set(L.c);
      f.op(OP.else).R(n).R(m).op(OP.add).setR(n).R(n).get(L.tmp2).op(OP.ltu).set(L.c).op(OP.end);
      f.get(L.q).get(L.c).op(OP.xor).get(L.m).op(OP.xor).set(L.q);      // Q ^ tmp1 ^ M
      f.get(L.q).get(L.m).op(OP.eq).set(L.t);
      return;
    case "macl": {
      f.R(n).call(F.ld32).op(OP.extS).set(L.y).R(n).i32(4).op(OP.add).setR(n);
      f.R(m).call(F.ld32).op(OP.extS).get(L.y).op(OP.i64mul).set(L.y);   // y = a * b
      pushMac(f); f.set(L.x);                                             // x = mac
      f.get(L.x).get(L.y).op(OP.i64add).set(L.z);                         // z = x + y (wrapping)
      f.R(m).i32(4).op(OP.add).setR(m);
      f.get(L.s).op(OP.if, OP.void);
      // Overflow of the 64-bit add: the true sum is beyond either 48-bit bound.
      f.get(L.x).get(L.z).op(OP.i64xor).get(L.y).get(L.z).op(OP.i64xor).op(OP.i64and).i64(0).op(OP.i64lts);
      f.op(OP.if, OP.void);
      f.get(L.y).i64(0).op(OP.i64gts).op(OP.if, OP.void).i64((1n << 47n) - 1n).set(L.z)
        .op(OP.else).i64(-(1n << 47n)).set(L.z).op(OP.end);
      f.op(OP.else);
      f.get(L.z).i64((1n << 47n) - 1n).op(OP.i64gts).op(OP.if, OP.void).i64((1n << 47n) - 1n).set(L.z).op(OP.end);
      f.get(L.z).i64(-(1n << 47n)).op(OP.i64lts).op(OP.if, OP.void).i64(-(1n << 47n)).set(L.z).op(OP.end);
      f.op(OP.end).op(OP.end);
      setMacFrom(f, L.z);
      return;
    }
    case "macw": {
      f.R(n).call(F.ld16).op(OP.ext16).set(L.tmp).R(n).i32(2).op(OP.add).setR(n);
      f.R(m).call(F.ld16).op(OP.ext16).get(L.tmp).op(OP.mul).set(L.tmp).R(m).i32(2).op(OP.add).setR(m);
      f.get(L.s).op(OP.if, OP.void);
      f.get(L.macl).op(OP.extS).get(L.tmp).op(OP.extS).op(OP.i64add).set(L.z);
      f.get(L.z).i64(0x7fffffff).op(OP.i64gts).op(OP.if, OP.void).i64(0x7fffffff).set(L.z)
        .get(L.mach).i32(1).op(OP.or).set(L.mach).op(OP.end);
      f.get(L.z).i64(-0x80000000).op(OP.i64lts).op(OP.if, OP.void).i64(-0x80000000).set(L.z)
        .get(L.mach).i32(1).op(OP.or).set(L.mach).op(OP.end);
      f.get(L.z).op(OP.wrap).set(L.macl);
      f.op(OP.else);
      pushMac(f); f.get(L.tmp).op(OP.extS).op(OP.i64add).set(L.z); setMacFrom(f, L.z);
      f.op(OP.end);
      return;
    }
    case "shll": f.R(n).i32(31).op(OP.shru).set(L.t).R(n).i32(1).op(OP.shl).setR(n); return;
    case "shlr": f.R(n).i32(1).op(OP.and).set(L.t).R(n).i32(1).op(OP.shru).setR(n); return;
    case "shar": f.R(n).i32(1).op(OP.and).set(L.t).R(n).i32(1).op(OP.shrs).setR(n); return;
    case "rotl": f.R(n).i32(31).op(OP.shru).set(L.t).R(n).i32(1).op(OP.rotl).setR(n); return;
    case "rotr": f.R(n).i32(1).op(OP.and).set(L.t).R(n).i32(1).op(OP.rotr).setR(n); return;
    case "rotcl":
      f.R(n).i32(31).op(OP.shru).set(L.tmp).R(n).i32(1).op(OP.shl).get(L.t).op(OP.or).setR(n).get(L.tmp).set(L.t);
      return;
    case "rotcr":
      f.R(n).i32(1).op(OP.and).set(L.tmp).R(n).i32(1).op(OP.shru).get(L.t).i32(31).op(OP.shl).op(OP.or).setR(n)
        .get(L.tmp).set(L.t);
      return;
    case "shll2": f.R(n).i32(2).op(OP.shl).setR(n); return;
    case "shll8": f.R(n).i32(8).op(OP.shl).setR(n); return;
    case "shll16": f.R(n).i32(16).op(OP.shl).setR(n); return;
    case "shlr2": f.R(n).i32(2).op(OP.shru).setR(n); return;
    case "shlr8": f.R(n).i32(8).op(OP.shru).setR(n); return;
    case "shlr16": f.R(n).i32(16).op(OP.shru).setR(n); return;
    case "dt": f.R(n).i32(1).op(OP.sub).setR(n).R(n).op(OP.eqz).set(L.t); return;
    case "movt": f.get(L.t).setR(n); return;
    case "tas":
      f.R(n).set(L.tmp).get(L.tmp).call(F.ld8).set(L.tmp2).get(L.tmp2).op(OP.eqz).set(L.t);
      store(f, 1, () => f.get(L.tmp), () => f.get(L.tmp2).i32(0x80).op(OP.or));
      return;
    case "stcsr": pushSr(f); f.setR(n); return;
    case "ldcsr": f.R(n).set(L.tmp); setSrFrom(f, L.tmp); return true;
    case "stcsrdec":
      f.R(n).i32(4).op(OP.sub).setR(n);
      store(f, 4, () => f.R(n), () => pushSr(f));
      return;
    case "ldcsrinc": f.R(n).call(F.ld32).set(L.tmp).R(n).i32(4).op(OP.add).setR(n); setSrFrom(f, L.tmp); return true;
    case "ldwpc": f.i32(ins.target); loadS(f, 2); f.setR(n); return;
    case "ldlpc": f.i32(ins.target); loadU(f, 4); f.setR(n); return;
    case "mova": f.i32(ins.target).setR(0); return;
    case "trapa": f.spill().get(L.ctx).i32(ins.imm).i32(pc).call(F.trapa).reload(); return;
  }
  let match;
  if ((match = /^sts(mach|macl|pr)$/.exec(k)) || (match = /^stc(gbr|vbr)$/.exec(k))) { f.get(PAIR_REGS[match[1]]).setR(n); return; }
  if ((match = /^lds(mach|macl|pr)$/.exec(k)) || (match = /^ldc(gbr|vbr)$/.exec(k))) { f.R(n).set(PAIR_REGS[match[1]]); return; }
  if ((match = /^sts(mach|macl|pr)dec$/.exec(k)) || (match = /^stc(gbr|vbr)dec$/.exec(k))) {
    f.R(n).i32(4).op(OP.sub).setR(n);
    store(f, 4, () => f.R(n), () => f.get(PAIR_REGS[match[1]]));
    return;
  }
  if ((match = /^lds(mach|macl|pr)inc$/.exec(k)) || (match = /^ldc(gbr|vbr)inc$/.exec(k))) {
    f.R(n).call(F.ld32).set(PAIR_REGS[match[1]]).R(n).i32(4).op(OP.add).setR(n);
    return;
  }
  if ((match = /^st([bwl])$/.exec(k))) { store(f, SIZE[match[1]], () => f.R(n), () => f.R(m)); return; }
  if ((match = /^ld([bwl])$/.exec(k))) { f.R(m); loadS(f, SIZE[match[1]]); f.setR(n); return; }
  if ((match = /^st([bwl])dec$/.exec(k))) {
    const s = SIZE[match[1]];
    f.R(n).i32(s).op(OP.sub).setR(n);
    store(f, s, () => f.R(n), () => f.R(m));
    return;
  }
  if ((match = /^ld([bwl])inc$/.exec(k))) {
    const s = SIZE[match[1]];
    f.R(m); loadS(f, s); f.set(L.tmp);
    if (n !== m) f.R(m).i32(s).op(OP.add).setR(m);
    f.get(L.tmp).setR(n);
    return;
  }
  if ((match = /^st([bwl])r0$/.exec(k))) { store(f, SIZE[match[1]], () => f.R(0).R(n).op(OP.add), () => f.R(m)); return; }
  if ((match = /^ld([bwl])r0$/.exec(k))) { f.R(0).R(m).op(OP.add); loadS(f, SIZE[match[1]]); f.setR(n); return; }
  if ((match = /^st([bwl])gbr$/.exec(k))) {
    store(f, SIZE[match[1]], () => f.get(L.gbr).i32(ins.imm).op(OP.add), () => f.R(0)); return;
  }
  if ((match = /^ld([bwl])gbr$/.exec(k))) { f.get(L.gbr).i32(ins.imm).op(OP.add); loadS(f, SIZE[match[1]]); f.setR(0); return; }
  if ((match = /^(and|or|xor)bg$/.exec(k))) {
    const code = { and: OP.and, or: OP.or, xor: OP.xor }[match[1]];
    f.R(0).get(L.gbr).op(OP.add).set(L.tmp);
    store(f, 1, () => f.get(L.tmp), () => f.get(L.tmp).call(F.ld8).i32(ins.imm).op(code));
    return;
  }
  if (k === "tstbg") { f.R(0).get(L.gbr).op(OP.add).call(F.ld8).i32(ins.imm).op(OP.and).op(OP.eqz).set(L.t); return; }
  if (k === "stldisp") { store(f, 4, () => f.R(n).i32(ins.imm).op(OP.add), () => f.R(m)); return; }
  if (k === "ldldisp") { f.R(m).i32(ins.imm).op(OP.add); loadU(f, 4); f.setR(n); return; }
  if (k === "stbdisp") { store(f, 1, () => f.R(n).i32(ins.imm).op(OP.add), () => f.R(0)); return; }
  if (k === "stwdisp") { store(f, 2, () => f.R(n).i32(ins.imm).op(OP.add), () => f.R(0)); return; }
  if (k === "ldbdisp") { f.R(m).i32(ins.imm).op(OP.add); loadS(f, 1); f.setR(0); return; }
  if (k === "ldwdisp") { f.R(m).i32(ins.imm).op(OP.add); loadS(f, 2); f.setR(0); return; }
  throw Error(`emitter cannot translate ${k} at ${hex(pc)}`);
}

// ---- functions ----------------------------------------------------------------------

// Splits a function into basic blocks, in address order.
function blocksOf(code, entry) {
  const leaders = new Set([entry >>> 0]);
  for (const [pc, ins] of code) {
    if (ins.slot) continue;
    const k = ins.kind;
    if (k === "bt" || k === "bf") { leaders.add(ins.target); leaders.add(pc + 2); }
    else if (k === "bts" || k === "bfs") { leaders.add(ins.target); leaders.add(pc + 4); }
    else if (k === "bra") leaders.add(ins.target);
    else if (k === "bsr" || k === "jsr") leaders.add(pc + 4);
  }
  const starts = [...leaders].filter((pc) => code.has(pc)).sort((a, b) => a - b);
  const index = new Map(starts.map((pc, i) => [pc, i]));
  const blocks = starts.map((start, i) => {
    const list = [];
    let pc = start;
    while (code.has(pc) && (pc === start || !index.has(pc))) {
      const ins = code.get(pc);
      list.push([pc, ins]);
      if (isDelayed(ins.kind)) { list.push([pc + 2, code.get(pc + 2)]); pc += 4; break; }
      pc += 2;
      if (ins.kind === "bt" || ins.kind === "bf") break;
    }
    return { start, list, next: pc, i };
  });
  return { blocks, index };
}

function translateFunction({ entry, code }, direct) {
  const { blocks, index } = blocksOf(code, entry);
  const N = blocks.length;
  const f = new Body();
  f.reload();
  f.i32(index.get(entry >>> 0)).set(L.blk);
  f.op(OP.loop, OP.void);
  for (let i = N - 1; i >= 0; i--) f.op(OP.block, OP.void);
  f.get(L.blk).op(OP.br_table);
  uleb(f.b, N);
  for (let j = 0; j < N; j++) uleb(f.b, j);
  uleb(f.b, 0);
  f.op(OP.end);

  // Leave the function through the runtime: a tail call to `target`.
  const tailCall = (pushTarget) => { f.spill().get(L.ctx); pushTarget(); f.call(F.call).op(OP.return); };

  for (const block of blocks) {
    const i = block.i;
    const toLoop = N - 1 - i;
    // Continue at `target` from a branch at `from`; `extra` = enclosing ifs.
    const jump = (from, target, extra = 0) => {
      const j = index.get(target >>> 0);
      if (target <= from) poll(f);   // a loop back-edge is a safe point
      if (j === undefined) tailCall(() => f.i32(target));
      else f.i32(j).set(L.blk).br(toLoop + extra);
    };
    let ended = false;
    for (let x = 0; x < block.list.length; x++) {
      const [pc, ins] = block.list[x];
      const k = ins.kind;
      if (k === "bt" || k === "bf") {
        f.get(L.t);
        if (k === "bf") f.op(OP.eqz);
        f.op(OP.if, OP.void); jump(pc, ins.target, 1); f.op(OP.end);
        continue;
      }
      if (!isDelayed(k)) { if (emitStep(f, ins, pc)) poll(f); continue; }
      const [slotPc, slot] = block.list[++x];
      switch (k) {
        case "bra": emitStep(f, slot, slotPc); jump(pc, ins.target); ended = true; break;
        case "bts": case "bfs":
          f.get(L.t); if (k === "bfs") f.op(OP.eqz); f.set(L.cond);
          emitStep(f, slot, slotPc);
          f.get(L.cond).op(OP.if, OP.void); jump(pc, ins.target, 1); f.op(OP.end);
          break;
        case "rts":
          f.get(L.pr).set(L.target);
          emitStep(f, slot, slotPc);
          f.spill().get(L.ctx).get(L.target).mem(OP.store, 2, CTX.pc).op(OP.return);
          ended = true; break;
        case "jmp":
          f.R(ins.n).set(L.target);
          emitStep(f, slot, slotPc);
          poll(f);
          tailCall(() => f.get(L.target));
          ended = true; break;
        case "bsr": case "jsr": {
          const ret = (pc + 4) >>> 0;
          if (k === "bsr") f.i32(ins.target); else f.R(ins.n);
          f.set(L.target).i32(ret).set(L.pr);
          emitStep(f, slot, slotPc);
          poll(f);
          f.spill();
          const callee = k === "bsr" ? direct.get(ins.target >>> 0) : undefined;
          if (callee !== undefined) f.get(L.ctx).call(callee);
          else f.get(L.ctx).get(L.target).call(F.call);
          f.reload();
          // The callee must have returned here; otherwise unwind, as the runtime's code does.
          f.ctxLoad(CTX.pc).i32(ret).op(OP.ne).op(OP.if, OP.void).op(OP.return).op(OP.end);
          break;
        }
      }
    }
    if (!ended) {
      const following = blocks[i + 1];
      if (!following || following.start !== block.next) tailCall(() => f.i32(block.next));
    }
    if (i < N - 1) f.op(OP.end);
  }
  f.op(OP.end); // loop
  f.op(OP.unreachable);
  f.op(OP.end); // function
  return f.b;
}

// ---- memory helpers -------------------------------------------------------------------

function bswap32(f, x) {
  f.get(x).i32(24).op(OP.shl)
    .get(x).i32(8).op(OP.shl).i32(0xff0000).op(OP.and).op(OP.or)
    .get(x).i32(8).op(OP.shru).i32(0xff00).op(OP.and).op(OP.or)
    .get(x).i32(24).op(OP.shru).op(OP.or);
}
const bswap16 = (f, x) => f.get(x).i32(0xff).op(OP.and).i32(8).op(OP.shl).get(x).i32(8).op(OP.shru).op(OP.or);

// Helper locals: param a = 0 (and v = 1 for stores), then k, x.
function loadHelper(size, ram) {
  const f = new Body(), K = 1, X = 2;
  const fromRam = (offset) => {
    f.get(0).i32(WRAM_INDEX).op(OP.and);
    if (size === 4) f.mem(OP.load, 0, offset).set(X), bswap32(f, X);
    else if (size === 2) f.mem(OP.load16u, 0, offset).set(X), bswap16(f, X);
    else f.mem(OP.load8u, 0, offset);
  };
  f.get(0).i32(REGION_MASK).op(OP.and).set(K);
  f.get(K).i32(WRAM_H_BASE).op(OP.eq).op(OP.if, OP.ti32); fromRam(ram.h);
  f.op(OP.else).get(K).i32(WRAM_L_BASE).op(OP.eq).op(OP.if, OP.ti32); fromRam(ram.l);
  f.op(OP.else).get(0).i32(size).call(F.ioRead);
  if (size !== 4) f.i32(size === 2 ? 0xffff : 0xff).op(OP.and);
  f.op(OP.end).op(OP.end).op(OP.end);
  return { locals: 2, body: f.b };
}
function storeHelper(size, ram) {
  const f = new Body(), K = 2, X = 3;
  const toRam = (offset) => {
    f.get(0).i32(WRAM_INDEX).op(OP.and);
    if (size === 4) bswap32(f, 1), f.mem(OP.store, 0, offset);
    else if (size === 2) f.get(1).i32(0xffff).op(OP.and).set(X), bswap16(f, X), f.mem(OP.store16, 0, offset);
    else f.get(1).mem(OP.store8, 0, offset);
  };
  f.get(0).i32(REGION_MASK).op(OP.and).set(K);
  f.get(K).i32(WRAM_H_BASE).op(OP.eq).op(OP.if, OP.void); toRam(ram.h);
  f.op(OP.else).get(K).i32(WRAM_L_BASE).op(OP.eq).op(OP.if, OP.void); toRam(ram.l);
  f.op(OP.else).get(0).get(1);
  if (size !== 4) f.i32(size === 2 ? 0xffff : 0xff).op(OP.and);
  f.i32(size).call(F.ioWrite);
  f.op(OP.end).op(OP.end).op(OP.end);
  return { locals: 2, body: f.b };
}

// ---- module -----------------------------------------------------------------------------

function section(out, id, bytes) { out.push(id); uleb(out, bytes.length); for (const b of bytes) out.push(b); }
const name = (s) => { const b = [...new TextEncoder().encode(s)]; return [b.length, ...b]; };
export const exportName = (entry) => `f_${hex(entry)}`;

// functions: [{entry, code}]; ram: {h, l} host addresses of WRAM-H and WRAM-L
// inside the shared memory. bsr targets among `functions` become direct calls.
export function translate(functions, ram) {
  const direct = new Map(functions.map((fn, j) => [fn.entry >>> 0, FIRST_FN + j]));
  const head = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  // types: 0 (i32)->()  1 (i32,i32)->()  2 (i32,i32)->i32  3 (i32,i32,i32)->()  4 (i32)->i32
  section(head, 1, [5,
    0x60, 1, 0x7f, 0,
    0x60, 2, 0x7f, 0x7f, 0,
    0x60, 2, 0x7f, 0x7f, 1, 0x7f,
    0x60, 3, 0x7f, 0x7f, 0x7f, 0,
    0x60, 1, 0x7f, 1, 0x7f]);
  const imports = [6, ...name("env"), ...name("memory"), 0x02, 0x00, 0];
  for (const [n, type] of [["sh2_call", 1], ["sh2_poll", 0], ["io_read", 2], ["io_write", 3], ["sh2_trapa", 3]]) {
    imports.push(...name("env"), ...name(n), 0x00, type);
  }
  section(head, 2, imports);
  const helpers = [loadHelper(1, ram), loadHelper(2, ram), loadHelper(4, ram), storeHelper(1, ram), storeHelper(2, ram), storeHelper(4, ram)];
  const fnTypes = [4, 4, 4, 1, 1, 1, ...functions.map(() => 0)];
  const funcSection = [];
  uleb(funcSection, fnTypes.length);
  funcSection.push(...fnTypes);
  section(head, 3, funcSection);
  const exports = [];
  uleb(exports, functions.length);
  functions.forEach((fn, j) => { exports.push(...name(exportName(fn.entry)), 0x00); uleb(exports, FIRST_FN + j); });
  section(head, 7, exports);

  const bodies = [];
  for (const h of helpers) {
    const locals = [1]; uleb(locals, h.locals); locals.push(0x7f);
    bodies.push([locals, h.body]);
  }
  for (const fn of functions) {
    const locals = [2]; uleb(locals, I32_LOCALS); locals.push(0x7f); uleb(locals, I64_LOCALS); locals.push(0x7e);
    bodies.push([locals, translateFunction(fn, direct)]);
  }
  let codeSize = 0;
  const sized = bodies.map(([locals, body]) => {
    const size = []; uleb(size, locals.length + body.length);
    codeSize += size.length + locals.length + body.length;
    return [size, locals, body];
  });
  const count = []; uleb(count, bodies.length);
  codeSize += count.length;
  head.push(10); uleb(head, codeSize);
  const result = new Uint8Array(head.length + codeSize);
  let at = 0;
  const put = (part) => { result.set(part, at); at += part.length; };
  put(head); put(count);
  for (const [size, locals, body] of sized) { put(size); put(locals); put(body); }
  return result;
}
