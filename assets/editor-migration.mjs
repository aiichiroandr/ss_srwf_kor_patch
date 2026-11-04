import {createScenarioModel} from './editor-scenario-model.mjs?v=20261105-part2';
import {findPatchedEditorImage} from './editor-directory.mjs?v=20261105-part2';
// Semantic transfer only: old disc offsets and compressed bytes are never copied.
import {buildPreset,parsePreset,serializePreset,PRESET_TABLE_KEYS} from './editor-preset.mjs?v=20261105-part2';
import {inspectMigrationImage,PRODUCTION_TRUST} from './editor-core.mjs?v=20261105-part2';
import {constructUnitRow,unitConstructionPreset} from './editor-unit-construction.mjs?v=20261105-part2';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function extractMigrationPreset(base,edited){
 if(base.gameId!==edited.gameId||base.targetHash!==edited.baseTargetSha256||!['accepted','stock'].includes(base.provenanceMode))throw Error('편집본과 정확히 같은 버전·글꼴의 편집 전 기준 BIN이 필요합니다.');
 const tables={},warnings=[],oldScenario=createScenarioModel(base),newScenario=createScenarioModel(edited),scenarioKinds=new Set(['deployment','event','objective','reinforcement','roster','dialogue']);
 for(const [kind,key] of Object.entries(PRESET_TABLE_KEYS)){
  if(kind==='glyph'||kind==='map')continue;
  const originals=new Map((scenarioKinds.has(kind)?oldScenario.rows(kind):base[key]??[]).map(r=>[r.recordIndex,r]));
  tables[kind]=(scenarioKinds.has(kind)?newScenario.rows(kind):edited[key]??[]).map(row=>{
   const before=originals.get(row.recordIndex);
   if(!before)throw Error(`${kind} #${row.recordIndex}: 기준 레코드가 없어 자동 추출할 수 없습니다.`);
   const copy=structuredClone(row);copy.original={...before.original,...before};
   // A voice edit changes the stored weapon header. Match the destination
   // against the authenticated baseline, then carry voiceType as a field edit.
   if(kind==='weapon')copy.identity=before.identity;
   if(kind==='pilot')copy.originalSkillEntries=structuredClone(before.originalSkillEntries??before.specialAbilities??[]);
   if(kind==='unit'){
    const old=before.weaponList?.entries??[],now=row.weaponList?.entries??[];
    if(now.length<old.length)throw Error(`기체 #${row.recordIndex}: 무장 삭제 형식은 이전할 수 없습니다.`);
    copy.original.weaponAdditions=[];
    if(row.construction){
     // The empty reservation is not this new unit's baseline. Reconstruct its
     // authenticated defaults before comparing user values or appended weapons.
     const preset=unitConstructionPreset(row.construction.preset);
     const donor=(base.units??[]).find(unit=>unit.recordIndex===preset?.donor);
     if(!donor)throw Error(`기체 #${row.recordIndex}: 추가 기체의 기반을 확인할 수 없습니다.`);
     const version=row.construction.loadoutVersion??0;
     const target={...before,restorationEligible:(base.unitRestorationSlots??[]).includes(before.recordIndex)};
     let fresh;
     try{fresh=constructUnitRow(target,{...donor,original:{...donor.original,...donor}},preset.id,base.gameId,base.weapons,version);}
     catch{throw Error(`기체 #${row.recordIndex}: 검증된 추가 기체 기본 구성을 만들지 못했습니다.`);}
     const count=fresh.weaponList.entries.length;
     if(now.length<count)throw Error(`기체 #${row.recordIndex}: 추가 기체의 기본 무장이 부족합니다.`);
     copy.original={...fresh.original,...fresh,weaponAdditions:[]};
     copy.pendingConstruction=preset.id;
     // Concept presets already extract their stored suffix. Legacy donor
     // copies use the ordinary prefix/suffix convention instead.
     copy.weaponAdditions=version===0?now.slice(count).map(e=>e.weaponIndex):[];
     if(version===0)copy.weaponList={...row.weaponList,entries:now.slice(0,count)};
    }else{
     copy.weaponAdditions=now.slice(old.length).map(e=>e.weaponIndex);
     copy.weaponList={...row.weaponList,entries:now.slice(0,old.length)};
    }
   }
   return copy;
  });
 }
 // Text imports allocate characters in the destination's own pool. Never copy codes.
 if(edited.glyphEntries?.length)warnings.push('추가 글자 코드는 복사하지 않습니다. 옮긴 이름·대사에 필요한 글자를 새 ROM에서 배정합니다.');
 tables.map=[];
 for(const map of edited.maps??[]){
  const original=(base.maps??[]).find(m=>m.mapIndex===map.mapIndex);
  if(!original||!map.planes||map.planes.length!==original.planes.length)throw Error('맵 구조가 달라 자동 추출할 수 없습니다.');
  for(let pi=0;pi<map.planes.length;pi++){
   const plane=map.planes[pi],before=original.planes[pi];
   if(plane.width!==before.width||plane.height!==before.height||!same(plane.orientations,before.orientations))throw Error('맵 크기 또는 타일 방향 변경은 자동 추출할 수 없습니다.');
   for(let at=0;at<plane.tiles.length;at++)if(plane.tiles[at]!==before.tiles[at]){
    const x=at%plane.width,y=Math.floor(at/plane.width);
    tables.map.push({recordIndex:`${map.mapIndex}:${pi}:${x}:${y}`,name:`맵 #${map.mapIndex} (${x}, ${y})`,identity:plane.identity,editable:true,tileId:plane.tiles[at],original:{tileId:before.tiles[at]}});
   }
  }
 }
 if((base.maps??[]).length!==(edited.maps??[]).length)throw Error('맵 개수가 달라 자동 추출할 수 없습니다.');
 const preset=buildPreset({gameId:base.gameId,releaseId:base.baseReleaseId},tables);
 parsePreset(serializePreset(preset),{gameId:base.gameId});
 return {preset,warnings};
}
export async function readMigrationPair(baseFile,editedFile,gameId,options={}){
 const base=await inspectMigrationImage(baseFile,gameId,options);
 if(!['accepted','stock'].includes(base.provenanceMode))throw Error('기준 BIN은 개인 편집 전의 검증된 패치본이어야 합니다.');
 const edited=await inspectMigrationImage(editedFile,gameId,{...options,tailReferenceBlob:baseFile});
 return {...extractMigrationPreset(base,edited),base,edited};
}

