// Guest-memory limits, not the browser decompressor's larger inspection cap.
// All pointers in a TSR are signed BE32 deltas from their own cell.
// The Final CD loader writes a partial file's leading sector BEFORE 28d800.
// Reserve the entire preceding 2KiB. F's original installer extends beyond
// this boundary; it is preserved byte-for-byte, never available to the editor.
const END=Object.freeze({'srwf-f':0x28f800,'srwf-final':0x28d800});
const LIVE_END=Object.freeze({'srwf-f':0x28d000,'srwf-final':0x28d000});
const BASE=Object.freeze({'srwf-f':0x22b000,'srwf-final':0x21d000});
// F v0.5 installer overwrites these root14/16/24 bytes at boot. Preserve
// the authenticated file values; editing them would be discarded by the game.
const F_INSTALLER_WRITES=Object.freeze([[4702,8],[184956,4],[186733,2],[202573,2],[208325,191],[209194,215],[213980,189]].map(Object.freeze));
function fail(message,details={}){
 const e=new Error(message);e.code='EDITOR_STORAGE_INVALID';e.details=details;throw e;
}
export function tsrRuntimeLimit(gameId){
 if(!Object.hasOwn(BASE,gameId))fail('지원하지 않는 TSR 메모리 프로필입니다.');
 return LIVE_END[gameId]-BASE[gameId];
}
// Only for authenticated historical-format recovery, never an export budget.
export function tsrHistoricalStorageLimit(gameId){
 if(!Object.hasOwn(BASE,gameId))fail('지원하지 않는 TSR 메모리 프로필입니다.');
 return END[gameId]-BASE[gameId];
}
// Old outputs and the editor's logical repacking view may be larger. They can
// be inspected/recovered, but must pass the stricter runtime bound on export.
export function requireTsrInspectionSize(bytes,gameId){
 if(!Object.hasOwn(BASE,gameId))fail('지원하지 않는 TSR 메모리 프로필입니다.');
 const maximum=0x2b1800-BASE[gameId];
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>maximum)
  fail('편집 데이터가 TSR 검사 한도를 넘습니다.',{decodedBytes:bytes?.length??0,maximumBytes:maximum});
 return maximum-bytes.length;
}
export function requireTsrRuntimeSize(bytes,gameId){
 const maximum=tsrRuntimeLimit(gameId);
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>maximum)
  fail('편집 데이터가 게임의 TSR 메모리 한도를 넘습니다. 변경을 줄여 주세요.',{decodedBytes:bytes?.length??0,maximumBytes:maximum});
 return maximum-bytes.length;
}
// baseline is the authenticated session's ORIGINAL decoded prefix, not an
// option supplied by an edit request. Only unchanged F installation data is
// exempt from the persistent-data limit; new tail bytes are never exempt.
export function requireTsrExportSize(bytes,gameId,baseline){
 const maximum=tsrRuntimeLimit(gameId);
 if(gameId!=='srwf-f'||!(baseline instanceof Uint8Array)||baseline.length<=maximum)return requireTsrRuntimeSize(bytes,gameId);
 if(!(bytes instanceof Uint8Array)||baseline.length>tsrHistoricalStorageLimit(gameId)||bytes.length!==baseline.length
  ||baseline.subarray(maximum).some((b,i)=>bytes[maximum+i]!==b))
  fail('F의 CD 작업 영역에는 편집 데이터를 저장할 수 없습니다. 꼬리에 추가된 이름·글자 기록을 줄이고 저장 공간을 다시 확인해 주세요.',{decodedBytes:bytes?.length??0,maximumBytes:maximum,baseBytes:baseline.length,reason:'f-cd-transient-tail'});
 for(const [start,length]of F_INSTALLER_WRITES)if(start+length>baseline.length||baseline.subarray(start,start+length).some((b,i)=>bytes?.[start+i]!==b))
  fail('F 설치기가 다시 쓰는 데이터는 편집할 수 없습니다.',{reason:'f-installer-overwrite',offset:start,length});
 return 0;
}
export function writeRelative32(bytes,cell,target){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(cell)||cell<0||cell+4>bytes.length
  ||!Number.isSafeInteger(target)||target<0||target>=bytes.length
  ||target-cell< -0x80000000||target-cell>0x7fffffff)
  fail('이설 포인터가 데이터 경계를 벗어납니다.');
 new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setInt32(cell,target-cell,false);
}
export function requireFixedTsrRoots(before,after,{movable=[27]}={}){
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)
  fail('이설 후 TSR 루트 표의 개수가 달라졌습니다.');
 const allowed=new Set(movable);
 for(let i=0;i<before.length;i++){
  if(before[i].opaque!==after[i].opaque||!allowed.has(i)&&before[i].start!==after[i].start)
   fail('이설 중 고정된 다른 표의 위치가 바뀌었습니다.',{rootIndex:i});
 }
}
