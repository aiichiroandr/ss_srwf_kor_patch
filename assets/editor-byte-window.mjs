import {sha256Hex} from './sha256.mjs?v=20261104-part1';

// Compare an exact bounded window without carrying the original game bytes.
// A mask describes only an independently validated reversible edit, not unknown
// data. Copy the window before masking so caller-owned ROM bytes never change.
export function matchesByteWindow(bytes,start,length,digest,mask=null){
 if(!(bytes instanceof Uint8Array)||!Number.isInteger(start)||start<0
   ||!Number.isInteger(length)||length<=0||start+length>bytes.length
   ||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))return false;
 const window=new Uint8Array(bytes.subarray(start,start+length));
 if(mask!==null){
  if(!mask||!Number.isInteger(mask.offset)||!Number.isInteger(mask.length)||mask.length<=0
    ||mask.offset<start||mask.offset+mask.length>start+length)return false;
  window.fill(0,mask.offset-start,mask.offset-start+mask.length);
 }
 return sha256Hex(window)===digest;
}
