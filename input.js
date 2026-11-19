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
// mouse click.
//
// With DAILY_SEEDS on, the date is added to every chord seed
// ("48.50.53~3@2026-11-18"), so each chord shows a different figure each day
// and the same figure all day. The date is part of the saved seed, so saved
// figures still come back exactly. Seeds saved without a date (before this
// existed) also still come back unchanged.

const ATTRACT_TOGGLE_CC = 64;  // Nano's attract-mode button (sent as CC 64)
const DAILY_SEEDS = true;      // false: a chord shows the same figure every day
const RANDOM_CC = 65;          // Nano's random-figure button (must match RANDOM_CC in the firmware)
const VARIATION_CC = 1;         // Nano's potentiometer (must match POT_CC in the firmware)
const VARIATIONS = 8;          // how many knob positions; changing this changes which figure each position gives
const VARIATION_SETTLE = 400;  // ms the knob must rest before the figure on screen is redrawn
const INDICATOR_DURATION = 1500; // ms the zone indicator stays up after the knob last moved
const STUCK_NOTE_TIMEOUT = 5000; // ms without MIDI activity before a stuck gesture is closed

let heldNotes = new Set();   // notes currently down
let chordNotes = new Set();  // every note touched during the current gesture
let stuckTimer = null;
let variation = 0;           // current knob position, 0..VARIATIONS-1
let variationTimer = null;
let lastKnobValue = null;    // last CC value received, to tell real turns from re-sends
let indicatorUntil = 0;      // millis() until which the zone indicator is shown

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
    initializeSketch(); // no seed = a new random figure
  } else if (type === 0xb0 && data1 === VARIATION_CC) {
    knobMoved(data2);
  }
}

// Map a CC value (0-127) to a knob position. Near the boundary with the
// neighbouring position, keep the current one so a jittery pot doesn't flicker.
function knobMoved(value) {
  // The Nano re-sends the knob at the start of every touch; only show the
  // indicator when the knob has actually been turned.
  if (lastKnobValue !== null && Math.abs(value - lastKnobValue) > 1) {
    indicatorUntil = millis() + INDICATOR_DURATION;
  }
  lastKnobValue = value;

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
    let base = chordBase(currentSeed);
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
  let seed = chordSeed(chordToSeed(chordNotes));
  chordNotes.clear();
  noteUserActivity(); // archive.js: resets the idle timer for attract mode
  initializeSketch(seed);
}

// Sorted note numbers, e.g. "48.50.53". Order-independent and readable.
function chordToSeed(notes) {
  return [...notes].sort((a, b) => a - b).join('.');
}

// Called from draw(): a row of VARIATIONS glyphs near the bottom of the
// screen, the current zone as a solid block and the others as dots, so
// visitors can see where they are on a smooth knob.
function drawVariationIndicator() {
  if (millis() >= indicatorUntil) return;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let left = Math.floor((CANVAS_COLS - VARIATIONS) / 2) * w;
  let y = height - 2 * h;
  for (let i = 0; i < VARIATIONS; i++) {
    let coords = spritesheetData.tiles[i === variation ? 'FULL_BLOCK' : 'MIDDLE_DOT'];
    image(spritesheet, left + i * w, y, w, h, coords[0] * w, coords[1] * h, w, h);
  }
}

// The full seed for a chord: knob variation, then today's date.
function chordSeed(base) {
  let seed = variation === 0 ? base : `${base}~${variation}`;
  return DAILY_SEEDS ? `${seed}@${todayString()}` : seed;
}

// The Pi's local date, e.g. "2026-11-18". Figures change at local midnight.
function todayString() {
  let d = new Date();
  let pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "48.50.53~3@2026-11-18" -> "48.50.53"; null for seeds that didn't come from a chord.
function chordBase(seed) {
  let match = /^(\d+(?:\.\d+)*)(?:~\d+)?(?:@\d{4}-\d{2}-\d{2})?$/.exec(seed || '');
  return match ? match[1] : null;
}
