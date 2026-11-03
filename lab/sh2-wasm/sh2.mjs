// SH-2 decoding, function discovery and a whole-program reference interpreter
// for the client-side recompilation prototype (docs/WEB_PORT_CLIENT_RECOMP.md).
// Game-agnostic: no game bytes, addresses or tables live here.
//
// The machine model follows the saturn-recomp runtime's view of the SH-2: two
// 1 MiB work RAMs kept in guest (big-endian) byte order at 0x00200000 and
// 0x06000000 (plus their cache-through mirrors), every other address handed to
// an I/O callback, and SR kept as separate T, S, Q, M and IMASK fields.

export const SENTINEL = 0xfffffff0;           // return address of the outermost call
export const WRAM_SIZE = 0x100000;
export const WRAM_INDEX = WRAM_SIZE - 1;
export const REGION_MASK = 0xdff00000;
export const WRAM_H_BASE = 0x06000000;
export const WRAM_L_BASE = 0x00200000;

const s8 = (v) => (v << 24) >> 24;
const s12 = (v) => (v << 20) >> 20;
const s16 = (v) => (v << 16) >> 16;

const ZERO_OP = {
  0x0009: "nop", 0x0008: "clrt", 0x0018: "sett", 0x000b: "rts", 0x0019: "div0u", 0x0028: "clrmac",
};
const TWO_REG = {
  0x6003: "mov", 0x300c: "add", 0x3008: "sub", 0x300e: "addc", 0x300a: "subc", 0x600a: "negc",
  0x3000: "cmpeq", 0x3002: "cmphs", 0x3003: "cmpge", 0x3006: "cmphi", 0x3007: "cmpgt",
  0x600b: "neg", 0x6007: "not", 0x600c: "extub", 0x600d: "extuw", 0x600e: "extsb", 0x600f: "extsw",
  0x6008: "swapb", 0x6009: "swapw", 0x200d: "xtrct", 0x2009: "and", 0x200b: "or", 0x200a: "xor",
  0x2008: "tst", 0x0007: "mull", 0x200f: "mulsw", 0x200e: "muluw", 0x300d: "dmuls", 0x3005: "dmulu",
  0x2007: "div0s", 0x3004: "div1", 0x000f: "macl", 0x400f: "macw",
  0x2000: "stb", 0x2001: "stw", 0x2002: "stl", 0x6000: "ldb", 0x6001: "ldw", 0x6002: "ldl",
  0x2004: "stbdec", 0x2005: "stwdec", 0x2006: "stldec", 0x6004: "ldbinc", 0x6005: "ldwinc", 0x6006: "ldlinc",
  0x0004: "stbr0", 0x0005: "stwr0", 0x0006: "stlr0", 0x000c: "ldbr0", 0x000d: "ldwr0", 0x000e: "ldlr0",
};
const ONE_REG = {
  0x4000: "shll", 0x4020: "shll", 0x4001: "shlr", 0x4021: "shar", 0x4004: "rotl", 0x4005: "rotr",
  0x4024: "rotcl", 0x4025: "rotcr",
  0x4008: "shll2", 0x4018: "shll8", 0x4028: "shll16", 0x4009: "shlr2", 0x4019: "shlr8", 0x4029: "shlr16",
  0x4010: "dt", 0x4015: "cmppl", 0x4011: "cmppz", 0x0029: "movt", 0x401b: "tas",
  0x000a: "stsmach", 0x001a: "stsmacl", 0x002a: "stspr",
  0x400a: "ldsmach", 0x401a: "ldsmacl", 0x402a: "ldspr",
  0x4002: "stsmachdec", 0x4012: "stsmacldec", 0x4022: "stsprdec",
  0x4006: "ldsmachinc", 0x4016: "ldsmaclinc", 0x4026: "ldsprinc",
  0x0002: "stcsr", 0x0012: "stcgbr", 0x0022: "stcvbr",
  0x400e: "ldcsr", 0x401e: "ldcgbr", 0x402e: "ldcvbr",
  0x4003: "stcsrdec", 0x4013: "stcgbrdec", 0x4023: "stcvbrdec",
  0x4007: "ldcsrinc", 0x4017: "ldcgbrinc", 0x4027: "ldcvbrinc",
  0x402b: "jmp", 0x400b: "jsr",
};
const IMM8 = {
  0xc900: "andi", 0xcb00: "ori", 0xca00: "xori", 0xc800: "tsti", 0x8800: "cmpeqi",
  0xcd00: "andbg", 0xcf00: "orbg", 0xce00: "xorbg", 0xcc00: "tstbg", 0xc300: "trapa",
  0xc000: "stbgbr", 0xc100: "stwgbr", 0xc200: "stlgbr", 0xc400: "ldbgbr", 0xc500: "ldwgbr", 0xc600: "ldlgbr",
};
const GBR_SCALE = { stbgbr: 1, stwgbr: 2, stlgbr: 4, ldbgbr: 1, ldwgbr: 2, ldlgbr: 4 };
const BRANCH8 = { 0x8900: "bt", 0x8b00: "bf", 0x8d00: "bts", 0x8f00: "bfs" };

