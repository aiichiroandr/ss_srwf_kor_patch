// Exact legacy FACE mirrors used by dictionary/save/detail portrait paths.
// The ordinary root-2 table is not their source after FACE.BIN is repacked.
import {ALICE_ART} from './editor-alice-art.mjs?v=20261105-part2';
import {base64ToBytes,bytesEqual as same,dataView as view} from './editor-bytes.mjs?v=20261105-part2';
export const ALICE_FACE_COPIES=Object.freeze([{id:101,at:0x6bbf8},{id:317,at:0x6bce4},{id:318,at:0x6bcec}].map(Object.freeze));
const END=0x6bcf4,BIT=8,header=base64ToBytes(ALICE_ART.faceHeader);
function fail(){const e=Error('ALICE 초상을 참조하는 별도 주소표가 검증된 구조와 다릅니다.');e.code='EDITOR_ALICE_INVALID';throw e;}
function envelope(b){
 if(!(b instanceof Uint8Array)||b.length<16)return null;
 const at=b.length-16,tag=new TextDecoder().decode(b.subarray(at,at+8));
 if(!['SRWALC01','SRWALC02','SRWALC04'].includes(tag))return null;
 const v=view(b),base=v.getUint32(at+8),flags=v.getUint32(at+12);
 if(base<144||base+20>at)fail();
 return {at,tag,base,flags};
}
function sourceHeader(b,delta){
 const at=8+delta;if(at<144||at+2736>b.length||view(b).getUint32(at)!==2736)fail();return b.subarray(at,at+2736);
}
export function fixAliceFaceCopies(written,original){
 const e=envelope(written);if(!e||e.tag==='SRWALC04'&&(e.flags&4)||original.length<END)return written;
 if(e.flags&BIT||e.base!==original.length)fail();
 const old=sourceHeader(original,view(original).getInt32(8));
 for(const x of ALICE_FACE_COPIES)if(!same(original.subarray(x.at,x.at+8),old.subarray(x.id*8,x.id*8+8)))fail();
 const out=written.slice(),v=view(out);
 for(const x of ALICE_FACE_COPIES)out.set(header.subarray(x.id*8,x.id*8+8),x.at);
 v.setUint32(e.at+12,e.flags|BIT);if(e.tag!=='SRWALC01')v.setUint32(e.base+16,e.flags|BIT);
 return out;
}
export function normalizeAliceFaceCopies(stored){
 const e=envelope(stored);if(!e||!(e.flags&BIT))return {stored,fixed:false};
 if(e.base<END||e.tag==='SRWALC04'&&(e.flags&4))fail();
 const old=sourceHeader(stored,view(stored).getInt32(e.base+8)),out=stored.slice(),v=view(out);
 for(const x of ALICE_FACE_COPIES){if(!same(stored.subarray(x.at,x.at+8),header.subarray(x.id*8,x.id*8+8)))fail();out.set(old.subarray(x.id*8,x.id*8+8),x.at);}
 v.setUint32(e.at+12,e.flags&~BIT);if(e.tag!=='SRWALC01'){
  if(v.getUint32(e.base+16)!==e.flags)fail();v.setUint32(e.base+16,e.flags&~BIT);
 }
 return {stored:out,fixed:true};
}
export function aliceFaceCopiesNeedFix(read,fixed){return read.faceInstalled===true&&!read.compact&&read.decoded.length>=END&&!fixed;}
