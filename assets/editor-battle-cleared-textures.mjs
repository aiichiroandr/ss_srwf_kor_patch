// Fresh source initialization clears the texture arena before any registration.
// F0600989C calls its accepted wrapper060B31DC, clearing geometry at20219800
// for9800bytes and pivots at2020F000 for1800bytes. Final06009AC4 explicitly
// clears the corresponding regions through0600453C. This is an empty draw,
// never a manufactured image or evidence of a retained game's texture history.
const clearedStates=new WeakSet();
export function createBattleClearedTextureState(capacity=1024,{sourceCleared=true}={}){
 if(typeof sourceCleared!=='boolean'||!Number.isInteger(capacity)||capacity<1||capacity>1024)throw new Error('Battle empty textures: invalid arena capacity');
 const state={nextTextureIndex:0,geometry:new Uint8Array(capacity*8),attributes:new Uint8Array(capacity*10),
  pivots:new Uint8Array(capacity*4),textureFormats:new Uint8Array(capacity),vram:new Uint8Array(0x80000)};
 if(sourceCleared)clearedStates.add(state);return state;
}
export function isBattleUnusedClearedTexture(state,index,nextTextureIndex){
 if(!clearedStates.has(state)||!Number.isInteger(index)||!Number.isInteger(nextTextureIndex)
  ||nextTextureIndex<0||index<nextTextureIndex||index<0||index>=state.textureFormats.length)return false;
 return state.textureFormats[index]===0&&state.geometry.subarray(index*8,index*8+8).every(v=>v===0)
  &&state.attributes.subarray(index*10,index*10+10).every(v=>v===0)
  &&state.pivots.subarray(index*4,index*4+4).every(v=>v===0);
}

// Read the admitted game's clear ranges; do not infer zero history from
// JavaScript allocation alone. Original F and its accepted relocation wrapper
// have different layouts, while both can prove coverage of the same tables.
export function readBattleTextureClearProfile(executable,{gameId}={}){
 const unresolved=reason=>({status:'unresolved',reason});
 if(!(executable instanceof Uint8Array)||!['srwf-f','srwf-final'].includes(gameId))return unresolved('clear-source-missing');
 const v=new DataView(executable.buffer,executable.byteOffset,executable.byteLength),base=0x06004000;
 const u16=a=>{const p=a-base;if(p<0||p+2>v.byteLength)throw Error('bounds');return v.getUint16(p);};
 const u32=a=>{const p=a-base;if(p<0||p+4>v.byteLength)throw Error('bounds');return v.getUint32(p);};
 try{
  const final=gameId==='srwf-final',entry=final?0x06009ac4:0x0600989c;
  if(u16(entry)!==0x2f86||u16(entry+2)!==0x2fe6||u16(entry+4)!==0x4f22)return unresolved('clear-entry-unrecognized');
  let regions,geometry,attributes,pivots;
  if(final){
   geometry=u32(0x06009b44);attributes=u32(0x06009b4c);pivots=u32(0x06009b3c);
   if(u32(0x06009b54)!==0x0600453c||u16(0x06009ae6)!==0xe518||u16(0x06009ae8)!==0x4518
     ||u16(0x06009af2)!==0xe54c||u16(0x06009af4)!==0x4518||u16(0x06009af6)!==0x4500)return unresolved('clear-call-unrecognized');
   regions=[{start:pivots,length:0x1800},{start:geometry,length:0x9800}];
  }else{
   geometry=u32(0x06009918);attributes=u32(0x06009920);pivots=u32(0x06009910);
   if(u16(0x060098c0)!==0x410b)return unresolved('clear-call-unrecognized');
   const target=u32(0x0600992c);
   if(target===0x0600453c)regions=[{start:pivots,length:u32(0x06009928)}];
   else if(target===0x060b31dc){
    if(u16(target)!==0x4f22||u16(target+8)!==0x400b||u16(target+18)!==0x400b
      ||u32(0x060b3200)!==0x0600453c)return unresolved('clear-wrapper-unrecognized');
    regions=[{start:u32(0x060b31f8),length:u32(0x060b31fc)},{start:u32(0x060b3204),length:u32(0x060b3208)}];
   }else return unresolved('clear-target-unrecognized');
  }
  const ram=a=>a>=0x06000000&&a<0x06100000||a>=0x20200000&&a<0x20280000;
  if(regions.some(r=>!ram(r.start)||!Number.isInteger(r.length)||r.length<1||r.length>0x100000||!ram(r.start+r.length-1)))return unresolved('clear-region-invalid');
  if(![[geometry,1024*8],[attributes,1024*10],[pivots,1024*4]].every(([at,length])=>regions.some(r=>at>=r.start&&at+length<=r.start+r.length)))return unresolved('clear-coverage-incomplete');
  return {status:'proved',gameId,entry,capacity:1024,regions,scope:'source fresh texture-table clear; retained game history not reconstructed'};
 }catch{return unresolved('clear-source-bounds');}
}
