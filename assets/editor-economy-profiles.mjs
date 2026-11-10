// Verified sparse-patch reconstruction against every parent immutable digest.
// Extend the pinned unit flag cells: +11 = record+20 (reward u16),
// +16 = record+25 bits 4..5 (part slots). Costs remain in two fixed spans.
import { HERO_EDITOR_PROFILES } from './editor-hero-profiles.mjs?v=20261110-part2';
const pins=[
  {
    "baseTargetSha256": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
    "sourceImmutableTsrSha256": "9ddc35b8fa306af8043cbde371b2473b87bbec17c6c611807806d2fbb5093f15",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "479fbb9034cd6503b79a452f7b699ba7629247ce23e916f3ebdc659e875baa28"
  },
  {
    "baseTargetSha256": "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
    "sourceImmutableTsrSha256": "4c8c7f2b6d67053fed06302d2b39bc702031d1dd51b1718be0d4685df132da9b",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "f05bc28767467a6b8a6ec7a3dfe23b237cd58cdaed7e1ef7a166358858493592"
  },
  {
    "baseTargetSha256": "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
    "sourceImmutableTsrSha256": "06de96078aa2ef66c22445b208f114fa7b3f08ae19799c48dda535b8c7d49e19",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "3c5b9ae91d2e009717c818ed573d5a0e896f9456e52062aafac66500c34d9a61"
  },
  {
    "baseTargetSha256": "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202",
    "sourceImmutableTsrSha256": "fce3d7292c9ce5cd43a7bd6141ff893d945d870bad932a29de9049c763d388e8",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "df903ab3da5834492ec80a274865125734a461e94d3f01eb019fc4a4ff1c15d6"
  },
  {
    "baseTargetSha256": "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "sourceImmutableTsrSha256": "28144882b8da931b634f4f2b488bc6da2bd0b9f745d776fd8b48faa09bfe4cc4",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "c418112a58d505c7b36257c7f856a79394dac36ef1da1b4fb503325c7468c33f"
  },
  {
    "baseTargetSha256": "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "sourceImmutableTsrSha256": "df2592eab0287e5aef826a2e9863e22d5e0623d30d2c0cb5719ed7e99fd19015",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "0d927cb433e4ccf763fc087e615b2f9d51bbf8ff3632c20c97ddde1748637eba"
  },
  {
    "baseTargetSha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "sourceImmutableTsrSha256": "26d0f8def182446c41b017445c058aee7b0e7a4cb1ceebce6bd43c4bc289c294",
    "costMasks": [
      [
        297382,
        100,
        255
      ],
      [
        297562,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "e6ba796f6bf9d3889542bb8bf6068a1f64957b827bf369c835a7dda4568ae6cc"
  },
  {
    "baseTargetSha256": "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    "sourceImmutableTsrSha256": "33f96db58ff20e078fedd4fa1f5b67b42cbbeb02de21ba2a711242c7ce397d92",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "0e12028856a8708a49cbe5b38984b2a297d839a073269e82d8bd49bb55555719"
  },
  {
    "baseTargetSha256": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
    "sourceImmutableTsrSha256": "9ddc35b8fa306af8043cbde371b2473b87bbec17c6c611807806d2fbb5093f15",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "479fbb9034cd6503b79a452f7b699ba7629247ce23e916f3ebdc659e875baa28"
  },
  {
    "baseTargetSha256": "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
    "sourceImmutableTsrSha256": "4c8c7f2b6d67053fed06302d2b39bc702031d1dd51b1718be0d4685df132da9b",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "f05bc28767467a6b8a6ec7a3dfe23b237cd58cdaed7e1ef7a166358858493592"
  },
  {
    "baseTargetSha256": "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
    "sourceImmutableTsrSha256": "06de96078aa2ef66c22445b208f114fa7b3f08ae19799c48dda535b8c7d49e19",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "3c5b9ae91d2e009717c818ed573d5a0e896f9456e52062aafac66500c34d9a61"
  },
  {
    "baseTargetSha256": "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202",
    "sourceImmutableTsrSha256": "fce3d7292c9ce5cd43a7bd6141ff893d945d870bad932a29de9049c763d388e8",
    "costMasks": [
      [
        297390,
        100,
        255
      ],
      [
        297570,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "df903ab3da5834492ec80a274865125734a461e94d3f01eb019fc4a4ff1c15d6"
  },
  {
    "baseTargetSha256": "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "sourceImmutableTsrSha256": "28144882b8da931b634f4f2b488bc6da2bd0b9f745d776fd8b48faa09bfe4cc4",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "c418112a58d505c7b36257c7f856a79394dac36ef1da1b4fb503325c7468c33f"
  },
  {
    "baseTargetSha256": "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "sourceImmutableTsrSha256": "df2592eab0287e5aef826a2e9863e22d5e0623d30d2c0cb5719ed7e99fd19015",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "0d927cb433e4ccf763fc087e615b2f9d51bbf8ff3632c20c97ddde1748637eba"
  },
  {
    "baseTargetSha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "sourceImmutableTsrSha256": "26d0f8def182446c41b017445c058aee7b0e7a4cb1ceebce6bd43c4bc289c294",
    "costMasks": [
      [
        297382,
        100,
        255
      ],
      [
        297562,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "e6ba796f6bf9d3889542bb8bf6068a1f64957b827bf369c835a7dda4568ae6cc"
  },
  {
    "baseTargetSha256": "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    "sourceImmutableTsrSha256": "33f96db58ff20e078fedd4fa1f5b67b42cbbeb02de21ba2a711242c7ce397d92",
    "costMasks": [
      [
        316547,
        100,
        255
      ],
      [
        316727,
        88,
        255
      ]
    ],
    "immutableTsrSha256": "0e12028856a8708a49cbe5b38984b2a297d839a073269e82d8bd49bb55555719"
  }
];
function merge(ranges){const out=[];for(const r of ranges.map(r=>[...r]).sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&last.every((x,i)=>x===r[i]))continue;if(last&&last[2]===255&&r[2]===255&&last[0]+last[1]>=r[0])last[1]=Math.max(last[0]+last[1],r[0]+r[1])-last[0];else out.push(r);}return out;}
export const ECONOMY_EDITOR_PROFILES=Object.freeze(pins.map(pin=>{
 const base=HERO_EDITOR_PROFILES.find(p=>p.baseTargetSha256===pin.baseTargetSha256&&p.immutableTsrSha256===pin.sourceImmutableTsrSha256);
 if(!base)throw new Error('Missing economy provenance base');
 const units=base.decodedMasks.filter(r=>r[1]===1&&r[2]===48).flatMap(([s])=>[[s+11,2,255],[s+16,1,48]]);
 return Object.freeze({...base,decodedMasks:Object.freeze(merge([...base.decodedMasks,...units,...pin.costMasks]).map(Object.freeze)),immutableTsrSha256:pin.immutableTsrSha256});
}));
