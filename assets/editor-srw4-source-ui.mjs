import {alicePortrait} from './editor-alice.mjs?v=20261113-alicecopies1';
import {decodeMapIcon} from './editor-map-icons.mjs?v=20261113-alicecopies1';
const LABELS = {'s-gundam':'S건담','exs-gundam':'Ex-S건담',sirbine:'서바인',zwauss:'즈와우스','blood-temple':'블러드 템플','s-gcruiser':'S G크루저','exs-gcruiser':'Ex-S G크루저'};
const node = (tag, text, className) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n; };

// Inline catalogue, not another dialog. Undecoded categories never masquerade
// as imported graphics and a refused replacement keeps the previous catalogue.
export function createSrw4SourcePanel(root, host) {
  let report=null, working=false;
  const heading=node('h3','제4차 Rev 1 연동 · F/F완결편 기체 추가');
  const tools=node('div',undefined,'srw4-source-tools');
  const open=node('button','제4차 ROM 연결','record-tool'); open.type='button';open.id='srw4SourceOpen';
  const clear=node('button','연결 해제','record-tool'); clear.type='button'; clear.hidden=true;
  const undo=node('button','가져오기 취소','record-tool');undo.type='button';undo.hidden=true;undo.title='이번 가져오기로 추가된 형태를 함께 제거하고 기존 기체와 개인 편집은 유지합니다.';
  const cancel=node('button','중단','record-tool'); cancel.type='button'; cancel.hidden=true;
  const file=node('input'); file.type='file'; file.accept='.sfc,.smc,.zip'; file.hidden=true;
  const status=node('p','제4차 SFC 일본판 Rev 1 원본(SFC/SMC/ZIP)을 검증하면 기본 기체 5대와 변형 2형태를 추가합니다. 기존 기체는 중복 추가하지 않습니다.');status.setAttribute('role','status');
  status.id='srw4SourceStatus';
  const progress=node('progress',undefined,'srw4-source-progress');progress.max=1;progress.hidden=true;progress.setAttribute('aria-label','제4차 원본 읽기와 검증 진행 중');progress.setAttribute('aria-describedby',status.id);
  const note=node('p','F: 슈퍼계·리얼계 모두 1화 클리어 뒤 첫 인터미션에서 기본 5기가 사용 가능해집니다. F완결편: 세이브 인계 없는 새 게임의 시작 인터미션에서 기본 5기가 바로 사용 가능해집니다.','srw4-source-note');
  const saveNote=node('p','두 G크루저는 독립 추가 기체가 아닌 변형입니다. ALICE는 동승을 켠 전용 서브파일럿만 등록합니다. 기존 세이브는 검증된 Rev1 연결 후 세이브 에디터에서 같은 게임 세이브를 열고 기체 → ＋ 기체 추가에서 연결된 카탈로그를 고르세요. 수정한 BIN/CUE와 세이브를 함께 저장해 사용하세요.','srw4-source-note');
  const results=node('div',undefined,'srw4-source-results');results.hidden=true;
  tools.append(open,clear,undo,cancel,file);root.append(heading,tools,status,progress,note,saveNote,results);

  function refresh() {
    const ready=host.canConnect();open.disabled=working||!ready;clear.disabled=working||!ready;
    clear.hidden=!report;
    undo.hidden=!host.canUndo?.();undo.disabled=working||!ready;
    cancel.hidden=!working;
  }
  function render() {
    results.replaceChildren();results.hidden=!report;
    if(!report)return;
    const group=node('div',undefined,'srw4-source-known');
    for(const asset of report.assets) {
      const name=LABELS[asset.key]??asset.key;
      const row=node('div',undefined,'srw4-source-asset');
      row.append(node('strong',name));
      const previews=node('div',undefined,'srw4-source-previews');
      const presets={'exs-gundam':'ex-s-gundam','s-gcruiser':'s-g-cruiser','exs-gcruiser':'g-cruiser'},preset=presets[asset.key]??asset.key;
      const slot=preset==='blood-temple'?62:(report.targetGameId==='srwf-f'?319:336)+['s-gundam','ex-s-gundam','sirbine','zwauss','s-g-cruiser','g-cruiser'].indexOf(preset);
      const rgba=decodeMapIcon(report.targetMapIcons,slot,'player');
      if(rgba)previews.append(iconPreview(rgba,name));
      row.append(previews);
      if(!previews.children.length)row.append(node('small','아이콘 미확인'));
      group.append(row);
    }
    if(report.aliceRegistered){const portrait=alicePortrait(),row=node('div',undefined,'srw4-source-asset');row.append(node('strong','ALICE'));const previews=node('div',undefined,'srw4-source-previews');previews.append(iconPreview(portrait.pixels,'ALICE',portrait.width,portrait.height));row.append(previews);group.append(row);}
    results.append(group);
  }
  function iconPreview(pixels,label,width=16,height=16){
    const wrap=node('figure'),canvas=node('canvas');canvas.width=width;canvas.height=height;canvas.className='srw4-source-icon';canvas.title=label;canvas.setAttribute('aria-label',label);
    const ctx=canvas.getContext?.('2d');if(ctx?.createImageData&&ctx.putImageData){const image=ctx.createImageData(width,height);image.data.set(pixels);ctx.putImageData(image,0,0);}wrap.append(canvas);return wrap;
  }
  async function run(source,undoImport=false) {
    if(working||!host.canConnect())return;
    working=true;refresh();progress.hidden=false;progress.removeAttribute('value');status.textContent=source?'제4차 원본을 읽고 있습니다…':undoImport?'가져오기 취소 중…':'연결 해제 중…';
    try {
      const next=await(undoImport?host.undo():host.connect(source));report=next;
      status.textContent=report?`제4차 확인 · ${report.addedUnitCount??0}형태 추가 · ${report.beamApplied?'Ex-S 빔포 자동 적용':'Ex-S 전용 빔포 연결 확인 필요'}${report.aliceHint?` · ${report.aliceHint}`:''}`:undoImport?'제4차 가져오기를 취소했습니다. 기존 기체와 개인 편집은 유지했습니다.':host.canUndo?.()?'원본 연결을 해제했습니다. 저장하려면 원본을 다시 연결하거나 가져오기를 취소해 주세요.':'제4차 자료 연결을 해제했습니다.';
      status.title=report?`${report.identity.title??'제4차 Rev 1'} · SHA-256 ${report.identity.sha256}`:'';
      render();
    } catch(error) {
      status.textContent=error?.name==='AbortError'?'자료 확인을 중단했습니다.':error?.message??'제4차 원본을 확인하지 못했습니다.';
    } finally {working=false;progress.hidden=true;file.value='';refresh();}
  }
  open.addEventListener('click',()=>{if(!open.disabled)file.click();});
  clear.addEventListener('click',()=>run(null));
  undo.addEventListener('click',()=>run(null,true));
  cancel.addEventListener('click',()=>host.cancel?.());
  file.addEventListener('change',()=>{if(file.files?.[0])void run(file.files[0]);});
  refresh();
  return Object.freeze({refresh,reset(){report=null;progress.hidden=true;status.textContent='제4차 SFC 일본판 Rev 1 원본(SFC/SMC/ZIP)을 검증하면 기본 기체 5대와 변형 2형태를 추가합니다. 기존 기체는 중복 추가하지 않습니다.';render();refresh();},progress(value){
    if(!working)return;
    if(value?.phase==='srw4-read')status.textContent='제4차 원본을 읽고 있습니다…';
    else if(value?.phase==='srw4-source')status.textContent=value.processed>=value.total?'검증 완료 · 기체 추가를 준비하고 있습니다…':'원본 파일을 검증하고 있습니다…';
    else if(value?.phase==='srw4-icon-scan')status.textContent='원본 확인 완료 · 기체 아이콘을 검사하고 있습니다…';
    else if(value?.phase==='srw4-target-check')status.textContent='연결할 기체의 저장 공간을 확인하고 있습니다…';
  }});
}
