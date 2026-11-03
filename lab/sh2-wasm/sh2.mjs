// SH-2 decoding, function discovery and a reference interpreter for the
// client-side recompilation prototype (docs/WEB_PORT_CLIENT_RECOMP.md).
// Game-agnostic: no game bytes, addresses or tables live here.
//
// Memory model shared with emit.mjs: guest RAM is GUEST_SIZE bytes, every
// guest address is masked with GUEST_MASK, and the interpreter keeps the
// bytes in big-endian order exactly as the guest sees them.

export const GUEST_SIZE = 0x100000;
export const GUEST_MASK = GUEST_SIZE - 1;

const s8 = (v) => (v << 24) >> 24;
const s12 = (v) => (v << 20) >> 20;

// Instruction kinds that end the straight-line flow after their delay slot.
const DELAYED = new Set(["bra", "bsr", "bts", "bfs", "rts", "jmp", "jsr"]);
const TWO_REG = {
  0x6003: "mov", 0x300c: "add", 0x3008: "sub", 0x3000: "cmpeq", 0x3002: "cmphs",
  0x3003: "cmpge", 0x3006: "cmphi", 0x3007: "cmpgt", 0x600b: "neg", 0x6007: "not",
  0x600c: "extub", 0x600d: "extuw", 0x600e: "extsb", 0x600f: "extsw", 0x6008: "swapb",
  0x6009: "swapw", 0x200d: "xtrct", 0x2009: "and", 0x200b: "or", 0x200a: "xor",
  0x2008: "tst", 0x0007: "mull", 0x200f: "mulsw", 0x200e: "muluw",
  0x2000: "stb", 0x2001: "stw", 0x2002: "stl", 0x6000: "ldb", 0x6001: "ldw", 0x6002: "ldl",
  0x2004: "stbdec", 0x2005: "stwdec", 0x2006: "stldec", 0x6004: "ldbinc", 0x6005: "ldwinc", 0x6006: "ldlinc",
  0x0004: "stbr0", 0x0005: "stwr0", 0x0006: "stlr0", 0x000c: "ldbr0", 0x000d: "ldwr0", 0x000e: "ldlr0",
};
const ONE_REG = {
  0x4000: "shll", 0x4001: "shlr", 0x4021: "shar", 0x4020: "shll", 0x4004: "rotl", 0x4005: "rotr",
  0x4008: "shll2", 0x4018: "shll8", 0x4028: "shll16", 0x4009: "shlr2", 0x4019: "shlr8", 0x4029: "shlr16",
  0x4010: "dt", 0x4015: "cmppl", 0x4011: "cmppz", 0x0029: "movt", 0x001a: "stsmacl",
  0x002a: "stspr", 0x4022: "stsprdec", 0x4026: "ldsprinc", 0x402a: "ldspr", 0x402b: "jmp", 0x400b: "jsr",
};
const IMM_R0 = { 0xc900: "andi", 0xcb00: "ori", 0xca00: "xori", 0xc800: "tsti", 0x8800: "cmpeqi" };
const BRANCH8 = { 0x8900: "bt", 0x8b00: "bf", 0x8d00: "bts", 0x8f00: "bfs" };

