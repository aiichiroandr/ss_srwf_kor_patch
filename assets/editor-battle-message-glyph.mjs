// Native glyph source: TSR root0x24 (decimal36),32 bytes per normalized slot.
// F060A7D12..060A7E20 expands each pair of source bits into two4bpp pixels.
// The pairs are separate monochrome pixels, not a2bpp sample stretched twice.
// Normalized glyph values above100(hex) draw16 columns; the others draw8.
// This differs from the dispatcher's EA/F5 encoded-byte classification.
// The display's color byte supplies background in its low nibble, foreground
// in its high nibble. No browser font, Unicode map or guessed CRAM is used.
export function decodeBattleMessageGlyph(font,glyph,color){
  if(!(font instanceof Uint8Array)||font.length===0||font.length%32
    ||font.length>1024*1024||!Number.isInteger(glyph)||glyph<0||glyph>=font.length/32
    ||!Number.isInteger(color)||color<0||color>255)
    throw new Error('Battle message glyph: missing bounded slot or native color');
  const width=glyph>256?16:8,height=16,indices=new Uint8Array(width*height);
  const background=color&15,foreground=color>>>4,start=glyph*32;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    indices[y*width+x]=(font[start+y*2+(x>>>3)]&(128>>>(x&7)))?foreground:background;
  return {glyph,width,height,colorIndices:indices,sourceOffset:start,sourceLength:32};
}

// F06014BEC column/credit update. Byte stores wrap before the native clamps.
function advanceBattleMessageColumn(fields){
  fields[58]=(fields[58]+1)&255;
  if(fields[61]){
    fields[62]=Math.max(0,fields[62]-1);
    if(fields[62]===0){
      fields[58]=fields[63];fields[62]=fields[61];fields[59]=(fields[59]+1)&255;
      if(fields[32]&16)fields[59]=(fields[59]+1)&255;
    }
  }else if(fields[58]>39)fields[58]=0;
  fields[59]=Math.min(fields[59],27);
}

// The active display record provides65/66/67/68: columns, rows, left, top.
// The shared native4bpp arena is8C00 bytes. Start-position culling does not
// imply per-pixel clipping: retain actual row writes, including backing bytes
// beyond the visible rectangle, and reject only an arena escape before writes.
export function writeBattleMessageGlyph(fields,glyph,{font,displayRecords,buffer}={}){
  if(!(fields instanceof Uint8Array)||fields.length!==64
    ||!(buffer instanceof Uint8Array)||buffer.length!==0x8c00||!Array.isArray(displayRecords))
    throw new Error('Battle message glyph: missing retained display arena');
  const record=displayRecords[(fields[32]>>>3)&1];
  if(!record||!['columns','rows','left','top'].every(key=>Number.isInteger(record[key]))
    ||record.columns<1||record.columns>40||record.rows<1||record.rows>28
    ||record.left<0||record.top<0||record.left+record.columns>40||record.top+record.rows>28)
    throw new Error('Battle message glyph: unresolved display rectangle');
  const image=decodeBattleMessageGlyph(font,glyph,fields[60]);
  const column=fields[58],row=fields[59],visible=column>=record.left&&column<record.left+record.columns
    &&row>=record.top&&row<record.top+record.rows;
  const stride=record.columns*4,start=(row-record.top)*record.columns*32
    +(column-record.left)*4+((fields[32]>>>1)&2),rowBytes=image.width/2;
  if(visible&&(start<0||start+15*stride+rowBytes>buffer.length))
    throw new Error('Battle message glyph: write escapes retained arena');
  if(visible)for(let y=0;y<16;y++)for(let x=0;x<image.width;x+=2)
    buffer[start+y*stride+x/2]=(image.colorIndices[y*image.width+x]<<4)|image.colorIndices[y*image.width+x+1];
  if(image.width===16){
    if(fields[32]&4)advanceBattleMessageColumn(fields);
    fields[32]^=4;
  }
  advanceBattleMessageColumn(fields);
  return {visible,glyph,width:image.width,height:16,byteOffset:visible?start:null,stride,rowBytes};
}
