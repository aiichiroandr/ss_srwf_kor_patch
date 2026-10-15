// Native palette-word transfer, F0603A5E8 mode!=1 branch0603A746.
// The caller supplies retained native source/destination words. No palette
// or unresolved mode1 remapping is synthesized from sprite images.
export function readBattlePaletteRendererTables(executable,{baseAddress,bankBasesAddress,addressMapAddress}={}){
  if(!(executable instanceof Uint8Array)||![baseAddress,bankBasesAddress,addressMapAddress].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff)
    ||addressMapAddress!==bankBasesAddress+30||bankBasesAddress<baseAddress
    ||addressMapAddress-baseAddress+128>executable.length)
    throw new Error('Battle palette: unresolved executable renderer tables');
  const storage=new ArrayBuffer(158),bankBases=new Uint16Array(storage,0,16),addressMap=new Uint16Array(storage,30,64);
  const view=new DataView(executable.buffer,executable.byteOffset,executable.byteLength);
  for(let i=0;i<16;i++)bankBases[i]=view.getUint16(bankBasesAddress-baseAddress+i*2);
  for(let i=0;i<64;i++)addressMap[i]=view.getUint16(addressMapAddress-baseAddress+i*2);
  return {bankBases,addressMap};
}

export function resetBattlePalettes({sourceWords,destinationWords,bankStates,bankBases}){
  if(!(sourceWords instanceof Uint16Array)||sourceWords.length!==6144
    ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024
    ||!(bankStates instanceof Uint8Array)||bankStates.length!==768
    ||!(bankBases instanceof Uint16Array)||bankBases.length!==16)
    throw new Error('Battle palette: invalid retained reset state');
  // F0603A2FC clears 2000 bytes of source storage, not the whole384-bank pool.
  // Native bank-free helper clears only byte0 of each two-byte state record.
  sourceWords.fill(0,0,4096);destinationWords.fill(0);
  for(let i=0;i<384;i++)bankStates[i*2]=0;
  const colors=[0,0x7fff,0x001f,0x03e0,0x7c00,0x03ff];
  for(let bank=0;bank<colors.length;bank++)sourceWords.fill(colors[bank],bank*16,(bank+1)*16);
  bankBases.fill(128,0,14);
  return {graphicsCompletionWord:0};
}
export function recolorBattleSprite(sprite,paletteWords,offset=0){
  const {width,height,colorIndices,colorCount}=sprite??{};
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>512||height>512
    ||!(colorIndices instanceof Uint8Array)||colorIndices.length!==width*height
    ||![16,256].includes(colorCount)||!(paletteWords instanceof Uint16Array)
    ||!Number.isInteger(offset)||offset<0||offset+colorCount>paletteWords.length
    ||colorIndices.some(index=>index>=colorCount))throw new Error('Battle palette: invalid indexed sprite');
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<colorIndices.length;i++){
    const index=colorIndices[i];if(index===0)continue;
    const word=paletteWords[offset+index],at=i*4;
    pixels[at]=(word&31)<<3;pixels[at+1]=((word>>>5)&31)<<3;
    pixels[at+2]=((word>>>10)&31)<<3;pixels[at+3]=255;
  }
  return {width,height,pixels};
}
export function createBattlePaletteSelector({bankBases,directionBit6,sideWords}={}){
  return word=>{
    if(!Number.isInteger(word)||word<0||word>65535)return null;
    let bank;
    if(word>=0x100&&word<=0x105)bank=word&7;
    else if(word>=0xff00&&word<=0xff07)bank=74+(word&7);
    else if(word===0xff08)bank=92+(word&3);
    else if(word>=0xff09&&word<=0xff11)bank=(word+0x014a)&65535;
    else if(word>=0xff1c&&word<=0xff1f)bank=38+(word&3);
    else if(word===0xff20)bank=96+(word&3);
    else if([0xff14,0xff16,0xff18,0xff1a].includes(word)){
      if(typeof directionBit6!=='boolean')return null;
      bank=(directionBit6?62:58)+(((word-0xff14)>>1)&3);
    }else if([0xff15,0xff17,0xff19,0xff1b].includes(word)){
      if(typeof directionBit6!=='boolean'||!Array.isArray(sideWords)||sideWords.length!==2
        ||!sideWords.every(n=>Number.isInteger(n)&&n>=0&&n<=65535))return null;
      const base=directionBit6?(sideWords[0]?66:58):(sideWords[1]?70:62);
      bank=base+(((word-0xff14)>>1)&3);
    }else{
      if(!(bankBases instanceof Uint16Array)||bankBases.length!==16)return null;
      return {bank:(bankBases[word>>>12]+(word>>>4))&255,selector:word&15};
    }
    return {bank,selector:0};
  };
}

