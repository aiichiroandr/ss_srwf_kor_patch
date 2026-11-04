// Reversible multi-unit support metadata. No unknown game bytes are modified.
import{ALICE_ART}from'./editor-alice-art.mjs?v=20261104-part1';
import{aliceCrewConfig,isAliceReservedPilot}from'./editor-alice-crew-data.mjs?v=20261104-part1';
import{expandFinalInlineAuxiliary}from'./editor-final-inline-aux.mjs?v=20261104-part1';
// SRWALC03 and the compact (flag 4) form belong to the v0.4 portrait carrier,
// which the public build does not ship: both are refused, never rewritten.
const MAGIC='SRWALC04',LEGACY='SRWALC03',FOOTER=16,NAME=Uint8Array.of(0x16,0x21,0x1e,0x18,0x1a,255);
const d=b=>new DataView(b.buffer,b.byteOffset,b.byteLength),same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]),tag=(b,s)=>b.length>=16&&[...s].every((c,i)=>b[b.length-16+i]===c.charCodeAt(0));
const faceHeader=()=>Uint8Array.from(atob(ALICE_ART.faceHeader),c=>c.charCodeAt(0));
function invalid(){const e=Error('ALICE 다중 동승 기록·초상 주소·기체 연결이 검증된 형식과 다릅니다.');e.code='EDITOR_ALICE_INVALID';throw e;}
function target(b,cell){if(!Number.isInteger(cell)||cell<0||cell+4>b.length)invalid();const at=cell+d(b).getInt32(cell);if(at<144||at>=b.length)invalid();return at;}
function pos(b){const root=target(b,112),pointer=root+399*4,full=target(b,48)+399*4,short=target(b,52)+399*4,donor=target(b,root+246*4),record=target(b,pointer);if(root+1600>b.length||d(b).getUint32(root)!==1600||record+27>b.length||donor+23>b.length||full+4>b.length||short+4>b.length)invalid();return{pointer,full,short,donor,record};}
export function writeAliceCrewV4(decoded,enabled,config,{gameId='srwf-final',faceInstalled=enabled,compact=false}={}){
 if(compact||gameId!=='srwf-final'||!(decoded instanceof Uint8Array)||typeof enabled!=='boolean')invalid();const crew=aliceCrewConfig(config);if(crew.enabled&&!enabled)invalid();if(!enabled&&!faceInstalled)return decoded;
 const expanded=decoded,p=pos(expanded);if(!isAliceReservedPilot(expanded.subarray(p.record,p.record+27))||expanded[target(expanded,p.full)]!==255||expanded[target(expanded,p.short)]!==255)invalid();
 const n=expanded.length,head=Math.ceil((n+88)/4)*4,flags=Number(enabled)|(Number(crew.enabled)<<1),face=faceHeader(),out=new Uint8Array(head+face.length+FOOTER),v=d(out);out.set(expanded);
 for(const[cell,off]of[[p.full,0],[p.short,4],[8,8],[p.pointer,12]])v.setInt32(n+off,d(expanded).getInt32(cell));v.setUint32(n+16,flags);v.setUint16(n+20,crew.spBase);out[n+22]=crew.unitIds.length;crew.unitIds.forEach((id,i)=>v.setUint16(n+24+i*2,id));
 crew.spirits.forEach((s,i)=>{out[n+32+i*2]=s.id;out[n+33+i*2]=s.level;});const name=n+44,record=n+50;out.set(NAME,name);out.set(expanded.subarray(p.donor,p.donor+23),record);const faceId=ALICE_ART.faceId;out[record]=(out[record]&254)|(faceId>>>8);out[record+1]=faceId&255;v.setUint16(record+17,crew.spBase);crew.spirits.forEach((s,i)=>{out[record+23+i*2]=s.id;out[record+24+i*2]=s.level;});
 if(enabled){v.setInt32(p.full,name-p.full);v.setInt32(p.short,name-p.short);v.setInt32(p.pointer,record-p.pointer);}
 out.set(face,head);v.setInt32(8,head-8);const end=head+face.length;out.set(new TextEncoder().encode(MAGIC),end);v.setUint32(end+8,n);v.setUint32(end+12,flags);
 return out;
}
export function readAliceCrewV4(stored,gameId='srwf-final'){
 let expanded=tag(stored,MAGIC)?stored:expandFinalInlineAuxiliary(stored,gameId);if(!tag(expanded,MAGIC)&&!tag(expanded,LEGACY))return null;if(gameId!=='srwf-final')invalid();
 if(tag(expanded,LEGACY))invalid();
 const v=d(expanded),tail=expanded.length-16,n=v.getUint32(tail+8),flags=v.getUint32(tail+12),head=Math.ceil((n+88)/4)*4;
 if(n<144||flags>3||(flags&2)&&!(flags&1)||head+2744!==tail||v.getUint32(n+16)!==flags||expanded[n+23]!==0)invalid();const count=expanded[n+22];if(count<1||count>4||expanded.subarray(n+24+count*2,n+32).some(Boolean))invalid();
 const crew=aliceCrewConfig({enabled:Boolean(flags&2),spBase:v.getUint16(n+20),unitIds:Array.from({length:count},(_,i)=>v.getUint16(n+24+i*2)),spirits:Array.from({length:6},(_,i)=>({id:expanded[n+32+i*2],level:expanded[n+33+i*2]}))});
 const decoded=expanded.slice(0,n),pointer=target(decoded,112)+399*4;if(pointer+4>n)invalid();d(decoded).setInt32(pointer,v.getInt32(n+12));const p=pos(decoded);d(decoded).setInt32(p.full,v.getInt32(n));d(decoded).setInt32(p.short,v.getInt32(n+4));d(decoded).setInt32(8,v.getInt32(n+8));const canonical=decoded;
 const enabled=Boolean(flags&1),rebuilt=writeAliceCrewV4(canonical,enabled,crew,{gameId,faceInstalled:true});if(!same(rebuilt,stored))invalid();return{decoded:canonical,enabled,faceInstalled:true,crew,version:4,compact:false,faceId:342};
}
