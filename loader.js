// loader.js
// A short "measuring" screen between a visitor's request (pad chord, random
// button, space/click) and the figure, to build anticipation. The tiles are
// cleared and a centred column of lines is typed out in tile letters:
//
//   TESTING MERCY...
//   TESTING CIRCUITOUSNESS...
//   TESTING LITERACY...
//   CHECKING STAR CHARTS...
//   YOUR TALISMAN IS...
//
// then the figure is drawn as usual. The screen keeps the previous figure's
// colours (the boot colour before the first figure). Knob redraws, attract
// mode, resizes and the end of the boot screen skip it.
//
// The words type at a steady pace, but the dots after each "TESTING" and
// astrology line come at uneven, random intervals, and there are a random
// number of them, as if the machine were working something out.
//
// The lines are in white tinted with the complement of the background
// colour (complementWhiteSpritesheet() in sketch.js). "YOUR TALISMAN IS..."
// sits one row below the rest, in plain black or white, whichever stands
// out more on the background.
//
// Each letter makes a short blip on two low oscillators at random pitches,
// the same voices as the boot screen (boot.js).
//
// A new request while the loader runs replaces the seed it will show, so the
// latest touch wins without restarting the text.

const LOADER_SKILLS = 3;        // how many "TESTING" lines (from skills.json)
const LOADER_CHAR_DELAY = 30;   // ms per letter as a line types out; 0 prints the words at once
const LOADER_DOTS_MIN = 2;      // fewest dots after a "TESTING" or astrology line
const LOADER_DOTS_MAX = 7;      // most dots
const LOADER_DOT_DELAY_MIN = 80;  // ms before each dot, chosen at random between these
const LOADER_DOT_DELAY_MAX = 500;
const LOADER_LINE_PAUSE = 450;  // ms between one line finishing and the next starting
const LOADER_FINAL_HOLD = 1200; // ms "YOUR TALISMAN IS..." stays up before the figure starts
const LOADER_FINAL_LINE = 'YOUR TALISMAN IS...';
const LOADER_BLIP_VOLUME = 0.2; // per oscillator (boot screen uses BOOT_VOLUME, 0.25)
const LOADER_BLIP_LENGTH = 0.06; // seconds each letter's blip fades over
const LOADER_ASTRO_LINES = [
  'CHECKING STAR CHARTS',
  'CONSULTING THE EPHEMERIS',
  'CASTING YOUR NATIVITY',
  'ALIGNING THE PLANETS',
  'READING THE HOUSES',
  'HOUR', // replaced by the current planetary hour, e.g. "CONSULTING THE HOUR OF SATURN"
];

let loading = false;
let loaderSeed = null;   // the seed to show when the loader ends
let loaderLines = [];    // full text of each line
let loaderTimes = [];    // per line, ms after loaderStart at which each character appears
let loaderStart = 0;
let loaderTimer = null;
let loaderTyped = 0;     // letters shown so far, to blip once per new letter
let loaderWave1, loaderWave2;
let loaderBg = null;          // background colour this frame (set in loaderBackground)

// Not Math.random: generateFigureNameFromTiles() reseeds it from the figure,
// so it would pick the same skills after the same figure.
function loaderRandomInt(n) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}

function startLoader(seed) {
  endBoot();        // boot.js
  stopQuickening(); // quicken.js
  clearTimeout(placementTimeout);
  placementTimeout = null;
  clearTimeout(figureHoldTimer);
  figureHoldTimer = null;
  clearTimeout(loaderTimer);
  figureHoldUntil = Infinity; // later requests go to loaderSeed (initializeSketch)
  tiles = [];
  figureName = '';

  loading = true;
  loaderSeed = seed;
  loaderLines = buildLoaderLines();
  loaderStart = millis();
  loaderTyped = 0;
  startLoaderSound();

  // Each line starts once the previous one has typed out and paused. The
  // words type at LOADER_CHAR_DELAY; the "thinking" dots (lines with
  // thinking: true) each wait a random time.
  loaderTimes = [];
  let t = 0;
  for (let line of loaderLines) {
    let times = [];
    let dotsFrom = line.thinking ? line.text.search(/\.+$/) : line.text.length;
    for (let i = 0; i < line.text.length; i++) {
      t += i < dotsFrom
        ? (i === 0 ? 0 : LOADER_CHAR_DELAY)
        : LOADER_DOT_DELAY_MIN + loaderRandomInt(LOADER_DOT_DELAY_MAX - LOADER_DOT_DELAY_MIN + 1);
      times.push(t);
    }
    loaderTimes.push(times);
    t += LOADER_LINE_PAUSE;
  }
  loaderLines = loaderLines.map(line => line.text);
  let total = t - LOADER_LINE_PAUSE + LOADER_FINAL_HOLD;
  loaderTimer = setTimeout(finishLoader, total);
}

