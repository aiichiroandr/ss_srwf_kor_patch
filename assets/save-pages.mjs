// Page boundaries do not change save identities or any stored values.
export function pageItems(items,page,size){
  const count=Math.max(1,Math.ceil(items.length/Math.max(1,Math.floor(size))));
  const current=Math.max(0,Math.min(count-1,Math.floor(page)||0));
  const start=current*Math.max(1,Math.floor(size));
  return {page:current,count,start,items:items.slice(start,start+Math.max(1,Math.floor(size)))};
}

export function fitPages(items,heights,available,gap=8){
  const pages=[];let group=[],used=0;
  items.forEach((item,index)=>{
    const height=Math.max(1,Number(heights[index])||1);
    if(group.length&&used+gap+height>Math.max(1,available)){pages.push(group);group=[];used=0;}
    used+=height+(group.length?gap:0);group.push(item);
  });
  if(group.length)pages.push(group);
  return pages.length?pages:[[]];
}
