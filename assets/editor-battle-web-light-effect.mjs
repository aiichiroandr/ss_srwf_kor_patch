import {readBattleWebObjectStyle} from './editor-battle-web-style.mjs';

// A reversible web presentation profile, not a change to source transparency
// or a claim about the original game's color calculation. Classification runs
// during preparation; playback only changes its GPU blend state.
export function resolveBattleWebLightEffectStyle({picture,provenance,sourceStyle,enabled=false}={}){
 if(typeof enabled!=='boolean')throw new Error('Web light effect: explicit correction choice required');
 const style=readBattleWebObjectStyle(sourceStyle);
 const unchanged=reason=>({style,corrected:false,reason,scope:'source-effect-composition'});
 if(!enabled)return unchanged('correction-disabled');
 // The caller derives this flag from the ORIGINAL animation donor, not from
 // a user's edited damage/beam flags or the current weapon's display name.
 const booster=provenance?.carrier==='owned-common-sprite'&&provenance.group===16&&provenance.sourceTableCell===7
  &&[42,43].includes(provenance.subIndex)&&provenance.role==='booster';
 const beam=provenance?.carrier==='owned-weapon-animation-bank'&&provenance.planeIndex===2
  &&provenance.animationBeam===true;
 if(!booster&&!beam)return unchanged('light-source-profile-unresolved');
 if(sourceStyle?.status!=='ready'||style.blend!=='normal'||!booster
  &&(sourceStyle.planeIndex!==2||sourceStyle.scope!=='owned-nbg2-top-ratio-mode'))
  return unchanged('light-composition-profile-unresolved');
 if(!picture||!Number.isInteger(picture.width)||!Number.isInteger(picture.height)
  ||picture.width<1||picture.height<1||picture.width>512||picture.height>512
  ||!(picture.pixels instanceof Uint8Array||picture.pixels instanceof Uint8ClampedArray)
  ||picture.pixels.length!==picture.width*picture.height*4)
  throw new Error('Web light effect: unresolved RGBA picture');
 const {width,height,pixels}=picture,levels=new Set();let peak=0,transparent=0,opaque=0;
 for(let at=0;at<pixels.length;at+=4){
  const alpha=pixels[at+3];
  if(alpha===0){transparent++;continue;}
  if(alpha!==255)return unchanged('already-soft-alpha-picture');
  const light=Math.max(pixels[at],pixels[at+1],pixels[at+2]);
  levels.add(light);peak=Math.max(peak,light);opaque++;
 }
 // Conservative appearance guards: a light core and a multilevel palette
 // ramp surrounding transparent pixels. These guard a web enhancement;
 // they do not infer new source palette meanings or delete dark pixels.
 if(!opaque||!transparent||peak<(booster?48:192)||levels.size<4)return unchanged('light-ramp-unconfirmed');
 let rimPixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=(y*width+x)*4;
  if(pixels[at+3]!==255||Math.max(pixels[at],pixels[at+1],pixels[at+2])>peak*(booster ? .75 : .25))continue;
  if(x>0&&pixels[at-1]===0||x+1<width&&pixels[at+7]===0
   ||y>0&&pixels[at-width*4+3]===0||y+1<height&&pixels[at+width*4+3]===0)rimPixels++;
 }
 if(!rimPixels)return unchanged('dark-light-rim-unconfirmed');
 return {style:{...style,blend:'screen'},corrected:true,scope:booster?'web-common-movement-light-rim-correction':'web-beam-light-rim-correction',
  evidence:{opaquePixels:opaque,transparentPixels:transparent,paletteLevels:levels.size,peak,rimPixels}};
}
