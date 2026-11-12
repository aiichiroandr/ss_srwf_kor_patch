import {localEditorReview} from './editor-local-config.mjs?v=20261113-froster1';
// Private captures stay in the local review workspace, outside the public package.
export function createMiscExamples({criticalPanel,debugPanel}) {
 const root=document.createElement('dialog');root.className='misc-example-dialog';root.setAttribute('aria-label','게임 화면 예시');
 const bar=document.createElement('div'),title=document.createElement('strong'),close=document.createElement('button'),image=document.createElement('img');
 bar.className='misc-example-dialog-bar';close.type='button';close.textContent='닫기';close.addEventListener('click',()=>root.close());bar.append(title,close);root.append(bar,image);document.body.append(root);
 function add(panel,label){
  const heading=panel.querySelector('.critical-fix-heading')??panel;
  const button=document.createElement('button'),thumb=document.createElement('img');button.type='button';button.className='misc-example-button';button.hidden=true;button.setAttribute('aria-label',`${label} 실제 화면 예시 보기`);thumb.alt='';button.append(thumb,document.createTextNode('예시'));heading.append(button);
  thumb.addEventListener('load',()=>{button.hidden=false;});thumb.addEventListener('error',()=>{button.hidden=true;});
  button.addEventListener('click',()=>{title.textContent=label;image.src=thumb.src;image.alt=`${label} 게임 화면`;root.showModal();});return thumb;
 }
 const critical=add(criticalPanel,'크리티컬 보정 전후'),debug=add(debugPanel,'디버그 메뉴 · v0.4 검수 화면');let current='';
 return {update(gameId){if(!localEditorReview||!gameId||gameId===current)return;current=gameId;critical.src=`./editor-review/misc-examples/critical-${gameId==='srwf-f'?'f':'final'}.png`;debug.src='./editor-review/misc-examples/debug-v04.png';}};
}
