// tilemaps.js
// Pre-made tile arrangements drawn in Tiled (assets/tilemaps/*.tmj), shown for
// particular chords instead of a generated figure. The figure is titled with
// the map's file name, underscores shown as spaces.
//
// The keys are chord seeds (sorted MIDI notes, see chordToSeed() in input.js).
// Single pads are the most common gesture, and pads 0-2 exist however many
// pads the installation has, so those are used here. The knob still changes the
// colour, inversion and sound of these figures, but not their arrangement.
//
// The maps must use a tileset laid out like assets/spritesheets/
// libuse40x30-cp437.png (23 columns of 40x30 tiles), so that tile ID n is the
// n-th tile of the sheet. Horizontal and vertical flips are kept; rotations
// (Tiled's diagonal flip) aren't supported.

const TILEMAP_CHORDS = {
  '48': 'royalty',   // pad 0 alone
  '49': 'ramparts',  // pad 1 alone
  '50': 'the_pit',   // pad 2 alone
};

const TILEMAP_DIR = './assets/tilemaps/';
const TILED_FLIP_H = 0x80000000;
const TILED_FLIP_V = 0x40000000;
const TILED_FLIP_D = 0x20000000;

let tilemaps = {}; // name -> parsed .tmj

function preloadTilemaps() {
  for (let name of new Set(Object.values(TILEMAP_CHORDS))) {
    tilemaps[name] = loadJSON(TILEMAP_DIR + name + '.tmj', () => {}, err => {
      console.error(`Could not load tilemap ${name}.tmj:`, err);
      delete tilemaps[name];
    });
  }
}

// The tilemap for a seed, or null. Variations ("48~3") use their chord's map.
function tilemapForSeed(seed) {
  let name = TILEMAP_CHORDS[chordBase(seed)];
  let map = name && tilemaps[name];
  return map && map.layers ? map : null;
}

// A map's figure is titled after its file name: "the_pit" -> "the pit".
function tilemapTitle(seed) {
  return TILEMAP_CHORDS[chordBase(seed)].replace(/_/g, ' ');
}

// Turn a map into tiles for the sketch, centred on (centerX, centerY), in
// reading order (left to right, top to bottom). Tiles that would fall off the
// canvas are skipped.
function tilesFromTilemap(map, centerX, centerY) {
  let firstgid = (map.tilesets && map.tilesets[0] && map.tilesets[0].firstgid) || 1;
  let cols = spritesheetData.spritesheetCols;
  let left = centerX - Math.floor(map.width / 2) * globalVars.TILE_WIDTH;
  let top = centerY - Math.floor(map.height / 2) * globalVars.TILE_HEIGHT;
  let result = [];

  for (let layer of map.layers) {
    if (layer.type !== 'tilelayer' || layer.visible === false || !Array.isArray(layer.data)) continue;
    layer.data.forEach((raw, i) => {
      if (!raw) return; // 0 = empty cell
      if (raw & TILED_FLIP_D) {
        console.warn(`Tilemap tile ${i} is rotated; rotation isn't supported, drawing it unrotated.`);
      }
      let index = (raw & 0x1fffffff) - firstgid;
      let coords = [index % cols, Math.floor(index / cols)];
      let x = left + (layer.x + i % layer.width) * globalVars.TILE_WIDTH;
      let y = top + (layer.y + Math.floor(i / layer.width)) * globalVars.TILE_HEIGHT;
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      result.push({
        pos: createVector(x, y),
        key: tileKeyForCoords(coords),
        coords: coords,
        flipH: (raw & TILED_FLIP_H) !== 0,
        flipV: (raw & TILED_FLIP_V) !== 0
      });
    });
  }
  return result;
}

// Several names can share a glyph; use the first one listed in spriteData.json.
let tileKeysByCoords = null;
function tileKeyForCoords(coords) {
  if (!tileKeysByCoords) {
    tileKeysByCoords = {};
    for (let [key, c] of Object.entries(spritesheetData.tiles)) {
      if (!(c.toString() in tileKeysByCoords)) tileKeysByCoords[c.toString()] = key;
    }
  }
  return tileKeysByCoords[coords.toString()] || `TILE_${coords[0]}_${coords[1]}`;
}
