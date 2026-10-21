import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudioOutputControl} from '../web-port/mobile-audio-format.mjs';

const format = {type:'audio-format', protocol:1, sourceRate:44100, channels:2,
  deviceClock:'machine', format:'s16-interleaved', fastPolicy:'rate-2'};
const pcm = new Int16Array([100,1000,300,3000,-100,-1000,-300,-3000]);

test('a new machine-clock runtime activates conversion by capability before PCM', () => {
  const control = createAudioOutputControl(true,'11111111111111111111');
  assert.equal(control.convert,null);
  assert.equal(control.accept(format),true);
  assert.equal(control.convert(pcm,false),pcm);
  assert.deepEqual([...control.convert(pcm,true)],[200,2000,-200,-2000]);
});

test('the published v13 binary retains its legacy conversion without a handshake', () => {
  const control = createAudioOutputControl(true,'16f9cf9fde74c2d70e6b');
  assert.deepEqual([...control.convert(pcm,true)],[200,2000,-200,-2000]);
  control.accept(format);
  assert.deepEqual([...control.convert(pcm,true)],[200,2000,-200,-2000]);
});

test('older runtimes retain their previous PCM handling without a capability', () => {
  assert.equal(createAudioOutputControl(true,'0a1faba953d641c3358b').convert,null);
});

test('desktop never activates mobile conversion', () => {
  for(const version of ['16f9cf9fde74c2d70e6b','11111111111111111111']){
    const control=createAudioOutputControl(false,version);
    assert.equal(control.convert,null);
    assert.equal(control.accept(format),false);
    assert.equal(control.accept({type:'audio-format',protocol:999}),false);
    assert.equal(control.convert,null);
  }
});

test('malformed or unsupported capabilities fail instead of guessing a clock policy', () => {
  for(const message of [null,{},...Object.entries({protocol:2,sourceRate:48000,channels:1,
      deviceClock:'independent',format:'f32-planar',fastPolicy:'wsola'}).map(([key,value])=>({...format,[key]:value}))]){
    const control=createAudioOutputControl(true,'11111111111111111111');
    assert.throws(()=>control.accept(message),/PCM/);
    assert.equal(control.convert,null);
  }
});
