import {decodeBattleMessageGlyph} from './editor-battle-message-glyph.mjs';
import {prepareBattleWebPicture,validateBattleWebPicture,battleWebPictureBytes} from './editor-battle-web-picture.mjs';

const EVENT='battle-web-dialogue-event-v1',TIMELINE='battle-web-dialogue-timeline-v1';
const tracks=new WeakMap(),pictureFields=['format','width','height','slotStride','colorSlots','colors','pixels'];
const fail=message=>{throw new Error(`Battle web dialogue: ${message}`);};
const exactKeys=(value,allowed)=>{
 if(!value||typeof value!=='object'||Array.isArray(value))fail('object required');
 for(const key of Reflect.ownKeys(value))if(typeof key!=='string'||!allowed.includes(key))fail('unexpected field');
};
const bytes=value=>value instanceof Uint8Array||value instanceof Uint8ClampedArray;
function metadata(input,{timing=true}={}){
 if(timing&&(!Number.isSafeInteger(input.fromUs)||input.fromUs<0||!Number.isSafeInteger(input.toUs)||input.toUs<=input.fromUs))fail('unresolved interval or speaker');
 if(typeof input.phase!=='string'||input.phase.length<1||input.phase.length>64
  ||!Number.isInteger(input.speakerId)||input.speakerId<0||input.speakerId>65535
  ||typeof input.speakerName!=='string'||input.speakerName.length>256)fail('unresolved interval or speaker');
 if(input.portraitId!==null&&!(Number.isInteger(input.portraitId)&&input.portraitId>=0&&input.portraitId<=65535)
  &&!(typeof input.portraitId==='string'&&input.portraitId.length>0&&input.portraitId.length<=128))fail('unresolved portrait identity');
 if(input.accessibleText!==undefined&&(typeof input.accessibleText!=='string'||input.accessibleText.length>4096))fail('invalid accessible text');
 return {...(timing?{fromUs:input.fromUs,toUs:input.toUs}:{}),phase:input.phase,speakerId:input.speakerId,speakerName:input.speakerName,
  portraitId:input.portraitId,...(input.accessibleText===undefined?{}:{accessibleText:input.accessibleText})};
}
function layout(input){
 exactKeys(input,['x','y','width','height']);
 if(!['x','y','width','height'].every(key=>Number.isInteger(input[key]))||input.x<0||input.y<0
  ||input.width<1||input.height<1||input.x+input.width>320||input.y+input.height>224)fail('invalid overlay rectangle');
 return {...input};
}
function snapshotPicture(input){
 let prepared;
 if(input?.format?.startsWith('battle-web-')){validateBattleWebPicture(input);prepared=input;}
 else prepared=prepareBattleWebPicture({width:input?.width,height:input?.height,pixels:input?.pixels});
 // Disc offsets and native texture fields belong to a private compile audit.
 // Only the bounded web picture is transferred to the overlay player.
 return Object.fromEntries(pictureFields.filter(key=>prepared[key]!==undefined).map(key=>[key,
  bytes(prepared[key])?new Uint8Array(prepared[key]):prepared[key]]));
}
function validatePlacement(value){
 exactKeys(value,['picture','x','y','width','height']);layout({x:value.x,y:value.y,width:value.width,height:value.height});
 validateBattleWebPicture(value.picture);
 return value;
}
function snapshotPlacement(value,pictures){
 validatePlacement(value);
 let picture=pictures.get(value.picture);
 if(!picture){picture=snapshotPicture(value.picture);pictures.set(value.picture,picture);}
 return {picture,x:value.x,y:value.y,width:value.width,height:value.height};
}
function validateMessageContents(event){
 metadata(event,{timing:false});validatePlacement(event.text);
 if(event.text.x!==56||event.text.y!==160||event.text.width!==264||event.text.height!==48
  ||event.text.picture.width!==264||event.text.picture.height!==48)fail('unsupported source text rectangle');
 if(event.portraitId===null){if(event.portrait!==null)fail('portrait identity mismatch');}
 else validatePlacement(event.portrait);
 return true;
}
export function validateBattleWebDialogueMessage(message){
 exactKeys(message,['phase','speakerId','speakerName','portraitId','accessibleText','text','portrait']);
 return validateMessageContents(message);
}
export function validateBattleWebDialogueEvent(event){
 exactKeys(event,['format','fromUs','toUs','phase','speakerId','speakerName','portraitId','accessibleText','text','portrait']);
 if(event.format!==EVENT)fail('unknown event format');metadata(event);return validateMessageContents(event);
}

