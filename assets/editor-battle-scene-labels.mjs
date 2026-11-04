// Final v0.3a's EA font cell is not O. In b/c the same EA alias correctly
// contains O, so preserve those source variants. This a-only workaround
// changes three source-bound strings, never a font cell, pointer or mask.
import {ACCEPTED_EDITOR_TARGETS} from './editor-provenance-profiles.mjs?v=20261104-part1';
const bases=new Set(Object.entries(ACCEPTED_EDITOR_TARGETS)
  .filter(([,v])=>/^srwf-final-20261005-v0-3-[abc]$/.test(v.releaseId)).map(([hash])=>hash));
const repairBases=new Set(Object.entries(ACCEPTED_EDITOR_TARGETS)
  .filter(([,v])=>v.releaseId==='srwf-final-20261005-v0-3-a').map(([hash])=>hash));
const windows=[
  {at:0x6ddcf,hex:'ec4cec53ec0bed1afd231000ea2300fe00ff',slots:[12]},
  {at:0x6e715,hex:'ea230000ea1b1b00',slots:[0,4]},
].map(({at,hex,slots})=>({at,bytes:Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)),slots}));
export const BATTLE_SCENE_O_OFFSETS=Object.freeze(windows.flatMap(w=>w.slots.map(i=>w.at+i)));
function transform(decoded,{gameId,baseSha256}={},target){
  if(!decoded||gameId!=='srwf-final'||!bases.has(baseSha256))return decoded;
  if(!(decoded instanceof Uint8Array))throw new TypeError('Missing scene-label data.');
  const states=new Set();
  for(const w of windows)for(let i=0;i<w.bytes.length;i++){
    const value=decoded[w.at+i];
    if(w.slots.includes(i)&&(value===0xea||value===0x24)){states.add(value);continue;}
    if(value!==w.bytes[i]){
      const e=Error('전투장면 ON/OFF 문구가 확인된 완결편 v0.3 원본과 다릅니다.');e.code='EDITOR_UI_LABEL_INVALID';throw e;
    }
  }
  if(states.size!==1){const e=Error('전투장면 ON/OFF 문구가 일부만 수정되어 있습니다.');e.code='EDITOR_UI_LABEL_INVALID';throw e;}
  if(states.has(target))return decoded;
  const out=decoded.slice();for(const at of BATTLE_SCENE_O_OFFSETS)out[at]=target;return out;
}
export const repairBattleSceneLabels=(decoded,options)=>repairBases.has(options?.baseSha256)?transform(decoded,options,0x24):decoded;
// Exact reversal before the existing immutable TSR hash. Partial fixes,
// unknown neighbours and all other changed bytes remain unauthenticated.
export const normalizeBattleSceneLabels=(decoded,options)=>transform(decoded,options,0xea);

// The game aliases 00..EA to EB00..EBEA in root36. New Hangul belongs to
// authenticated EC00+ pools; no editor feature may change these 235 cells.
export function requireSingleByteFontPreserved(before,after,{gameId,baseSha256}={}){
  if(gameId!=='srwf-final'||!bases.has(baseSha256))return;
  const offset=b=>b instanceof Uint8Array&&b.length>=148?144+new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(144):-1;
  const a=offset(before),b=offset(after),length=235*32;
  if(a<164||b!==a||a+length>before.length||b+length>after.length
    ||before.subarray(a,a+length).some((value,i)=>value!==after[b+i])){
    const e=Error('원본 글꼴의 영문·기호 글리프가 변경되어 저장을 중단했습니다.');e.code='EDITOR_OUTPUT_INTERNAL';throw e;
  }
}
