// planetaryHours.js
// Shows today's date and the symbol of the current planetary hour's planet
// at the top centre of the screen, e.g. "November 20 ♄", in white tinted
// with the background's complement (complementWhiteSpritesheet() in
// sketch.js), for PLANETARY_HOUR_SHOWN after each planetary hour begins
// (and after startup).
//
// The day from sunrise to sunset is split into 12 equal hours, and the night
// from sunset to the next sunrise into another 12, so hours are longer or
// shorter than 60 minutes depending on the season. The first hour after
// sunrise belongs to the planet ruling that weekday (Sunday the Sun, Monday
// the Moon, Tuesday Mars, Wednesday Mercury, Thursday Jupiter, Friday Venus,
// Saturday Saturn), and each following hour to the next planet in the
// Chaldean order. A planetary day runs from sunrise to sunrise, so the hours
// before dawn still belong to the previous day.
//
// Sunrise and sunset are calculated for the location below (the Pi has no
// network location), using the Pi's clock and time zone.

const LATITUDE = 45.50;    // degrees north (Montreal)
const LONGITUDE = -73.57;  // degrees east; west is negative
const CHALDEAN = ['SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON'];
const WEEKDAY_RULERS = ['SUN', 'MOON', 'MARS', 'MERCURY', 'JUPITER', 'VENUS', 'SATURN']; // Sunday first
const PLANETARY_HOUR_REFRESH = 5000;  // ms between recalculations
const PLANETARY_HOUR_SHOWN = 2 * 60000; // ms the line stays up after the hour changes
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Spritesheet tile for each planet. The sheet has no Mars or crescent-Moon
// symbol yet, so Mars is the bow and arrow and the Moon a shaded phase.
const PLANET_TILES = {
  SATURN: 'SATURN',
  JUPITER: 'JUPITER',
  MARS: 'BOW_AND_ARROW',
  SUN: 'APOLLO',
  VENUS: 'FEMALE_SYMBOL',
  MERCURY: 'MERCURY',
  MOON: 'LAST_QUARTER_MOON',
};

let planetaryHourRuler = null;
let planetaryHourDate = ''; // calendar date, e.g. "November 20"
let planetaryHourCheckedAt = -Infinity;
let planetaryHourShownUntil = 0; // millis() until which the line is drawn

// Called from draw().
function drawPlanetaryHour() {
  if (millis() - planetaryHourCheckedAt > PLANETARY_HOUR_REFRESH) {
    let now = new Date();
    let hour = planetaryHour(now);
    let ruler = hour ? hour.ruler : null;
    // Neighbouring hours always have different planets, so a new ruler means a new hour.
    if (ruler !== planetaryHourRuler || planetaryHourCheckedAt === -Infinity) {
      planetaryHourShownUntil = millis() + PLANETARY_HOUR_SHOWN;
    }
    planetaryHourRuler = ruler;
    planetaryHourDate = `${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`;
    planetaryHourCheckedAt = millis();
  }
  if (millis() >= planetaryHourShownUntil) return;
  // White tinted with the background's complement (sketch.js). While loading,
  // the loader's background; while quickening, the figure's original one, as
  // its ground drifts every step and the sheet would be re-tinted each time.
  let bg = loading ? loaderBg : isQuickening() ? quickening.baseColor : baseColor;
  let sheet = complementWhiteSpritesheet(bg);
  let w = globalVars.TILE_WIDTH, h = globalVars.TILE_HEIGHT;
  // The date, a space, then the planet's symbol, centred as one line.
  let length = planetaryHourDate.length + (planetaryHourRuler ? 2 : 0);
  let x = Math.floor((width - length * w) / 2); // centred like the figure name
  drawBootLine(planetaryHourDate, x, 0, sheet); // boot.js: keeps lowercase letters
  if (!planetaryHourRuler) return;
  let coords = spritesheetData.tiles[PLANET_TILES[planetaryHourRuler]];
  image(sheet, x + (planetaryHourDate.length + 1) * w, 0, w, h, coords[0] * w, coords[1] * h, w, h);
}

// { ruler, index (0-23, 0 = first hour after sunrise), isDay } for a moment,
// or null where the sun doesn't rise or set that day.
function planetaryHour(now) {
  let today = localDate(now, 0);
  let sunToday = sunTimes(today);
  if (!sunToday) return null;

  let dayDate, start, end, offset;
  if (now < sunToday.rise) {
    // Before dawn: the night hours of yesterday's planetary day.
    let sunYesterday = sunTimes(localDate(now, -1));
    if (!sunYesterday) return null;
    dayDate = localDate(now, -1);
    start = sunYesterday.set; end = sunToday.rise; offset = 12;
  } else if (now < sunToday.set) {
    dayDate = today;
    start = sunToday.rise; end = sunToday.set; offset = 0;
  } else {
    let sunTomorrow = sunTimes(localDate(now, 1));
    if (!sunTomorrow) return null;
    dayDate = today;
    start = sunToday.set; end = sunTomorrow.rise; offset = 12;
  }

  let index = offset + Math.min(11, Math.floor((now - start) / (end - start) * 12));
  let first = CHALDEAN.indexOf(WEEKDAY_RULERS[dayDate.getDay()]);
  return { ruler: CHALDEAN[(first + index) % 7], index, isDay: offset === 0 };
}

// Local noon, `days` days from the given moment's date.
function localDate(moment, days) {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate() + days, 12);
}

// Sunrise and sunset (Dates) for the local day containing `noon`, from the
// standard sunrise equation; accurate to a minute or two. null during polar
// day or night.
function sunTimes(noon) {
  const rad = Math.PI / 180;
  let julian = noon.getTime() / 86400000 + 2440587.5;
  let n = Math.round(julian - 2451545.0 + 0.0008 - LONGITUDE / 360);
  let meanNoon = n - LONGITUDE / 360;
  let M = (357.5291 + 0.98560028 * meanNoon) % 360;
  let C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  let lambda = (M + C + 180 + 102.9372) % 360;
  let transit = 2451545.0 + meanNoon + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  let sinDecl = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
  let cosDecl = Math.cos(Math.asin(sinDecl));
  let cosHourAngle = (Math.sin(-0.833 * rad) - Math.sin(LATITUDE * rad) * sinDecl) / (Math.cos(LATITUDE * rad) * cosDecl);
  if (cosHourAngle < -1 || cosHourAngle > 1) return null;
  let halfDay = Math.acos(cosHourAngle) / rad / 360; // in days
  let toDate = j => new Date((j - 2440587.5) * 86400000);
  return { rise: toDate(transit - halfDay), set: toDate(transit + halfDay) };
}
