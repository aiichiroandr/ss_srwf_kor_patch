// Preparation-only translation of the paired background darken/restore steps.
// F06037184 / Final0603C450 subtract16 from one shared signed word; zero
// initializes that word to-1 and the RGB offset to0. Each invocation yields,
// including the completion invocation. The instruction has no operand.
// F06037104 / Final0603C3D0 restore the same word from-255 in steps of16.
// Battle task initialization explicitly clears it: F060322C4..C6 /
// Final06037534..36. Callers must supply that fresh or retained phase.
// The RGB setter writes offset A, not palette RAM. The target enable changes
// are translated here to web layer roles; offset-bank selection stays external.
const games=new Set(['srwf-f','srwf-final']);
const backgroundLayers=()=>['foreground-background','rear-background'];
const ordinaryLayers=()=>[...backgroundLayers(),'effect','front-overlay','body'];
const signed16=n=>(n<<16)>>16;
const signed9=n=>(n<<23)>>23;
function context({gameId,phase}={}){
 if(!games.has(gameId)||!Number.isInteger(phase)||phase<-32768||phase>32767)
  throw new Error('Battle backdrop fade: unresolved game or phase');
 return phase;
}
function result(phase,offset,complete,enabledLayers){
 return {phase,rgbOffset:[offset,offset,offset],enabledLayers,complete,
  advanceBytes:complete?1:0,yield:true};
}
export function stepBattleBackdropDarkening(input){
 const previous=context(input);
 if(previous===0)return result(-1,0,false,backgroundLayers());
 const phase=signed16(previous-16),complete=phase<=-255;
 return result(complete?0:phase,complete?-255:signed9(phase),complete,null);
}
export function stepBattleBackdropRestoration(input){
 const previous=context(input);
 if(previous===0)return result(-255,-255,false,backgroundLayers());
 const phase=signed16(previous+16),complete=phase>=0;
 return result(complete?0:phase,complete?0:signed9(phase),complete,complete?ordinaryLayers():null);
}

// SEGA VDP2 User's Manual, chapter13.1: add a signed9-bit offset AFTER
// color calculation, and clamp the result to0..255. The affected screen is
// the top image of the composition. A caller must first resolve that top image
// and offset-bank selection. In particular, do not darken an effect on top of
// a background merely because the background below it uses this fade.
// Reference URL is kept in the private source proof, outside runtime assets.
export function prepareBattleOffsetPicture({picture,rgbOffset}={}){
 if(!picture||!Number.isInteger(picture.width)||!Number.isInteger(picture.height)
  ||picture.width<1||picture.width>512||picture.height<1||picture.height>512
  ||!(picture.pixels instanceof Uint8Array||picture.pixels instanceof Uint8ClampedArray)
  ||picture.pixels.length!==picture.width*picture.height*4
  ||!Array.isArray(rgbOffset)||rgbOffset.length!==3
  ||!rgbOffset.every(n=>Number.isInteger(n)&&n>=-256&&n<=255))
  throw new Error('Battle color offset: unresolved picture or RGB offset');
 const pixels=picture.pixels.slice();
 for(let p=0;p<pixels.length;p+=4){
  if(pixels[p+3]===0)continue;
  for(let c=0;c<3;c++)pixels[p+c]=Math.max(0,Math.min(255,pixels[p+c]+rgbOffset[c]));
 }
 return {width:picture.width,height:picture.height,pixels};
}
