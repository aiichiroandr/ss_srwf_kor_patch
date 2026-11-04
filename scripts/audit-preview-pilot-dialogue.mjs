// Read-only BMESS control-flow census. Emits metadata only, never disc/resource data.
// Grammar: F ROOT0 producer 06047998; Final adds 13..15 six-byte jumps.
// Final record 234's existing count-10/table-9 defect is reported explicitly.
import {sha256Hex as hash} from '../assets/sha256.mjs';
export function scanBattleDialogue(bytes,count,final=false){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<count*4)throw Error('Truncated BMESS directory');
 const starts=Array.from({length:count},(_,i)=>i*4+v.getInt32(i*4));
 if(starts.some((p,i)=>p<count*4||p>=bytes.length||(i&&p<starts[i-1])))throw Error('Invalid BMESS directory');
 const unique=[...new Set([...starts,bytes.length])].sort((a,b)=>a-b),records=[],warnings=[];
 for(let ri=0;ri<unique.length-1;ri++){
  const start=unique[ri],end=unique[ri+1],size=end-start,ids=starts.flatMap((p,i)=>p===start?[i]:[]);
  const need=(p,n)=>{if(!Number.isSafeInteger(p)||p<0||p+n>size)throw Error(`BMESS ${ids} boundary +${p.toString(16)}`);};
  const u16=p=>{need(p,2);return v.getUint16(start+p);},u32=p=>{need(p,4);return v.getUint32(start+p);};
  const roots=Array.from({length:10},(_,i)=>2*i+u16(2*i));let table=20;
  for(let n=0;n<2;n++){let key;do{key=u16(table);roots.push(u32(table+2));table+=6;}while(key!==65535);}
  const pending=[...roots],seen=new Set(),actions=[];
  for(let i=0;i<pending.length;i++){
   const off=pending[i];if(seen.has(off))continue;seen.add(off);const op=u16(off);let next=[];
   if(op<=9){need(off,8);next=[off+8,u32(off+4)];}
   else if(op<=11){need(off,6);next=[off+6,u32(off+2)];}
   else if(op===12){need(off,14);next=[2,6,10].map(x=>u32(off+x));}
   else if(op===13){const n=u16(off+2);if(n<1||n>256)throw Error('Invalid branch count');need(off,4+n*4);next=Array.from({length:n},(_,j)=>u32(off+4+j*4));
    if(final&&ids.includes(234)&&off===0x4ae&&next.at(-1)===0xd000a){warnings.push({record:234,offset:off,invalidTarget:next.pop(),reason:'existing count-10/table-9 defect; invalid edge not followed'});}}
   else if(op===14){need(off,4);next=[u32(off)];}
   else if(op===15){need(off,4);next=[off+4];}
   else if(op>=16&&op<=18){need(off,10);const key=u16(off+2),body=u32(off+6);need(body,1);let last=body;
    while(last<size&&bytes[start+last]!==255)last+=bytes[start+last]>=235&&bytes[start+last]<=245?2:1;
    if(last>=size)throw Error('Unterminated dialogue');
    actions.push({donor:ids[0],action:off,opcode:op,speaker:key>>>6,voice:u16(off+4)});next=[off+10];}
   else if(final&&op>=19&&op<=21){need(off,6);next=[u32(off+2)];}
   else if(op!==65535)throw Error(`Unknown BMESS opcode ${op} in ${ids} +${off.toString(16)}`);
   for(const dest of next){need(dest,2);pending.push(dest);}
  }
  actions.sort((a,b)=>a.action-b.action);
  const r={ids,size,sha256:hash(bytes.subarray(start,end)),actions};for(const id of ids)records[id]=r;
 }
 return{count,records,warnings};
}
export function classifyPilots(scan,pilots,gameId){
 const profiles={},rows=[],amuro=scan.records[10].sha256,spoken=new Map();
 for(const r of new Set(scan.records))for(const a of r.actions){if(a.voice===0||a.voice===65535)continue;const list=spoken.get(a.speaker)??[];list.push(a);spoken.set(a.speaker,list);}
 for(const p of pilots){
  const id=p.recordIndex??p.id,record=scan.records[id],own=spoken.get(id)??[];
  const dummy=id!==10&&record?.actions.length>0&&record.actions.every(a=>a.speaker===10);
  let info=null;
  if(id===302||id===303)info={kind:'hero',label:'주인공 기본 견본'};
  else if(id>=308&&id<=319)info={kind:'not-pilot',label:'능력표'};
  else if(!record)info={kind:'unavailable',label:'전투대사 데이터 없음'};
  else if(dummy){
   const targetHash=record.sha256;
   if(own.length){const a=own.find(a=>a.opcode===17)??own[0];info={...a,targetHash,kind:'crew',label:'본인 동승자 음성 견본'};}
   else if(gameId==='srwf-final'&&id===390&&pilots.find(x=>(x.recordIndex??x.id)===175)?.name===p.name&&spoken.has(175))info={donor:175,speaker:175,targetHash,kind:'alias',label:'본인 전투대사 연결'};
   else info={targetHash,kind:'silent',label:'본인 전투음성 없음 · 무음 시연'};
  }
  if(info&&!['hero','not-pilot'].includes(info.kind))profiles[id]=info;
  rows.push({id,name:p.name,kind:info?.kind??'native',dummy,exactAmuroCopy:record?.sha256===amuro,voiceActions:own.length,...info?.donor!=null?{donor:info.donor}:{} });
 }
 return{profiles,rows,counts:rows.reduce((n,r)=>(n[r.kind]=(n[r.kind]??0)+1,n),{})};
}
