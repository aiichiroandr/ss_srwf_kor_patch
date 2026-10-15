// Reference nominal timings published in MAME SCSP (ElSemi, R. Belmont).
// These nominal millisecond values are not new real-hardware verification.
const attackMilliseconds=Object.freeze([100000.0,100000.0,8100.0,6900.0,6000.0,4800.0,4000.0,3400.0,3000.0,2400.0,2000.0,1700.0,1500.0,1200.0,1000.0,860.0,760.0,600.0,500.0,430.0,380.0,300.0,250.0,220.0,190.0,150.0,130.0,110.0,95.0,76.0,63.0,55.0,47.0,38.0,31.0,27.0,24.0,19.0,15.0,13.0,12.0,9.4,7.9,6.8,6.0,4.7,3.8,3.4,3.0,2.4,2.0,1.8,1.6,1.3,1.1,0.93,0.85,0.65,0.53,0.44,0.4,0.35,0.0,0.0]);
const decayMilliseconds=Object.freeze([100000.0,100000.0,118200.0,101300.0,88600.0,70900.0,59100.0,50700.0,44300.0,35500.0,29600.0,25300.0,22200.0,17700.0,14800.0,12700.0,11100.0,8900.0,7400.0,6300.0,5500.0,4400.0,3700.0,3200.0,2800.0,2200.0,1800.0,1600.0,1400.0,1100.0,920.0,790.0,690.0,550.0,460.0,390.0,340.0,270.0,230.0,200.0,170.0,140.0,110.0,98.0,85.0,68.0,57.0,49.0,43.0,34.0,28.0,25.0,22.0,18.0,14.0,12.0,11.0,8.5,7.1,6.1,5.4,4.3,3.6,3.1]);
export function resolveBattleEnvelopeTimes(rates){
 if(!rates||!['attack','decay1','decay2','release'].every(k=>Number.isInteger(rates[k])&&rates[k]>=0&&rates[k]<=63))throw new Error('Battle envelope timing: invalid effective rates');
 const result={status:'reference',sampleRate:44100,scope:'published reference timing; independent native timing verification pending'};
 for(const key of ['attack','decay1','decay2','release']){
  const index=rates[key],ms=(key==='attack'?attackMilliseconds:decayMilliseconds)[index];
  const increment=index<2?0:ms===0?1024*65536:Math.floor(1023*1000*65536/(44100*ms));
  result[key]={index,nominalMs:index<2?null:ms,increment16:increment,fullRangeSamples:increment?Math.ceil(1023*65536/increment):null};
 }
 return result;
}
