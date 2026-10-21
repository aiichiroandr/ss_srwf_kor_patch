# Header artwork

The game PNGs are the actual title artwork decoded from local stock and accepted
patched discs, at the user's explicit request on 2026-10-21 to use the disc logos
instead of a drawn wordmark. They are not newly drawn substitute logos. No disc,
EFFECT payload, BIOS or save data is distributed here.

F: EFFECT.BIN cell 139 + cell 137 subimage 1 at (176,16).
Final: EFFECT.BIN cell 189 + cell 191 subimage 1 at (176,16).
The geometry comes from the existing title-logo inspector. Palette index 0 is
transparent; Saturn display colour correction is +8 per channel capped at 248.
Only transparent margins are cropped. The Korean sources are the accepted
F v0.5 a and Final v0.3 c, not mutable development candidates.

EFFECT SHA-256:
- F original: 36f0a3b12ce4d904a07dc8f661999aa9cbbcce27371dfecb8c1c0beca7b8ddcc
- F Korean: cef598bce55982ddaa4296ba6c269e2fad0a32eb4a53e3cab38447d90e11a37e
- Final original: 78a613e0817288187267ab22a5ebcac143c03568e6e479e080aa412df96dcef7
- Final Korean: 6757833598b473c18ecd2f0cefe3becf791b274f87af9e28848334a7c1124d77

Saturn: the Japanese blue-planet logo, faithfully vectorized from a box-art scan
by JustDanPatrick. Source and attribution:
https://commons.wikimedia.org/wiki/File:Sega_Saturn_Japanese_logo_with_blue_planet.svg
Original asset:
https://upload.wikimedia.org/wikipedia/commons/a/a0/Sega_Saturn_Japanese_logo_with_blue_planet.svg
Commons marks this PD-textlogo; trademarks remain with their owners. This is an
existing faithful vector reproduction, not a logo invented for this page, and
not claimed to have been extracted from the game disc. Branding identifies this
unofficial fan trial only.

Current Saturn header: the original saturn.svg above, with a thin white
non-scaling stroke added only to the two visible wordmark paths at the user's
request. The background remains transparent; the planet artwork is unchanged.
The intermediate saturn-orbit.svg is retained as an unused alternative.
