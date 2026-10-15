import {readBattleBackgroundLayout,initializeBattleBackgroundGroups} from './editor-battle-background.mjs?v=20261015-stocknames2';

const FORMAT='battle-background-parallax-preparation-v1';
const fail=message=>{const error=new Error(`Battle background parallax: ${message}`);error.code='BATTLE_BACKGROUND_PARALLAX';throw error;};
const int32=n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647;
const byte=n=>Number.isInteger(n)&&n>=0&&n<=255;
const signedByte=n=>n&128?n-256:n;
const mod=(n,size)=>(n%size+size)%size;
function validate(state,groups){
 if(state?.format!==FORMAT||![0,32].includes(state.rowStart)||!Number.isInteger(state.mode)||state.mode<0||state.mode>255
  ||!Array.isArray(state.verticalFactors)||state.verticalFactors.length!==2||state.verticalFactors.some(n=>!Number.isInteger(n)||n<-128||n>127)
  ||!int32(state.cachedSpeed)||!['currentVertical','previousVertical','verticalVelocity'].every(k=>Array.isArray(state[k])&&state[k].length===2&&state[k].every(int32))
  ||!Array.isArray(state.shape)||state.shape.length!==2||!Array.isArray(groups)||groups.length!==2)fail('unresolved preparation state');
 for(let index=0;index<2;index++){
  const group=groups[index],shape=state.shape[index];
  if(!Number.isInteger(group?.count)||group.count<0||group.count>63||shape?.length!==group.count
   ||!Array.isArray(group.records)||group.records.length!==group.count*2+1)fail('unresolved source bands');
  for(let row=0;row<group.records.length;row++){
   const record=group.records[row],source=row===group.count*2?{factor:0,control:512}:shape[row%group.count];
   if(!source||![source.factor,source.control].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
    ||record?.factor!==source.factor||record?.control!==source.control
    ||!int32(record.offset)||!int32(record.secondaryOffset))fail('source band identity changed');
  }
 }
}

// Preparation-only source semantics. F0604595C / Final0604B138 initialize
// these bands; the ordinary viewport producer F060420AC / Final06047778
// supplies rowStart32. The separate source-cleared profile supplies0.
export function createBattleBackgroundParallaxState({commonData,mode,rowStart}={}){
 if(![0,32].includes(rowStart))fail('explicit source viewport required');
 const layout=readBattleBackgroundLayout(commonData,mode),groups=initializeBattleBackgroundGroups(layout);
 if(!groups||layout.counts.some(n=>!byte(n)))return {status:'blocked',reason:'background-band-layout-unresolved'};
 const state={format:FORMAT,mode,rowStart,cachedSpeed:0,verticalFactors:layout.counts.slice(2,4).map(signedByte),
  currentVertical:[280*65536,280*65536],previousVertical:[280*65536,280*65536],verticalVelocity:[0,0],
  shape:layout.groups.map(group=>group.entries.map(row=>({...row})))};
 validate(state,groups);return {status:'ready',state,groups};
}

// F06045CF0 / Final0604B4CC add the already source-computed6A velocity
// once per preparation update and publish matching duplicated wrap rows.
// The manual0x100 gate at F06045C88 / Final0604B464 freezes this update.
export function advanceBattleBackgroundParallax({state,groups,speed,manual}={}){
 validate(state,groups);
 if(!int32(speed)||speed<0||typeof manual!=='boolean')fail('explicit motion context required');
 if(manual)return {status:'ready',state,groups,advanced:false,cameras:null};
 const nextGroups=groups.map(group=>({...group,records:group.records.map(row=>({...row}))}));
 for(const group of nextGroups)for(let row=0;row<group.count;row++){
  const value=(group.records[row].secondaryOffset+group.records[row].offset)|0;
  group.records[row].secondaryOffset=value;group.records[row+group.count].secondaryOffset=value;
 }
 const velocity=speed===state.cachedSpeed?state.verticalVelocity.slice():state.verticalFactors.map(factor=>Math.imul(speed,factor));
 const next={...state,cachedSpeed:speed,verticalVelocity:velocity,previousVertical:state.currentVertical.slice(),
  currentVertical:state.currentVertical.map((value,index)=>(value+velocity[index])|0)};
 return {status:'ready',state:next,groups:nextGroups,advanced:true,
  cameras:[{x:0,y:next.currentVertical[1]/65536},{x:0,y:next.currentVertical[0]/65536}]};
}

