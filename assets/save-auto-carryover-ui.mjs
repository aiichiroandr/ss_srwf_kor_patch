const MAX_SAVE=8*1024*1024;
const asFile=h=>h.kind==='file'&&typeof h.getFile==='function';
const readHeader=async f=>new TextDecoder('latin1').decode(await f.slice(16,128).arrayBuffer());
async function isFDisc(f){
 if(f.size<400*1024*1024||f.size>900*1024*1024)return false;
 const header=await readHeader(f);
 return header.startsWith('SEGA SEGASATURN')&&header.includes('T-20610G');
}
const isSaveFile=f=>f.size>0&&f.size<=MAX_SAVE&&!/^FINAL-승계전용-/i.test(f.name)&&/\.(bkr|bcr|sav|srm|gz)$/i.test(f.name);
export async function findAutomaticCarryoverInputs(handles,{rememberedF,stale=()=>false}={}){
 const sources=[],saves=[];
 if(rememberedF)sources.push(rememberedF);
 for(const handle of (Array.isArray(handles)?handles.slice(0,96):[])){
  if(stale())return {};
  if(!asFile(handle)||!/\.(bin|bkr|bcr|sav|srm|gz)$/i.test(handle.name))continue;
  try {
   const file=await handle.getFile();
   if(isSaveFile(file))saves.push(file);
   else if(!rememberedF&&/\.bin$/i.test(file.name)&&await isFDisc(file))sources.push(file);
  } catch {/* Unreadable or unrelated input file. */}
 }
 if(stale())return {};
 return {f:sources.length===1?sources[0]:null,save:saves.length===1?saves[0]:null,ambiguous:sources.length>1||saves.length>1};
}
export function createAutoCarryoverUI({root,status,details,fInput,saveInput,slot,download,createWorker}){
 let out=null,seq=0,worker=null,url=null,companion=null,pending=false,detected={};
 function resetView(){
  worker?.terminate();worker=null;
  if(url)URL.revokeObjectURL(url);
  url=null;companion=null;pending=false;
  download.hidden=true;download.removeAttribute('href');download.removeAttribute('download');
  slot.hidden=true;slot.replaceChildren?.();
 }
 function clear(){
  seq++;resetView();out=null;detected={};
  root.hidden=true;details.open=false;
  fInput.value='';saveInput.value='';
 }
 function run(ticket){
  const f=fInput.files?.[0]??detected.f,save=saveInput.files?.[0]??detected.save;
  resetView();
  if(!out||!f||!save||ticket!==seq)return;
  pending=true;
  status.textContent='4차 연동 세이브인지 확인 중입니다.';
  try{
   const w=worker=createWorker();
   w.addEventListener('error',event=>{
    if(ticket!==seq||worker!==w)return;
    console.error('4차 자동 승계 워커를 시작할 수 없습니다.',event.message);
    resetView();details.open=true;status.textContent='4차 연동 세이브를 확인하지 못했습니다. 원본은 변경되지 않았습니다.';
   });
   w.addEventListener('message',({data})=>{
    if(ticket!==seq||worker!==w||!data)return;
    if(data.type==='PROGRESS'){status.textContent=data.message;return;}
    pending=false;
    if(data.type==='READY'){
     slot.replaceChildren();
     const first=document.createElement('option');first.value='';first.textContent='이어할 슬롯 선택';slot.append(first);
     for(const r of data.slots){const option=document.createElement('option');option.value=String(r.key);option.textContent=r.name+' · 총 '+r.totalTurns+'턴';slot.append(option);}
     slot.hidden=false;status.textContent='4차 연동 클리어 저장이 여러 개입니다. 이어할 슬롯만 골라 주세요.';
     return;
    }
    w.terminate();worker=null;
    if(data.type==='COMPLETE'&&data.bytes instanceof Uint8Array&&data.bytes.length>0&&data.bytes.length<=MAX_SAVE){
     const blob=new Blob([data.bytes],{type:'application/octet-stream'});
     const suffix=(save.name?.match(/\.(?:bkr|bcr|srm|sav|gz)$/i)?.[0]??'.bcr').toLowerCase();
     const label=(save.name??'save').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,75);
     const name='FINAL-승계전용-'+(label.toLowerCase().endsWith(suffix)?label:label+suffix);
     companion={blob,name};url=URL.createObjectURL(blob);
     download.href=url;download.download=name;download.hidden=false;details.open=false;
     status.textContent='4차 연동 승계용 사본을 만들었습니다. 원본은 그대로입니다. 이 사본은 완결편에서만 쓰세요.';
    }else if(data.type==='NO_LINKED_SAVE'){
     status.textContent='이 파일에는 변환할 4차 연동 클리어 저장이 없습니다. 기존 게임 승계를 사용하세요.';
    }else{
     details.open=true;
     status.textContent=data.message??'4차 연동 세이브를 바꾸지 않았습니다. 두 게임의 연동 BIN과 저장을 다시 확인하세요.';
    }
   });
   w.postMessage({type:'AUTO',fDisc:f,finalDisc:out,save});
  }catch{
   resetView();details.open=true;status.textContent='4차 연동 검사를 시작하지 못했습니다. 원본은 변경되지 않았습니다.';
  }
 }
 for(const e of [fInput,saveInput])e.addEventListener('change',()=>run(seq));
 slot.addEventListener('change',()=>{
  if(!worker||pending||slot.value==='')return;
  pending=true;status.textContent='선택한 슬롯의 승계용 사본을 만드는 중입니다.';
  worker.postMessage({type:'EXPORT',key:Number(slot.value)});
 });
 return Object.freeze({clear, async start({bin,handles,rememberedF}){
  clear();out=bin;
  if(!(bin instanceof Blob))return;
  const ticket=seq;
  root.hidden=false;pending=true;status.textContent='같은 폴더에 기존 F 클리어 세이브가 있는지 확인합니다.';
  try{const found=await findAutomaticCarryoverInputs(handles,{rememberedF,stale:()=>ticket!==seq});
   if(ticket!==seq)return;detected=found;pending=false;
   if(detected.f&&detected.save)run(ticket);
   else status.textContent=found.ambiguous?'후보가 여러 개입니다. 필요한 경우 F 연동 BIN과 세이브를 골라 주세요.':'4차 연동 세이브가 있는 경우 아래에서 연결할 수 있습니다. 일반 승계에는 이 기능이 필요 없습니다.';
  }catch{if(ticket===seq){pending=false;status.textContent='같은 폴더의 세이브를 확인하지 못했습니다. 필요한 경우 파일을 골라 주세요.';}}
 },pending:()=>pending,result:()=>companion});
}
