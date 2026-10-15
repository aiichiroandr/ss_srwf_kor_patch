// Preparation-only recoloring of an already validated paired background
// fragment. renderBattleBackgroundFragment(...,{indexed:true}) supplies the
// per-pixel 4-bit color and 7-bit cell palette indices. The caller supplies
// the CURRENT published palette and the resolved color-RAM offset explicitly.
// Playback receives only the returned RGBA picture, never the palette state.
const validateImage=image=>{
 if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)
  ||image.width<1||image.width>512||image.height<1||image.height>512
  ||!(image.colorIndices instanceof Uint8Array)||!(image.paletteIndices instanceof Uint8Array)
  ||image.colorIndices.length!==image.width*image.height
  ||image.paletteIndices.length!==image.width*image.height)
  throw new Error('Battle indexed picture: unresolved image or published palette');
 // Validate the whole declared region, including transparent pixels. Do not
 // silently truncate an oversized view or treat a missing tail as blank.
 if(image.colorIndices.some(index=>index>15)||image.paletteIndices.some(index=>index>127))
  throw new Error('Battle indexed picture: color or palette index outside source range');
};
const validatePalette=(paletteWords,paletteOffset)=>{
 if(!(paletteWords instanceof Uint16Array)||paletteWords.length!==1024
  ||!Number.isInteger(paletteOffset)||paletteOffset<0||paletteOffset>1023)
  throw new Error('Battle indexed picture: unresolved image or published palette');
};
export function prepareBattleIndexedPicture({image,paletteWords,paletteOffset}={}){
 validateImage(image);validatePalette(paletteWords,paletteOffset);
 const pixels=new Uint8ClampedArray(image.width*image.height*4);
 for(let i=0;i<image.colorIndices.length;i++){
  const color=image.colorIndices[i];if(color===0)continue;
  const word=paletteWords[(paletteOffset+image.paletteIndices[i]*16+color)&1023],at=i*4;
  pixels[at]=(word&31)<<3;pixels[at+1]=((word>>>5)&31)<<3;
  pixels[at+2]=((word>>>10)&31)<<3;pixels[at+3]=255;
 }
 return {width:image.width,height:image.height,pixels};
}

// Register a preparation-owned immutable background once. Only the RGB words
// actually used by nontransparent pixels can change its web picture. The
// private lookup is never published to the player; output is still plain RGBA.
export function createBattleIndexedPicturePreparer(image){
 validateImage(image);
 const {width,height}=image,tokens=new Uint16Array(width*height),used=new Set();
 for(let at=0;at<tokens.length;at++){
  const color=image.colorIndices[at];
  if(!color){tokens[at]=0xffff;continue;}
  const token=(image.paletteIndices[at]*16+color)&1023;tokens[at]=token;used.add(token);
 }
 const references=Uint16Array.from(used),snapshots=new WeakSet();let previousWords=null,previousPicture=null;
 const prepare=({paletteWords,paletteOffset}={})=>{
  validatePalette(paletteWords,paletteOffset);
  const words=Uint16Array.from(references,token=>paletteWords[(paletteOffset+token)&1023]&0x7fff);
  if(previousPicture?.pixels.length===width*height*4&&previousWords?.length===words.length
   &&words.every((word,index)=>word===previousWords[index]))return previousPicture;
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let pixel=0;pixel<tokens.length;pixel++){
   const token=tokens[pixel];if(token===0xffff)continue;
   const word=paletteWords[(paletteOffset+token)&1023],at=pixel*4;
   pixels[at]=(word&31)<<3;pixels[at+1]=((word>>>5)&31)<<3;
   pixels[at+2]=((word>>>10)&31)<<3;pixels[at+3]=255;
  }
  previousWords=words;previousPicture={width,height,pixels};snapshots.add(pixels);return previousPicture;
 };
 // This factory owns these immutable views. A copied, detached or differently
 // shaped view cannot take the timeline's preparation-only reuse shortcut.
 prepare.ownsSnapshot=picture=>picture?.width===width&&picture?.height===height
  &&picture.pixels?.length===width*height*4&&snapshots.has(picture.pixels);
 return prepare;
}
