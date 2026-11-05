// Both CD loaders may overwrite 2028d000 onward. A whole appended unit table
// crosses this boundary. Keep the original pointer table, pooling
// only authenticated, unchanged empty slots. Final may place overflowing whole
// records below Final's 2028d000 CD-sector reserve. Active units remain independent.
// The small footer retains the logical pointer table for lossless reopening;
// the existing provenance normalizers still authenticate that logical layout.
import {unusedUnitFillerTest} from './editor-unit-restoration.mjs?v=20261105-part2';
import {writeRelative32,requireTsrRuntimeSize,tsrRuntimeLimit,tsrHistoricalStorageLimit} from './editor-storage-safety.mjs?v=20261105-part2';
import {bytesEqual as equal,bytesToHex,dataView as view} from './editor-bytes.mjs?v=20261105-part2';
const MAGIC=new TextEncoder().encode('SRUCMP01'),MAGIC_F=new TextEncoder().encode('SRUCMP02'),MAGIC_FINAL=new TextEncoder().encode('SRUCMP03'),MAGIC_SPLIT_OLD=new TextEncoder().encode('SRUCMP04'),MAGIC_SPLIT=new TextEncoder().encode('SRUCMP05'),FOOTER=32,SPLIT_FOOTER=40;
const MAGIC_INLINE_F=new TextEncoder().encode('SRUCMP06'),MAGIC_INLINE_F7=new TextEncoder().encode('SRUCMP07'),MAGIC_INLINE_FINAL=new TextEncoder().encode('SRUCMP08'),MAGIC_INLINE_FINAL_REF=new TextEncoder().encode('SRUCMP09');
function fail(reason,details={}){const e=Error('기체 데이터를 게임의 허용 메모리 안에 안전하게 저장할 수 없습니다. 변경을 줄여 주세요.');e.code='EDITOR_STORAGE_INVALID';e.details={reason,...details};throw e;}
function pointers(bytes){
  if(bytes.length<8)fail('unit-table');
  const v=view(bytes),size=v.getUint32(0);
  if(size<8||size%4||size>4096||size>bytes.length)fail('unit-pointers');
  const offsets=Array.from({length:size/4},(_,i)=>i*4+v.getInt32(i*4));
  if(offsets.some(n=>n<size||n>=bytes.length))fail('unit-target');
  const starts=[...new Set(offsets)].sort((a,b)=>a-b);
  if(starts[0]!==size)fail('unit-order');
  return {size,offsets,records:starts.map((start,i)=>({start,end:starts[i+1]??bytes.length}))};
}
// Report the shared region using the writer's exact unchanged-filler pooling.
export function unitStorageUsage(decoded,storage,gameId){
 if(!storage)return null;
 const start=108+view(decoded).getInt32(108),end=start===storage.start?start+storage.length:decoded.length;
 const active=decoded.subarray(start,end),table=pointers(active),empty=unusedUnitFillerTest(gameId);
 const eligible=new Set((storage.restoration?.slots??[]).map(s=>s.recordIndex));let used=table.size,inside=table.size,overflow=0,pooled=false;
 for(const r of table.records){
  const owners=table.offsets.flatMap((at,id)=>at===r.start?[id]:[]),part=active.subarray(r.start,r.end);
  const filler=owners.every(id=>eligible.has(id))&&empty(part);
  if(filler&&pooled)continue;
  if(filler)pooled=true;used+=part.length;
  if(inside+part.length<=storage.length)inside+=part.length;else overflow+=part.length;
 }
 const metadata=gameId==='srwf-f'&&start!==storage.start&&start>=tsrRuntimeLimit(gameId)?encodePointerOffsets(table.offsets).length+FOOTER+2:0;
 return {usedBytes:used+metadata,metadataBytes:metadata,limitBytes:storage.length,remainingBytes:storage.length-used-metadata,insideBytes:inside,overflowBytes:overflow};
}
// Encode logical offsets as bounded forward/backward deltas. Historical F
// stored them after TSR; current full-size F stores them inside the unit gap.
// This changes editor metadata only; the game still reads ordinary BE32 cells.
function encodePointerOffsets(offsets){
  const result=[];let last=0;
  const uint=n=>{do{const low=n%128;n=Math.floor(n/128);result.push(low|(n?128:0));}while(n);};
  for(const at of offsets){const delta=at-last;if(delta<0){uint(0);uint(-delta);}else uint(delta+1);last=at;}
  return Uint8Array.from(result);
}
function decodePointerOffsets(bytes,count){
  let p=0,last=0;const result=[];
  const uint=()=>{let n=0,m=1;for(let i=0;i<3;i++){if(p>=bytes.length)fail('compact-delta-eof');const b=bytes[p++];n+=(b&127)*m;if(n>65536)fail('compact-delta-range');if(!(b&128)){if(i&&b===0)fail('compact-delta-canonical');return n;}m*=128;}fail('compact-delta-length');};
  for(let i=0;i<count;i++){const n=uint();let delta=n-1;if(!n){delta=-uint();if(!delta)fail('compact-delta-zero');}last+=delta;if(last<0||last>=65536)fail('compact-delta-target');result.push(last);}
  if(p!==bytes.length)fail('compact-delta-tail');return result;
}
// F07 uses canonical Huffman coding only for the reconstruction ledger. Native BE32 unit
// pointers, every unit record and the persistent RAM boundary are unchanged.
function canonicalCodes(lengths){
 const sorted=[...lengths].sort((a,b)=>a[1]-b[1]||a[0]-b[0]),result=new Map();let code=0,last=0;
 for(const [symbol,length]of sorted){if(!Number.isInteger(length)||length<1||length>24)fail('f7-huffman-length');code*=2**(length-last);if(code>=2**length)fail('f7-huffman-tree');result.set(symbol,{code,length});code++;last=length;}
 return result;
}
function packOffsetLedger(raw){
 const frequencies=new Map();for(const symbol of raw)frequencies.set(symbol,(frequencies.get(symbol)??0)+1);
 const queue=[...frequencies].map(([symbol,weight])=>({symbol,weight,minimum:symbol}));
 const sort=()=>queue.sort((a,b)=>a.weight-b.weight||a.minimum-b.minimum);
 while(queue.length>1){sort();const left=queue.shift(),right=queue.shift();queue.push({weight:left.weight+right.weight,minimum:Math.min(left.minimum,right.minimum),left,right});}
 const lengths=[],visit=(node,depth)=>{if(node.symbol!==undefined)lengths.push([node.symbol,Math.max(1,depth)]);else{visit(node.left,depth+1);visit(node.right,depth+1);}};
 if(!queue.length||queue.length>256)fail('f7-huffman-source');visit(queue[0],0);lengths.sort((a,b)=>a[0]-b[0]);
 const codes=canonicalCodes(lengths),bits=[];let byte=0,count=0;
 for(const symbol of raw){const {code,length}=codes.get(symbol);for(let shift=length-1;shift>=0;shift--){byte=byte*2+(Math.floor(code/2**shift)%2);if(++count===8){bits.push(byte);byte=0;count=0;}}}
 if(count)bits.push(byte*2**(8-count));
 const payload=new Uint8Array(2+lengths.length*2+bits.length),pv=view(payload);pv.setUint16(0,lengths.length);
 lengths.forEach(([symbol,length],i)=>{payload[2+i*2]=symbol;payload[3+i*2]=length;});payload.set(bits,2+lengths.length*2);
 const result=new Uint8Array(5+payload.length),d=view(result);result[0]=250;d.setUint16(1,raw.length);d.setUint16(3,payload.length);result.set(payload,5);return result;
}
function unpackOffsetLedger(frame){
 if(frame.length<9||frame[0]!==250)fail('f7-ledger-frame');
 const d=view(frame),rawLength=d.getUint16(1),packedLength=d.getUint16(3),count=d.getUint16(5);
 if(!rawLength||rawLength>4096||packedLength!==frame.length-5||!count||count>256||7+count*2>=frame.length)fail('f7-ledger-size');
 const lengths=[];for(let i=0;i<count;i++){const symbol=frame[7+i*2],length=frame[8+i*2];if(symbol<=(lengths.at(-1)?.[0]??-1))fail('f7-huffman-symbols');lengths.push([symbol,length]);}
 const codes=canonicalCodes(lengths),byLength=new Map();for(const [symbol,{code,length}]of codes){if(!byLength.has(length))byLength.set(length,new Map());byLength.get(length).set(code,symbol);}
 const result=new Uint8Array(rawLength),start=7+count*2;let bit=0;
 for(let at=0;at<rawLength;at++){let code=0,found=false;for(let length=1;length<=24;length++){
  if(start+Math.floor(bit/8)>=frame.length)fail('f7-huffman-eof');code=code*2+((frame[start+Math.floor(bit/8)]>>(7-bit%8))&1);bit++;
  const symbol=byLength.get(length)?.get(code);if(symbol!==undefined){result[at]=symbol;found=true;break;}
 }if(!found)fail('f7-huffman-code');}
 if(start+Math.ceil(bit/8)!==frame.length||bit%8&&frame.at(-1)%(2**(8-bit%8))!==0||!equal(packOffsetLedger(result),frame))fail('f7-ledger-noncanonical');return result;
}
export function fUnitOffsetLedgerDiagnostics(staged){
 const foot=inlineFooter(staged);if(foot<0)return null;
 const d=view(staged),gap=d.getUint32(foot+16)+d.getUint32(foot+28)+2;let begin=gap;
 if([...new TextEncoder().encode('SRFAUX01')].every((n,i)=>staged[begin+i]===n))begin+=16+d.getUint32(begin+8);
 while(begin<foot&&staged[begin]===0)begin++;
 const frame=staged.subarray(begin,foot),is7=MAGIC_INLINE_F7.every((b,i)=>staged[foot+i]===b),raw=is7?unpackOffsetLedger(frame):frame;
 return {version:is7?7:6,rawBytes:raw.length,storedBytes:frame.length,savedBytes:raw.length-frame.length};
}
export function repackFUnitOffsetLedger(staged){
 const foot=inlineFooter(staged);if(foot<0||!MAGIC_INLINE_F.every((b,i)=>staged[foot+i]===b))return staged;
 const d=view(staged),unitStart=d.getUint32(foot+16),tableSize=d.getUint32(foot+24),used=d.getUint32(foot+28),gap=unitStart+used+2;
 let begin=gap;while(begin<foot&&staged[begin]===0)begin++;
 const raw=staged.subarray(begin,foot),offsets=decodePointerOffsets(raw,tableSize/4);
 if(!equal(encodePointerOffsets(offsets),raw))fail('f7-source-ledger');
 const packed=packOffsetLedger(raw);if(packed.length>=raw.length)return staged;
 const out=staged.slice();out.fill(0,gap,foot);out.set(packed,foot-packed.length);out.set(MAGIC_INLINE_F7,foot);return out;
}
export function compactUnitStorage(decoded,storage,gameId,{experimentalFinalInline=false,experimentalFinalReference=false}={}){
 const marker=gameId==='srwf-f'?MAGIC_F:experimentalFinalReference?MAGIC_INLINE_FINAL_REF:experimentalFinalInline?MAGIC_INLINE_FINAL:MAGIC_FINAL;
 try{return encodeStorage(decoded,storage,gameId,marker,true);}
 catch(error){
  // Preserve the old output format whenever it fits. Inline storage is a
  // fallback only when its metadata would cross the verified RAM ceiling.
  if(gameId==='srwf-final'&&!experimentalFinalInline&&error?.code==='EDITOR_STORAGE_INVALID'
    &&Number.isSafeInteger(error.details?.decodedBytes)&&error.details.decodedBytes>tsrRuntimeLimit(gameId)){
   try{return encodeStorage(decoded,storage,gameId,MAGIC_INLINE_FINAL,true);}
   catch(inlineError){
    if(inlineError?.code==='EDITOR_STORAGE_INVALID'&&inlineError.details?.reason==='final-unit-inline-capacity'
      &&/^[0-9a-f]{64}$/.test(storage?.baseSha??''))return encodeStorage(decoded,storage,gameId,MAGIC_INLINE_FINAL_REF,true);
    throw inlineError;
   }
  }
  throw error;
 }
}
function encodeStorage(decoded,storage,gameId,marker,allowSplit=false,historical=false){
  if(!['srwf-f','srwf-final'].includes(gameId)||!storage)return decoded;
  const v=view(decoded),start=108+v.getInt32(108);
  if(start===storage.start)return decoded;
  if(start<storage.start+storage.length||start>=decoded.length
    ||decoded.subarray(storage.start,storage.start+storage.length).some(Boolean))fail('unit-vacated-region');
  const active=decoded.subarray(start),table=pointers(active),preimage=unusedUnitFillerTest(gameId);
  const eligible=new Set((storage.restoration?.slots??[]).map(s=>s.recordIndex));
  const moved=new Map(),parts=[];let cursor=table.size,empty=null;
  for(const r of table.records){
    const part=active.subarray(r.start,r.end),owners=table.offsets.flatMap((at,id)=>at===r.start?[id]:[]);
    const filler=owners.every(id=>eligible.has(id))&&preimage(part);
    if(filler&&empty!==null){moved.set(r.start,empty);continue;}
    moved.set(r.start,cursor);if(filler)empty=cursor;
    parts.push(part);cursor+=part.length;
  }
  if(cursor>storage.length){
    if(gameId==='srwf-final'&&(allowSplit||marker===MAGIC_SPLIT||marker===MAGIC_SPLIT_OLD)){
      // Historical small layouts can keep their already safe logical table.
      // Accepted Final layouts and all split records require halfwords.
      if(marker!==MAGIC_SPLIT&&storage.start%2&&decoded.length<=tsrRuntimeLimit(gameId))return decoded;
      return encodeSplit(decoded,storage,table,parts,moved,start,marker===MAGIC_SPLIT_OLD,historical);
    }
    if(decoded.length<=tsrRuntimeLimit(gameId))return decoded;
    fail('unit-region-capacity',{usedBytes:cursor,limitBytes:storage.length,excessBytes:cursor-storage.length});
  }
  if(marker===MAGIC_SPLIT||marker===MAGIC_SPLIT_OLD)fail('split-unneeded');
  const rawMeta=marker===MAGIC?active.subarray(0,table.size):encodePointerOffsets(table.offsets);
  if(marker===MAGIC_INLINE_FINAL_REF&&!/^[0-9a-f]{64}$/.test(storage.baseSha??''))fail('reference-profile');
  const meta=marker===MAGIC_INLINE_FINAL_REF?Uint8Array.from(storage.baseSha.match(/../g).map(x=>parseInt(x,16))):marker===MAGIC_INLINE_F7||marker===MAGIC_INLINE_FINAL?packOffsetLedger(rawMeta):rawMeta;
  const inline=marker===MAGIC_INLINE_F||marker===MAGIC_INLINE_F7||marker===MAGIC_INLINE_FINAL||marker===MAGIC_INLINE_FINAL_REF||gameId==='srwf-f'&&!historical&&start>=tsrRuntimeLimit(gameId);
  if(inline&&(storage.start+storage.length>tsrRuntimeLimit(gameId)||cursor+2+meta.length+FOOTER>storage.length))
   fail(marker===MAGIC_INLINE_FINAL||marker===MAGIC_INLINE_FINAL_REF?'final-unit-inline-capacity':'f-unit-inline-capacity',{usedBytes:cursor+2+meta.length+FOOTER,limitBytes:storage.length,excessBytes:cursor+2+meta.length+FOOTER-storage.length});
  const out=new Uint8Array(inline?start:start+meta.length+FOOTER);out.set(decoded.subarray(0,start));
  out.fill(0,storage.start,storage.start+storage.length);
  const packed=out.subarray(storage.start,storage.start+storage.length);
  table.offsets.forEach((at,i)=>writeRelative32(packed,i*4,moved.get(at)));
  let at=table.size;for(const part of parts){packed.set(part,at);at+=part.length;}
  const foot=inline?storage.start+storage.length-FOOTER:out.length-FOOTER;
  out.set(meta,inline?foot-meta.length:start);writeRelative32(out,108,storage.start);
  const d=view(out);out.set(inline?(marker===MAGIC_INLINE_FINAL_REF?MAGIC_INLINE_FINAL_REF:marker===MAGIC_INLINE_FINAL?MAGIC_INLINE_FINAL:marker===MAGIC_INLINE_F7?MAGIC_INLINE_F7:MAGIC_INLINE_F):marker,foot);
  [start,active.length,storage.start,storage.length,table.size,cursor].forEach((n,i)=>d.setUint32(foot+8+i*4,n));
  if(marker===MAGIC_INLINE_FINAL||marker===MAGIC_INLINE_FINAL_REF){
    let pos=storage.start+table.size;
    for(const part of parts){const end=50+4*part[46];
      if(part.length<end||part[end-2]||part[end-1])fail('split-terminator');
      for(let p=48;p<end-2;p+=4)if(!((part[p]&7)<<8|part[p+1]))fail('split-zero-weapon');
      if(out[pos+end]&128)fail('split-post-record-flag');pos+=part.length;
    }
  }
  if(!inline)requireStoredSize(out,gameId,historical);return out;
}
function inlineFooter(stored){
 if(stored.length<144)return -1;const d=view(stored),size=d.getUint32(0),start=108+d.getInt32(108);
 if(size<144||size%4||size>512||start<size||start>=stored.length)return -1;
 let end=stored.length;for(let cell=0;cell<size;cell+=4){const at=cell+d.getInt32(cell);if(at>start&&at<end)end=at;}
 const foot=end-FOOTER;return foot>=start&&[MAGIC_INLINE_F,MAGIC_INLINE_F7,MAGIC_INLINE_FINAL,MAGIC_INLINE_FINAL_REF].some(m=>m.every((b,i)=>stored[foot+i]===b))?foot:-1;
}
export function isFinalInlineUnitStorage(stored){
 if(!(stored instanceof Uint8Array))return false;
 const foot=inlineFooter(stored);return foot>=0&&[MAGIC_INLINE_FINAL,MAGIC_INLINE_FINAL_REF].some(m=>m.every((b,i)=>stored[foot+i]===b));
}
export function isFinalReferenceInlineUnitStorage(stored){
 if(!(stored instanceof Uint8Array))return false;
 const foot=inlineFooter(stored);return foot>=0&&MAGIC_INLINE_FINAL_REF.every((b,i)=>stored[foot+i]===b);
}
export function finalInlineLedgerBytes(stored){
 if(!isFinalInlineUnitStorage(stored))return 0;
 const foot=inlineFooter(stored),d=view(stored),unitStart=d.getUint32(foot+16),used=d.getUint32(foot+28);
 let begin=unitStart+used+2;if(begin>foot)fail('compact-layout');if(MAGIC_INLINE_FINAL_REF.every((b,i)=>stored[foot+i]===b))begin=foot-32;else while(begin<foot&&stored[begin]===0)begin++;
 return 2+(foot-begin)+FOOTER;
}
function requireStoredSize(bytes,gameId,historical){
 if(!historical)return requireTsrRuntimeSize(bytes,gameId);
 if(bytes.length>tsrHistoricalStorageLimit(gameId))fail('historical-storage-size');
}
function encodeSplit(decoded,storage,table,parts,pooled,start,legacy=false,historical=false){
  // First-fit whole records; never move the first record. The first BE32 cell
  // must remain the original table size because game count loops also read it.
  if(start%2||storage.start%2||parts.some(part=>part.length%2))fail('split-alignment');
  const destinations=new Map(),inside=[],outside=[];let local=table.size,tail=0,ordinal=table.size;
  for(const part of parts){
    if(local+part.length<=storage.length){destinations.set(ordinal,storage.start+local);inside.push({part,at:storage.start+local});local+=part.length;}
    else{if(ordinal===table.size)fail('split-first-record');destinations.set(ordinal,start+tail);outside.push({part,at:start+tail});tail+=part.length;}
    ordinal+=part.length;
  }
  if(!tail)fail('split-unneeded');
  // 06031E0C tests bit7 of the byte after a unit's weapon terminator. Never
  // expose the pointer metadata (whose first byte may be 81) to that read.
  const guard=legacy?0:2,meta=encodePointerOffsets(table.offsets),out=new Uint8Array(start+tail+guard+meta.length+SPLIT_FOOTER);
  requireStoredSize(out,'srwf-final',historical);out.set(decoded.subarray(0,start));out.fill(0,storage.start,storage.start+storage.length);
  table.offsets.forEach((at,id)=>writeRelative32(out,storage.start+id*4,destinations.get(pooled.get(at))));
  for(const {part,at}of [...inside,...outside])out.set(part,at);
  if(!legacy)for(const {part,at}of [...inside,...outside]){
    const end=50+4*part[46];
    if(part.length<end||part[end-2]||part[end-1])fail('split-terminator');
    for(let p=48;p<end-2;p+=4)if(!((part[p]&7)<<8|part[p+1]))fail('split-zero-weapon');
    if(out[at+end]&128)fail('split-post-record-flag');
  }
  out.set(meta,start+tail+guard);writeRelative32(out,108,storage.start);
  const foot=out.length-SPLIT_FOOTER,d=view(out);out.set(legacy?MAGIC_SPLIT_OLD:MAGIC_SPLIT,foot);
  [start,decoded.length-start,storage.start,storage.length,table.size,local,tail,meta.length].forEach((n,i)=>d.setUint32(foot+8+i*4,n));
  return out;
}
function expandSplit(stored,gameId,legacy=false){
  if(gameId!=='srwf-final')fail('compact-game');requireStoredSize(stored,gameId,legacy);
  const foot=stored.length-SPLIT_FOOTER,v=view(stored),[start,length,unitStart,unitLength,tableSize,used,overflow,metaLength]=Array.from({length:8},(_,i)=>v.getUint32(foot+8+i*4));
  const guard=legacy?0:2;
  if(start<144||!overflow||!metaLength||metaLength>tableSize||start+overflow+guard+metaLength!==foot
    ||stored.subarray(start+overflow,start+overflow+guard).some(Boolean)
    ||length<tableSize||length>65536||start+length>608256||unitStart<144||unitStart+unitLength>start
    ||used<tableSize||used>unitLength||tableSize<8||tableSize%4||tableSize>4096
    ||108+v.getInt32(108)!==unitStart||v.getUint32(unitStart)!==tableSize)fail('split-layout');
  const logicalTable=new Uint8Array(length),d=view(logicalTable);
  decodePointerOffsets(stored.subarray(start+overflow+guard,foot),tableSize/4).forEach((at,i)=>d.setInt32(i*4,at-i*4));
  const table=pointers(logicalTable),groups=new Map(),eligible=[];
  if(table.size!==tableSize)fail('compact-count');
  for(const r of table.records){
    const owners=table.offsets.flatMap((at,id)=>at===r.start?[id]:[]),cell=unitStart+owners[0]*4,at=cell+v.getInt32(cell),n=r.end-r.start;
    const inside=at>=unitStart+tableSize&&at+n<=unitStart+used,outside=at>=start&&at+n<=start+overflow;
    if(n<50||!inside&&!outside||owners.some(id=>unitStart+id*4+v.getInt32(unitStart+id*4)!==at))fail('split-record');
    logicalTable.set(stored.subarray(at,at+n),r.start);
    if(!groups.has(at))groups.set(at,[]);groups.get(at).push(...owners);
  }
  for(const ids of groups.values())if(ids.length>1)eligible.push(...ids);
  const out=new Uint8Array(start+length);out.set(stored.subarray(0,start));out.fill(0,unitStart,unitStart+unitLength);out.set(logicalTable,start);writeRelative32(out,108,start);
  const storage={start:unitStart,length:unitLength,restoration:{slots:eligible.map(recordIndex=>({recordIndex}))}};
  if(!equal(encodeStorage(out,storage,gameId,legacy?MAGIC_SPLIT_OLD:MAGIC_SPLIT,false,legacy),stored))fail('compact-noncanonical');
  return out;
}
function expandFinalReference(stored,foot,profiles,inlineAuxiliary){
 const v=view(stored),[start,length,unitStart,unitLength,tableSize,used]=Array.from({length:6},(_,i)=>v.getUint32(foot+8+4*i));
 const metaStart=foot-32,guard=unitStart+used+2;
 if(start!==stored.length||start<144||length<tableSize||length>65536||start+length>608256
  ||unitStart<144||unitStart+unitLength!==foot+FOOTER||unitStart+unitLength>tsrRuntimeLimit('srwf-final')
  ||tableSize<8||tableSize%4||tableSize>4096||used<tableSize||guard>metaStart
  ||108+v.getInt32(108)!==unitStart||stored.subarray(unitStart+used,metaStart).some(Boolean))fail('compact-layout');
 const hash=bytesToHex(stored.subarray(metaStart,foot));
 if(!Array.isArray(profiles))fail('reference-profile');
 const matches=profiles.filter(p=>p.gameId==='srwf-final'&&p.baseTargetSha256===hash&&p.unitStorage),profile=matches[0];
 const storage=profile?.unitStorage,offsets=storage?.offsets;
 if(!storage||storage.start!==unitStart||storage.length!==unitLength||!Array.isArray(offsets)||offsets.length!==tableSize/4
  ||offsets.some(x=>!Number.isSafeInteger(x)||x<tableSize||x>=unitLength)
  ||matches.some(p=>p.decodedLength!==profile.decodedLength||JSON.stringify(p.unitStorage)!==JSON.stringify(storage))
  ||Math.ceil(profile.decodedLength/4)*4>start||(!inlineAuxiliary&&start>tsrRuntimeLimit('srwf-final')))fail('reference-profile',{hash,matches:matches.length,unitStart,unitLength,tableSize,start,profileLength:profile?.decodedLength,storageStart:storage?.start,storageLength:storage?.length,offsetCount:offsets?.length,badOffsets:offsets?.filter(x=>!Number.isSafeInteger(x)||x<tableSize||x>=unitLength).slice(0,5)});
 const packed=stored.subarray(unitStart,unitStart+used),physical=pointers(packed),starts=[...new Set(offsets)].sort((a,b)=>a-b);
 if(physical.size!==tableSize||starts[0]!==tableSize)fail('compact-count');
 const ends=new Map(physical.records.map(r=>[r.start,r.end])),logical=new Uint8Array(length),d=view(logical);let cursor=tableSize;
 for(const [ordinal,original] of starts.entries()){
  const owners=offsets.flatMap((at,id)=>at===original?[id]:[]),first=owners[0]*4,physicalAt=first+view(packed).getInt32(first);
  const end=ends.get(physicalAt),n=end-physicalAt;
  const originalLength=(starts[ordinal+1]??storage.length)-original;
  if(!Number.isSafeInteger(end)||n<50||n<originalLength||(n-originalLength)%4!==0||n>originalLength+64
   ||cursor+n>length||owners.some(id=>id*4+view(packed).getInt32(id*4)!==physicalAt))fail('compact-record');
  owners.forEach(id=>d.setInt32(id*4,cursor-id*4));logical.set(packed.subarray(physicalAt,end),cursor);cursor+=n;
 }
 if(cursor!==length)fail('compact-length');
 const out=new Uint8Array(start+length);out.set(stored.subarray(0,start));out.fill(0,unitStart,unitStart+unitLength);out.set(logical,start);writeRelative32(out,108,start);
 if(!equal(encodeStorage(out,{...storage,baseSha:hash},'srwf-final',MAGIC_INLINE_FINAL_REF,false,true),stored))fail('compact-noncanonical');
 return out;
}
export function expandCompactUnitStorage(stored,gameId,{profiles=[],inlineAuxiliary=false}={}){
  const splitFoot=stored.length-SPLIT_FOOTER;
  if(splitFoot>=0&&MAGIC_SPLIT.every((v,i)=>stored[splitFoot+i]===v))return expandSplit(stored,gameId);
  if(splitFoot>=0&&MAGIC_SPLIT_OLD.every((v,i)=>stored[splitFoot+i]===v))return expandSplit(stored,gameId,true);
  const embedded=inlineFooter(stored),inline=embedded>=0,inline7=inline&&MAGIC_INLINE_F7.every((b,i)=>stored[embedded+i]===b),inlineFinal=inline&&MAGIC_INLINE_FINAL.every((b,i)=>stored[embedded+i]===b),inlineFinalRef=inline&&MAGIC_INLINE_FINAL_REF.every((b,i)=>stored[embedded+i]===b);
  const foot=inline?embedded:stored.length-FOOTER;
  if(foot<0)return stored;
  const old=MAGIC.every((v,i)=>stored[foot+i]===v),f=MAGIC_F.every((v,i)=>stored[foot+i]===v),final=MAGIC_FINAL.every((v,i)=>stored[foot+i]===v),packedOffsets=f||final;
  if(!old&&!packedOffsets&&!inline)return stored;
  if(inline&&(inlineFinal||inlineFinalRef?gameId!=='srwf-final':gameId!=='srwf-f'))fail('compact-game');
  if(inlineFinalRef)return expandFinalReference(stored,foot,profiles,inlineAuxiliary);
  if((old||final)&&gameId!=='srwf-final'||f&&gameId!=='srwf-f')fail('compact-game');
  const v=view(stored),[start,length,unitStart,unitLength,tableSize,used]=Array.from({length:6},(_,i)=>v.getUint32(foot+8+4*i));
  const metaStart=inline?unitStart+used+2:start;
  if(start<144||(!inline&&(foot<=start||foot-start>tableSize||!packedOffsets&&start+tableSize!==foot))||inline&&(start!==stored.length||unitStart+unitLength!==foot+FOOTER||metaStart>foot||unitStart+unitLength>tsrRuntimeLimit(gameId))||length<tableSize||length>65536||start+length>608256
    ||unitStart<144||unitStart+unitLength>start||used>unitLength||used<tableSize
    ||108+v.getInt32(108)!==unitStart||tableSize<8||tableSize%4||tableSize>4096)fail('compact-layout');
  const logicalTable=new Uint8Array(length);
  if(inline){
    // The exact varint payload is right-aligned. Zero gap/guard precedes it;
    // canonical re-encoding below authenticates its unique position and bytes.
    let begin=metaStart;while(begin<foot&&stored[begin]===0)begin++;
    decodePointerOffsets(inline7||inlineFinal?unpackOffsetLedger(stored.subarray(begin,foot)):stored.subarray(begin,foot),tableSize/4).forEach((at,i)=>view(logicalTable).setInt32(i*4,at-i*4));
  }
  else if(packedOffsets)decodePointerOffsets(stored.subarray(start,foot),tableSize/4).forEach((at,i)=>view(logicalTable).setInt32(i*4,at-i*4));
  else logicalTable.set(stored.subarray(start,foot));
  const table=pointers(logicalTable),packed=stored.subarray(unitStart,unitStart+used);
  if(table.size!==tableSize||view(packed).getUint32(0)!==tableSize)fail('compact-count');
  const groups=new Map(),eligible=[];
  for(const r of table.records){
    const owners=table.offsets.flatMap((at,id)=>at===r.start?[id]:[]),cell=owners[0]*4;
    const at=cell+view(packed).getInt32(cell),n=r.end-r.start;
    if(n<50||at<tableSize||at+n>packed.length
      ||owners.some(id=>id*4+view(packed).getInt32(id*4)!==at))fail('compact-record');
    logicalTable.set(packed.subarray(at,at+n),r.start);
    if(!groups.has(at))groups.set(at,[]);groups.get(at).push(...owners);
  }
  // Only exact empty-record preimages may acquire new aliases. Re-encoding
  // checks every pointer, padding byte, footer field and pooled destination.
  for(const ids of groups.values())if(ids.length>1)eligible.push(...ids);
  const out=new Uint8Array(start+length);out.set(stored.subarray(0,start));
  out.fill(0,unitStart,unitStart+unitLength);out.set(logicalTable,start);writeRelative32(out,108,start);
  const storage={start:unitStart,length:unitLength,restoration:{slots:eligible.map(recordIndex=>({recordIndex}))}};
  if(!equal(encodeStorage(out,storage,gameId,inline?(inlineFinal?MAGIC_INLINE_FINAL:inline7?MAGIC_INLINE_F7:MAGIC_INLINE_F):old?MAGIC:f?MAGIC_F:MAGIC_FINAL,false,true),stored))fail('compact-noncanonical');
  return out;
}
