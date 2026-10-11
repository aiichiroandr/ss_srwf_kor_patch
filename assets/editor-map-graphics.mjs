// Read-only MAP_BANK pixels supplied by the user's verified disc session.
// F 0605544C..06055466 / Final 0605B124..0605B13E: four BE16 pattern
// names per tile, then 1,024 8x8 4-bpp characters at decoded offset 0x2C00.
// F 06048D72..06048DF4 / Final 0604E61E..0604E6A0: swap quadrants and
// OR the map's H/V bits into each character's own H/V bits (not XOR).
const validGraphics = g => g?.palette instanceof Uint8Array && g.palette.length === 512
  && g.patterns instanceof Uint8Array && g.patterns.length === 8192
  && g.pixels instanceof Uint8Array && g.pixels.length === 32768;

export function paintTilePreview(canvas, pixels) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx?.createImageData || !ctx.putImageData || !pixels) return false;
  canvas.width = canvas.height = 16;
  const image = ctx.createImageData(16, 16); image.data.set(pixels); ctx.putImageData(image, 0, 0);
  return true;
}

export function decodeMapTile(graphics, tileId, orientation = 0) {
  if (!validGraphics(graphics) || !Number.isInteger(tileId) || tileId < 0 || tileId > 1023
    || !Number.isInteger(orientation) || orientation < 0 || orientation > 3) throw new RangeError('Invalid map graphics or tile.');
  const { palette, patterns, pixels } = graphics, result = new Uint8ClampedArray(16 * 16 * 4);
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const at = (tileId * 4 + (quadrant ^ orientation)) * 2;
    const word = ((patterns[at] << 8) | patterns[at + 1]) | (orientation << 10);
    const charStart = (word & 1023) * 32, paletteStart = (word >>> 12) * 32;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = word & 1024 ? 7 - x : x, sy = word & 2048 ? 7 - y : y;
      const packed = pixels[charStart + sy * 4 + (sx >>> 1)];
      const colorAt = paletteStart + ((sx & 1 ? packed & 15 : packed >>> 4) * 2);
      const color = (palette[colorAt] << 8) | palette[colorAt + 1];
      const dest = (((quadrant >>> 1) * 8 + y) * 16 + (quadrant & 1) * 8 + x) * 4;
      result[dest] = (color & 31) << 3; result[dest + 1] = ((color >>> 5) & 31) << 3;
      result[dest + 2] = ((color >>> 10) & 31) << 3; result[dest + 3] = 255;
    }
  }
  return result;
}

export function createMapGraphics() {
  // Two banks, at most 512 decoded tiles each: about 1 MiB of cached pixels.
  // Switching disc sessions drops this cache with the scenario model.
  const banks = new Map();
  function tile(bank, tileId, orientation = 0) {
    if (!validGraphics(bank?.graphics)) return null;
    let entries = banks.get(bank);
    if (!entries) { entries = new Map(); banks.set(bank, entries); if (banks.size > 2) banks.delete(banks.keys().next().value); }
    else { banks.delete(bank); banks.set(bank, entries); }
    const key = tileId * 4 + orientation;
    let pixels = entries.get(key);
    if (!pixels) { pixels = decodeMapTile(bank.graphics, tileId, orientation); if (entries.size >= 512) entries.delete(entries.keys().next().value); }
    else entries.delete(key);
    entries.set(key, pixels); return pixels;
  }
  function map(model, mapIndex, planeIndex) {
    const member = model.mapFor(mapIndex), plane = member?.planes[planeIndex], bank = member && model.bankFor(member);
    if (!plane || !validGraphics(bank?.graphics)) return null;
    const width = plane.width * 16, height = plane.height * 16, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < plane.height; y++) for (let x = 0; x < plane.width; x++) {
      const image = tile(bank, model.tile(mapIndex, planeIndex, x, y), plane.orientations?.[y * plane.width + x] ?? 0);
      for (let row = 0; row < 16; row++) data.set(image.subarray(row * 64, row * 64 + 64), ((y * 16 + row) * width + x * 16) * 4);
    }
    return { width, height, data };
  }
  function examples(model, terrainId, limit = 4) {
    const result = [], seen = new Set();
    for (const member of model.maps) {
      const bank = model.bankFor(member); if (!validGraphics(bank?.graphics)) continue;
      for (const [planeIndex, plane] of member.planes.entries()) for (let i = 0; i < plane.tiles.length; i++) {
        const x = i % plane.width, y = Math.floor(i / plane.width), id = model.tile(member.mapIndex, planeIndex, x, y);
        if (bank.terrainIds[id] !== terrainId) continue;
        const orientation = plane.orientations?.[i] ?? 0, key = `${bank.bankSlots[0]}:${id}:${orientation}`;
        if (seen.has(key)) continue; seen.add(key);
        const pixels = tile(bank, id, orientation);
        // Avoid showing only a black, unassigned tile as a terrain's picture.
        if (!pixels.some((value, offset) => offset % 4 !== 3 && value)) continue;
        result.push({ mapIndex: member.mapIndex, plane: planeIndex, x, y, tileId: id, pixels });
        if (result.length >= limit) return result;
      }
    }
    return result;
  }
  return Object.freeze({ tile, map, examples });
}
