// Exercise the visible family selector and its separate rank selector.
// These helpers read the DOM, never the editor's private skill catalog.
const fire = node => node.dispatchEvent({ type: 'change', target: node });
export function offeredSkillIds(document) {
  const select=document.getElementById('pilotSkillAddSelect'),rank=document.getElementById('pilotSkillAddRank');
  const previous=select.value,previousRank=rank.value,ids=[];
  for(const option of select.options){
    if(!option.value)continue;
    select.value=option.value;fire(select);
    if(option.value.startsWith('id-'))ids.push(Number(option.value.slice(3)));
    else ids.push(...rank.options.map(item=>Number(item.value)));
  }
  select.value=previous;fire(select);rank.value=previousRank;fire(rank);
  return ids.sort((a,b)=>a-b);
}
export function chooseSkillControl(document,id) {
  const select=document.getElementById('pilotSkillAddSelect'),rank=document.getElementById('pilotSkillAddRank');
  for(const option of select.options){
    if(!option.value)continue;
    select.value=option.value;fire(select);
    if(option.value===`id-${id}`)return;
    if(rank.options.some(item=>Number(item.value)===id)){
      rank.value=String(id);fire(rank);return;
    }
  }
  select.value='';fire(select);
}