// Returns {op, kind, n, m, imm, target} or null for an unsupported encoding.
export function decode(op, pc) {
  const n = (op >> 8) & 15, m = (op >> 4) & 15;
  const d = { op, kind: null, n, m, imm: 0, target: 0 };
  let kind = ZERO_OP[op];
  if (kind) return { ...d, kind };
  if ((kind = TWO_REG[op & 0xf00f])) return { ...d, kind };
  if ((kind = ONE_REG[op & 0xf0ff])) return { ...d, kind };
  if ((kind = IMM8[op & 0xff00])) {
    const imm = kind === "cmpeqi" ? s8(op) : (op & 0xff) * (GBR_SCALE[kind] ?? 1);
    return { ...d, kind, imm };
  }
  if ((kind = BRANCH8[op & 0xff00])) return { ...d, kind, target: (pc + 4 + s8(op) * 2) >>> 0 };
  switch (op & 0xf000) {
    case 0xe000: return { ...d, kind: "movi", imm: s8(op) };
    case 0x7000: return { ...d, kind: "addi", imm: s8(op) };
    case 0x9000: return { ...d, kind: "ldwpc", target: (pc + 4 + (op & 0xff) * 2) >>> 0 };
    case 0xd000: return { ...d, kind: "ldlpc", target: ((pc & ~3) + 4 + (op & 0xff) * 4) >>> 0 };
    case 0x1000: return { ...d, kind: "stldisp", imm: (op & 15) * 4 };
    case 0x5000: return { ...d, kind: "ldldisp", imm: (op & 15) * 4 };
    case 0xa000: return { ...d, kind: "bra", target: (pc + 4 + s12(op) * 2) >>> 0 };
    case 0xb000: return { ...d, kind: "bsr", target: (pc + 4 + s12(op) * 2) >>> 0 };
  }
  switch (op & 0xff00) {
    case 0x8000: return { ...d, kind: "stbdisp", n: m, imm: op & 15 };
    case 0x8100: return { ...d, kind: "stwdisp", n: m, imm: (op & 15) * 2 };
    case 0x8400: return { ...d, kind: "ldbdisp", m, imm: op & 15 };
    case 0x8500: return { ...d, kind: "ldwdisp", m, imm: (op & 15) * 2 };
    case 0xc700: return { ...d, kind: "mova", target: ((pc & ~3) + 4 + (op & 0xff) * 4) >>> 0 };
  }
  return null;
}

const DELAYED = new Set(["bra", "bsr", "bts", "bfs", "rts", "jmp", "jsr"]);
export const isDelayed = (kind) => DELAYED.has(kind);
const IN_SLOT_FORBIDDEN = new Set([...DELAYED, "bt", "bf", "ldwpc", "ldlpc", "mova", "trapa"]);

export function hex(v, width = 8) {
  return (v >>> 0).toString(16).toUpperCase().padStart(width, "0");
}

// ---- machine ----------------------------------------------------------------------

export function createMachine({ ioRead = () => 0, ioWrite = () => {}, trapa = () => {} } = {}) {
  return {
    r: new Uint32Array(16), t: 0, s: 0, q: 0, m: 0, imask: 0,
    gbr: 0, vbr: 0, mach: 0, macl: 0, pr: 0, pc: 0,
    wramH: new Uint8Array(WRAM_SIZE), wramL: new Uint8Array(WRAM_SIZE),
    ioRead, ioWrite, trapa,
  };
}