// Program28 initializes wide text at column7/row20 with color10(hex):
// FD0000 F70000 F10000 F70040 FC0714 F800 FE00 FF, in both owned games.
// The source rectangle is33x6 eight-pixel cells. A16-pixel glyph advances
// twelve pixels through the half-column flag; F6 moves by sixteen pixels.
// F06014BEC/06015284 and the existing glyph/control parsers prove these
// layout operations. These are page coordinates, never execution addresses.
export function createBattleWebDialogueCompiler({font,palette,textLayout}={}){
 if(!(font instanceof Uint8Array)||!font.length||font.length%32||font.length>1024*1024
  ||!(palette instanceof Uint8Array)||palette.length!==64)fail('unresolved owned font or explicit web palette');
 const rectangle=layout(textLayout);
 if(rectangle.x!==56||rectangle.y!==160||rectangle.width!==264||rectangle.height!==48)fail('unsupported source text rectangle');
 const glyphSource=font.slice(),colors=palette.slice(),glyphs=new Map();
 const prepareMessage=input=>{
  exactKeys(input,['phase','speakerId','speakerName','portraitId','accessibleText','payload','portraitPicture','portraitLayout']);
  const info=metadata(input,{timing:false}),payload=input.payload;
  if(!(payload instanceof Uint8Array)||!payload.length||payload.length>256)fail('unresolved bounded encoded payload');
  let portrait=null;
  if(info.portraitId!==null){
   if(!input.portraitPicture||!input.portraitLayout)return {status:'blocked',reason:'dialogue-portrait-source-unresolved'};
   portrait={...layout(input.portraitLayout),picture:snapshotPicture(input.portraitPicture)};
  }else if(input.portraitPicture!=null||input.portraitLayout!=null)fail('portrait identity mismatch');
  const indices=new Uint8Array(rectangle.width*rectangle.height);
  let column=7,row=20,wide=true,half=false,color=16,credit=0,remaining=0,lineStart=7;
  const advance=()=>{
   column=(column+1)&255;
   if(credit){remaining=Math.max(0,remaining-1);if(!remaining){column=lineStart;remaining=credit;row=(row+1)&255;if(wide)row=(row+1)&255;}}
   else if(column>39)column=0;
   row=Math.min(row,27);
  };
  for(let pc=0;pc<payload.length;){
   const first=payload[pc],isGlyph=wide?first<=245:first<=239;
   if(isGlyph){
    if(!wide)return {status:'blocked',reason:'dialogue-narrow-glyph-unresolved',byteOffset:pc,opcode:first};
    const count=first>=235?2:1;
    if(pc+count>payload.length)return {status:'blocked',reason:'dialogue-glyph-truncated',byteOffset:pc,opcode:first};
    const glyph=count===2?((first-235)<<8)|payload[pc+1]:first,key=`${glyph}:${color}`;
    let image=glyphs.get(key);
    if(!image){
     try{image=decodeBattleMessageGlyph(glyphSource,glyph,color);}catch{return {status:'blocked',reason:'dialogue-glyph-source-unresolved',byteOffset:pc,glyph};}
     glyphs.set(key,image);
    }
    if(column>=7&&column<40&&row>=20&&row<26){
     const start=(row-20)*8*rectangle.width+(column-7)*8+(half?4:0);
     // The native glyph writes replace zero pixels too. Retain its packed
     // row spill into the following scanline, then crop only the published
     // page extent. Transparent per-glyph quads would lose that erasure.
     for(let y=0;y<16;y++)for(let x=0;x<image.width;x++){
      const at=start+y*rectangle.width+x;if(at<indices.length)indices[at]=image.colorIndices[y*image.width+x];
     }
    }
    if(image.width===16){if(half)advance();half=!half;}advance();pc+=count;continue;
   }
   if(first===255){
    if(pc!==payload.length-1)return {status:'blocked',reason:'dialogue-payload-tail',byteOffset:pc,opcode:first};
    const pixels=new Uint8Array(indices.length*4);
    for(let i=0;i<indices.length;i++)pixels.set(colors.subarray(indices[i]*4,indices[i]*4+4),i*4);
    const message={...info,text:{...rectangle,picture:prepareBattleWebPicture({width:rectangle.width,height:rectangle.height,pixels})},portrait};
    validateBattleWebDialogueMessage(message);return {status:'ready',message};
   }
   if(![0xf1,0xf6,0xf7,0xfc,0xfd].includes(first))return {status:'blocked',reason:'dialogue-control-unresolved',byteOffset:pc,opcode:first};
   const count=first===0xf6?1:3;
   if(pc+count>payload.length)return {status:'blocked',reason:'dialogue-control-truncated',byteOffset:pc,opcode:first};
   const a=payload[pc+1],b=payload[pc+2];
   if(first===0xf6){column=lineStart;remaining=credit;row=(row+1)&255;if(wide){row=(row+1)&255;half=false;}row=Math.min(row,27);}
   else if(first===0xf7){
    const value=a*256+b;if(value===65535)color=16;wide=Boolean(value&64);credit=value&63;
    if(credit){credit=Math.min(credit,40-column);lineStart=column;}remaining=credit;
   }else if(first===0xfc){
    const signed=n=>n&128?n-256:n;column=Math.min((column+signed(a))&255,39);row=Math.min((row+signed(b))&255,27);lineStart=column;
   }else if(first===0xfd){
    if(a===255||b===255)return {status:'blocked',reason:'dialogue-queue-position-unresolved',byteOffset:pc,opcode:first};
    if(b&32)return {status:'blocked',reason:'dialogue-display-selection-unresolved',byteOffset:pc,opcode:first};
    column=Math.min(a,39);row=Math.min(b&31,27);lineStart=column;
   }
   // F1 changes source control fields56/57; it has no page-layout or timing
   // effect here. In wide mode it is already classified as a glyph lead.
   pc+=count;
  }
  return {status:'blocked',reason:'dialogue-payload-unterminated',byteOffset:payload.length};
 };
 const compile=input=>{
  exactKeys(input,['fromUs','toUs','phase','speakerId','speakerName','portraitId','accessibleText','payload','portraitPicture','portraitLayout']);
  metadata(input);
  const {fromUs,toUs,...messageInput}=input,result=prepareMessage(messageInput);
  if(result.status!=='ready')return result;
  const event={format:EVENT,fromUs,toUs,...result.message};validateBattleWebDialogueEvent(event);return {status:'ready',event};
 };
 compile.prepareMessage=prepareMessage;return compile;
}
export function compileBattleWebDialogueEvent(input,context){return createBattleWebDialogueCompiler(context)(input);}
export function prepareBattleWebDialogueMessage(input,context){return createBattleWebDialogueCompiler(context).prepareMessage(input);}

