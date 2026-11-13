// Unit-family coordinates are ROM record indices, never save-slot indices. A
// group returned here is a definition template; save-core allocates every one
// of its members afresh for each add operation.
const CRUISER_PAIRS=Object.freeze({
  's-cruiser':Object.freeze(['s-gundam','s-g-cruiser']),
  'ex-s-cruiser':Object.freeze(['ex-s-gundam','g-cruiser'])
});
function fail(message){throw new Error(message);}
function validId(id){return Number.isInteger(id)&&id>=0&&id<=65535;}
function cruiserPair(unit,byId){
 const presets=CRUISER_PAIRS[unit.constructionGroup];if(!presets)return null;
 const root=unit.constructionGroupRoot,base=byId.get(root),alternate=byId.get(root+1);
 if(!Number.isInteger(root)||root<1||!base||!alternate||base.srw4Native!==true||alternate.srw4Native!==true
  ||base.recordIndex!==root||alternate.recordIndex!==root+1||base.constructionGroup!==unit.constructionGroup
  ||alternate.constructionGroup!==unit.constructionGroup||base.constructionGroupRoot!==root
  ||alternate.constructionGroupRoot!==root||base.construction?.preset!==presets[0]
  ||alternate.construction?.preset!==presets[1]||base.saveUnitKind!==1||alternate.saveUnitKind!==1
  ||base.saveUnitForm!==0||alternate.saveUnitForm!==1)fail('제4차 S/Ex-S 변형 기체의 ROM 연결을 확인하지 못했습니다.');
 if(unit.recordIndex!==root)fail('제4차 S/Ex-S 변형 형태는 직접 추가할 수 없습니다.');
 return {root,members:[root],links:[],pilotSource:null,familyMembers:[root,root+1]};
}
function complete(byId,members,message){
 if(!members.every(id=>Number.isInteger(id)&&id>0&&id<=65535&&byId.has(id)))fail(message);
 return members;
}
function linked(root,members,pilotSource=null){return {root,members,links:members.slice(1).map(id=>[id,root]),pilotSource};}
function candidatesFor(kind,id,units){
 const width=kind===6?12:5;
 return units.filter(candidate=>candidate.saveUnitKind===kind&&Number.isInteger(candidate.recordIndex)
  &&candidate.recordIndex>0&&candidate.recordIndex<=65535&&id>=candidate.recordIndex&&id<=candidate.recordIndex+width);
}
function combinedGroup(candidate,byId,requestedId){
 const root=candidate.recordIndex;
 if(candidate.saveUnitKind===6){
  const members=[root];let selected=null;
  for(const offset of [1,4,7,10]){
   const forms=complete(byId,[0,1,2].map(form=>root+offset+form),'합체 기체의 모든 구성 형태를 확인하지 못했습니다.');
   if(!forms.every((member,form)=>byId.get(member).saveUnitKind===5&&byId.get(member).saveUnitForm===form))fail('합체 기체 구성 형태가 ROM 저장 형식과 맞지 않습니다.');
   const member=forms.includes(requestedId)?requestedId:forms[0];members.push(member);
   if(member===requestedId)selected=member;
  }
  // The composite request has no component form to preserve; then every
  // component uses its verified base form.  A component request is represented
  // by exactly that requested form, never silently by the triplet's base.
  return linked(root,members,selected??members[1]);
 }
 const members=complete(byId,Array.from({length:6},(_,index)=>root+index),'합체 기체의 모든 구성 형태를 확인하지 못했습니다.');
 if(byId.get(root).saveUnitForm!==0||!members.slice(1).every((member,index)=>byId.get(member).saveUnitKind===7&&byId.get(member).saveUnitForm===index))fail('합체 기체 구성 형태가 ROM 저장 형식과 맞지 않습니다.');
 return linked(root,members,members[1]);
}
export function saveUnitGroup(id,units){
 if(!Array.isArray(units))fail('ROM 기체 목록이 잘못되었습니다.');
 const byId=new Map();for(const unit of units){if(!validId(unit?.recordIndex)||byId.has(unit.recordIndex))fail('ROM 기체 번호가 겹치거나 잘못되었습니다.');byId.set(unit.recordIndex,unit);}
 if(!Number.isInteger(id)||id<1||id>65535)fail('ROM에서 기체 정보를 찾을 수 없습니다.');
 const unit=byId.get(id);if(!unit)fail('ROM에서 기체 정보를 찾을 수 없습니다.');
 const cruiser=cruiserPair(unit,byId);if(cruiser)return cruiser;
 const kind=unit.saveUnitKind,form=unit.saveUnitForm;
 if(!Number.isInteger(kind)||!Number.isInteger(form))fail('기체 저장 형식 정보를 확인하지 못했습니다.');
 const roots=[...candidatesFor(6,id,units),...candidatesFor(8,id,units)];
 if(roots.length>1)fail('겹치는 합체 기체의 ROM 연결을 하나로 확인하지 못했습니다.');
 if(roots.length===1)return combinedGroup(roots[0],byId,id);
 // A component kind without exactly one enclosing root is not a standalone
 // definition. This also rejects stale kind-5/7 rows before any save write.
 if(kind===5||kind===7)fail('합체 기체 구성 형태의 ROM 연결을 확인하지 못했습니다.');
 if(kind===9){
  // Kind 9 is not a Getter/Combattler child graph. Form 2 is the combined
  // proxy, form 0 its independent base, and form 1 an independent support
  // component. Only the combined proxy points to its own newly allocated base.
  const roots=units.filter(candidate=>candidate.saveUnitKind===9&&candidate.saveUnitForm===2
   &&Number.isInteger(candidate.recordIndex)&&candidate.recordIndex>0&&candidate.recordIndex<=65535
   &&id>=candidate.recordIndex&&id<=candidate.recordIndex+2);
  if(roots.length!==1)fail(roots.length?'겹치는 3단 변형 기체의 ROM 연결을 하나로 확인하지 못했습니다.':'3단 변형 기체의 ROM 연결을 확인하지 못했습니다.');
  const root=roots[0].recordIndex,members=complete(byId,[root,root+1,root+2],'3단 변형 기체의 모든 형태를 확인하지 못했습니다.');
  if(!members.every((member,index)=>byId.get(member).saveUnitKind===9&&byId.get(member).saveUnitForm===[2,0,1][index]))fail('3단 변형 기체의 ROM 저장 형식이 맞지 않습니다.');
  return {root,members,links:[[root,members[1]]],pilotSource:members[1]};
 }
 if(kind===4){
  const root=id-form,members=complete(byId,[root,root+1,root+2],'변형 기체의 모든 형태를 확인하지 못했습니다.');
  if(!members.every((member,index)=>byId.get(member).saveUnitKind===4&&byId.get(member).saveUnitForm===index))fail('변형 기체의 ROM 저장 형식이 맞지 않습니다.');
  return linked(root,members);
 }
 return {root:id,members:[id],links:[],pilotSource:null};
}