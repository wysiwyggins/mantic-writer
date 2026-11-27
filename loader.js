// loader.js
// The "measuring" screen typed out before a requested figure.

const LOADER_SKILLS = 3;
const LOADER_CHAR_DELAY = 30;
const LOADER_DOTS_MIN = 2;
const LOADER_DOTS_MAX = 7;
const LOADER_DOT_DELAY_MIN = 80;
const LOADER_DOT_DELAY_MAX = 500;
const LOADER_LINE_PAUSE = 450;
const LOADER_FINAL_HOLD = 1200;
const LOADER_FINAL_LINE = 'YOUR TALISMAN IS...';
const LOADER_BLIP_VOLUME = 0.2;
const LOADER_BLIP_LENGTH = 0.06;
const LOADER_ADJUST_TEXT = 'ADJUSTING AURA MAGNIFICATION';
const LOADER_ADJUST_LINGER = 800;
const LOADER_HUE_RANGE = 360;
const LOADER_ASTRO_LINES = [
  'CHECKING STAR CHARTS',
  'CONSULTING THE EPHEMERIS',
  'CASTING YOUR NATIVITY',
  'ALIGNING THE PLANETS',
  'READING THE HOUSES',
  'HOUR',
];

let loading = false;
let loaderSeed = null;
let loaderLines = [];
let loaderTimes = [];
let loaderStart = 0;
let loaderTimer = null;
let loaderTyped = 0;
let loaderWave1, loaderWave2;
let loaderBg = null;
let loaderKnobStart = null;
let loaderHueShift = 0;
let loaderAdjustUntil = 0;

// Not Math.random, which figure naming reseeds.
function loaderRandomInt(n) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % n;
}

function startLoader(seed) {
  endBoot();
  stopQuickening();
  clearTimeout(placementTimeout);
  placementTimeout = null;
  clearTimeout(figureHoldTimer);
  figureHoldTimer = null;
  clearTimeout(loaderTimer);
  figureHoldUntil = Infinity;
  tiles = [];
  figureName = '';

  loading = true;
  loaderSeed = seed;
  loaderLines = buildLoaderLines();
  loaderStart = millis();
  loaderTyped = 0;
  loaderKnobStart = lastKnobValue;
  loaderHueShift = 0;
  loaderAdjustUntil = 0;
  startLoaderSound();

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

// One letter's blip sound.
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

// Paint the loader background; returns the sheet for pad glyphs.
function loaderBackground() {
  loaderBg = baseColor || bootColors[0] || color(200);
  if (loaderHueShift) {
    loaderBg = rotateHue(loaderBg, loaderHueShift);
    background(loaderBg);
    return contrastSpritesheet(loaderBg);
  }
  background(loaderBg);
  return baseColor ? tintedSpritesheet() : contrastSpritesheet(loaderBg);
}

// Knob travel while loading shifts the hue.
function loaderKnobTurned(value) {
  if (loaderKnobStart === null) loaderKnobStart = value;
  loaderHueShift = (value - loaderKnobStart) / 127 * LOADER_HUE_RANGE;
  loaderAdjustUntil = millis() + LOADER_ADJUST_LINGER;
}

// Rotate a colour's hue by deg degrees.
function rotateHue(c, deg) {
  let a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  let r = red(c), g = green(c), b = blue(c);
  let ch = (k0, k1, k2) => constrain(Math.round(k0 * r + k1 * g + k2 * b), 0, 255);
  return color(
    ch(0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928),
    ch(0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283),
    ch(0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072));
}

// The adjusting message while the knob turns.
function drawLoaderAdjusting() {
  if (millis() >= loaderAdjustUntil) return;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let maxCols = Math.max(1, CANVAS_COLS - 2);
  let rows = [];
  for (let word of LOADER_ADJUST_TEXT.split(' ')) {
    let last = rows.length - 1;
    if (last >= 0 && rows[last].length + 1 + word.length <= maxCols) rows[last] += ' ' + word;
    else rows.push(word);
  }
  let sheet = contrastSpritesheet(loaderBg);
  rows.forEach((row, i) => {
    let x = Math.floor((CANVAS_COLS - row.length) / 2) * w;
    drawBootLine(row, x, (2 + i) * h, sheet);
  });
}

// Draw the typed-out lines.
function drawLoader() {
  let elapsed = millis() - loaderStart;
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  let maxCols = Math.max(1, CANVAS_COLS - 2);

  let rows = [];
  let typed = 0;
  let last = loaderLines.length - 1;
  loaderLines.forEach((line, li) => {
    let shown = loaderShown(li, elapsed);
    typed += shown;
    let final = li === last;
    if (final) rows.push(null);
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

  if (typed > loaderTyped) {
    loaderTyped = typed;
    loaderBlip();
  }

  let sheet = complementWhiteSpritesheet(loaderBg);
  let finalSheet = contrastSpritesheet(loaderBg);
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
