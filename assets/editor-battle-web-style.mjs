// Semantic web style, independent of source HUD words or native blend modes.
// Omitted fields retain the existing opaque/normal rendering contract.
export function readBattleWebObjectStyle(object){
 if(!object||typeof object!=='object')throw new Error('Web scene: invalid object style');
 const opacity=object.opacity===undefined?1:object.opacity;
 const blend=object.blend===undefined?'normal':object.blend;
 if(!Number.isFinite(opacity)||opacity<0||opacity>1||!['normal','add','screen'].includes(blend))
  throw new Error('Web scene: invalid opacity or blend');
 return {opacity,blend};
}