// F0603AA74 / Final0603FE70 applies the transition to each RGB555 channel.
// ActorE1 uses step=-1 (one channel unit); FA02 uses weight0..256, moving
// by floor(abs(target-current)*weight/256), independently in each direction.
export function createBattlePaletteApproacher({mode,sourceWords,destinationWords,addressMap}){
 return ({request,count,bank,selector,weight=-1})=>{
  if(![request,count,bank,selector].every(Number.isInteger)||request<0||request>65535
   ||count<1||count>32767||bank<0||bank>255||selector<0||selector>255
   ||!Number.isInteger(weight)||weight<-1||weight>256
   ||!(sourceWords instanceof Uint16Array)||!(destinationWords instanceof Uint16Array)
   ||destinationWords.length!==1024||!Number.isInteger(mode))return false;
  const logical=request&1023;
  // The native overrun branch has a different, unverified extent. Do not
  // treat its full-plane count as an ordinary bounded color transition.
  if(count>1023-logical)return false;
  if(mode===1&&(!(addressMap instanceof Uint16Array)||addressMap.length!==64))return false;
  const start=mode===1?addressMap[((logical&240)>>>2)+(logical>>>8)]*16+(logical&15):logical;
  const source=mode===1?bank*16+selector:bank*256+selector;
  if(start+count>1024||source+count>sourceWords.length)return false;
  for(let i=0;i<count;i++){
   const current=destinationWords[start+i],target=sourceWords[source+i];let color=0;
   for(const shift of [0,5,10]){
    const value=(current>>>shift)&31,to=(target>>>shift)&31;
    const amount=weight===-1?1:(Math.abs(to-value)*weight)>>>8;
    color|=(value+Math.sign(to-value)*amount)<<shift;
   }
   destinationWords[start+i]=color;
  }
  return true;
 };
}

// Compile one FA02 color transition atomically. Source palette selectors
// are resolved by the caller; no missing palette or default weight is made up.
// Staging keeps an invalid target from leaving the optional initial copy live.
export function createBattlePaletteTransition({mode,sourceWords,destinationWords,addressMap}){
 if(!Number.isInteger(mode)||mode<0||mode>255||!(sourceWords instanceof Uint16Array)
  ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024)
  throw new Error('Battle palette: invalid transition state');
 return ({request,count,initial=null,target,weight})=>{
  const valid=selection=>selection&&[selection.bank,selection.selector].every(Number.isInteger)
   &&selection.bank>=0&&selection.bank<=255&&selection.selector>=0&&selection.selector<=255;
  if(!valid(target)||initial!==null&&!valid(initial)||!Number.isInteger(weight)||weight<0||weight>256)return false;
  const staged=destinationWords.slice(),context={mode,sourceWords,destinationWords:staged,addressMap};
  if(initial!==null&&!createBattlePaletteInitializer(context)({request,count,...initial}))return false;
  if(!createBattlePaletteApproacher(context)({request,count,...target,weight}))return false;
  destinationWords.set(staged);return true;
 };
}
// Native loading helper F0603A7F0 reserves 384 sixteen-color banks. Both
// words and two-byte bank states must come from retained scene storage.
// F060329C6..06032A02 / Final06037C4A..06037C86 assigns each
// freshly loaded texture's palette byte from its native ten-byte attributes.
// F0601A470..0601A498 maps a command byte through two-byte cache entries,
// then reads the corresponding source bank word. No gallery/header ordinal
// can substitute for this retained cache map.
export function resolveBattleSpriteLoadContext({logicalIndex,cacheMap,cacheWords,bankBases}={}){
  if(!Number.isInteger(logicalIndex)||logicalIndex<0||logicalIndex>255
    ||!(bankBases instanceof Uint16Array)||bankBases.length!==16)return null;
  let cacheIndex;
  if(cacheWords!==undefined){
    if(cacheMap!==undefined||!(cacheWords instanceof Uint16Array)||cacheWords.length>256
      ||logicalIndex>=cacheWords.length)return null;
    cacheIndex=cacheWords[logicalIndex]&255;
  }else{
    if(!(cacheMap instanceof Uint8Array)||cacheMap.length%2||cacheMap.length>512
      ||logicalIndex*2>=cacheMap.length)return null;
    cacheIndex=cacheMap[logicalIndex*2];
  }
  if(cacheIndex>=bankBases.length)return null;
  return {cacheIndex,baseBank:bankBases[cacheIndex],format:4};
}

