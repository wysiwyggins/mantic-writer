// quicken.js
// Rarely, a figure "quickens": after it has been drawn and named, it comes
// alive for about half a minute, following cellular-automaton rules loosely after
// the salty_variety sketch, then withers back to the figure it started as.
//
// Whether a figure quickens, and how, comes from its seed (through its own
// generator, so ordinary figures are unchanged). The same chord quickens the
// same way all day, and a saved quickening replays when its seed is shown.
//
// The title glitches along with the figure, since a figure's name comes from
// its arrangement: letters swap, stutter and turn into glyphs from the living
// cells, and words from the name the current arrangement would have creep in.
// As the figure withers the title is repaired, letter by letter.
//
//   Q   show a random figure that quickens (for testing)
//
// While nobody touches anything, every IDLE_QUICKEN_INTERVAL there is an
// IDLE_QUICKEN_CHANCE of showing a figure that quickens, the same as Q.
//
// Only occupied cells and their empty neighbours are visited each step, and
// the number of cells is capped, so it stays light on the Pi.

const QUICKEN_CHANCE = 0.01;      // share of figures that quicken
const QUICKEN_DELAY = 1500;       // ms the still figure holds before it stirs
const QUICKEN_DURATION = 30000;   // ms from the figure's completion to the end
const QUICKEN_STEP = 100;         // ms between generations
const QUICKEN_MAX_CELLS = 400;
const QUICKEN_TOP_ROWS = 5;       // rows kept clear for the figure name
const QUICKEN_SOUND_EVERY = 15;   // generations between sounds
const GLITCH_LETTERS_EVERY = 3;   // generations between letter glitches
const GLITCH_WORDS_EVERY = 15;    // generations between word glitches
const IDLE_QUICKEN_INTERVAL = 5 * 60000; // ms of no input between idle chances
const IDLE_QUICKEN_CHANCE = 0.25;  // chance, each interval, of showing a quickening figure

let quickening = null; // state of the running animation, or null
let idleQuickenTimer = null;

// Called on every input (archive.js noteUserActivity): restart the idle count.
function resetIdleQuicken() {
  clearInterval(idleQuickenTimer);
  idleQuickenTimer = setInterval(idleQuickenChance, IDLE_QUICKEN_INTERVAL);
}

function idleQuickenChance() {
  if (booting || loading || isQuickening() || isAttractMode()) return;
  // crypto, not Math.random: Math.random is reseeded when a figure is named.
  let r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  if (r >= IDLE_QUICKEN_CHANCE) return;
  console.log('Idle: showing a quickening figure');
  initializeSketch(randomQuickeningSeed(), true); // same as the Q key
}

function quickenRng(seed) {
  return new Math.seedrandom('mantic-quicken:' + seed);
}

function seedQuickens(seed) {
  return quickenRng(seed)() < QUICKEN_CHANCE;
}

// Q key: try random seeds until one quickens. Cheap (about 100 tries on
// average) and keeps the result a real seed, so it can be saved.
function randomQuickeningSeed() {
  for (let i = 0; i < 100000; i++) {
    let seed = randomSeedString();
    if (seedQuickens(seed)) return seed;
  }
  return randomSeedString();
}

// Called by placeNextTile() once the figure is complete and named.
function maybeQuicken(seed) {
  let r = quickenRng(seed);
  if (r() >= QUICKEN_CHANCE) return;

  let glyphs = spritesheetData.glyphList || []; // tile names, one per distinct glyph
  if (glyphs.length === 0) {
    console.error('quicken: no glyph table, not animating');
    return;
  }
  let glyphIndex = {};
  glyphs.forEach((k, i) => { glyphIndex[k] = i; });

  let original = tiles.map(t => Object.assign({}, t));
  let cells = new Map();
  for (let t of tiles) {
    let gx = Math.round(t.pos.x / globalVars.TILE_WIDTH);
    let gy = Math.round(t.pos.y / globalVars.TILE_HEIGHT);
    let g = glyphIndex[spritesheetData.uniqueTiles[t.coords.toString()]] || 0;
    cells.set(gx + ',' + gy, { x: gx, y: gy, g, homeG: g, flipH: t.flipH, flipV: t.flipV, home: true });
  }

  quickening = {
    rng: r,
    glyphs,
    original,
    cells,
    start: millis(),
    generation: 0,
    name: figureName, // the title as generated; figureName is glitched meanwhile
    baseColor,
    tintcolor,
    timer: setTimeout(quickenStep, QUICKEN_DELAY)
  };
  console.log(`Figure ${seed} quickens`);
}

