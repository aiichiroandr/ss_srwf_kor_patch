// Extensions of the six latest accepted and two exact stock profiles.
// Only fixed hero-list footprints 308..311, excluding their final four zero
// padding bytes, are additionally mutable. Pointer cells and destination slots
// remain pinned; the parser/writer require exactly six spirits and 00 00.
import { SCENARIO_EDITOR_PROFILES } from './editor-scenario-profiles.mjs?v=20261015-stocknames2';
import { TERRAIN_EDITOR_PROFILES } from './editor-terrain-profiles.mjs?v=20261015-stocknames2';
const pins = [
  {
    "baseTargetSha256": "b2a67ed2a409c95de7226d33f2ab934012e93199afb7284bb710c81b6f0223b9",
    "heroTemplateMasks": [
      [
        262938,
        48,
        255
      ],
      [
        262990,
        32,
        255
      ],
      [
        263026,
        48,
        255
      ],
      [
        263078,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "d35c19e5f77f3bd1966dbf010a828795c687211ab2120956ad19a6aa8bade937"
  },
  {
    "baseTargetSha256": "85b9cbf349c421d621f3a6e6819d94f9ee1405137430046469562a2176e798a3",
    "heroTemplateMasks": [
      [
        262938,
        48,
        255
      ],
      [
        262990,
        32,
        255
      ],
      [
        263026,
        48,
        255
      ],
      [
        263078,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "4d7f6ccd91e6da595d209454d85b1bf3603ba8e97edc669941d1d9dd6f8419f4"
  },
  {
    "baseTargetSha256": "0fb10cbf4332f94c865c0e8d0a0c7234f8f6083bdbbb5a06198cebff871d195d",
    "heroTemplateMasks": [
      [
        279000,
        48,
        255
      ],
      [
        279052,
        32,
        255
      ],
      [
        279088,
        48,
        255
      ],
      [
        279140,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "ed4c567f34efb7fa043498e9b1acb09045a9a3a77464ae9f3bb4822be75c4a66"
  },
  {
    "baseTargetSha256": "75555116f784115e7104c593fd990491ae182b9493d9f159201e17b3e3d88202",
    "heroTemplateMasks": [
      [
        262938,
        48,
        255
      ],
      [
        262990,
        32,
        255
      ],
      [
        263026,
        48,
        255
      ],
      [
        263078,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "129a3cd3dbdd023962e14777f930d75febb3f8bf133348b7236f4e3d189b43d4"
  },
  {
    "baseTargetSha256": "fd8df11fc7a933cea000d40695325fb290900c72b64f8b316e18b06afee8d73e",
    "heroTemplateMasks": [
      [
        279000,
        48,
        255
      ],
      [
        279052,
        32,
        255
      ],
      [
        279088,
        48,
        255
      ],
      [
        279140,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "1c07b80a570020fd9bbadeed735e8dada98aa6abfa509a69b42b278968ba23fa"
  },
  {
    "baseTargetSha256": "9d22ab0ac45e2f8a3728c18825ddd2ea96035704a2ef56b291e077e93e885e23",
    "heroTemplateMasks": [
      [
        279000,
        48,
        255
      ],
      [
        279052,
        32,
        255
      ],
      [
        279088,
        48,
        255
      ],
      [
        279140,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "85603e6ac38d4d1eb4a45889e8153269cf9f55b495eade72143297d05ebe22cb"
  },
  {
    "baseTargetSha256": "c198a93007d46161abe769b6f579f01cae89e23737c0a2ff38ec314d43b3adf8",
    "heroTemplateMasks": [
      [
        262930,
        48,
        255
      ],
      [
        262982,
        32,
        255
      ],
      [
        263018,
        48,
        255
      ],
      [
        263070,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "26d0f8def182446c41b017445c058aee7b0e7a4cb1ceebce6bd43c4bc289c294"
  },
  {
    "baseTargetSha256": "ff7192abc112d5c969a0e236f5061fc6853234eedc350525c46c0548c57dfbdb",
    "heroTemplateMasks": [
      [
        279000,
        48,
        255
      ],
      [
        279052,
        32,
        255
      ],
      [
        279088,
        48,
        255
      ],
      [
        279140,
        32,
        255
      ]
    ],
    "immutableTsrSha256": "33f96db58ff20e078fedd4fa1f5b67b42cbbeb02de21ba2a711242c7ce397d92"
  }
];
const merge = ranges => {
 const output = [];
 for (const range of ranges.map(r => [...r]).sort((a,b) => a[0] - b[0])) {
  const previous = output.at(-1);
  if (previous && previous[2] === 255 && range[2] === 255 && previous[0] + previous[1] >= range[0]) previous[1] = Math.max(previous[0] + previous[1], range[0] + range[1]) - previous[0];
  else output.push(range);
 }
 return Object.freeze(output.map(Object.freeze));
};
export const HERO_EDITOR_PROFILES = Object.freeze([...SCENARIO_EDITOR_PROFILES, ...TERRAIN_EDITOR_PROFILES].map(base => {
 const pin = pins.find(p => p.baseTargetSha256 === base.baseTargetSha256);
 if (!pin) throw new Error('Missing authenticated hero-list profile base.');
 return Object.freeze({...base, decodedMasks: merge([...base.decodedMasks, ...pin.heroTemplateMasks]), immutableTsrSha256: pin.immutableTsrSha256});
}));
