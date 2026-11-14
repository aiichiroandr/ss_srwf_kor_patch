import {locateIsoFiles,readCdUserExtent} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-1';
import {nameMap} from './editor-text-codec.mjs?v=20261113-alicecopies1';
import {decodeBattleText} from './editor-battle-timeline.mjs?v=20261113-alicecopies1';
import {buildPilotDialoguePreview,previewPilotDialogueInfo} from './editor-pilot-dialogue.mjs?v=20261113-alicecopies1';
const cache=new WeakMap();
const fail=()=>{throw Error('기존 전투대사의 범위·명령을 확인하지 못했습니다.');};

// Normal battle uses the second six-byte selector table (F 060475C6–0604766E).
// MAP attack uses the first table beginning at record +20 (Final 06046DE8).
// Both match weapon +2 & 63 and use their own FFFF fallback.
export function battleDialogueCatalog(bytes,gameId,pilot,{glyphMap=null}={}){
 const count=gameId==='srwf-f'?384:gameId==='srwf-final'?400:0;
 if(!(bytes instanceof Uint8Array)||!count||!Number.isInteger(pilot)||pilot<1||pilot>399||bytes.length<count*4)fail();
 const original=pilot,info=previewPilotDialogueInfo(gameId,pilot);
 if(['silent','unavailable'].includes(info?.kind))return {pilot,kind:info.kind,note:info.label,types:[],mapTypes:[]};
 if(pilot>=count)fail();
 if([302,303].includes(pilot))pilot=304;
 const source=info?buildPilotDialoguePreview(bytes,pilot,gameId):bytes;
 const directory=new DataView(source.buffer,source.byteOffset,source.byteLength),starts=Array.from({length:count},(_,i)=>i*4+directory.getInt32(i*4));
 if(starts.some(n=>n<count*4||n>=source.length))fail();
 const start=starts[pilot],end=Math.min(source.length,...starts.filter(n=>n>start)),r=source.subarray(start,end),v=new DataView(r.buffer,r.byteOffset,r.byteLength);
 const need=(at,n)=>{if(!Number.isInteger(at)||at<0||at+n>r.length)fail();};
 const u16=at=>{need(at,2);return v.getUint16(at);},u32=at=>{need(at,4);return v.getUint32(at);};
 let at=20;const selectors=[];
 for(let table=0;table<2;table++){
  const entries=new Map();for(let n=0;;n++){if(n>1024)fail();const key=u16(at),target=u32(at+2);need(target,2);at+=6;if(!entries.has(key))entries.set(key,target);if(key===65535)break;}
  selectors.push(entries);
 }
 const textMap=nameMap(gameId,'weapon',glyphMap),pilotMap=nameMap(gameId,'hero',glyphMap),walks=new Map();
 function walk(root){
  if(walks.has(root))return walks.get(root);
  const pending=[root],seen=new Set(),lines=[],warnings=[];
  for(let i=0;i<pending.length;i++){
   if(i>8192)fail();const off=pending[i];if(seen.has(off))continue;seen.add(off);const op=u16(off);let next=[];
   if(op<=9){need(off,8);next=[off+8,u32(off+4)];}
   else if(op<=11){need(off,6);next=[off+6,u32(off+2)];}
   else if(op===12){need(off,14);next=[2,6,10].map(n=>u32(off+n));}
   else if(op===13){const n=u16(off+2);if(n<1||n>256)fail();need(off,4+4*n);next=Array.from({length:n},(_,j)=>u32(off+4+4*j));
    if(gameId==='srwf-final'&&pilot===234&&off===0x4ae&&next.at(-1)===0xd000a){next.pop();warnings.push('원본의 잘못된 분기 한 개는 표시하지 않았습니다.');}}
   else if(op===14)next=[u32(off)];
   else if(op===15){need(off,4);next=[off+4];}
   else if(op>=16&&op<=18){
    need(off,10);const body=u32(off+6);need(body,1);let last=body;
    while(last<r.length&&r[last]!==255){last+=r[last]>=235&&r[last]<=245?2:1;if(last-body>510)fail();}
    if(last>=r.length)fail();const decoded=last===body?{text:'',unknown:[]}:decodeBattleText([...r.subarray(body,last+1)],textMap,{pilotMap});if(!decoded)fail();
    lines.push({text:decoded.text.replaceAll('⟦F6⟧','\n'),unknown:decoded.unknown,speaker:u16(off+2)>>>6,expression:u16(off+2)&63,voice:u16(off+4),action:off});next=[off+10];
   }else if(gameId==='srwf-final'&&op>=19&&op<=21){need(off,6);next=[u32(off+2)];}
   else if(op!==65535)fail();
   for(const target of next){need(target,2);if(!seen.has(target))pending.push(target);}
  }
  const unique=[...new Map(lines.map(line=>[`${line.speaker}:${line.voice}:${line.text}`,line])).values()];
  const result={lines:unique,warnings};walks.set(root,result);return result;
 }
 const readTypes=entries=>Array.from({length:64},(_,type)=>{const selected=entries.has(type)?type:65535,target=entries.get(selected);if(target===undefined)fail();return {type,common:selected===65535,...walk(target)};});
 const types=readTypes(selectors[1]),mapTypes=readTypes(selectors[0]);
 return {pilot:original,kind:info?.kind??([302,303].includes(original)?'hero':'native'),note:info?.kind==='crew'?'본인 동승자 음성 견본 · 유형 공통':info?.label??([302,303].includes(original)?'주인공 기본 견본':''),types,mapTypes};
}
export async function readBattleDialogue(session,pilot){
 if(!session?.sourceBlob||typeof session.sessionToken!=='string')throw Error('검증한 ROM 세션이 없습니다.');
 if(!cache.has(session))cache.set(session,(async()=>{const {bmess}=await locateIsoFiles(session.sourceBlob,undefined,['BMESS.BIN']);return readCdUserExtent(session.sourceBlob,bmess.extentLba,bmess.byteLength);})());
 const bytes=await cache.get(session);return battleDialogueCatalog(bytes,session.descriptor.gameId,pilot,{glyphMap:session.glyphMap});
}
