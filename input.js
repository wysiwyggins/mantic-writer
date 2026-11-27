// input.js
// MIDI chords from the touch pads become figure seeds.

const ATTRACT_TOGGLE_CC = 64;
const DAILY_SEEDS = true;
const HOURLY_SEEDS = true;
const RANDOM_CC = 65;
const VARIATION_CC = 1;
const SLIDER_REVERSED = true;
const VARIATIONS = 8;
const VARIATION_SETTLE = 400;
const INDICATOR_DURATION = 3000;
const SLIDER_LENGTH = 16;
const STUCK_NOTE_TIMEOUT = 5000;
const SLIDER_END_PAIRS = [
  ['FEMALE_SYMBOL', 'BOW_AND_ARROW'],
  ['LAST_QUARTER_MOON', 'APOLLO'],
  ['SALT', 'SULFUR'],
  ['HYPHEN_MINUS', 'PLUS_SIGN'],
  ['WATER', 'TORCH_ON_WALL'],
];

let heldNotes = new Set();
let chordNotes = new Set();
let stuckTimer = null;
let variation = 0;
let variationTimer = null;
let lastKnobValue = null;
let indicatorUntil = 0;
let indicatorShowing = false;
let sliderEnds = SLIDER_END_PAIRS[0];
let padTilesShown = new Set();
let padTilesUntil = 0;

const PAD_TILES = {
  48: { glyph: 'FEMALE_SYMBOL', col: 3, row: 0 },
  49: { glyph: 'JUPITER',       col: 4, row: 0 },
  50: { glyph: 'SATURN',        col: 5, row: 0 },
  51: { glyph: 'APOLLO',        col: 6, row: 0 },
  52: { glyph: 'MERCURY',       col: 7, row: 0 },
  53: { glyph: 'LAST_QUARTER_MOON', col: 6, row: 1 },
  54: { glyph: 'TAURUS',        col: 4, row: 1 },
  55: { glyph: 'MERCURY',       col: -7, row: 0 },
  56: { glyph: 'APOLLO',        col: -6, row: 0 },
  57: { glyph: 'SATURN',        col: -5, row: 0 },
  58: { glyph: 'JUPITER',       col: -4, row: 0 },
  59: { glyph: 'FEMALE_SYMBOL', col: -3, row: 0 },
  60: { glyph: 'TAURUS',        col: -4, row: 1 },
  61: { glyph: 'LAST_QUARTER_MOON', col: -6, row: 1 },
};
const PAD_TILES_LINGER = 500;

function setupChordInput() {
  if (!navigator.requestMIDIAccess) {
    console.warn('Web MIDI is not available in this browser; use Chrome or Chromium.');
    return;
  }
  navigator.requestMIDIAccess().then(access => {
    const attach = () => {
      for (let input of access.inputs.values()) {
        input.onmidimessage = handleMIDIMessage;
      }
      console.log('MIDI inputs:', [...access.inputs.values()].map(i => i.name));
    };
    attach();
    access.onstatechange = attach;
  }, err => {
    console.warn('MIDI access was refused:', err);
  });
}

function handleMIDIMessage(message) {
  let [status, data1, data2] = message.data;
  let type = status & 0xf0;

  if (type === 0x90 && data2 > 0) {
    noteDown(data1);
  } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
    noteUp(data1);
  } else if (type === 0xb0 && data1 === ATTRACT_TOGGLE_CC && data2 >= 64) {
    toggleAttractMode();
  } else if (type === 0xb0 && data1 === RANDOM_CC && data2 >= 64) {
    stopAttractMode();
    initializeSketch(undefined, true);
  } else if (type === 0xb0 && data1 === VARIATION_CC) {
    knobMoved(data2);
  }
}

// Arrow keys: turn the knob one position, for testing without the Nano.
function nudgeKnob(step) {
  let zoneWidth = 128 / VARIATIONS;
  let centre = v => Math.round((v + 0.5) * zoneWidth);
  knobMoved(centre(constrain(variation + step, 0, VARIATIONS - 1)));
  indicatorUntil = millis() + INDICATOR_DURATION;
  if (loading) loaderKnobTurned(lastKnobValue);
}

// Map a CC value to a knob position, sticky near zone edges.
function knobMoved(value) {
  let turned = lastKnobValue !== null && Math.abs(value - lastKnobValue) > 1;
  if (turned) {
    indicatorUntil = millis() + INDICATOR_DURATION;
    noteUserActivity();
  }
  lastKnobValue = value;
  if (turned && loading) loaderKnobTurned(value);

  let zoneWidth = 128 / VARIATIONS;
  let next = Math.min(VARIATIONS - 1, Math.floor(value / zoneWidth));
  if (next === variation) return;
  let centre = (next + 0.5) * zoneWidth;
  let nearEdge = Math.abs(value - centre) > zoneWidth / 2 - 2;
  if (nearEdge && Math.abs(next - variation) === 1) return;
  variation = next;

  clearTimeout(variationTimer);
  variationTimer = setTimeout(() => {
    if (heldNotes.size > 0) return;
    let base = chordBase(loading ? loaderSeed : currentSeed);
    if (base === null) return;
    stopAttractMode();
    initializeSketch(chordSeed(base));
  }, VARIATION_SETTLE);
}

