// Preparation-side semantic background ownership. The source clear writes
// pattern0; its selected owned tile must be proved transparent before that
// operation can mean an empty web background. Display enable and content
// ownership are independent. No native map storage appears in this state.
export function createBattleBackdropContent({clearTile,initialVisibility}={}){
 if(clearTile?.width!==8||clearTile.height!==8
  ||!(clearTile.pixels instanceof Uint8Array||clearTile.pixels instanceof Uint8ClampedArray)
  ||clearTile.pixels.length!==256||!Array.isArray(initialVisibility)||initialVisibility.length!==2
  ||initialVisibility.some(value=>typeof value!=='boolean'))
  throw new Error('Battle backdrop content: explicit tile and initial visibility required');
 const emptyClear=Array.from({length:64},(_,index)=>clearTile.pixels[index*4+3]).every(alpha=>alpha===0);
 const visibility=initialVisibility.slice(),copies=[false,false];
 const plane=index=>{
  if(!Number.isInteger(index)||index<0||index>1)throw new Error('Battle backdrop content: invalid plane');
  return index;
 };
 const clear=index=>{
  plane(index);
  if(!emptyClear)throw Object.assign(new Error('Battle backdrop content: clear pattern is not empty'),
   {code:'BATTLE_BACKGROUND_CLEAR_UNRESOLVED'});
  visibility[index]=false;copies[index]=false;
 };
 const copied=(index,cellsWritten)=>{
  plane(index);
  if(!Number.isInteger(cellsWritten)||cellsWritten<0||cellsWritten>4096)
   throw new Error('Battle backdrop content: invalid copy extent');
  if(cellsWritten)copies[index]=true;
 };
 const published=()=>{visibility.fill(true);};
 const snapshot=()=>({ownedVisible:visibility.slice(),hasCopies:copies.slice(),emptyClear});
 return {clear,copied,published,snapshot};
}
