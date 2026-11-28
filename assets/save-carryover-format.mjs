const AUTOMATIC_SUFFIX= /\.(?:bkr|bcr|sav|srm|gz)$/i;
const CHECKED_RAM_SUFFIX= /\.(?:ram|bin)$/i;
const ORIGINAL_NAME= /^FINAL-승계전용-/i;
const SIGNATURE=new TextEncoder().encode('BackUpRam Format'.repeat(4));
export const carryoverOriginalFile=name=>!ORIGINAL_NAME.test(name);
export const possibleCarryoverFile=name=>AUTOMATIC_SUFFIX.test(name)||CHECKED_RAM_SUFFIX.test(name);

// Extensions can be shared with unrelated saves. Verify the fixed signature
// before treating raw/interleaved files as automatic input.
// Compressed RAM candidates still go through the bounded worker parser.
export async function isCarryoverSaveInput(file,maxBytes){
 if(!file.size||file.size>maxBytes||!carryoverOriginalFile(file.name))return false;
 if(!possibleCarryoverFile(file.name))return false;
 const header=new Uint8Array(await file.slice(0,SIGNATURE.length*2).arrayBuffer());
 return SIGNATURE.every((b,i)=>header[i]===b)
  ||SIGNATURE.every((b,i)=>header[2*i]===255&&header[2*i+1]===b)
  ||(header[0]===31&&header[1]===139);
}

export function carryoverDownloadName(inputName,format={}){
 const clean=String(inputName??'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').trim();
 const ext=clean.match(/\.(?:bkr|bcr|sav|srm|ram|bin)(?:\.gz)?$|\.gz$/i)?.[0]??'';
 // Known native names remain native and unknown suffixes are not relabelled
 // as .bcr. The browser already verified the contents; this only names them.
 const stem=Array.from(ext?clean.slice(0,-ext.length):clean).slice(0,75).join('')||'save';
 const inferred=format.bytes===0x8000?'.bkr':format.bytes>0x8000?'.bcr':'.bin';
 const suffix=ext||(clean.includes('.')?'.bin':inferred)+(format.gzipLayers>0?'.gz':'');
 return 'FINAL-승계전용-'+stem+suffix;
}

export function carryoverFormatLabel(format={}){
 const memory=format.bytes===0x8000?'내장 메모리':format.bytes>0x8000?'백업 카트리지':'';
 return [memory,format.interleaved?'인터리브':'',format.gzipLayers>0?'gzip':''].filter(Boolean).join(' · ');
}
