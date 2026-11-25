// Execute the small loader/selection blocks from local authenticated game executables.
// The interpreter intentionally accepts only the instructions used by these blocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const base = 0x06004000;
const sx = (x, bits) => x << (32 - bits) >> (32 - bits);
function makeMachine(game) {
  const r = new Uint32Array(16), ram = new Map();
  const b = addr => {
    if (ram.has(addr)) return ram.get(addr);
    if (addr >= base && addr - base < game.length) return game[addr - base];
    throw Error(`Unmapped read ${addr.toString(16)}`);
  };
  const w = addr => b(addr) * 256 + b(addr + 1);
  const l = addr => (w(addr) << 16 | w(addr + 2)) >>> 0;
  const put = (addr, byte) => ram.set(addr, byte & 255);
  const putLong = (addr, value) => Array.from({length: 4}, (_, i) => put(addr + i, value >>> (24 - 8 * i)));
  let T = 0;
  function step(pc, delay = false) {
    const opcode = w(pc), n = opcode >> 8 & 15, m = opcode >> 4 & 15, imm = opcode & 255;
    const tag = opcode & 0xf00f, hi = opcode & 0xff00, shift = opcode & 0xf0ff;
    const branch = (taken, delayed, distance) => {
      assert.equal(delay, false, 'no branch in delay slot');
      if (delayed) step(pc + 2, true);
      return taken ? pc + 4 + distance * 2 : pc + (delayed ? 4 : 2);
    };
    if (opcode === 9) { /* nop */ }
    else if ((opcode >> 12) === 0x7) r[n] += sx(imm, 8);
    else if ((opcode >> 12) === 0xe) r[n] = sx(imm, 8);
    else if ((opcode >> 12) === 0xd) r[n] = l((pc + 4 & ~3) + imm * 4);
    else if ((opcode >> 12) === 0x9) r[n] = sx(w(pc + 4 + imm * 2), 16);
    else if ((opcode >> 12) === 0xa) return branch(true, true, sx(opcode & 0xfff, 12));
    else if (hi === 0x8900 || hi === 0x8b00 || hi === 0x8d00 || hi === 0x8f00)
      return branch(Boolean(T) === (hi === 0x8900 || hi === 0x8d00), hi === 0x8d00 || hi === 0x8f00, sx(imm, 8));
    else if (hi === 0xc900) r[0] &= imm;
    else if (hi === 0x8800) T = r[0] === (sx(imm, 8) >>> 0);
    else if (tag === 0x6000) r[n] = sx(b(r[m]), 8);
    else if (tag === 0x6002) r[n] = l(r[m]);
    else if (tag === 0x6003) r[n] = r[m];
    else if (tag === 0x600c) r[n] = r[m] & 255;
    else if (tag === 0x2000) put(r[n], r[m]);
    else if (tag === 0x2008) T = (r[n] & r[m]) === 0;
    else if (tag === 0x2009) r[n] &= r[m];
    else if (tag === 0x200b) r[n] |= r[m];
    else if (tag === 0x300c) r[n] += r[m];
    else if (shift === 0x4008) r[n] <<= 2;
    else if (shift === 0x4009) r[n] >>>= 2;
    else if (shift === 0x4001) { T = r[n] & 1; r[n] >>>= 1; }
    else throw Error(`Unsupported test instruction ${opcode.toString(16)} at ${pc.toString(16)}`);
    return pc + 2;
  }
  return {r,b,w,l,put,putLong,run(pc, stops) {
    for (let i=0; i<70; i++) {
      if (stops.includes(pc)) return pc;
      pc = step(pc);
    }
    throw Error('Native test block did not end');
  }};
}
const lanes = {
 'f-stock':      {loader:0x0602de8a, loaderEnd:0x0602de9a, constant:0x0602df5c, gate:0x0605d3b4, mapPtr:0x0605d460, weaponPtr:0x0605d464, modePtr:0x0605d468, ok:[0x0605d404,0x0605d406], reject:0x0605dc14, selected:11},
 'f-v0.5-a':    'f-stock',
 'final-stock': {loader:0x06031c8e, loaderEnd:0x06031c9e, constant:0x06031de6, gate:0x06063772, mapPtr:0x06063838, weaponPtr:0x0606383c, modePtr:0x06063840, ok:[0x060637c0], reject:0x06063ebc, selected:10},
 'final-v0.3-a': 'final-stock',
};

for (const [lane, spec] of Object.entries(lanes)) {
 const p = process.env.SRWF_GOLDEN_EXEC_DIR + '/' + lane + '.EXEC0';
 const pin = typeof spec === 'string' ? lanes[spec] : spec;
 test(`${lane}: real SH-2 loader and moved-unit targeting gate change outcome with only P toggled`, {skip: !fs.existsSync(p)}, () => {
   const game = fs.readFileSync(p);
   for (const moved of [false, true]) for (const on of [false,true]) for (const mode of [0,5]){
     const m = makeMachine(game);
     const weaponRecord=0x1000, work=0x2000, unitSelector=0x3000, map=0x4000, modeState=0x5000;
     m.r[3]=work+51; m.r[4]=weaponRecord+1; m.r[2]=0xff;
     m.r[11]=m.w(pin.constant);
     assert.equal(m.r[11]&255, 0xdf, 'the existing loader clears work bit 5 only');
     m.put(weaponRecord+1, 0x95 | (on ? 0x40 : 0));
     m.run(pin.loader,[pin.loaderEnd]);
     assert.equal(m.b(work+51), on ? 0xff : 0xdf);
     m.r[pin.selected]=0; m.r[13]=unitSelector; m.put(unitSelector,0);
     m.putLong(m.l(pin.mapPtr),map); m.put(map+7,moved?0x10:0);
     m.putLong(m.l(pin.weaponPtr),work);
     m.putLong(m.l(pin.modePtr),modeState);m.put(modeState+1,mode);
     const out=m.run(pin.gate,[...pin.ok,pin.reject]);
     assert.equal(out!==pin.reject,!moved||on||mode===5);
   }
 });
}
