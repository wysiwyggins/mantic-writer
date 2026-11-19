// Boot screen, after the "boot" sketch in Didaktik Gama: a flat field of
// colour that, every few seconds, flashes alternating stripes in a new
// colour and its complements while two low oscillators jump in pitch.
// The title and credit sit along the bottom in spritesheet glyphs.
// Ends after BOOT_DURATION, or as soon as a figure starts (chord, key,
// click, attract mode): initializeSketch() calls endBoot().

const BOOT_TITLE = 'Mantic Reader';
const BOOT_CREDIT = 'Wiley Wiggins 2026';
const BOOT_DURATION = 12000;    // ms before the first figure appears
const BOOT_CYCLE = 4000;        // ms between colour changes (120 frames at 30fps in the original)
const BOOT_FLASH = 170;         // ms of stripes at the start of each cycle (5 frames at 30fps)
const BOOT_VOLUME = 0.25;       // per oscillator

let booting = false;
let bootStart = 0;
let bootCycle = -1;
let bootColors = [];
let bootStripeOffset = 0;
let bootWave1, bootWave2;
let bootWhiteSheet = null; // the spritesheet with its glyphs inverted to white

function startBoot() {
  booting = true;
  bootStart = millis();
  bootCycle = -1;
  bootWave1 = new p5.Oscillator('triangle');
  bootWave2 = new p5.Oscillator('sine');
  for (let w of [bootWave1, bootWave2]) {
    w.amp(0);
    w.start();
  }
}

function endBoot() {
  if (!booting) return;
  booting = false;
  for (let w of [bootWave1, bootWave2]) {
    w.amp(0, 0.1);
    w.stop(0.15);
  }
}

// Called from draw() while booting.
function drawBoot() {
  let elapsed = millis() - bootStart;
  if (elapsed > BOOT_DURATION) {
    initializeSketch(); // ends the boot screen
    return;
  }

  let cycle = Math.floor(elapsed / BOOT_CYCLE);
  if (cycle !== bootCycle) {
    bootCycle = cycle;
    generateBootColors();
    bootStripeOffset = floor(random(2));
    if (cycle === 0) {
      bootWave1.amp(BOOT_VOLUME, 0.05);
      bootWave2.amp(BOOT_VOLUME, 0.05);
    }
  }

  background(bootColors[0]);
  if (elapsed % BOOT_CYCLE < BOOT_FLASH) {
    drawBootStripes();
    bootWave1.freq(random(50, 100));
    bootWave2.freq(random(10, 100));
  }
  drawBootText();
}

function generateBootColors() {
  push();
  colorMode(HSB, 360, 100, 100);
  let base = color(random(360), random(100), random(100));
  bootColors = [base];
  for (let i = 1; i <= 3; i++) {
    bootColors.push(color((hue(base) + i * 90) % 360, saturation(base), brightness(base)));
  }
  pop();
  // Letterbox around the canvas follows the field colour.
  document.body.style.backgroundColor = bootColors[0].toString('#rrggbb');
}

// Rows of half-tile height in alternating colours.
function drawBootStripes() {
  noStroke();
  let h = globalVars.TILE_HALF_HEIGHT;
  for (let y = 0; y * h < height; y++) {
    fill(bootColors[(y + bootStripeOffset) % 2]);
    rect(0, y * h, width, h);
  }
}

// Title at bottom left, credit at bottom right, as in the original boot.png.
// On a narrow screen where they won't share a row, stack them, centred.
function drawBootText() {
  let sheet = isDark(bootColors[0]) ? whiteSpritesheet() : spritesheet;
  let tw = globalVars.TILE_WIDTH;
  let th = globalVars.TILE_HEIGHT;
  let margin = Math.max(1, Math.round(CANVAS_COLS * 0.065));
  let row = Math.min(Math.floor(CANVAS_ROWS * 0.87), CANVAS_ROWS - 2);

  if (BOOT_TITLE.length + BOOT_CREDIT.length + 3 <= CANVAS_COLS - 2 * margin) {
    drawBootLine(BOOT_TITLE, margin * tw, row * th, sheet);
    drawBootLine(BOOT_CREDIT, (CANVAS_COLS - margin - BOOT_CREDIT.length) * tw, row * th, sheet);
  } else {
    row = Math.max(0, row - 1);
    for (let line of [BOOT_TITLE, BOOT_CREDIT]) {
      drawBootLine(line, Math.floor((width - line.length * tw) / 2), row * th, sheet);
      row++;
    }
  }
}

// Dark grounds get white text, as inverted figures do in the main sketch.
function isDark(c) {
  return 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c) < 128;
}

// The glyphs are near-black, and tint() can only darken them, so white text
// needs an inverted copy of the spritesheet. Made once, on first use.
function whiteSpritesheet() {
  if (!bootWhiteSheet) {
    bootWhiteSheet = createGraphics(spritesheet.width, spritesheet.height);
    bootWhiteSheet.pixelDensity(1);
    bootWhiteSheet.image(spritesheet, 0, 0);
    // Invert colour by hand, keeping transparency as it is.
    bootWhiteSheet.loadPixels();
    let px = bootWhiteSheet.pixels;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i];
      px[i + 1] = 255 - px[i + 1];
      px[i + 2] = 255 - px[i + 2];
    }
    bootWhiteSheet.updatePixels();
  }
  return bootWhiteSheet;
}

// Like displayTile() in sketch.js, but keeps lowercase letters.
function drawBootLine(text, x, y, sheet) {
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    let cx = x + i * globalVars.TILE_WIDTH;
    let small = /[a-z]/.test(ch) && spritesheetData.tiles[`LATIN_SMALL_LETTER_${ch.toUpperCase()}`];
    if (small) {
      image(sheet, cx, y, globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT,
        small[0] * globalVars.TILE_WIDTH, small[1] * globalVars.TILE_HEIGHT,
        globalVars.TILE_WIDTH, globalVars.TILE_HEIGHT);
    } else if (ch !== ' ') {
      displayTile(ch, cx, y, sheet);
    }
  }
}
