import {outputAudioRate} from './mobile-audio-rate.mjs?mobile=13';

export function createAudioOutputControl(enabled, version) {
  let convert = enabled && version === '16f9cf9fde74c2d70e6b' ? outputAudioRate : null;
  return {
    get convert() { return convert; },
    accept(message) {
      if (!enabled) return false;
      if (!message || message.type !== 'audio-format' || message.protocol !== 1
          || message.sourceRate !== 44100 || message.channels !== 2
          || message.deviceClock !== 'machine' || message.format !== 's16-interleaved'
          || message.fastPolicy !== 'rate-2') {
        throw new Error('지원하지 않는 모바일 PCM 형식입니다. 실행 코드와 화면 파일 버전을 확인하세요.');
      }
      convert = outputAudioRate;
      return true;
    },
  };
}
