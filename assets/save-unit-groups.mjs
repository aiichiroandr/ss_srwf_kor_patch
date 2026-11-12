// Unit-family coordinates are ROM record indices, not save-slot indices.
// SRW4's imported S/Ex-S pairs are native kind-1 transformations, but save
// grant must only create their base hull.  Unlike ordinary kind-1 records,
// the companion is restored by the game's transformation data, not a second
// independently granted save row.
const CRUISER_PAIRS=Object.freeze({
  's-cruiser':Object.freeze(['s-gundam','s-g-cruiser']),
  'ex-s-cruiser':Object.freeze(['ex-s-gundam','g-cruiser'])
});
function cruiserPair(unit, byId) {
  const presets=CRUISER_PAIRS[unit.constructionGroup];
  if(!presets)return null;
  const root=unit.constructionGroupRoot;
  const base=byId.get(root),alternate=byId.get(root+1);
  // constructionGroup is ROM-derived metadata. Do not infer a pair from
  // adjacency: require the complete SRW4-native construction coordinates.
  if(!Number.isInteger(root)||!base||!alternate
    ||base.srw4Native!==true||alternate.srw4Native!==true
    ||base.recordIndex!==root||alternate.recordIndex!==root+1
    ||base.constructionGroup!==unit.constructionGroup||alternate.constructionGroup!==unit.constructionGroup
    ||base.constructionGroupRoot!==root||alternate.constructionGroupRoot!==root
    ||base.construction?.preset!==presets[0]||alternate.construction?.preset!==presets[1]
    ||base.saveUnitKind!==1||alternate.saveUnitKind!==1||base.saveUnitForm!==0||alternate.saveUnitForm!==1)
    throw new Error('제4차 S/Ex-S 변형 기체의 ROM 연결을 확인하지 못했습니다.');
  if(unit.recordIndex!==root)throw new Error('제4차 S/Ex-S 변형 형태는 직접 추가할 수 없습니다.');
  return {root,members:[root],links:[],pilotSource:null,familyMembers:[root,root+1]};
}
export function saveUnitGroup(id, units, occupied=[]) {
  const byId=new Map(units.map(u=>[u.recordIndex,u])),unit=byId.get(id);
  if(!unit)throw new Error('ROM에서 기체 정보를 찾을 수 없습니다.');
  const cruiser=cruiserPair(unit,byId);if(cruiser)return cruiser;
  const kind=unit.saveUnitKind,form=unit.saveUnitForm;
  if(kind===9)return {root:2,members:[2,3,4],links:[[3,2],[4,2]],pilotSource:3};
  const combined=units.find(u=>u.saveUnitKind===6&&id>=u.recordIndex&&id<=u.recordIndex+12
    ||u.saveUnitKind===8&&id>=u.recordIndex&&id<=u.recordIndex+5);
  if(combined){
    const root=combined.recordIndex;
    const members=combined.saveUnitKind===6?[root,...[1,4,7,10].map(n=>{const base=root+n;return id>=base&&id<=base+2?id:occupied.find(n=>n>=base&&n<=base+2)??base;})]:Array.from({length:6},(_,i)=>root+i);
    return {root,members,links:members.slice(1).map(member=>[member,root]),pilotSource:members[1]};
  }
  if(kind===4){const root=id-form,members=[root,root+1,root+2];return {root,members,links:members.slice(1).map(member=>[member,root]),pilotSource:null};}
  return {root:id,members:[id],links:[],pilotSource:null};
}
