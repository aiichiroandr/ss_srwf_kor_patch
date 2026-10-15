import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleWebDialogueCompiler,compileBattleWebDialogueEvent,validateBattleWebDialogueEvent,validateBattleWebDialogueMessage,
 compileBattleWebDialogueTimeline,exportBattleWebDialogueTimeline,importBattleWebDialogueTimeline,
 readBattleWebDialogueAtUs,createBattleWebDialogueObjects} from '../assets/editor-battle-web-dialogue.mjs';
import {writeBattleMessageGlyph} from '../assets/editor-battle-message-glyph.mjs';
import {executeBattleMessageControl} from '../assets/editor-battle-message.mjs';
import {expandBattleWebPicture,prepareBattleWebPicture} from '../assets/editor-battle-web-picture.mjs';

function context(){
 const font=new Uint8Array(259*32),palette=new Uint8Array(64);
 palette.set([248,240,232,255],4);
 font.fill(255,257*32,258*32);font[21*32]=128;font[244*32]=128;
 return {font,palette,textLayout:{x:56,y:160,width:264,height:48}};
}
const input=(payload,overrides={})=>({fromUs:100,toUs:200,phase:'attack',speakerId:86,speakerName:'pilot',portraitId:null,
 payload:Uint8Array.from(payload),...overrides});
const pixels=event=>expandBattleWebPicture(event.text.picture).pixels;
function sourcePage(payload,c){
 const fields=new Uint8Array(64),buffer=new Uint8Array(0x8c00);
 fields[32]=48;fields[58]=fields[63]=7;fields[59]=20;fields[60]=16;
 const displayRecords=[{columns:33,rows:6,left:7,top:20}];
 for(let pc=0;pc<payload.length;){
  const first=payload[pc],wide=Boolean(fields[32]&16);
  if(wide?first<=245:first<=239){
   const count=wide&&first>=235?2:1,glyph=count===2?((first-235)<<8)|payload[pc+1]:first;
   writeBattleMessageGlyph(fields,glyph,{font:c.font,displayRecords,buffer});pc+=count;
  }else if(first===255)break;
  else{
   const clock={fields,flags:fields[32],returns:[],source:{bytes:payload,pc:pc+1,lowerBound:0,end:payload.length}};
   assert.equal(executeBattleMessageControl(clock,first).status,'continue');pc=clock.source.pc;
  }
 }
 const result=new Uint8Array(264*48*4);
 for(let i=0;i<264*48;i++){
  const packed=buffer[i>>>1],slot=i&1?packed&15:packed>>>4;
  result.set(c.palette.subarray(slot*4,slot*4+4),i*4);
 }
 return result;
}

