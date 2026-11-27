// quicken.js
// Rarely, a figure comes alive as a cellular automaton, then settles.

const QUICKEN_CHANCE = 0.01;
const QUICKEN_DELAY = 1500;
const QUICKEN_DURATION = 30000;
const QUICKEN_STEP = 100;
const QUICKEN_MAX_CELLS = 400;
const QUICKEN_TOP_ROWS = 5;
const QUICKEN_SOUND_EVERY = 15;
const GLITCH_LETTERS_EVERY = 3;
const GLITCH_WORDS_EVERY = 15;
const IDLE_QUICKEN_INTERVAL = 5 * 60000;
const IDLE_QUICKEN_CHANCE = 0.25;

let quickening = null;
let idleQuickenTimer = null;

// Called on every input (archive.js noteUserActivity): restart the idle count.
function resetIdleQuicken() {
  clearInterval(idleQuickenTimer);
  idleQuickenTimer = setInterval(idleQuickenChance, IDLE_QUICKEN_INTERVAL);
}

function idleQuickenChance() {
  if (booting || loading || isQuickening() || isAttractMode()) return;
  let r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  if (r >= IDLE_QUICKEN_CHANCE) return;
  console.log('Idle: showing a quickening figure');
  initializeSketch(randomQuickeningSeed(), true);
}

function quickenRng(seed) {
  return new Math.seedrandom('mantic-quicken:' + seed);
}

function seedQuickens(seed) {
  return quickenRng(seed)() < QUICKEN_CHANCE;
}

// A random seed that quickens.
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

  let glyphs = spritesheetData.glyphList || [];
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
    name: figureName,
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
  let t = (millis() - q.start) / QUICKEN_DURATION;
  if (t >= 1) {
    finishQuickening();
    return;
  }
  q.generation++;

  let growth = t < 0.45 ? 0.05 : t < 0.7 ? 0.12 : 0;
  let decay = t < 0.45 ? 0 : t < 0.7 ? 0.05 : map(t, 0.7, 1, 0.01, 0.2);
  let withering = t >= 0.7;

  let r = q.rng;
  let n = q.glyphs.length;
  let next = new Map();
  let births = new Map();
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
    let dies = !c.home && (live === 4 || r() < decay);
    if (dies) continue;
    if (c.home && (c.settled || (withering && r() < decay * 2))) {
      next.set(id, Object.assign({}, c, { g: c.homeG, settled: true }));
      continue;
    }
    next.set(id, Object.assign({}, c, { g: (c.g + live) % n }));
  }

  if (growth > 0) {
    for (let [id, b] of births) {
      if (next.size >= QUICKEN_MAX_CELLS) break;
      let k = b.parents.length;
      let chance = k === 1 ? growth : k === 2 ? growth / 2 : 0.4;
      if (r() >= chance) continue;
      let g = b.parents.reduce((sum, p) => sum + p.g, 0) % n;
      let p = b.parents[Math.floor(r() * k)];
      next.set(id, { x: b.x, y: b.y, g, flipH: p.flipH, flipV: p.flipV, home: false });
    }
  }

  q.cells = next;

  push();
  colorMode(HSB, 360, 100, 100);
  let b = q.baseColor;
  baseColor = color((hue(b) + t * 360) % 360, saturation(b), brightness(b));
  pop();
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
  reverb.process(s);
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

function glitchTitle(q, t, withering) {
  if (withering) {
    let stepsLeft = Math.max(1, ((1 - t) * QUICKEN_DURATION) / QUICKEN_STEP);
    let fixes = Math.ceil((figureName.length + q.name.length) / stepsLeft);
    for (let i = 0; i < fixes && figureName !== q.name; i++) {
      figureName = repairOnce(figureName, q.name);
    }
    return;
  }

  let r = q.rng;
  let intensity = Math.min(1, t / 0.45);
  let chars = Array.from(figureName);

  if (q.generation % GLITCH_LETTERS_EVERY === 0) {
    let ops = 1 + Math.floor(r() * intensity * 4);
    for (let i = 0; i < ops; i++) glitchLetter(chars, q);
  }

  if (q.generation % GLITCH_WORDS_EVERY === 0) {
    let echo = generateFigureNameFromTiles().split(/[\s_]+/).filter(w => w);
    let words = chars.join('').split(' ').filter(w => w);
    let word = echo.length ? echo[Math.floor(r() * echo.length)] : '';
    let at = Math.floor(r() * words.length);
    let roll = r();
    if (word && roll < 0.5) words[at] = word;
    else if (word && roll < 0.8) words.splice(at, 0, word);
    else if (words.length > 2) words.splice(at, 1);
    chars = Array.from(words.join(' '));
  }

  let maxLength = Math.max(q.name.length, 2 * CANVAS_COLS - 4);
  figureName = chars.slice(0, maxLength).join('');
}

function glitchLetter(chars, q) {
  let r = q.rng;
  if (chars.length === 0) return;
  let i = Math.floor(r() * chars.length);
  if (chars[i] === ' ') return;
  let roll = r();
  if (roll < 0.35) {
    let pick = Math.floor(r() * q.cells.size);
    for (let c of q.cells.values()) {
      if (pick-- === 0) { chars[i] = glyphChar(c.g); break; }
    }
  } else if (roll < 0.6 && i + 1 < chars.length && chars[i + 1] !== ' ') {
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  } else if (roll < 0.8) {
    chars.splice(i, 0, chars[i]);
  } else {
    chars[i] = String.fromCharCode(65 + Math.floor(r() * 26));
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
