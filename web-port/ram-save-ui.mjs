import {readSave,lockSave,commitRamImport,readRamRecovery} from './saves.mjs?v=ram1';
import {belongsToGame,MAX_IMAGE_BYTES} from './ram-save.mjs?v=ram1';
const $=id=>document.getElementById(id);
function job(data){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./ram-save-worker.mjs?v=ram1',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>finish(Error('RAM 파일 처리 시간이 초과되었습니다.')),15000);
  function finish(error,result){clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);}
  worker.onmessage=({data:d})=>finish(d.error?Error(d.error):null,d.result);
  worker.onerror=()=>finish(Error('RAM 파일을 처리하지 못했습니다.'));
  worker.postMessage(data);
 });
}
export function initRamSaveUI(api){
 let preview=null,sequence=0,working=false;
 const status=message=>$('ram-status').textContent=message;
 const game=()=>$('game').value;
 const clear=()=>{sequence++;preview=null;$('ram-preview').hidden=true;$('ram-load').value='';$('ram-overwrite').checked=false;};
 async function recovery(){const g=game();try{const r=await readRamRecovery(g);if(g===game())$('ram-recover').disabled=api.busy()||working||!r;}catch{ $('ram-recover').disabled=true;}}
 function setBusy(value){for(const id of ['ram-load','ram-apply','ram-recover','ram-export','ram-format','ram-overwrite'])$(id).disabled=value||working;if(value)clear();else void recovery();}
 $('game').addEventListener('change',()=>{clear();status('선택한 게임의 저장을 가져옵니다.');void recovery();});
 $('ram-load').onchange=async()=>{
  if(api.busy()||working)return;
  const file=$('ram-load').files[0];clear();if(!file)return;
  const token=sequence,g=game();status('RAM 파일 검사 중…');
  try{
   if(file.size>MAX_IMAGE_BYTES)throw Error('RAM 파일은 8 MB 이하만 지원합니다.');
   const bytes=new Uint8Array(await file.arrayBuffer()),result=await job({type:'inspect',bytes}),record=await readSave(g);
   if(token!==sequence||g!==game()||api.busy())return;
   preview={bytes,game:g,expected:record?.bytes,result};
   $('ram-entries').replaceChildren();
   for(const entry of result.entries){
    const row=document.createElement('label');row.className='ram-entry';const cb=document.createElement('input');cb.type='checkbox';cb.value=entry.name;cb.disabled=!belongsToGame(entry,g);
    const text=document.createElement('span');text.textContent=`${entry.name} · ${entry.payload.length.toLocaleString()} B${cb.disabled?' · 다른 게임 또는 미확인 저장':''}`;
    row.append(cb,text);$('ram-entries').append(row);
   }
   $('ram-preview').hidden=false;
   status(`${result.capacity/1024} KB ${result.interleaved?'인터리브':'표준'} RAM · ${result.entries.length}개 저장. 가져올 항목을 선택하세요. 기존의 다른 저장은 유지합니다.`);
  }catch(e){if(token===sequence)status(e.message);}
 };
 async function mutate(prepare){
  if(api.busy()||working)return;
  const g=game();working=true;api.setBusy(true);let release;
  try{
   release=await lockSave(g);
   const {bytes,expected}=await prepare(g);
   await commitRamImport(g,bytes,expected);await api.changed();status('저장 적용 완료. 가져오기 직전 복원점도 별도로 보관했습니다.');
  }catch(e){status(`적용하지 못했습니다: ${e.message}`);}
  finally{release?.();working=false;api.setBusy(false);clear();void recovery();}
 }
 $('ram-apply').onclick=()=>{
  const pending=preview,names=[...$('ram-entries').querySelectorAll('input:checked')].map(x=>x.value),overwrite=$('ram-overwrite').checked;
  if(!pending||pending.game!==game()||!names.length){status('가져올 저장을 선택하세요.');return;}
  void mutate(async g=>({bytes:await job({type:'merge',bytes:pending.bytes,current:pending.expected,names,game:g,overwrite}),expected:pending.expected}));
 };
 $('ram-recover').onclick=()=>void mutate(async g=>{
  const before=await readSave(g),r=await readRamRecovery(g);if(!r)throw Error('RAM 가져오기 복원점이 없습니다.');return {bytes:r.bytes,expected:before?.bytes};
 });
 $('ram-export').onclick=async()=>{
  if(api.busy()||working)return;
  const g=game(),format=$('ram-format').value;working=true;api.setBusy(true);
  try{
   const record=await readSave(g);if(!record?.bytes?.length)throw Error('내보낼 저장이 없습니다. 먼저 게임 안에서 저장하세요.');
   const bytes=await job({type:'export',bytes:record.bytes,options:{capacity:format==='bcr'?524288:32768,interleaved:format==='bin'}});
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=`srwf-${g}-${Date.now()}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status('RAM 파일을 만들었습니다. 원래 에뮬레이터의 기존 RAM 파일은 따로 보관하세요.');
  }catch(e){status(e.message);}finally{working=false;api.setBusy(false);}
 };
 void recovery();return {setBusy};
}
