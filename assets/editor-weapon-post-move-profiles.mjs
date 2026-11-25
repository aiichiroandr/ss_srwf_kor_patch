// Authenticated parent TSR hash + one mutable bit per weapon record.
// The raw disc ranges, decoded geometry, and other immutable bits are identical.
import { KILL_EXPERIENCE_PROFILES } from './editor-kill-experience-profiles.mjs?v=20261113-alicecopies1';
import { WEAPON_POST_MOVE_MASK } from './editor-weapon-post-move.mjs?v=20261113-alicecopies1&editorcompat=20261125-1';

const pins = [
  {"base":"b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9","parent":"17bde18b6f0058e62c6054c46d4880d2b2a1b28532ac0c75702b9114058afeff","hash":"1158d22e16133cf1cedce6ff7d50c7a4b14123a7e4f75e78368910dda8736e0e","ranges":[[270663,1029],[288173,250]]},
  {"base":"85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3","parent":"83fd1a98714241e43a243e55049da03aa49e6a2d353ecba9a71a069494344f36","hash":"404f648b7adcdbcceb641576f8dba90ef70faa2b16365ff1650f495f2716e175","ranges":[[270663,1029],[288173,250]]},
  {"base":"0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d","parent":"0c053ab97bdb58d05cf5ee2f4cb229aa24d736738b70d09a20392714b633312d","hash":"b95ba094fa7d6ce03203bc35b9627899ed6316cafae86553ff169fbec83baaee","ranges":[[287661,1407]]},
  {"base":"75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202","parent":"2ace9198989b10a841e733e3cbbd22defbbae2f500859fae7d8f03209437d3f2","hash":"e2b62a803a33f3c1a916072e20dc6f6c9c6ce5d3b1cf0c940d842a68aa52c1aa","ranges":[[270663,1029],[288173,250]]},
  {"base":"fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e","parent":"e31541aa0978eebd08286a856dc88160da3801b8d002ad6380877c38b02731b9","hash":"0d9c499711a82d2b921509fc7edc299e1c176f3d60178655bff2a3d58e1bb5f1","ranges":[[287661,1407]]},
  {"base":"9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23","parent":"739fa68383b31d16c56071f9ba1f8199d9da1789ca7da9767110508db962bebc","hash":"4436b0055d3e879bfe04b99f002f8605b6b26b792a20d42a2cdaf04448dec2f7","ranges":[[287661,1407]]},
  {"base":"c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8","parent":"1e26eeed484b6e3a383226a7343dc1396d038f704fadc208e00ac1861f03a345","hash":"910673f15c6e015f4d7ce7c0444081450a52ce899700194f59f42aa7950a11fe","ranges":[[270655,1029],[288165,250]]},
  {"base":"ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb","parent":"b9e555841fc9759c6faef719faee3b3461958c9d89ab94a9ea44ce16446d5935","hash":"feaab1c1811c2c33ec8f74f23cbfa939ea804028486652a69d2cec166458c6ad","ranges":[[287661,1407]]},
];

export const WEAPON_POST_MOVE_PROFILES = Object.freeze(pins.map(pin => {
  const parent = KILL_EXPERIENCE_PROFILES.find(row => row.baseTargetSha256 === pin.base && row.immutableTsrSha256 === pin.parent);
  if (!parent) throw new Error('Missing post-move profile parent');
  const added = pin.ranges.flatMap(([start, count]) =>
    Array.from({length: count}, (_, index) => Object.freeze([start + index * 17, 1, WEAPON_POST_MOVE_MASK])));
  const decodedMasks = Object.freeze([...parent.decodedMasks, ...added].sort((a, b) => a[0] - b[0]));
  return Object.freeze({...parent, decodedMasks, immutableTsrSha256: pin.hash});
}));
