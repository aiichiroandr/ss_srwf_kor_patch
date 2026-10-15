import test from'node:test';import assert from'node:assert/strict';import{resolveBattleEnvelopeTimes}from'../assets/editor-battle-tone-envelope-times.mjs';
const rates=n=>({attack:n,decay1:n,decay2:n,release:n});
test('reference timing retains infinite rates and instant attacks without inventing millisecond defaults',()=>{
 for(const n of [0,1]){const r=resolveBattleEnvelopeTimes(rates(n));assert.equal(r.attack.increment16,0);assert.equal(r.release.fullRangeSamples,null);}
 for(const n of [62,63]){const r=resolveBattleEnvelopeTimes(rates(n));assert.equal(r.attack.nominalMs,0);assert.equal(r.attack.fullRangeSamples,1);assert.ok(r.release.fullRangeSamples>1);}
});
test('all reference rate indices produce monotonic bounded sample counts',()=>{
 let previousAttack=Infinity,previousDecay=Infinity;
 for(let n=2;n<64;n++){const r=resolveBattleEnvelopeTimes(rates(n));assert.equal(r.status,'reference');assert.ok(r.attack.fullRangeSamples<=previousAttack);assert.ok(r.decay1.fullRangeSamples<=previousDecay);assert.equal(r.decay1.fullRangeSamples,r.release.fullRangeSamples);previousAttack=r.attack.fullRangeSamples;previousDecay=r.decay1.fullRangeSamples;}
 assert.equal(resolveBattleEnvelopeTimes(rates(2)).attack.nominalMs,8100);assert.equal(resolveBattleEnvelopeTimes(rates(63)).release.nominalMs,3.1);
 assert.throws(()=>resolveBattleEnvelopeTimes(rates(64)));
});
