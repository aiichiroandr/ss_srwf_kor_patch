// Only authored construction records can opt into ALICE; no caller-supplied unit IDs.
const presets=new Set(['s-gundam','s-g-cruiser','ex-s-gundam','g-cruiser']);
export function aliceUnitTargets(entries){
 const byId=new Map(entries.map(e=>[e.recordIndex,e]));const ids=[...byId.values()].filter(e=>presets.has(e.preset??e.construction?.preset)).map(e=>e.recordIndex).sort((a,b)=>a-b);
 if(!ids.length||ids.length>4){const e=Error('ALICE 동승은 S건담·Ex-S와 두 G크루저를 포함해 최대 4형태까지 연결할 수 있습니다.');e.code='EDITOR_ALICE_INVALID';throw e;}return ids;
}
