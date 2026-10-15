// Canonical BTSR cell2 target, initialized at F0603F69C..0603F6A8.
// The native getter returns an earlier header address; its +8 is already
// accounted for by the file directory target. Do not add it a second time.
// F0604595C..06045B9A expands mode records into two VDP2 line tables.
import {decodeBattleCompressedScreenRecord} from './editor-battle-assets.mjs';

// F06018EEA..06019004 builds this selector-mode table before bank loading.
// Mode is the native one-based plane identity, not the E_BNK directory bank.
export function readBattleBankPlaneMode(sourceSelector){
  if(!Number.isInteger(sourceSelector)||sourceSelector<0||sourceSelector>65535)
    throw new Error('Battle bank plane: invalid source selector');
  if(sourceSelector===0xffff)return null;
  return [0,1,2,0,3,0,0,0][(sourceSelector>>>12)&7];
}

function commonRecord(bytes,index){
  if(!(bytes instanceof Uint8Array)||bytes.length<28)
    throw new Error('Battle screen: unsupported common directory');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tableEnd=view.getInt32(0);
  if(tableEnd<28||tableEnd%4||tableEnd>1024||tableEnd>bytes.length)
    throw new Error('Battle screen: invalid common directory');
  const starts=Array.from({length:tableEnd/4},(_,i)=>i*4+view.getInt32(i*4));
  if(starts.some(at=>at<tableEnd||at>=bytes.length))throw new Error('Battle screen: invalid common target');
  if(!Number.isInteger(index)||index<0||index>=starts.length)throw new Error('Battle screen: common selection outside directory');
  const recordOffset=starts[index],recordEnd=Math.min(bytes.length,...starts.filter(at=>at>recordOffset));
  return {recordOffset,recordEnd};
}
export function readBattleCommonScreen(bytes,index=6){
  if(index!==6)throw new Error('Battle screen: unsupported common directory');
  // Native getter adds the raw displacement to the file base, then caller
  // adds24. Cell-relative normalization already includes that24 for cell6.
  return decodeBattleCompressedScreenRecord(bytes,commonRecord(bytes,index));
}
// F06040414..060404A0 / Final06045A54..06045AE0 register
// resource15 from BTSR bank cell8 and screen cell9. Their +32/+36
// getter corrections are already included in the canonical cell targets.
export function readBattleCommonBankScreenPair(bytes,resourceIndex=15){
  if(resourceIndex!==15)throw new Error('Battle screen: unsupported common resource');
  const bank=commonRecord(bytes,8),screenSource=commonRecord(bytes,9);
  if(bank.recordEnd!==screenSource.recordOffset)
    throw new Error('Battle screen: common bank/screen pair is not adjacent');
  const screen=decodeBattleCompressedScreenRecord(bytes,screenSource);
  if(screen.formatByte!==0x32)throw new Error('Battle screen: unsupported common pair format');
  return {resourceIndex,bankOffset:bank.recordOffset,bankEnd:bank.recordEnd,
    screenOffset:screenSource.recordOffset,recordEnd:screenSource.recordEnd,screen};
}

// F0603AEC4/0603AF28: format31 descriptors are eight bytes, starting at
// decoded+4. The cell stream target is descriptor.offset + decoded -4.
// Return only the fragment referenced by the scene, never the whole bank.
export function readBattleScreenFragment(screen,index){
  const bytes=screen?.payload;
  if(![0x31,0x32].includes(screen?.formatByte)||!(bytes instanceof Uint8Array)||bytes.length<12
    ||!Number.isInteger(index)||index<0||index>255)
    throw new Error('Battle screen fragment: invalid format or selection');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),at=4+index*8;
  const firstCells=view.getUint32(4)-4;
  if(firstCells<12||firstCells>bytes.length||at+8>firstCells)
    throw new Error('Battle screen fragment: descriptor outside directory');
  const cellOffset=view.getUint32(at)-4,width=bytes[at+6],height=bytes[at+7];
  const cellBytes=screen.formatByte===0x31?2:4;
  if(!width||!height||cellOffset<firstCells||cellOffset+width*height*cellBytes>bytes.length)
    throw new Error('Battle screen fragment: cells outside source');
  const cells=cellBytes===2?Uint16Array.from({length:width*height},(_,i)=>view.getUint16(cellOffset+i*2))
    :Uint32Array.from({length:width*height},(_,i)=>view.getUint32(cellOffset+i*4));
  return {index,width,height,cellOffset,cells};
}

