// Final0602D17E..218: registered skill79 and current unit253 add10
// to six already-calculated pilot stats. The caller's byte-stat limit is254,
// word-stat limit998. A result beyond the limit skips that write; it is not
// a saturated clamp. Morale130 gates a separate map transformation, not this
// stat pass. This helper never activates an event-learned skill by itself.
const limits=Object.freeze({attack:254,shot:254,hit:998,tech:998,evade:998,response:998});
export function applyBattleSereneStats({gameId,unitIndex,skillSlots,stats}={}){
 if(!['srwf-f','srwf-final'].includes(gameId)||!Number.isInteger(unitIndex)||unitIndex<0||unitIndex>65535
  ||!Array.isArray(skillSlots)||skillSlots.length>4||skillSlots.some(n=>!Number.isInteger(n)||n<0||n>255)
  ||!stats||typeof stats!=='object'||Array.isArray(stats)||!Object.keys(stats).length
  ||Object.entries(stats).some(([key,value])=>!Object.hasOwn(limits,key)||!Number.isInteger(value)||value<0||value>(limits[key]===254?255:65535)))
  throw new Error('Battle serene stats: bounded registered stat context required');
 const active=gameId==='srwf-final'&&unitIndex===253&&skillSlots.includes(79);
 const output={...stats},bonuses={};
 if(active)for(const[key,value]of Object.entries(output)){bonuses[key]=value+10<=limits[key]?10:0;output[key]=value+bonuses[key];}
 return {stats:output,active,bonuses};
}
