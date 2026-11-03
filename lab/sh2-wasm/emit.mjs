// Translates one discovered SH-2 function (sh2.mjs `discover`) into a
// WebAssembly module, in memory, in the browser or Node. This is the
// client-side half of docs/WEB_PORT_CLIENT_RECOMP.md: the translated code is
// produced from the user's own disc and never leaves the user's device.
//
// Module ABI (prototype):
//   imports  env.mem   memory, >= MEMORY_PAGES pages
//            env.call  (target: i32) -> ()   host hook for jsr/bsr
//   exports  run       () -> ()
// Register file at REG_BASE: r0..r15, T, PR, MACL, PC (each 4 bytes, little
// endian). `run` loads it, executes until the function exits, stores it back
// and leaves the continuation address in PC. Around every call it stores the
// registers before and reloads them after, so the host sees and may change them.
//
// Guest RAM lives at GUEST_BASE with every 32-bit word byte-swapped, so aligned
// 32-bit accesses are native loads; 16-bit accesses use address ^ 2 and 8-bit
// accesses address ^ 3. Literal-pool reads stay memory loads at run time, so a
// translated module holds no data bytes of the program it was made from.

import { GUEST_MASK, GUEST_SIZE, isDelayed, hex } from "./sh2.mjs";

export const REG_BASE = 0;
export const REG = { T: 64, PR: 68, MACL: 72, PC: 76 };
export const GUEST_BASE = 4096;
export const MEMORY_PAGES = Math.ceil((GUEST_BASE + GUEST_SIZE) / 65536);

// Locals: r0..r15 are 0..15.
const L_T = 16, L_PR = 17, L_MACL = 18, L_BLK = 19, L_NPC = 20, L_TMP = 21, L_C = 22;
const LOCAL_COUNT = 23;

const OP = {
  block: 0x02, loop: 0x03, if: 0x04, end: 0x0b, br: 0x0c, br_table: 0x0e, call: 0x10,
  get: 0x20, set: 0x21, const: 0x41,
  load: 0x28, load8s: 0x2c, load16s: 0x2e, store: 0x36, store8: 0x3a, store16: 0x3b,
  eqz: 0x45, eq: 0x46, gts: 0x4a, gtu: 0x4b, ges: 0x4e, geu: 0x4f,
  add: 0x6a, sub: 0x6b, mul: 0x6c, and: 0x71, or: 0x72, xor: 0x73, shl: 0x74, shrs: 0x75, shru: 0x76,
  rotl: 0x77, rotr: 0x78, ext8: 0xc0, ext16: 0xc1, void: 0x40,
};

function uleb(out, v) {
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
}
function sleb(out, v) {
  v |= 0;
  for (;;) {
    const b = v & 0x7f; v >>= 7;
    if ((v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40))) { out.push(b); return; }
    out.push(b | 0x80);
  }
}

class Body {
  constructor() { this.b = []; }
  op(...codes) { this.b.push(...codes); return this; }
  i32(v) { this.b.push(OP.const); sleb(this.b, v); return this; }
  get(l) { this.b.push(OP.get); uleb(this.b, l); return this; }
  set(l) { this.b.push(OP.set); uleb(this.b, l); return this; }
  br(depth) { this.b.push(OP.br); uleb(this.b, depth); return this; }
  mem(code, align, offset) { this.b.push(code); uleb(this.b, align); uleb(this.b, offset); return this; }
  // Guest address on the stack -> host address with the access-size swizzle.
  host(size) {
    this.i32(GUEST_MASK).op(OP.and);
    if (size === 2) this.i32(2).op(OP.xor);
    if (size === 1) this.i32(3).op(OP.xor);
    return this;
  }
  load(size) {
    this.host(size);
    if (size === 4) return this.mem(OP.load, 2, GUEST_BASE);
    if (size === 2) return this.mem(OP.load16s, 1, GUEST_BASE);
    return this.mem(OP.load8s, 0, GUEST_BASE);
  }
  // Expects [address, value] already on the stack; the address must have been
  // swizzled by host(size) before the value was pushed.
  storeAt(size) {
    if (size === 4) return this.mem(OP.store, 2, GUEST_BASE);
    if (size === 2) return this.mem(OP.store16, 1, GUEST_BASE);
    return this.mem(OP.store8, 0, GUEST_BASE);
  }
  loadRegs() {
    for (let i = 0; i < 16; i++) this.i32(REG_BASE).mem(OP.load, 2, 4 * i).set(i);
    this.i32(REG_BASE).mem(OP.load, 2, REG.T).set(L_T);
    this.i32(REG_BASE).mem(OP.load, 2, REG.PR).set(L_PR);
    this.i32(REG_BASE).mem(OP.load, 2, REG.MACL).set(L_MACL);
    return this;
  }
  storeRegs() {
    for (let i = 0; i < 16; i++) this.i32(REG_BASE).get(i).mem(OP.store, 2, 4 * i);
    this.i32(REG_BASE).get(L_T).mem(OP.store, 2, REG.T);
    this.i32(REG_BASE).get(L_PR).mem(OP.store, 2, REG.PR);
    this.i32(REG_BASE).get(L_MACL).mem(OP.store, 2, REG.MACL);
    return this;
  }
}

