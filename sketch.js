let tintcolor;

let CANVAS_COLS;
let CANVAS_ROWS;
let shouldInvertColors = false;
let figureName = '';
let currentSeed = null; // the seed that produced the figure on screen
let rng = Math.random;  // per-figure seeded generator, replaced in showFigure()
let tileKeys = [];
let numTiles = 0;
let usedPositions = [];
let currentTileIndex = 0;
let reverb;
let placementTimeout = null;
let premadeTiles = null; // tiles of a pre-made arrangement being placed (tilemaps.js), or null

const tilePlacementDelayNormal = 50; 
const tilePlacementDelayInverted = 0; 

// Once a figure is complete it stays up for at least FIGURE_HOLD ms. A new
// figure asked for while one is being drawn or held waits until the hold
// ends; if several are asked for meanwhile, only the latest is shown.
const FIGURE_HOLD = 1000;
let figureHoldUntil = 0;     // millis() when a new figure may appear; Infinity while drawing
let pendingFigure = null;    // { seed, withLoader } waiting for the hold to end, or null
let figureHoldTimer = null;

function preload() {
  spritesheet = loadImage(globalVars.SPRITESHEET_PATH);
  spritesheetData = loadJSON(globalVars.SPRITE_DATA_PATH);
  for (let i = 0; i < 23; i++) {
    sounds[i] = loadSound(`./assets/sounds/${i}.wav`);
  }
  preloadCorporaFiles();
  preloadTilemaps(); // tilemaps.js
}

// One tile name per distinct glyph (several names share a glyph), keyed by
// "col,row". Built in setup(): in preload() the JSON hasn't arrived yet.
function buildUniqueTiles() {
  let uniqueTiles = {};
  for (let key in spritesheetData.tiles) {
    let coords = spritesheetData.tiles[key].toString();
    if (!uniqueTiles[coords]) {
      uniqueTiles[coords] = key;
    }
  }
  spritesheetData.uniqueTiles = uniqueTiles;
  spritesheetData.glyphList = Object.values(uniqueTiles); // one tile name per distinct glyph
}

// Text can carry any glyph from the spritesheet as a private-use character
// (U+E000 + its index in glyphList). quicken.js uses these to glitch titles.
const GLYPH_CHAR_BASE = 0xE000;

function glyphChar(index) {
  return String.fromCharCode(GLYPH_CHAR_BASE + index);
}

// Display scale: each tile is drawn this many times larger on screen, so a
// projector can show bigger glyphs. Whole numbers only, so every spritesheet
// pixel becomes the same number of screen pixels (fractions give uneven lines).
// Changed with the + and - keys and remembered across restarts.
const SCALE_STORAGE_KEY = 'manticDisplayScale';
const MAX_DISPLAY_SCALE = 8;
let displayScale = loadDisplayScale();

function loadDisplayScale() {
  let s = parseInt(localStorage.getItem(SCALE_STORAGE_KEY), 10);
  return (s >= 1 && s <= MAX_DISPLAY_SCALE) ? s : 1;
}

function changeDisplayScale(step) {
  let next = constrain(displayScale + step, 1, MAX_DISPLAY_SCALE);
  // Keep at least a few tiles across, or the figure has nowhere to grow.
  if (step > 0 && windowWidth / (globalVars.TILE_WIDTH * next) < 4) next = displayScale;
  if (next !== displayScale) {
    displayScale = next;
    localStorage.setItem(SCALE_STORAGE_KEY, String(displayScale));
    refitCanvas();
  }
  showArchiveMessage(`SIZE ${displayScale}X`);
}

function updateGridSize() {
  CANVAS_COLS = Math.floor(windowWidth / (globalVars.TILE_WIDTH * displayScale));
  CANVAS_ROWS = Math.floor(windowHeight / (globalVars.TILE_HEIGHT * displayScale));
}

// The sketch draws at 1x; CSS enlarges the canvas (image-rendering: pixelated
// in style.css keeps the enlargement sharp). Must run after createCanvas() or
// resizeCanvas(), which overwrite the canvas's style size.
function applyDisplayScale() {
  let c = document.querySelector('canvas');
  c.style.width = (width * displayScale) + 'px';
  c.style.height = (height * displayScale) + 'px';
}