function ram(m, a) {
  const k = (a & REGION_MASK) >>> 0;
  if (k === WRAM_H_BASE) return m.wramH;
  if (k === WRAM_L_BASE) return m.wramL;
  return null;
}
export function ld8(m, a) { const b = ram(m, a); return b ? b[a & WRAM_INDEX] : m.ioRead(a >>> 0, 1) & 0xff; }
export function ld16(m, a) {
  const b = ram(m, a), i = a & WRAM_INDEX;
  return b ? (b[i] << 8) | b[i + 1] : m.ioRead(a >>> 0, 2) & 0xffff;
}
export function ld32(m, a) {
  const b = ram(m, a), i = a & WRAM_INDEX;
  return b ? ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0 : m.ioRead(a >>> 0, 4) >>> 0;
}
export function st8(m, a, v) { const b = ram(m, a); if (b) b[a & WRAM_INDEX] = v; else m.ioWrite(a >>> 0, v & 0xff, 1); }
export function st16(m, a, v) {
  const b = ram(m, a), i = a & WRAM_INDEX;
  if (b) { b[i] = v >> 8; b[i + 1] = v; } else m.ioWrite(a >>> 0, v & 0xffff, 2);
}
export function st32(m, a, v) {
  const b = ram(m, a), i = a & WRAM_INDEX;
  if (b) { b[i] = v >>> 24; b[i + 1] = v >> 16; b[i + 2] = v >> 8; b[i + 3] = v; } else m.ioWrite(a >>> 0, v >>> 0, 4);
}
export const getSr = (m) => ((m.m << 9) | (m.q << 8) | (m.imask << 4) | (m.s << 1) | m.t) >>> 0;
export function setSr(m, v) {
  m.m = (v >>> 9) & 1; m.q = (v >>> 8) & 1; m.imask = (v >>> 4) & 15; m.s = (v >>> 1) & 1; m.t = v & 1;
}

// Instruction fetch: code only runs from the work RAMs.
export function fetch(m, pc) {
  const b = ram(m, pc);
  if (!b) throw Error(`instruction fetch outside the work RAMs at ${hex(pc)}`);
  const i = pc & WRAM_INDEX;
  return (b[i] << 8) | b[i + 1];
}

// Follows control flow from `entry` and returns the decoded instructions of
// one function, keyed by address. Calls do not end the function; rts and jmp
// do after their delay slot. Branch targets beyond `limit` instructions are
// left out; the translator turns them into tail calls.
export function discover(m, entry, limit = 4096) {
  const code = new Map();
  const work = [entry >>> 0];
  while (work.length) {
    let pc = work.pop();
    while (!code.has(pc) && code.size < limit) {
      const ins = decode(fetch(m, pc), pc);
      if (!ins) throw Error(`unsupported instruction ${hex(fetch(m, pc), 4)} at ${hex(pc)}`);
      code.set(pc, ins);
      if (ins.kind === "bt" || ins.kind === "bf") { work.push(ins.target); pc += 2; continue; }
      if (isDelayed(ins.kind)) {
        const slot = decode(fetch(m, pc + 2), pc + 2);
        if (!slot) throw Error(`unsupported delay slot at ${hex(pc + 2)}`);
        if (IN_SLOT_FORBIDDEN.has(slot.kind)) throw Error(`delay slot at ${hex(pc + 2)} holds ${slot.kind}`);
        code.set(pc + 2, { ...slot, slot: true });
        if (ins.kind === "bts" || ins.kind === "bfs") { work.push(ins.target); pc += 4; continue; }
        if (ins.kind === "bsr" || ins.kind === "jsr") { pc += 4; continue; }
        if (ins.kind === "bra") work.push(ins.target);
        break;
      }
      pc += 2;
    }
  }
  return code;
}

// ---- reference interpreter --------------------------------------------------------

const mul64 = (a, b) => BigInt(a) * BigInt(b);
function setMac(m, v) {
  const u = BigInt.asUintN(64, v);
  m.mach = Number(u >> 32n); m.macl = Number(u & 0xffffffffn);
}
const getMac = (m) => BigInt.asIntN(64, (BigInt(m.mach) << 32n) | BigInt(m.macl));

