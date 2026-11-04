// A real scrollable list on touch browsers, where select[size] can become
// a native picker. The existing select remains the selection/validation path.
export function createScenarioPlacementList({list,select,name,description,appendArtwork}){
 let rows=[],buttons=[],observer=null;
 function choose(index,focus=false){
  const row=rows[index];if(!row||select.disabled)return;
  select.value=row.recordIndex;select.dispatchEvent(new Event('change',{bubbles:true}));
  if(focus&&select.value===row.recordIndex)buttons[index]?.focus({preventScroll:true});
 }
 list.addEventListener('keydown',event=>{
  const index=rows.findIndex(row=>row.recordIndex===select.value);
  const next={ArrowUp:Math.max(0,index-1),ArrowLeft:Math.max(0,index-1),ArrowDown:Math.min(rows.length-1,index+1),ArrowRight:Math.min(rows.length-1,index+1),Home:0,End:rows.length-1}[event.key];
  if(next===undefined)return;event.preventDefault();choose(next,true);
 });
 function sync(){
  buttons.forEach((button,i)=>{
   const active=rows[i].recordIndex===select.value;
   button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.disabled=select.disabled;
   if(active&&list.clientHeight>0){const box=button.getBoundingClientRect(),bounds=list.getBoundingClientRect(),top=box.top-bounds.top+list.scrollTop,bottom=top+box.height,left=box.left-bounds.left+list.scrollLeft,right=left+box.width;if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;if(left<list.scrollLeft)list.scrollLeft=left;else if(right>list.scrollLeft+list.clientWidth)list.scrollLeft=right-list.clientWidth;}
  });
 }
 function render(next){
  if(rows.length===next.length&&next.every((row,i)=>row===rows[i])){sync();return;}
  rows=next;observer?.disconnect();
  observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const row=rows.find(row=>row.recordIndex===entry.target.dataset.recordIndex);if(row)appendArtwork?.(entry.target.firstElementChild,row);observer.unobserve(entry.target);}},{root:list,rootMargin:'30px'}):null;
  buttons=rows.map((row,index)=>{
   const button=document.createElement('button'),art=document.createElement('span'),unit=document.createElement('span'),pilot=document.createElement('span');
   button.type='button';button.setAttribute('role','option');button.dataset.recordIndex=row.recordIndex;button.title=description(row);button.setAttribute('aria-label',description(row));
   art.className='scenario-placement-art';unit.className='scenario-placement-unit';pilot.className='scenario-placement-pilot';unit.textContent=name(row);pilot.textContent=row.pilotName||'게임에서 결정';
   button.append(art,unit,pilot);button.addEventListener('click',()=>choose(index));
   if(observer)observer.observe(button);else appendArtwork?.(art,row);
   return button;
  });
  list.replaceChildren(...buttons);sync();
 }
 return {render,sync};
}