function setup() {
  buildUniqueTiles();
  updateGridSize();
  createCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  // One canvas pixel per tile pixel, even on high-DPI screens: CSS enlarges
  // it (pixelated), so a 2x screen doesn't mean drawing 4x the pixels.
  pixelDensity(1);
  // Nothing on screen changes faster than ~20 times a second (tile placement,
  // quickening steps), so 30fps looks the same as 60 at half the work.
  frameRate(30);
  // On high-DPI screens each 40x30 tile is scaled up, and smoothing would
  // sample the neighbouring glyph on the spritesheet, leaving faint lines
  // around tiles. Nearest-neighbour keeps the scaling exact.
  noSmooth();
  applyDisplayScale();
  reverb = new p5.Reverb();
  reverb.set(1, 3); // build the impulse once (1 s, decay 3); process() then just connects
  setupTraceryGrammar();
  startBoot();       // boot.js: title screen; the first figure follows it
  setupChordInput(); // input.js: MIDI chords from the Nano ESP32 or a MIDI keyboard
  setupArchive();    // archive.js: saved seeds and attract mode
}

// Refit the canvas to the new viewport. Debounced so dragging a window edge
// doesn't start a new figure on every resize event.
let resizeTimeout;
function windowResized() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(refitCanvas, 200);
}

function refitCanvas() {
  let prevCols = CANVAS_COLS;
  let prevRows = CANVAS_ROWS;
  updateGridSize();
  applyDisplayScale(); // the window may have changed even if the grid didn't
  if (CANVAS_COLS === prevCols && CANVAS_ROWS === prevRows) return;
  resizeCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  noSmooth(); // resizing can reset the canvas context's settings
  applyDisplayScale();
  if (booting || loading) return; // boot.js and loader.js redraw to fit; no figure to lay out yet
  // Existing tile positions may fall outside the new grid, so lay the same figure out again.
  // (Not a new figure, so it skips the hold.)
  showFigure(currentSeed);
}

function draw() {
  if (booting) {
    drawBoot(); // boot.js
    return;
  }
  if (loading) { // loader.js: "TESTING ..." lines before the figure
    let loaderSheet = loaderBackground();
    drawLoader();
    drawArchiveMessage();
    drawPadTiles(loaderSheet);
    drawPlanetaryHour();
    return;
  }
  background(baseColor);
  let sheet = tintedSpritesheet();
  for (let tile of tiles) {
    drawTile(tile, sheet);
  }
  if (figureName) {
    displayFigureName(figureName);
  }
  drawArchiveMessage(); // archive.js: brief notices such as "SAVED"
  drawVariationIndicator(); // input.js: knob zone, shown briefly while turning
  drawPadTiles(sheet); // input.js: a glyph for each pad touched in the gesture
  drawPlanetaryHour(); // planetaryHours.js: the current planetary hour, top row
}

// Pick a seed when none is given (mouse click, space bar, first load).
function randomSeedString() {
  return 'r' + crypto.getRandomValues(new Uint32Array(1))[0];
}

// Seeded stand-in for p5's random(): no args -> [0,1), array -> element, (a) -> [0,a), (a,b) -> [a,b).
function rnd(a, b) {
  let r = rng();
  if (a === undefined) return r;
  if (Array.isArray(a)) return a[Math.floor(r * a.length)];
  if (b === undefined) return r * a;
  return a + r * (b - a);
}

// Ask for a figure (chord, key, click, attract mode). Shown at once unless
// the figure on screen is still being drawn or within its FIGURE_HOLD.
// withLoader: visitor requests (chords, random button, space/click) first
// show the loading screen (loader.js). While it runs, any new request just
// replaces the seed it will show.
function initializeSketch(seed, withLoader = false) {
  if (loading) {
    loaderSeed = seed;
    return;
  }
  if (booting || millis() >= figureHoldUntil) {
    pendingFigure = null;
    beginFigure(seed, withLoader);
    return;
  }
  pendingFigure = { seed, withLoader };
  scheduleFigureHold();
}

function beginFigure(seed, withLoader) {
  if (withLoader) startLoader(seed); // loader.js; calls showFigure() when done
  else showFigure(seed);
}

// Show the pending figure when the hold ends. While a figure is still being
// drawn its hold hasn't started; placeNextTile() calls this once it's done.
function scheduleFigureHold() {
  clearTimeout(figureHoldTimer);
  figureHoldTimer = null;
  if (!pendingFigure || figureHoldUntil === Infinity) return;
  figureHoldTimer = setTimeout(() => {
    let next = pendingFigure;
    pendingFigure = null;
    if (next) beginFigure(next.seed, next.withLoader);
  }, Math.max(0, figureHoldUntil - millis()));
}