export function importBattleWebDialogueTimeline(wire){
 exactKeys(wire,['format','durationUs','events']);
 if(wire.format!==TIMELINE||!Number.isSafeInteger(wire.durationUs)||wire.durationUs<1
  ||!Array.isArray(wire.events)||wire.events.length>4096)fail('invalid timeline');
 const pictures=new Map(),events=wire.events.map(event=>{
  validateBattleWebDialogueEvent(event);
  return {...metadata(event),format:EVENT,text:snapshotPlacement(event.text,pictures),
   portrait:event.portrait===null?null:snapshotPlacement(event.portrait,pictures)};
 }).sort((a,b)=>a.fromUs-b.fromUs);
 let previousEnd=0;
 for(const event of events){if(event.fromUs<previousEnd||event.toUs>wire.durationUs)fail('overlapping or escaping dialogue interval');previousEnd=event.toUs;}
 if([...pictures.values()].reduce((sum,picture)=>sum+battleWebPictureBytes(picture),0)>16*1024*1024)fail('picture budget');
 const timeline=Object.freeze({format:TIMELINE,durationUs:wire.durationUs,eventCount:events.length});
 tracks.set(timeline,{durationUs:wire.durationUs,events});return timeline;
}
export function compileBattleWebDialogueTimeline({events,durationUs}={}){
 return importBattleWebDialogueTimeline({format:TIMELINE,events,durationUs});
}
export function exportBattleWebDialogueTimeline(timeline){
 const data=tracks.get(timeline);if(!data)fail('unavailable timeline');
 return structuredClone({format:TIMELINE,durationUs:data.durationUs,events:data.events});
}
export function readBattleWebDialogueAtUs(timeline,atUs,{loop=true}={}){
 const data=tracks.get(timeline);
 if(!data||!Number.isFinite(atUs)||atUs<0||typeof loop!=='boolean')fail('unavailable seek state');
 if(!loop&&atUs>=data.durationUs)return null;
 const time=loop?atUs%data.durationUs:atUs;let low=0,high=data.events.length;
 while(low<high){const middle=(low+high)>>>1;if(data.events[middle].fromUs<=time)low=middle+1;else high=middle;}
 const event=data.events[low-1];return event&&time<event.toUs?event:null;
}

