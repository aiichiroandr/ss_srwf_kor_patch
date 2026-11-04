const LIMIT=12000,OBJECTS=512;
export const BATTLE_TRACKS=Object.freeze([
 ['dialogue','대사·문자열','#8fce72'],['portrait','얼굴 ID','#e6a3dc'],['motion','모션·그림 교체','#f4d675'],
 ['damage','피해 · HP 감소','#ff9b86'],['defeat','HP 0 도달','#ff667f'],['hp','HP·EN 상태','#c3d5df'],['background','배경','#9caef9'],
 ['script','연출 원명령','#7ed9e8'],['objects','렌더 슬롯 원자료','#d0b95d'],['pixels','화면 변화 원자료','#8caaa0'],
]);
const technicalTracks=new Set(['script','objects','pixels']);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const validSide=state=>Array.isArray(state)&&state.length===3&&[0,1,2].every(i=>integer(state[i],0,65535));
const sideName=side=>side?'방어':'공격';
const hex=n=>n.toString(16).toUpperCase();
const LABEL_WIDTH=90,BASE_FRAMES=600;
const sideTracks=new Set(['portrait','damage','defeat','hp']);

// Live collection extends the canvas, never the scale of already observed
// frames. Fit is an explicit, frozen choice rather than an animation per tick.
export function battleTimelineScale({start=0,end=0,width=480,zoom=1,fitSpan=null}={}){
 const railWidth=Math.max(100,(Number.isFinite(width)&&width>0?width:480)-LABEL_WIDTH);
 const visible=fitSpan===null?BASE_FRAMES/([1,2,4].includes(zoom)?zoom:1):Math.max(1,fitSpan);
 const pixelsPerFrame=railWidth/visible,elapsed=Math.max(0,end-start);
 const extent=fitSpan===null?Math.max(visible,Math.ceil((elapsed+30)/120)*120):Math.max(visible,elapsed);
 const wanted=visible/5,step=[15,30,60,120,300,600,1200,3000,6000,12000,30000].find(n=>n>=wanted)??30000;
 return {pixelsPerFrame,extent,step,width:LABEL_WIDTH+extent*pixelsPerFrame,x:frame=>Math.max(0,frame-start)*pixelsPerFrame};
}