function isQuickening() {
  return quickening !== null;
}

function stopQuickening() {
  if (!quickening) return;
  clearTimeout(quickening.timer);
  quickening = null;
}

function quickenStep() {
  let q = quickening;
  if (!q) return;
  let t = (millis() - q.start) / QUICKEN_DURATION; // 0 → 1 over the run
  if (t >= 1) {
    finishQuickening();
    return;
  }
  q.generation++;

  // The life of the figure: it grows for a little under half its time,
  // churns at full size, then withers back to where it began.
  // (Tuned by simulation: full size around 14s, original figure by 30s.)
  let growth = t < 0.45 ? 0.05 : t < 0.7 ? 0.12 : 0;
  let decay = t < 0.45 ? 0 : t < 0.7 ? 0.05 : map(t, 0.7, 1, 0.01, 0.2);
  let withering = t >= 0.7;

  let r = q.rng;
  let n = q.glyphs.length;
  let next = new Map();
  let births = new Map(); // empty neighbours and the live cells around them
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let [id, c] of q.cells) {
    let live = 0;
    for (let [dx, dy] of dirs) {
      let x = c.x + dx, y = c.y + dy;
      let nid = x + ',' + y;
      if (q.cells.has(nid)) {
        live++;
      } else if (x >= 0 && x < CANVAS_COLS && y >= QUICKEN_TOP_ROWS && y < CANVAS_ROWS) {
        if (!births.has(nid)) births.set(nid, { x, y, parents: [] });
        births.get(nid).parents.push(c);
      }
    }
    // Overcrowded cells die; others may fade once the figure is withering.
    // The original glyphs persist, so the figure can return.
    let dies = !c.home && (live === 4 || r() < decay);
    if (dies) continue;
    // While withering, the original cells settle one by one on the glyph they
    // started with, so the figure returns gradually rather than all at once.
    if (c.home && (c.settled || (withering && r() < decay * 2))) {
      next.set(id, Object.assign({}, c, { g: c.homeG, settled: true }));
      continue;
    }
    // Each cell turns by the number of its neighbours: lone cells hold still.
    next.set(id, Object.assign({}, c, { g: (c.g + live) % n }));
  }

  if (growth > 0) {
    for (let [id, b] of births) {
      if (next.size >= QUICKEN_MAX_CELLS) break;
      let k = b.parents.length;
      let chance = k === 1 ? growth : k === 2 ? growth / 2 : 0.4; // gaps among three or four cells fill in fast
      if (r() >= chance) continue;
      let g = b.parents.reduce((sum, p) => sum + p.g, 0) % n;
      let p = b.parents[Math.floor(r() * k)];
      next.set(id, { x: b.x, y: b.y, g, flipH: p.flipH, flipV: p.flipV, home: false });
    }
  }

  q.cells = next;

  // The ground colour drifts once around the hue circle, ending where it began.
  push();
  colorMode(HSB, 360, 100, 100);
  let b = q.baseColor;
  baseColor = color((hue(b) + t * 360) % 360, saturation(b), brightness(b));
  pop();
  // The glyphs keep the figure's original tint, so the tinted spritesheet in
  // sketch.js is made once rather than on every step.
  updateBodyBackground();

  if (q.generation % QUICKEN_SOUND_EVERY === 0) quickenSound(q);

  tiles = quickenTiles(q);
  glitchTitle(q, t, withering);
  q.timer = setTimeout(quickenStep, QUICKEN_STEP);
}

