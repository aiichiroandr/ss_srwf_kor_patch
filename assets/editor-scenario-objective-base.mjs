// Shared, bounded root-8 and purpose-text evidence. Reading a byte pattern
// does not authorize a write; callers must authenticate the canonical body.
import { F_NAME_MAP, FINAL_NAME_MAP } from './editor-name-map.mjs?v=20261011-public13';
export const OBJECTIVE_RAM_CAPACITY = Object.freeze({ 'srwf-f':0x8000, 'srwf-final':0x9000 });
const CAPACITY=OBJECTIVE_RAM_CAPACITY;
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const viewOf=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
function rootsOf(bytes){const v=viewOf(bytes);return Array.from({length:14},(_,i)=>i*4+v.getInt32(i*4));}
function fail(message){const e=new Error(message);e.code='EDITOR_OBJECTIVE_INVALID';throw e;}
export function inspectPendingObjectiveHook(bytes, roots, patched=false) {
  const start=roots[8], end=Math.min(...roots.filter(offset=>offset>start),bytes.length);
  let p=start; const guards=[];
  // Admit only an uninterrupted read-only event-flag guard prefix. Other
  // producers, calls, actor checks and side effects remain unsupported.
  while(p+8<=end && bytes[p]===0xd0 && bytes[p+1]===2 && bytes[p+2]===0
    && [0xf0,0xf1].includes(bytes[p+4]) && bytes[p+5]===0 && guards.length<3) {
    guards.push({flag:bytes[p+3],branch:bytes[p+4]}); p+=8;
  }
  const counters=[bytes[p+1],bytes[p+8]];
  if(p+18>end || bytes[p]!==0xd3 || bytes[p+7]!==0xd3
    || !counters.includes(0xfb) || !counters.includes(0xfc)
    || bytes[p+2]!==0xf2 || bytes[p+9]!==0xf2
    || bytes[p+5]!==0 || bytes[p+6]!==0 || bytes[p+12]!==0 || bytes[p+13]!==0) return null;
  const yieldOffset=p+14, data=viewOf(bytes);
  if(!patched && (bytes[yieldOffset]!==0xe9 || bytes[yieldOffset+1]!==1
    || yieldOffset+2+data.getInt16(yieldOffset+2)!==start)) return null;
  // Both count branches must stay in this declared callback. Preserve their
  // targets and the entire winning/losing action path, even when it is complex.
  for(const cell of [p+3,p+10]) {
    const target=cell+data.getInt16(cell);
    if(target<start || target>=end || target>=p && target<p+18) return null;
  }
  // The replacement keeps only the first instruction address of this four-
  // byte loop. Reject any possible incoming relative reference to its interior.
  // This is a negative guard, not a byte-pattern-based authorization to write:
  // inside the callback every BE16 pair is considered; outside it the known
  // relative branch/call forms are considered even if they could be data.
  for(let cell=57;cell+1<bytes.length;cell++) {
    const prefix=bytes[cell-1],target=cell+data.getInt16(cell);
    const flag=cell>57&&[0xf0,0xf1,0xf6].includes(bytes[cell-2])&&[0,1].includes(prefix);
    const candidate=cell>=start&&cell<end || [1,3,0xf2,0xf3,0xf4,0xf5].includes(prefix)||flag;
    if(candidate&&target>yieldOffset&&target<yieldOffset+4)return null;
    if(prefix===2&&cell+3<bytes.length){
      const longTarget=cell+data.getInt32(cell);
      if(longTarget>yieldOffset&&longTarget<yieldOffset+4)return null;
    }
  }
  return {start,headOffset:p,yieldOffset,guards};
}