// { text, thinking } for each line; thinking lines get random dot timings.
function buildLoaderLines() {
  let pool = skills.slice();
  let lines = [];
  for (let i = 0; i < LOADER_SKILLS && pool.length; i++) {
    let skill = pool.splice(loaderRandomInt(pool.length), 1)[0];
    lines.push({ text: `TESTING ${skill.toUpperCase()}` + loaderDots(), thinking: true });
  }
  lines.push({ text: astroLine() + loaderDots(), thinking: true });
  lines.push({ text: LOADER_FINAL_LINE, thinking: false });
  return lines;
}

function loaderDots() {
  return '.'.repeat(LOADER_DOTS_MIN + loaderRandomInt(LOADER_DOTS_MAX - LOADER_DOTS_MIN + 1));
}

function astroLine() {
  let line = LOADER_ASTRO_LINES[loaderRandomInt(LOADER_ASTRO_LINES.length)];
  if (line !== 'HOUR') return line;
  if (!planetaryHourRuler) return LOADER_ASTRO_LINES[0];
  let planet = (planetaryHourRuler === 'SUN' || planetaryHourRuler === 'MOON')
    ? `THE ${planetaryHourRuler}` : planetaryHourRuler;
  return `NOTINg THE HOUR OF ${planet}`;
}

function finishLoader() {
  stopLoader();
  showFigure(loaderSeed);
}

function stopLoader() {
  clearTimeout(loaderTimer);
  loaderTimer = null;
  if (loading) stopLoaderSound();
  loading = false;
}

// --- sound ------------------------------------------------------------------

function startLoaderSound() {
  if (!loaderWave1) {
    loaderWave1 = new p5.Oscillator('triangle');
    loaderWave2 = new p5.Oscillator('sine');
  }
  for (let w of [loaderWave1, loaderWave2]) {
    w.amp(0);
    w.start();
  }
}

function stopLoaderSound() {
  for (let w of [loaderWave1, loaderWave2]) {
    w.amp(0, 0.05);
    w.stop(0.1);
  }
}

// One letter's blip: jump both oscillators to new pitches (the boot screen's
// ranges), then a quick attack and fade.
function loaderBlip() {
  loaderWave1.freq(random(50, 100));
  loaderWave2.freq(random(10, 100));
  for (let w of [loaderWave1, loaderWave2]) {
    w.amp(LOADER_BLIP_VOLUME, 0.003);
    w.amp(0, LOADER_BLIP_LENGTH, 0.003);
  }
}

// How many characters of line li are showing, elapsed ms after loaderStart.
function loaderShown(li, elapsed) {
  let times = loaderTimes[li];
  let n = 0;
  while (n < times.length && times[n] <= elapsed) n++;
  return n;
}

// Called from draw(). Paints the background, the previous figure's or the
// boot screen's before the first figure, and returns the sheet for the pad
// glyphs (input.js), drawn as on a figure.
function loaderBackground() {
  loaderBg = baseColor || bootColors[0] || color(200);
  background(loaderBg);
  return baseColor ? tintedSpritesheet() : contrastSpritesheet(loaderBg);
}

// Called from draw(). Layout comes from the full text, so lines don't shift
// as they type; it is worked out every frame, so a resize just works.
function drawLoader() {
  let elapsed = millis() - loaderStart;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let maxCols = Math.max(1, CANVAS_COLS - 2);

  // Wrap each line into rows; remember each row's offset in its line.
  let rows = [];
  let typed = 0;
  let last = loaderLines.length - 1;
  loaderLines.forEach((line, li) => {
    let shown = loaderShown(li, elapsed);
    typed += shown;
    let final = li === last;
    if (final) rows.push(null); // a blank row above "YOUR TALISMAN IS..."
    let offset = 0;
    let current = '';
    let currentOffset = 0;
    for (let word of line.split(' ')) {
      if (current && current.length + 1 + word.length > maxCols) {
        rows.push({ text: current, offset: currentOffset, shown, final });
        current = word;
        currentOffset = offset;
      } else {
        current = current ? current + ' ' + word : word;
      }
      offset += word.length + 1;
    }
    rows.push({ text: current, offset: currentOffset, shown, final });
  });

  // Blip when a new letter appears (at most once a frame).
  if (typed > loaderTyped) {
    loaderTyped = typed;
    loaderBlip();
  }

  let sheet = complementWhiteSpritesheet(loaderBg);  // sketch.js
  let finalSheet = contrastSpritesheet(loaderBg);     // sketch.js
  let y = Math.floor((CANVAS_ROWS - rows.length) / 2) * h;
  for (let row of rows) {
    if (!row) { y += h; continue; }
    let rowSheet = row.final ? finalSheet : sheet;
    let x = Math.floor((CANVAS_COLS - row.text.length) / 2) * w;
    let n = Math.min(row.text.length, row.shown - row.offset);
    for (let i = 0; i < n; i++) {
      if (row.text[i] !== ' ') displayTile(row.text[i], x + i * w, y, rowSheet);
    }
    y += h;
  }
}
