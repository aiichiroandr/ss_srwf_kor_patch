const $=id=>document.getElementById(id);
const titles={final:'슈퍼로봇대전 F 완결편',f:'슈퍼로봇대전 F',stock:'슈퍼로봇대전 F'};
function title(){
 const game=$('game').value, japanese=game==='stock';
 $('game-title').textContent=titles[game]||titles.final;
 $('game-logo').src=`./images/${game==='final'?'final':'f'}-${japanese?'ja':'ko'}.png`;
 $('game-logo').alt=japanese?'スーパーロボット大戦 F':$('game-title').textContent;
 document.querySelector('.version-tag').textContent=japanese?'일본어 원본':'한글판';
}
$('game').addEventListener('change',title);title();
$('disc').addEventListener('change',()=>{
 const files=[...$('disc').files];
 $('disc-label').textContent=files.length===1?files[0].name:files.length?`${files.length}개 파일 선택됨`:'디스크 파일 선택';
 $('disc-hint').textContent=files.length?`${(files.reduce((n,f)=>n+f.size,0)/1048576).toFixed(1)} MB · 선택됨`:'원본 BIN 또는 CUE + 모든 BIN';
 if(files.length){$('status').textContent='디스크 선택 완료 · 실행을 누르세요.';$('empty-state').querySelector('h2').textContent='실행 준비';$('empty-state').querySelector('p').textContent='아래 실행 버튼으로 시작하세요.';showTab('play');}
});
// Startup feedback stays inside the screen; stop observing frames after handoff.
const bootOverlay=$('empty-state');
let bootPending=false;
const firstFrame=new MutationObserver(()=>{
 bootPending=false;bootOverlay.hidden=true;firstFrame.disconnect();bootStatus.disconnect();
});
const watchFirstFrame=()=>firstFrame.observe($('screen'),{attributes:true,attributeFilter:['data-frame']});
watchFirstFrame();
$('boot').addEventListener('click',()=>{
 bootPending=true;bootOverlay.hidden=false;
 bootOverlay.querySelector('h2').textContent='디스크 부팅';
 bootOverlay.querySelector('p').textContent=$('status').textContent;
 bootOverlay.querySelector('span:last-child').textContent='게임 화면이 나오면 자동으로 전환됩니다.';
 watchFirstFrame();
 bootStatus.observe($('status'),{childList:true,characterData:true,subtree:true});
});
const bootStatus=new MutationObserver(()=>{
 if(!bootPending)return;
 bootOverlay.querySelector('p').textContent=$('status').textContent;
});
$('fullscreen').addEventListener('click',async()=>{
 try{if(document.fullscreenElement)await document.exitFullscreen();else await $('view-play').requestFullscreen();$('screen').focus();}
 catch{$('status').textContent='전체 화면을 지원하지 않는 브라우저입니다.';}
});
const bank=document.querySelector('.settings-bank'), panels=[...bank.children];
const groups={disc:[panels[0]],options:[panels[1],panels[2]],save:[panels[3]],tools:[panels[4],$('performance-panel'),document.querySelector('.diagnostics')]};
for(const [name,children] of Object.entries(groups)){
 const section=document.createElement('section');section.id=`view-${name}`;section.className='tab-view settings-view';section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby',`tab-${name}`);section.hidden=true;
 for(const child of children){section.append(child);if(child.tagName==='DETAILS')child.open=true;}
 document.querySelector('.workspace').append(section);
}
bank.remove();
$('transport').append(...document.querySelector('.launch-actions').children);
document.querySelector('.launch-actions').remove();
$('boot').innerHTML='<span aria-hidden="true">▶</span> 실행';$('stop').textContent='■ 종료';
const manualPause=$('pause-game');if(manualPause)$('transport').insertBefore(manualPause,$('stop'));
const tabs=[...document.querySelectorAll('[data-tab]')];
const landscapeMenu=$('landscape-menu');
function syncMenu(){
 const open=document.body.classList.contains('menu-open')||document.body.dataset.view!=='play';
 landscapeMenu.setAttribute('aria-expanded',String(open));
 landscapeMenu.setAttribute('aria-label',open?'게임으로 돌아가기':'게임 메뉴 열기');
 landscapeMenu.textContent=open?'× 돌아가기':'☰ 메뉴';
}
landscapeMenu.addEventListener('click',()=>{
 if(document.body.dataset.view!=='play')showTab('play');
 else {document.body.classList.toggle('menu-open');syncMenu();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.documentElement.classList.contains('mobile-device')&&matchMedia('(orientation:landscape)').matches){document.body.classList.remove('menu-open');showTab('play');}});
// The menu stays available when the play panel owns browser fullscreen.
document.addEventListener('fullscreenchange',()=>{
 if(!document.documentElement.classList.contains('mobile-device'))return;
 if(document.fullscreenElement&&!matchMedia('(orientation:landscape)').matches)return;
 (document.fullscreenElement||document.body).append(landscapeMenu);
 if(document.fullscreenElement)document.fullscreenElement.append($('game-tabs'));
 else document.body.insertBefore($('game-tabs'),document.querySelector('.workspace'));
});
function showTab(name){
 document.body.dataset.view=name;
 document.body.classList.remove('menu-open');
 syncMenu();
 if(name!=='play'&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
 for(const tab of tabs){const selected=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$(`view-${tab.dataset.tab}`).hidden=!selected;}
}
for(const tab of tabs){
 tab.onclick=()=>showTab(tab.dataset.tab);
 tab.onkeydown=e=>{let i=tabs.indexOf(tab);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();tabs[i].focus();showTab(tabs[i].dataset.tab);};
}
// Dragging a controller button never selects text or leaves a visual held state.
for(const button of document.querySelectorAll('[data-pad]')){
 button.addEventListener('pointerdown',()=>button.classList.add('pressed'));
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>button.classList.remove('pressed'));
}

const jog=$('volume-jog'),volume=$('volume');
function syncJog(){jog.setAttribute('aria-valuenow',volume.value);jog.style.setProperty('--angle',`${-135+Number(volume.value)*2.7}deg`);}
function setVolume(value){volume.value=String(Math.max(0,Math.min(100,Math.round(value))));volume.dispatchEvent(new Event('input',{bubbles:true}));}
volume.addEventListener('input',syncJog);syncJog();
let drag=null;
jog.addEventListener('pointerdown',e=>{e.preventDefault();jog.focus();jog.setPointerCapture(e.pointerId);drag={id:e.pointerId,y:e.clientY,value:Number(volume.value)};});
jog.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)setVolume(drag.value+(drag.y-e.clientY));});
for(const event of ['pointerup','pointercancel','lostpointercapture'])jog.addEventListener(event,()=>{drag=null;});
jog.addEventListener('keydown',e=>{const step={ArrowUp:5,ArrowRight:5,ArrowDown:-5,ArrowLeft:-5}[e.key];if(step!==undefined){e.preventDefault();setVolume(Number(volume.value)+step);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();setVolume(e.key==='Home'?0:100);}});
jog.addEventListener('wheel',e=>{e.preventDefault();setVolume(Number(volume.value)+(e.deltaY<0?2:-2));},{passive:false});
