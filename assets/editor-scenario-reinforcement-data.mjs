// Front-end contract only. The authenticated writer separately checks the
// callback, original program, native overlay and actor allocation contract.
export const ALLY_REINFORCEMENT_FIELDS=Object.freeze(['enabled','pilotId','unitId','level','triggerX','triggerY','x','y']);
export const isAllyReinforcementRow=row=>Boolean(row&&Array.isArray(row.pilotOptions)&&Array.isArray(row.unitOptions)&&ALLY_REINFORCEMENT_FIELDS.every(field=>Object.hasOwn(row,field)));
export function validateAllyReinforcement(row,values=row){
 const bad=(field,message)=>({valid:false,field,message});
 if(!isAllyReinforcementRow(row)||row.editable!==true)return bad('enabled',row?.readOnlyReason||'검증된 아군 증원 위치가 아닙니다.');
 if(!Number.isInteger(row.width)||row.width<1||row.width>64||!Number.isInteger(row.height)||row.height<1||row.height>64)return bad('enabled','발동·등장 지도의 크기를 확인하지 못했습니다.');
 for(const [field,min,max,label]of [['enabled',0,1,'증원 사용'],['pilotId',1,511,'파일럿'],['unitId',1,511,'기체'],['level',1,99,'레벨'],['triggerX',0,row.width-1,'발동 X'],['triggerY',0,row.height-1,'발동 Y'],['x',0,row.width-1,'등장 X'],['y',0,row.height-1,'등장 Y']])if(!Number.isInteger(values?.[field])||values[field]<min||values[field]>max)return bad(field,`${label}는 ${min}~${max} 정수로 입력하세요.`);
 for(const [field,key,id,label]of [['pilotId','pilotOptions','pilotId','파일럿'],['unitId','unitOptions','unitId','기체']]){const option=row[key].find(option=>option?.[id]===values[field]);if(!option||option.eligible!==true||typeof option.identity!=='string'||!option.identity)return bad(field,option?.readOnlyReason||`현재 ROM에서 검증된 ${label}을 선택하세요.`);}
 return {valid:true,message:'',field:null};
}