// Selected E_BNK screens can terminate the descriptor directory with a
// four-byte FFFFFFFF marker before the cell stream. It is not a fragment.
export function readBattleScreenFragments(screen){
  const bytes=screen?.payload;
  if(!(bytes instanceof Uint8Array)||bytes.length<12)
    throw new Error('Battle screen fragments: truncated directory');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const firstCells=view.getUint32(4)-4;
  if(firstCells<12||firstCells>bytes.length)
    throw new Error('Battle screen fragments: invalid cell boundary');
  let directoryEnd=firstCells;
  if((directoryEnd-4)%8===4){
    if(view.getUint32(directoryEnd-4)!==0xffffffff)
      throw new Error('Battle screen fragments: invalid directory terminator');
    directoryEnd-=4;
  }
  const count=(directoryEnd-4)/8;
  if(!Number.isInteger(count)||count<1||count>256)
    throw new Error('Battle screen fragments: invalid directory length');
  return Array.from({length:count},(_,index)=>readBattleScreenFragment(screen,index));
}

export function readBattleBackgroundPair(bytes,index){
  if(!(bytes instanceof Uint8Array)||bytes.length<12||!Number.isInteger(index)||index<0)
    throw new Error('Battle background: invalid selection');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tableEnd=v.getUint32(0),cell=index*12;
  if(tableEnd<12||tableEnd%12||tableEnd>2304||tableEnd>bytes.length||cell+12>tableEnd)
    throw new Error('Battle background: selection outside directory');
  const bankOffset=cell+v.getUint32(cell),screenOffset=cell+4+v.getUint32(cell+4),recordEnd=cell+8+v.getUint32(cell+8);
  if(bankOffset<tableEnd||bankOffset+4>=screenOffset||screenOffset+4>=recordEnd||recordEnd>bytes.length
    ||bytes[bankOffset]!==0x62||bytes[bankOffset+1]!==0x6b||bytes[bankOffset+2]!==0x30||bytes[bankOffset+3]!==0x31)
    throw new Error('Battle background: invalid paired bank bounds');
  const screen=decodeBattleCompressedScreenRecord(bytes,{recordOffset:screenOffset,recordEnd});
  if(screen.formatByte!==0x32)throw new Error('Battle background: unsupported screen format');
  const fragments=[readBattleScreenFragment(screen,0),readBattleScreenFragment(screen,1)];
  return {index,bankOffset,bankEnd:screenOffset,screenOffset,recordEnd,screen,fragments};
}

// Main6801: FE selects side0 and FF side1 before direction inversion.
// F0603FBE0..0603FC4E / Final06045220..0604528E.
// Pair identities and mode bytes are native scene inputs, not unit indices.
export function planBattleBackgroundSwitch({selector,sceneFlagsByte,sides,commonData}={}){
  if(![254,255].includes(selector)||!Number.isInteger(sceneFlagsByte)||sceneFlagsByte<0||sceneFlagsByte>255
    ||!Array.isArray(sides)||sides.length!==2)
    throw new Error('Battle background switch: unresolved side selection');
  const direction=(sceneFlagsByte>>>6)&1,side=(selector===254?0:1)^direction;
  const selected=sides[side];
  if(!Number.isInteger(selected?.modeByte)||selected.modeByte<0||selected.modeByte>255
    ||selected.pair?.screen?.formatByte!==50||!Array.isArray(selected.pair.fragments)
    ||selected.pair.fragments.length!==2)
    throw new Error('Battle background switch: selected side is not prepared');
  const layout=readBattleBackgroundLayout(commonData,selected.modeByte),groups=initializeBattleBackgroundGroups(layout);
  if(!groups)throw new Error('Battle background switch: layout is unresolved');
  return {side,modeByte:selected.modeByte,pair:selected.pair,
    paletteStart:side===0?6:22,tileOffset:side===0?0:0x400,groups};
}

// Format31 native screen copies use a64x64 word plane. Mirror the destination
// traversal as well as XORing each tile's flip bits; retain16-bit addition.
export function applyBattleScreenFragment(fragment,destination,{x,y,tileOffset,flags}={}){
  if(!(destination instanceof Uint16Array)||destination.length!==4096
    ||!Number.isInteger(fragment?.width)||fragment.width<1||fragment.width>64
    ||!Number.isInteger(fragment?.height)||fragment.height<1||fragment.height>64
    ||!(fragment.cells instanceof Uint16Array)||fragment.cells.length!==fragment.width*fragment.height
    ||![x,y,flags].every(value=>Number.isInteger(value)&&value>=0&&value<=255)
    ||!Number.isInteger(tileOffset)||tileOffset<0||tileOffset>65535)
    throw new Error('Battle screen copy: unresolved plane or fragment');
  const mode=flags&3,add=tileOffset+((flags&0xf0)<<8),flip=mode<<10;
  // Native mode1's split tail starts at0 rather than63. Its wider wrapped
  // writes may leave the plane; do not silently replace that behavior with
  // mathematically tidy wrapping before it is verified in native execution.
  if(mode===1&&fragment.width>((x+fragment.width-1)&63)+1)
    throw new Error('Battle screen copy: unverified horizontal mirror wrap');
  // Keep the source immutable even if a caller supplies overlapping storage.
  const cells=fragment.cells.buffer===destination.buffer?fragment.cells.slice():fragment.cells;
  for(let row=0;row<fragment.height;row++)for(let column=0;column<fragment.width;column++){
    const targetX=(x+(mode&1?fragment.width-1-column:column))&63;
    const targetY=(y+(mode&2?fragment.height-1-row:row))&63;
    destination[targetY*64+targetX]=((cells[row*fragment.width+column]+add)^flip)&65535;
  }
  return {cellsWritten:cells.length};
}

