import assert from 'node:assert/strict';
import test from 'node:test';
import {animationChoices,animationDefaultPilot,validateAnimationSelection,validateAnimationRuntime,animationCue,createInlineAnimationPreview,animationEndStatus,animationRuntimeSelection} from '../assets/editor-animation.mjs';
import {createEditorWorker} from '../assets/editor-worker.mjs';

test('preview admits only the three compiled latest Final fonts', () => {
  for(const baseTargetSha256 of [
    'fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e',
    '9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23',
    '0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d',
  ]) assert.doesNotThrow(()=>validateAnimationRuntime({gameId:'srwf-final',baseTargetSha256}));
  assert.throws(()=>validateAnimationRuntime({gameId:'srwf-final',baseTargetSha256:'0'.repeat(64)}),/v0.3 a\/b\/c/);
  assert.equal(validateAnimationRuntime({gameId:'srwf-f',baseTargetSha256:'b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9'}),'f-current.json');
  for(const baseTargetSha256 of ['85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3','75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202'])
    assert.equal(validateAnimationRuntime({gameId:'srwf-f',baseTargetSha256}),'f-current.json');
  assert.throws(()=>validateAnimationRuntime({gameId:'srwf-f'}),/v0.5 a\/b\/c/);
  assert.throws(()=>validateAnimationRuntime(),/F 완결편/);
});

test('F uses its four-track disc layout and Final keeps its three-track layout', () => {
  const f=animationCue('srwf-f'),fin=animationCue('srwf-final');
  assert.equal((f.match(/TRACK /g)||[]).length,4);
  assert.match(f,/TRACK 03 MODE1\/2352\n    INDEX 01 54:15:41/);
  assert.match(f,/TRACK 04 AUDIO\n    INDEX 01 54:26:37/);
  assert.equal((fin.match(/TRACK /g)||[]).length,3);
  assert.match(fin,/INDEX 01 48:57:28/);
  for(const cue of [f,fin]) assert.match(cue,/^FILE "preview.bin" BINARY/);
  assert.throws(()=>animationCue('unknown'));
});

test('a successful process exit at the frame limit does not claim animation completion', () => {
  assert.equal(animationEndStatus(0,true,false),'시연 시간 끝 · 연출 완료 미확인');
  assert.equal(animationEndStatus(0,true,true),'재생 끝 · 다시 재생 가능');
  assert.equal(animationEndStatus(0,false,true),'재생 중단');
  assert.equal(animationEndStatus(1,true,true),'재생 중단');
});
test('unbuilt hero instances use an explicit native portrait specimen only in the disposable preview',()=>{
  for(const pilot of [302,303]){
    const selected={weapon:1190,unit:78,pilot};assert.deepEqual(animationRuntimeSelection(selected),{weapon:1190,unit:78,pilot:304});assert.equal(selected.pilot,pilot);
  }
  assert.deepEqual(animationRuntimeSelection({weapon:1,unit:1,pilot:10}),{weapon:1,unit:1,pilot:10});
});

test('conditional Longinus and unowned weapons stay selectable, with unit record IDs', () => {
  const choices=animationChoices([
    {recordIndex:874,name:'롱기누스의창',defaultVisible:false,owners:[{unit:232}],ownership:'owned'},
    {recordIndex:123,name:'아이언커터',owners:[],ownership:'unowned'},
  ],[{recordIndex:232,name:'에바영호기',imageIndex:222,weaponList:{entries:[{weaponIndex:874,requiresFlag:true}]}}],
  [{recordIndex:181,name:'레이'},{recordIndex:308,name:'꼬리',role:'hero-list'}]);
  assert.equal(choices.weapons.length,2);assert.equal(choices.weapons[0].conditional,true);
  assert.deepEqual(choices.weapons[0].owners,[232]);assert.equal(choices.weapons[1].unused,true);
  assert.deepEqual(validateAnimationSelection({weapon:874,unit:232,pilot:181},choices),{weapon:874,unit:232,pilot:181});
  assert.throws(()=>validateAnimationSelection({weapon:874,unit:222,pilot:181},choices));
  assert.throws(()=>validateAnimationSelection({weapon:123,unit:232,pilot:NaN},choices));
  assert.throws(()=>validateAnimationSelection({weapon:'874',unit:232,pilot:181},choices));
});