// F06045BDC / Final0604B3B8 select rows with(previousScrollY+32)&511.
// F0603F184 / Final060447AC place128 published values at rowStart.
// Preserve the bounded duplicated rows and sentinel, not a guessed period.
export function planBattleBackgroundParallaxBands({state,groups,manual}={}){
 validate(state,groups);if(typeof manual!=='boolean')fail('explicit manual gate required');
 if(manual)return {status:'ready',planes:[]};
 const planes=[];
 for(let planeIndex=0;planeIndex<2;planeIndex++){
  const groupIndex=1-planeIndex,records=groups[groupIndex].records;
  let remaining=((state.previousVertical[groupIndex]>>16)+32)&511,row=0;
  while(row<records.length&&remaining>=records[row].control){remaining-=records[row].control;row++;}
  const bands=[];let published=0;
  while(published<128){
   if(row>=records.length)return {status:'blocked',reason:'background-band-stream-outside-source',planeIndex};
   const record=records[row++],height=Math.min(128-published,record.control-remaining);remaining=0;
   if(!height)continue;
   const x=record.secondaryOffset/65536,last=bands.at(-1);
   if(last&&last.x===x)last.height+=height;else bands.push({y:state.rowStart+published,height,x});
   published+=height;
  }
  planes.push({planeIndex,bands});
 }
 return {status:'ready',planes};
}

// Publish only web rectangles and normalized UVs. Split at each source edge
// so nearest sampling cannot borrow another plane or use texture repetition.
export function compileBattleBackgroundParallaxLayers({state,groups,cameras,assetKeys,manual}={}){
 if(!Array.isArray(cameras)||cameras.length!==2||cameras.some(c=>!c||![c.x,c.y].every(n=>Number.isFinite(n)&&n>=-32768&&n<32768))
  ||!Array.isArray(assetKeys)||assetKeys.length!==2||assetKeys.some(k=>k!==null&&(typeof k!=='string'||!k.length||k.length>1024)))
  fail('bounded picture cameras required');
 const plan=planBattleBackgroundParallaxBands({state,groups,manual});if(plan.status!=='ready')return plan;
 const layers=[];
 for(const planeIndex of [1,0]){
  const assetKey=assetKeys[planeIndex];if(assetKey===null)continue;
  const camera=cameras[planeIndex],bands=plan.planes.find(p=>p.planeIndex===planeIndex)?.bands;
  const inputRanges=bands?[...(state.rowStart?[{y:0,height:state.rowStart,x:0}]:[]),...bands,
   {y:state.rowStart+128,height:224-state.rowStart-128,x:0}]:[{y:0,height:224,x:0}];
  const ranges=[];for(const band of inputRanges){const last=ranges.at(-1);
   if(last&&last.x===band.x&&last.y+last.height===band.y)last.height+=band.height;else ranges.push({...band});}
  for(const band of ranges){
   let y=band.y,leftHeight=band.height;
   while(leftHeight>0){
    const sourceY=mod(camera.y+y,512),height=Math.min(leftHeight,512-sourceY);
    let x=0,leftWidth=320;
    while(leftWidth>0){
     const sourceX=mod(camera.x+band.x+x,512),width=Math.min(leftWidth,512-sourceX);
     layers.push({assetKey,planeIndex,x,y,width,height,
      uvs:[sourceX/512,sourceY/512,(sourceX+width)/512,sourceY/512,
       (sourceX+width)/512,(sourceY+height)/512,sourceX/512,(sourceY+height)/512]});
     x+=width;leftWidth-=width;
    }
    y+=height;leftHeight-=height;
   }
  }
 }
 return {status:'ready',layers,planes:plan.planes};
}
