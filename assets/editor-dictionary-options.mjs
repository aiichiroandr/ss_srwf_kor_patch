// Optional Final output fixes: the hidden-hero dictionary portraits (with the
// dictionary additions that depend on them) and the straight title logo.
// Each is an explicit switch, OFF unless the user turns it on or the input
// image already carries it. An omitted request value never flips the input's
// own state, and presets carry neither switch.
import {normalizeDictionaryPortraitImage,applyDictionaryPortraitImage,inspectDictionaryPortraitImage} from './editor-dictionary-portrait-image.mjs?v=20261113-froster1';
import {changeDictionaryAdditionImage} from './editor-dictionary-addition-image.mjs?v=20261113-froster1';
import {normalizeFinalTitleLogoImage,applyStandaloneFinalTitleLogoImage,inspectFinalTitleLogoImage} from './editor-title-logo-image.mjs?v=20261113-froster1';

const SECTOR_SIZE=2352;
export const FINAL_OUTPUT_SWITCHES=Object.freeze({
 dictionaryPortraits:Object.freeze({label:'인물사전 숨은 주인공 초상'}),
 titleLogo:Object.freeze({label:'완결편 타이틀 로고'}),
});
const DEFAULT_OPS=Object.freeze({normalizeDictionaryPortraitImage,applyDictionaryPortraitImage,changeDictionaryAdditionImage,
 normalizeFinalTitleLogoImage,applyStandaloneFinalTitleLogoImage});
const OFF=Object.freeze({available:false,enabled:false});

function fail(code,message){const e=new Error(message);e.code=code;throw e;}

export async function inspectFinalOutputSwitches(blob,{gameId,signal}={}){
 if(gameId!=='srwf-final')return Object.freeze({dictionaryPortraits:OFF,titleLogo:OFF});
 const read=async inspect=>{try{return Object.freeze(await inspect(blob,{gameId,signal}));}catch(error){if(signal?.aborted)throw error;return OFF;}};
 // The ALICE dictionary entry re-targets one portrait hook (0x8278C), so the
 // portrait state is read from the EXEC with the additions taken out, exactly
 // as export composes it. Otherwise an ALICE output reopens with the switch OFF
 // and an unchanged re-save would silently drop the dictionary fix.
 const portraits=async(image,options)=>inspectDictionaryPortraitImage((await changeDictionaryAdditionImage(image,options)).outputBlob,options);
 return Object.freeze({dictionaryPortraits:await read(portraits),titleLogo:await read(inspectFinalTitleLogoImage)});
}

// undefined = keep the input image's state; otherwise an own boolean.
export function requestedFinalOutputSwitch(session,request,key){
 const spec=FINAL_OUTPUT_SWITCHES[key];
 if(!spec)fail('EDITOR_REQUEST_INVALID','알 수 없는 출력 보정입니다.');
 if(request===null||typeof request!=='object'||!Object.hasOwn(request,key))return undefined;
 const descriptor=Object.getOwnPropertyDescriptor(request,key);
 if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='boolean')fail('EDITOR_REQUEST_INVALID',`${spec.label} 설정은 참 또는 거짓이어야 합니다.`);
 if(descriptor.value&&session?.[key]?.available!==true)fail('EDITOR_REQUEST_INVALID',`이 이미지에는 ${spec.label} 보정을 적용할 수 없습니다.`);
 return descriptor.value;
}

// Dictionary step. ON runs exactly the former unconditional sequence
// (remove additions, apply portraits, re-add additions). OFF removes both.
export async function writeDictionaryOutputSwitch(written,{enabled,gameId,signal,alice=false,units=false},{finish,ops=DEFAULT_OPS}){
 if(typeof enabled!=='boolean')fail('EDITOR_REQUEST_INVALID','인물사전 숨은 주인공 초상 설정이 정해지지 않았습니다.');
 const withoutAdditions=await ops.changeDictionaryAdditionImage(written.outputBlob,{gameId,signal});
 if(withoutAdditions.changedSectors.length)written={...written,outputBlob:withoutAdditions.outputBlob,bytesChanged:written.bytesChanged+withoutAdditions.changedSectors.length*SECTOR_SIZE};
 if(!enabled){
  const dictionary=await ops.normalizeDictionaryPortraitImage(written.outputBlob,{gameId,signal});
  if(withoutAdditions.changedSectors.length||dictionary.changedSectors.length)written=await finish({...written,outputBlob:dictionary.outputBlob,
   dictionaryPortraits:dictionary.dictionaryPortraits,bytesChanged:written.bytesChanged+dictionary.changedSectors.length*SECTOR_SIZE});
  return written;
 }
 const dictionary=await ops.applyDictionaryPortraitImage(written.outputBlob,{gameId,signal});
 if(dictionary.changedSectors.length)written=await finish({...written,outputBlob:dictionary.outputBlob,
  dictionaryPortraits:dictionary.dictionaryPortraits,bytesChanged:written.bytesChanged+dictionary.changedSectors.length*SECTOR_SIZE});
 const additions=await ops.changeDictionaryAdditionImage(written.outputBlob,{gameId,signal,alice,units});
 if(additions.changedSectors.length)written=await finish({...written,outputBlob:additions.outputBlob,
  dictionaryAdditions:additions.dictionaryAdditions,bytesChanged:written.bytesChanged+additions.changedSectors.length*SECTOR_SIZE});
 return written;
}

// Title step for outputs without a linked F campaign. undefined leaves the
// input's title slots untouched.
export async function writeTitleOutputSwitch(written,{enabled,gameId,signal},{finish,ops=DEFAULT_OPS}){
 if(enabled===undefined)return written;
 if(typeof enabled!=='boolean')fail('EDITOR_REQUEST_INVALID','완결편 타이틀 로고 설정은 참 또는 거짓이어야 합니다.');
 const title=await (enabled?ops.applyStandaloneFinalTitleLogoImage:ops.normalizeFinalTitleLogoImage)(written.outputBlob,{gameId,signal});
 if(title.changedSectors.length)written=await finish({...written,outputBlob:title.outputBlob,titleLogo:title.titleLogo,
  bytesChanged:written.bytesChanged+title.changedSectors.length*SECTOR_SIZE});
 return written;
}