// Only a sampled state (face ID / selected background) is held until its next
// change. A text request, HP notification or HP-zero observation is a keyframe,
// not evidence of a speech/sound/explosion lasting until the next request.
export function battleTrackSpans(items,end,done=false){
 const spans=new Map(),next=new Map();
 for(let i=items.length-1;i>=0;i--){
  const event=items[i],held=event.track==='portrait'||event.track==='background';
  const key=event.track==='portrait'?event.side:event.track,following=next.get(key);
  const until=held?Math.max(event.start,following===undefined?end:following-1):event.end;
  spans.set(event,{start:event.start,end:until,kind:held?'state':until>event.start?'interval':'keyframe',open:held&&following===undefined&&!done});
  if(held)next.set(key,event.start);
 }
 return spans;
}
export function battleSnapshotRegion(region,width,height){
 if(!integer(width,1,4096)||!integer(height,1,4096))return null;
 const box=region==='dialogue'?[58,172,251,44]:region==='portrait'?[7,172,48,44]:[0,0,320,224];
 const x=Math.floor(box[0]*width/320),y=Math.floor(box[1]*height/224);
 return [x,y,Math.min(width-x,Math.max(1,Math.ceil(box[2]*width/320))),Math.min(height-y,Math.max(1,Math.ceil(box[3]*height/224)))];
}
export function decodeBattleText(bytes,textMap,{pilotMap=null,speaker=false}={}){
 if(!Array.isArray(bytes)||bytes.length<2||bytes.length>512||!Array.from({length:bytes.length},(_,i)=>i).every(i=>integer(bytes[i],0,255)))return null;
 const pieces=[],controls=[],unknown=[];let terminated=false,pilotPrefix=speaker;
 for(let i=0;i<bytes.length;){
  const first=bytes[i++];if(first===255){terminated=i===bytes.length;break;}
  if(first>=0xf6){const code=hex(first);controls.push(code);pieces.push(`⟦${code}⟧`);if(first===0xf6)pilotPrefix=false;continue;}
  let code=first.toString(16).padStart(2,'0').toUpperCase();
  if(first>=0xeb&&first<=0xf5){if(i>=bytes.length)return null;code+=bytes[i++].toString(16).padStart(2,'0').toUpperCase();}
  const glyph=pilotPrefix?(pilotMap?.get(code)??textMap?.get(code)):(textMap?.get(code)??pilotMap?.get(code));if(typeof glyph==='string'&&glyph&&!/[\u0000-\u001f\u007f]/.test(glyph))pieces.push(glyph);else{unknown.push(code);pieces.push(`⟦${code}⟧`);}
 }
 return terminated?{text:pieces.join(''),controls:[...new Set(controls)],unknown:[...new Set(unknown)]}:null;
}
export function createBattleTrace(options={}){
 let start=null,end=0,total=0,truncated=false,lastState=null,lastPixels=null,lastScript=null;
 const events=[],objects=new Map(),motions=new Map(),regions=new Map(),damage=[null,null],textSequences=new Set();let nativeText=false;
 const add=(track,frame,label,detail,extra={})=>{
  // Keep room for HP/EN/face changes when render observations fill the budget.
  if(total>=LIMIT||total>=LIMIT-256&&(technicalTracks.has(track)||track==='motion')){truncated=true;return null;}
  const event={track,start:frame,end:frame,label,detail,...extra};events.push(event);total++;return event;
 };
 return {
  ingest(data){
   if(!data||!integer(data.frame,0,100000)||!integer(data.start,0,data.frame)||!Array.isArray(data.commands)||data.commands.length>512||!Array.isArray(data.objects)||data.objects.length>OBJECTS||!Array.isArray(data.state)||data.state.length!==2||!validSide(data.state[0])||!validSide(data.state[1]))return false;
   if(start===null)start=data.start;if(start!==data.start||data.frame<end)return false;end=data.frame;
   for(const c of data.commands){if(!Array.isArray(c)||c.length!==5||![0,1,2,3,4].every(i=>integer(c[i],0,0xffffffff))||c[0]<start||c[0]>end||c[2]>255)continue;
    if(lastScript)lastScript.end=Math.max(lastScript.start,c[0]-1);
    const command=add('script',c[0],`명령 #${c[2]}`,`D_ANIME PC ${c[1].toString(16).toUpperCase()} · 피연산자 ${c[3]}, ${c[4]} · 의미 미해석`);if(command)lastScript=command;
   }
   const seen=new Set();
   for(const o of data.objects){if(!Array.isArray(o)||o.length!==7||!integer(o[0],0,0x7ffff)||!integer(o[1],0,0x7ffff)||!integer(o[2],0,65535)||!integer(o[3],-32768,32767)||!integer(o[4],-32768,32767)||!integer(o[5],0,65535)||!integer(o[6],0,65535))continue;seen.add(o[0]);
    const id=o[0],previous=objects.get(id),signature=`${o[1]}:${o[2]}:${o[5]}:${o[6]}`;
    const sprite=(o[6]&15)<=2,continuous=previous&&previous.end>=end-2,moved=continuous&&(o[3]!==previous.x||o[4]!==previous.y),swapped=continuous&&(o[1]!==previous.texture||o[2]!==previous.size);
    if(sprite&&previous?.sprite&&continuous&&(moved||swapped)){
     let motion=motions.get(id);
     if(!motion||motion.end<end-2)motion=add('motion',end,`슬롯 ${hex(id)} 모션`,'VDP1 스프라이트 기준점(XA, YA) 제출 원값·그림 주소/크기 변화입니다. 로컬 좌표와 다른 꼭짓점은 미포함이며, 슬롯을 특정 기체나 폭발로 단정하지 않습니다.',{id,first:[previous.x,previous.y],last:[o[3],o[4]],moves:0,swaps:0,region:'full'});
     if(motion){motion.end=end;motion.last=[o[3],o[4]];motion.moves+=moved?1:0;motion.swaps+=swapped?1:0;motion.label=`슬롯 ${hex(id)} · 이동 ${motion.moves} / 그림 ${motion.swaps}`;motions.set(id,motion);}
    }
    if(previous&&previous.signature===signature&&previous.end>=end-2){previous.end=end;previous.last=[o[3],o[4]];previous.moves+=o[3]!==previous.x||o[4]!==previous.y?1:0;previous.x=o[3];previous.y=o[4];}
    else {const item=add('objects',end,`슬롯 ${hex(id)}`,'VDP1 제출 원자료',{id,signature,texture:o[1],size:o[2],sprite,width:((o[2]>>>8)&63)*8,height:o[2]&255,x:o[3],y:o[4],first:[o[3],o[4]],last:[o[3],o[4]],moves:0});if(item)objects.set(id,item);}
   }
   for(const id of objects.keys())if(!seen.has(id)){objects.delete(id);motions.delete(id);}
   for(let side=0;side<2;side++){const state=data.state[side];
    const before=lastState?.[side],name=sideName(side);
    if(!before||state[0]!==before[0])add('portrait',end,`${name} 얼굴 #${state[0]}`,'원본 전투 상태의 얼굴 ID 변경. 감정 이름이나 눈·입 모션으로 추정하지 않습니다.',{side,kind:before?'face-change':'initial-face',face:state[0],region:'portrait'});
    if(!before)add('hp',end,`${name} HP ${state[1]} / EN ${state[2]}`,'수집을 시작한 원본 전투 상태입니다.',{side,kind:'initial-state'});
    else{
     if(state[1]<before[1]){
      let event=damage[side];if(!event||event.end<end-2||event.after!==before[1])event=add('damage',end,'','',{side,kind:'hp-loss',before:before[1],after:state[1],amount:0});
      if(event){event.end=end;event.after=state[1];event.amount=event.before-event.after;event.label=`${name} 피해 ${event.amount} · HP ${event.before} → ${event.after}`;event.detail='원본 전투 상태에서 관측한 HP 감소량입니다. 떠오르는 피해 숫자의 표시 프레임과는 다를 수 있고, 전투 수치는 미리보기 조건을 따릅니다.';damage[side]=event;}
      if(state[1]===0)add('defeat',end,`${name} HP 0 도달`,'직전 관측 HP가 양수이고 현재 HP가 0입니다. 폭발·파괴 그림이 시작한 프레임을 뜻하지 않습니다.',{side,kind:'hp-zero'});
     }else if(state[1]>before[1]){damage[side]=null;add('hp',end,`${name} HP +${state[1]-before[1]} · ${before[1]} → ${state[1]}`,'원본 전투 상태 HP 증가입니다.',{side,kind:'hp-gain'});}
     if(state[2]!==before[2])add('hp',end,`${name} EN ${state[2]<before[2]?'소모':'증가'} ${Math.abs(state[2]-before[2])} · ${before[2]} → ${state[2]}`,'원본 전투 상태 EN 변화입니다.',{side,kind:'en-change',amount:before[2]-state[2]});
    }
   }
   lastState=data.state.map(s=>s.slice());
   if(Array.isArray(data.textRequests)&&data.textRequests.length<=256)for(const request of data.textRequests){
    if(!request||!integer(request.sequence,0,255)||textSequences.has(request.sequence)||!integer(request.frame,start,end)||!integer(request.source,0,0xffffffff)||!integer(request.caller,0,0xffffffff))continue;
    let map,pilotMap;try{map=options.textMap?.();pilotMap=options.pilotTextMap?.();}catch{map=pilotMap=null;}
    // The original battle-message writer prefixes the pilot short name and
    // F6 before the already-resolved body. Final stores those names in the
    // legacy bank; the body uses current glyphs. Do not infer a name prefix
    // merely because another queue caller happens to contain F6.
    const speaker=request.caller===0x060179c0||request.caller===0x0601752c;
    const decoded=decodeBattleText(request.bytes,map,{pilotMap,speaker});if(!decoded)continue;
    textSequences.add(request.sequence);nativeText=true;
    const event=add('dialogue',request.frame,`문자열 요청 · ${[...decoded.text].slice(0,48).join('')}${[...decoded.text].length>48?'…':''}`,`원본 text queue에 전달된 실제 문자열입니다. 요청 시점이며 첫 글자·음성의 시작 프레임은 아닙니다. ${decoded.controls.length?`제어코드 ${decoded.controls.join(', ')}는 ⟦코드⟧로 보존합니다. `:''}${decoded.unknown.length?`현재 문자표 미해독: ${decoded.unknown.join(', ')}. `:''}원문: ${decoded.text} · RAM ${hex(request.source)} / 호출 ${hex(request.caller)}`,{kind:'text-request',sequence:request.sequence,text:decoded.text,controls:decoded.controls,unknown:decoded.unknown,source:request.source,caller:request.caller,region:'dialogue'});
    if(event)event.bytes=request.bytes.slice();
   }
   if(Array.isArray(data.pixels)&&data.pixels.length===3&&[0,1,2].every(i=>integer(data.pixels[i],0,0xffffffff))){
    for(const [i,region,label]of [[0,'dialogue','대사'],[1,'portrait','초상화'],[2,'full','HUD']])if(data.pixels[i]!==lastPixels?.[i]){
     add('pixels',end,`${label} 영역 변화`,'같은 원본 프레임에서 계산한 화면 영역 해시입니다. 특정 대사·표정·명중·파괴로 해석하지 않습니다.',{region});
     if(region==='dialogue'&&!nativeText){
      let event=regions.get(region);if(!event||event.end<end-8)event=add('dialogue',end,'대사 화면 갱신 구간','하단 대사 영역이 바뀐 구간을 8프레임 이내 간격으로 묶었습니다. 선택하면 가장 가까운 화면 표본을 보여줍니다. 본문 문자열·발화 시작은 아직 해독하지 않았습니다.',{region,changes:0});
      if(event){event.end=end;event.changes++;regions.set(region,event);}
     }
    }
    lastPixels=data.pixels.slice();
   }
   return true;
  },
  background(id){if(integer(id,0,255))add('background',start??0,`배경 #${id}`,'이번 재생에서 선택한 원본 배경 ID');},
  snapshot(){if(lastScript)lastScript.end=end;return {start:start??0,end,events,truncated};},
 };
}
export function createBattleTimeline(container,options={}){
 const $=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const head=$('div',null,'battle-timeline-heading'),title=$('strong','전투 타임라인'),badge=$('small','보기 전용'),follow=$('button','재생 위치'),objects=$('button','기술 기록');follow.type=objects.type='button';objects.setAttribute('aria-expanded','false');objects.title='미해석 연출 명령·화면 해시·렌더 슬롯 원자료 펼치기';head.append(title,badge,follow,objects);
 const note=$('p','미리보기 ON → 재생하면 실제 프레임을 수집합니다.','battle-timeline-note'),scroller=$('div',null,'battle-timeline-scroll'),chart=$('div',null,'battle-timeline-chart');scroller.append(chart);scroller.tabIndex=0;scroller.setAttribute('aria-label','전투 타임라인 트랙');
 const footer=$('div',null,'battle-timeline-footer'),cursor=$('input'),position=$('output','0 F'),zoom=$('select'),previous=$('button','‹'),next=$('button','›');cursor.type='range';cursor.min=cursor.max='0';cursor.step='1';cursor.value='0';cursor.setAttribute('aria-label','기록 검토 프레임 · 게임 재생 위치는 바뀌지 않음');previous.type=next.type='button';previous.setAttribute('aria-label','이전 관측 이벤트');next.setAttribute('aria-label','다음 관측 이벤트');
 for(const [value,label]of [[1,'기본'],[2,'2배'],[4,'4배'],['fit','기록 전체']]){const o=$('option',label);o.value=String(value);zoom.append(o);}zoom.setAttribute('aria-label','타임라인 가로 확대');footer.append(position,previous,cursor,next,zoom);
 const inspect=$('div',null,'battle-timeline-inspect'),picture=$('canvas'),detail=$('output','트랙의 구간을 누르면 프레임과 오브젝트 정보를 확인합니다.'),close=$('button','×');close.type='button';close.setAttribute('aria-label','기록 화면 표본 닫기');picture.hidden=true;inspect.hidden=true;picture.setAttribute('aria-label','기록한 전투 화면 표본');inspect.append(picture,detail,close);
 container.append(head,note,scroller,footer,inspect);
 let trace=createBattleTrace(options),selection=null,frame=0,live=true,expanded=false,pending=false,done=false,shots=[],background=null,displayedShot=null,pictureRegion='full',displayedRegion=null,drawnRegion=null,pictureEpoch=0,shotEpoch=0,preparing=false,recorded=false,playbackFrame=0;
 const lanes=new Map(),ticks=new Map();let ruler=null,tickHost=null,rulerCursor=null,currentScale=null,displaySpans=new Map(),fitSpan=null,revealCursor=false,autoScrollLeft=null,observedScrollLeft=0;
 let traceRevision=0,drawnRevision=-1,drawnGeometry='',drawnExpanded=false,firstEvent=Infinity,lastEvent=-Infinity;
 const limitations='◆는 관측 시점, 막대는 관측된 유지·변화 구간입니다. 공격/방어는 각 트랙의 위/아래 줄입니다. 대사 문자열은 원본 text queue 요청 시점이며 첫 글자·음성 시작 프레임과 다를 수 있습니다. 제어코드는 보존 표시합니다. 피해는 원본 HP 차이, HP 0은 상태값이며 폭발 그림의 시작 프레임은 아닙니다. 얼굴 ID를 감정 이름으로 추정하지 않습니다. 모션은 실제 VDP1 좌표·그림 주소 변화이며 특정 기체/폭발 매핑은 미해석입니다.';note.title=limitations;badge.title='◆ 관측 시점 · ━ 관측된 구간 · 위: 공격 / 아래: 방어';
 function clearShots(){shots=[];displayedShot=null;displayedRegion=drawnRegion=null;pictureRegion='full';++pictureEpoch;++shotEpoch;picture.hidden=true;}
 function drawShot(shot){if(displayedShot===shot&&displayedRegion===pictureRegion)return;displayedShot=shot;displayedRegion=pictureRegion;const region=pictureRegion,epoch=++pictureEpoch;createImageBitmap(shot.blob).then(bitmap=>{if(epoch!==pictureEpoch){bitmap.close();return;}const box=battleSnapshotRegion(region,bitmap.width,bitmap.height);if(!box){bitmap.close();return;}const [x,y,width,height]=box;picture.width=width;picture.height=height;picture.getContext('2d').drawImage(bitmap,x,y,width,height,0,0,width,height);bitmap.close();drawnRegion=region;picture.hidden=false;}).catch(()=>{if(epoch===pictureEpoch)picture.hidden=true;});}
 function describe(event,at=event.start){inspect.hidden=false;live=false;frame=at;revealCursor=true;pictureRegion=event.region??'full';inspect.dataset.region=pictureRegion;detail.textContent=event.track==='objects'?`${event.label} · ${event.start-trace.snapshot().start}–${event.end-trace.snapshot().start} F · 텍스처 ${hex(event.texture)} · ${event.width}×${event.height} · 좌표 ${event.first.join(',')} → ${event.last.join(',')} · 위치 변화 ${event.moves}회. 렌더 슬롯이며 기체·폭발의 의미 배정은 미해석.`:event.track==='motion'?`${event.label} · ${event.start-trace.snapshot().start}–${event.end-trace.snapshot().start} F · 좌표 ${event.first.join(',')} → ${event.last.join(',')} · ${event.detail}`:`${event.label} · ${event.start-trace.snapshot().start}–${event.end-trace.snapshot().start} F · ${event.detail}`;const span=displaySpans.get(event);if(span?.kind==='state')detail.textContent+=` · 관측된 상태 유지 ${span.start-trace.snapshot().start}–${span.end-trace.snapshot().start} F${span.open?' (수집 중)':''}.`;paint();}
 function jump(step){const events=trace.snapshot().events.filter(event=>!technicalTracks.has(event.track)&&event.start*(step)>frame*(step)).sort((a,b)=>step*(a.start-b.start));if(events.length)describe(events[0]);}
 function resetChart(){chart.replaceChildren();lanes.clear();ticks.clear();ruler=tickHost=rulerCursor=null;currentScale=null;displaySpans.clear();drawnRevision=-1;drawnGeometry='';firstEvent=Infinity;lastEvent=-Infinity;traceRevision++;fitSpan=null;if(zoom.value==='fit')zoom.value='1';autoScrollLeft=observedScrollLeft=0;scroller.scrollLeft=0;}
 function paint(){
  pending=false;if(container.hidden||preparing)return;const data=trace.snapshot();if(live)frame=recorded?playbackFrame:data.end;
  cursor.min=String(data.start);cursor.max=String(Math.max(data.start,data.end));cursor.value=String(frame);
  position.textContent=`${Math.max(0,frame-data.start)} F`;position.title=`네이티브 VBlank ${frame}`;
  follow.setAttribute('aria-pressed',String(live));container.dataset.follow=String(live);
  const scale=battleTimelineScale({start:data.start,end:data.end,width:scroller.clientWidth,zoom:Number(zoom.value||1),fitSpan});currentScale=scale;
  chart.style.width=`${scale.width}px`;chart.style.setProperty('--timeline-grid-step',`${scale.step*scale.pixelsPerFrame}px`);
  container.dataset.scale=fitSpan===null?'fixed':'fit';container.dataset.pixelsPerFrame=String(scale.pixelsPerFrame);
  if(!ruler){ruler=$('div',null,'battle-timeline-ruler');tickHost=$('div',null,'battle-timeline-ticks');rulerCursor=$('i',null,'battle-timeline-playhead');tickHost.append(rulerCursor);ruler.append($('span','프레임','battle-timeline-label'),tickHost);chart.append(ruler);}
  const viewport=Math.max(100,(scroller.clientWidth||480)-LABEL_WIDTH),left=scroller.scrollLeft||0,at=scale.x(frame);
  if((live||revealCursor)&&(at<left||at>left+viewport-16)){
   scroller.scrollLeft=Math.max(0,at-viewport*.75);autoScrollLeft=scroller.scrollLeft;
  }
  revealCursor=false;observedScrollLeft=scroller.scrollLeft||0;
  const tickFirst=Math.max(0,Math.floor(observedScrollLeft/scale.pixelsPerFrame/scale.step)-1)*scale.step;
  const tickLast=Math.min(scale.extent,Math.ceil((observedScrollLeft+viewport)/scale.pixelsPerFrame/scale.step+1)*scale.step),keepTicks=new Set();
  for(let f=tickFirst;f<=tickLast;f+=scale.step){
   keepTicks.add(f);let tick=ticks.get(f);if(!tick){tick=$('span',`${f} F`);ticks.set(f,tick);tickHost.append(tick);}
   tick.style.left=`${f*scale.pixelsPerFrame}px`;tick.style.transform=f===0?'none':'translateX(-50%)';
  }
  for(const [f,tick]of ticks)if(!keepTicks.has(f)){tick.remove();ticks.delete(f);}
  chart.style.setProperty('--timeline-playhead',`${at}px`);
  const geometry=`${scale.pixelsPerFrame}:${scale.extent}`;
  if(drawnRevision!==traceRevision||drawnGeometry!==geometry||drawnExpanded!==expanded){
  const drawStarted=performance.now();
  const used=new Set(),grouped=new Map(BATTLE_TRACKS.map(([id])=>[id,[]])),slots=new Map();displaySpans=new Map();
  let loss=0,zeros=0,hasPrevious=false,hasNext=false;
  firstEvent=Infinity;lastEvent=-Infinity;
  for(const event of data.events){grouped.get(event.track)?.push(event);if(event.track==='objects'){let list=slots.get(event.id);if(!list)slots.set(event.id,list=[]);list.push(event);}
   if(!technicalTracks.has(event.track)){loss+=event.track==='damage'?event.amount:0;zeros+=event.track==='defeat'?1:0;firstEvent=Math.min(firstEvent,event.start);lastEvent=Math.max(lastEvent,event.start);hasPrevious ||= event.start<frame;hasNext ||= event.start>frame;}}
  function lane(id,label,color,items){
   used.add(id);let view=lanes.get(id);const sided=sideTracks.has(id);
   if(!view){
    const row=$('div',null,'battle-timeline-lane'),rail=$('div',null,'battle-timeline-rail'),selected=$('i',null,'battle-timeline-playhead'),empty=$('small'),caption=$('span',null,'battle-timeline-label');
    caption.append($('span',label));if(sided)caption.append($('small','공격 / 방어','battle-timeline-side-caption'));
    row.dataset.track=id;row.dataset.sides=String(sided);row.append(caption,rail);rail.append(selected,empty);chart.append(row);
    view={row,rail,selected,empty,markers:new Map()};lanes.set(id,view);
   }
   view.row.hidden=false;
   const spans=battleTrackSpans(items,data.end,done),visible=items.slice(-400),retained=new Set(visible);
   for(const [event,marker]of view.markers)if(!retained.has(event)){marker.remove();view.markers.delete(event);}
   for(const event of visible){
    const span=spans.get(event);displaySpans.set(event,span);let marker=view.markers.get(event);
    if(!marker){
     marker=$('button',null,'battle-timeline-event');marker.type='button';marker.style.setProperty('--track-color',color);
     marker.onclick=mouse=>{const current=displaySpans.get(event);let target=event.start;
      if(current?.kind==='state'&&Number.isFinite(mouse?.clientX)&&mouse.detail!==0){const x=mouse.clientX-view.rail.getBoundingClientRect().left;target=Math.max(event.start,Math.min(current.end,Math.round(trace.snapshot().start+x/currentScale.pixelsPerFrame)));}
      describe(event,target);
     };
     view.markers.set(event,marker);view.rail.append(marker);
    }
    const point=span.kind==='keyframe';marker.classList.toggle('is-keyframe',point);marker.classList.toggle('is-span',!point);marker.classList.toggle('is-state',span.kind==='state');
    marker.dataset.side=String(event.side??'');marker.dataset.open=String(span.open);marker.dataset.start=String(event.start);marker.dataset.end=String(span.end);
    marker.style.left=`${Math.max(point?4:0,scale.x(event.start))}px`;marker.style.width=point?'8px':`${Math.max(2,(span.end-span.start+1)*scale.pixelsPerFrame)}px`;
    const caption=span.kind==='state'?(event.track==='portrait'?`${sideName(event.side)} #${event.face}`:event.label):'';
    if(marker.textContent!==caption)marker.textContent=caption;
    const title=`${event.label} · ${event.start-data.start}–${span.end-data.start} F${span.kind==='state'?' · 관측된 상태 유지':point?' · 관측 시점':''}`;
    if(marker.title!==title){marker.title=title;marker.setAttribute('aria-label',title);}
   }
   view.empty.hidden=!!items.length;const text=data.end?'관측 없음':'수집 전';if(view.empty.textContent!==text)view.empty.textContent=text;
  }
  for(const [id,label,color]of BATTLE_TRACKS){if(technicalTracks.has(id)&&!expanded)continue;lane(id,label,color,grouped.get(id));if(id==='objects'&&expanded)for(const [slot,items]of [...slots].slice(0,64))lane(`slot:${slot}`,`↳ ${hex(slot)}`,color,items);}
  for(const [id,view]of lanes)if(!used.has(id))view.row.hidden=true;
  container.dataset.events=String(data.events.length);container.dataset.complete=String(done);
  previous.disabled=!hasPrevious;next.disabled=!hasNext;container.dataset.damage=String(loss);container.dataset.hpZero=String(zeros);
  if(data.end)note.textContent=`${done?'수집 끝':'실제 프레임 수집 중'} · HP 감소 ${loss}${zeros?` · HP 0 ${zeros}회`:''} · 대사·얼굴 구간을 누르면 화면 표본${data.truncated?' · 기록 한도 도달':''}`;
  else if(data.truncated)note.textContent='12,000개 기록 한도에 도달했습니다. 추가 이벤트 수집을 제한합니다.';
  drawnRevision=traceRevision;drawnGeometry=geometry;drawnExpanded=expanded;
  container.dataset.trackPaints=String(Number(container.dataset.trackPaints||0)+1);container.dataset.trackPaintMs=String(Math.round((performance.now()-drawStarted)*100)/100);
  }
  // JPEG decoding/cropping is only useful while inspecting a recorded event.
  if(!inspect.hidden){const shot=shots.reduce((best,s)=>!best||Math.abs(s.frame-frame)<Math.abs(best.frame-frame)?s:best,null);picture.hidden=!shot||drawnRegion!==pictureRegion;if(shot){drawShot(shot);picture.title=`화면 표본 ${shot.frame-data.start} F · 검토 위치와 ${Math.abs(shot.frame-frame)}프레임 차이`;}}
  container.dataset.frame=String(frame);previous.disabled=firstEvent>=frame;next.disabled=lastEvent<=frame;
 }
 function movePlayhead(value){
  playbackFrame=value;if(!live||!currentScale||container.hidden)return;frame=value;
  // Read the scroll box before changing cursor styles/range values. Doing it
  // afterwards forced a layout pass through the completed tracks each frame.
  const viewport=Math.max(100,(scroller.clientWidth||480)-LABEL_WIDTH),left=scroller.scrollLeft;
  const at=currentScale.x(frame);chart.style.setProperty('--timeline-playhead',`${at}px`);
  cursor.value=String(frame);position.textContent=`${Math.max(0,frame-trace.snapshot().start)} F`;container.dataset.frame=String(frame);
  previous.disabled=firstEvent>=frame;next.disabled=lastEvent<=frame;
  if(at<left||at>left+viewport-16){scroller.scrollLeft=Math.max(0,at-viewport*.75);autoScrollLeft=scroller.scrollLeft;}
 }
 const schedule=()=>{if(!preparing&&!container.hidden&&!pending){pending=true;setTimeout(paint,100);}};
 follow.title='고정 배율로 현재 재생 위치를 따라갑니다';follow.onclick=()=>{live=true;revealCursor=true;if(fitSpan!==null){fitSpan=null;zoom.value='1';}schedule();};objects.onclick=()=>{expanded=!expanded;objects.textContent=expanded?'기술 기록 접기':'기술 기록';objects.setAttribute('aria-expanded',String(expanded));schedule();};zoom.onchange=()=>{fitSpan=zoom.value==='fit'?Math.max(1,trace.snapshot().end-trace.snapshot().start):null;if(fitSpan!==null)live=false;revealCursor=true;schedule();};previous.onclick=()=>jump(-1);next.onclick=()=>jump(1);close.onclick=()=>{inspect.hidden=true;cursor.focus({preventScroll:true});};
 cursor.addEventListener('input',()=>{inspect.hidden=false;live=false;revealCursor=true;frame=Number(cursor.value);pictureRegion='full';inspect.dataset.region='full';detail.textContent='기록 검토 위치입니다. 게임 재생 위치는 바뀌지 않습니다.';schedule();});
 scroller.addEventListener('scroll',()=>{const left=scroller.scrollLeft||0;if(Math.abs(left-observedScrollLeft)>.5){if(autoScrollLeft===null||Math.abs(left-autoScrollLeft)>1)live=false;autoScrollLeft=null;observedScrollLeft=left;}schedule();});
 if(typeof ResizeObserver==='function'){let width=0;new ResizeObserver(()=>{if(scroller.clientWidth!==width){width=scroller.clientWidth;autoScrollLeft=scroller.scrollLeft||0;schedule();}}).observe(scroller);}
 return {
  setVisible(visible){container.hidden=!visible;if(visible){if(done&&recorded)paint();else schedule();}},
  select(weapon){if(selection===weapon)return;selection=weapon;trace=createBattleTrace(options);clearShots();resetChart();done=false;preparing=recorded=false;background=null;live=true;frame=0;inspect.hidden=true;picture.hidden=true;detail.textContent=limitations;note.textContent='미리보기는 기본 OFF입니다. ON 후 재생하면 기록이 표시됩니다.';schedule();},
  receive(message){if(message.weapon!==selection)return;
   if(message.kind==='begin'){trace=createBattleTrace(options);clearShots();resetChart();done=false;preparing=recorded=message.precomputed===true;container.dataset.complete='false';container.dataset.preparing=String(preparing);live=true;frame=playbackFrame=0;background=null;inspect.hidden=true;detail.textContent=limitations;note.textContent=preparing?'전체 전투 분석 중 · 트랙 준비 후 재생합니다.':'실제 재생 수집 중';schedule();}
   else if(message.kind==='data'){if(trace.ingest(message.data)){traceRevision++;if(background!==null){trace.background(background);background=null;}schedule();}}
   else if(message.kind==='background')background=message.id;
   else if(message.kind==='cancel'){preparing=false;recorded=false;done=false;trace=createBattleTrace(options);resetChart();container.dataset.preparing='false';container.dataset.complete='false';note.textContent='분석 중단 · 다시 재생하면 전체 트랙을 준비합니다.';}
   else if(message.kind==='position'&&recorded&&integer(message.frame,0,100000))movePlayhead(message.frame);
   else if(message.kind==='shot'&&integer(message.frame,0,100000)&&message.blob instanceof Blob&&message.blob.type==='image/jpeg'&&message.blob.size>0&&message.blob.size<100000){const epoch=shotEpoch;void message.blob.slice(0,3).arrayBuffer().then(buffer=>{const b=new Uint8Array(buffer);if(epoch!==shotEpoch||b[0]!==255||b[1]!==216||b[2]!==255)return;if(shots.length>=96)shots.shift();shots.push({frame:message.frame,blob:message.blob});if(!inspect.hidden)schedule();});}
   else if(message.kind==='shot'&&integer(message.frame,0,100000)&&typeof message.url==='string'&&message.url.startsWith('data:image/jpeg;base64,')&&message.url.length<100000){try{const bytes=Uint8Array.from(atob(message.url.slice(message.url.indexOf(',')+1)),c=>c.charCodeAt(0));if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return;const blob=new Blob([bytes],{type:'image/jpeg'});if(shots.length>=96)shots.shift();shots.push({frame:message.frame,blob});schedule();}catch{return;}}
   else if(message.kind==='end'){done=true;preparing=false;traceRevision++;container.dataset.preparing='false';playbackFrame=Number.isSafeInteger(message.start)?message.start:trace.snapshot().start;frame=playbackFrame;note.textContent='전체 트랙 준비 완료 · 수치는 시연용';paint();}
  },
 };
}
