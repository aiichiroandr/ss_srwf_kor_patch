// Only weapon +2 bits 0..5 (dialogue key); all other parent bounds stay pinned.
import {UNIT_STORAGE_PROFILES} from './editor-unit-storage-profiles.mjs?v=20261113-froster1';
const pins=[
  {
    "base": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
    "parent": "078ff66818bfed35e898178ae76a16026dd3f0c3971b0289f3dec9d902aeb3eb",
    "hash": "5c1f4f57697086d77bcabc2f51516c88ca6dfee9fa3cedfad80ba87a88c4a5ef",
    "ranges": [
      [
        270664,
        1029
      ],
      [
        288174,
        250
      ]
    ]
  },
  {
    "base": "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
    "parent": "ed72ada6f5dd7ace3ce6e4578ff62cfc55f12ba2d4827d5c82e7a93da890f08b",
    "hash": "139dff755a218dda9f214c14fe408896f11a9e404fbc79e6302dbcfba7f73c7c",
    "ranges": [
      [
        270664,
        1029
      ],
      [
        288174,
        250
      ]
    ]
  },
  {
    "base": "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
    "parent": "fb627c7160627724d6c1c5261dad74cc4ef8dc6f02c3e765e6e0a7ee9e0c54b3",
    "hash": "d30a7227a3d7f84b50dc4165c4088dc3e7e5c26903d57dabab07db42fade25ef",
    "ranges": [
      [
        287662,
        1407
      ]
    ]
  },
  {
    "base": "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202",
    "parent": "ffcb59b4869e3287e2158c5732a0a1aaa72e0ee1859dec28fc7ae72686f49d85",
    "hash": "ba0506b3f04ab4cca6bd2dd4bd0d9c0d11663f473473afc2ef73385f04c07924",
    "ranges": [
      [
        270664,
        1029
      ],
      [
        288174,
        250
      ]
    ]
  },
  {
    "base": "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "parent": "755aba3b4ce9628bcbb49fe834d74c2b2c82b37f21b6b1961e87a3f492509e23",
    "hash": "b18030bf5db908ca52c25683b60ea912c04df9a30874ee38601c9567effe6211",
    "ranges": [
      [
        287662,
        1407
      ]
    ]
  },
  {
    "base": "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "parent": "4cb112fa8b30f20c0f9566fb11647f365f88cf2ddb52f1c0abc1aad1f8312db0",
    "hash": "2ac4597473d4c9fefd9aa2f741b845d367dfe27c9af98a132d4152df0925303b",
    "ranges": [
      [
        287662,
        1407
      ]
    ]
  },
  {
    "base": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "parent": "8ca34c21c1d7d96a6555f938c5249107c95ce2af267a4c171d3299c98a781380",
    "hash": "c209b6b3f5b8d3ae7f68ff08a3f754654feec6ea63817db82acb393d27306095",
    "ranges": [
      [
        270656,
        1029
      ],
      [
        288166,
        250
      ]
    ]
  },
  {
    "base": "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    "parent": "5dbc34294faefb026c356f200be5f38ea175bf66d8352c463c09e6cda1599df4",
    "hash": "00ee208ddb8b96f7185cd1f2c1b69fc2cf3d9341344819962230cda5308a9ad8",
    "ranges": [
      [
        287662,
        1407
      ]
    ]
  }
];
export const WEAPON_VOICE_PROFILES=Object.freeze(pins.map(pin=>{
 const parent=UNIT_STORAGE_PROFILES.find(p=>p.baseTargetSha256===pin.base&&p.immutableTsrSha256===pin.parent);
 if(!parent)throw Error('Missing weapon dialogue profile parent');
 const extra=pin.ranges.flatMap(([start,count])=>Array.from({length:count},(_,i)=>[start+17*i,1,63]));
 return Object.freeze({...parent,decodedMasks:Object.freeze([...parent.decodedMasks,...extra].sort((a,b)=>a[0]-b[0]).map(Object.freeze)),immutableTsrSha256:pin.hash});
}));