// The seed fully determines the figure: glyphs, flips, layout, colour,
// inversion, sound and (via the layout) the name. Some chords show a
// pre-made arrangement instead of a generated layout (tilemaps.js).
function showFigure(seed) {
  stopLoader(); // loader.js
  clearTimeout(figureHoldTimer);
  figureHoldTimer = null;
  figureHoldUntil = Infinity; // the hold starts once the figure is complete
  endBoot(); // boot.js: any figure (chord, key, click, attract mode) ends the boot screen
  stopQuickening(); // quicken.js
  // Stop any tile placement still running from the previous figure.
  clearTimeout(placementTimeout);
  placementTimeout = null;
  figureName = '';

  currentSeed = (seed === undefined || seed === null) ? randomSeedString() : String(seed);
  rng = new Math.seedrandom('mantic:' + currentSeed);
  console.log(`Figure seed: ${currentSeed}`);

  randomizeBackgroundColor();
  
  tileKeys = Object.keys(spritesheetData.tiles);
  let centerX = Math.floor(CANVAS_COLS / 2) * globalVars.TILE_WIDTH;
  let centerY = Math.floor(CANVAS_ROWS / 2) * globalVars.TILE_HEIGHT;

  tiles = [];
  usedPositions = [];
  currentTileIndex = 0;

  let map = tilemapForSeed(currentSeed);
  premadeTiles = map ? tilesFromTilemap(map, centerX, centerY) : null;
  if (premadeTiles && premadeTiles.length === 0) premadeTiles = null; // didn't fit on screen

  if (premadeTiles) {
    numTiles = premadeTiles.length;
    tiles.push(premadeTiles[0]);
  } else {
    numTiles = Math.floor(rnd(2, 11));
    let initialKey = rnd(tileKeys);
    let initialTile = {
      pos: createVector(centerX, centerY),
      key: initialKey,
      coords: spritesheetData.tiles[initialKey],
      flipH: rnd() > 0.8,
      flipV: rnd() > 0.8
    };
    tiles.push(initialTile);
    usedPositions.push(initialTile.pos);
  }
  
  tintcolor = complementColor(baseColor);
  
  shouldInvertColors = rnd() < 0.1;
  // Inverted figures are flipped by CSS (canvas.inverted in style.css), which
  // the GPU does for free. p5's filter(INVERT) would copy the whole canvas
  // through WebGL and back on every frame.
  document.querySelector('canvas').classList.toggle('inverted', shouldInvertColors);

  updateBodyBackground();

  placeNextTile();
}

function playRandomSound() {
  let randomIndex = Math.floor(rnd(sounds.length));
  let randomSound = sounds[randomIndex];
  let randomRate = rnd(0.5, 2.0);
  randomSound.rate(randomRate);
  randomSound.play();
  reverb.process(randomSound); // impulse set in setup(); rebuilding it per figure stalls audio
}

function placeNextTile() {
  if (currentTileIndex < numTiles - 1) {
    currentTileIndex++;
    let delay = shouldInvertColors ? tilePlacementDelayInverted : tilePlacementDelayNormal;
    placementTimeout = setTimeout(() => {
      if (premadeTiles) {
        tiles.push(premadeTiles[currentTileIndex]);
        placeNextTile();
        return;
      }
      let tileKey = rnd(tileKeys);
      let tilePos = spritesheetData.tiles[tileKey];
      
      let pos = findRandomAdjacentPosition(usedPositions);
      
      tiles.push({
        pos: pos,
        key: tileKey,
        coords: tilePos,
        flipH: rnd() > 0.8,
        flipV: rnd() > 0.8
      });
      
      usedPositions.push(pos);
      placeNextTile();
    }, delay);
  } else {
    playRandomSound(); 
    figureName = premadeTiles ? tilemapTitle(currentSeed) : generateFigureNameFromTiles(); 
    maybeQuicken(currentSeed); // quicken.js: rarely, the figure comes alive
    figureHoldUntil = millis() + FIGURE_HOLD;
    scheduleFigureHold(); // show any figure asked for while this one was drawn
  }
}