test('late pilot records remain selectable while hero learnsets and reserved aliases do not', () => {
  const choices=animationChoices([{recordIndex:2}], [{recordIndex:1,imageIndex:1}], [
    {recordIndex:307,name:'주인공 능력치'},
    {recordIndex:308,name:'주인공 습득표',role:'hero-list'},
    {recordIndex:312,name:'예약 별칭'},
    {recordIndex:320,name:'연방군 병사'},
    {recordIndex:347,name:'포우 무라사메'},
    {recordIndex:398,name:'샤피로 키츠'},
    {recordIndex:399,name:''},
    {recordIndex:400,name:'범위 밖'},
  ]);
  assert.deepEqual(choices.pilots.map(row=>row.id),[307,320,347,398,399]);
  for(const pilot of [320,347,398,399])
    assert.equal(validateAnimationSelection({weapon:2,unit:1,pilot},choices).pilot,pilot);
  for(const pilot of [308,312,400])
    assert.throws(()=>validateAnimationSelection({weapon:2,unit:1,pilot},choices),/파일럿/);
});

test('ROM handoff requires the current authenticated session and RESET revokes it', async () => {
  let handler;const posts=[];const blob=new Blob(['private-ROM']);
  createEditorWorker({addEventListener:(t,h)=>handler=h,postMessage:m=>posts.push(m)}, {
    inspectPatchedImage:async()=>({session:{sessionToken:'current',sourceBlob:blob,descriptor:{gameId:'srwf-final'}},view:{}}),
  });
  const send=data=>handler({data});
  send({type:'ANIMATION_SOURCE',previewId:'p',sessionToken:'current'});
  assert.equal(posts.at(-1).type,'ANIMATION_SOURCE_ERROR');
  send({type:'INSPECT',jobId:'inspect-00001'});await new Promise(r=>setTimeout(r,0));
  send({type:'ANIMATION_SOURCE',previewId:'p',sessionToken:'stale'});
  assert.equal(posts.at(-1).type,'ANIMATION_SOURCE_ERROR');
  send({type:'ANIMATION_SOURCE',previewId:'p',sessionToken:'current'});
  assert.equal(posts.at(-1).blob,blob);assert.equal(posts.at(-1).type,'ANIMATION_SOURCE_COMPLETE');
  send({type:'RESET'});send({type:'ANIMATION_SOURCE',previewId:'p',sessionToken:'current'});
  assert.equal(posts.at(-1).type,'ANIMATION_SOURCE_ERROR');
});