function quickenTiles(q) {
  let out = [];
  for (let c of q.cells.values()) {
    let key = q.glyphs[c.g];
    out.push({
      pos: createVector(c.x * globalVars.TILE_WIDTH, c.y * globalVars.TILE_HEIGHT),
      key,
      coords: spritesheetData.tiles[key],
      flipH: c.flipH,
      flipV: c.flipV
    });
  }
  return out;
}

// A sound chosen by the figure's size, pitched by the generation.
function quickenSound(q) {
  let s = sounds[q.cells.size % sounds.length];
  s.rate(map((q.generation / QUICKEN_SOUND_EVERY) % 8, 0, 8, 0.5, 2));
  s.play();
  reverb.process(s); // no length given, so the reverb isn't rebuilt each time
}

// Settle back to the figure as it was first drawn, colours included.
function finishQuickening() {
  let q = quickening;
  quickening = null;
  tiles = q.original;
  figureName = q.name;
  baseColor = q.baseColor;
  tintcolor = q.tintcolor;
  updateBodyBackground();
}

// --- the title -------------------------------------------------------------

function glitchTitle(q, t, withering) {
  if (withering) {
    // Repair a few letters each step, enough to finish by the end.
    let stepsLeft = Math.max(1, ((1 - t) * QUICKEN_DURATION) / QUICKEN_STEP);
    let fixes = Math.ceil((figureName.length + q.name.length) / stepsLeft);
    for (let i = 0; i < fixes && figureName !== q.name; i++) {
      figureName = repairOnce(figureName, q.name);
    }
    return;
  }

  let r = q.rng;
  let intensity = Math.min(1, t / 0.45); // grows with the figure
  let chars = Array.from(figureName);

  if (q.generation % GLITCH_LETTERS_EVERY === 0) {
    let ops = 1 + Math.floor(r() * intensity * 4);
    for (let i = 0; i < ops; i++) glitchLetter(chars, q);
  }

  if (q.generation % GLITCH_WORDS_EVERY === 0) {
    // The name the arrangement on screen now would be given. (This reseeds
    // Math.random from the layout, as it does for every figure.)
    let echo = generateFigureNameFromTiles().split(/[\s_]+/).filter(w => w);
    let words = chars.join('').split(' ').filter(w => w);
    let word = echo.length ? echo[Math.floor(r() * echo.length)] : '';
    let at = Math.floor(r() * words.length);
    let roll = r();
    if (word && roll < 0.5) words[at] = word;                       // replace a word
    else if (word && roll < 0.8) words.splice(at, 0, word);         // add a word
    else if (words.length > 2) words.splice(at, 1);                 // lose a word
    chars = Array.from(words.join(' '));
  }

  // Keep it to about two lines, so it stays clear of the figure.
  let maxLength = Math.max(q.name.length, 2 * CANVAS_COLS - 4);
  figureName = chars.slice(0, maxLength).join('');
}

function glitchLetter(chars, q) {
  let r = q.rng;
  if (chars.length === 0) return;
  let i = Math.floor(r() * chars.length);
  if (chars[i] === ' ') return; // leave word breaks alone; word glitches handle them
  let roll = r();
  if (roll < 0.35) {
    // A glyph from a living cell of the figure.
    let pick = Math.floor(r() * q.cells.size);
    for (let c of q.cells.values()) {
      if (pick-- === 0) { chars[i] = glyphChar(c.g); break; }
    }
  } else if (roll < 0.6 && i + 1 < chars.length && chars[i + 1] !== ' ') {
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];            // swap neighbours
  } else if (roll < 0.8) {
    chars.splice(i, 0, chars[i]);                                   // stutter
  } else {
    chars[i] = String.fromCharCode(65 + Math.floor(r() * 26));      // another letter
  }
}

// One edit toward the original title, at the first place they differ.
function repairOnce(current, target) {
  let a = Array.from(current), b = Array.from(target);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length > b.length) a.splice(i, 1);
  else if (a.length < b.length) a.splice(i, 0, b[i]);
  else a[i] = b[i];
  return a.join('');
}