function findRandomAdjacentPosition(usedPositions) {
  let validPositions = [];
  
  while (validPositions.length === 0) {
    let basePos = rnd(usedPositions);
    let adjacentPositions = [
      createVector(basePos.x + globalVars.TILE_WIDTH, basePos.y),
      createVector(basePos.x - globalVars.TILE_WIDTH, basePos.y),
      createVector(basePos.x, basePos.y + globalVars.TILE_HEIGHT),
      createVector(basePos.x, basePos.y - globalVars.TILE_HEIGHT)
    ];

    validPositions = adjacentPositions.filter(pos => 
      pos.x >= 0 && pos.x < CANVAS_COLS * globalVars.TILE_WIDTH && 
      pos.y >= 0 && pos.y < CANVAS_ROWS * globalVars.TILE_HEIGHT && 
      !usedPositions.some(p => p.equals(pos))
    );
  }
  
  return rnd(validPositions);
}

// p5 (1.9) re-tints the whole spritesheet on every tinted image() call, so
// keep one tinted copy and redo it only when the tint colour changes. This
// matters with hundreds of tiles on screen (quicken.js).
let tintedSheet = null;
let tintedSheetKey = '';

function tintedSpritesheet() {
  let k = tintcolor.toString();
  if (k !== tintedSheetKey) {
    if (!tintedSheet) {
      tintedSheet = createGraphics(spritesheet.width, spritesheet.height);
      tintedSheet.pixelDensity(1);
      tintedSheet.noSmooth();
    }
    tintedSheet.clear();
    tintedSheet.tint(tintcolor);
    tintedSheet.image(spritesheet, 0, 0);
    tintedSheetKey = k;
  }
  return tintedSheet;
}