// Executes one instruction that is not a branch.
export function step(m, ins, pc) {
  const r = m.r, n = ins.n, k = ins.m;
  const sn = () => r[n] | 0, sm = () => r[k] | 0;
  switch (ins.kind) {
    case "nop": return;
    case "clrt": m.t = 0; return;
    case "sett": m.t = 1; return;
    case "clrmac": m.mach = 0; m.macl = 0; return;
    case "div0u": m.m = 0; m.q = 0; m.t = 0; return;
    case "mov": r[n] = r[k]; return;
    case "movi": r[n] = ins.imm; return;
    case "add": r[n] = r[n] + r[k]; return;
    case "addi": r[n] = r[n] + ins.imm; return;
    case "sub": r[n] = r[n] - r[k]; return;
    case "addc": {
      const t0 = r[n], t1 = (t0 + r[k]) >>> 0, v = (t1 + m.t) >>> 0;
      r[n] = v; m.t = +(t0 > t1 || t1 > v); return;
    }
    case "subc": {
      const t0 = r[n], t1 = (t0 - r[k]) >>> 0, v = (t1 - m.t) >>> 0;
      r[n] = v; m.t = +(t0 < t1 || t1 < v); return;
    }
    case "negc": {
      const t1 = (0 - r[k]) >>> 0, v = (t1 - m.t) >>> 0;
      r[n] = v; m.t = +(0 < t1 || t1 < v); return;
    }
    case "cmpeq": m.t = +(r[n] === r[k]); return;
    case "cmphs": m.t = +(r[n] >= r[k]); return;
    case "cmpge": m.t = +(sn() >= sm()); return;
    case "cmphi": m.t = +(r[n] > r[k]); return;
    case "cmpgt": m.t = +(sn() > sm()); return;
    case "cmppl": m.t = +(sn() > 0); return;
    case "cmppz": m.t = +(sn() >= 0); return;
    case "cmpeqi": m.t = +((r[0] | 0) === ins.imm); return;
    case "neg": r[n] = -r[k]; return;
    case "not": r[n] = ~r[k]; return;
    case "extub": r[n] = r[k] & 0xff; return;
    case "extuw": r[n] = r[k] & 0xffff; return;
    case "extsb": r[n] = s8(r[k]); return;
    case "extsw": r[n] = s16(r[k]); return;
    case "swapb": r[n] = (r[k] & 0xffff0000) | ((r[k] & 0xff) << 8) | ((r[k] >>> 8) & 0xff); return;
    case "swapw": r[n] = (r[k] >>> 16) | (r[k] << 16); return;
    case "xtrct": r[n] = (r[k] << 16) | (r[n] >>> 16); return;
    case "and": r[n] &= r[k]; return;
    case "or": r[n] |= r[k]; return;
    case "xor": r[n] ^= r[k]; return;
    case "tst": m.t = +((r[n] & r[k]) === 0); return;
    case "andi": r[0] &= ins.imm; return;
    case "ori": r[0] |= ins.imm; return;
    case "xori": r[0] ^= ins.imm; return;
    case "tsti": m.t = +((r[0] & ins.imm) === 0); return;
    case "mull": m.macl = Math.imul(r[n], r[k]) >>> 0; return;
    case "mulsw": m.macl = Math.imul(s16(r[n]), s16(r[k])) >>> 0; return;
    case "muluw": m.macl = Math.imul(r[n] & 0xffff, r[k] & 0xffff) >>> 0; return;
    case "dmuls": setMac(m, mul64(sn(), sm())); return;
    case "dmulu": setMac(m, mul64(r[n], r[k])); return;
    case "div0s": m.q = r[n] >>> 31; m.m = r[k] >>> 31; m.t = m.q ^ m.m; return;
    case "div1": {
      // As the runtime's sh2_div1: rm is read after rn has been shifted.
      const oldQ = m.q;
      m.q = r[n] >>> 31;
      r[n] = (r[n] << 1) | m.t;
      const t0 = r[n];
      let t1;
      if (oldQ === m.m) { r[n] = r[n] - r[k]; t1 = +(r[n] > t0); }
      else { r[n] = r[n] + r[k]; t1 = +(r[n] < t0); }
      m.q = m.m === 0 ? (m.q ? +!t1 : t1) : (m.q ? t1 : +!t1);
      m.t = +(m.q === m.m);
      return;
    }
    case "macl": {
      const a = ld32(m, r[n]) | 0; r[n] += 4;
      const b = ld32(m, r[k]) | 0; r[k] += 4;
      let acc = getMac(m) + mul64(a, b);
      if (m.s) {
        const hi = (1n << 47n) - 1n, lo = -(1n << 47n);
        if (acc > hi) acc = hi;
        if (acc < lo) acc = lo;
      }
      setMac(m, acc); return;
    }
    case "macw": {
      const a = s16(ld16(m, r[n])); r[n] += 2;
      const b = s16(ld16(m, r[k])); r[k] += 2;
      const p = BigInt(a * b);
      if (m.s) {
        let acc = BigInt(m.macl | 0) + p;
        if (acc > 0x7fffffffn) { acc = 0x7fffffffn; m.mach |= 1; }
        else if (acc < -0x80000000n) { acc = -0x80000000n; m.mach |= 1; }
        m.macl = Number(BigInt.asUintN(32, acc));
      } else setMac(m, getMac(m) + p);
      return;
    }
    case "stsmach": r[n] = m.mach; return;
    case "stsmacl": r[n] = m.macl; return;
    case "stspr": r[n] = m.pr; return;
    case "ldsmach": m.mach = r[n]; return;
    case "ldsmacl": m.macl = r[n]; return;
    case "ldspr": m.pr = r[n]; return;
    case "stsmachdec": r[n] -= 4; st32(m, r[n], m.mach); return;
    case "stsmacldec": r[n] -= 4; st32(m, r[n], m.macl); return;
    case "stsprdec": r[n] -= 4; st32(m, r[n], m.pr); return;
    case "ldsmachinc": m.mach = ld32(m, r[n]); r[n] += 4; return;
    case "ldsmaclinc": m.macl = ld32(m, r[n]); r[n] += 4; return;
    case "ldsprinc": m.pr = ld32(m, r[n]); r[n] += 4; return;
    case "stcsr": r[n] = getSr(m); return;
    case "stcgbr": r[n] = m.gbr; return;
    case "stcvbr": r[n] = m.vbr; return;
    case "ldcsr": setSr(m, r[n]); return;
    case "ldcgbr": m.gbr = r[n]; return;
    case "ldcvbr": m.vbr = r[n]; return;
    case "stcsrdec": r[n] -= 4; st32(m, r[n], getSr(m)); return;
    case "stcgbrdec": r[n] -= 4; st32(m, r[n], m.gbr); return;
    case "stcvbrdec": r[n] -= 4; st32(m, r[n], m.vbr); return;
    case "ldcsrinc": setSr(m, ld32(m, r[n])); r[n] += 4; return;
    case "ldcgbrinc": m.gbr = ld32(m, r[n]); r[n] += 4; return;
    case "ldcvbrinc": m.vbr = ld32(m, r[n]); r[n] += 4; return;
    case "shll": m.t = r[n] >>> 31; r[n] <<= 1; return;
    case "shlr": m.t = r[n] & 1; r[n] >>>= 1; return;
    case "shar": m.t = r[n] & 1; r[n] = (r[n] | 0) >> 1; return;
    case "rotl": m.t = r[n] >>> 31; r[n] = (r[n] << 1) | m.t; return;
    case "rotr": m.t = r[n] & 1; r[n] = (r[n] >>> 1) | (m.t << 31); return;
    case "rotcl": { const t = r[n] >>> 31; r[n] = (r[n] << 1) | m.t; m.t = t; return; }
    case "rotcr": { const t = r[n] & 1; r[n] = (r[n] >>> 1) | (m.t << 31); m.t = t; return; }
    case "shll2": r[n] <<= 2; return;
    case "shll8": r[n] <<= 8; return;
    case "shll16": r[n] <<= 16; return;
    case "shlr2": r[n] >>>= 2; return;
    case "shlr8": r[n] >>>= 8; return;
    case "shlr16": r[n] >>>= 16; return;
    case "dt": r[n] -= 1; m.t = +(r[n] === 0); return;
    case "movt": r[n] = m.t; return;
    case "tas": { const v = ld8(m, r[n]); m.t = +(v === 0); st8(m, r[n], v | 0x80); return; }
    case "stb": st8(m, r[n], r[k]); return;
    case "stw": st16(m, r[n], r[k]); return;
    case "stl": st32(m, r[n], r[k]); return;
    case "ldb": r[n] = s8(ld8(m, r[k])); return;
    case "ldw": r[n] = s16(ld16(m, r[k])); return;
    case "ldl": r[n] = ld32(m, r[k]); return;
    case "stbdec": r[n] -= 1; st8(m, r[n], r[k]); return;
    case "stwdec": r[n] -= 2; st16(m, r[n], r[k]); return;
    case "stldec": r[n] -= 4; st32(m, r[n], r[k]); return;
    case "ldbinc": { const v = s8(ld8(m, r[k])); if (n !== k) r[k] += 1; r[n] = v; return; }
    case "ldwinc": { const v = s16(ld16(m, r[k])); if (n !== k) r[k] += 2; r[n] = v; return; }
    case "ldlinc": { const v = ld32(m, r[k]); if (n !== k) r[k] += 4; r[n] = v; return; }
    case "stbr0": st8(m, r[0] + r[n], r[k]); return;
    case "stwr0": st16(m, r[0] + r[n], r[k]); return;
    case "stlr0": st32(m, r[0] + r[n], r[k]); return;
    case "ldbr0": r[n] = s8(ld8(m, r[0] + r[k])); return;
    case "ldwr0": r[n] = s16(ld16(m, r[0] + r[k])); return;
    case "ldlr0": r[n] = ld32(m, r[0] + r[k]); return;
    case "stldisp": st32(m, r[n] + ins.imm, r[k]); return;
    case "ldldisp": r[n] = ld32(m, r[k] + ins.imm); return;
    case "stbdisp": st8(m, r[n] + ins.imm, r[0]); return;
    case "stwdisp": st16(m, r[n] + ins.imm, r[0]); return;
    case "ldbdisp": r[0] = s8(ld8(m, r[k] + ins.imm)); return;
    case "ldwdisp": r[0] = s16(ld16(m, r[k] + ins.imm)); return;
    case "stbgbr": st8(m, m.gbr + ins.imm, r[0]); return;
    case "stwgbr": st16(m, m.gbr + ins.imm, r[0]); return;
    case "stlgbr": st32(m, m.gbr + ins.imm, r[0]); return;
    case "ldbgbr": r[0] = s8(ld8(m, m.gbr + ins.imm)); return;
    case "ldwgbr": r[0] = s16(ld16(m, m.gbr + ins.imm)); return;
    case "ldlgbr": r[0] = ld32(m, m.gbr + ins.imm); return;
    case "andbg": { const a = r[0] + m.gbr; st8(m, a, ld8(m, a) & ins.imm); return; }
    case "orbg": { const a = r[0] + m.gbr; st8(m, a, ld8(m, a) | ins.imm); return; }
    case "xorbg": { const a = r[0] + m.gbr; st8(m, a, ld8(m, a) ^ ins.imm); return; }
    case "tstbg": m.t = +((ld8(m, r[0] + m.gbr) & ins.imm) === 0); return;
    case "ldwpc": r[n] = s16(ld16(m, ins.target)); return;
    case "ldlpc": r[n] = ld32(m, ins.target); return;
    case "mova": r[0] = ins.target; return;
    case "trapa": m.trapa(m, ins.imm, pc); return;
    default: throw Error(`interpreter cannot step ${ins.kind} at ${hex(pc)}`);
  }
}

