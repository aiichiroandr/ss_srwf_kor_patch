// F0603B36C..0603B722 / Final06040768..06040B1E: all four sc02
// copy modes guard zero height and skip both cell loops when width is zero.
// Some selected E_BNK programs address the four-byte directory terminator:
// its width/height are the following owned cell bytes, not another image.
// Accept only that exact terminal location; never invent missing cells.
export function readBattleEmptyScreenFragment(screen,index){
 const bytes=screen?.payload;
 if(screen?.formatByte!==0x32||!(bytes instanceof Uint8Array)||bytes.length<16
  ||!Number.isInteger(index)||index<0||index>255)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const firstCells=view.getUint32(4)-4,at=4+index*8;
 if(firstCells<16||firstCells>bytes.length||at!==firstCells-4||at+8>bytes.length
  ||view.getUint32(at)!==0xffffffff)return null;
 const width=bytes[at+6],height=bytes[at+7];
 if(width&&height)return null;
 return {index,width,height,descriptorOffset:at,empty:true};
}

// A selected original FAC4 can also address owned cell-stream bytes. This
// is not a directory fragment or a transparent image. All four proved sc02
// consumers return before a tile write at height0. Accept only a fully bounded
// zero eight-byte window, with the original instruction matching this copy.
// Image/gallery decoding keeps its existing directory boundary unchanged.
export function readBattleScreenNoWriteOperation(screen,{resourceIndex,fragmentIndex,x,y,flags,sourceCommand}={}){
 const operands=[resourceIndex,fragmentIndex,x,y,flags],bytes=screen?.payload;
 if(operands.some(n=>!Number.isInteger(n)||n<0||n>255)
  ||!(sourceCommand instanceof Uint8Array)||sourceCommand.length!==7
  ||sourceCommand[0]!==0xfa||sourceCommand[1]!==0xc4
  ||operands.some((n,i)=>sourceCommand[i+2]!==n)
  ||screen?.formatByte!==0x32||!(bytes instanceof Uint8Array)||bytes.length<16)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const firstCells=view.getUint32(4)-4,at=4+fragmentIndex*8;
 if(firstCells<16||firstCells>bytes.length||(firstCells-8)%8
  ||view.getUint32(firstCells-4)!==0xffffffff||at<firstCells||at+8>bytes.length)return null;
 if(bytes.subarray(at,at+8).some(n=>n!==0))return null;
 return {kind:'bounded-cell-zero-height-no-write',index:fragmentIndex,
  width:0,height:0,sourceOffset:at,empty:true};
}
