// Build labels from one roster snapshot. The browser host formats/copies the
// entire roster when called; never call it again for each dialogue weapon.
export function battleDialogueChoiceOptions(catalog,{unitIndex,getWeapons}){
 if(catalog?.status!=='ready')return [];
 const weapons=new Map(getWeapons().map(row=>[row.recordIndex,row]));
 const common=catalog.choices.find(row=>!row.attack.explicit);
 return catalog.choices.filter(row=>row.attack.explicit||row===common).map(choice=>{
  const names=choice.weapons.filter(peer=>weapons.get(peer.weaponIndex)?.owners?.some(owner=>(owner.unit??owner.unitIndex)===unitIndex)).map(peer=>peer.name).filter(Boolean);
  return {value:String(choice.key),label:choice.attack.explicit?(names.length?[...new Set(names)].join(' / '):`전용 대사 ${choice.key}`):'공통 대사',
   title:choice.attack.explicit?'선택한 파일럿의 전용 분기입니다.':'선택한 파일럿의 공통 대사 분기입니다. 무기 이름과 다른 대사가 나올 수 있습니다.'};
 });
}