// Runs from `entry` as the CPU would, calls and returns included, until control
// returns to SENTINEL. Instructions are decoded from memory as they run.
export function run(m, entry, maxSteps = 5e7) {
  let pc = entry >>> 0;
  m.pr = SENTINEL;
  for (let steps = 0; steps < maxSteps; steps++) {
    if (pc === SENTINEL) { m.pc = pc; return steps; }
    const ins = decode(fetch(m, pc), pc);
    if (!ins) throw Error(`unsupported instruction ${hex(fetch(m, pc), 4)} at ${hex(pc)}`);
    const k = ins.kind;
    if (k === "bt" || k === "bf") { pc = (k === "bt") === !!m.t ? ins.target : pc + 2; continue; }
    if (!isDelayed(k)) { step(m, ins, pc); pc += 2; continue; }
    const slot = decode(fetch(m, pc + 2), pc + 2);
    let target;
    switch (k) {
      case "bra": target = ins.target; break;
      case "bts": target = m.t ? ins.target : pc + 4; break;
      case "bfs": target = m.t ? pc + 4 : ins.target; break;
      case "rts": target = m.pr; break;
      case "jmp": target = m.r[ins.n]; break;
      case "bsr": target = ins.target; m.pr = pc + 4; break;
      case "jsr": target = m.r[ins.n]; m.pr = pc + 4; break;
    }
    step(m, slot, pc + 2);
    pc = target >>> 0;
  }
  throw Error("interpreter step limit reached");
}