const SIZE = { b: 1, w: 2, l: 4 };

// Emits one non-branch instruction.
function emitStep(f, ins, pc) {
  const n = ins.n, m = ins.m;
  const bin = (code) => f.get(n).get(m).op(code).set(n);
  switch (ins.kind) {
    case "nop": return;
    case "clrt": f.i32(0).set(L_T); return;
    case "sett": f.i32(1).set(L_T); return;
    case "mov": f.get(m).set(n); return;
    case "movi": f.i32(ins.imm).set(n); return;
    case "add": bin(OP.add); return;
    case "addi": f.get(n).i32(ins.imm).op(OP.add).set(n); return;
    case "sub": bin(OP.sub); return;
    case "cmpeq": f.get(n).get(m).op(OP.eq).set(L_T); return;
    case "cmphs": f.get(n).get(m).op(OP.geu).set(L_T); return;
    case "cmpge": f.get(n).get(m).op(OP.ges).set(L_T); return;
    case "cmphi": f.get(n).get(m).op(OP.gtu).set(L_T); return;
    case "cmpgt": f.get(n).get(m).op(OP.gts).set(L_T); return;
    case "cmppl": f.get(n).i32(0).op(OP.gts).set(L_T); return;
    case "cmppz": f.get(n).i32(0).op(OP.ges).set(L_T); return;
    case "cmpeqi": f.get(0).i32(ins.imm).op(OP.eq).set(L_T); return;
    case "neg": f.i32(0).get(m).op(OP.sub).set(n); return;
    case "not": f.get(m).i32(-1).op(OP.xor).set(n); return;
    case "extub": f.get(m).i32(0xff).op(OP.and).set(n); return;
    case "extuw": f.get(m).i32(0xffff).op(OP.and).set(n); return;
    case "extsb": f.get(m).op(OP.ext8).set(n); return;
    case "extsw": f.get(m).op(OP.ext16).set(n); return;
    case "swapb":
      f.get(m).i32(0xffff0000 | 0).op(OP.and)
        .get(m).i32(0xff).op(OP.and).i32(8).op(OP.shl).op(OP.or)
        .get(m).i32(8).op(OP.shrs).i32(0xff).op(OP.and).op(OP.or).set(n);
      return;
    case "swapw": f.get(m).i32(16).op(OP.rotl).set(n); return;
    case "xtrct": f.get(m).i32(16).op(OP.shl).get(n).i32(16).op(OP.shru).op(OP.or).set(n); return;
    case "and": bin(OP.and); return;
    case "or": bin(OP.or); return;
    case "xor": bin(OP.xor); return;
    case "tst": f.get(n).get(m).op(OP.and).op(OP.eqz).set(L_T); return;
    case "andi": f.get(0).i32(ins.imm).op(OP.and).set(0); return;
    case "ori": f.get(0).i32(ins.imm).op(OP.or).set(0); return;
    case "xori": f.get(0).i32(ins.imm).op(OP.xor).set(0); return;
    case "tsti": f.get(0).i32(ins.imm).op(OP.and).op(OP.eqz).set(L_T); return;
    case "mull": f.get(n).get(m).op(OP.mul).set(L_MACL); return;
    case "mulsw": f.get(n).op(OP.ext16).get(m).op(OP.ext16).op(OP.mul).set(L_MACL); return;
    case "muluw": f.get(n).i32(0xffff).op(OP.and).get(m).i32(0xffff).op(OP.and).op(OP.mul).set(L_MACL); return;
    case "stsmacl": f.get(L_MACL).set(n); return;
    case "shll": f.get(n).i32(31).op(OP.shru).set(L_T).get(n).i32(1).op(OP.shl).set(n); return;
    case "shlr": f.get(n).i32(1).op(OP.and).set(L_T).get(n).i32(1).op(OP.shru).set(n); return;
    case "shar": f.get(n).i32(1).op(OP.and).set(L_T).get(n).i32(1).op(OP.shrs).set(n); return;
    case "rotl": f.get(n).i32(31).op(OP.shru).set(L_T).get(n).i32(1).op(OP.rotl).set(n); return;
    case "rotr": f.get(n).i32(1).op(OP.and).set(L_T).get(n).i32(1).op(OP.rotr).set(n); return;
    case "shll2": f.get(n).i32(2).op(OP.shl).set(n); return;
    case "shll8": f.get(n).i32(8).op(OP.shl).set(n); return;
    case "shll16": f.get(n).i32(16).op(OP.shl).set(n); return;
    case "shlr2": f.get(n).i32(2).op(OP.shru).set(n); return;
    case "shlr8": f.get(n).i32(8).op(OP.shru).set(n); return;
    case "shlr16": f.get(n).i32(16).op(OP.shru).set(n); return;
    case "dt": f.get(n).i32(1).op(OP.sub).set(n).get(n).op(OP.eqz).set(L_T); return;
    case "movt": f.get(L_T).set(n); return;
    case "stspr": f.get(L_PR).set(n); return;
    case "ldspr": f.get(n).set(L_PR); return;
    case "stsprdec":
      f.get(n).i32(4).op(OP.sub).set(n).get(n).host(4).get(L_PR).storeAt(4); return;
    case "ldsprinc":
      f.get(n).load(4).set(L_PR).get(n).i32(4).op(OP.add).set(n); return;
    case "mova": f.i32(ins.target | 0).set(0); return;
    case "ldwpc": f.i32(ins.target | 0).load(2).set(n); return;
    case "ldlpc": f.i32(ins.target | 0).load(4).set(n); return;
  }
  const k = ins.kind;
  let match;
  if ((match = /^st([bwl])$/.exec(k))) { f.get(n).host(SIZE[match[1]]).get(m).storeAt(SIZE[match[1]]); return; }
  if ((match = /^ld([bwl])$/.exec(k))) { f.get(m).load(SIZE[match[1]]).set(n); return; }
  if ((match = /^st([bwl])dec$/.exec(k))) {
    const s = SIZE[match[1]];
    f.get(n).i32(s).op(OP.sub).set(n).get(n).host(s).get(m).storeAt(s); return;
  }
  if ((match = /^ld([bwl])inc$/.exec(k))) {
    const s = SIZE[match[1]];
    f.get(m).load(s).set(L_TMP);
    if (n !== m) f.get(m).i32(s).op(OP.add).set(m);
    f.get(L_TMP).set(n); return;
  }
  if ((match = /^st([bwl])r0$/.exec(k))) {
    const s = SIZE[match[1]];
    f.get(0).get(n).op(OP.add).host(s).get(m).storeAt(s); return;
  }
  if ((match = /^ld([bwl])r0$/.exec(k))) {
    const s = SIZE[match[1]];
    f.get(0).get(m).op(OP.add).load(s).set(n); return;
  }
  if (k === "stldisp") { f.get(n).i32(ins.imm).op(OP.add).host(4).get(m).storeAt(4); return; }
  if (k === "ldldisp") { f.get(m).i32(ins.imm).op(OP.add).load(4).set(n); return; }
  if (k === "stbdisp") { f.get(n).i32(ins.imm).op(OP.add).host(1).get(0).storeAt(1); return; }
  if (k === "stwdisp") { f.get(n).i32(ins.imm).op(OP.add).host(2).get(0).storeAt(2); return; }
  if (k === "ldbdisp") { f.get(m).i32(ins.imm).op(OP.add).load(1).set(0); return; }
  if (k === "ldwdisp") { f.get(m).i32(ins.imm).op(OP.add).load(2).set(0); return; }
  throw Error(`emitter cannot translate ${k} at ${hex(pc)}`);
}

