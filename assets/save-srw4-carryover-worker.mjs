import {inspectPatchedImage,isLatestEditorBase,PRODUCTION_TRUST} from './editor-core.mjs?v=20261113-alicecopies1&savefast=20261114-6&f65fix=20261116-1&editorcompat=20261125-1';
import {openSave} from './save-core.mjs?v=20261113-alicecopies1&saveturns=20261116-1&carryover=20261117-1';

const looksLikeFile=(value,max)=>value instanceof Blob&&value.size>0&&value.size<=max;
const DEFAULT_RELEASE=Object.freeze({'srwf-f':'srwf-f-20260928-v0-5-a','srwf-final':'srwf-final-20261005-v0-3-c'});

function descriptorFor(blob,gameId){
  // Bind to the existing production trust, never to caller-supplied digests or
  // an editor tab's unsaved view. Prefer the canonical family default.
  const candidates=Object.entries(PRODUCTION_TRUST.targets).filter(([hash,d])=>d.gameId===gameId&&d.size===blob.size&&isLatestEditorBase(gameId,hash)&&d.kind!=='stock');
  const chosen=candidates.find(([,d])=>d.releaseId===DEFAULT_RELEASE[gameId])??candidates[0];
  if(!chosen)throw Error('지원하는 최신 공개 패치에서 내보낸 BIN이 아닙니다.');
  return {gameId,targetSize:blob.size,targetSha256:chosen[0],imageKind:'local'};
}
async function readCatalog(blob,gameId){
  const {view}=await inspectPatchedImage(blob,descriptorFor(blob,gameId));
  if(typeof view.srw4Installed?.aliceEnabled!=='boolean')throw Error('두 게임 모두 제4차 연동을 적용해 저장한 BIN이어야 합니다.');
  const {targetHash,srw4Installed,units,weapons,partNames}=view;
  // No original disc/blob, glyph buffers, or unrelated views retained here.
  return {gameId,targetHash,srw4Installed,units,weapons,partNames};
}
// Shared with the private end-to-end runner, without relaxing the browser's
// production disc verification or accepting an externally prepared catalog.
export async function prepareSrw4Carryover({fDisc,finalDisc,save:saveFile},{onProgress=()=>{}}={}){
  if(!looksLikeFile(fDisc,900*1024*1024)||!looksLikeFile(finalDisc,900*1024*1024)
    ||!looksLikeFile(saveFile,0x800000))throw Error('F BIN, 완결편 BIN, F 클리어 일반 저장 파일을 모두 선택하세요.');
  const save=await openSave(new Uint8Array(await saveFile.arrayBuffer()));
  const slots=Object.freeze(save.list().filter(r=>r.gameId==='srwf-f'&&r.editable&&r.completedEpisode===34&&r.nextScenarioIndex===73)
    .map(r=>Object.freeze({key:r.key,name:r.name,totalTurns:r.totalTurns,dateMinutes:r.dateMinutes})));
  if(!slots.length)throw Error('이 파일에는 승계할 수 있는 F 34화 완료 일반 저장이 없습니다.');
  onProgress('F의 제4차 연동 BIN 검증 중…');
  const source=await readCatalog(fDisc,'srwf-f');
  onProgress('완결편의 제4차 연동 BIN 검증 중…');
  const target=await readCatalog(finalDisc,'srwf-final');
  const keys=new Set(slots.map(r=>r.key));
  return Object.freeze({slots,async build(key){
    if(!keys.has(key))throw Error('확인한 F 클리어 슬롯을 다시 선택하세요.');
    return {...await save.exportSrw4CarryoverCopy(key,source,target),format:save.format};
  }});
}


// Optional save companion for the existing BIN/CUE output, not a rewrite
// of the selected save. General saves and unrelated slots are not exported.
export async function prepareAutomaticCarryover({fDisc,finalDisc,save:saveFile},{onProgress=()=>{}}={}){
 if(!looksLikeFile(saveFile,0x800000)||!looksLikeFile(fDisc,900*1024*1024)||!looksLikeFile(finalDisc,900*1024*1024))
  throw Error('4차 연동된 F BIN과 F 클리어 세이브를 확인해 주세요.');
 const model=await openSave(new Uint8Array(await saveFile.arrayBuffer()));
 const clear=model.list().filter(r=>r.gameId==='srwf-f'&&r.editable&&r.completedEpisode===34&&r.nextScenarioIndex===73);
 if(!clear.length)return Object.freeze({slots:[],build:null});
 onProgress('F의 4차 연동 BIN 확인 중…');
 const source=await readCatalog(fDisc,'srwf-f');
 const linkedIds=new Set(source.units.filter(r=>r.srw4Native===true).map(r=>r.recordIndex));
 const linked=clear.filter(r=>r.units.some(unit=>linkedIds.has(unit.id)));
 if(!linked.length)return Object.freeze({slots:[],build:null});
 onProgress('저장할 완결편 BIN에서 4차 기체 확인 중…');
 const target=finalDisc.size===644650272
  ? await (await import('./nightly-carryover-catalog.mjs?v=20261113-alicecopies1&nightly=20261128-2')).readNightlyCarryoverCatalog(finalDisc)
  : await readCatalog(finalDisc,'srwf-final');
 const slots=Object.freeze(linked.map(({key,name,totalTurns})=>Object.freeze({key,name,totalTurns})));
 const keys=new Set(slots.map(row=>row.key));
 return Object.freeze({slots,async build(key){
  if(!keys.has(key))throw Error('확인한 4차 연동 클리어 슬롯만 옮길 수 있습니다.');
  return {...await model.exportSrw4CarryoverCopy(key,source,target),format:model.format};
 }});
}

let ready=null,busy=false;
if(typeof self!=='undefined')self.addEventListener('message',async({data})=>{
  if(busy||!data||!['PREPARE','EXPORT','AUTO'].includes(data.type))return;
  busy=true;
  try{
    if(data.type==='PREPARE'){
      ready=null;
      ready=await prepareSrw4Carryover(data,{onProgress:message=>self.postMessage({type:'PROGRESS',message})});
      self.postMessage({type:'READY',slots:ready.slots});
    }else if(data.type==='AUTO'){
      ready=null;
      ready=await prepareAutomaticCarryover(data,{onProgress:message=>self.postMessage({type:'PROGRESS',message})});
      if(!ready.slots.length)self.postMessage({type:'NO_LINKED_SAVE'});
      else if(ready.slots.length===1){
        const result=await ready.build(ready.slots[0].key);
        self.postMessage({type:'COMPLETE',...result},[result.bytes.buffer]);
      }else self.postMessage({type:'READY',slots:ready.slots});
    }else{
      if(!ready)throw Error('두 BIN과 F 클리어 저장을 다시 확인하세요.');
      const result=await ready.build(data.key);
      self.postMessage({type:'COMPLETE',...result},[result.bytes.buffer]);
    }
  }catch(error){
    self.postMessage({type:'ERROR',scope:data.type,message:error?.message||'승계용 복사본을 준비하지 못했습니다.'});
  }finally{busy=false;}
});
