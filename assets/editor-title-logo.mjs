// Fixed, reversible title edits. This changes only the user's authenticated
// graphic slots; it adds no resource, pointer, record or archive allocation.
import {FINAL_TITLE_LOGO_DATA as DATA} from './editor-title-logo-data.mjs?v=20261106-part4';
import {sha256Hex} from './sha256.mjs?v=20261106-part4';
import {base64UrlToBytes,bytesEqual as same} from './editor-bytes.mjs?v=20261106-part4';

function invalid(){const e=Error('완결편 타이틀의 원본 또는 보정 데이터가 일치하지 않습니다.');e.code='EDITOR_TITLE_LOGO_INVALID';throw e;}
function slots(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<1208||bytes.length>4*1024*1024)return null;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),table=v.getUint32(0);
 if(![151*8,160*8].includes(table))return null;
 const result=[];
 for(const spec of DATA.records){
  const cell=spec.bank*8,start=cell+v.getUint32(cell),end=cell+4+v.getUint32(cell+4);
  if(start<table||end>bytes.length||end-start!==spec.length)return null;
  result.push({spec,start,end,hash:sha256Hex(bytes.subarray(start,end))});
 }
 if(result[0].end!==result[1].start)return null;
 return result;
}
export function inspectFinalTitleLogo(bytes){
 const rows=slots(bytes);if(!rows)return null;
 for(const state of ['original','purple','red']){
  if(rows.every(r=>r.hash===(state==='original'?r.spec.originalSha256:(r.spec.shared??r.spec.variants[state]).sha256)))
   return Object.freeze({state,shape:state==='original'?'original':'straight'});
 }
 return null;
}
function xorSlot(bytes,spec,state){
 if(state==='original')return;
 const encoded=(spec.shared??spec.variants[state]).xor;
 const stream=base64UrlToBytes(encoded);let at=0,end=0;
 function number(){let n=0,shift=0;for(let i=0;i<4;i++){if(at>=stream.length)invalid();const b=stream[at++];n+=(b&127)*2**shift;if(!(b&128))return n;shift+=7;}invalid();}
 while(at<stream.length){
  const start=end+number(),length=number();end=start+length;
  if(!length||end>bytes.length||at+length>stream.length)invalid();
  for(let i=0;i<length;i++){const b=stream[at++];if(!b)invalid();bytes[start+i]^=b;}
 }
}
export function setFinalTitleLogo(bytes,state){
 if(!['original','purple','red'].includes(state))invalid();
 const before=inspectFinalTitleLogo(bytes);if(!before)invalid();
 if(before.state===state)return bytes;
 const out=new Uint8Array(bytes),rows=slots(out);
 for(const {spec,start,end}of rows){
  const slot=out.subarray(start,end);xorSlot(slot,spec,before.state);
  if(sha256Hex(slot)!==spec.originalSha256)invalid();
  xorSlot(slot,spec,state);
 }
 if(inspectFinalTitleLogo(out)?.state!==state)invalid();
 // Pointer table and every byte outside the two fixed allocations stay exact.
 if(!same(out.subarray(0,rows[0].start),bytes.subarray(0,rows[0].start))
  ||!same(out.subarray(rows[1].end),bytes.subarray(rows[1].end)))invalid();
 return out;
}
export function campaignTitleLogo(bytes){return setFinalTitleLogo(bytes,'red');}
export function canonicalTitleLogo(bytes){return inspectFinalTitleLogo(bytes)?setFinalTitleLogo(bytes,'original'):bytes;}