// A separate whole-callback proof permits a new root-8 entry without replacing
// any instruction in the original callback. Every action path here ends at
// its original EC/EA result; none can yield and later resume in the old count
// checks. This does not relax the in-place hook's incoming-reference checks.
export function inspectClosedObjectiveCallback(bytes, roots) {
  if(!(bytes instanceof Uint8Array) || !Array.isArray(roots) || roots.length!==14
    || bytes.length<57 || roots.some(r=>!Number.isInteger(r)||r<56||r>=bytes.length))return null;
  const start=roots[8],end=Math.min(...roots.filter(r=>r>start),bytes.length),data=viewOf(bytes);
  let p=start;const guards=[];
  while(p+8<=end && bytes[p]===0xd0 && bytes[p+1]===2 && bytes[p+2]===0
    && [0xf0,0xf1].includes(bytes[p+4]) && bytes[p+5]===0 && guards.length<3){
    guards.push({flag:bytes[p+3],branch:bytes[p+4],target:p+6+data.getInt16(p+6)});p+=8;
  }
  if(end-p!==24 || bytes[p]!==0xd3 || bytes[p+7]!==0xd3
    || ![0xfb,0xfc].includes(bytes[p+1]) || ![0xfb,0xfc].includes(bytes[p+8])
    || bytes[p+1]===bytes[p+8] || bytes[p+2]!==0xf2 || bytes[p+9]!==0xf2
    || bytes[p+5]!==0 || bytes[p+6]!==0 || bytes[p+12]!==0 || bytes[p+13]!==0
    || bytes[p+14]!==0xe9 || bytes[p+15]!==1 || p+16+data.getInt16(p+16)!==start)return null;
  const victory=p+18,defeat=victory+3,yieldOffset=p+14;
  if(!same(bytes.subarray(victory,end),Uint8Array.of(0xec,1,0xea,0xec,2,0xea)))return null;
  for(const [query,cell]of [[bytes[p+1],p+3],[bytes[p+8],p+10]]){
    if(cell+data.getInt16(cell)!==(query===0xfc?victory:defeat))return null;
  }
  // Guards can enter an original result action or yield. In particular, the
  // accepted F FA/F0 guard enters victory; treating every guard as a yield
  // would change the original game logic.
  if(guards.some(g=>![yieldOffset,victory,defeat].includes(g.target)))return null;
  return {mode:'root-relocation',start,end,headOffset:p,yieldOffset,guards,victory,defeat};
}

function readText(bytes, start, nameMap) {
  let p=start, text='';
  while(p<bytes.length && p-start<180 && text.length<80) {
    if(bytes[p]===255) return {text,end:p+1};
    const n=bytes[p]>=235&&bytes[p]<=245?2:1;
    if(p+n>bytes.length) return null;
    const key=Array.from(bytes.subarray(p,p+n),byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
    const glyph=nameMap.get(key); if(glyph===undefined)return null;
    text+=glyph; p+=n;
  }
  return null;
}

export function readScenarioPurpose(bytes, gameId) {
  if(!(bytes instanceof Uint8Array) || bytes.length<57 || !Object.hasOwn(CAPACITY,gameId))return null;
  const roots=rootsOf(bytes), p=roots[13], data=viewOf(bytes);
  if(p<56 || p+6>bytes.length || !same(bytes.subarray(p,p+2),Uint8Array.of(0xe7,2))
    || bytes[p+4]!==0xe7 || bytes[p+5]!==3)return null;
  const table=p+2+data.getInt16(p+2); if(table<56 || table+4>bytes.length)return null;
  const first=table+data.getInt16(table), second=table+2+data.getInt16(table+2);
  if(first<table+4 || second<table+4 || first>=bytes.length || second>=bytes.length)return null;
  const names=gameId==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP;
  const victory=readText(bytes,first,names), defeat=readText(bytes,second,names);
  if(!victory || !defeat || first<second && victory.end>second || second<first && defeat.end>first)return null;
  return {root:p,table,victory:victory.text,defeat:defeat.text};
}

export function encodeObjectiveText(text,gameId) {
  const names=gameId==='srwf-f'?F_NAME_MAP:FINAL_NAME_MAP, reverse=new Map();
  for(const [key,glyph]of names) {
    const normal=glyph.normalize('NFKC');
    if([...normal].length===1 && !reverse.has(normal))reverse.set(normal,key);
  }
  const bytes=[];
  for(const char of text.normalize('NFKC')) {
    const key=reverse.get(char); if(!key)fail('An objective glyph has no verified encoding.');
    for(let p=0;p<key.length;p+=2)bytes.push(parseInt(key.slice(p,p+2),16));
  }
  bytes.push(255); return bytes;
}
