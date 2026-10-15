import {readBattleScreenFragment,applyBattleScreenFragment,applyBattleBackgroundFragment} from './editor-battle-background.mjs?v=20261015-stocknames2';

// FAC4 F060353BC / Final0603A650. Resources and plane contents belong to
// this scene; no bank scan or implicit blank native plane is substituted.
export function createBattleScreenCopier({resolveResource,planes,widePlanes,presentationVariant,
  directionBit6,directionBit7}={}){
  if(typeof resolveResource!=='function'||!Array.isArray(planes)||planes.length!==4
    ||planes.some(plane=>!(plane instanceof Uint16Array)||plane.length!==4096)
    ||typeof directionBit6!=='boolean'||typeof directionBit7!=='boolean'
    ||presentationVariant!==1
    ||widePlanes!==undefined&&(!Array.isArray(widePlanes)||widePlanes.length!==4
      ||widePlanes.some(plane=>!(plane instanceof Uint32Array)||plane.length!==4096)))
    throw new Error('Battle screen copy: unresolved native plane context');
  return ({resourceIndex,fragmentIndex,x,y,flags})=>{
    if(![resourceIndex,fragmentIndex,x,y,flags].every(value=>Number.isInteger(value)&&value>=0&&value<=255))
      throw new Error('Battle screen copy: invalid instruction operands');
    const resource=resolveResource(resourceIndex);
    if(!resource||!Number.isInteger(resource.tileOffset)||resource.tileOffset<0||resource.tileOffset>65535
      ||!Number.isInteger(resource.planeIndex)||resource.planeIndex<0||resource.planeIndex>3)
      throw Object.assign(new Error('Battle screen copy: selected resource is not loaded'),
        {code:'BATTLE_SCREEN_RESOURCE_UNLOADED',resourceIndex});
    const fragment=readBattleScreenFragment(resource.screen,fragmentIndex);
    let planeIndex=resource.planeIndex;
    if(flags&4){planeIndex=0;flags&=251;}
    if(flags&8){planeIndex=1;flags&=247;}
    if(directionBit6!==directionBit7){x=(-x-fragment.width+40)&63;flags^=1;}
    if(fragment.cells instanceof Uint32Array&&!widePlanes)
      throw Object.assign(new Error('Battle screen copy: selected wide plane is not loaded'),
        {code:'BATTLE_SCREEN_RESOURCE_UNLOADED',resourceIndex});
    const result=fragment.cells instanceof Uint32Array
      ?applyBattleBackgroundFragment(fragment,widePlanes[planeIndex],{x,y,flags,tileOffset:resource.tileOffset})
      :applyBattleScreenFragment(fragment,planes[planeIndex],{x,y,flags,tileOffset:resource.tileOffset});
    return {...result,planeIndex,x,y,flags};
  };
}
