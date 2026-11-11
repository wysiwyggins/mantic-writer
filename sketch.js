let tintcolor;

let CANVAS_COLS;
let CANVAS_ROWS;
let shouldInvertColors = false;
let hoveredTile = null;
let figureName = '';
let tileKeys = [];
let numTiles = 0;
let usedPositions = [];
let currentTileIndex = 0;
let reverb;
let placementTimeout = null;

const tilePlacementDelayNormal = 50; 
const tilePlacementDelayInverted = 0; 

function preload() {
  spritesheet = loadImage(globalVars.SPRITESHEET_PATH);
  spritesheetData = loadJSON(globalVars.SPRITE_DATA_PATH);
  for (let i = 0; i < 23; i++) {
    sounds[i] = loadSound(`./assets/sounds/${i}.wav`);
  }
  preloadCorporaFiles();
   
  let uniqueTiles = {};
  for (let key in spritesheetData.tiles) {
    let coords = spritesheetData.tiles[key].toString();
    if (!uniqueTiles[coords]) {
      uniqueTiles[coords] = key;
    }
  }
  spritesheetData.uniqueTiles = uniqueTiles;
}

function updateGridSize() {
  CANVAS_COLS = Math.floor(windowWidth / globalVars.TILE_WIDTH);
  CANVAS_ROWS = Math.floor(windowHeight / globalVars.TILE_HEIGHT);
}

function setup() {
  updateGridSize();
  createCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  initializeSketch();
  reverb = new p5.Reverb();
  setupTraceryGrammar();

  // In the Electron app, a touch on the GPIO panel starts a new figure.
  if (window.installation) {
    window.installation.onTouch(() => initializeSketch());
  }
}

// Refit the canvas to the new viewport. Debounced so dragging a window edge
// doesn't start a new figure on every resize event.
let resizeTimeout;
function windowResized() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    let prevCols = CANVAS_COLS;
    let prevRows = CANVAS_ROWS;
    updateGridSize();
    if (CANVAS_COLS === prevCols && CANVAS_ROWS === prevRows) return;
    resizeCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
    // Existing tile positions may fall outside the new grid, so start a fresh figure.
    initializeSketch();
  }, 200);
}

function draw() {
  background(baseColor);
  for (let tile of tiles) {
    drawTile(tile);
  }
  if (hoveredTile) {
    drawName(hoveredTile.key, hoveredTile.flipH || hoveredTile.flipV);
  }
  if (figureName) {
    displayFigureName(figureName);
  }
  if (shouldInvertColors) {
    filter(INVERT);
  }
}

function initializeSketch() {
  // Stop any tile placement still running from the previous figure.
  clearTimeout(placementTimeout);
  placementTimeout = null;
  figureName = '';

  randomizeBackgroundColor();
  
  tileKeys = Object.keys(spritesheetData.tiles);
  numTiles = int(random(2, 11));
  let centerX = Math.floor(CANVAS_COLS / 2) * globalVars.TILE_WIDTH;
  let centerY = Math.floor(CANVAS_ROWS / 2) * globalVars.TILE_HEIGHT;
  
  tiles = [];
  usedPositions = [];
  currentTileIndex = 0;

  let initialKey = random(tileKeys);
  let initialTile = {
    pos: createVector(centerX, centerY),
    key: initialKey,
    coords: spritesheetData.tiles[initialKey],
    flipH: random() > 0.8,  
    flipV: random() > 0.8  
  };
  tiles.push(initialTile);
  usedPositions.push(initialTile.pos);
  
  tintcolor = color(300 - red(baseColor), 300 - green(baseColor), 300 - blue(baseColor));
  
  if (random() < 0.1) { 
    shouldInvertColors = true;
  } else {
    shouldInvertColors = false;
  }

  updateBodyBackground();

  placeNextTile();
}

function playRandomSound() {
  let randomIndex = int(random(sounds.length));
  let randomSound = sounds[randomIndex];
  let randomRate = random(0.5, 2.0); 
  randomSound.rate(randomRate);
  randomSound.play();
  reverb.process(randomSound, 1, 3);
}

