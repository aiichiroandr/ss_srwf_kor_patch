import {F_NAME_MAP,FINAL_NAME_MAP} from './editor-name-map.mjs?v=20261110-part1';
import {F_NAME_SUPPLEMENT,FINAL_PILOT_NAME_MAP} from './editor-pilot-name-map.mjs?v=20261110-part1';
import {finalDefaultSaveName,finalDefaultSaveAlias} from './editor-save-name-defaults.mjs?v=20261110-part1';
const maps=new Map(),F_TEXT_MAP=new Map([...F_NAME_SUPPLEMENT,...F_NAME_MAP]);
// `hero` remains the legacy reader for old Final pilot/save fields. New
// custom save names reach the ordinary font renderer when the game's exact
// default-name resolver does not match; write them with the current atlas.
// Never reverse the legacy map for a new save name: some of its codes now
// point to blank cells (for example legacy 경/F2E2 is terrain padding).
export function nameMap(gameId,kind='weapon',glyphMap=null) {
 if(!['srwf-f','srwf-final'].includes(gameId))throw Error('이름 문자표의 게임 정보를 확인할 수 없습니다.');
 const base=gameId==='srwf-f'?F_TEXT_MAP:kind==='hero'?FINAL_PILOT_NAME_MAP:FINAL_NAME_MAP;
 return glyphMap?.size?new Map([...base,...glyphMap]):base;
}
function reverse(gameId,kind,glyphMap){
 const key=`${gameId}:${kind}`;if(!glyphMap?.size&&maps.has(key))return maps.get(key);
 const out=new Map();
 for(const [code,glyph] of [...nameMap(gameId,kind,glyphMap)].sort((a,b)=>a[0].length-b[0].length||a[0].localeCompare(b[0]))){
  if(!/^(?:[0-9A-F]{2}|[0-9A-F]{4})$/.test(code)||!glyph||/[\u0000-\u001f\u007f]/.test(glyph))continue;
  const bytes=code.match(/../g).map(h=>parseInt(h,16)),width=bytes[0]>=0xeb&&bytes[0]<=0xf5?2:1;
  if(bytes[0]===255||bytes.length!==width)continue;
  for(const text of [glyph.normalize('NFC'),glyph.normalize('NFKC')])if([...text].length===1&&!out.has(text))out.set(text,bytes);
 }
 if(!glyphMap?.size)maps.set(key,out);return out;
}
export function editorTextMetrics(text,{gameId,kind='weapon',glyphMap=null}={}){
 if(typeof text!=='string')throw Error('문자를 입력하세요.');
 const table=reverse(gameId,kind,glyphMap),missing=new Set();let byteLength=0;
 for(const glyph of text.normalize('NFC')){const bytes=table.get(glyph);byteLength+=bytes?.length??2;if(!bytes)missing.add(glyph);}
 return {byteLength,missing:[...missing]};
}
export function encodeEditorText(text,{gameId,kind='weapon',maxBytes=160,glyphMap=null}={}){
 if(typeof text!=='string')throw Error('이름을 입력하세요.');
 const value=text.normalize('NFC');
 if(!value.trim()||value!==value.trim())throw Error('이름을 입력하고 앞뒤 공백은 지워주세요.');
 const table=reverse(gameId,kind,glyphMap),bytes=[],missing=[];
 for(const glyph of value){const code=table.get(glyph);if(code)bytes.push(...code);else missing.push(glyph);}
 if(missing.length)throw Error(`현재 글꼴에 없는 글자: ${[...new Set(missing)].join(' ')}. 지원하는 글자로 바꿔주세요.`);
 bytes.push(255);
 if(bytes.length>maxBytes)throw Error(`이름은 종료 문자를 포함해 ${maxBytes}바이트까지입니다 (현재 ${bytes.length}바이트).`);
 return Uint8Array.from(bytes);
}
export function decodeEditorText(bytes,{gameId,kind='weapon',faceId,glyphMap=null}={}){
 if(gameId==='srwf-final'&&kind==='save'){
  const original=finalDefaultSaveName(bytes,faceId);if(original!==null)return original;
 }
 if(gameId==='srwf-final'&&kind==='saveAlias'){
  const original=finalDefaultSaveAlias(bytes,faceId);if(original!==null)return original;
 }
 const current=decodeText(bytes,nameMap(gameId,kind,glyphMap));
 // Current custom names use the same codes the game actually draws. Keep
 // old imported Korean names readable where those bytes are not current
 // text. A readable current string takes precedence over a legacy reading.
 return current===null&&gameId==='srwf-final'&&['save','saveAlias','saveUnit'].includes(kind)
  ?decodeText(bytes,FINAL_PILOT_NAME_MAP):current;
}
function decodeText(bytes,map){
 const text=[];
 for(let i=0;i<bytes.length;){
  if(bytes[i]===255)return text.join('').replace(/\u3000/g,' ').trim();
  const width=bytes[i]>=0xeb&&bytes[i]<=0xf5?2:1;
  if(i+width>bytes.length)return null;
  const code=Array.from(bytes.slice(i,i+width),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase(),glyph=map.get(code);
  if(glyph===undefined)return null;text.push(glyph);i+=width;
 }
 return null;
}
