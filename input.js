// input.js
// Turns MIDI "chords" into figure seeds. The Nano ESP32 shows up as a USB-MIDI
// device and sends one note per touch pad; a regular MIDI keyboard works the
// same way.
//
// A gesture starts with the first note-on and ends when every note has been
// released. The seed is the set of notes touched during the gesture, so the
// same chord always produces the same figure, regardless of order or timing.
//
// A potentiometer on the Nano (sent as CC 1, the mod wheel on most keyboards)
// picks one of VARIATIONS versions of each chord's figure. Variation 0 keeps
// the plain chord seed ("48.50.53"), so seeds saved before the knob existed
// still match; other positions add a suffix ("48.50.53~3"). Turning the knob
// redraws the figure on screen as the matching variation of its chord.
//
// The Nano's second button (CC 65) shows a completely random figure, like a
// mouse click. So does a single pad touched and released on its own, unless
// that pad has a pre-made arrangement (TILEMAP_CHORDS in tilemaps.js).
//
// With DAILY_SEEDS on, the date is added to every chord seed
// ("48.50.53~3@2026-11-18"), so each chord shows a different figure each day
// and the same figure all day. The date is part of the saved seed, so saved
// figures still come back exactly. Seeds saved without a date (before this
// existed) also still come back unchanged.
//
// With HOURLY_SEEDS on as well, the planetary hour (planetaryHours.js) is
// added too ("48.50.53~3@2026-11-18h4"): the date is then the planetary day,
// which runs sunrise to sunrise, and h0-h23 the hour within it (h0 = first
// hour after sunrise). Each chord shows a different figure each planetary
// hour. Where the sun doesn't rise or set, it falls back to the date alone.

const ATTRACT_TOGGLE_CC = 64;  // Nano's attract-mode button (sent as CC 64)
const DAILY_SEEDS = true;      // false: a chord shows the same figure every day
const HOURLY_SEEDS = true;     // false: the same figure all day (only applies with DAILY_SEEDS)
const RANDOM_CC = 65;          // Nano's random-figure button (must match RANDOM_CC in the firmware)
const VARIATION_CC = 1;         // Nano's potentiometer (must match POT_CC in the firmware)
const SLIDER_REVERSED = true;  // draw the knob slider mirrored, to match the turning direction of the pot as wired
const VARIATIONS = 8;          // how many knob positions; changing this changes which figure each position gives
const VARIATION_SETTLE = 400;  // ms the knob must rest before the figure on screen is redrawn
const INDICATOR_DURATION = 3000; // ms the knob slider stays up after the knob last moved
const SLIDER_LENGTH = 16;      // tiles across the knob slider, ends included
const STUCK_NOTE_TIMEOUT = 5000; // ms without MIDI activity before a stuck gesture is closed
// Pairs of opposites for the two ends of the knob slider (left, right). One
// pair is picked at random each time the slider appears.
const SLIDER_END_PAIRS = [
  ['FEMALE_SYMBOL', 'BOW_AND_ARROW'],   // Venus and Mars
  ['LAST_QUARTER_MOON', 'APOLLO'],      // Moon and Sun
  ['SALT', 'SULFUR'],                   // the alchemical fixed and volatile
  ['HYPHEN_MINUS', 'PLUS_SIGN'],        // minus and plus
  ['WATER', 'TORCH_ON_WALL'],           // water and fire
];

let heldNotes = new Set();   // notes currently down
let chordNotes = new Set();  // every note touched during the current gesture
let stuckTimer = null;
let variation = 0;           // current knob position, 0..VARIATIONS-1
let variationTimer = null;
let lastKnobValue = null;    // last CC value received, to tell real turns from re-sends
let indicatorUntil = 0;      // millis() until which the knob slider is shown
let indicatorShowing = false; // whether the slider was drawn last frame
let sliderEnds = SLIDER_END_PAIRS[0]; // the pair of opposites at the slider's ends
let padTilesShown = new Set(); // notes whose tiles are on screen (see drawPadTiles)
let padTilesUntil = 0;       // millis() until which the last gesture's tiles stay up

