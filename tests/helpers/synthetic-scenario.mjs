import { packGreedy, randomBytes } from './synthetic-iso.mjs';
import { F_NAME_MAP, FINAL_NAME_MAP } from '../../assets/editor-name-map.mjs';
import { SCENARIO_ARCHIVE_FORMATS } from '../../assets/editor-scenario-archive.mjs';

export function makeScenarioArchive(gameId, { scenarioLayout = 'latest', withEvents=false, withDeadline=false,withReinforcement=false } = {}) {
  const raw = randomBytes(600, 87), view = new DataView(raw.buffer);
  for (let i = 0; i < 14; i++) view.setInt32(i * 4, (i === 4 ? 60 : 450) - i * 4);
  raw.set([0xc4,0,2,0x80,1,0xca,2,0x11,
    2,3,0x14,1,0xaa,1,47,0,0,0x12,0x34,0x56,
    4,1,0x1a,2,0xbc,2,255,0,0,0xab,0xcd,0xef,255,255,0xe9], 60);
  if(withEvents){
    view.setInt32(5*4,150-5*4);raw.fill(0xaa,98,150);raw.fill(0xaa,150,450);
    raw.set([0xd4,0,0xf2,0,12,0,5,0xe9,1,255,247],150);
    raw.set([0xca,2,0x51,4,2,0x14,1,0,2,1,0,0,0,0,0,255,255,0xe9,1,255,219],165);
  }
  if(withReinforcement){
    raw.fill(0xaa,56);view.setInt32(20,150-20);view.setInt32(24,154-24);
    raw.set([0xc4,0,2,0x80,1,0xca,2,0x11,
      2,3,0x14,1,0,2,47,0,145,0x12,0x34,0x56,
      4,1,0x14,1,0,2,255,0,133,0x12,0x34,0x56,255,255,0xe9],60);
    raw.set([0xe9,1,255,254],150);raw.set([0xee,1],220);
  }
  if(withDeadline){
    view.setInt32(32,300-32);view.setInt32(36,324-36);
    raw.set([0xd3,252,0xf2,0,15,0,0,0xd3,251,0xf2,0,11,0,0,0xe9,1,255,240,0xec,1,0xea,0xec,2,0xea],300);
    const names=gameId==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP;
    const encode=text=>{const bytes=[];for(const glyph of text){const [key]=[...names].find(([key,g])=>g===glyph);for(let i=0;i<key.length;i+=2)bytes.push(parseInt(key.slice(i,i+2),16));}return [...bytes,255];};
    const win=encode('적의전멸'),lose=encode('아군의전멸');
    raw.set([0xe7,2,0,4,0xe7,3,0,4,0,win.length+2,...win,...lose],450);
  }
  const format = SCENARIO_ARCHIVE_FORMATS[gameId], start = format.slots * 8, packed = packGreedy(raw);
  const bytes = new Uint8Array(start + packed.length + (withDeadline?128:64)), v = new DataView(bytes.buffer);
  const bias = gameId === 'srwf-final' && scenarioLayout === 'stock' ? 4 : format.endCellBias;
  for (let i = 0; i < format.slots; i++) { const cell = i * 8;
    v.setUint32(cell, start - cell); v.setUint32(cell + 4, bytes.length - cell - bias); }
  bytes.set(packed, start); return { bytes, raw, first: 68 };
}

const sizes = { 'srwf-f': { maps: 111, banks: 21 }, 'srwf-final': { maps: 127, banks: 24 } };
export function archive(count, bodies) {
  const spans = []; let end = count * 8;
  for (const body of bodies) { spans.push([end, end + body.length]); end += body.length; }
  const bytes = new Uint8Array(end), v = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) { const [a,z] = spans[i % bodies.length]; v.setUint32(i * 8, a - i * 8); v.setUint32(i * 8 + 4, z - i * 8 - 4); }
  bodies.forEach((b, i) => bytes.set(b, spans[i][0])); return bytes;
}
function plane(width = 6, height = 4, cellStart = 16, repetitive = false) {
  const bytes = new Uint8Array(cellStart + width * height * 2 + 8), v = new DataView(bytes.buffer);
  bytes.set([64,64,2,0]); v.setUint32(4, cellStart + 4); bytes[10] = width; bytes[11] = height;
  bytes.fill(0xac, 12, cellStart); bytes.fill(0xcd, bytes.length - 8);
  for (let i = 0; i < width * height; i++) v.setUint16(cellStart + i * 2, repetitive ? 7 : (i * 37 & 1023) | (i % 16 << 12) | (i % 4 << 10));
  return bytes;
}
export function makeMapArchives(gameId, { repetitive = false } = {}) {
  const a = plane(6,4,24,repetitive), b = plane(3,5,16,repetitive), pa = packGreedy(a), pb = packGreedy(b);
  const second = 72 + pa.length, body = new Uint8Array(second + 4 + pb.length), v = new DataView(body.buffer);
  body.fill(255, 1, 66); body[0] = 0x80; v.setUint16(66, second - 67);
  body.set(new TextEncoder().encode('sc01'),68); body.set(pa,72);
  body.set(new TextEncoder().encode('sc01'),second); body.set(pb,second + 4);
  const bank = new Uint8Array(60416); bank.fill(9,0,512); bank.fill(17,1536);
  for (let i = 0; i < 1024; i++) bank[512+i] = i % 100;
  const pk = packGreedy(bank), bankBody = new Uint8Array(1028 + pk.length);
  bankBody.fill(7,0,1024); bankBody.set(new TextEncoder().encode('bk00'),1024); bankBody.set(pk,1028);
  return { bytes: archive(sizes[gameId].maps,[body]), bankBytes: archive(sizes[gameId].banks,[bankBody]), rawPlanes:[a,b] };
}
