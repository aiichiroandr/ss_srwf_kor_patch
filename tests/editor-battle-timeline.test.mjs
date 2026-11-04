import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createBattleTrace,createBattleTimeline,battleSnapshotRegion,decodeBattleText,battleTimelineScale,battleTrackSpans} from '../assets/editor-battle-timeline.mjs';
import {installFakeDom} from './helpers/fake-dom.mjs';

test('OFF retains received trace data without painting, and ON resumes the same trace',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=installFakeDom(),host=d.createElement('section');host.hidden=true;
 const timeline=createBattleTimeline(host);timeline.select(2);timeline.receive({weapon:2,kind:'data',data:packet(100)});t.mock.timers.tick(1000);
 assert.equal(host.dataset.frame,undefined,'hidden trace never paints');
 timeline.setVisible(true);t.mock.timers.tick(100);assert.equal(host.dataset.frame,'100');
 const events=Number(host.dataset.events);timeline.setVisible(false);timeline.receive({weapon:2,kind:'data',data:packet(200)});t.mock.timers.tick(1000);
 assert.equal(host.dataset.frame,'100');assert.equal(host.hidden,true);
 timeline.setVisible(true);t.mock.timers.tick(100);assert.equal(host.dataset.frame,'200');assert.ok(Number(host.dataset.events)>=events);
});
const packet=(frame,extra={})=>({frame,start:64,commands:[],objects:[],state:[[10,3000,80],[31,9000,100]],...extra});
test('live time uses a fixed frame scale: older keys never drift as the recording grows',()=>{
 const a=battleTimelineScale({start:64,end:180,width:490}),b=battleTimelineScale({start:64,end:1700,width:490});
 assert.equal(a.pixelsPerFrame,b.pixelsPerFrame);assert.equal(a.x(120),b.x(120));assert.ok(b.width>a.width);
 assert.ok(a.x(180)>a.x(150));assert.equal(battleTimelineScale({width:490,zoom:2}).pixelsPerFrame,a.pixelsPerFrame*2);
 const fit=battleTimelineScale({start:64,end:1700,width:490,fitSpan:1636});assert.equal(fit.width,490);
 const later=battleTimelineScale({start:64,end:2100,width:490,fitSpan:1636});assert.equal(later.x(120),fit.x(120));
});
test('face states hold only to the next same-side observation; requests and HP zero stay keyframes',()=>{
 const attack={track:'portrait',side:0,start:64,end:64},defend={track:'portrait',side:1,start:64,end:64},change={track:'portrait',side:0,start:90,end:90};
 const spans=battleTrackSpans([attack,defend,change],120);
 assert.deepEqual(spans.get(attack),{start:64,end:89,kind:'state',open:false});
 assert.deepEqual(spans.get(defend),{start:64,end:120,kind:'state',open:true});
 assert.equal(battleTrackSpans([defend],120,true).get(defend).open,false);assert.equal(attack.end,64,'drawing must not rewrite native evidence');
 for(const track of ['dialogue','defeat','hp']){const event={track,start:90,end:90};assert.equal(battleTrackSpans([event],120).get(event).kind,'keyframe');}
 const loss={track:'damage',start:90,end:95};assert.equal(battleTrackSpans([loss],120).get(loss).kind,'interval');
});
test('live DOM keeps keys stationary, advances the cursor and separates attack/defence rows',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=installFakeDom(),host=d.createElement('section'),timeline=createBattleTimeline(host);timeline.select(2);
 const chart=host.querySelector('.battle-timeline-chart');chart.style.setProperty=(key,value)=>chart.style[key]=value;
 timeline.receive({weapon:2,kind:'data',data:packet(100)});t.mock.timers.tick(100);
 const portrait=host.querySelector('.battle-timeline-lane[data-track="portrait"]'),face=portrait.querySelector('.battle-timeline-event'),head=portrait.querySelector('.battle-timeline-playhead');
 const playhead=()=>parseFloat(chart.style['--timeline-playhead']);
 const x=face.style.left,width=parseFloat(face.style.width),cursorX=playhead();
 timeline.receive({weapon:2,kind:'data',data:packet(200)});t.mock.timers.tick(100);
 assert.equal(face.style.left,x);assert.ok(parseFloat(face.style.width)>width);assert.ok(playhead()>cursorX);
 assert.equal(portrait.dataset.sides,'true');assert.deepEqual(portrait.querySelectorAll('.battle-timeline-event').map(e=>e.dataset.side),['0','1']);
 assert.equal(face.classList.contains('is-state'),true);assert.equal(host.querySelector('.battle-timeline-lane[data-track="hp"] .battle-timeline-event').classList.contains('is-keyframe'),true);
 const zoom=host.querySelector('select');zoom.value='fit';zoom.onchange();t.mock.timers.tick(100);const fit=host.dataset.pixelsPerFrame;
 timeline.receive({weapon:2,kind:'data',data:packet(300)});t.mock.timers.tick(100);assert.equal(host.dataset.pixelsPerFrame,fit);assert.equal(host.dataset.frame,'200');
 [...host.querySelectorAll('button')].find(b=>b.textContent==='재생 위치').onclick();t.mock.timers.tick(100);assert.equal(host.dataset.scale,'fixed');assert.equal(host.dataset.frame,'300');
 const beforePause=playhead();t.mock.timers.tick(1000);assert.equal(playhead(),beforePause,'no native packets means no invented cursor motion');
});
test('native text requests decode current glyphs, preserve controls and never consume malformed data',()=>{
 const map=new Map([['11','가'],['EBA0','간'],['EBF6','글'],['EBFF','끝']]);
 assert.equal(decodeBattleText([0xeb,255,255],map)?.text,'끝','FF at the second byte of a glyph is not a terminator');
 assert.deepEqual(decodeBattleText([0x11,0xeb,0xa0,0xf6,0xeb,0xf6,0x12,255],map),{text:'가간⟦F6⟧글⟦12⟧',controls:['F6'],unknown:['12']});
 for(const invalid of [[],[255],[0xeb,255],[0x11],[0x11,255,0x11],Array(3),[0x11,256,255]])assert.equal(decodeBattleText(invalid,map),null);
 const trace=createBattleTrace({textMap:()=>map}),request={sequence:0,frame:64,source:0x2d0000,caller:0x6046c96,bytes:[0x11,0xeb,0xa0,255]};
 trace.ingest(packet(64,{textRequests:[request],pixels:[1,2,3]}));
 trace.ingest(packet(65,{textRequests:[request],pixels:[2,2,3]}));
 assert.equal(trace.snapshot().events.filter(e=>e.track==='dialogue').length,1,'duplicate sequence is ignored and native text replaces guessed pixel bursts');
 const text=trace.snapshot().events.find(e=>e.kind==='text-request');assert.equal(text.text,'가간');assert.equal(text.start,64);assert.match(text.detail,/요청 시점.*첫 글자/);assert.deepEqual(text.bytes,request.bytes);
 map.set('EBA1','힣');trace.ingest(packet(66,{textRequests:[{...request,sequence:1,frame:66,bytes:[0xeb,0xa1,255]}]}));assert.equal(trace.snapshot().events.find(e=>e.sequence===1)?.text,'힣','the latest parent glyph map is used without a captured copy');
 const before=trace.snapshot().events.length;trace.ingest(packet(67,{textRequests:[{...request,sequence:2,frame:68},{...request,sequence:3,bytes:[0xeb,255]}]}));assert.equal(trace.snapshot().events.length,before);
 const next=createBattleTrace({textMap:()=>map});next.ingest(packet(64,{textRequests:[request]}));assert.equal(next.snapshot().events.filter(e=>e.kind==='text-request').length,1,'a new playback accepts sequence zero again');
});
test('only the verified battle-message caller decodes a legacy pilot prefix before F6',()=>{
 const map=new Map([['EBA0','공'],['EBA1','격']]),pilotMap=new Map([['EBA0','시'],['EBA1','북'],['EBF3','！！']]);
 const trace=createBattleTrace({textMap:()=>map,pilotTextMap:()=>pilotMap}),request={sequence:0,frame:64,source:0x2c4a40,caller:0x060179c0,bytes:[0xeb,0xa0,0xeb,0xa1,0xf6,0xeb,0xa0,0xeb,0xa1,0xeb,0xf3,255]};
 trace.ingest(packet(64,{textRequests:[request]}));assert.equal(trace.snapshot().events.find(e=>e.kind==='text-request')?.text,'시북⟦F6⟧공격！！');
 trace.ingest(packet(65,{textRequests:[{...request,sequence:1,frame:65,caller:0x0601752c}]}));assert.equal(trace.snapshot().events.find(e=>e.sequence===1)?.text,'시북⟦F6⟧공격！！');
 trace.ingest(packet(66,{textRequests:[{...request,sequence:2,frame:66,caller:0x06046c96}]}));assert.equal(trace.snapshot().events.find(e=>e.sequence===2)?.text,'공격⟦F6⟧공격！！');
});
test('native frames, command duration and sprite lifetimes remain separate from pixel region observations',()=>{
 const t=createBattleTrace();assert.equal(t.ingest(packet(64,{commands:[[64,0x2c8000,25,1,0]],objects:[[32,1232,0x5010,20,30,4,0]],pixels:[1,2,3]})),true);
 t.ingest(packet(65,{objects:[[32,1232,0x5010,24,31,4,0]],pixels:[1,2,3]}));
 t.ingest(packet(69,{commands:[[69,0x2c8004,33,2,0]],pixels:[4,2,3],state:[[10,3000,70],[31,6000,100]]}));
 const {events}=t.snapshot(),commands=events.filter(e=>e.track==='script'),o=events.find(e=>e.track==='objects');
 assert.equal(commands[0].end,68);assert.equal(commands[1].start,69);assert.equal(o.end,65);assert.deepEqual(o.first,[20,30]);assert.deepEqual(o.last,[24,31]);assert.equal(o.width,128);assert.equal(o.height,16);assert.equal(o.moves,1);
 assert.equal(events.filter(e=>e.label==='대사 영역 변화').length,2);assert.equal(events.filter(e=>e.label==='초상화 영역 변화').length,1);
 assert.ok(events.some(e=>e.track==='damage'&&e.amount===3000&&e.after===6000));assert.equal(events.some(e=>/파괴 확정|명중 확정/.test(e.label)),false);
 assert.equal(events.filter(e=>e.track==='dialogue').length,1);assert.equal(events.find(e=>e.track==='dialogue').changes,2);
});
test('new playback cannot splice older frames, huge untrusted message lists or malformed geometry',()=>{
 const t=createBattleTrace();assert.equal(t.ingest(packet(80)),true);assert.equal(t.ingest(packet(79)),false);assert.equal(t.ingest(packet(81,{start:65})),false);assert.equal(t.ingest(packet(82,{objects:Array(513).fill([])})),false);
 assert.equal(t.ingest(packet(83,{objects:[[0,-1,0,0,0,0,0]],commands:[[84,1,1,1,1]]})),true);assert.equal(t.snapshot().events.some(e=>e.track==='objects'||e.track==='script'),false);
 assert.equal(t.ingest(packet(84,{commands:[new Array(5)],objects:[new Array(7)]})),true);assert.equal(t.snapshot().events.some(e=>e.track==='objects'||e.track==='script'),false);
});
test('malformed side states reject the whole packet before changing the trace',()=>{
 const malformed=[null,7,'bad',{},[],[10,3000],[10,3000,65536],[10,3000,NaN],new Array(3),[10,,80]];
 for(const side of [0,1])for(const value of malformed){
  const t=createBattleTrace(),state=[[10,3000,80],[31,9000,100]];state[side]=value;
  assert.equal(t.ingest(packet(64,{state,commands:[[64,0x2c8000,25,1,0]],objects:[[32,1232,0x5010,20,30,4,0]]})),false);
  assert.deepEqual(t.snapshot(),{start:0,end:0,events:[],truncated:false});
  assert.equal(t.ingest(packet(66,{start:65})),true,'rejected first packets must not fix the playback start');
 }
 const t=createBattleTrace();t.ingest(packet(64,{commands:[[64,0x2c8000,25,1,0]]}));
 const before=structuredClone(t.snapshot());
 assert.equal(t.ingest(packet(80,{state:[[10,1,1],null],commands:[[80,0x2c8004,33,2,0]],objects:[[32,1232,0x5010,20,30,4,0]]})),false);
 assert.deepEqual(t.snapshot(),before,'a rejected packet must not append events or advance prior command duration');
 assert.equal(t.ingest(packet(65)),true);
 assert.equal(t.snapshot().events.filter(e=>e.track==='hp').length,2,'rejected state must not affect later state comparisons');
});
test('begin clears previous inspection and end paints completion without another data packet',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const document=installFakeDom(),container=document.createElement('div'),timeline=createBattleTimeline(container);
 timeline.select(2);t.mock.timers.tick(180);
 timeline.receive({weapon:2,kind:'begin'});t.mock.timers.tick(180);
 timeline.receive({weapon:2,kind:'data',data:packet(70,{commands:[[64,0x2c8000,25,1,0]]})});t.mock.timers.tick(180);
 const inspect=container.querySelector('.battle-timeline-inspect'),detail=inspect.querySelector('output');
 assert.equal(Array.from(container.querySelectorAll('.battle-timeline-event')).some(button=>button.title.startsWith('명령 #25')),false,'technical commands stay collapsed initially');
 Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='기술 기록').onclick();t.mock.timers.tick(180);
 Array.from(container.querySelectorAll('.battle-timeline-event')).find(button=>button.title.startsWith('명령 #25')).onclick();
 assert.equal(inspect.hidden,false);assert.match(detail.textContent,/명령 #25/);
 timeline.receive({weapon:2,kind:'end'});t.mock.timers.tick(180);
 assert.equal(container.dataset.complete,'true');assert.match(container.querySelector('.battle-timeline-note').textContent,/수집 끝/);
 timeline.receive({weapon:2,kind:'begin'});t.mock.timers.tick(180);
 assert.equal(container.dataset.complete,'false');assert.equal(container.dataset.events,'0');assert.equal(container.dataset.frame,'0');
 assert.equal(inspect.hidden,true);assert.doesNotMatch(detail.textContent,/명령 #25/);
 assert.equal(container.querySelector('input').max,'0');assert.equal(container.querySelector('.battle-timeline-event'),null);
 timeline.receive({weapon:2,kind:'end'});t.mock.timers.tick(180);
 assert.equal(container.dataset.complete,'true','an empty playback still refreshes its finished state');
});
test('native HP loss, EN changes, face changes and HP zero are distinct from screen pixels',()=>{
 const trace=createBattleTrace();trace.ingest(packet(64));
 trace.ingest(packet(65,{state:[[10,3000,70],[31,8000,100]]}));
 trace.ingest(packet(66,{state:[[10,3000,70],[32,7500,100]]}));
 trace.ingest(packet(67,{state:[[10,3000,70],[32,0,100]]}));
 trace.ingest(packet(68,{state:[[10,3000,70],[32,0,100]]}));
 trace.ingest(packet(69,{state:[[10,3000,70],[32,300,100]]}));
 trace.ingest(packet(70,{state:[[10,3000,70],[32,200,100]]}));
 const events=trace.snapshot().events,damage=events.filter(event=>event.track==='damage');
 assert.deepEqual(damage.map(event=>({start:event.start,end:event.end,amount:event.amount,before:event.before,after:event.after})),[{start:65,end:67,amount:9000,before:9000,after:0},{start:70,end:70,amount:100,before:300,after:200}]);
 assert.deepEqual(events.filter(event=>event.track==='defeat').map(event=>[event.start,event.side,event.kind]),[[67,1,'hp-zero']]);
 assert.ok(events.some(event=>event.kind==='en-change'&&event.amount===10&&event.side===0));
 assert.ok(events.some(event=>event.kind==='face-change'&&event.face===32&&event.region==='portrait'));
 assert.ok(events.some(event=>event.kind==='hp-gain'));assert.equal(events.some(event=>event.track==='pixels'),false);
 assert.match(events.find(event=>event.track==='defeat').detail,/폭발.*뜻하지 않습니다/);
 const alreadyZero=createBattleTrace();alreadyZero.ingest(packet(64,{state:[[10,3000,80],[31,0,100]]}));assert.equal(alreadyZero.snapshot().events.some(event=>event.track==='defeat'),false,'starting with zero HP is not a newly observed defeat');
});
test('sprite movement and texture swaps coalesce, while primitives and reused slots do not imply a unit or explosion',()=>{
 const trace=createBattleTrace(),sprite=(x,texture=1232)=>[32,texture,0x5010,x,30,4,0],primitive=x=>[33,1232,0x5010,x,30,4,4];
 trace.ingest(packet(64,{objects:[sprite(20),primitive(0)]}));trace.ingest(packet(65,{objects:[sprite(24),primitive(3)]}));trace.ingest(packet(66,{objects:[sprite(24,1300),primitive(8)]}));
 trace.ingest(packet(67));trace.ingest(packet(68,{objects:[sprite(300,1400)]}));
 const motions=trace.snapshot().events.filter(event=>event.track==='motion');assert.equal(motions.length,1);
 assert.deepEqual({id:motions[0].id,first:motions[0].first,last:motions[0].last,moves:motions[0].moves,swaps:motions[0].swaps},{id:32,first:[20,30],last:[24,30],moves:1,swaps:1});assert.equal(motions[0].start,65);assert.equal(motions[0].end,66);
 assert.match(motions[0].detail,/특정 기체나 폭발로 단정하지 않습니다/);
});
test('dialogue screen bursts group only nearby native frames and keep raw hash changes as technical observations',()=>{
 const trace=createBattleTrace();trace.ingest(packet(64,{pixels:[1,2,3]}));trace.ingest(packet(65,{pixels:[4,2,3]}));trace.ingest(packet(74,{pixels:[5,2,3]}));trace.ingest(packet(75,{pixels:new Array(3)}));
 const events=trace.snapshot().events,dialogue=events.filter(event=>event.track==='dialogue');assert.deepEqual(dialogue.map(event=>[event.start,event.end,event.changes]),[[64,65,2],[74,74,1]]);
 assert.equal(events.filter(event=>event.track==='pixels'&&event.region==='dialogue').length,3);assert.equal(events.some(event=>event.track==='portrait'&&event.kind===undefined),false);assert.match(dialogue[0].detail,/본문 문자열.*해독하지 않았습니다/);
});
test('render observation saturation leaves room for subsequent native damage and HP-zero events',()=>{
 const trace=createBattleTrace();for(let i=0;i<30;i++)trace.ingest(packet(64+i,{objects:Array.from({length:512},(_,slot)=>[slot,1024+i*8,0x0808,i,30,4,0])}));
 trace.ingest(packet(94,{state:[[10,3000,80],[31,0,100]]}));const snapshot=trace.snapshot();assert.equal(snapshot.truncated,true);assert.ok(snapshot.events.length<=12000);assert.ok(snapshot.events.some(event=>event.track==='damage'&&event.amount===9000));assert.ok(snapshot.events.some(event=>event.track==='defeat'));
});
test('recorded dialogue and face crops use native pixels at either frame resolution',()=>{
 assert.deepEqual(battleSnapshotRegion('dialogue',320,224),[58,172,251,44]);assert.deepEqual(battleSnapshotRegion('portrait',640,448),[14,344,96,88]);assert.deepEqual(battleSnapshotRegion('full',320,224),[0,0,320,224]);assert.equal(battleSnapshotRegion('dialogue',0,224),null);
});
test('new data updates existing markers in place, retaining focused inspection controls',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=installFakeDom(),host=d.createElement('section'),timeline=createBattleTimeline(host);timeline.select(2);
 timeline.receive({weapon:2,kind:'data',data:packet(64)});t.mock.timers.tick(100);
 const chart=host.querySelector('.battle-timeline-chart'),lane=chart.querySelector('.battle-timeline-lane'),marker=chart.querySelector('.battle-timeline-event');marker.focus();
 timeline.receive({weapon:2,kind:'data',data:packet(65)});t.mock.timers.tick(100);
 assert.equal(chart.querySelector('.battle-timeline-lane'),lane);assert.equal(chart.querySelector('.battle-timeline-event'),marker);assert.equal(d.activeElement,marker);assert.equal(host.dataset.frame,'65');
});
test('screen samples are retained without decoding hidden inspection images',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=installFakeDom(),host=d.createElement('section');let decodes=0;
 const old=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>{decodes++;return{width:320,height:224,close(){}}};t.after(()=>{if(old)globalThis.createImageBitmap=old;else delete globalThis.createImageBitmap});
 const timeline=createBattleTimeline(host);timeline.select(2);timeline.receive({weapon:2,kind:'data',data:packet(64)});timeline.receive({weapon:2,kind:'shot',frame:64,url:'data:image/jpeg;base64,/9j/'});t.mock.timers.tick(100);
 assert.equal(decodes,0);host.querySelector('.battle-timeline-event').onclick();assert.equal(decodes,1);
});
test('compact timeline crops stay readable inside their panel without resizing the battle preview',{skip:!process.env.SRWF_EDITOR_PLAYWRIGHT},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.SRWF_EDITOR_PLAYWRIGHT),browser=await chromium.launch({headless:true,...process.env.SRWF_EDITOR_BROWSER?{executablePath:process.env.SRWF_EDITOR_BROWSER}:{}});
 const [css,baseCss,source]=await Promise.all([readFile(new URL('../assets/editor-runtime.css',import.meta.url),'utf8'),readFile(new URL('../assets/style.css',import.meta.url),'utf8'),readFile(new URL('../assets/editor-battle-timeline.mjs',import.meta.url),'utf8')]);
 try{for(const [width,height]of [[320,568],[430,932],[1024,768],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://timeline.test/**',route=>{const module=new URL(route.request().url()).pathname==='/timeline.mjs';return route.fulfill({contentType:module?'text/javascript; charset=utf-8':'text/html; charset=utf-8',body:module?source:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCss}\n${css}\nhtml,body{margin:0;padding:0;overflow:hidden}body{font-family:sans-serif}.qa{width:min(480px,calc(100vw - 16px));margin:8px;display:grid;grid-template-rows:160px 220px;gap:4px}.qa #preview{background:#001020}.qa #timeline{height:220px;box-sizing:border-box}</style><body><main class="qa"><div id="preview"></div><section id="timeline" class="weapon-timeline-panel"></section></main></body>`});});
  await page.goto('http://timeline.test/');await page.evaluate(async()=>{
   const {createBattleTimeline}=await import('/timeline.mjs'),timeline=createBattleTimeline(document.getElementById('timeline'));timeline.select(2);timeline.receive({weapon:2,kind:'begin'});
   const packet=(frame,extra={})=>({frame,start:64,commands:[],objects:[],state:[[10,3000,80],[31,9000,100]],pixels:[1,2,3],...extra});
   timeline.receive({weapon:2,kind:'data',data:packet(64,{commands:[[64,0x2c8000,25,1,0]]})});timeline.receive({weapon:2,kind:'data',data:packet(65,{state:[[10,3000,70],[31,7948,100]],pixels:[4,2,3]})});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=224;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(58,172,251,44);ctx.fillStyle='#000';ctx.fillText('recorded dialogue sample',60,190);
   timeline.receive({weapon:2,kind:'shot',frame:64,url:canvas.toDataURL('image/jpeg',.6)});timeline.receive({weapon:2,kind:'end'});
  });await page.waitForTimeout(200);const before=await page.locator('#preview').boundingBox();await page.getByRole('button',{name:/대사 화면 갱신 구간/}).click();await page.waitForFunction(()=>!document.querySelector('.battle-timeline-inspect canvas').hidden);
  const result=await page.evaluate(()=>{const panel=document.getElementById('timeline'),r=panel.getBoundingClientRect(),inspect=panel.querySelector('.battle-timeline-inspect'),ir=inspect.getBoundingClientRect(),canvas=inspect.querySelector('canvas'),cr=canvas.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,escaped:cr.right>r.right+.5||cr.bottom>ir.bottom+.5||ir.bottom>r.bottom+.5,crop:[canvas.width,canvas.height],height:cr.height,damage:panel.dataset.damage,technicalVisible:[...panel.querySelectorAll('.battle-timeline-event')].some(button=>button.title.startsWith('명령 #25'))};});
  assert.equal(result.overflow,false,JSON.stringify({width,result}));assert.equal(result.escaped,false,JSON.stringify({width,result}));assert.deepEqual(result.crop,[251,44]);assert.ok(result.height>=44,JSON.stringify({width,result}));assert.equal(result.damage,'1052');assert.equal(result.technicalVisible,false);
  await page.getByRole('button',{name:'기술 기록',exact:true}).click();await page.waitForTimeout(190);assert.ok(await page.getByRole('button',{name:/명령 #25/}).count()>0);
  await page.getByRole('button',{name:'기록 화면 표본 닫기'}).click();assert.equal(await page.locator('.battle-timeline-inspect').isVisible(),false);assert.equal((await page.locator('#preview').boundingBox()).height,before.height);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});

test('precomputed timeline paints complete bars before playback and position updates never grow markers',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const d=installFakeDom(),host=d.createElement('section'),timeline=createBattleTimeline(host);timeline.select(2);
 timeline.receive({weapon:2,kind:'begin',precomputed:true});timeline.receive({weapon:2,kind:'data',data:packet(100)});timeline.receive({weapon:2,kind:'data',data:packet(200)});t.mock.timers.tick(1000);
 assert.equal(host.querySelectorAll('.battle-timeline-event').length,0);assert.equal(host.dataset.complete,'false');
 timeline.receive({weapon:2,kind:'end',precomputed:true,start:100});assert.equal(host.dataset.complete,'true');assert.equal(host.dataset.frame,'100');
 const marker=host.querySelector('.battle-timeline-event'),before=[marker.style.left,marker.style.width,marker.dataset.end],count=host.querySelectorAll('.battle-timeline-event').length;
 timeline.receive({weapon:2,kind:'position',frame:150});assert.equal(host.dataset.frame,'150');assert.equal(host.querySelectorAll('.battle-timeline-event').length,count);assert.deepEqual([marker.style.left,marker.style.width,marker.dataset.end],before);
 const paints=host.dataset.trackPaints;for(let frame=151;frame<190;frame++)timeline.receive({weapon:2,kind:'position',frame});
 timeline.setVisible(false);timeline.setVisible(true);t.mock.timers.tick(1000);
 assert.equal(host.dataset.trackPaints,paints,'playhead updates and showing an unchanged chart must not rebuild track geometry');
 const scroller=host.querySelector('.battle-timeline-scroll');scroller.scrollLeft=100;scroller.dispatchEvent({type:'scroll'});t.mock.timers.tick(100);
 assert.equal(host.dataset.trackPaints,paints,'scrolling only refreshes visible ruler ticks');
 host.querySelector('select').value='2';host.querySelector('select').onchange();t.mock.timers.tick(100);assert.equal(Number(host.dataset.trackPaints),Number(paints)+1,'zoom alone updates marker geometry');
});