test('inline preview stays off without reading a ROM, selects in place, and discards late handoffs', async () => {
  const saved=Object.fromEntries(['document','location','crossOriginIsolated','BroadcastChannel'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let click,load,reads=0,created=0,channel,frame,resolveSource,weapon=2;
  const posted=[],attrs={},visibility=[];
  const button={addEventListener:(t,h)=>click=h,setAttribute:(k,v)=>attrs[k]=v};
  const panel={hidden:false,replaceChildren(...nodes){this.nodes=nodes;}};
  try {
    Object.defineProperties(globalThis,{
      location:{configurable:true,value:{origin:'http://localhost'}},
      crossOriginIsolated:{configurable:true,value:true},
      document:{configurable:true,value:{createElement(){created++;return frame={contentWindow:{postMessage:m=>posted.push(m)},addEventListener(t,h){if(t==='load')load=h;},remove(){this.removed=true;}};}}},
      BroadcastChannel:{configurable:true,value:class {constructor(){channel=this;}close(){this.closed=true;}postMessage(m){posted.push(m);}}},
    });
    const ui=createInlineAnimationPreview({button,panel,preferBattleCrop:true,onVisibility:visible=>visibility.push(visible),getWeapon:()=>weapon,getChoices:()=>({weapons:[{id:2}]}),getSource:()=>{reads++;return new Promise(r=>resolveSource=r);}});
    assert.equal(attrs['aria-checked'],'false');assert.equal(panel.hidden,true);assert.equal(created,0);assert.equal(reads,0);
    click();assert.equal(panel.hidden,false);assert.equal(created,1);assert.equal(new URL(frame.src).searchParams.get('embedded'),'1');assert.match(new URL(frame.src).searchParams.get('v'),/^\d{8}-(?:\d+|review\d+|part\d+)$/);assert.match(new URL(frame.src).hash,/^#handoff=/);
    load();assert.equal(posted.at(-1).type,'preview-viewport');assert.equal(posted.at(-1).mobile,true,'landscape weapon timeline workspace requests battle crop on desktop too');
    click();assert.equal(panel.hidden,true);assert.notEqual(frame.removed,true);assert.equal(posted.at(-1).paused,true);
    click();assert.equal(panel.hidden,false);assert.equal(created,1);assert.equal(posted.at(-1).paused,false);
    const pending=channel.onmessage({data:{type:'ready'}});assert.equal(reads,1);
    weapon=874;ui.select();await Promise.resolve();assert.equal(posted.at(-1).weapon,874);
    ui.close();assert.equal(frame.removed,true);assert.equal(channel.closed,true);assert.equal(panel.hidden,true);
    assert.deepEqual(visibility,[false,true,false,true,false],'paired timeline follows initial OFF, ON/OFF, reused ON and close');
    resolveSource({blob:new Blob(['ROM'])});await pending;
    assert.equal(posted.some(m=>m.type==='source'),false);
  } finally {
    for(const [k,descriptor] of Object.entries(saved)) if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];
  }
});

test('pending and saved constructions remain selected and recommend the donor pilot explicitly',()=>{
  const choices=animationChoices([{recordIndex:2}], [{recordIndex:1,imageIndex:1},{recordIndex:428,imageIndex:306,pendingConstruction:'ex-s-gundam'},{recordIndex:429,imageIndex:308,construction:{preset:'sirbine'}}], [{recordIndex:10},{recordIndex:126}],[],'srwf-final');
  assert.deepEqual(choices.units.map(row=>row.id),[1,428,429]);
  assert.equal(animationDefaultPilot(428,choices),10);
  assert.equal(animationDefaultPilot(429,choices),126);
  assert.equal(choices.units.find(row=>row.id===428).defaultPilotSource,'construction-base');
  assert.equal(validateAnimationSelection({weapon:2,unit:428,pilot:10},choices).unit,428);
});

test('pilot defaults follow authenticated ROM pairings and never fall back to Amuro',()=>{
  const units=[{recordIndex:1,imageIndex:1},{recordIndex:24,imageIndex:24},{recordIndex:232,imageIndex:222},{recordIndex:430,imageIndex:306}];
  const pilots=[{recordIndex:10},{recordIndex:98},{recordIndex:181},{recordIndex:308,role:'hero-list'}];
  const placements=[{recordIndex:'1:20',unitId:24,pilotId:98},{recordIndex:'2:20',unitId:232,pilotId:181},
    {recordIndex:'1:20',unitId:24,pilotId:98},{recordIndex:'3:20',unitId:24,pilotId:10},
    {recordIndex:'4:20',unitId:24,pilotId:98},{recordIndex:'5:20',unitId:1,pilotId:308},
    {recordIndex:'6:20',placementKind:'roster-reference',unitId:430,pilotId:10}];
  const choices=animationChoices([],units,pilots,placements);
  assert.deepEqual(choices.units.find(u=>u.id===24).pilotCandidates,[98,10]);
  assert.equal(animationDefaultPilot(24,choices),98);
  assert.equal(animationDefaultPilot(232,choices),181);
  assert.equal(animationDefaultPilot(1,choices),null);
  assert.equal(animationDefaultPilot(430,choices),null);
});

test('unit defaults include successive and alternate forms without changing boarding records',()=>{
  const units=[1,9,24,27,28,25,273,272,332,430].map(recordIndex=>({recordIndex,imageIndex:recordIndex}));
  const pilots=[10,98,99,204,59].map(recordIndex=>({recordIndex}));
  const placements=[{recordIndex:'a',unitId:9,pilotId:10},{recordIndex:'b',unitId:27,pilotId:98},
    {recordIndex:'c',unitId:28,pilotId:99},{recordIndex:'d',unitId:273,pilotId:204},{recordIndex:'e',unitId:1,pilotId:59}];
  const original=structuredClone(placements);
  for(const gameId of ['srwf-f','srwf-final']) {
    const choices=animationChoices([],units,pilots,placements,gameId);
    for(const [unit,pilot]of [[1,10],[24,98],[25,99],[272,204],[332,204]])assert.equal(animationDefaultPilot(unit,choices),pilot);
    assert.equal(choices.units.find(u=>u.id===24).defaultPilotSource,'unit-default');
    assert.equal(animationDefaultPilot(430,choices),null);
  }
  assert.deepEqual(placements,original);
});

test('battle handoff exports pending edits, caches the exact request, and never serves stale construction',async()=>{
  let handler,exports=0;
  const posts=[],original=new Blob(['original']),edited=new Blob(['Ex-S graphic 306']);
  createEditorWorker({addEventListener:(t,h)=>handler=h,postMessage:m=>posts.push(m)},{
    inspectPatchedImage:async()=>({session:{sessionToken:'current',sourceBlob:original,descriptor:{gameId:'srwf-final',targetSha256:'old',targetSize:original.size}},view:{}}),
    exportEditedImage:async(session,request)=>{exports++;assert.equal(request.unitRestorations[0].preset,'ex-s-gundam');return {outputBlob:edited,sha256:'edited-sha'};},
  });
  const send=async data=>{handler({data});await new Promise(r=>setTimeout(r,0));return posts.at(-1);};
  await send({type:'INSPECT',jobId:'inspect-00001'});
  const request={unitRestorations:[{recordIndex:428,preset:'ex-s-gundam'}],unitEdits:[]};
  let result=await send({type:'ANIMATION_SOURCE',previewId:'a',sessionToken:'current',request});
  assert.equal(result.blob,edited);assert.equal(result.descriptor.targetSha256,'edited-sha');assert.equal(result.descriptor.targetSize,edited.size);
  await send({type:'ANIMATION_SOURCE',previewId:'b',sessionToken:'current',request:structuredClone(request)});assert.equal(exports,1);
  await send({type:'ANIMATION_SOURCE',previewId:'c',sessionToken:'current',request:{...request,unitEdits:[{recordIndex:428,fields:{hp:9999}}]}});assert.equal(exports,2);
  result=await send({type:'ANIMATION_SOURCE',previewId:'d',sessionToken:'current'});assert.equal(result.blob,original);
  await send({type:'RESET'});result=await send({type:'ANIMATION_SOURCE',previewId:'e',sessionToken:'current',request});
  assert.equal(result.type,'ANIMATION_SOURCE_ERROR');assert.equal(exports,2);
});

test('reset during edited handoff discards both the result and its cached snapshot',async()=>{
  let handler,finish,exports=0;const posts=[];
  createEditorWorker({addEventListener:(t,h)=>handler=h,postMessage:m=>posts.push(m)},{
    inspectPatchedImage:async()=>({session:{sessionToken:'current',sourceBlob:new Blob(['original']),descriptor:{gameId:'srwf-final'}},view:{}}),
    exportEditedImage:async()=>{exports++;return new Promise(r=>finish=r);},
  });
  const send=async data=>{handler({data});await new Promise(r=>setTimeout(r,0));};
  await send({type:'INSPECT',jobId:'inspect-00001'});
  const message={type:'ANIMATION_SOURCE',previewId:'a',sessionToken:'current',request:{unitRestorations:[]}};
  await send(message);await send({type:'RESET'});finish({outputBlob:new Blob(['late']),sha256:'late'});await new Promise(r=>setTimeout(r,0));
  assert.equal(posts.filter(p=>p.type==='ANIMATION_SOURCE_COMPLETE').length,0);
  await send({type:'INSPECT',jobId:'inspect-00002'});await send(message);assert.equal(exports,2);
  finish({outputBlob:new Blob(['new']),sha256:'new'});await new Promise(r=>setTimeout(r,0));assert.equal(posts.at(-1).descriptor.targetSha256,'new');
});
