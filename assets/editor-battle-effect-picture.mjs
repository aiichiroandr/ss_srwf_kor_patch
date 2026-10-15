// Retain only the occupied pixels of an effect layer. Its position stays in
// scene coordinates; this never changes the player's fixed viewport size.
function validatePicture({width,height,pixels}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>512||height>512
  ||!(pixels instanceof Uint8Array||pixels instanceof Uint8ClampedArray)||pixels.length!==width*height*4)
  throw new Error('Battle effect picture: invalid layer');
}
function occupiedBounds({width,height,pixels}){
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]){
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(right<0)return null;
 return {left,top,right,bottom};
}
function copyBounds({width,height,pixels},bounds){
 if(!bounds)return null;
 const {left,top,right,bottom}=bounds;
 const croppedWidth=right-left+1,croppedHeight=bottom-top+1;
 if(croppedWidth===width&&croppedHeight===height)return {width,height,pixels,x:0,y:0};
 const cropped=new Uint8ClampedArray(croppedWidth*croppedHeight*4);
 for(let y=0;y<croppedHeight;y++){
  const from=((top+y)*width+left)*4;
  cropped.set(pixels.subarray(from,from+croppedWidth*4),y*croppedWidth*4);
 }
 return {width:croppedWidth,height:croppedHeight,pixels:cropped,x:left,y:top};
}

export function cropBattleEffectPicture(picture={}){
 validatePicture(picture);return copyBounds(picture,occupiedBounds(picture));
}
// Only a plane's owning writer supplies this revision. Palette RGB changes
// never alter occupancy; writes/clears must advance the geometry revision.
// No pixel buffer is retained, so old published frames remain independent.
export function createBattleEffectPictureCropper(){
 let previous=-1,width=0,height=0,bounds=null;
 return (picture,revision)=>{
  validatePicture(picture);
  if(!Number.isSafeInteger(revision)||revision<0)throw new Error('Battle effect picture: invalid geometry revision');
  if(previous!==revision||width!==picture.width||height!==picture.height){
   bounds=occupiedBounds(picture);previous=revision;width=picture.width;height=picture.height;
  }
  return copyBounds(picture,bounds);
 };
}