export function createBattleWebDialogueObjects(event,{windowPicture,windowLayout,presentationOffsetY=0,ownedWindow=false}={}){
 validateBattleWebDialogueEvent(event);
 if(typeof ownedWindow!=='boolean')fail('invalid window presentation');
 if(ownedWindow){
  validateBattleWebPicture(windowPicture);
  if(windowPicture.width!==320||windowPicture.height!==64||presentationOffsetY!==0
   ||windowLayout?.x!==0||windowLayout.y!==160||windowLayout.width!==320||windowLayout.height!==64)
   fail('invalid owned window rectangle');
  const pose=(picture,x,y,width,height)=>({picture,vertices:[x,y,x+width,y,x+width,y+height,x,y+height],
   uvs:[0,0,1,0,1,1,0,1],clip:{minX:0,minY:0,maxX:319,maxY:223},opacity:1,blend:'normal'});
  const objects=[pose(windowPicture,0,160,320,64)];
  if(event.portrait)objects.push(pose(event.portrait.picture,16,172,event.portrait.width,event.portrait.height));
  // The source page's arena crop differs from its centered display anchor.
  // The source display quad includes four overscan columns through324.
  objects.push(pose(event.text.picture,60,168,264,48));return objects;
 }
 if(!Number.isInteger(presentationOffsetY))fail('invalid presentation offset');
 const quad=(placement,{portrait=false}={})=>{
  let displayY=placement.y+presentationOffsetY;
  if(portrait&&presentationOffsetY>0)displayY=Math.min(displayY,224-placement.height);
  const {x,y,width,height}=layout({x:placement.x,y:displayY,width:placement.width,height:placement.height});
  return {picture:placement.picture,
   vertices:[x,y,x+width,y,x+width,y+height,x,y+height],
   uvs:[0,0,1,0,1,1,0,1],clip:null,opacity:1,blend:'normal'};
 };
 const objects=[];
 if(windowPicture!==undefined){
  validateBattleWebPicture(windowPicture);objects.push(quad({...layout(windowLayout),picture:windowPicture}));
 }else if(windowLayout!==undefined)fail('window picture required');
 if(event.portrait)objects.push(quad(event.portrait,{portrait:true}));objects.push(quad(event.text));return objects;
}