// Splits the function into basic blocks, in address order.
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

export function translate(code, entry) {
  const { blocks, index } = blocksOf(code, entry);
  const N = blocks.length;
  const f = new Body();
  f.loadRegs();
  f.i32(index.get(entry >>> 0)).set(L_BLK);
  f.op(OP.block, OP.void).op(OP.loop, OP.void);
  for (let i = N - 1; i >= 0; i--) f.op(OP.block, OP.void);
  f.get(L_BLK).op(OP.br_table);
  uleb(f.b, N);
  for (let j = 0; j < N; j++) uleb(f.b, j);
  uleb(f.b, 0);
  f.op(OP.end);

  for (const block of blocks) {
    const i = block.i;
    const toLoop = N - 1 - i, toExit = N - i;
    const jump = (target, extra = 0) => {
      const j = index.get(target >>> 0);
      if (j === undefined) f.i32(target | 0).set(L_NPC).br(toExit + extra);
      else f.i32(j).set(L_BLK).br(toLoop + extra);
    };
    let ended = false;
    for (let x = 0; x < block.list.length; x++) {
      const [pc, ins] = block.list[x];
      const k = ins.kind;
      if (k === "bt" || k === "bf") {
        f.get(L_T);
        if (k === "bf") f.op(OP.eqz);
        f.op(OP.if, OP.void); jump(ins.target, 1); f.op(OP.end);
        continue;
      }
      if (!isDelayed(k)) { emitStep(f, ins, pc); continue; }
      const [slotPc, slot] = block.list[++x];
      switch (k) {
        case "bra": emitStep(f, slot, slotPc); jump(ins.target); ended = true; break;
        case "bts": case "bfs":
          f.get(L_T); if (k === "bfs") f.op(OP.eqz); f.set(L_C);
          emitStep(f, slot, slotPc);
          f.get(L_C).op(OP.if, OP.void); jump(ins.target, 1); f.op(OP.end);
          break;
        case "rts": case "jmp":
          f.get(k === "rts" ? L_PR : ins.n).set(L_TMP);
          emitStep(f, slot, slotPc);
          f.get(L_TMP).set(L_NPC).br(toExit); ended = true; break;
        case "bsr": case "jsr":
          if (k === "bsr") f.i32(ins.target | 0); else f.get(ins.n);
          f.set(L_TMP).i32((pc + 4) | 0).set(L_PR);
          emitStep(f, slot, slotPc);
          f.storeRegs().get(L_TMP).op(OP.call, 0).loadRegs();
          break;
      }
    }
    if (!ended) {
      const following = blocks[i + 1];
      if (!following || following.start !== block.next) jump(block.next);
    }
    // Close B_{i+1}: falling out of it runs the next block's code.
    if (i < N - 1) f.op(OP.end);
  }
  f.op(OP.end); // loop
  f.op(OP.end); // exit block
  f.storeRegs().i32(REG_BASE).get(L_NPC).mem(OP.store, 2, REG.PC);
  f.op(OP.end); // function

  return module(f.b);
}