export function advanceBattleSpriteLoadCounters(state,{textureCount,baseBank,bankCount}={}){
  if(!state||![state.textureCount,baseBank].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)
    ||!Number.isInteger(textureCount)||textureCount<0||textureCount>65535
    ||!Number.isInteger(bankCount)||bankCount<0||bankCount>255)
    throw new Error('Battle palette: unresolved sprite completion counters');
  // F06032A04..06032A1E / Final06037C88..06037CA8.
  // The caller supplies this load's base; the previous bankEnd is not added.
  state.textureCount=(state.textureCount+textureCount)&65535;
  state.bankEnd=(baseBank+bankCount)&65535;
  return state;
}

export function resolveBattleTexturePaletteBanks(attributes,baseBank){
  if(!(attributes instanceof Uint8Array)||attributes.length%10!==0
    ||attributes.length>65535*10||!Number.isInteger(baseBank)||baseBank<0||baseBank>65535)
    throw new Error('Battle palette: invalid texture palette mapping');
  const banks=new Uint8Array(attributes.length/10),v=new DataView(attributes.buffer,attributes.byteOffset,attributes.byteLength);
  for(let i=0;i<banks.length;i++)banks[i]=(baseBank+((v.getUint16(i*10+4)>>>4)&63))&255;
  return banks;
}

