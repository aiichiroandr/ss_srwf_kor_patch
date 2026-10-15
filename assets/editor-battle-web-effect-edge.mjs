// Reversible web presentation only. Original RGB, palette indices and disc
// data are never changed. Only verified common battle effects are eligible.
// Exterior-connected dark matte is softened; closed internal shading stays.
import {resolveBattleWebWeaponSpriteRole} from './editor-battle-web-sprite-role.mjs?v=20261015-stocknames2';
const bytes=value=>value instanceof Uint8Array||value instanceof Uint8ClampedArray;
const roles=new Set(['explosion','debris','dust','booster','weapon-effect','common-effect','optical-effect']);
const perceptual=p=>['booster','weapon-effect','common-effect','optical-effect'].includes(p?.role);
function eligible(p){
 if(!roles.has(p?.role))return false;
 if(p.carrier==='owned-weapon-sprite')return Number.isInteger(p.group)&&p.group>=0&&p.group<=5
  &&p.role==='optical-effect'&&resolveBattleWebWeaponSpriteRole(p).status==='ready';
 if(p.carrier==='owned-common-sprite'){
  if(p.group===16)return p.sourceTableCell===7&&([42,43].includes(p.subIndex)&&p.role==='booster'
   ||Number.isInteger(p.subIndex)&&p.subIndex>=35&&p.subIndex<=41&&p.role==='common-effect');
  return p.group===19&&[10,16].includes(p.sourceTableCell)&&['explosion','debris'].includes(p.role);
 }
 if(p.carrier==='owned-weapon-animation-bank')return p.planeIndex===2&&p.role==='weapon-effect'
  &&Number.isInteger(p.resourceIndex)&&p.resourceIndex>=0&&p.resourceIndex<=5;
 if(p.carrier!=='owned-common-screen'||p.planeIndex!==2)return false;
 if(p.resourceIndex===15)return p.sourceTableCell===8&&p.mapTableCell===9&&p.role==='dust';
 return p.resourceIndex===14&&p.role==='explosion'&&[[11,12],[14,15],[17,18]]
  .some(([bank,map])=>p.sourceTableCell===bank&&p.mapTableCell===map);
}
function validate(picture){
 if(!Number.isInteger(picture?.width)||!Number.isInteger(picture.height)||picture.width<1||picture.height<1
  ||picture.width>512||picture.height>512||!bytes(picture.pixels)||picture.pixels.length!==picture.width*picture.height*4)
  throw new Error('Web effect edge: bounded RGBA picture required');
}
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const signature=picture=>{
 let hash=2166136261;for(let i=0;i<picture.pixels.length;i+=4)
  hash=Math.imul(hash^(picture.pixels[i]|picture.pixels[i+1]<<8|picture.pixels[i+2]<<16|picture.pixels[i+3]<<24),16777619);
 return `${picture.width}:${picture.height}:${hash>>>0}`;
};
export function prepareBattleWebEffectEdgePicture({picture,provenance,enabled=false}={}){
 if(typeof enabled!=='boolean')throw new Error('Web effect edge: explicit correction choice required');
 const unchanged=reason=>({picture,corrected:false,reason,scope:'source-effect-picture'});
 if(!enabled)return unchanged('correction-disabled');
 if(!eligible(provenance))return unchanged('effect-source-profile-unresolved');
 validate(picture);
 // Colored optical effects can have a high blue/red component while their
 // perceived edge is still dark. This new role-specific web profile changes
 // alpha only; the previously checked destruction/dust profile stays intact.
 const useLuminance=perceptual(provenance),brightness=(r,g,b)=>useLuminance
  ?Math.round((54*r+183*g+19*b)/256):Math.max(r,g,b);
 const {width,height,pixels}=picture,count=width*height,levels=new Set();let peak=0,opaque=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){
  const light=brightness(pixels[i],pixels[i+1],pixels[i+2]);peak=Math.max(peak,light);levels.add(light);opaque++;
 }
 // A dark monochrome particle is not evidence of a separable matte. This
 // enhancement needs a tonal ramp, never an arbitrary global black key.
 if(!opaque||peak<48||levels.size<2)return unchanged('matte-ramp-unconfirmed');
 const soft=Math.min(96,Math.floor(peak*.75)),floor=Math.min(32,Math.floor(soft/3));
 const exterior=new Uint8Array(count),queue=new Uint32Array(count);let head=0,tail=0;
 const visit=index=>{
  if(exterior[index])return;
  const at=index*4;
  if(pixels[at+3]&&brightness(pixels[at],pixels[at+1],pixels[at+2])>=soft)return;
  exterior[index]=1;queue[tail++]=index;
 };
 // The cropped picture's outside is transparent. Flood through transparent
 // pixels and dark matte only; bright ink seals interior dark details off.
 for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
 for(let y=1;y+1<height;y++){visit(y*width);visit(y*width+width-1);}
 while(head<tail){const index=queue[head++],x=index%width;
  if(x)visit(index-1);if(x+1<width)visit(index+1);if(index>=width)visit(index-width);if(index+width<count)visit(index+width);
 }
 // Dark smoke can connect to the outside through a curved channel. Preserve
 // shading bounded by visible ink in both axes even when that channel lets
 // the exterior flood reach it. Four linear bounds keep preparation O(area).
 const left=new Int16Array(height).fill(width),right=new Int16Array(height).fill(-1);
 const top=new Int16Array(width).fill(height),bottom=new Int16Array(width).fill(-1);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=(y*width+x)*4;
  if(pixels[at+3]&&brightness(pixels[at],pixels[at+1],pixels[at+2])>floor){
   left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);
   top[x]=Math.min(top[x],y);bottom[x]=Math.max(bottom[x],y);
  }
 }
 let output=null,removedPixels=0,featheredPixels=0,protectedDarkPixels=0;
 for(let index=0;index<count;index++){
  const at=index*4,alpha=pixels[at+3],light=brightness(pixels[at],pixels[at+1],pixels[at+2]);
  if(!alpha)continue;
  const x=index%width,y=Math.floor(index/width),interior=x>left[y]&&x<right[y]&&y>top[x]&&y<bottom[x];
  if(!exterior[index]||interior){if(light<soft)protectedDarkPixels++;continue;}
  const t=Math.max(0,Math.min(1,(light-floor)/(soft-floor))),weight=t*t*(3-2*t),next=Math.round(alpha*weight);
  if(next===alpha)continue;
  output??=pixels.slice();output[at+3]=next;
  if(next===0)removedPixels++;else featheredPixels++;
 }
 if(!output)return unchanged('exterior-dark-matte-unconfirmed');
 return {picture:{width,height,pixels:output},corrected:true,scope:'web-effect-exterior-matte-alpha',
  evidence:{brightness:useLuminance?'perceptual-luminance':'maximum-channel',peak,blackFloor:floor,
   featherLimit:soft,removedPixels,featheredPixels,protectedDarkPixels}};
}

