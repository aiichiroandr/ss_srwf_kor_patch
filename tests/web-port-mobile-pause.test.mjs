import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobilePause} from '../web-port/mobile-pause.mjs';
test('hide freezes producer and suspends audio; visible resumes before release',async()=>{
 const pad=new Int32Array(new SharedArrayBuffer(20)),calls=[];
 const p=new MobilePause({pad,audio:{async suspend(){calls.push('suspend')},async resume(){assert.equal(Atomics.load(pad,4),1);calls.push('resume')}}});
 const wait=p.update(true);assert.equal(Atomics.load(pad,4),1);await wait;
 await p.update(false);assert.deepEqual(calls,['suspend','resume']);assert.equal(Atomics.load(pad,4),0);
});
test('rapid visibility changes and disposal cannot release a hidden or stopped run',async()=>{
 const pad=new Int32Array(new SharedArrayBuffer(20));let finish;
 const p=new MobilePause({pad,audio:{async suspend(){},resume(){return new Promise(r=>finish=r)}}});
 const waking=p.update(false);await Promise.resolve();await Promise.resolve();
 const hidden=p.update(true);finish();await waking;await hidden;assert.equal(Atomics.load(pad,4),1);
 p.dispose();await p.update(true);assert.equal(Atomics.load(pad,4),0);
});
test('failed audio resume keeps game paused and allows a deliberate retry',async()=>{
 const pad=new Int32Array(new SharedArrayBuffer(20));let fail=true,errors=0;
 const p=new MobilePause({pad,audio:{async suspend(){},async resume(){if(fail)throw Error('gesture required')}},onError:()=>errors++});
 await p.update(false);assert.equal(Atomics.load(pad,4),1);assert.equal(errors,1);
 fail=false;await p.update(false);assert.equal(Atomics.load(pad,4),0);
});
