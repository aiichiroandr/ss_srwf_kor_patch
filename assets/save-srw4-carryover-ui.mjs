const byId=id=>document.getElementById(id);
const root=byId('srw4CarryoverDialog');
if(root){
  const openBtn=byId('srw4CarryoverOpen'),closeBtn=byId('srw4CarryoverClose'),
    openers=[...new Set([openBtn,...(document.querySelectorAll?.('[data-carryover-open]')??[])].filter(Boolean))],
    f=byId('srw4CarryoverF'),final=byId('srw4CarryoverFinal'),save=byId('srw4CarryoverSave'),
    attest=byId('srw4CarryoverAttest'),verify=byId('srw4CarryoverVerify'),status=byId('srw4CarryoverStatus'),
    slots=byId('srw4CarryoverSlots'),select=byId('srw4CarryoverSlot'),create=byId('srw4CarryoverCreate'),
    cancel=byId('srw4CarryoverCancel'),result=byId('srw4CarryoverResult'),download=byId('srw4CarryoverDownload'),
    edits=byId('srw4CarryoverEdits');
  let worker=null,url=null,busy=false,validated=false,lastOpener=null;
  const note=(message,error=false)=>{status.textContent=message;status.classList.toggle('is-error',error);};
  const canVerify=()=>Boolean(f.files?.[0]&&final.files?.[0]&&save.files?.[0]&&attest.checked);
  function clearResult(){
    if(url)URL.revokeObjectURL(url);
    url=null;download.removeAttribute('href');result.hidden=true;edits.replaceChildren();
  }
  function sync(){
    verify.disabled=busy||!canVerify();
    create.disabled=busy||!validated||select.value==='';
    slots.hidden=!validated;
    cancel.hidden=!worker;
    for(const element of [f,final,save,attest,select])element.disabled=busy;
  }
  function reset(message='두 게임의 맞는 BIN과 F의 클리어 일반 저장 사본을 선택하세요.'){
    worker?.terminate();worker=null;busy=false;validated=false;select.replaceChildren();clearResult();note(message);sync();
  }
  for(const element of [f,final,save,attest])element.addEventListener('change',()=>reset());
  select.addEventListener('change',()=>{clearResult();sync();});
  cancel.addEventListener('click',()=>reset('작업을 취소했습니다. 원본 파일은 바뀌지 않았습니다.'));
  for(const button of openers)button.addEventListener('click',()=>{if(!root.open){lastOpener=button;root.showModal();}});
  closeBtn?.addEventListener('click',()=>root.close());
  root.addEventListener('close',()=>{if(worker||url)reset();const target=lastOpener??openBtn;lastOpener=null;target?.focus?.({preventScroll:true});});
  window.addEventListener('pagehide',()=>{worker?.terminate();if(url)URL.revokeObjectURL(url);});
  verify.addEventListener('click',()=>{
    if(busy||!canVerify())return;
    reset();busy=true;
    try{
      const current=new Worker(new URL('./save-srw4-carryover-worker.mjs?v=20261113-alicecopies1&carryover=20261117-1&editorcompat=20261125-1',import.meta.url),{type:'module',name:'srwf-clear-save-carryover'});
      worker=current;
      current.addEventListener('error',()=>{
        if(worker!==current)return;
        reset();note('검증을 시작하지 못했습니다. 원본 파일은 바뀌지 않았습니다.',true);
      });
      current.addEventListener('message',({data})=>{
        if(worker!==current)return;
        if(data.type==='PROGRESS'){note(data.message);return;}
        busy=false;
        if(data.type==='READY'){
          validated=true;
          const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='슬롯을 선택하세요';select.append(placeholder);
          for(const slot of data.slots){const option=document.createElement('option');option.value=String(slot.key);option.textContent=`${slot.name} · 34화 완료 · 총 ${slot.totalTurns}턴`;select.append(option);}
          note('두 BIN이 확인됐습니다. 이어할 F 클리어 저장 슬롯을 선택하세요.');
        }else if(data.type==='ERROR'){
          if(data.scope==='PREPARE')reset();
          note(data.message,true);
        }else if(data.type==='COMPLETE'){
          clearResult();
          url=URL.createObjectURL(new Blob([data.bytes],{type:'application/octet-stream'}));
          download.href=url;download.download=`FINAL-승계전용-${save.files?.[0]?.name??'save.bcr'}`;
          for(const edit of data.edits){const li=document.createElement('li');li.textContent=`${edit.name} · #${edit.from} → #${edit.to}`;edits.append(li);}
          note('승계용 복사본을 만들었습니다. 원본은 변경하지 않았습니다.');result.hidden=false;
        }
        sync();
      });
      note('F 클리어 일반 저장 확인 중…');sync();
      current.postMessage({type:'PREPARE',fDisc:f.files?.[0],finalDisc:final.files?.[0],save:save.files?.[0]});
    }catch(error){reset();note(error.message,true);}
  });
  create.addEventListener('click',()=>{
    if(!worker||!validated||busy||select.value==='')return;
    clearResult();busy=true;note('변경할 기체 번호와 저장 사본을 검증 중…');sync();
    worker.postMessage({type:'EXPORT',key:Number(select.value)});
  });
  sync();
}
