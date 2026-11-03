// Structural check of one cartridge save record against the verified ROM.
// Errors are references the game reads without bounds checks (unit and pilot
// ids, boarding and link slots, upgrade nibbles, part ids); a repair only makes
// them safe. Warnings are unusual but possibly legitimate and are never changed.
// Original values cannot be recovered, so a repair never invents them.
const UNIT_BASE = 0x100, UNIT_SIZE = 30, PILOT_BASE = 0x1000, PILOT_SIZE = 12, SLOTS = 128, NONE = 255, PART_MAX = 22;
const UPGRADES = Object.freeze({hpUpgrade:[3,7,'HP'],enUpgrade:[4,11,'EN'],armorUpgrade:[4,7,'장갑'],limitUpgrade:[5,11,'한계'],mobilityUpgrade:[5,7,'운동성']});
const u16 = (b,p) => b[p]*256+b[p+1];

// `catalog` is the verified editor view: {gameId, units:[{recordIndex}], pilots:[{recordIndex}]}.
// Without a catalog of the same game only the ROM-independent checks run.
export function checkSaveBytes(b, {gameId=null, upgradeLimit=5}={}, catalog={}) {
  const issues = [];
  if (!(b instanceof Uint8Array) || b.length !== 0x1600) return issues;
  const sameGame = !!gameId && catalog.gameId === gameId;
  const unitIds = sameGame && catalog.units?.length ? new Set(catalog.units.map(u => u.recordIndex)) : null;
  const pilotIds = sameGame && catalog.pilots?.length ? new Set(catalog.pilots.map(p => p.recordIndex)) : null;
  const unitAt = slot => u16(b, UNIT_BASE + slot*UNIT_SIZE), pilotAt = slot => u16(b, PILOT_BASE + slot*PILOT_SIZE);
  const add = (level, type, slot, id, message, fix=null) => issues.push({level, type, slot, id, message, fix});
  const pilotOk = slot => slot < SLOTS && pilotAt(slot) !== 0 && (!pilotIds || pilotIds.has(pilotAt(slot)));
  const unitOk = slot => slot < SLOTS && unitAt(slot) !== 0 && (!unitIds || unitIds.has(unitAt(slot)));
  const seenPilots = new Map(), boarded = new Map();
  for (let slot = 0; slot < SLOTS; slot++) {
    const p = PILOT_BASE + slot*PILOT_SIZE, id = u16(b, p);
    if (!id) continue;
    if (pilotIds && !pilotIds.has(id)) { add('error','pilot',slot,id,`ROM에 없는 파일럿 번호 #${id}`,{kind:'clearPilot'}); continue; }
    const level = b[p+2];
    if (level < 1 || level > 99) add('error','pilot',slot,id,`레벨 ${level}은 1~99 범위 밖`,{kind:'level',value:Math.min(99,Math.max(1,level))});
    if (seenPilots.has(id)) add('warn','pilot',slot,id,`같은 파일럿이 칸 ${seenPilots.get(id)+1}에도 있음`);
    else seenPilots.set(id, slot);
  }
  for (let slot = 0; slot < SLOTS; slot++) {
    const u = UNIT_BASE + slot*UNIT_SIZE, id = u16(b, u);
    if (!id) continue;
    if (unitIds && !unitIds.has(id)) { add('error','unit',slot,id,`ROM에 없는 기체 번호 #${id}`,{kind:'clearUnit'}); continue; }
    const pilotSlot = b[u+15], linkedSlot = b[u+16];
    if (pilotSlot !== NONE && !pilotOk(pilotSlot)) add('error','unit',slot,id,`탑승 파일럿 칸 ${pilotSlot}이 비었거나 잘못됨`,{kind:'byte',offset:u+15,value:NONE});
    if (linkedSlot !== NONE && (linkedSlot === slot || !unitOk(linkedSlot))) add('error','unit',slot,id,`연결 기체 칸 ${linkedSlot}이 비었거나 잘못됨`,{kind:'byte',offset:u+16,value:NONE});
    for (const [field,[offset,shift,label]] of Object.entries(UPGRADES)) {
      const level = (u16(b, u+offset) >>> shift) & 15;
      if (level > upgradeLimit) add('error','unit',slot,id,`${label} 개조 ${level}단이 최대 ${upgradeLimit}단을 넘음`,{kind:'nibble16',offset:u+offset,shift,value:upgradeLimit,field});
    }
    for (let i = 0; i < 16; i++) {
      const pos = u+7+(i>>1), shift = i%2 ? 0 : 4, level = (b[pos] >>> shift) & 15;
      // Normal saves can hold weapon nibbles above the limit; the game only reads them as table indices.
      if (level > upgradeLimit) add('warn','unit',slot,id,`무기 ${i+1} 개조 ${level}단이 최대 ${upgradeLimit}단을 넘음`);
    }
    for (let i = 0; i < 4; i++) if (b[u+17+i] > PART_MAX) add('error','unit',slot,id,`파츠 칸 ${i+1}의 번호 ${b[u+17+i]}이 범위 밖`,{kind:'byte',offset:u+17+i,value:0});
    // Linked forms of one family legitimately share the root's pilot slot.
    if (linkedSlot === NONE && pilotSlot !== NONE && pilotOk(pilotSlot)) {
      if (boarded.has(pilotSlot)) add('warn','unit',slot,id,`파일럿 칸 ${pilotSlot+1}이 칸 ${boarded.get(pilotSlot)+1} 기체에도 타 있음`);
      else boarded.set(pilotSlot, slot);
    }
  }
  return issues;
}

// Applies every error's repair to `b` in place. Removing a unit or pilot also
// detaches every reference to it, so the result passes the same check.
export function repairSaveBytes(b, record, catalog={}) {
  let fixed = 0;
  for (let round = 0; round < 4; round++) {
    const errors = checkSaveBytes(b, record, catalog).filter(i => i.level === 'error' && i.fix);
    if (!errors.length) break;
    for (const {type, slot, fix} of errors) {
      if (fix.kind === 'clearUnit') {
        b.fill(0, UNIT_BASE+slot*UNIT_SIZE, UNIT_BASE+(slot+1)*UNIT_SIZE);
        for (let s = 0; s < SLOTS; s++) if (u16(b, UNIT_BASE+s*UNIT_SIZE) && b[UNIT_BASE+s*UNIT_SIZE+16] === slot) b[UNIT_BASE+s*UNIT_SIZE+16] = NONE;
      } else if (fix.kind === 'clearPilot') {
        b.fill(0, PILOT_BASE+slot*PILOT_SIZE, PILOT_BASE+(slot+1)*PILOT_SIZE);
        for (let s = 0; s < SLOTS; s++) if (u16(b, UNIT_BASE+s*UNIT_SIZE) && b[UNIT_BASE+s*UNIT_SIZE+15] === slot) b[UNIT_BASE+s*UNIT_SIZE+15] = NONE;
      } else if (fix.kind === 'level') b[PILOT_BASE+slot*PILOT_SIZE+2] = fix.value;
      else if (fix.kind === 'byte') b[fix.offset] = fix.value;
      else if (fix.kind === 'nibble16') {
        const v = (u16(b, fix.offset) & ~(15<<fix.shift)) | (fix.value<<fix.shift);
        b[fix.offset] = v >>> 8; b[fix.offset+1] = v & 255;
      } else continue;
      fixed++; void type;
    }
  }
  return fixed;
}