test('owned glyph shapes and paragraph controls compose the same published page as the existing source parser',()=>{
 const c=context(),compile=createBattleWebDialogueCompiler(c);
 for(const payload of [
  [21,0xf6,0xec,1,0xec,2,0xff],
  [0xec,1,0xeb,244,0xec,1,0xf6,21,0xff],
  [0xf7,0,65,0xec,1,21,0xf6,0xec,1,0xff],
  [0xfc,1,2,0xec,1,0xfd,39,25,0xec,1,0xff],
  [0xf7,0xff,0xff,0xec,1,0xff],
 ]){
  const encoded=Uint8Array.from(payload),result=compile(input(encoded));
  assert.equal(result.status,'ready');assert.deepEqual(pixels(result.event),sourcePage(encoded,c));
  assert.deepEqual({x:result.event.text.x,y:result.event.text.y,width:result.event.text.width,height:result.event.text.height},c.textLayout);
 }
});
test('overlapping wide glyphs erase preceding zero pixels instead of blending transparent glyph quads',()=>{
 const result=compileBattleWebDialogueEvent(input([0xec,1,0xec,2,0xff]),context()),page=pixels(result.event);
 assert.equal(result.status,'ready');
 for(let x=0;x<12;x++)assert.equal(page[x*4+3],255);
 for(let x=12;x<28;x++)assert.equal(page[x*4+3],0);
});
test('preparing glyphs before scheduler activation needs no invented timestamp or incomplete event',()=>{
 const compile=createBattleWebDialogueCompiler(context()),{fromUs,toUs,...source}=input([21,0xf6,0xec,1,255]);
 const prepared=compile.prepareMessage(source);
 assert.equal(prepared.status,'ready');assert.equal(validateBattleWebDialogueMessage(prepared.message),true);
 assert.equal(Object.hasOwn(prepared.message,'fromUs'),false);assert.equal(Object.hasOwn(prepared.message,'toUs'),false);
 assert.equal(Object.hasOwn(prepared.message,'format'),false);
 const event={format:'battle-web-dialogue-event-v1',fromUs:12345,toUs:23456,...prepared.message};
 assert.equal(validateBattleWebDialogueEvent(event),true);
 assert.throws(()=>compile.prepareMessage({...source,fromUs:1}),/unexpected field/);
});
test('compiler owns its font/style and exports only page/portrait pictures and semantic placements',()=>{
 const c=context(),compile=createBattleWebDialogueCompiler(c);c.font.fill(0);c.palette.fill(0);
 const portraitPicture={width:1,height:1,pixels:Uint8Array.of(10,20,30,255),sourceAddress:123,assetKey:'private-disc-trace'};
 const result=compile(input([0xec,1,0xff],{portraitId:86,portraitPicture,portraitLayout:{x:0,y:160,width:48,height:48},accessibleText:'provided text'}));
 assert.equal(result.status,'ready');assert.deepEqual([...pixels(result.event).slice(0,4)],[248,240,232,255]);
 assert.equal(result.event.accessibleText,'provided text');assert.equal(result.event.speakerId,86);
 portraitPicture.pixels.fill(0);assert.deepEqual([...expandBattleWebPicture(result.event.portrait.picture).pixels],[10,20,30,255]);
 assert.equal(Object.hasOwn(result.event.portrait.picture,'sourceAddress'),false);
 assert.equal(Object.hasOwn(result.event.portrait.picture,'assetKey'),false);assert.equal(Object.hasOwn(result.event,'payload'),false);
 assert.equal(validateBattleWebDialogueEvent(result.event),true);
});
test('unsupported controls, missing glyphs/portraits and truncated source never produce a replacement page',()=>{
 const compile=createBattleWebDialogueCompiler(context());
 for(const [payload,reason]of [
  [[0xfa,0xff],'dialogue-control-unresolved'],[[0xfe,0,0xff],'dialogue-control-unresolved'],
  [[0xfd,255,20,0xff],'dialogue-queue-position-unresolved'],[[0xfd,7,52,0xff],'dialogue-display-selection-unresolved'],
  [[0xfc,1],'dialogue-control-truncated'],[[0xec],'dialogue-glyph-truncated'],
  [[0xec,3,0xff],'dialogue-glyph-source-unresolved'],[[21],'dialogue-payload-unterminated'],
  [[255,21],'dialogue-payload-tail'],[[0xf7,0,0,21,0xff],'dialogue-narrow-glyph-unresolved'],
 ]){
  const result=compile(input(payload));assert.equal(result.status,'blocked');assert.equal(result.reason,reason);assert.equal(Object.hasOwn(result,'event'),false);
 }
 assert.equal(compile(input([255],{portraitId:86})).reason,'dialogue-portrait-source-unresolved');
 assert.throws(()=>compile(input([255],{portraitPicture:{}})),/identity mismatch/);
 assert.throws(()=>compile(input([],{})),/payload/);
 assert.throws(()=>createBattleWebDialogueCompiler({...context(),font:new Uint8Array(33)}),/font/);
 assert.throws(()=>createBattleWebDialogueCompiler({...context(),textLayout:{x:0,y:0,width:264,height:48}}),/source text rectangle/);
});
test('explicit timestamps survive export/import and backwards seeking, gaps and loop boundaries have no stale page',()=>{
 const compile=createBattleWebDialogueCompiler(context()),first=compile(input([21,255])).event;
 const second=compile(input([0xec,1,255],{fromUs:300,toUs:450,phase:'hit',speakerId:22,speakerName:'other'})).event;
 const timeline=compileBattleWebDialogueTimeline({events:[second,first],durationUs:500});
 for(const [time,expected]of [[350,22],[150,86],[50,null],[200,null],[300,22],[450,null],[150,86],[600,86]]){
  assert.equal(readBattleWebDialogueAtUs(timeline,time)?.speakerId??null,expected);
 }
 assert.equal(readBattleWebDialogueAtUs(timeline,600,{loop:false}),null);
 const wire=exportBattleWebDialogueTimeline(timeline),imported=importBattleWebDialogueTimeline(wire);
 const before=pixels(readBattleWebDialogueAtUs(imported,150));wire.events[0].fromUs=400;
 wire.events[0].text.picture.colorSlots?.fill(0);wire.events[0].text.picture.pixels?.fill(0);
 assert.equal(readBattleWebDialogueAtUs(imported,150).fromUs,100);assert.deepEqual(pixels(readBattleWebDialogueAtUs(imported,150)),before);
 assert.deepEqual(exportBattleWebDialogueTimeline(imported).events.map(({fromUs,toUs})=>[fromUs,toUs]),[[100,200],[300,450]]);
 assert.throws(()=>readBattleWebDialogueAtUs(wire,150),/seek state/);
});
test('wire validation rejects native fields, conflicting time intervals and malformed pictures',()=>{
 const event=compileBattleWebDialogueEvent(input([21,255]),context()).event;
 assert.throws(()=>validateBattleWebDialogueEvent({...event,payloadAddress:123}),/unexpected field/);
 assert.throws(()=>validateBattleWebDialogueEvent({...event,text:{...event.text,sourcePc:123}}),/unexpected field/);
 assert.throws(()=>validateBattleWebDialogueEvent({...event,fromUs:200}),/interval/);
 assert.throws(()=>validateBattleWebDialogueEvent({...event,portraitId:1}),/object/);
 assert.throws(()=>compileBattleWebDialogueTimeline({events:[event,{...event,fromUs:150,toUs:250}],durationUs:500}),/overlapping/);
 assert.throws(()=>compileBattleWebDialogueTimeline({events:[event],durationUs:199}),/escaping/);
 const malformed=structuredClone(event);malformed.text.picture.colorSlots=new Uint8Array(1);
 assert.throws(()=>validateBattleWebDialogueEvent(malformed),/region/);
});
test('dialogue overlay produces cached-player compatible quads in window/portrait/text order',()=>{
 const event=compileBattleWebDialogueEvent(input([21,255],{portraitId:86,
  portraitPicture:{width:1,height:1,pixels:Uint8Array.of(10,20,30,255)},portraitLayout:{x:0,y:160,width:48,height:48}}),context()).event;
 const windowPicture=prepareBattleWebPicture({width:1,height:1,pixels:Uint8Array.of(0,0,0,200)});
 const objects=createBattleWebDialogueObjects(event,{windowPicture,windowLayout:{x:0,y:160,width:320,height:48}});
 assert.equal(objects.length,3);assert.equal(objects[0].picture,windowPicture);assert.equal(objects[1].picture,event.portrait.picture);assert.equal(objects[2].picture,event.text.picture);
 assert.deepEqual(objects[2].vertices,[56,160,320,160,320,208,56,208]);
 assert.ok(objects.every(object=>object.opacity===1&&object.blend==='normal'&&object.clip===null));
 assert.throws(()=>createBattleWebDialogueObjects(event,{windowPicture}),/object/);
 assert.equal(createBattleWebDialogueObjects({...event,portraitId:null,portrait:null}).length,1);
});
test('web caption can anchor to the bottom without changing source placements or clipping',()=>{
 const event=compileBattleWebDialogueEvent(input([21,255]),context()).event;
 const before=structuredClone(event),objects=createBattleWebDialogueObjects(event,{presentationOffsetY:16});
 assert.deepEqual(objects[0].vertices,[56,176,320,176,320,224,56,224]);
 assert.deepEqual(event,before);assert.equal(objects[0].picture,event.text.picture);
 assert.throws(()=>createBattleWebDialogueObjects(event,{presentationOffsetY:17}),/rectangle/);
 assert.throws(()=>createBattleWebDialogueObjects(event,{presentationOffsetY:-161}),/rectangle/);
 assert.throws(()=>createBattleWebDialogueObjects(event,{presentationOffsetY:0.5}),/offset/);
 const tall=compileBattleWebDialogueEvent(input([21,255],{portraitId:86,
  portraitPicture:{width:1,height:1,pixels:Uint8Array.of(10,20,30,255)},portraitLayout:{x:8,y:164,width:48,height:48}}),context()).event;
 const aligned=createBattleWebDialogueObjects(tall,{presentationOffsetY:16});
 assert.deepEqual(aligned[0].vertices,[8,176,56,176,56,224,8,224]);
 assert.equal(tall.portrait.y,164);
});
test('owned battle shell uses the source frame and separate face/page display anchors',()=>{
 const event=compileBattleWebDialogueEvent(input([21,255],{portraitId:86,
  portraitPicture:{width:40,height:40,pixels:new Uint8Array(40*40*4)},portraitLayout:{x:16,y:172,width:40,height:40}}),context()).event;
 const windowPicture=prepareBattleWebPicture({width:320,height:64,pixels:new Uint8Array(320*64*4)});
 const objects=createBattleWebDialogueObjects(event,{windowPicture,windowLayout:{x:0,y:160,width:320,height:64},ownedWindow:true});
 assert.deepEqual(objects.map(o=>o.vertices),[[0,160,320,160,320,224,0,224],
  [16,172,56,172,56,212,16,212],[60,168,324,168,324,216,60,216]]);
 assert.equal(objects[0].picture,windowPicture);assert.equal(objects[2].picture,event.text.picture);
 assert.equal(event.text.x,56);assert.equal(event.text.y,160);
 assert.ok(objects.every(o=>o.clip.maxX===319&&o.clip.maxY===223));
 assert.throws(()=>createBattleWebDialogueObjects(event,{windowPicture,windowLayout:{x:0,y:175,width:320,height:49},ownedWindow:true}),/rectangle/);
});
