// sketch.js
// Main p5 sketch: figure generation, drawing and keys.

let tintcolor;

let CANVAS_COLS;
let CANVAS_ROWS;
let shouldInvertColors = false;
let figureName = '';
let currentSeed = null;
let rng = Math.random;
let tileKeys = [];
let numTiles = 0;
let usedPositions = [];
let currentTileIndex = 0;
let reverb;
let placementTimeout = null;
let premadeTiles = null;

const tilePlacementDelayNormal = 50; 
const tilePlacementDelayInverted = 0; 

const FIGURE_HOLD = 1000;
let figureHoldUntil = 0;
let pendingFigure = null;
let figureHoldTimer = null;

function preload() {
  spritesheet = loadImage(globalVars.SPRITESHEET_PATH);
  spritesheetData = loadJSON(globalVars.SPRITE_DATA_PATH);
  for (let i = 0; i < 23; i++) {
    sounds[i] = loadSound(`./assets/sounds/${i}.wav`);
  }
  preloadCorporaFiles();
  preloadTilemaps();
}

// One tile name per distinct glyph, keyed by "col,row".
function buildUniqueTiles() {
  let uniqueTiles = {};
  for (let key in spritesheetData.tiles) {
    let coords = spritesheetData.tiles[key].toString();
    if (!uniqueTiles[coords]) {
      uniqueTiles[coords] = key;
    }
  }
  spritesheetData.uniqueTiles = uniqueTiles;
  spritesheetData.glyphList = Object.values(uniqueTiles);
}

const GLYPH_CHAR_BASE = 0xE000;

function glyphChar(index) {
  return String.fromCharCode(GLYPH_CHAR_BASE + index);
}

const SCALE_STORAGE_KEY = 'manticDisplayScale';
const MAX_DISPLAY_SCALE = 8;
let displayScale = loadDisplayScale();

function loadDisplayScale() {
  let s = parseInt(localStorage.getItem(SCALE_STORAGE_KEY), 10);
  return (s >= 1 && s <= MAX_DISPLAY_SCALE) ? s : 1;
}

function changeDisplayScale(step) {
  let next = constrain(displayScale + step, 1, MAX_DISPLAY_SCALE);
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

// Enlarge the canvas with CSS; run after createCanvas()/resizeCanvas().
function applyDisplayScale() {
  let c = document.querySelector('canvas');
  c.style.width = (width * displayScale) + 'px';
  c.style.height = (height * displayScale) + 'px';
}

function setup() {
  buildUniqueTiles();
  updateGridSize();
  createCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  pixelDensity(1);
  frameRate(30);
  noSmooth();
  applyDisplayScale();
  reverb = new p5.Reverb();
  reverb.set(1, 3);
  setupTraceryGrammar();
  startBoot();
  setupChordInput();
  setupArchive();
}

let resizeTimeout;
function windowResized() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(refitCanvas, 200);
}

function refitCanvas() {
  let prevCols = CANVAS_COLS;
  let prevRows = CANVAS_ROWS;
  updateGridSize();
  applyDisplayScale();
  if (CANVAS_COLS === prevCols && CANVAS_ROWS === prevRows) return;
  resizeCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  noSmooth();
  applyDisplayScale();
  if (booting || loading) return;
  showFigure(currentSeed);
}

function draw() {
  if (booting) {
    drawBoot();
    return;
  }
  if (loading) {
    let loaderSheet = loaderBackground();
    drawLoader();
    drawLoaderAdjusting();
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
  drawArchiveMessage();
  drawVariationIndicator();
  drawPadTiles(sheet);
  drawPlanetaryHour();
}

// Pick a seed when none is given (mouse click, space bar, first load).
function randomSeedString() {
  return 'r' + crypto.getRandomValues(new Uint32Array(1))[0];
}

// Seeded stand-in for p5's random().
function rnd(a, b) {
  let r = rng();
  if (a === undefined) return r;
  if (Array.isArray(a)) return a[Math.floor(r * a.length)];
  if (b === undefined) return r * a;
  return a + r * (b - a);
}

// Ask for a figure; waits for the current figure's hold to end.
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
  if (withLoader) startLoader(seed);
  else showFigure(seed);
}

// Show the pending figure when the hold ends.
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

// Draw the figure the seed determines.
function showFigure(seed) {
  stopLoader();
  clearTimeout(figureHoldTimer);
  figureHoldTimer = null;
  figureHoldUntil = Infinity;
  endBoot();
  stopQuickening();
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
  if (premadeTiles && premadeTiles.length === 0) premadeTiles = null;

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
  reverb.process(randomSound);
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
    maybeQuicken(currentSeed);
    figureHoldUntil = millis() + FIGURE_HOLD;
    scheduleFigureHold();
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
  if (!tile.flipH && !tile.flipV) {
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

// Match the page background to the canvas.
function updateBodyBackground() {
  let c = shouldInvertColors ? invertColor(baseColor) : baseColor;
  document.body.style.backgroundColor = `rgb(${Math.round(red(c))}, ${Math.round(green(c))}, ${Math.round(blue(c))})`;
}

// The glyph tint for a background.
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

const COMPLEMENT_WHITENESS = 0.5;
const COMPLEMENT_MIN_CONTRAST = 60;
let complementSheet = null;
let complementSheetKey = '';

// White glyphs tinted with the complement of bg, cached.
function complementWhiteSpritesheet(bg) {
  let seen = shouldInvertColors ? invertColor(bg) : bg;
  let shown = lerpColor(complementColor(seen), color(255), COMPLEMENT_WHITENESS);
  let lumShown = luminance(shown), lumBg = luminance(seen);
  if (Math.abs(lumShown - lumBg) < COMPLEMENT_MIN_CONTRAST) {
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

// Black or white glyphs, whichever reads better on bg.
function contrastSpritesheet(bg) {
  let seen = shouldInvertColors ? invertColor(bg) : bg;
  let white = isDark(seen) !== shouldInvertColors;
  return white ? whiteSpritesheet() : spritesheet;
}

function displayFigureName(name) {
  displayText(name, 2 * globalVars.TILE_HEIGHT, false);
}

function displayText(name, startY, isInverted) {
  let displayText = name.replace(/_/g, " ");
  let displayWords = displayText.split(' ');
  let lineHeight = globalVars.TILE_HEIGHT;
  let maxCols = CANVAS_COLS;
  let currentLine = '';
  let lines = [];

  for (let word of displayWords) {
    if (currentLine.length + word.length + 1 > maxCols) {
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

// Space/Enter random, Q quickening, arrows knob, +/- scale.
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
    initializeSketch(randomQuickeningSeed(), true);
    return false;
  }
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    nudgeKnob(keyCode === RIGHT_ARROW ? -1 : 1);
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
  let origin = tiles[0].pos;
  let key = tiles.map(tile => {
    let dx = Math.round((tile.pos.x - origin.x) / globalVars.TILE_WIDTH);
    let dy = Math.round((tile.pos.y - origin.y) / globalVars.TILE_HEIGHT);
    return `${dx},${dy},${tile.key},${tile.flipH},${tile.flipV}`;
  }).join(';');
  
  Math.seedrandom(key);
  
  return generateFigureName();
}