// sc02 uses32-bit VDP2 pattern names, with flips in bits30/31 rather than
// the sc01 HUD word's bits10/11. Native helper F0603B32A..0603B722.
export function applyBattleBackgroundFragment(fragment,destination,{x,y,tileOffset,flags}={}){
  if(!(destination instanceof Uint32Array)||destination.length!==4096
    ||!Number.isInteger(fragment?.width)||fragment.width<1||fragment.width>64
    ||!Number.isInteger(fragment?.height)||fragment.height<1||fragment.height>64
    ||!(fragment.cells instanceof Uint32Array)||fragment.cells.length!==fragment.width*fragment.height
    ||![x,y,flags].every(value=>Number.isInteger(value)&&value>=0&&value<=255)
    ||!Number.isInteger(tileOffset)||tileOffset<0||tileOffset>65535)
    throw new Error('Battle background copy: unresolved plane or fragment');
  const mode=flags&3,add=tileOffset+((flags&0xf0)<<12),flip=mode<<30;
  const cells=fragment.cells.buffer===destination.buffer?fragment.cells.slice():fragment.cells;
  for(let row=0;row<fragment.height;row++)for(let column=0;column<fragment.width;column++){
    const targetX=(x+(mode&1?fragment.width-1-column:column))&63;
    const targetY=(y+(mode&2?fragment.height-1-row:row))&63;
    // F0603B3DC..3E6 / Final060407D8..7E2: XOR first, then ADD.
    // Addition can carry into a flip bit (including the owned FFFFFFFF
    // cell value), so these operations cannot be interchanged.
    destination[targetY*64+targetX]=((cells[row*fragment.width+column]^flip)+add)>>>0;
  }
  return {cellsWritten:cells.length};
}
export function readBattleBackgroundLayout(bytes,mode){
  if(!(bytes instanceof Uint8Array)||!Number.isInteger(mode)||mode<0||mode>255||bytes.length<12)return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tableEnd=v.getInt32(0);
  if(tableEnd<12||tableEnd%4||tableEnd>1024||tableEnd>bytes.length)return null;
  const starts=Array.from({length:tableEnd/4},(_,i)=>i*4+v.getInt32(i*4));
  if(starts.some(p=>p<tableEnd||p>=bytes.length))return null;
  const start=starts[2],end=Math.min(bytes.length,...starts.filter(p=>p>start)),base=start;
  const cell=base+mode*2;
  if(cell+2>end)return null;
  const at=base+((mode*2+v.getUint16(cell))&65535);
  if(at<base||at+4>end)return null;
  const counts=[...bytes.subarray(at,at+4)],groups=[];let cursor=at+4;
  for(const count of counts.slice(0,2)){
    if(cursor+count*4>end)return null;
    const entries=Array.from({length:count},(_,i)=>({factor:v.getUint16(cursor+i*4),control:v.getUint16(cursor+i*4+2)}));
    groups.push({count,entries});cursor+=count*4;
  }
  return {mode,counts,groups};
}

export function initializeBattleBackgroundGroups(layout){
  if(!Array.isArray(layout?.groups)||layout.groups.length!==2)return null;
  const groups=[];
  for(const group of layout.groups){
    // For larger native counts the end row retains prior state. Do not invent it.
    if(!Number.isInteger(group.count)||group.count<0||group.count>63
      ||!Array.isArray(group.entries)||group.entries.length!==group.count
      ||group.entries.some(e=>![e?.factor,e?.control].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)))return null;
    const records=Array.from({length:group.count*2},(_,i)=>({...group.entries[i%group.count],offset:0,secondaryOffset:0}));
    records.push({factor:0,control:0x0200,offset:0,secondaryOffset:0});
    groups.push({count:group.count,records});
  }
  return groups;
}
