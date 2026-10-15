import {battlePreviewReasonLabel} from './editor-battle-preview-reason.mjs?v=20261015-stocknames2';
import {matchesBattleLibrarySearch} from './editor-battle-library-search.mjs';
import {battleDialogueChoiceOptions} from './editor-battle-dialogue-options.mjs?v=20261015-stocknames2';
import{hasPreparedBattleSoundNotes}from'./editor-battle-isolated-sound-failures.mjs?v=20261015-stocknames2';
import {inspectEffectOutcomes,effectOutcomesLabel} from './editor-battle-effect-outcomes.mjs?v=20261015-stocknames2';
import{loopBattlePreviewRange}from'./editor-battle-preview-range.mjs';
import{createBattleSharedEffectBus}from'./editor-battle-shared-effect-bus.mjs?v=20261015-stocknames2';
import{compileBattleEffectSignalGraph}from'./editor-battle-effect-signal-graph.mjs';
import{resolveBattleEffectOutputMix}from'./editor-battle-effect-output-mix.mjs';
import{createBattleSequenceWebPlayer}from'./editor-battle-sequence-web-player.mjs?v=20261015-stocknames2';
import{createBattleEffectSoundTransport}from'./editor-battle-effect-sound-transport.mjs?v=20261015-stocknames2';
import {compileBattleWebSceneFrame} from './editor-battle-web-scene-frame.mjs';
import {createBattlePlacementFrame} from './editor-battle-placement-frame.mjs';
import {paintBattleSceneCommandFrame} from './editor-battle-canvas.mjs';
import {paintBattleWebTimeline,importBattleWebTimeline} from './editor-battle-web-timeline.mjs';
import {importBattleWebDialogueTimeline,readBattleWebDialogueAtUs,createBattleWebDialogueObjects} from './editor-battle-web-dialogue.mjs';
import {createBattleSimulationUI,battleCombatReasonLabel,battleCombatTerrainHint} from './editor-battle-simulation-ui.mjs?v=20261015-stocknames2';
import {createBattleWebHud} from './editor-battle-web-hud.mjs';
import {importBattleWebAudioScene,createBattleWebAudioTransport} from './editor-battle-web-audio.mjs?v=20261015-stocknames2';
let nextMusicControlId=0;
export function createBattlePlayer({container,getWeapons,getUnits,getPilots=()=>[],getPilotForUnit=()=>null,getTerrains=()=>[],getCombatRows=()=>null,readDialogueChoices,readMotionCatalog,readMusic,readScene:readSceneSource,readSceneFrame,onClose,onEditWeapon,onApplyDialogue}={}){
 const d=container.ownerDocument,root=d.createElement('section');root.className='battle-player';root.dataset.loading='true';root.setAttribute('aria-busy','true');
 root.innerHTML=`<header class="bp-header"><div><span class="bp-kicker">BATTLE STUDIO</span><h1>무기 전투 플레이어</h1></div><span class="bp-status">디스크 연출 준비 중</span><button class="bp-close" aria-label="플레이어 닫기">×</button></header><div class="bp-workspace"><aside class="bp-library"><div class="bp-section-head">무기 <span class="bp-library-count"></span></div><input class="bp-search" type="search" placeholder="무기 · 기체 검색" aria-label="플레이어 무기 검색"><select class="bp-mobile-weapons" aria-label="무기 선택"></select><div class="bp-weapons"></div></aside><main class="bp-main"><div class="bp-casting"><label>사용 기체<select class="bp-attacker"></select></label><span class="bp-versus">→</span><label>공격 대상<select class="bp-defender"></select></label></div><div class="bp-viewer"><canvas width="320" height="224"></canvas><div class="bp-stage-labels"><span class="bp-attacker-label"></span><span class="bp-defender-label"></span></div><p class="bp-stage-note">디스크 연출 자료를 준비합니다</p><div class="bp-empty">디스크에서 기체 그림을 불러옵니다</div></div><div class="bp-transport"><span class="bp-time">— : — : —</span><div><button class="bp-step" disabled aria-label="이전 프레임">Ⅰ‹</button><button class="bp-play" disabled title="연출 준비가 끝나면 재생됩니다">▶</button><button class="bp-step" disabled aria-label="다음 프레임">›Ⅰ</button></div><button class="bp-loop" aria-pressed="true">↻ 반복</button></div><div class="bp-outcomes" role="group" aria-label="전투 결과"><button data-mode="attack" aria-pressed="true">명중</button><button data-mode="evade">회피</button><button data-mode="defense">방어</button><button data-mode="destroyed">격추</button></div></main><aside class="bp-inspector"><div class="bp-section-head">선택한 무기</div><h2 class="bp-weapon-name"></h2><div class="bp-summary"></div><div class="bp-section-head bp-link-head">연출 연결</div><div class="bp-link-state"><i></i><div>디스크 연출 준비 중</div></div></aside></div><footer class="bp-timeline"><div class="bp-timeline-head"><strong>전투 타임라인</strong><span>웹 타임라인 준비 중</span><label>확대 <input type="range" min="1" max="4" value="1" aria-label="타임라인 확대"></label></div><div class="bp-ruler"><span>시작</span><span>접근</span><span>공격</span><span>피격 / 회피</span><span>종료</span></div><div class="bp-track"><span>사용 기체</span><div class="bp-track-lane"></div></div><div class="bp-track"><span>무기 효과</span><div class="bp-track-lane"></div></div><div class="bp-track"><span>공격 대상</span><div class="bp-track-lane"></div></div></footer>`;
 if(container.classList.contains('bp-overlay')){root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','무기 전투 플레이어');}
 container.append(root);const q=s=>root.querySelector(s),weapons=q('.bp-weapons'),mobile=q('.bp-mobile-weapons'),attacker=q('.bp-attacker'),defender=q('.bp-defender');let canvas=q('canvas'),pixi=null,pixiPending=null;
 const editWeapon=d.createElement('button');editWeapon.type='button';editWeapon.className='bp-edit-weapon';editWeapon.textContent='연출 편집';editWeapon.setAttribute('aria-label','표시 중인 무기 연출 편집');editWeapon.hidden=typeof onEditWeapon!=='function';editWeapon.disabled=true;q('.bp-library').insertBefore(editWeapon,weapons);
 const loading=d.createElement('div');loading.className='bp-loading';loading.setAttribute('role','status');loading.setAttribute('aria-live','polite');const loadingText=d.createElement('span'),loadingBar=d.createElement('progress');loadingText.className='bp-loading-text';loadingText.textContent='전투 준비 중';loadingBar.setAttribute('aria-label','전투 준비');loading.append(loadingText,loadingBar);q('.bp-viewer').append(loading);
 const setLoading=(busy,label='전투 준비 중')=>{root.dataset.loading=String(busy);loading.hidden=!busy;loadingBar.hidden=false;loadingText.textContent=label;for(const control of [musicToggle,musicBank,musicMixer])control.disabled=busy;if(busy)delete root.dataset.loadingError;};
 const afterFirstPaint=signal=>new Promise((resolve,reject)=>{let first=null,second=null,finished=false;const finish=error=>{if(finished)return;finished=true;if(first!==null)d.defaultView.cancelAnimationFrame(first);if(second!==null)d.defaultView.cancelAnimationFrame(second);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};const cancel=()=>finish(signal.reason??new DOMException('준비 취소','AbortError'));if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});if(d.hidden){finish();return;}first=d.defaultView.requestAnimationFrame(()=>{second=d.defaultView.requestAnimationFrame(()=>finish());});});
 const terrain=d.createElement('select');terrain.className='bp-terrain';terrain.setAttribute('aria-label','전투 미리보기 지형');
 const terrainLabel=d.createElement('label');terrainLabel.append(d.createTextNode('지형'),terrain);q('.bp-casting').append(terrainLabel);
 const pilotCasting=d.createElement('div');pilotCasting.className='bp-pilot-casting';
 const makePilotSelect=(role,title)=>{const select=d.createElement('select');select.className='bp-'+role+'-pilot';select.setAttribute('aria-label',title);
  const label=d.createElement('label');label.append(d.createTextNode(title),select);pilotCasting.append(label);return select;};
 const attackerPilot=makePilotSelect('attacker','사용 파일럿'),defenderPilot=makePilotSelect('defender','상대 파일럿');
 const dialogueChoice=d.createElement('select');dialogueChoice.className='bp-dialogue-choice';dialogueChoice.setAttribute('aria-label','공격 대사 미리보기');
 const dialogueChoiceLabel=d.createElement('label'),dialogueChoiceHead=d.createElement('span'),dialogueApply=d.createElement('button');dialogueChoiceHead.className='bp-dialogue-choice-head';dialogueApply.className='bp-dialogue-apply';dialogueApply.type='button';dialogueApply.textContent='적용';dialogueApply.setAttribute('aria-label','선택한 대사를 무기 설정에 적용');dialogueApply.hidden=typeof onApplyDialogue!=='function';dialogueApply.disabled=true;dialogueChoiceHead.append(d.createTextNode('대사 미리보기'),dialogueApply);dialogueChoiceLabel.append(dialogueChoiceHead,dialogueChoice);dialogueChoiceLabel.hidden=typeof readDialogueChoices!=='function';pilotCasting.append(dialogueChoiceLabel);
 if(typeof readDialogueChoices==='function')pilotCasting.classList.add('bp-with-dialogue-choice');
 let dialogueCatalogOwner=null;const dialogueCatalogs=new Map();
 const fillDialogueChoices=async({signal,pilotIndex})=>{
  if(typeof readDialogueChoices!=='function')return;
  if(dialogueCatalogOwner===pilotIndex)return;
  dialogueChoice.disabled=true;dialogueApply.disabled=true;dialogueChoice.replaceChildren();const original=d.createElement('option');original.value='';original.textContent='무기 설정 사용';dialogueChoice.append(original);
  if(!pilotIndex){dialogueCatalogOwner=null;return;}
  let catalog=dialogueCatalogs.get(pilotIndex);
  if(!catalog){catalog=await readDialogueChoices({pilotIndex,signal});if(signal.aborted)return;dialogueCatalogs.set(pilotIndex,catalog);}
  if(signal.aborted)return;
  for(const choice of battleDialogueChoiceOptions(catalog,{unitIndex:Number(attacker.value),getWeapons})){
   const option=d.createElement('option');option.value=choice.value;option.textContent=choice.label;option.title=choice.title;dialogueChoice.append(option);
  }
  dialogueChoice.disabled=catalog.status!=='ready';dialogueChoice.title='공격자의 대사·음성만 미리 봅니다. 무기와 BIN 설정은 바뀌지 않습니다.';dialogueCatalogOwner=pilotIndex;
 };
 const mediaOptions=d.createElement('div');mediaOptions.className='bp-media-options';
 const makeMediaToggle=(className,text,aria)=>{const label=d.createElement('label'),input=d.createElement('input');input.type='checkbox';input.checked=true;input.className=className;input.setAttribute('aria-label',aria);label.append(input,d.createTextNode(text));mediaOptions.append(label);return input;};
 const dialogueToggle=makeMediaToggle('bp-dialogue-toggle','대사창','전투 대사창 표시');q('.bp-transport').insertBefore(mediaOptions,q('.bp-loop'));
 q('.bp-main').insertBefore(pilotCasting,q('.bp-viewer'));
 const dialogue=d.createElement('div');dialogue.className='bp-dialogue';dialogue.hidden=true;dialogue.setAttribute('aria-live','off');
 const dialogueName=d.createElement('span'),dialogueText=d.createElement('span');dialogueName.className='bp-dialogue-name';dialogueText.className='bp-dialogue-text';dialogue.append(dialogueName,dialogueText);q('.bp-viewer').append(dialogue);
 const voiceToggle=makeMediaToggle('bp-voice-toggle','음성','전투 음성');
 const voiceStatus=d.createElement('p');voiceStatus.className='bp-voice-status';q('.bp-inspector').append(voiceStatus);
 const effectToggle=makeMediaToggle('bp-effect-toggle','효과음','전투 효과음');
 const effectStatus=d.createElement('p');effectStatus.className='bp-voice-status';q('.bp-inspector').append(effectStatus);
 let soundBus=null,soundBusPending=null,soundBusKey=null,soundBusController=null,soundBusGeneration=0,lastSoundTimeUs=null;
 const clearSoundBus=()=>{soundBusGeneration++;soundBusController?.abort();soundBusController=null;soundBus?.dispose();soundBus=null;soundBusPending=null;soundBusKey=null;lastSoundTimeUs=null;root.dataset.sharedEffectBus='off';root.dataset.sharedEffectRoutes='0';};
 const ensureSoundBus=async({graph,levels,profile})=>{
  if(!graph)return null;const key=JSON.stringify(profile);if(soundBus&&soundBusKey===key)return soundBus;if(soundBusPending&&soundBusKey===key)return soundBusPending;
  clearSoundBus();soundBusKey=key;const own=soundBusGeneration;soundBusController=new AbortController();const signal=soundBusController.signal;
  const pending=(async()=>{const bus=await createBattleSharedEffectBus({context:audio.context,graph,outputLevels:levels,signal});if(own!==soundBusGeneration){bus.dispose();return null;}soundBus=bus;bus.setPlaying(playing);root.dataset.sharedEffectBus='ready';return bus;})();soundBusPending=pending;
  try{return await pending;}finally{if(own===soundBusGeneration)soundBusPending=null;}
 };
 let effectPrepared=null,effects=null,effectGain=null,effectPreparing=null,effectGeneration=0,effectController=null;
 const clearEffects=()=>{effectGeneration++;effectController?.abort();effectController=null;delete root.dataset.effectSoundError;effects?.clear();effects=null;effectGain?.disconnect();effectGain=null;effectPreparing=null;effectPrepared=null;effectStatus.textContent='';soundBus?.reset();};
 const prepareEffects=async()=>{
  if(!effectToggle.checked||!['ready','partial'].includes(effectPrepared?.status)||!effectPrepared.events?.some(e=>e.kind==='sequence-start'&&!e.suppressed&&hasPreparedBattleSoundNotes(e.pcmPlan))||!audio.context||!timeline||effects)return;
  if(effectPreparing)return effectPreparing;const own=effectGeneration,prepared=effectPrepared;effectController=new AbortController();const effectSignal=effectController.signal;
  const gain=audio.context.createGain();gain.gain.value=.8;gain.connect(audio.context.destination);
  const pending=(async()=>{try{const bus=await ensureSoundBus({graph:prepared.effectGraph,levels:prepared.effectOutputLevels,profile:prepared.effectProfile});if(own!==effectGeneration){gain.disconnect();return;}const transport=await createBattleEffectSoundTransport({context:audio.context,prepared,durationUs:timeline.durationUs,output:gain,effectBus:bus,effectVolume:.8,signal:effectSignal,allowPartial:true});if(own!==effectGeneration||!effectToggle.checked){transport.clear();gain.disconnect();return;}effects=transport;effectGain=gain;effectStatus.textContent=transport.plan.status==='partial'?`효과음 일부 연결 · ${transport.plan.unresolved.length}개 미지원`:'디스크 효과음 연결됨';}catch(error){gain.disconnect();if(own===effectGeneration&&error.name!=='AbortError'){root.dataset.effectSoundError=error.message;effectStatus.textContent='이 연출의 효과음을 재생하지 못했습니다.';}}finally{if(own===effectGeneration)effectPreparing=null;}})();effectPreparing=pending;return pending;
 };
 effectToggle.addEventListener('change',()=>{if(!effectToggle.checked){effectGeneration++;effectController?.abort();effectController=null;effectPreparing=null;effects?.clear();effects=null;effectGain?.disconnect();effectGain=null;soundBus?.reset();effectStatus.textContent='효과음 꺼짐';}else{void audio.resumeFromGesture();if(effectPrepared)void prepareEffects();else void update();}});
 const musicPanel=d.createElement('div');musicPanel.className='bp-music-controls';musicPanel.hidden=typeof readMusic!=='function';
 const musicLabel=d.createElement('label'),musicToggle=d.createElement('input');musicToggle.type='checkbox';musicToggle.className='bp-music-toggle';musicToggle.id=`bp-music-${++nextMusicControlId}`;musicToggle.setAttribute('aria-label','전투 BGM');musicLabel.htmlFor=musicToggle.id;musicLabel.textContent='BGM';
 const musicBank=d.createElement('select');musicBank.setAttribute('aria-label','디스크 BGM 곡 선택');for(let i=0;i<65;i++){const option=d.createElement('option');option.value=String(i);option.textContent=`곡 ${i+1}`;musicBank.append(option);}
 const musicMixer=d.createElement('select');musicMixer.setAttribute('aria-label','BGM 출력 설정');const initialMixer=d.createElement('option');initialMixer.value='0';initialMixer.textContent='출력 1';musicMixer.append(initialMixer);
 const populateMusicMixers=count=>{const selected=musicMixer.value;musicMixer.replaceChildren();for(let i=0;i<count;i++){const option=d.createElement('option');option.value=String(i);option.textContent=`출력 ${i+1}`;musicMixer.append(option);}musicMixer.value=Number(selected)<count?selected:'0';};
 const musicStatus=d.createElement('p');musicStatus.className='bp-voice-status';musicStatus.setAttribute('role','status');musicStatus.textContent='디스크 순서로 선택 · 파일럿별 곡 배정 미연결';musicPanel.append(musicToggle,musicLabel,musicBank,musicMixer,musicStatus);q('.bp-inspector').append(musicPanel);
 let music=null,musicController=null,musicGeneration=0,musicPending=null;
 const clearMusic=()=>{musicGeneration++;musicController?.abort();musicController=null;music?.dispose();music=null;musicPending=null;soundBus?.reset();root.dataset.musicStatus='off';delete root.dataset.musicReasons;musicStatus.textContent=musicToggle.checked?'BGM 재생 준비 대기':'BGM 꺼짐';};
 const prepareMusic=async()=>{
  if(!musicToggle.checked||!timeline||!audio.context||music||typeof readMusic!=='function')return;
  if(musicPending)return musicPending;const own=musicGeneration,durationUs=timeline.durationUs;musicController=new AbortController();const signal=musicController.signal;musicStatus.textContent='BGM 준비 중';root.dataset.musicStatus='preparing';root.dataset.musicSampleRate=String(audio.context.sampleRate);
  const pending=(async()=>{try{
   const source=await readMusic({bankIndex:Number(musicBank.value),songIndex:0,durationUs,signal});if(signal.aborted||own!==musicGeneration)return;
   populateMusicMixers(source.soundPackage.toneTables.mixers.length);
   const bus=await ensureSoundBus({graph:compileBattleEffectSignalGraph(source.soundPackage.effect),levels:resolveBattleEffectOutputMix(source.soundPackage.toneTables,{mixerIndex:Number(musicMixer.value)}).levels,profile:{bankIndex:Number(musicBank.value),mixerIndex:Number(musicMixer.value)}});if(signal.aborted||own!==musicGeneration)return;
   const player=await createBattleSequenceWebPlayer({context:audio.context,effectBus:bus,voicePlan:source.voicePlan,toneBanks:new Map([[0,source.soundPackage]]),effectPackage:source.soundPackage,mixerIndex:Number(musicMixer.value),signal});
   if(signal.aborted||own!==musicGeneration){player.dispose();return;}if(player.status!=='reference'){root.dataset.musicReasons=[...new Set(player.plan.unresolved.map(e=>e.reason))].join(',');player.dispose();musicStatus.textContent='이 곡의 음원 처리 일부가 아직 미지원입니다';root.dataset.musicStatus='partial';return;}
   music=player;music.setVolume(.35);root.dataset.musicStatus='ready';delete root.dataset.musicReasons;musicStatus.textContent='BGM 연결됨 · 출력 설정은 수동 선택';music.sync({timeUs:Math.min(Math.floor(positionUs),music.plan.durationUs),playing});
  }catch(error){if(own===musicGeneration&&error.name!=='AbortError'){root.dataset.musicStatus='unavailable';root.dataset.musicReasons=error.message;musicStatus.textContent='이 곡을 재생하지 못했습니다';}}finally{if(own===musicGeneration)musicPending=null;}})();musicPending=pending;return pending;
 };
 for(const control of [musicToggle,musicBank,musicMixer])control.addEventListener('change',()=>{clearMusic();root.dataset.musicStatus=musicToggle.checked?'preparing':'off';if(control!==musicToggle){if(control===musicBank)musicMixer.value='0';clearEffects();clearSoundBus();if(effectToggle.checked){void update();return;}}if(musicToggle.checked){void audio.resumeFromGesture();void prepareMusic();}else musicStatus.textContent='BGM 꺼짐';});
 const audio=createBattleWebAudioTransport({onState:state=>{root.dataset.audioPlayback=state.status;root.dataset.audioContext=state.contextState;root.dataset.audioVoices=String(state.activeVoices);voiceToggle.checked=!state.muted;voiceToggle.title=state.blocked?'눌러서 전투 음성 재생':state.muted?'전투 음성 켜기':'전투 음성 끄기';voiceStatus.textContent=state.blocked?'음성을 누르면 소리가 재생됩니다.':state.reason?'이 브라우저에서 음성을 재생하지 못했습니다.':state.available?(state.muted?'전투 음성 꺼짐':'디스크 전투 음성 연결됨'):'';}});
 const unlockAudio=event=>{if(event.isTrusted&&event.target!==voiceToggle&&!event.target.closest?.('.bp-play')&&(!audio.state.muted||effectToggle.checked||musicToggle.checked)&&audio.state.contextState!=='running')void prepareGestureAudio();};root.addEventListener('click',unlockAudio,true);root.addEventListener('keydown',unlockAudio,true);root.addEventListener('input',unlockAudio,true);
 voiceToggle.addEventListener('change',()=>{audio.setMuted(!voiceToggle.checked);if(voiceToggle.checked)void prepareGestureAudio();});
 const dialogueStatus=d.createElement('p');dialogueStatus.className='bp-dialogue-status';dialogueStatus.textContent='파일럿을 선택하면 대사를 함께 재생합니다.';q('.bp-inspector').append(dialogueStatus);
 const combatSummary=d.createElement('div');combatSummary.className='bp-combat-summary';q('.bp-inspector').insertBefore(combatSummary,q('.bp-link-head'));const tallPlayer=d.defaultView.matchMedia('(max-width:760px) and (min-height:700px)');const mountSummary=()=>{if(tallPlayer.matches)q('.bp-main').insertBefore(combatSummary,q('.bp-viewer'));else q('.bp-inspector').insertBefore(combatSummary,q('.bp-link-head'));};tallPlayer.addEventListener('change',mountSummary);mountSummary();
 const dialogueTrack=d.createElement('div');dialogueTrack.className='bp-track';const dialogueTrackName=d.createElement('span');dialogueTrackName.textContent='전투 대사';const dialogueLane=d.createElement('div');dialogueLane.className='bp-track-lane';dialogueTrack.append(dialogueTrackName,dialogueLane);q('.bp-timeline').append(dialogueTrack);
 const emptyOverlay=[],cueObjects=new WeakMap();let dialogueTimeline=null,dialogueEvents=[],activeDialogue=null;
 const pilotSelection=select=>{const [pilotIndex,...linkedPilotIds]=select.value.split('+').map(Number);return {pilotIndex:pilotIndex||null,linkedPilotIds};};
 const readScene=typeof readSceneSource==='function'?async (request,{usageProbe=false}={})=>{
  const attackPilot=pilotSelection(attackerPilot),targetPilot=pilotSelection(defenderPilot);
  await fillDialogueChoices({signal:request.signal,pilotIndex:attackPilot.pilotIndex});
  if(request.signal.aborted)throw request.signal.reason;
  const result=await readSceneSource({...request,attackerPilotIndex:attackPilot.pilotIndex,defenderPilotIndex:targetPilot.pilotIndex,
   ...(dialogueChoice.value!==''?{previewDialogueKey:Number(dialogueChoice.value)}:{}),
   attackerLinkedPilotIds:attackPilot.linkedPilotIds,defenderLinkedPilotIds:targetPilot.linkedPilotIds,
   dialogueDisplay:!usageProbe&&dialogueToggle.checked&&attackerPilot.value&&defenderPilot.value?'on':'off',
   effectSoundDisplay:!usageProbe&&effectToggle.checked?'on':'off',effectSoundProfile:{bankIndex:Number(musicBank.value),mixerIndex:Number(musicMixer.value)},voiceDisplay:!usageProbe&&attackerPilot.value&&defenderPilot.value?'on':'off',
   unlinkedPreview:current?.ownership==='unowned',combat:usageProbe?{...simulation.read(),defense:request.mode==='defense'?'guard':'none',...(request.mode==='destroyed'?{defenderHp:1}:mode==='destroyed'&&hpBeforeDestroyed!==null&&simulation.read().defenderHp===1?{defenderHp:hpBeforeDestroyed}:{})}:simulation.read(),combatRows:getCombatRows({...request,attackerPilotIndex:attackPilot.pilotIndex,defenderPilotIndex:targetPilot.pilotIndex}),dialogueSeed:simulation.read().dialogueSeed});
  if(result.dialogueWire)result.dialogueTimeline=importBattleWebDialogueTimeline(result.dialogueWire);
  if(result.audioWire)result.audioScene=importBattleWebAudioScene(result.audioWire);
  return result;
 }:null;
 let windowPicture=null,webHud=null,hudCues=[],hudIndicatorCues=[],hudInitial=null,lastHudObjects=null,lastDialogueObjects=null;
 const syncDialogue=(atUs,loop)=>{
  const event=dialogueTimeline?readBattleWebDialogueAtUs(dialogueTimeline,atUs,{loop}):null;
  let objects=emptyOverlay;
  if(event&&windowPicture){objects=cueObjects.get(event);if(!objects){objects=createBattleWebDialogueObjects(event,{windowPicture,windowLayout:{x:0,y:160,width:320,height:64},ownedWindow:true});cueObjects.set(event,objects);}}
  let values=hudInitial;for(const cue of hudCues){if(cue.atUs>atUs)break;values=cue;}
  let indicator;for(const cue of hudIndicatorCues){if(cue.atUs>atUs)break;indicator=cue;}
  const hudObjects=webHud&&values?webHud.render(values,indicator):emptyOverlay;
  if(objects===lastDialogueObjects&&hudObjects===lastHudObjects)return;activeDialogue=event;lastDialogueObjects=objects;lastHudObjects=hudObjects;
  pixi?.setOverlay([...hudObjects,...objects]);dialogue.hidden=!event;dialogueName.textContent=event?.speakerName??'';dialogueText.textContent=event?.accessibleText??(event?'디스크 원문 대사':'');
  q('.bp-stage-note').hidden=Boolean(event);
 };
 let effectPreviewWeapon=null,sourcePreviewMode=false;
 let current=null,mode='attack',generation=0,controller=null,timeline=null,playing=false,positionUs=0,lastStamp=null,raf=null,sourceTick=null,sceneBackgrounds=[],windowStartUs=0;
 const simulation=createBattleSimulationUI({root,getActors:()=>({attacker:{unit:getUnits().find(row=>row.recordIndex===Number(attacker.value)),pilot:getPilots().find(row=>row.recordIndex===pilotSelection(attackerPilot).pilotIndex)},defender:{unit:getUnits().find(row=>row.recordIndex===Number(defender.value)),pilot:getPilots().find(row=>row.recordIndex===pilotSelection(defenderPilot).pilotIndex)}}),onApply:()=>void update()});
 const narrowMusic=d.defaultView.matchMedia('(max-width:760px)');const mountMusic=()=>{if(narrowMusic.matches)q('.bp-conditions').append(musicPanel);else q('.bp-inspector').insertBefore(musicPanel,q('.bp-summary'));};narrowMusic.addEventListener('change',mountMusic);mountMusic();
 const volumeLabel=d.createElement('label'),volume=d.createElement('input');volumeLabel.className='bp-voice-volume';volumeLabel.append(d.createTextNode('음성 음량'),volume);volume.type='range';volume.min=0;volume.max=100;volume.step=1;volume.value=80;volume.setAttribute('aria-label','전투 음성 음량');audio.setVolume(.8);volume.addEventListener('input',()=>audio.setVolume(Number(volume.value)/100));q('.bp-conditions-form').insertBefore(volumeLabel,q('.bp-conditions-note'));
 const actorPanel=d.createElement('section');actorPanel.className='bp-actors-panel';actorPanel.hidden=true;actorPanel.setAttribute('role','dialog');actorPanel.setAttribute('aria-label','기체와 파일럿 선택');
 const actorHead=d.createElement('header'),actorTitle=d.createElement('strong'),actorClose=d.createElement('button'),actorToggle=d.createElement('button');actorTitle.textContent='기체 · 파일럿';actorClose.textContent='×';actorClose.setAttribute('aria-label','기체 선택 닫기');actorHead.append(actorTitle,actorClose);actorPanel.append(actorHead);root.append(actorPanel);
 actorToggle.className='bp-actors-toggle';actorToggle.textContent='기체·인물';actorToggle.setAttribute('aria-expanded','false');q('.bp-outcomes').append(actorToggle);
 const casting=q('.bp-casting'),compact=winMatch(),hideActors=()=>{actorPanel.hidden=true;actorToggle.setAttribute('aria-expanded','false');actorToggle.focus();};
 function winMatch(){return d.defaultView.matchMedia('(max-width:760px) and (max-height:699px)');}
 const mountActors=()=>{if(compact.matches){actorPanel.append(casting,pilotCasting);}else{q('.bp-main').insertBefore(casting,q('.bp-viewer'));q('.bp-main').insertBefore(pilotCasting,q('.bp-viewer'));actorPanel.hidden=true;actorToggle.setAttribute('aria-expanded','false');}};
 actorToggle.addEventListener('click',()=>{actorPanel.hidden=!actorPanel.hidden;actorToggle.setAttribute('aria-expanded',String(!actorPanel.hidden));if(!actorPanel.hidden)attacker.focus();});actorClose.addEventListener('click',hideActors);
 actorPanel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();hideActors();}if(event.key==='Tab'){const nodes=[actorClose,attacker,defender,terrain,attackerPilot,defenderPilot,dialogueApply,dialogueChoice].filter(n=>!n.disabled&&n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&d.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&d.activeElement===last){event.preventDefault();first.focus();}}});compact.addEventListener('change',mountActors);mountActors();
 const win=d.defaultView,play=q('.bp-play'),steps=[...root.querySelectorAll('.bp-step')];
 const zoom=q('.bp-timeline-head input');
 let selectedRange=null,rangeLoop=false;
 const rangeToggle=d.createElement('button');rangeToggle.type='button';rangeToggle.className='bp-range-loop';rangeToggle.textContent='구간 반복';rangeToggle.disabled=true;rangeToggle.setAttribute('aria-pressed','false');rangeToggle.title='타임라인에서 구간을 고른 뒤 그 구간만 반복합니다. 연출 편집값은 바꾸지 않습니다.';q('.bp-timeline-head').insertBefore(rangeToggle,q('.bp-timeline-head label'));
 const clearRange=()=>{selectedRange=null;rangeLoop=false;rangeToggle.disabled=true;rangeToggle.setAttribute('aria-pressed','false');rangeToggle.setAttribute('aria-label','선택한 타임라인 구간 반복');};
 clearRange();
 const seek=d.createElement('input');seek.type='range';seek.min=0;seek.max=1;seek.value=0;seek.step=1;seek.className='bp-seek';seek.setAttribute('aria-label','전투 재생 위치');q('.bp-ruler').append(seek);
 const stop=()=>{audio.stop();effects?.pause();music?.pause();soundBus?.setPlaying(false);playing=false;lastStamp=null;if(raf!==null)win.cancelAnimationFrame(raf);raf=null;play.textContent='▶';play.setAttribute('aria-label','재생');};
 const suspendPlayback=()=>{stop();seek.disabled=true;zoom.disabled=true;play.disabled=true;steps.forEach(b=>b.disabled=true);};
 const drawTimeline=()=>{if(!timeline)return;if(playing&&rangeLoop&&selectedRange)positionUs=loopBattlePreviewRange(positionUs,selectedRange);const loop=q('.bp-loop').getAttribute('aria-pressed')==='true';syncDialogue(loop?positionUs%timeline.durationUs:Math.min(positionUs,timeline.durationUs-1),loop);const frame=paintBattleWebTimeline(canvas,timeline,positionUs,{loop,renderer:pixi});positionUs=frame.atUs;if(soundBus){if(lastSoundTimeUs!==null&&(positionUs<lastSoundTimeUs||Math.abs(positionUs-lastSoundTimeUs)>32000))soundBus.reset();soundBus.setPlaying(playing);root.dataset.sharedEffectRoutes=String(soundBus.state.routes);lastSoundTimeUs=positionUs;}audio.sync({atUs:Math.floor(positionUs),playing,loop,rate:1});if(effectToggle.checked)effects?.sync({atUs:Math.floor(positionUs),playing,rate:1});if(musicToggle.checked)music?.sync({timeUs:Math.min(Math.floor(positionUs),music.plan.durationUs),playing});
  const visibleUs=timeline.durationUs/Number(zoom.value);
  if(positionUs<windowStartUs||positionUs>=windowStartUs+visibleUs){windowStartUs=Math.min(timeline.durationUs-visibleUs,Math.floor(positionUs/visibleUs)*visibleUs);renderActivity();}
  seek.value=positionUs;root.style.setProperty('--bp-progress',((positionUs-windowStartUs)/visibleUs*100)+'%');q('.bp-time').textContent=(positionUs/1000000).toFixed(2)+' / '+(timeline.durationUs/1000000).toFixed(2)+'초';if(frame.ended)stop();};
 const animate=stamp=>{if(!playing)return;if(lastStamp!==null)positionUs+=(stamp-lastStamp)*1000;lastStamp=stamp;drawTimeline();if(playing)raf=win.requestAnimationFrame(animate);};
 const resetPlayback=()=>{clearRange();clearMusic();clearEffects();clearSoundBus();for(const lane of root.querySelectorAll('.bp-track-lane'))lane.replaceChildren();for(const mark of root.querySelectorAll('.bp-ruler>span'))mark.textContent='—';stop();timeline=null;dialogueTimeline=null;dialogueEvents=[];activeDialogue=null;windowPicture=null;webHud=null;hudCues=[];hudIndicatorCues=[];hudInitial=null;lastHudObjects=lastDialogueObjects=null;pixi?.setOverlay(emptyOverlay);dialogue.hidden=true;dialogueName.textContent='';dialogueText.textContent='';q('.bp-stage-note').hidden=false;sourceTick=null;sceneBackgrounds=[];positionUs=0;windowStartUs=0;q('.bp-time').textContent='— / —초';root.style.setProperty('--bp-progress','0%');seek.disabled=true;zoom.disabled=true;play.disabled=true;steps.forEach(b=>b.disabled=true);};
 const enableTransport=()=>{if(!timeline)return;seek.disabled=false;zoom.disabled=false;play.disabled=false;steps.forEach((b,index)=>{b.disabled=false;b.setAttribute('aria-label',index?'다음 프레임':'이전 프레임');});};
 const startPlayback=()=>{if(!timeline||root.dataset.loading==='true')return;if(rangeLoop&&selectedRange&&(positionUs<selectedRange.fromUs||positionUs>=selectedRange.toUs))positionUs=selectedRange.fromUs;else if(positionUs>=timeline.durationUs-1)positionUs=0;playing=true;lastStamp=null;play.textContent='Ⅱ';play.setAttribute('aria-label','일시정지');raf=win.requestAnimationFrame(animate);};
 let audioUnlockPending=null;
 const noteAudioReadiness=state=>{if(state.status==='unavailable'){audio.setMuted(true);voiceStatus.textContent='음성을 준비하지 못했습니다. 음성 버튼으로 다시 시도하세요.';}};
 const prepareGestureAudio=({start=false}={})=>{if(audioUnlockPending)return audioUnlockPending;if(root.dataset.loading==='true'){void audio.resumeFromGesture();return Promise.resolve();}const own=generation,signal=controller?.signal,resume=start||playing;stop();if(timeline){suspendPlayback();setLoading(true,'음성 준비 중');root.setAttribute('aria-busy','true');}const pending=audio.preparePlayback({signal,waitForResume:true});void audio.resumeFromGesture();audioUnlockPending=(async()=>{try{const ready=await pending;await prepareEffects();await prepareMusic();if(own!==generation||container.hidden)return;noteAudioReadiness(ready);if(timeline){drawTimeline();await afterFirstPaint(signal);if(own!==generation||container.hidden)return;setLoading(false);root.removeAttribute('aria-busy');enableTransport();if(resume)startPlayback();}}catch(error){if(own===generation&&!container.hidden){if(error.name!=='AbortError')audio.setMuted(true);setLoading(false);root.removeAttribute('aria-busy');enableTransport();}}finally{audioUnlockPending=null;}})();return audioUnlockPending;};
 play.addEventListener('click',event=>{if(!timeline||root.dataset.loading==='true')return;if(playing){stop();return;}if(event.isTrusted&&(!audio.state.muted||effectToggle.checked||musicToggle.checked)&&audio.state.contextState!=='running'){void prepareGestureAudio({start:true});return;}startPlayback();});
 seek.addEventListener('input',()=>{stop();positionUs=Number(seek.value);drawTimeline();});
 steps.forEach((button,index)=>button.addEventListener('click',()=>{if(!timeline){if(sourceTick!==null)void stepSource(index?sourceTick+1:Math.max(0,sourceTick-1));return;}stop();const times=timeline.presentationTimesUs;positionUs=index?times.find(t=>t>positionUs)??times.at(-1):[...times].reverse().find(t=>t<positionUs)??0;drawTimeline();}));
 resetPlayback();
 const name=r=>r.name??r.label??`#${r.recordIndex}`;
 const units=()=>getUnits().map(r=>({...r,label:name(r),id:r.recordIndex??r.unitIndex}));
 const options=(select,rows)=>{select.replaceChildren(...rows.map(row=>{const o=d.createElement('option');o.value=row.id;o.textContent=row.label;return o;}));};
 const ensurePixi=async()=>{
  if(pixi)return pixi;if(pixiPending)return pixiPending;
  pixiPending=(async()=>{
  const {createBattlePixiRenderer}=await import('./editor-battle-pixi.mjs');
  const replacement=d.createElement('canvas');replacement.width=320;replacement.height=224;
  const renderer=await createBattlePixiRenderer(replacement);
  if(container.hidden){renderer.destroy();return null;}
  canvas.replaceWith(replacement);canvas=replacement;pixi=renderer;canvas.dataset.renderer='pixi-webgl';return pixi;
  })();try{return await pixiPending;}finally{pixiPending=null;}
 };
 const renderActivity=()=>{
  const labels=['기체 동작','무기 효과','대상 동작','전투 대사'];
  const lanes=[...root.querySelectorAll('.bp-track-lane')];
  const seconds=us=>(us/1000000).toFixed(2)+'초';
  const visibleUs=timeline.durationUs/Number(zoom.value),windowEndUs=windowStartUs+visibleUs;
  seek.min=Math.ceil(windowStartUs);seek.max=Math.min(timeline.durationUs-1,Math.floor(windowEndUs));
  [...root.querySelectorAll('.bp-ruler>span')].forEach((span,index)=>{span.textContent=((windowStartUs+visibleUs*index/4)/1000000).toFixed(1)+'초';});
  for(let index=0;index<lanes.length;index++){
   const lane=lanes[index],track=index===3?{role:'dialogue',segments:dialogueEvents.map(event=>({...event,keyTimesUs:[event.fromUs]}))}:timeline.activity[index],fragment=d.createDocumentFragment();
   for(const segment of track.segments){
    const fromUs=Math.max(segment.fromUs,windowStartUs),toUs=Math.min(segment.toUs,windowEndUs);
    if(fromUs>=toUs)continue;
    const block=d.createElement('button');block.className='bp-track-clip';block.dataset.role=track.role;
    block.style.left=((fromUs-windowStartUs)/visibleUs*100)+'%';block.style.width=((toUs-fromUs)/visibleUs*100)+'%';
    block.textContent=segment.speakerName??labels[index];block.title=(segment.speakerName?segment.speakerName+' · ':'')+labels[index]+' · '+seconds(segment.fromUs)+'–'+seconds(segment.toUs);
    block.setAttribute('aria-label',labels[index]+' '+seconds(segment.fromUs)+'부터 '+seconds(segment.toUs)+' 구간으로 이동');
    const rangeKey=track.role+':'+segment.fromUs+':'+segment.toUs;block.dataset.rangeKey=rangeKey;block.setAttribute('aria-pressed',String(selectedRange?.key===rangeKey));
    block.addEventListener('click',()=>{if(play.disabled)return;stop();rangeLoop=false;rangeToggle.setAttribute('aria-pressed','false');selectedRange={key:rangeKey,fromUs:segment.fromUs,toUs:segment.toUs};rangeToggle.disabled=false;rangeToggle.setAttribute('aria-label',labels[index]+' '+seconds(segment.fromUs)+'부터 '+seconds(segment.toUs)+' 구간 반복');for(const peer of root.querySelectorAll('.bp-track-clip'))peer.setAttribute('aria-pressed',String(peer.dataset.rangeKey===rangeKey));positionUs=segment.fromUs;drawTimeline();});fragment.append(block);
    for(const atUs of segment.keyTimesUs){if(atUs<windowStartUs||atUs>windowEndUs)continue;const marker=d.createElement('i');marker.className='bp-keyframe';marker.style.left=((atUs-windowStartUs)/visibleUs*100)+'%';marker.setAttribute('aria-hidden','true');fragment.append(marker);}
   }
   lane.replaceChildren(fragment);
  }
 };
 const placementCache=new WeakMap();
 const paint=(images=[],backgrounds=[])=>{pixi?pixi.render(compileBattleWebSceneFrame(createBattlePlacementFrame({images,backgrounds}))):paintBattleSceneCommandFrame(canvas,{...createBattlePlacementFrame({images,backgrounds}),pictureCanvasCache:placementCache});q('.bp-empty').hidden=images.some(i=>i?.pixels);};
 const stepSource=async tick=>{
  if(typeof readSceneFrame!=='function'||!current)return;
  const own=generation;steps.forEach(button=>button.disabled=true);
  try{
   const result=await readSceneFrame({weaponIndex:current.recordIndex,unitIndex:Number(attacker.value),opponentUnitIndex:Number(defender.value),terrainIndex:Number(terrain.value),mode,sceneTick:tick,signal:controller.signal});
   if(own!==generation)return;
   if(result.status!=='ready'||!result.frameWire){q('.bp-status').textContent='다음 단계 미지원';steps[0].disabled=sourceTick===null||sourceTick===0;return;}
   const frame=result.frameWire,background=frame.backgroundsPrepared?{assets:new Map(),backgroundLayers:[]}:
    createBattlePlacementFrame({backgrounds:result.backgrounds??sceneBackgrounds,
     backgroundVisibility:frame.backgroundVisibility});
   const renderer=await ensurePixi();if(own!==generation)return;
   const scene=compileBattleWebSceneFrame({...frame,assets:new Map([...background.assets,...frame.assets.map(image=>[image.assetKey,image])]),backgroundLayers:[...background.backgroundLayers,...(frame.backgroundLayers??[])]});
   const painted=renderer.render(scene);
   if(painted.status!=='ready'){q('.bp-status').textContent='프레임 표시 연결 중';return;}
   sourceTick=result.sceneTick;q('.bp-empty').hidden=true;q('.bp-time').textContent='단계 '+sourceTick;
   q('.bp-stage-note').textContent='자동재생 미지원 · 단계별 확인';q('.bp-status').textContent='단계별 미리보기';
   steps[0].disabled=sourceTick===0;steps[1].disabled=sourceTick>=4095;
   steps[0].setAttribute('aria-label','이전 연출 단계');steps[1].setAttribute('aria-label','다음 연출 단계');
  }catch(error){if(own===generation&&error.name!=='AbortError'){root.dataset.previewError=error.message;q('.bp-status').textContent='연출을 불러오지 못했습니다';steps[0].disabled=sourceTick===null||sourceTick===0;}}
 };
 const effectOutcomeButton=d.createElement('button'),effectOutcomeNote=d.createElement('p');
 effectOutcomeButton.type='button';effectOutcomeButton.textContent='효과 확인';effectOutcomeButton.setAttribute('aria-label','효과 사용 결과 확인');effectOutcomeButton.hidden=true;
 effectOutcomeNote.className='bp-effect-outcomes';effectOutcomeNote.setAttribute('role','status');effectOutcomeNote.hidden=true;
 q('.bp-outcomes').append(effectOutcomeButton);q('.bp-main').append(effectOutcomeNote);let currentEffectResult=null;
 effectOutcomeButton.addEventListener('click',async()=>{
  if(!currentEffectResult||!readScene||effectOutcomeButton.disabled)return;
  const own=generation,signal=controller.signal;effectOutcomeButton.disabled=true;effectOutcomeNote.hidden=false;effectOutcomeNote.textContent='명중·회피·방어·격추의 연결 효과를 확인합니다.';
  try{
   const rows=await inspectEffectOutcomes(next=>readScene({weaponIndex:current.recordIndex,unitIndex:Number(attacker.value),opponentUnitIndex:Number(defender.value),terrainIndex:Number(terrain.value),mode:next,signal},{usageProbe:true}),{currentMode:mode,currentResult:currentEffectResult,signal});
   if(own!==generation||container.hidden)return;effectOutcomeNote.textContent=effectOutcomesLabel(rows);
  }catch(error){if(own===generation&&error.name!=='AbortError')effectOutcomeNote.textContent='효과 사용 결과를 확인하지 못했습니다.';}
  finally{if(own===generation)effectOutcomeButton.disabled=false;}
 });
 const update=async()=>{
  currentEffectResult=null;effectOutcomeButton.hidden=true;effectOutcomeNote.hidden=true;
  const own=++generation;controller?.abort();controller=new AbortController();suspendPlayback();setLoading(true,'전투 자료 준비 중');root.setAttribute('aria-busy','true');q('.bp-status').textContent='새 연출 준비 중';q('.bp-status').removeAttribute('title');q('.bp-link-state>div').firstChild.textContent='디스크 연출 준비 중';delete root.dataset.previewError;delete root.dataset.previewStatus;delete root.dataset.previewReason;delete root.dataset.battlefieldState;delete root.dataset.effectImportUsage;
  q('.bp-attacker-label').textContent=attacker.selectedOptions[0]?.textContent??'사용 기체 없음';q('.bp-defender-label').textContent=defender.selectedOptions[0]?.textContent??'공격 대상 없음';
  if(!readScene||!current||!attacker.value||!defender.value){root.removeAttribute('aria-busy');setLoading(false);return;}
  terrain.removeAttribute('aria-invalid');
  q('.bp-empty').textContent='기체 그림 불러오는 중';
  try{const result=await readScene({weaponIndex:current.recordIndex,unitIndex:Number(attacker.value),opponentUnitIndex:Number(defender.value),terrainIndex:Number(terrain.value),mode,signal:controller.signal});if(own!==generation)return;if(result.timelineWire)result.timeline=await importBattleWebTimeline(result.timelineWire,{signal:controller.signal});if(own!==generation)return;if(result.timeline?.status==='ready'){setLoading(true,'화면 준비 중');await ensurePixi();}if(own===generation){
   // Keep the displayed frame and lanes while awaiting source data/GPU setup.
   // Reset and publish the new HUD, timeline and first frame in one task.
   const actor=getUnits().find(row=>row.recordIndex===Number(attacker.value)),target=getUnits().find(row=>row.recordIndex===Number(defender.value)),condition=simulation.read();
   const hudAttacker={maxHp:result.combat?.attacker?.maxHp??actor?.hp,maxEn:result.combat?.attacker?.maxEn??actor?.en},hudDefender={maxHp:result.combat?.defender?.maxHp??target?.hp,maxEn:result.combat?.defender?.maxEn??target?.en},hudFits=[hudAttacker,hudDefender].every(row=>row.maxHp>0&&row.maxHp<=65535&&row.maxEn>=0&&row.maxEn<=999);
   const nextHud=result.hudWindow?.picture&&result.hudGlyphs&&hudFits?createBattleWebHud({picture:result.hudWindow.picture,glyphs:result.hudGlyphs,attacker:hudAttacker,defender:hudDefender}):null;
   pixi?.reset();resetPlayback();audio.clear();effectPrepared=result.effectSoundPrepared??null;if(effectPrepared?.effectMixerCount)populateMusicMixers(effectPrepared.effectMixerCount);root.dataset.effectSoundStatus=result.effectSoundStatus??'off';root.dataset.effectSoundPhaseProfile=effectPrepared?.phaseProfile??'source-context';root.dataset.effectSoundFileBank=String(result.effectSoundTrace?.fileBankSelection?.bankIndex??'');root.dataset.effectSoundObserved=String(result.effectSoundTrace?.observedEvents??0);root.dataset.effectSoundCaptured=String(result.effectSoundTrace?.capturedEvents??0);root.dataset.effectSoundStarts=String(result.effectSoundTrace?.primarySoundStarts??0);root.dataset.effectSoundStops=String(result.effectSoundTrace?.primarySoundStops??0);root.dataset.effectSoundReasons=[...new Set((result.effectSoundPrepared?.unresolved??[]).map(e=>e.reason))].join(',');root.dataset.effectSoundBanks=[...new Set((result.effectSoundPrepared?.unresolved??[]).filter(e=>e.sequenceBank!==undefined).map(e=>e.sequenceBank))].join(',');effectStatus.textContent=effectToggle.checked&&result.effectSoundStatus==='partial'?`효과음 ${result.effectSoundPrepared?.unresolved?.length??0}개 미지원`:'';if(result.audioScene&&result.timeline?.status==='ready')audio.setScene(result.audioScene);root.dataset.audioStatus=result.audioStatus??'off';if(result.audioReason)root.dataset.audioReason=result.audioReason;else delete root.dataset.audioReason;root.dataset.displayedWeapon=String(current.recordIndex);
   currentEffectResult=result;effectOutcomeButton.hidden=!result.effectImportUsage?.requested?.length;effectOutcomeButton.disabled=false;
   simulation.result(result.combat);root.dataset.combatReason=result.combat?.reason??'';root.dataset.destructionStatus=result.destructionPresentation?.requested?(result.destructionPresentation.completed?'ready':'partial'):'off';root.dataset.deathType=String(result.destructionPresentation?.deathType??'');
   root.dataset.hudStatus=hudFits?'ready':'numeric-range-unsupported';
   if(nextHud){webHud=nextHud;hudCues=result.hudCues??[];hudIndicatorCues=result.hudIndicatorCues??[];hudInitial={attackerHp:result.combat?.attacker?.hpBefore??condition.attackerHp,attackerEn:result.combat?.attacker?.enBefore??condition.attackerEn,defenderHp:result.combat?.defender?.hpBefore??condition.defenderHp,defenderEn:result.combat?.defender?.enBefore??condition.defenderEn};}
   q('.bp-stage-labels').hidden=Boolean(webHud);
   combatSummary.replaceChildren();
   if(result.combat?.status==='ready'){const amount=d.createElement('strong'),note=d.createElement('small');amount.textContent=result.combat.damage.toLocaleString();combatSummary.append(d.createTextNode('예상 피해 '),amount);note.textContent=[result.combat.critical?'크리티컬':'',({'hot-blood':'열혈',soul:'혼',miracle:'기적'})[result.combat.spirit]??'',result.combat.defense!=='none'?({'guard':'방어',shield:'실드',parry:'베어내기',afterimage:'분신','beam-coat':'빔 코트','i-field':'I 필드',aura:'오라 배리어','at-field':'AT 필드'})[result.combat.defense]:''].filter(Boolean).join(' · ')||'일반 공격';combatSummary.append(note);if(result.combat.breakdown?.auraBonusBeforeCap>0){const bonus=d.createElement('small');bonus.className='bp-aura-bonus';bonus.textContent=`성전사 +${result.combat.breakdown.auraPowerDifference.toLocaleString()} · 공격력 ${result.combat.breakdown.effectiveWeaponPower.toLocaleString()}`;combatSummary.append(bonus);}const scope=d.createElement('small');scope.textContent=battleCombatTerrainHint(result.combat)??(result.combat.defenseEligibility===false?'장착·습득 조건과 별개로 발동 성공을 재현':'개조·인접 보정 제외 · 반격 없음');combatSummary.append(scope);}
   else combatSummary.textContent=battleCombatReasonLabel(result.combat?.reason);
   if(!hudFits){const numericNote=d.createElement('small');numericNote.textContent='원본 EN 표시 범위는 0–999입니다.';combatSummary.append(numericNote);}
   root.dataset.lightCorrection=String(result.lightPresentation?.applied??false);
   root.dataset.hudIndicatorStatus=hudIndicatorCues.length?'ready':'unavailable';
   root.dataset.hudEnergyStatus=result.hudEnergyPresentation?.status??'unavailable';
   if(result.hudEnergyPresentation?.status==='partial'){const energyNote=d.createElement('small');energyNote.className='bp-energy-note';energyNote.textContent='EN 차감 표시 미완료';energyNote.title='계산·편집값은 반영됐지만 이 연출의 EN 차감 시점은 아직 연결되지 않았습니다.';combatSummary.append(energyNote);}
   dialogueTimeline=result.dialogueTimeline??null;windowPicture=result.dialogueWindow?.picture??null;dialogueEvents=result.dialogueWire?.events??[];root.dataset.dialogueStatus=result.dialogueStatus??(dialogueTimeline?'ready':'off');dialogueStatus.textContent=dialogueTimeline?'전투 대사 '+dialogueEvents.length+'개 · 남은 HP '+(result.combat?.hpRemainingPercent??100)+'%' :result.dialogueStatus==='partial'?'이 조합의 대사 선택 조건은 아직 지원하지 않습니다.':dialogueToggle.checked?'사용·상대 파일럿을 선택하면 대사를 함께 재생합니다.':'전투 대사 표시 꺼짐';sceneBackgrounds=result.backgrounds??[];if(result.timeline?.status==='ready'){timeline=result.timeline;renderActivity();q('.bp-empty').hidden=true;play.removeAttribute('title');q('.bp-timeline-head>span').textContent=timeline.frameCount+'개 프레임';q('.bp-stage-note').textContent=result.weaponMotion?.motionStatus==='template'?'공용 기본 연출 · 전용 무기 모션은 연결되지 않음':result.combat?.reason==='combat-pilot-selection-required'?'기체·인물에서 파일럿을 선택하면 피해를 계산합니다':result.combat?.status==='partial'?battleCombatReasonLabel(result.combat.reason):current.ownership==='unowned'?'기체 연결 없는 자료 · 연출 공유 기체로 미리보기':result.dialogueStatus==='partial'?'이 조합의 대사는 아직 지원하지 않습니다':'디스크 자료 기반 전투 연출';q('.bp-link-state>div').firstChild.textContent='웹 전투 연출';drawTimeline();await afterFirstPaint(controller.signal);if(own!==generation||container.hidden)return;setLoading(true,'음성 준비 중');const soundReady=await audio.preparePlayback({signal:controller.signal});if(own!==generation||container.hidden)return;noteAudioReadiness(soundReady);await prepareEffects();await prepareMusic();if(own!==generation||container.hidden)return;setLoading(false);root.removeAttribute('aria-busy');q('.bp-status').textContent='재생 준비됨';root.dataset.battlefieldState=result.battlefieldStatePresentation?.status??'none';if(result.battlefieldStatePresentation?.status==='deferred'){q('.bp-stage-note').textContent='전투 연출만 재생 · 맵 상태 변경 제외';q('.bp-status').textContent='연출만 재생';q('.bp-status').title='맵 상태 변경은 미리보기에서 제외됩니다.';}else q('.bp-status').removeAttribute('title');if(result.effectImportUsage?.uncalled?.length){root.dataset.effectImportUsage='uncalled';q('.bp-status').textContent=result.effectImportUsage.called?.length?'효과 일부 미사용':'연결 효과 미사용';const note=(result.effectImportUsage.called?.length?'연결한 효과 중 일부는 이 전투 결과에서 사용되지 않습니다.':'이 전투 결과에서는 연결한 효과가 사용되지 않습니다.')+' 회피·방어·격추 조건도 확인하세요.';q('.bp-status').title=[note,q('.bp-status').title].filter(Boolean).join(' ');q('.bp-stage-note').textContent='현재 전투 결과에서 연결 효과가 사용되지 않음';}else root.dataset.effectImportUsage=result.effectImportUsage?'called':'none';enableTransport();startPlayback();}else{
   paint(result.images,result.backgrounds);
   root.dataset.previewStatus=result.previewStatus??'unavailable';
   if(result.previewReason)root.dataset.previewReason=JSON.stringify(result.previewReason);
   q('.bp-timeline-head>span').textContent='자동재생 미지원';
   q('.bp-link-state>div').firstChild.textContent='단계별 미리보기';
   if(result.previewReason==='map-weapon-scene-not-implemented'){
    q('.bp-status').textContent='맵병기 연출 미지원';q('.bp-stage-note').textContent='이 무기의 맵 연출은 아직 연결되지 않았습니다';q('.bp-empty').hidden=false;q('.bp-empty').textContent='맵병기 · 일반 전투 연출 참조 없음';q('.bp-timeline-head>span').textContent='맵 연출 미지원';q('.bp-link-state>div').firstChild.textContent='맵병기';
   }else if(result.previewReason==='web-motion-pose-unavailable'){
    const side=result.previewMotionSide===0?attacker:result.previewMotionSide===1?defender:null;
    const unitName=side?.selectedOptions[0]?.textContent;
    const terrainName=terrain.selectedOptions[0]?.textContent??'선택한 지형';
    terrain.setAttribute('aria-invalid','true');
    q('.bp-status').textContent='지형 선택 필요';q('.bp-stage-note').textContent='위 지형에서 전투 장소를 변경할 수 있습니다';
    const empty=q('.bp-empty'),message=d.createElement('span');
    message.textContent=`${unitName??'선택한 기체'}는 ${terrainName}에서 이동할 수 없습니다.`;
    empty.replaceChildren(message);empty.hidden=false;
    const compatible=Array.isArray(result.previewCompatibleTerrains)?result.previewCompatibleTerrains:[];
    const choice=[...terrain.options].find(option=>compatible.includes(Number(option.value)));
    if(choice){
     const retry=d.createElement('button');retry.type='button';retry.className='bp-terrain-retry';
     retry.textContent=`${choice.textContent}에서 재생`;retry.title=retry.textContent;
     retry.addEventListener('click',()=>{if(own!==generation)return;terrain.value=choice.value;void update();});
     empty.append(retry);
    }else if(compatible.length===0&&result.previewCompatibleTerrains){
     message.textContent+=' 두 기체가 함께 이동할 수 있는 지형이 없습니다.';
    }
    q('.bp-timeline-head>span').textContent='선택한 지형에서 이동 불가';
   }else{await stepSource(0);if(own!==generation)return;const reasonLabel=battlePreviewReasonLabel(result.previewReason);if(reasonLabel){q('.bp-status').textContent='연출 일부 미지원';q('.bp-stage-note').textContent=reasonLabel;q('.bp-status').title=reasonLabel;}if(result.previewReason==='destruction-visual-phase-not-completed'){q('.bp-status').textContent='파괴 연출 미완료';q('.bp-stage-note').textContent='이 조합의 파괴 연출은 아직 연결되지 않았습니다';}}
  }}}
  catch(e){if(own===generation&&e.name!=='AbortError'){root.dataset.previewError=e.message;q('.bp-status').textContent='연출 불러오기 실패';setLoading(true,'연출을 불러오지 못했습니다');root.dataset.loadingError='true';loadingBar.hidden=true;if(!timeline){q('.bp-empty').hidden=false;q('.bp-empty').textContent='연출을 불러오지 못했습니다';}}}
  finally{if(own===generation){root.removeAttribute('aria-busy');if(root.dataset.loadingError!=='true')setLoading(false);}}
 };
 const select=id=>{
  editWeapon.disabled=true;
  dialogueCatalogOwner=null;
  current=getWeapons().find(r=>r.recordIndex===Number(id));if(!current){controller?.abort();generation++;suspendPlayback();root.removeAttribute('aria-busy');setLoading(false);q('.bp-status').textContent='미리볼 무기 없음';return;}
  q('.bp-kicker').textContent=sourcePreviewMode?'원본 연출 미리보기':effectPreviewWeapon===current.recordIndex?'효과 조합 미리보기':'BATTLE STUDIO';
  editWeapon.disabled=!current.editable||!current.owners?.length;editWeapon.title=editWeapon.disabled?'기체에 연결된 무기에서 연출 편집을 여세요.':`${name(current)} 연출 편집 열기`;
  q('.bp-weapon-name').textContent=name(current);mobile.value=current.recordIndex;
  for(const b of weapons.children){const active=Number(b.dataset.id)===current.recordIndex;b.setAttribute('aria-pressed',String(active));b.tabIndex=active?0:-1;}
  const all=units(),ids=[...new Set((current.owners??[]).map(o=>o.unit??o.unitIndex))],oldAttacker=attacker.value;
  const recommended=motionCatalog?.entries.find(row=>row.recordIndex===current.recordIndex)?.sharedOwnerUnits??[];
  options(attacker,ids.length?all.filter(u=>ids.includes(u.id)):[...all.filter(u=>recommended.includes(u.id)),...all.filter(u=>u.editable!==false&&!recommended.includes(u.id))]);
  if(!ids.length&&recommended.length)attacker.value=String(recommended[0]);else if([...attacker.options].some(option=>option.value===oldAttacker))attacker.value=oldAttacker;
  attacker.disabled=ids.length===1;
  const old=defender.value;options(defender,all);defender.value=all.some(u=>String(u.id)===old)?old:String(all.find(u=>/제간|ジェガン/.test(u.label))?.id??all[0]?.id??'');
  const pairs=[['공격력',current.power??current.attack??'—'],['사거리',`${current.minRange??'—'}–${current.maxRange??'—'}`],['EN',current.energy??current.en??current.enCost??'—'],['탄수',current.ammo||'—']];
  q('.bp-summary').replaceChildren(...pairs.map(([label,value])=>{const row=d.createElement('div'),a=d.createElement('span'),b=d.createElement('strong');a.textContent=label;b.textContent=value;row.append(a,b);return row;}));fillPilots();simulation.sync();simulation.suggest({attackerMorale:Math.max(100,Number(current.requiredMorale)||0)});void update();
 };
 // Native disc registration defaults; explicit user casting stays session-wide.
 const pilotUnits=new Map(),pilotChoices=new Map([[attackerPilot,new Map()],[defenderPilot,new Map()]]);
 const fillPilots=()=>{
  const rows=getPilots().filter(row=>Number.isInteger(row.recordIndex)&&row.recordIndex>1&&row.role!=='hero-list'&&row.name)
   .map(row=>({id:row.recordIndex,label:name(row)}));
  const show=rows.find(row=>row.id===126),cham=rows.find(row=>row.id===143),withCham=show&&cham;
  const choices=withCham?[...rows,{id:'126+143',label:`${show.label.split(/[\s　]+/)[0]} + ${cham.label.replace(/[\s　]+/g,' ').trim()}`}]:rows;
  for(const [select,unit]of [[attackerPilot,attacker],[defenderPilot,defender]]){
   const unitId=Number(unit.value),old=select.value,sameUnit=pilotUnits.get(select)===unitId;
   options(select,[{id:'',label:'파일럿 선택'},...choices]);
   const nativePilot=getPilotForUnit(unitId),systemPilot=withCham&&nativePilot===126&&[47,48].includes(unitId)?'126+143':nativePilot;
   const preferred=pilotChoices.get(select).get('explicit')??(sameUnit?old:null)??systemPilot??'';
   select.title='디스크의 등록·등장 정보로 기본 파일럿을 선택합니다. 여러 원본 배정이 있으면 대표값을 사용합니다. 직접 바꾸면 다른 무기를 골라도 유지됩니다. 세이브의 현재 탑승 상태는 읽지 않습니다.';
   select.value=preferred===''?'':choices.some(row=>String(row.id)===String(preferred))?String(preferred):'';
   select.disabled=!rows.length;pilotUnits.set(select,unitId);
  }
 };
 for(const [select,unit]of [[attackerPilot,attacker],[defenderPilot,defender]])select.addEventListener('change',()=>{pilotChoices.get(select).set('explicit',select.value);void update();});
 dialogueToggle.addEventListener('change',()=>{void update();});
 dialogueChoice.addEventListener('change',()=>{dialogueApply.disabled=dialogueChoice.value==='';void update();});
 dialogueApply.addEventListener('click',event=>{event.preventDefault();if(dialogueChoice.value===''||!current||typeof onApplyDialogue!=='function')return;if(onApplyDialogue(current.recordIndex,Number(dialogueChoice.value))===false)return;dialogueChoice.value='';dialogueApply.disabled=true;dialogueChoice.focus();void update();});
 let motionCatalog=null;const libraryScope=d.createElement('select');libraryScope.className='bp-library-scope';libraryScope.setAttribute('aria-label','무기 연결 범위');options(libraryScope,[{id:'linked',label:'기체 장착 무기'},{id:'unlinked',label:'연결 없는 무기'}]);q('.bp-library').insertBefore(libraryScope,q('.bp-search'));
 const refresh=(selectCurrent=true)=>{dialogueCatalogs.clear();dialogueCatalogOwner=null;const terrainRows=getTerrains().map(row=>({id:row.recordIndex,label:name(row)})),oldTerrain=terrain.value||'5';options(terrain,terrainRows.length?terrainRows:[{id:5,label:'기본 지형'}]);terrain.value=[...terrain.options].some(option=>option.value===oldTerrain)?oldTerrain:terrain.options[0].value;terrain.disabled=!terrainRows.length;const rows=getWeapons().filter(r=>libraryScope.value==='unlinked'?r.ownership==='unowned'&&r.nameStatus==='decoded':(r.owners??[]).length);q('.bp-library-count').textContent=rows.length;options(mobile,rows.map(r=>({id:r.recordIndex,label:name(r)})));weapons.replaceChildren(...rows.map(r=>{const b=d.createElement('button');b.dataset.id=r.recordIndex;b.textContent=name(r);const hint=d.createElement('small'),ids=[...new Set((r.owners??[]).map(o=>o.unit??o.unitIndex))],first=units().find(u=>u.id===ids[0]),entry=motionCatalog?.entries.find(e=>e.recordIndex===r.recordIndex);hint.textContent=first?first.label+(ids.length>1?` 외 ${ids.length-1}기`:''):entry?.previewEligible?'디스크 연출 있음':'전용 연출 확인 안 됨';if(libraryScope.value==='unlinked'&&!entry?.previewEligible)b.disabled=true;b.append(hint);b.addEventListener('click',()=>select(r.recordIndex));return b;}));for(const option of mobile.options){const row=rows.find(r=>r.recordIndex===Number(option.value));if(libraryScope.value==='unlinked'&&!motionCatalog?.entries.find(e=>e.recordIndex===row.recordIndex)?.previewEligible)option.disabled=true;}filterLibrary();if(selectCurrent)select(rows.some(r=>r.recordIndex===current?.recordIndex)?current.recordIndex:rows.find(r=>libraryScope.value!=='unlinked'||motionCatalog?.entries.find(e=>e.recordIndex===r.recordIndex)?.previewEligible)?.recordIndex);};
 libraryScope.addEventListener('change',async()=>{if(libraryScope.value==='unlinked'&&!motionCatalog&&readMotionCatalog){controller?.abort();const own=++generation;controller=new AbortController();suspendPlayback();setLoading(true,'연출 목록 준비 중');root.setAttribute('aria-busy','true');q('.bp-status').textContent='연결 없는 연출 조사 중';try{const catalog=await readMotionCatalog({signal:controller.signal});if(own!==generation)return;motionCatalog=catalog;}catch(error){if(own!==generation)return;root.removeAttribute('aria-busy');if(error.name!=='AbortError'){q('.bp-status').textContent='연출 목록 확인 실패';setLoading(true,'연출 목록을 불러오지 못했습니다');root.dataset.loadingError='true';loadingBar.hidden=true;}else setLoading(false);return;}}refresh();});
 const filterLibrary=()=>{for(const b of weapons.children)b.hidden=!matchesBattleLibrarySearch({id:b.dataset.id,text:b.textContent},q('.bp-search').value);};
 q('.bp-search').addEventListener('input',filterLibrary);
 attacker.addEventListener('change',()=>{dialogueCatalogOwner=null;fillPilots();simulation.sync();void update();});defender.addEventListener('change',()=>{fillPilots();simulation.sync();void update();});mobile.addEventListener('change',()=>select(mobile.value));
 terrain.addEventListener('change',update);
 let hpBeforeDestroyed=null;
 for(const b of root.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{const nextMode=b.dataset.mode;if(mode==='destroyed'&&nextMode!=='destroyed'&&hpBeforeDestroyed!==null){if(simulation.read().defenderHp===1)simulation.set({defenderHp:hpBeforeDestroyed});hpBeforeDestroyed=null;}if(mode!=='destroyed'&&nextMode==='destroyed')hpBeforeDestroyed=simulation.read().defenderHp;mode=nextMode;if(mode==='destroyed')simulation.set({defenderHp:1,defense:'none'});if(mode==='defense')simulation.set({defense:'guard'});if(mode==='attack'||mode==='hit'||mode==='evade')simulation.set({defense:'none'});for(const peer of root.querySelectorAll('[data-mode]'))peer.setAttribute('aria-pressed',String(peer===b));void update();});
 rangeToggle.addEventListener('click',()=>{if(!timeline||!selectedRange||play.disabled)return;rangeLoop=!rangeLoop;rangeToggle.setAttribute('aria-pressed',String(rangeLoop));if(rangeLoop){q('.bp-loop').setAttribute('aria-pressed','true');stop();positionUs=selectedRange.fromUs;drawTimeline();startPlayback();}});
 q('.bp-loop').addEventListener('click',()=>{const b=q('.bp-loop');b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));if(b.getAttribute('aria-pressed')==='false'){rangeLoop=false;rangeToggle.setAttribute('aria-pressed','false');}});
 zoom.addEventListener('input',()=>{if(!timeline)return;const visibleUs=timeline.durationUs/Number(zoom.value);windowStartUs=Math.max(0,Math.min(timeline.durationUs-visibleUs,positionUs-visibleUs/2));root.style.setProperty('--bp-zoom',zoom.value);renderActivity();drawTimeline();});
 const leave=callback=>{const id=current?.recordIndex;controller?.abort();generation++;root.removeAttribute('aria-busy');setLoading(false);resetPlayback();audio.clear();pixi?.reset();container.hidden=true;callback?.(id);};
 q('.bp-close').addEventListener('click',()=>leave(onClose));
 editWeapon.addEventListener('click',()=>{if(!editWeapon.disabled)leave(onEditWeapon);});
 root.addEventListener('keydown',e=>{if(e.key==='Escape')q('.bp-close').click();if(e.key==='Tab'&&container.classList.contains('bp-overlay')){const nodes=[...root.querySelectorAll('button:not(:disabled),select:not(:disabled),input')].filter(n=>n.tabIndex>=0&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&d.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first.focus();}}});
 refresh(!container.classList.contains('bp-overlay'));return {select,refresh,destroy(){controller?.abort();generation++;container.hidden=true;setLoading(false);root.removeAttribute('aria-busy');resetPlayback();audio.dispose();pixi?.destroy();tallPlayer.removeEventListener('change',mountSummary);compact.removeEventListener('change',mountActors);narrowMusic.removeEventListener('change',mountMusic);root.remove();},open(id,{sourcePreview=false,effectPreview=false}={}){effectPreviewWeapon=effectPreview?Number(id):null;sourcePreviewMode=sourcePreview;editWeapon.hidden=typeof onEditWeapon!=='function'||sourcePreview||effectPreview;q('.bp-kicker').textContent=sourcePreview?'원본 연출 미리보기':effectPreview?'효과 조합 미리보기':'BATTLE STUDIO';if(win.navigator.userActivation?.isActive)void audio.resumeFromGesture();container.hidden=false;libraryScope.value=getWeapons().find(r=>r.recordIndex===Number(id))?.ownership==='unowned'?'unlinked':'linked';refresh(false);select(id);q('.bp-close').focus();},clear(){controller?.abort();generation++;root.removeAttribute('aria-busy');setLoading(false);resetPlayback();audio.clear();simulation.clear();effectPreviewWeapon=null;sourcePreviewMode=false;mode='attack';for(const b of root.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));hpBeforeDestroyed=null;pilotUnits.clear();for(const choices of pilotChoices.values())choices.clear();motionCatalog=null;libraryScope.value='linked';actorPanel.hidden=true;actorToggle.setAttribute('aria-expanded','false');pixi?.reset();paint();container.hidden=true;}};
}
