import {saveNameFields,savedHeroUnitId,decodeSaveName,encodeSaveName} from './save-names.mjs?v=20261104-save3';
export function checkSaveCompatibility(records,source,target){
 const issues=[],names=[];let unitCount=0;
 const add=(record,code,message)=>issues.push({save:record.name,code,message});
 if(source.gameId!==target.gameId)throw Error('서로 다른 게임의 세이브는 이전할 수 없습니다.');
 const units=new Map((target.units??[]).map(r=>[r.recordIndex,r])),oldUnits=new Map((source.units??[]).map(r=>[r.recordIndex,r]));
 const pilots=new Map((target.pilots??[]).map(r=>[r.recordIndex,r])),oldPilots=new Map((source.pilots??[]).map(r=>[r.recordIndex,r]));
 const weapons=new Map((target.weapons??[]).map(r=>[r.recordIndex,r])),oldWeapons=new Map((source.weapons??[]).map(r=>[r.recordIndex,r]));
 const sourceGlyphs=source.glyphMap??new Map((source.glyphEntries??[]).map(e=>[e.code,e.unicode]));
 const targetGlyphs=target.glyphMap??new Map((target.glyphEntries??[]).map(e=>[e.code,e.unicode]));
 for(const record of records){
  if(record.gameId!==source.gameId)continue;
  if(!record.editable){add(record,'save-format',record.reason);continue;}
  const formNames=saveNameFields(record).filter(s=>s.unitSlot!==undefined).map(s=>decodeSaveName(record,s.field,{glyphMap:sourceGlyphs}));
  if(formNames.length===3&&formNames.some(Boolean)&&formNames.some(t=>!t))add(record,'unit-name-group','세 형태의 기체명이 불완전합니다. 첫 형태가 비면 게임에서 전체 이름이 적용되지 않습니다.');
  for(const spec of saveNameFields(record)){
   const {field}=spec,current=record[field+'Bytes'];
   if(!current?.length){if(spec.kind==='save')add(record,'name-decode',`${spec.label} 저장칸이 없습니다.`);continue;}
   const text=decodeSaveName(record,field,{glyphMap:sourceGlyphs});
   if(text===null||spec.kind==='save'&&text===''){add(record,'name-decode',`${spec.label}을 이전 ROM 문자표로 읽을 수 없습니다.`);continue;}
   if(text==='')continue; // An unused alias/default mecha name has no glyphs to remap.
   if(spec.unitSlot!==undefined){
    const id=savedHeroUnitId(record,spec.unitSlot),a=oldUnits.get(id),b=units.get(id);
    if(!a?.identity||a.identity!==b?.identity){add(record,'unit-name-identity',`주인공 기체명 ${spec.unitSlot+1}의 대상 #${id}가 새 ROM에서 같다는 것을 확인하지 못했습니다.`);continue;}
    if(!Array.isArray(a.saveNameDefaultBytes)||a.saveNameDefaultBytes.length!==10||!Array.isArray(b.saveNameDefaultBytes)||b.saveNameDefaultBytes.length!==10){add(record,'unit-name-capacity',`주인공 기체 #${id}의 이름 복원 공간을 확인하지 못했습니다.`);continue;}
   }
   // Default names may be represented by a compact native token that expands
   // to more than 14 Korean bytes. Preserve it if the destination reads it identically.
   const destinationText=decodeSaveName(record,field,{glyphMap:targetGlyphs});
   if(destinationText===text){names.push({key:record.key,field,text,changed:false});continue;}
   try{
    const bytes=encodeSaveName(record,field,text,{glyphMap:targetGlyphs});
    const same=bytes.every((b,i)=>current[i]===b);
    names.push({key:record.key,field,text,changed:!same});
   }catch(error){add(record,'name-encode',`${text}: ${error.message}`);}
  }
  for(const pilot of record.pilots){const a=oldPilots.get(pilot.id),b=pilots.get(pilot.id);
   if(!a?.identity||a.identity!==b?.identity)add(record,'pilot-identity',`파일럿 #${pilot.id}의 동일성을 확인하지 못했습니다.`);
  }
  for(const unit of record.units){unitCount++;const a=oldUnits.get(unit.id),b=units.get(unit.id);
   if(!a?.identity||a.identity!==b?.identity){add(record,'unit-identity',`기체 #${unit.id}가 새 ROM에서 없거나 다른 기체입니다. ROM 에딧부터 이전해 주세요.`);continue;}
   if(a.construction?.preset!==(b.pendingConstruction??b.construction?.preset)){add(record,'unit-restoration',`추가 기체 #${unit.id}의 복구 설정이 다릅니다. ROM 에딧부터 이전해 주세요.`);continue;}
   const bySlot=r=>{const m=new Map();for(const e of r.weaponList?.entries??[]){const list=m.get(e.slot)??[];list.push(e.weaponIndex);m.set(e.slot,list);}return m;};
   const before=bySlot(a),after=bySlot(b);
   for(let i=0;i<unit.weaponUpgrades.length;i++)if(unit.weaponUpgrades[i]){
    const oldIds=before.get(i+1)??[],newIds=after.get(i+1)??[];
    if(JSON.stringify(oldIds)!==JSON.stringify(newIds)){add(record,'upgrade-slot',`기체 #${unit.id}의 개조 슬롯 ${i+1}에 연결된 무기가 달라졌습니다.`);continue;}
    for(const id of new Set(oldIds)){
     const old=oldWeapons.get(id),next=weapons.get(id);
     const oldIdentity=old?.saveIdentity??old?.identity,nextIdentity=next?.saveIdentity??next?.identity;
     if(!oldIdentity||oldIdentity!==nextIdentity)add(record,'weapon-identity',`기체 #${unit.id}의 개조 슬롯 ${i+1}: 무기 #${id}의 버전 간 동일성을 확인하지 못했습니다.`);
    }
   }
   for(const id of unit.parts??[])if(id&&source.partNames?.[id]&&!target.partNames?.[id])add(record,'part-id',`장착 파츠 #${id}가 새 ROM에 없습니다.`);
  }
 }
 return {compatible:issues.length===0,issues,names,unitCount,saveCount:records.filter(r=>r.gameId===source.gameId).length};
}
export function applyCompatibleNames(session,report){
 if(!report.compatible)throw Error('호환 문제를 해결하기 전에는 세이브를 변환할 수 없습니다.');
 if(typeof session.editNames==='function'){
  const groups=new Map();for(const entry of report.names){const group=groups.get(entry.key)??[];group.push(entry);groups.set(entry.key,group);}
  for(const [key,entries]of groups)if(entries.some(e=>e.changed))session.editNames(key,Object.fromEntries(entries.map(e=>[e.field,e.text])));
  return;
 }
 for(const entry of report.names)if(entry.changed)session.editName(entry.key,entry.field,entry.text);
}
