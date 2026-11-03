// One box per upgrade stage. Both pointer and keyboard paths commit through the save writer.
export function createUpgradeBar(doc,{label,value,limit,disabled=false,onChange,field,index=null}){
  const wrap=doc.createElement('div');wrap.className='save-upgrade-control';wrap.dataset.saveField=field;
  if(index!==null)wrap.dataset.saveIndex=String(index);
  const head=doc.createElement('div');head.className='save-upgrade-label';
  const title=doc.createElement('span');title.textContent=label;title.title=label;const output=doc.createElement('output');head.append(title,output);
  const body=doc.createElement('div');body.className='save-upgrade-body';
  const minus=doc.createElement('button'),plus=doc.createElement('button');
  minus.type=plus.type='button';minus.textContent='−';plus.textContent='＋';minus.setAttribute('aria-label',`${label} 1단 내리기`);plus.setAttribute('aria-label',`${label} 1단 올리기`);
  const track=doc.createElement('div');track.className='save-upgrade-track';track.role='slider';track.tabIndex=disabled?-1:0;
  track.setAttribute('aria-label',label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(Math.max(limit,value)));
  track.setAttribute('aria-disabled',String(disabled));
  const boxes=Array.from({length:10},(_,i)=>{const box=doc.createElement('span');box.dataset.stage=String(i+1);box.className='save-upgrade-box';box.title=i>=limit?`${i+1}단: 해금 필요`:`${i+1}단`;track.append(box);return box;});
  function paint(){output.textContent=`${value} / ${limit}단`;track.setAttribute('aria-valuenow',String(value));track.setAttribute('aria-valuetext',`${value}단, 현재 한도 ${limit}단`);boxes.forEach((b,i)=>{b.classList.toggle('is-filled',i<value);b.classList.toggle('is-locked',i>=limit);});minus.disabled=disabled||value===0;plus.disabled=disabled||value>=limit;wrap.classList.toggle('is-over-limit',value>limit);}
  function commit(next){if(disabled)return;try{onChange(next);value=next;paint();}catch{ /* The field-specific writer displays the reason. */ }}
  track.addEventListener('click',e=>{const box=e.target.closest('[data-stage]');if(box?.parentNode===track)commit(Number(box.dataset.stage));});
  track.addEventListener('keydown',e=>{let next;switch(e.key){case 'ArrowLeft':case 'ArrowDown':next=Math.max(0,value-1);break;case 'ArrowRight':case 'ArrowUp':next=Math.min(limit,value+1);break;case 'Home':next=0;break;case 'End':next=limit;break;default:return;}e.preventDefault();commit(next);});
  minus.addEventListener('click',()=>commit(Math.max(0,value-1)));plus.addEventListener('click',()=>commit(Math.min(limit,value+1)));
  body.append(minus,track,plus);wrap.append(head,body);paint();return wrap;
}
