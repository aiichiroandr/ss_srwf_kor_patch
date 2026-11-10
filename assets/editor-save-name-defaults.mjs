// Identity-qualified, exact default full-name fingerprints in accepted Final
// v0.3 a/b/c. No game text bytes or glyph bitmaps are stored here. The current
// native resolver at 0601D05C -> 20289B58 first reuses the R075 exact matcher;
// its old-save extension only adds alias cases. Full-name matches stop at FF
// or the 14-byte field bound, including historically truncated legacy names.
import {Sha256} from './sha256.mjs?v=20261110-part2';
const DEFAULTS=Object.freeze([
 [152,'레난제스 스타로드',[[14,'7df481f7129374c881ca607e98e26e5205bdc34fbdb10a419842164feb9dbae7'],[14,'ab9a06f59edbeb3d44eb48809a584aa1a74fa03566e2b085f11410bc70f87fc2']]],
 [153,'이룸가르트 카자하라',[[12,'72aa04ae2ca5ba1ab8208ce3b257730aef13a51996b54aac47a3ed9138bd52fd'],[14,'4bb0df551414ea527c387602312a78e64fe8db45e54cd447443a4adfb215555c']]],
 [154,'헥토르 매디슨',[[12,'b59a992ef29b14ace4ecc8babba67918ba97145837900c18c03992aa09152fb7'],[14,'25c024d0c324dad2cc24857f354305f67983ab7c942f8a25c4aa75a0ab745151']]],
 [155,'어윈 도스틴',[[13,'022c9b5284b832f6145c850b3ba1ef88ff09dc9a6cba243621fa0d3019b6113c'],[12,'da55a132c0a720256d78e2c45fdcff33c211509b03db6cc2ea9d7e12b5db2d1e']]],
 [156,'패트리샤 해크먼',[[12,'51d54a0ae947467248dc036e45bd6b9d4ed568b6e91875bf936d1b5a2210a4a1'],[14,'715785be8585916fbd7dbc965f32ff52486e81506052ce4a566070fb64a8a155']]],
 [157,'그레이스 우리진',[[10,'6970e0da0e83cd675f150cb8b4e53ef7335fd2f38ea779953b06213b72a00199'],[14,'b7b822b57306560df6357d040870333d3642d9d860c675331ff0ea15f6a85fb2']]],
 [158,'미나 라이클링',[[11,'335ce47856286caee9887537ba9f23b625fc1dfff0864ab9541524a45c69a765'],[14,'b63bf36adb91374395d6d2d6e02fd71dd9d678c63b7dd883366f60aa44464236']]],
 [159,'린 마오',[[6,'3dc338d22ff860b0cabeb6c95787d5c514ab04bdf526408452eb99708da2cfc1'],[8,'b5d5797d2f2ff62cfc18820e0fa2e37684ad57608bfad94f0d5061cf05e929f8']]],
]);
export function finalDefaultSaveName(bytes,faceId){
 if(!Number.isInteger(faceId)||faceId<304||faceId>319)return null;
 const row=DEFAULTS.find(r=>r[0]===(faceId>>>1));
 for(const [length,hash] of row[2])if(bytes.length>=length
  &&new Sha256().update(Uint8Array.from(bytes.slice(0,length))).hex()===hash)return row[1];
 return null;
}

// Exact six-byte stock alias fingerprints (fresh 00 padding / BCR FF padding).
// Text is the accepted Final resolver output, qualified by the saved face.
const ALIASES=Object.freeze([
 [152,'제스',['0a749f0dd4dc79182c52accd11cf5c1b18566e644e2b89d42aa5c323b33bb64b', '72da53af543f1a8ef21f1b1d4d81fca9ab2d0b0f26c5f107bf117b96f7bf0b90', 'b86aa02534f0a0b181857ebf010fef91ee4905ec52b4d0d87305dbe28b5fa7eb']],
 [153,'이룸',['011bfcb87592fa55030c0b767e8fdcdb377ca6cefd2fe9a320017f2c4bb219b0', 'aae33cb064c62504c67957b54810d8fc4e79ce0fcb7e38659503f68cdbe1b5f8', '5ab49c7fbf8232cc314fc6999f42b14079a03bad3f9fe9f543197e84d0f58b60']],
 [154,'헥토르',['e18e1e723bdd2900e7100bd98760d61a464c5ad8157a1dc739b10a368cabbef3']],
 [155,'윈',['f1b605d9bc4290319476802a07875d63c9869b49c45a33d61fd7456b1da753d4', '11b7bf163b21abd24a93df19930bf911ca97698acde67b2f4efd7646f31ce233', 'b112c7b186f3690fa2c56f88e4c10c45bbfbb139452d8cd21a5232ba1cffec16']],
 [156,'패트',['fe9a9a29bb1a37d4279478a161afa5f96a40652323d017977f64f3655c052a78', '6b990c5053414739cd951013d6687a6f261a50a6aff8565cd3cd53df30db6c13', '59e57cddedb864ac5a69d578ff37209c797f1a57aa956f4ea718f0280549743f']],
 [157,'그레이스',['6c56a23761c48cfaaade7249ed75e7439308a8f58bfcdecd504dd1b65990bb4a', 'cfa03efc4dc6d5086bc9dcd6b21942088945f14174e33ac6fc1a36f349d1d04d']],
 [158,'미나',['df7ff4c10380bff8ce2d1628ff5e2cdc7999d30e7234e4f28b5fc0180654e2ca', '5a72d9736ba97f3d760dfa70514f54b1c79d9a02f1ebfedd85a157dce9052e4c', 'cfc4799ac5479171d2e25d39e37a0738a57f8ae9b9f61ca5e7e87f07337118b7']],
 [159,'린',['dee4202800f39123efcd0fec982d4c14e457e907e258a43301ded1fb3a58de4b', '051c7db197a972419dae997cae606a357f4f9217961a0aa3e55edbbce928a4e9', '94d76e690cc9c3a2eb04bcbdef54cc7bc25468ab545704083cb02049a4d6e67d']],
]);
export function finalDefaultSaveAlias(bytes,faceId){
 if(!Number.isInteger(faceId)||faceId<304||faceId>319||bytes.length<6)return null;
 const row=ALIASES.find(r=>r[0]===(faceId>>>1));
 const hash=new Sha256().update(Uint8Array.from(bytes.slice(0,6))).hex();
 return row[2].includes(hash)?row[1]:null;
}
