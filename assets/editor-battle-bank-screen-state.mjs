import {createBattleEffectPictureCropper} from './editor-battle-effect-picture.mjs?v=20261015-stocknames2';
// Browser-owned pixel planes. Resource slots remain tied to the selected
// weapon's bounded E_BNK records and the proven BTSR resource15. Screen
// copies never enumerate a gallery or borrow another resource's bank.
import {readBattleEmptyScreenFragment,readBattleScreenNoWriteOperation} from './editor-battle-empty-screen-fragment.mjs';
export function createBattleBankScreenState(records,{getDirection,getPalette}={}){
 if(!Array.isArray(records)||typeof getDirection!=='function')
  throw new Error('Battle bank screen: unresolved resources');
 const resources=new Map(),sourceCarriers=new Map();
 for(const record of records){
  if(record.status!=='ready')continue;
  const common=record.slot===15&&record.source?.fileName==='BTSR.BIN'
   &&record.source.sourceTableCell===8&&record.source.mapTableCell===9
   &&record.planeMode===3&&record.paletteLoadBase===92;
  const destruction=record.slot===14&&record.source?.fileName==='BTSR.BIN'
   &&[[11,12,132],[14,15,132],[17,18,130]].some(([bank,map,base])=>record.source.sourceTableCell===bank
    &&record.source.mapTableCell===map&&record.paletteLoadBase===base)
   &&record.planeMode===3;
  if(!Number.isInteger(record.slot)||record.slot<0||record.slot>5&&!common&&!destruction||resources.has(record.slot)
   ||!Number.isInteger(record.planeMode)||record.planeMode<1||record.planeMode>4
   ||!Array.isArray(record.fragments)||!Array.isArray(record.images)||record.images.length!==record.fragments.length)
   throw new Error('Battle bank screen: invalid selected resource');
  if(record.screenStatus==='absent'&&(record.screen!==null||record.fragments.length||record.images.length)
   ||record.imageErrors!==undefined&&(!Array.isArray(record.imageErrors)
    ||record.imageErrors.length!==record.images.length
    ||Array.from(record.images).some((image,index)=>image?Boolean(record.imageErrors[index]):
      record.imageErrors[index]?.code!=='BATTLE_BACKGROUND_CELL_BOUNDS'
       ||typeof record.imageErrors[index].reason!=='string'))
   ||Array.from(record.images).some(image=>!image)&&record.imageErrors===undefined)
   throw new Error('Battle bank screen: unresolved image/error identity');
  resources.set(record.slot,record);
  sourceCarriers.set(record.slot,record.source?.fileName==='E_BNK.BIN'?'E_BNK.BIN':common||destruction?'BTSR.BIN':'unresolved');
 }
 if(getPalette!==undefined&&typeof getPalette!=='function')throw new Error('Battle bank screen: invalid palette reader');
 const planes=Array.from({length:4},()=>({pixels:new Uint8ClampedArray(512*512*4),
  colors:new Uint16Array(512*512).fill(0xffff),revision:0,scrollX:0,scrollY:0,sourceCarriers:new Set(),sourceResources:new Set()}));
 const copy=({resourceIndex,fragmentIndex,x,y,flags},{sourceCommand}={})=>{
  if(![resourceIndex,fragmentIndex,x,y,flags].every(n=>Number.isInteger(n)&&n>=0&&n<=255))
   throw new Error('Battle bank screen: invalid copy');
  const resource=resources.get(resourceIndex),image=resource?.images[fragmentIndex];
  const imageError=resource?.imageErrors?.[fragmentIndex];
  if(imageError){
   const {code,reason,...details}=imageError;
   throw Object.assign(new Error(reason),{code,resourceIndex,fragmentIndex,details});
  }
  const empty=!image&&resource?(readBattleEmptyScreenFragment(resource.screen,fragmentIndex)
   ??readBattleScreenNoWriteOperation(resource.screen,{resourceIndex,fragmentIndex,x,y,flags,sourceCommand})):null;
  if(!resource||(!image&&!empty)||(!getPalette&&(flags&0xf0)))
   throw Object.assign(new Error('Battle bank screen: selected resource or palette transfer unresolved'),
    {code:'BATTLE_SCREEN_RESOURCE_UNLOADED',resourceIndex});
  if(image&&(image.width<1||image.height<1||image.width%8||image.height%8
   ||image.width>512||image.height>512||image.pixels?.length!==image.width*image.height*4))
   throw new Error('Battle bank screen: invalid copy');
  if(image&&getPalette&&(!(image.colorIndices instanceof Uint8Array)||!(image.paletteIndices instanceof Uint8Array)
   ||image.colorIndices.length!==image.width*image.height||image.paletteIndices.length!==image.width*image.height
   ||image.colorIndices.some(n=>n>15)))throw new Error('Battle bank screen: unresolved indexed image');
  let planeIndex=resource.planeMode-1;
  if(flags&4){planeIndex=0;flags&=251;}
  if(flags&8){planeIndex=1;flags&=247;}
  const direction=getDirection();
  if(typeof direction?.bit6!=='boolean'||typeof direction.bit7!=='boolean')
   throw new Error('Battle bank screen: unresolved direction');
  if(direction.bit6!==direction.bit7){x=(-x-(image?image.width/8:empty.width)+40)&63;flags^=1;}
  const plane=planes[planeIndex];
  if(empty){
   // FAC4 retains its destination bookkeeping, but the native sc02 copier
   // performs no tile writes. Neither a terminal nor a proved cell alias
   // clears earlier pixels or changes their generation.
   plane.scrollX=x;plane.scrollY=y;
   return {planeIndex,x,y,flags,cellsWritten:0,empty:true,...(empty.kind?{noWriteKind:empty.kind}:{})};
  }
  for(let row=0;row<image.height;row++)for(let column=0;column<image.width;column++){
   const sx=flags&1?image.width-1-column:column,sy=flags&2?image.height-1-row:row;
   const from=(sy*image.width+sx)*4,to=(((y*8+row)&511)*512+((x*8+column)&511))*4;
   plane.pixels.set(image.pixels.subarray(from,from+4),to);
   if(getPalette){
    const index=image.colorIndices[from/4],palette=image.paletteIndices[from/4]+((flags&0xf0)>>>4);
    plane.colors[to/4]=index?(palette*16+index)&1023:0xffff;
   }
  }
  plane.sourceCarriers.add(sourceCarriers.get(resourceIndex));
  plane.sourceResources.add(resourceIndex);
  plane.scrollX=x;plane.scrollY=y;plane.revision++;
  return {planeIndex,x,y,flags,cellsWritten:image.width*image.height/64};
 };
 const copyUnitBitmap=plan=>{
  if(plan?.status!=='ready'||plan.image?.width!==144||plan.image?.height!==112
   ||!(plan.image.colorIndices instanceof Uint8Array)||plan.image.colorIndices.length!==144*112
   ||typeof plan.flipX!=='boolean'||typeof plan.flipY!=='boolean'||!Number.isInteger(plan.palette)||plan.palette<0||plan.palette>15
   ||plan.image.colorIndices.some(i=>i>15)||!getPalette)
   throw new Error('Battle bank screen: invalid unit bitmap');
  const plane=planes[2],indices=plan.image.colorIndices;
  for(let y=0;y<112;y++)for(let x=0;x<144;x++){
   const sx=plan.flipX?143-x:x,sy=plan.flipY?111-y:y,color=indices[sy*144+sx];
   plane.colors[y*512+x]=color?plan.palette*16+color:0xffff;
  }
  plane.sourceCarriers.add('C_ROBOT.BIN');plane.revision++;
  return {planeIndex:2,cellsWritten:252};
 };
 const croppers=Array.from({length:4},()=>createBattleEffectPictureCropper());
 const snapshot=({cropped=false}={})=>{
 if(typeof cropped!=='boolean')throw new Error('Battle bank screen: invalid snapshot mode');
 return planes.flatMap((plane,index)=>{
  if(!plane.revision)return [];
  if(getPalette){
   const palette=getPalette(index);
   if(!(palette?.words instanceof Uint16Array)||palette.words.length!==1024
    ||!Number.isInteger(palette.offset)||palette.offset<0||palette.offset>1023)
    throw new Error('Battle bank screen: unresolved published palette');
   if(plane.renderedRevision!==plane.revision||plane.paletteOffset!==palette.offset
    ||!plane.paletteCopy||plane.paletteCopy.some((word,i)=>word!==palette.words[i])){
    plane.pixels.fill(0);
    for(let i=0;i<plane.colors.length;i++){
     const color=plane.colors[i],at=i*4;if(color===0xffff)continue;
     const word=palette.words[(palette.offset+color)&1023];
     plane.pixels[at]=(word&31)<<3;plane.pixels[at+1]=((word>>>5)&31)<<3;
     plane.pixels[at+2]=((word>>>10)&31)<<3;plane.pixels[at+3]=255;
    }
    plane.paletteCopy=palette.words.slice();plane.paletteOffset=palette.offset;plane.renderedRevision=plane.revision;
   }
  }
  const metadata={planeIndex:index,width:512,height:512,revision:plane.revision,
   scrollX:plane.scrollX,scrollY:plane.scrollY,sourceCarriers:[...plane.sourceCarriers].sort(),sourceResources:[...plane.sourceResources].sort((a,b)=>a-b)};
  if(!cropped)return [{...metadata,pixels:plane.pixels.slice()}];
  const picture=croppers[index]({width:512,height:512,pixels:plane.pixels},plane.revision);
  return [{...metadata,picture:picture?{...picture,pixels:picture.pixels===plane.pixels?picture.pixels.slice():picture.pixels}:null}];
 });};
 const clear=planeIndex=>{
  if(!Number.isInteger(planeIndex)||planeIndex<0||planeIndex>3)
   throw new Error('Battle bank screen: invalid clear plane');
  const plane=planes[planeIndex];plane.pixels.fill(0);plane.colors.fill(0xffff);plane.sourceCarriers.clear();plane.sourceResources.clear();plane.scrollX=plane.scrollY=0;plane.revision++;
 };
 // This is slot ownership for dispatch, not a claim that a palette-only
 // bank published native screen metadata. Its copy still fails closed.
 return {copy,copyUnitBitmap,clear,snapshot,hasResource:index=>resources.has(index)};
}