// Returns {op, kind, n, m, imm, target} or null for an unsupported encoding.
export function decode(op, pc) {
  const n = (op >> 8) & 15, m = (op >> 4) & 15;
  const d = { op, kind: null, n, m, imm: 0, target: 0 };
  if (op === 0x0009) return { ...d, kind: "nop" };
  if (op === 0x0008) return { ...d, kind: "clrt" };
  if (op === 0x0018) return { ...d, kind: "sett" };
  if (op === 0x000b) return { ...d, kind: "rts" };
  let kind = TWO_REG[op & 0xf00f];
  if (kind) return { ...d, kind };
  kind = ONE_REG[op & 0xf0ff];
  if (kind) return { ...d, kind };
  kind = IMM_R0[op & 0xff00];
  if (kind) return { ...d, kind, imm: kind === "cmpeqi" ? s8(op) : op & 0xff };
  kind = BRANCH8[op & 0xff00];
  if (kind) return { ...d, kind, target: (pc + 4 + s8(op) * 2) >>> 0 };
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

export const isDelayed = (kind) => DELAYED.has(kind);
const IN_SLOT_FORBIDDEN = new Set(["bra", "bsr", "bts", "bfs", "rts", "jmp", "jsr", "bt", "bf", "ldwpc", "ldlpc", "mova"]);

function readOp(mem, pc) {
  const a = pc & GUEST_MASK;
  return (mem[a] << 8) | mem[a + 1];
}

// Follows control flow from `entry` and returns the decoded instructions of
// one function, keyed by address. Calls do not end the function; rts, jmp and
// unconditional branches do after their delay slot. Throws on anything the
// prototype does not translate, so callers can fall back.
export function discover(mem, entry, limit = 4096) {
  const code = new Map();
  const work = [entry >>> 0];
  while (work.length) {
    let pc = work.pop();
    while (!code.has(pc)) {
      if (code.size >= limit) throw Error(`function at ${hex(entry)} exceeds ${limit} instructions`);
      const ins = decode(readOp(mem, pc), pc);
      if (!ins) throw Error(`unsupported instruction ${hex(readOp(mem, pc), 4)} at ${hex(pc)}`);
      code.set(pc, ins);
      if (ins.kind === "bt" || ins.kind === "bf") { work.push(ins.target); pc += 2; continue; }
      if (isDelayed(ins.kind)) {
        const slot = decode(readOp(mem, pc + 2), pc + 2);
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

export function hex(v, width = 8) {
  return (v >>> 0).toString(16).toUpperCase().padStart(width, "0");
}

// ---- reference interpreter ---------------------------------------------------------

export function createState() {
  return { r: new Int32Array(16), t: 0, pr: 0, macl: 0, pc: 0 };
}

const ld8 = (mem, a) => s8(mem[a & GUEST_MASK]);
const ld16 = (mem, a) => { a &= GUEST_MASK; return ((mem[a] << 24) | (mem[a + 1] << 16)) >> 16; };
const ld32 = (mem, a) => { a &= GUEST_MASK; return (mem[a] << 24) | (mem[a + 1] << 16) | (mem[a + 2] << 8) | mem[a + 3]; };
const st8 = (mem, a, v) => { mem[a & GUEST_MASK] = v; };
const st16 = (mem, a, v) => { a &= GUEST_MASK; mem[a] = v >> 8; mem[a + 1] = v; };
const st32 = (mem, a, v) => { a &= GUEST_MASK; mem[a] = v >>> 24; mem[a + 1] = v >> 16; mem[a + 2] = v >> 8; mem[a + 3] = v; };

// Executes one non-branch instruction.
export function step(s, mem, ins, pc) {
  const r = s.r, n = ins.n, m = ins.m;
  switch (ins.kind) {
    case "nop": break;
    case "clrt": s.t = 0; break;
    case "sett": s.t = 1; break;
    case "mov": r[n] = r[m]; break;
    case "movi": r[n] = ins.imm; break;
    case "add": r[n] = r[n] + r[m]; break;
    case "addi": r[n] = r[n] + ins.imm; break;
    case "sub": r[n] = r[n] - r[m]; break;
    case "cmpeq": s.t = +(r[n] === r[m]); break;
    case "cmphs": s.t = +((r[n] >>> 0) >= (r[m] >>> 0)); break;
    case "cmpge": s.t = +(r[n] >= r[m]); break;
    case "cmphi": s.t = +((r[n] >>> 0) > (r[m] >>> 0)); break;
    case "cmpgt": s.t = +(r[n] > r[m]); break;
    case "cmppl": s.t = +(r[n] > 0); break;
    case "cmppz": s.t = +(r[n] >= 0); break;
    case "cmpeqi": s.t = +(r[0] === ins.imm); break;
    case "neg": r[n] = -r[m]; break;
    case "not": r[n] = ~r[m]; break;
    case "extub": r[n] = r[m] & 0xff; break;
    case "extuw": r[n] = r[m] & 0xffff; break;
    case "extsb": r[n] = s8(r[m]); break;
    case "extsw": r[n] = (r[m] << 16) >> 16; break;
    case "swapb": r[n] = (r[m] & 0xffff0000) | ((r[m] & 0xff) << 8) | ((r[m] >> 8) & 0xff); break;
    case "swapw": r[n] = (r[m] >>> 16) | (r[m] << 16); break;
    case "xtrct": r[n] = (r[m] << 16) | (r[n] >>> 16); break;
    case "and": r[n] &= r[m]; break;
    case "or": r[n] |= r[m]; break;
    case "xor": r[n] ^= r[m]; break;
    case "tst": s.t = +((r[n] & r[m]) === 0); break;
    case "andi": r[0] &= ins.imm; break;
    case "ori": r[0] |= ins.imm; break;
    case "xori": r[0] ^= ins.imm; break;
    case "tsti": s.t = +((r[0] & ins.imm) === 0); break;
    case "mull": s.macl = Math.imul(r[n], r[m]); break;
    case "mulsw": s.macl = Math.imul((r[n] << 16) >> 16, (r[m] << 16) >> 16); break;
    case "muluw": s.macl = Math.imul(r[n] & 0xffff, r[m] & 0xffff); break;
    case "stsmacl": r[n] = s.macl; break;
    case "shll": s.t = r[n] >>> 31; r[n] <<= 1; break;
    case "shlr": s.t = r[n] & 1; r[n] = r[n] >>> 1; break;
    case "shar": s.t = r[n] & 1; r[n] >>= 1; break;
    case "rotl": s.t = r[n] >>> 31; r[n] = (r[n] << 1) | s.t; break;
    case "rotr": s.t = r[n] & 1; r[n] = (r[n] >>> 1) | (s.t << 31); break;
    case "shll2": r[n] <<= 2; break;
    case "shll8": r[n] <<= 8; break;
    case "shll16": r[n] <<= 16; break;
    case "shlr2": r[n] = r[n] >>> 2; break;
    case "shlr8": r[n] = r[n] >>> 8; break;
    case "shlr16": r[n] = r[n] >>> 16; break;
    case "dt": r[n] = r[n] - 1; s.t = +(r[n] === 0); break;
    case "movt": r[n] = s.t; break;
    case "stspr": r[n] = s.pr; break;
    case "ldspr": s.pr = r[n] >>> 0; break;
    case "stsprdec": r[n] -= 4; st32(mem, r[n], s.pr); break;
    case "ldsprinc": s.pr = ld32(mem, r[n]) >>> 0; r[n] += 4; break;
    case "stb": st8(mem, r[n], r[m]); break;
    case "stw": st16(mem, r[n], r[m]); break;
    case "stl": st32(mem, r[n], r[m]); break;
    case "ldb": r[n] = ld8(mem, r[m]); break;
    case "ldw": r[n] = ld16(mem, r[m]); break;
    case "ldl": r[n] = ld32(mem, r[m]); break;
    case "stbdec": r[n] -= 1; st8(mem, r[n], r[m]); break;
    case "stwdec": r[n] -= 2; st16(mem, r[n], r[m]); break;
    case "stldec": r[n] -= 4; st32(mem, r[n], r[m]); break;
    case "ldbinc": { const v = ld8(mem, r[m]); if (n !== m) r[m] += 1; r[n] = v; break; }
    case "ldwinc": { const v = ld16(mem, r[m]); if (n !== m) r[m] += 2; r[n] = v; break; }
    case "ldlinc": { const v = ld32(mem, r[m]); if (n !== m) r[m] += 4; r[n] = v; break; }
    case "stbr0": st8(mem, r[0] + r[n], r[m]); break;
    case "stwr0": st16(mem, r[0] + r[n], r[m]); break;
    case "stlr0": st32(mem, r[0] + r[n], r[m]); break;
    case "ldbr0": r[n] = ld8(mem, r[0] + r[m]); break;
    case "ldwr0": r[n] = ld16(mem, r[0] + r[m]); break;
    case "ldlr0": r[n] = ld32(mem, r[0] + r[m]); break;
    case "stldisp": st32(mem, r[n] + ins.imm, r[m]); break;
    case "ldldisp": r[n] = ld32(mem, r[m] + ins.imm); break;
    case "stbdisp": st8(mem, r[n] + ins.imm, r[0]); break;
    case "stwdisp": st16(mem, r[n] + ins.imm, r[0]); break;
    case "ldbdisp": r[0] = ld8(mem, r[m] + ins.imm); break;
    case "ldwdisp": r[0] = ld16(mem, r[m] + ins.imm); break;
    case "ldwpc": r[n] = ld16(mem, ins.target); break;
    case "ldlpc": r[n] = ld32(mem, ins.target); break;
    case "mova": r[0] = ins.target; break;
    default: throw Error(`interpreter cannot step ${ins.kind} at ${hex(pc)}`);
  }
}

// Runs one discovered function to its exit. `call(target, state)` is the host
// hook for jsr/bsr and returns when the callee returns. Leaves s.pc at the
// address control continues at (the rts target, a jmp target or an address
// outside the function).
export function interpret(s, mem, code, entry, call, maxSteps = 1e8) {
  let pc = entry >>> 0;
  for (let steps = 0; steps < maxSteps; steps++) {
    const ins = code.get(pc);
    if (!ins) { s.pc = pc; return; }
    const k = ins.kind;
    if (k === "bt" || k === "bf") { pc = (k === "bt") === !!s.t ? ins.target : pc + 2; continue; }
    if (!isDelayed(k)) { step(s, mem, ins, pc); pc += 2; continue; }
    const slot = code.get(pc + 2);
    let target;
    switch (k) {
      case "bra": target = ins.target; break;
      case "bts": target = s.t ? ins.target : pc + 4; break;
      case "bfs": target = s.t ? pc + 4 : ins.target; break;
      case "rts": target = s.pr; break;
      case "jmp": target = s.r[ins.n] >>> 0; break;
      case "bsr": target = ins.target; s.pr = pc + 4; break;
      case "jsr": target = s.r[ins.n] >>> 0; s.pr = pc + 4; break;
    }
    step(s, mem, slot, pc + 2);
    if (k === "bsr" || k === "jsr") { call(target >>> 0, s); pc += 4; continue; }
    if (k === "rts" || k === "jmp") { s.pc = target >>> 0; return; }
    pc = target >>> 0;
  }
  throw Error("interpreter step limit reached");
}