// Where each pad sits on the hands, and the glyph shown when it is touched.
// col: tile columns left (-) or right (+) of the screen centre;
// row: 0 = finger row, 1 = palm row just below it.
// Fingers carry their palmistry mounts (index Jupiter, middle Saturn, ring
// Apollo, little Mercury, thumb Venus); palm contacts are the Moon (little-
// finger side) and Taurus (thumb side, ruled by Venus).
// Change the note numbers here if the pads are wired in a different order.
const PAD_TILES = {
  // right hand, thumb to little finger, then palm
  48: { glyph: 'FEMALE_SYMBOL', col: 3, row: 0 },
  49: { glyph: 'JUPITER',       col: 4, row: 0 },
  50: { glyph: 'SATURN',        col: 5, row: 0 },
  51: { glyph: 'APOLLO',        col: 6, row: 0 },
  52: { glyph: 'MERCURY',       col: 7, row: 0 },
  53: { glyph: 'LAST_QUARTER_MOON', col: 6, row: 1 },
  54: { glyph: 'TAURUS',        col: 4, row: 1 },
  // left hand, little finger to thumb, then palm
  55: { glyph: 'MERCURY',       col: -7, row: 0 },
  56: { glyph: 'APOLLO',        col: -6, row: 0 },
  57: { glyph: 'SATURN',        col: -5, row: 0 },
  58: { glyph: 'JUPITER',       col: -4, row: 0 },
  59: { glyph: 'FEMALE_SYMBOL', col: -3, row: 0 },
  60: { glyph: 'TAURUS',        col: -4, row: 1 },
  61: { glyph: 'LAST_QUARTER_MOON', col: -6, row: 1 },
};
const PAD_TILES_LINGER = 500; // ms the tiles stay up after the gesture ends, so a quick tap is still seen

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
    // Re-attach when a device is plugged in or reconnects.
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
    stopAttractMode(); // also restarts the idle timer
    initializeSketch(undefined, true); // no seed = a new random figure
  } else if (type === 0xb0 && data1 === VARIATION_CC) {
    knobMoved(data2);
  }
}

// For testing without the Nano: the arrow keys (sketch.js) turn the knob one
// position left or right, as if it had been turned to the middle of that
// position's range.
function nudgeKnob(step) {
  let zoneWidth = 128 / VARIATIONS;
  let centre = v => Math.round((v + 0.5) * zoneWidth);
  knobMoved(centre(constrain(variation + step, 0, VARIATIONS - 1)));
  indicatorUntil = millis() + INDICATOR_DURATION; // show the slider even at either end
  if (loading) loaderKnobTurned(lastKnobValue); // likewise the loader's feedback
}

// Map a CC value (0-127) to a knob position. Near the boundary with the
// neighbouring position, keep the current one so a jittery pot doesn't flicker.
function knobMoved(value) {
  // The Nano re-sends the knob at the start of every touch; only show the
  // slider when the knob has actually been turned. Each move keeps it up for
  // another INDICATOR_DURATION, so it hides once the knob is at rest.
  let turned = lastKnobValue !== null && Math.abs(value - lastKnobValue) > 1;
  if (turned) {
    indicatorUntil = millis() + INDICATOR_DURATION;
    noteUserActivity(); // archive.js: counts as input for the idle timers
  }
  lastKnobValue = value;
  if (turned && loading) loaderKnobTurned(value); // loader.js: hue shift and message

  let zoneWidth = 128 / VARIATIONS;
  let next = Math.min(VARIATIONS - 1, Math.floor(value / zoneWidth));
  if (next === variation) return;
  let centre = (next + 0.5) * zoneWidth;
  let nearEdge = Math.abs(value - centre) > zoneWidth / 2 - 2;
  if (nearEdge && Math.abs(next - variation) === 1) return;
  variation = next;

  clearTimeout(variationTimer);
  variationTimer = setTimeout(() => {
    if (heldNotes.size > 0) return; // the chord in progress will pick it up
    // During the loading screen, vary the chord about to be shown.
    let base = chordBase(loading ? loaderSeed : currentSeed);
    if (base === null) return;      // random test figure, nothing to vary
    stopAttractMode();              // a visitor turned the knob
    initializeSketch(chordSeed(base));
  }, VARIATION_SETTLE);
}

function noteDown(note) {
  if (heldNotes.size === 0) {
    chordNotes.clear();
    stopAttractMode(); // a visitor touched the pads
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

// A pad that never reports release (noise, a cable knocked loose) would
// otherwise hold the gesture open forever.
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


function chordToSeed(notes) {
  return [...notes].sort((a, b) => a - b).join('.');
}

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


// The full seed for a chord: knob variation, then the date and planetary hour.
function chordSeed(base) {
  let seed = variation === 0 ? base : `${base}~${variation}`;
  if (!DAILY_SEEDS) return seed;
  let now = new Date();
  let hour = HOURLY_SEEDS ? planetaryHour(now) : null; // planetaryHours.js
  if (hour) return `${seed}@${dateString(hour.dayDate)}h${hour.index}`;
  return `${seed}@${dateString(now)}`;
}

// A local date as e.g. "2026-11-18".
function dateString(d) {
  let pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "48.50.53~3@2026-11-18h4" -> "48.50.53"; null for seeds that didn't come from a chord.
function chordBase(seed) {
  let match = /^(\d+(?:\.\d+)*)(?:~\d+)?(?:@\d{4}-\d{2}-\d{2}(?:h\d{1,2})?)?$/.exec(seed || '');
  return match ? match[1] : null;
}