export function createBattlePalettePool({sourceWords,bankStates}){
  if(!(sourceWords instanceof Uint16Array)||sourceWords.length!==384*16
    ||!(bankStates instanceof Uint8Array)||bankStates.length!==384*2)
    throw new Error('Battle palette: invalid retained pool');
  return ({bank,count,words,sourceAddress})=>{
    if(![bank,count,sourceAddress].every(Number.isInteger)||bank<0||bank>65535
      ||count<0||count>65535||sourceAddress<0||sourceAddress>0xffffffff)
      return {loaded:false,reason:'invalid-request'};
    if(sourceAddress%4)return {loaded:false,code:-1};
    if(sourceAddress===0)return {loaded:false,code:-2};
    if(count===0)return {loaded:false,code:-3};
    const start=bank&255;
    if(start+count>384)return {loaded:false,code:start+count-384};
    for(let i=0;i<count;i++)if(bankStates[(start+i)*2])return {loaded:false,code:i};
    if(!(words instanceof Uint16Array)||words.length<count*16)return {loaded:false,reason:'source-bounds'};
    for(let i=0;i<count;i++)bankStates[(start+i)*2]=1;
    sourceWords.set(words.subarray(0,count*16),start*16);
    return {loaded:true,code:0};
  };
}
// Background loader F06032B60 copies descriptor palette words into its
// retained cache base and advances the next cache's base by wordCount>>4.
export function loadBattleBankPalette(loadPool,bankBases,cacheIndex,record,sourceAddress){
  const words=record?.paletteWords,colorCount=record?.colorCount;
  if(typeof loadPool!=='function'||!(bankBases instanceof Uint16Array)||bankBases.length!==16
    ||!Number.isInteger(cacheIndex)||cacheIndex<0||cacheIndex>13
    ||!(words instanceof Uint16Array)||!Number.isInteger(colorCount)||colorCount<16||colorCount>4096
    ||words.length!==colorCount||record.nativeBankCount!==(colorCount>>>4))
    return {loaded:false,reason:'invalid-bank-record'};
  const base=bankBases[cacheIndex],count=colorCount>>>4;
  const result=loadPool({bank:base&255,count,words,sourceAddress});
  if(!result.loaded)return result;
  bankBases[cacheIndex+1]=(base+count)&65535;
  return {...result,base,count,nextBase:bankBases[cacheIndex+1]};
}
// The native body loaders register at58/62 and abort for counts above four.
export function loadBattleBodyPalette(record,{role,loadPool,sourceAddress}={}){
  if(!['attacker','defender'].includes(role)||typeof loadPool!=='function'
    ||!(record?.paletteWords instanceof Uint16Array)||!Number.isInteger(record.colorCount)
    ||record.colorCount<16||record.colorCount%16||record.paletteWords.length!==record.colorCount
    ||record.nativeBankCount!==(record.colorCount>>>4))
    return {loaded:false,reason:'invalid-body-palette-record'};
  if(record.nativeBankCount>4)return {loaded:false,reason:'body-palette-bank-limit'};
  return loadPool({bank:role==='attacker'?58:62,count:record.nativeBankCount,words:record.paletteWords,sourceAddress});
}

export function createBattlePaletteInitializer({mode,sourceWords,destinationWords,addressMap}){
  if(!Number.isInteger(mode)||mode<0||mode>255||!(sourceWords instanceof Uint16Array)
    ||!(destinationWords instanceof Uint16Array)||destinationWords.length!==1024)
    throw new Error('Battle palette: invalid retained state');
  return ({request,count,bank,selector})=>{
    if(![request,count,bank,selector].every(Number.isInteger)||request<0||request>65535
      ||count<0||count>32767||bank<0||bank>255||selector<0||selector>255)return false;
    if(mode===1){
      if(!(addressMap instanceof Uint16Array)||addressMap.length!==64)return false;
      const writes=[];let cursor=request,remaining=count,source=bank*16+selector;
      const mapped=(low,group)=>(addressMap[((low&240)>>>4)*4+group]*16)+(low&15);
      const append=(start,n)=>{
        if(start<0||start+n>destinationWords.length||source+n>sourceWords.length)return false;
        for(let i=0;i<n;i++)writes.push([start+i,sourceWords[source+i]]);
        source+=n;remaining=(remaining-n)&65535;cursor=(cursor+n)&65535;return true;
      };
      const prefix=(16-(cursor&15))&15;
      // A shorter count would wrap the native unsigned counter. Its source
      // stream is not authorized as a huge synthetic transfer.
      if(count<prefix)return false;
      if(prefix&&!append(mapped(cursor&255,(cursor>>>8)&3),prefix))return false;
      let block=0,extra=0;
      // Literal native loop compares the growing block index against the
      // shrinking remaining count. Preserve it rather than "fix" the game.
      while(block<(remaining>>>4)){
        if(!append(mapped((cursor&255)+extra,(cursor>>>8)&3),16))return false;
        block++;extra+=16;
      }
      const tail=remaining&15;
      if(tail&&!append(mapped(cursor&255,(cursor>>>8)&3),tail))return false;
      for(const [at,value]of writes)destinationWords[at]=value;
      return true;
    }
    const start=((request>>>8)&3)*256+(request&255),source=bank*256+selector;
    if(start+count>destinationWords.length||source+count>sourceWords.length)return false;
    // Native sequential stores also permit bank-boundary crossing; fail only
    // when the actual retained source/destination extent would be exceeded.
    for(let i=0;i<count;i++)destinationWords[start+i]=sourceWords[source+i];
    return true;
  };
}
