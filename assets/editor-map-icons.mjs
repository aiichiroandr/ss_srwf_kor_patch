// KOM.PAC: four 16-color BE RGB555 palettes, then 512 16x16 4-bpp sprites.
// The same icon ID uses blue/red/yellow/grey palettes for its initial faction.
// Bytes are decoded from the user's own verified disc; no artwork is shipped.
export function readMapIcons(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length!==128+512*128)throw new RangeError('Invalid KOM icon bank');
  return Object.freeze({palette:bytes.slice(0,128),pixels:bytes.slice(128)});
}
const palettes={player:0,enemy:1,other:2,unknown:3};
export function decodeMapIcon(bank,id,faction='unknown') {
  if(!(bank?.palette instanceof Uint8Array)||bank.palette.length!==128
    ||!(bank.pixels instanceof Uint8Array)||bank.pixels.length!==65536
    ||!Number.isInteger(id)||id<0||id>511||!Object.hasOwn(palettes,faction))return null;
  const out=new Uint8ClampedArray(1024),start=id*128,palette=palettes[faction]*32;
  for(let p=0;p<256;p++){
    const byte=bank.pixels[start+(p>>>1)],n=p&1?byte&15:byte>>>4;
    const at=palette+n*2,color=(bank.palette[at]<<8)|bank.palette[at+1],o=p*4;
    out[o]=(color&31)<<3;out[o+1]=((color>>>5)&31)<<3;out[o+2]=((color>>>10)&31)<<3;out[o+3]=n?255:0;
  }
  return out;
}
