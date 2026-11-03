// Unit-family coordinates are ROM record indices, not save-slot indices.
export function saveUnitGroup(id, units, occupied=[]) {
  const byId=new Map(units.map(u=>[u.recordIndex,u])),unit=byId.get(id);
  if(!unit)throw new Error('ROM에서 기체 정보를 찾을 수 없습니다.');
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