// Small header sections only; the function body is copied as a typed array so
// large translations never pass through argument spreading.
function section(out, id, bytes) {
  out.push(id); uleb(out, bytes.length); for (const b of bytes) out.push(b);
}
const name = (s) => { const b = [...new TextEncoder().encode(s)]; return [b.length, ...b]; };

function module(body) {
  const head = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  section(head, 1, [2, 0x60, 0, 0, 0x60, 1, 0x7f, 0]);
  const imports = [2, ...name("env"), ...name("mem"), 0x02, 0x00];
  uleb(imports, MEMORY_PAGES);
  imports.push(...name("env"), ...name("call"), 0x00, 1);
  section(head, 2, imports);
  section(head, 3, [1, 0]);
  section(head, 7, [1, ...name("run"), 0x00, 1]);
  const locals = [1];
  uleb(locals, LOCAL_COUNT); locals.push(0x7f);
  const fnSize = locals.length + body.length;
  const fnHeader = [1];
  uleb(fnHeader, fnSize);
  const codeSize = fnHeader.length + fnSize;
  head.push(10);
  uleb(head, codeSize);
  const result = new Uint8Array(head.length + codeSize);
  let at = 0;
  for (const part of [head, fnHeader, locals]) { result.set(part, at); at += part.length; }
  result.set(body, at);
  return result;
}

// Guest bytes (big-endian, as the interpreter keeps them) <-> word-swapped RAM.
export function swizzleInto(heap, guest) {
  for (let i = 0; i < guest.length; i++) heap[GUEST_BASE + (i ^ 3)] = guest[i];
}
export function unswizzleFrom(heap, guest) {
  for (let i = 0; i < guest.length; i++) guest[i] = heap[GUEST_BASE + (i ^ 3)];
}