function drawTile(tile, sheet) {
  let sx = tile.coords[0] * globalVars.TILE_WIDTH;
  let sy = tile.coords[1] * globalVars.TILE_HEIGHT;
  let dx = tile.pos.x;
  let dy = tile.pos.y;
  if (!tile.flipH && !tile.flipV) { // most tiles: no transform needed
    image(sheet, dx, dy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
    return;
  }
  push();
  translate(dx + globalVars.TILE_HALF_WIDTH, dy + globalVars.TILE_HALF_HEIGHT);
  if (tile.flipH) scale(-1, 1);
  if (tile.flipV) scale(1, -1);
  image(sheet, -globalVars.TILE_HALF_WIDTH, -globalVars.TILE_HALF_HEIGHT, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
  pop();
}

function randomizeBackgroundColor() {
  baseColor = color(rnd(100, 255), rnd(100, 255), rnd(100, 255));
}

// Match the page background to the canvas so the letterbox area blends in.
// When the frame is inverted, CSS flips the canvas, so invert here too.
function updateBodyBackground() {
  let c = shouldInvertColors ? invertColor(baseColor) : baseColor;
  document.body.style.backgroundColor = `rgb(${Math.round(red(c))}, ${Math.round(green(c))}, ${Math.round(blue(c))})`;
}

// The glyph tint for a background: its complement (300 minus each channel,
// clamped to 255). Also used by loader.js.
function complementColor(c) {
  return color(300 - red(c), 300 - green(c), 300 - blue(c));
}

// What CSS inversion (canvas.inverted) turns a colour into.
function invertColor(c) {
  return color(255 - red(c), 255 - green(c), 255 - blue(c));
}

// Perceived brightness, 0 (black) to 255 (white).
function luminance(c) {
  return 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c);
}

// Lettering in white tinted with the complement of the background, used for
// the loading screen's lines (loader.js) and the date line (planetaryHours.js).
// 0 = the background's full complement, 1 = plain white.
const COMPLEMENT_WHITENESS = 0.5;
// Least difference in luminance() between the tinted lettering and the
// background. Closer than this (as on mid-grey grounds, whose complement is
// another mid-grey) and the tint fades toward white until it reaches it. On
// grounds so light that even white can't, it darkens instead.
const COMPLEMENT_MIN_CONTRAST = 60;
let complementSheet = null;
let complementSheetKey = '';

// White glyphs (boot.js) tinted with complementColor() of bg as seen on
// screen, lightened toward white. An inverted figure's canvas is flipped by
// CSS, so the tint is pre-inverted to match. Cached until the colour changes.
function complementWhiteSpritesheet(bg) {
  let seen = shouldInvertColors ? invertColor(bg) : bg;
  let shown = lerpColor(complementColor(seen), color(255), COMPLEMENT_WHITENESS);
  let lumShown = luminance(shown), lumBg = luminance(seen);
  if (Math.abs(lumShown - lumBg) < COMPLEMENT_MIN_CONTRAST) {
    // luminance() is linear, so these are how far toward white (or black)
    // give exactly the contrast.
    if (lumBg + COMPLEMENT_MIN_CONTRAST <= 255) {
      let t = (lumBg + COMPLEMENT_MIN_CONTRAST - lumShown) / (255 - lumShown);
      shown = lerpColor(shown, color(255), constrain(t, 0, 1));
    } else {
      let t = (lumShown - (lumBg - COMPLEMENT_MIN_CONTRAST)) / lumShown;
      shown = lerpColor(shown, color(0), constrain(t, 0, 1));
    }
  }
  let c = shouldInvertColors ? invertColor(shown) : shown;

  let key = c.toString();
  if (key !== complementSheetKey) {
    if (!complementSheet) {
      complementSheet = createGraphics(spritesheet.width, spritesheet.height);
      complementSheet.pixelDensity(1);
      complementSheet.noSmooth();
    }
    complementSheet.clear();
    complementSheet.tint(c);
    complementSheet.image(whiteSpritesheet(), 0, 0);
    complementSheetKey = key;
  }
  return complementSheet;
}

// Plain black or white glyphs, whichever reads better on bg as seen on
// screen. Under CSS inversion the sheet drawn is the opposite one.
function contrastSpritesheet(bg) {
  let seen = shouldInvertColors ? invertColor(bg) : bg;
  let white = isDark(seen) !== shouldInvertColors; // boot.js
  return white ? whiteSpritesheet() : spritesheet;
}

function displayFigureName(name) {
  displayText(name, 2 * globalVars.TILE_HEIGHT, false); // leave two empty rows above the title
}

function displayText(name, startY, isInverted) {
  let displayText = name.replace(/_/g, " ");
  let displayWords = displayText.split(' ');
  let lineHeight = globalVars.TILE_HEIGHT;
  let maxCols = CANVAS_COLS;
  let currentLine = '';
  let lines = [];

  for (let word of displayWords) {
    if (currentLine.length + word.length + 1 > maxCols) { // +1 for space
      lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  lines.push(currentLine.trim());

  if (isInverted) {
    let invertedText = "INVERTED";
    let invertedStartX = Math.floor((width - invertedText.length * globalVars.TILE_WIDTH) / 2);
    let invertedStartY = startY;

    for (let i = 0; i < invertedText.length; i++) {
      let tileChar = invertedText[i];
      let tilePos = spritesheetData.tiles[`LATIN_CAPITAL_LETTER_${tileChar}`];
      if (tilePos) {
        let sx = tilePos[0] * globalVars.TILE_WIDTH;
        let sy = tilePos[1] * globalVars.TILE_HEIGHT;
        image(spritesheet, invertedStartX + i * globalVars.TILE_WIDTH, invertedStartY, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
      }
    }
    startY += lineHeight;
  }

  for (let line of lines) {
    let startX = Math.floor((width - line.length * globalVars.TILE_WIDTH) / 2);
    for (let i = 0; i < line.length; i++) {
      displayTile(line[i], startX + i * globalVars.TILE_WIDTH, startY);
    }
    startY += lineHeight;
  }
}

function displayTile(char, col, row, sheet = spritesheet) {
  let tilePos;
  let glyph = spritesheetData.glyphList[char.charCodeAt(0) - GLYPH_CHAR_BASE];
  switch (glyph ? '' : char) {
    case '': tilePos = glyph; break;
    case 'š': tilePos = "LATIN_SMALL_LETTER_S_WITH_CARON"; break;
    case 'Š': tilePos = "LATIN_CAPITAL_LETTER_S_WITH_CARON"; break;
    case '!': tilePos = "EXCLAMATION_MARK"; break;
    case '@': tilePos = "COMMERCIAL_AT"; break;
    case '#': tilePos = "NUMBER_SIGN"; break;
    case '$': tilePos = "DOLLAR_SIGN"; break;
    case '%': tilePos = "PERCENT_SIGN"; break;
    case '^': tilePos = "CIRCUMFLEX_ACCENT"; break;
    case '&': tilePos = "AMPERSAND"; break;
    case '*': tilePos = "ASTERISK"; break;
    case ' ': tilePos = "BLANK"; break;
    case '(': tilePos = "LEFT_PARENTHESIS"; break;
    case ')': tilePos = "RIGHT_PARENTHESIS"; break;
    case '-': tilePos = "HYPHEN_MINUS"; break;
    case '_': tilePos = "LOW_LINE"; break;
    case '+': tilePos = "PLUS_SIGN"; break;
    case '=': tilePos = "EQUALS_SIGN"; break;
    case '.': tilePos = "FULL_STOP"; break;
    case ',': tilePos = "COMMA"; break;
    case ':': tilePos = "COLON"; break;
    case ';': tilePos = "SEMICOLON"; break;
    case '\'': tilePos = "APOSTROPHE"; break;
    case '"': tilePos = "QUOTATION_MARK"; break;
    case '<': tilePos = "LESS_THAN_SIGN"; break;
    case '>': tilePos = "GREATER_THAN_SIGN"; break;
    case '?': tilePos = "QUESTION_MARK"; break;
    case '/': tilePos = "SOLIDUS"; break;
    case '\\': tilePos = "REVERSE_SOLIDUS"; break;
    case '|': tilePos = "VERTICAL_LINE"; break;
    case '[': tilePos = "LEFT_SQUARE_BRACKET"; break;
    case ']': tilePos = "RIGHT_SQUARE_BRACKET"; break;
    default:
      if (char.match(/\d/)) {
        tilePos = `DIGIT_${char}`;
      } else if (char.match(/[a-zA-Z]/)) {
        tilePos = `LATIN_CAPITAL_LETTER_${char.toUpperCase()}`;
      } else {
        tilePos = "BLANK"; 
      }
  }

  if (tilePos && spritesheetData.tiles[tilePos]) {
    let sx = spritesheetData.tiles[tilePos][0] * globalVars.TILE_WIDTH;
    let sy = spritesheetData.tiles[tilePos][1] * globalVars.TILE_HEIGHT;
    image(sheet, col, row, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
  } else {
    console.error(`No tile mapping found for character: ${char}`);
  }
}

// Browsers keep audio switched off until the first click, key press or touch,
// so resume it from inside those handlers. (Electron allows audio from the start.)
// Space/Enter or a click starts a random figure (handy for testing; the
// installation itself is driven by MIDI chords). Cmd/Ctrl shortcuts are
// handled in archive.js. + and - change the display scale. Q shows a
// figure that quickens (quicken.js), which otherwise happens rarely. The
// left and right arrow keys turn the knob one position (input.js).
function keyPressed(event) {
  userStartAudio();
  if (event && (event.metaKey || event.ctrlKey)) return;
  if (key === ' ' || keyCode === ENTER) {
    stopAttractMode();
    initializeSketch(undefined, true);
    return false;
  }
  if (key === 'a' || key === 'A') {
    toggleAttractMode();
  }
  if (key === 'q' || key === 'Q') {
    stopAttractMode();
    initializeSketch(randomQuickeningSeed(), true); // quicken.js: test the rare animation
    return false;
  }
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    nudgeKnob(keyCode === RIGHT_ARROW ? -1 : 1); // input.js: stands in for the potentiometer
    return false;
  }
  if (key === '+' || key === '=') {
    changeDisplayScale(-1);
    return false;
  }
  if (key === '-' || key === '_') {
    changeDisplayScale(1);
    return false;
  }
}

function mousePressed() {
  userStartAudio();
  stopAttractMode();
  initializeSketch(undefined, true);
}

function touchStarted() {
  userStartAudio();
  stopAttractMode();
  initializeSketch(undefined, true);
  return false;
}

function generateFigureNameFromTiles() {
  // Create a unique key based on the tiles' grid offsets from the first tile,
  // keys, and flips, so the name doesn't depend on screen size.
  let origin = tiles[0].pos;
  let key = tiles.map(tile => {
    let dx = Math.round((tile.pos.x - origin.x) / globalVars.TILE_WIDTH);
    let dy = Math.round((tile.pos.y - origin.y) / globalVars.TILE_HEIGHT);
    return `${dx},${dy},${tile.key},${tile.flipH},${tile.flipV}`;
  }).join(';');
  
  // Use the key to seed a deterministic random generator
  Math.seedrandom(key);
  
  // Generate the figure name using the seeded generator
  return generateFigureName();
}