// Per-action bounded cache. Hashes only select candidates: byte comparison
// verifies identity and catches raw-input/output mutation or detached views.
// Only preparation owns the shared RGBA results; playback uses compact art.
export function createBattleWebEffectEdgePreparer({maxEntries=48,maxBytes=8*1024*1024}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256||!Number.isSafeInteger(maxBytes)
  ||maxBytes<1||maxBytes>32*1024*1024)throw new Error('Web effect edge: invalid cache bounds');
 const cache=[],snapshots=new WeakMap();let currentBytes=0,computations=0,hits=0,correctedPictures=0,removedPixels=0,featheredPixels=0;
 const prepare=input=>{
  if(typeof input?.enabled!=='boolean'||!input.enabled||!eligible(input.provenance))return prepareBattleWebEffectEdgePicture(input);
  validate(input.picture);const key=`${perceptual(input.provenance)?'light':'matte'}:${signature(input.picture)}`,
   index=cache.findIndex(entry=>entry.key===key&&equal(entry.source,input.picture.pixels));
  if(index>=0){const entry=cache[index];
   if(equal(entry.result.picture.pixels,entry.guard)){cache.splice(index,1);cache.push(entry);hits++;return entry.result;}
   currentBytes-=entry.bytes;cache.splice(index,1);
  }
  const result=prepareBattleWebEffectEdgePicture(input);computations++;
  if(!result.corrected)return result;
  correctedPictures++;removedPixels+=result.evidence.removedPixels;featheredPixels+=result.evidence.featheredPixels;
  const size=input.picture.pixels.byteLength+result.picture.pixels.byteLength*2;
  if(size<=maxBytes){
   while(cache.length&&(cache.length>=maxEntries||currentBytes+size>maxBytes)){currentBytes-=cache.shift().bytes;}
   const entry={key,source:input.picture.pixels.slice(),result,guard:result.picture.pixels.slice(),bytes:size};
   cache.push(entry);currentBytes+=size;snapshots.set(result.picture.pixels,{width:result.picture.width,height:result.picture.height});
  }
  return result;
 };
 prepare.ownsSnapshot=picture=>{
  const owned=snapshots.get(picture?.pixels);return Boolean(owned&&picture.width===owned.width&&picture.height===owned.height
   &&picture.pixels.length===picture.width*picture.height*4);
 };
 prepare.stats=()=>({computations,cacheHits:hits,correctedPictures,removedPixels,featheredPixels,cachedPictures:cache.length,cachedBytes:currentBytes});
 return prepare;
}
