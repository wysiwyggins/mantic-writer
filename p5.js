
let tintcolor;

let CANVAS_COLS;
let CANVAS_ROWS;

const tilePlacementDelay = 50; // Delay in milliseconds

function preload() {
  spritesheet = loadImage(globalVars.SPRITESHEET_PATH);
  spritesheetData = loadJSON(globalVars.SPRITE_DATA_PATH);
}

function setup() {
  CANVAS_COLS = Math.floor(windowWidth / globalVars.TILE_WIDTH);
  CANVAS_ROWS = Math.floor(windowHeight / globalVars.TILE_HEIGHT);

  createCanvas(CANVAS_COLS * globalVars.TILE_WIDTH, CANVAS_ROWS * globalVars.TILE_HEIGHT);
  initializeSketch();
}

function draw() {
  background(baseColor);
  for (let tile of tiles) {
    drawTile(tile);
  }
}

function initializeSketch() {
  randomizeBackgroundColor();
  
  tileKeys = Object.keys(spritesheetData.tiles);
  numTiles = int(random(2, 11));
  let centerX = Math.floor(CANVAS_COLS / 2) * globalVars.TILE_WIDTH;
  let centerY = Math.floor(CANVAS_ROWS / 2) * globalVars.TILE_HEIGHT;
  
  tiles = [];
  usedPositions = [];
  currentTileIndex = 0;

  let initialTile = {
    pos: createVector(centerX, centerY),
    key: random(tileKeys),
    coords: spritesheetData.tiles[random(tileKeys)],
    flipH: random() > 0.5,
    flipV: random() > 0.5
  };
  tiles.push(initialTile);
  usedPositions.push(initialTile.pos);
  
  tintcolor = color(300 - red(baseColor), 300 - green(baseColor), 300 - blue(baseColor));
  
  placeNextTile();
}

function placeNextTile() {
  if (currentTileIndex < numTiles - 1) {
    currentTileIndex++;
    setTimeout(() => {
      let tileKey = random(tileKeys);
      let tilePos = spritesheetData.tiles[tileKey];
      
      let pos = findRandomAdjacentPosition(usedPositions);
      
      tiles.push({
        pos: pos,
        key: tileKey,
        coords: tilePos,
        flipH: random() > 0.5,
        flipV: random() > 0.5
      });
      
      usedPositions.push(pos);
      placeNextTile();
    }, tilePlacementDelay);
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
  baseColor = color(random(100,255), random(100,255), random(100,255));
}

function keyPressed() {
  initializeSketch();
}

function mousePressed() {
  initializeSketch();
}

function touchStarted() {
  initializeSketch();
}