export async function findMigrationDirectoryImage(directory,gameId){
 const sizes=new Set(Object.values(PRODUCTION_TRUST.targets).filter(t=>t.gameId===gameId).map(t=>t.size)),candidates=[];let count=0;
 for await(const handle of directory.values()){
  if(++count>256)throw Error('파일이 너무 많습니다. 이전 BIN/CUE가 있는 폴더를 선택하세요.');
  if(handle.kind!=='file'||!/\.(bin|img|iso)$/i.test(handle.name))continue;
  const file=await handle.getFile();if(sizes.has(file.size))candidates.push(file);
 }
 if(candidates.length!==1)throw Error(candidates.length?'BIN이 여러 개입니다. 이전 편집 BIN을 파일로 선택하세요.':'지원되는 이전 BIN이 없습니다.');
 const file=candidates[0];return findPatchedEditorImage(directory,{gameId,target:{size:file.size,filename:file.name},source:{size:file.size}});
}

export function requireMigrationIdentities(preset,targetReleaseId){
 const family=id=>typeof id==='string'?id.replace(/-[abc]$/,''):null;
 if(family(preset.releaseId)&&family(preset.releaseId)===family(targetReleaseId))return;
 const missing=Object.values(preset.entries??{}).flat().filter(entry=>!entry.identity&&!entry.construction);
 if(missing.length){const error=Error(`이 JSON의 ${missing.length}개 항목에는 버전 간 식별 정보가 없습니다. 이전 편집 BIN과 기준 BIN으로 가져와 주세요.`);error.code="EDITOR_MIGRATION_IDENTITY";throw error;}
}