function noteDown(note) {
  if (heldNotes.size === 0) {
    chordNotes.clear();
    stopAttractMode();
  }
  noteActivity();
  heldNotes.add(note);
  chordNotes.add(note);
  padTilesShown = chordNotes;
}

function noteUp(note) {
  if (!heldNotes.has(note)) return;
  noteActivity();
  heldNotes.delete(note);
  if (heldNotes.size === 0) {
    finishChord();
  }
}

// Close a gesture whose pad never reports release.
function noteActivity() {
  clearTimeout(stuckTimer);
  stuckTimer = setTimeout(() => {
    if (heldNotes.size > 0) {
      console.warn('Closing gesture with stuck notes:', [...heldNotes]);
      heldNotes.clear();
      finishChord();
    }
  }, STUCK_NOTE_TIMEOUT);
}

// A lone pad gives a random figure unless it has a tilemap.
function finishChord() {
  clearTimeout(stuckTimer);
  if (chordNotes.size === 0) return;
  let base = chordToSeed(chordNotes);
  let random = chordNotes.size === 1 && !(base in TILEMAP_CHORDS);
  let seed = random ? undefined : chordSeed(base);
  padTilesShown = new Set(chordNotes);
  padTilesUntil = millis() + PAD_TILES_LINGER;
  chordNotes.clear();
  noteUserActivity();
  initializeSketch(seed, true);
}

// Sorted note numbers, e.g. "48.50.53".
function chordToSeed(notes) {
  return [...notes].sort((a, b) => a - b).join('.');
}

// The knob slider, with a pair of opposites at its ends.
function drawVariationIndicator() {
  if (millis() >= indicatorUntil || lastKnobValue === null) {
    indicatorShowing = false;
    return;
  }
  if (!indicatorShowing) {
    let r = crypto.getRandomValues(new Uint32Array(1))[0];
    sliderEnds = SLIDER_END_PAIRS[r % SLIDER_END_PAIRS.length];
  }
  indicatorShowing = true;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let left = Math.floor((CANVAS_COLS - SLIDER_LENGTH) / 2) * w;
  let y = height - 2 * h;
  let knobAt = Math.round(lastKnobValue / 127 * (SLIDER_LENGTH - 1));
  if (SLIDER_REVERSED) knobAt = SLIDER_LENGTH - 1 - knobAt;
  for (let i = 0; i < SLIDER_LENGTH; i++) {
    let key = i === knobAt ? 'BULLET'
      : i === 0 ? 'BOX_RIGHT_VERTICAL'
      : i === SLIDER_LENGTH - 1 ? 'BOX_LEFT_VERTICAL'
      : 'BOX_HORIZONTAL';
    let coords = spritesheetData.tiles[key];
    image(spritesheet, left + i * w, y, w, h, coords[0] * w, coords[1] * h, w, h);
  }
  let ends = [[sliderEnds[0], left - w], [sliderEnds[1], left + SLIDER_LENGTH * w]];
  for (let [key, x] of ends) {
    let coords = spritesheetData.tiles[key];
    image(spritesheet, x, y, w, h, coords[0] * w, coords[1] * h, w, h);
  }
}

// A glyph under each pad touched in the current gesture.
function drawPadTiles(sheet) {
  if (heldNotes.size === 0 && millis() >= padTilesUntil) return;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let centre = Math.floor(CANVAS_COLS / 2);
  let top = height - 4 * h;
  for (let note of padTilesShown) {
    let pad = PAD_TILES[note];
    if (!pad) continue;
    let coords = spritesheetData.tiles[pad.glyph];
    image(sheet, (centre + pad.col) * w, top + pad.row * h, w, h, coords[0] * w, coords[1] * h, w, h);
  }
}

// Chord, knob variation, planetary day and hour: "48.50.53~3@2026-11-18h4".
function chordSeed(base) {
  let seed = variation === 0 ? base : `${base}~${variation}`;
  if (!DAILY_SEEDS) return seed;
  let now = new Date();
  let hour = HOURLY_SEEDS ? planetaryHour(now) : null;
  if (hour) return `${seed}@${dateString(hour.dayDate)}h${hour.index}`;
  return `${seed}@${dateString(now)}`;
}

// A local date as "2026-11-18".
function dateString(d) {
  let pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "48.50.53~3@2026-11-18h4" -> "48.50.53"; null if not a chord seed.
function chordBase(seed) {
  let match = /^(\d+(?:\.\d+)*)(?:~\d+)?(?:@\d{4}-\d{2}-\d{2}(?:h\d{1,2})?)?$/.exec(seed || '');
  return match ? match[1] : null;
}
