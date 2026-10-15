const INDEXED='battle-web-indexed-picture-v1',RGBA='battle-web-rgba-picture-v1';
const COMMON=['format','width','height','assetKey','sourceAssetKey'];
const fail=message=>{throw new Error(`Battle web picture: ${message}`);};
const bytes=value=>value instanceof Uint8Array||value instanceof Uint8ClampedArray;
const dimensions=image=>{
 if(!image||typeof image!=='object'||Array.isArray(image))fail('picture required');
 if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||
  image.width<1||image.width>512||image.height<1||image.height>512)fail('dimensions outside bounds');
 return image.width*image.height;
};
const trace=image=>{
 const output={};
 for(const name of ['assetKey','sourceAssetKey'])if(image[name]!==undefined){
  if(typeof image[name]!=='string'||image[name].length<1||image[name].length>1024)fail('invalid trace key');
  output[name]=image[name];
 }
 return output;
};
const whitelist=(image,fields)=>{
 const allowed=new Set([...COMMON,...fields]);
 for(const key of Reflect.ownKeys(image))if(typeof key!=='string'||!allowed.has(key))fail('unexpected field');
 for(const name of ['assetKey','sourceAssetKey'])if(Object.hasOwn(image,name)&&image[name]===undefined)fail('invalid trace key');
 trace(image);
};

// This is a web picture's local color table, independent of source palette
// numbers. Published arrays are immutable; callers may share index views.
export function validateBattleWebPicture(image){
 const count=dimensions(image);
 if(image.format===RGBA){
  whitelist(image,['pixels']);
  if(!bytes(image.pixels)||image.pixels.length!==count*4)fail('RGBA region unresolved');
 }else if(image.format===INDEXED){
  whitelist(image,['slotStride','colorSlots','colors']);
  if(image.slotStride!==1&&image.slotStride!==2)fail('slot stride unresolved');
  if(!(image.colorSlots instanceof Uint8Array)||image.colorSlots.length!==count*image.slotStride)fail('index region unresolved');
  if(!(image.colors instanceof Uint8Array)||image.colors.length<4||image.colors.length>4096||image.colors.length%4)fail('color table unresolved');
  const slots=image.colors.length/4;
  if(image.slotStride===1&&slots>256)fail('color table exceeds index stride');
  if(image.colors[0]||image.colors[1]||image.colors[2]||image.colors[3])fail('slot zero must be transparent black');
  for(let at=0;at<image.colorSlots.length;at+=image.slotStride){
   const slot=image.colorSlots[at]+(image.slotStride===2?image.colorSlots[at+1]*256:0);
   if(slot>=slots)fail('index outside color table');
  }
 }else fail('unknown format');
 return true;
}

export function prepareBattleWebPicture(image){
 if(image?.format===INDEXED||image?.format===RGBA){validateBattleWebPicture(image);return image;}
 if(typeof image?.format==='string'&&image.format.startsWith('battle-web-'))fail('unknown format');
 const count=dimensions(image),keys=trace(image);
 if(!bytes(image.pixels)||image.pixels.length!==count*4)fail('RGBA region unresolved');
 const raw=()=>({format:RGBA,width:image.width,height:image.height,pixels:new Uint8Array(image.pixels),...keys});
 const palette=[0,0,0,0],map=new Map([[0,0]]),indices=new Uint16Array(count);
 for(let pixel=0;pixel<count;pixel++){
  const at=pixel*4,key=(image.pixels[at]|image.pixels[at+1]<<8|image.pixels[at+2]<<16|image.pixels[at+3]<<24)>>>0;
  let slot=map.get(key);
  if(slot===undefined){
   slot=palette.length/4;if(slot>=1024)return raw();
   map.set(key,slot);palette.push(image.pixels[at],image.pixels[at+1],image.pixels[at+2],image.pixels[at+3]);
  }
  indices[pixel]=slot;
 }
 const slotStride=palette.length/4<=256?1:2;
 if(count*slotStride+palette.length>=image.pixels.length)return raw();
 const colorSlots=new Uint8Array(count*slotStride);
 for(let pixel=0;pixel<count;pixel++){
  colorSlots[pixel*slotStride]=indices[pixel]&255;
  if(slotStride===2)colorSlots[pixel*2+1]=indices[pixel]>>>8;
 }
 return {format:INDEXED,width:image.width,height:image.height,slotStride,colorSlots,colors:Uint8Array.from(palette),...keys};
}

export function battleWebPictureBytes(image){
 validateBattleWebPicture(image);
 return image.format===INDEXED?image.colorSlots.byteLength+image.colors.byteLength:image.pixels.byteLength;
}

export function expandBattleWebPicture(image){
 validateBattleWebPicture(image);
 if(image.format===RGBA)return {width:image.width,height:image.height,pixels:new Uint8Array(image.pixels)};
 const pixels=new Uint8Array(image.width*image.height*4);
 for(let pixel=0;pixel<image.width*image.height;pixel++){
  const at=pixel*image.slotStride,slot=image.colorSlots[at]+(image.slotStride===2?image.colorSlots[at+1]*256:0);
  pixels.set(image.colors.subarray(slot*4,slot*4+4),pixel*4);
 }
 return {width:image.width,height:image.height,pixels};
}

const equalBytes=(a,b)=>{
 if(a.length!==b.length)return false;
 for(let at=0;at<a.length;at++)if(a[at]!==b[at])return false;
 return true;
};
export function equalBattleWebPictures(a,b){
 validateBattleWebPicture(a);validateBattleWebPicture(b);
 if(a.format!==b.format||a.width!==b.width||a.height!==b.height)return false;
 if(a.format===RGBA)return equalBytes(a.pixels,b.pixels);
 return a.slotStride===b.slotStride&&equalBytes(a.colorSlots,b.colorSlots)&&equalBytes(a.colors,b.colors);
}

// Compare a source RGBA view without constructing another indexed picture.
// A hash may select candidates, but every visible and invisible byte must
// agree before a previously retained picture can be reused.
export function equalBattleWebPictureToRgba(picture,image){
 validateBattleWebPicture(picture);
 const count=dimensions(image);
 if(!bytes(image.pixels)||image.pixels.length!==count*4)fail('RGBA region unresolved');
 if(picture.width!==image.width||picture.height!==image.height)return false;
 if(picture.format===RGBA)return equalBytes(picture.pixels,image.pixels);
 const stride=picture.slotStride,slots=picture.colorSlots,colors=picture.colors,pixels=image.pixels;
 for(let at=0,pixel=0;pixel<pixels.length;pixel+=4,at+=stride){
  const color=(slots[at]+(stride===2?slots[at+1]*256:0))*4;
  if(colors[color]!==pixels[pixel]||colors[color+1]!==pixels[pixel+1]
   ||colors[color+2]!==pixels[pixel+2]||colors[color+3]!==pixels[pixel+3])return false;
 }
 return true;
}