function placeNextTile() {
  if (currentTileIndex < numTiles - 1) {
    currentTileIndex++;
    let delay = shouldInvertColors ? tilePlacementDelayInverted : tilePlacementDelayNormal;
    placementTimeout = setTimeout(() => {
      let tileKey = random(tileKeys);
      let tilePos = spritesheetData.tiles[tileKey];
      
      let pos = findRandomAdjacentPosition(usedPositions);
      
      tiles.push({
        pos: pos,
        key: tileKey,
        coords: tilePos,
        flipH: random() > 0.8,
        flipV: random() > 0.8 
      });
      
      usedPositions.push(pos);
      placeNextTile();
    }, delay);
  } else {
    playRandomSound(); 
    figureName = generateFigureNameFromTiles(); 
  }
}

function findRandomAdjacentPosition(usedPositions) {
  let validPositions = [];
  
  while (validPositions.length === 0) {
    let basePos = random(usedPositions);
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
  
  return random(validPositions);
}

function drawTile(tile) {
  let sx = tile.coords[0] * globalVars.TILE_WIDTH;
  let sy = tile.coords[1] * globalVars.TILE_HEIGHT;
  let dx = tile.pos.x;
  let dy = tile.pos.y;
  push();
  translate(dx + globalVars.TILE_HALF_WIDTH, dy + globalVars.TILE_HALF_HEIGHT);
  if (tile.flipH) scale(-1, 1);
  if (tile.flipV) scale(1, -1);
  tint(tintcolor); // Apply tint before drawing the tile
  image(spritesheet, -globalVars.TILE_HALF_WIDTH, -globalVars.TILE_HALF_HEIGHT, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
  pop();
}

function randomizeBackgroundColor() {
  baseColor = color(random(100, 255), random(100, 255), random(100, 255));
}

// Match the page background to the canvas so the letterbox area blends in.
// When the frame is inverted, filter(INVERT) flips the canvas, so invert here too.
function updateBodyBackground() {
  let r = red(baseColor), g = green(baseColor), b = blue(baseColor);
  if (shouldInvertColors) {
    r = 255 - r; g = 255 - g; b = 255 - b;
  }
  document.body.style.backgroundColor = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function mouseMoved() {
  let mouseXIndex = Math.floor(mouseX / globalVars.TILE_WIDTH);
  let mouseYIndex = Math.floor(mouseY / globalVars.TILE_HEIGHT);
  hoveredTile = null;
  
  for (let tile of tiles) {
    let tileXIndex = Math.floor(tile.pos.x / globalVars.TILE_WIDTH);
    let tileYIndex = Math.floor(tile.pos.y / globalVars.TILE_HEIGHT);
    if (mouseXIndex === tileXIndex && mouseYIndex === tileYIndex) {
      hoveredTile = tile;
      console.log(`Hovered over tile: ${tile.key}`); // Debugging
      break;
    }
  }
}

function drawName(name, isInverted) {
  displayText(name, height - 3 * globalVars.TILE_HEIGHT, isInverted);
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

function displayTile(char, col, row) {
  let tilePos;
  switch (char) {
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
    image(spritesheet, col, row, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT, sx, sy, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
  } else {
    console.error(`No tile mapping found for character: ${char}`);
  }
}

// Browsers keep audio switched off until the first click, key press or touch,
// so resume it from inside those handlers. (Electron allows audio from the start.)
function keyPressed() {
  userStartAudio();
  initializeSketch();
}

function mousePressed() {
  userStartAudio();
  initializeSketch();
}

function touchStarted() {
  userStartAudio();
  initializeSketch();
}

function generateFigureNameFromTiles() {
  // Create a unique key based on the tiles' positions, keys, and flips
  let key = tiles.map(tile => `${tile.pos.x},${tile.pos.y},${tile.key},${tile.flipH},${tile.flipV}`).join(';');
  
  // Use the key to seed a deterministic random generator
  Math.seedrandom(key);
  
  // Generate the figure name using the seeded generator
  return generateFigureName();
}

// Simple hash function to convert a string to a seed
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    let char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}
