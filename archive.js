// archive.js
// Saved seeds and attract mode.

const STORAGE_KEY = 'manticSeeds';
const ATTRACT_ENABLED = false;
const ATTRACT_INTERVAL = 12000;
const IDLE_BEFORE_ATTRACT = 3 * 60000;

let attractTimer = null;
let attractIndex = 0;
let idleTimer = null;
let archiveMessage = '';
let archiveMessageUntil = 0;

function setupArchive() {
  window.addEventListener('keydown', handleArchiveKeys);
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', handleArchiveDrop);
  noteUserActivity();
}

function loadSavedSeeds() {
  try {
    let list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list.filter(entry => entry && entry.seed) : [];
  } catch (err) {
    console.error('Saved seeds are unreadable:', err);
    return [];
  }
}

function storeSavedSeeds(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveCurrentSeed() {
  if (!currentSeed) return;
  let list = loadSavedSeeds();
  if (list.some(entry => entry.seed === currentSeed)) {
    showArchiveMessage('ALREADY SAVED');
    return;
  }
  list.push({ seed: currentSeed, name: isQuickening() ? quickening.name : figureName, savedAt: new Date().toISOString() });
  storeSavedSeeds(list);
  console.log(`Saved seed ${currentSeed} (${list.length} saved)`);
  showArchiveMessage(`SAVED ${list.length}`);
}

function removeCurrentSeed() {
  let list = loadSavedSeeds();
  let remaining = list.filter(entry => entry.seed !== currentSeed);
  if (remaining.length === list.length) return;
  storeSavedSeeds(remaining);
  showArchiveMessage(`REMOVED ${remaining.length} LEFT`);
}

function exportSavedSeeds() {
  let blob = new Blob([JSON.stringify(loadSavedSeeds(), null, 2)], { type: 'application/json' });
  let link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `mantic-seeds-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function handleArchiveDrop(event) {
  event.preventDefault();
  let file = event.dataTransfer.files[0];
  if (!file) return;
  file.text().then(text => {
    let incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('expected a JSON array');
    let list = loadSavedSeeds();
    let known = new Set(list.map(entry => entry.seed));
    for (let entry of incoming) {
      if (entry && entry.seed && !known.has(String(entry.seed))) {
        list.push({ ...entry, seed: String(entry.seed) });
        known.add(String(entry.seed));
      }
    }
    storeSavedSeeds(list);
    showArchiveMessage(`IMPORTED ${list.length} SAVED`);
  }).catch(err => {
    console.error('Could not import seeds:', err);
    showArchiveMessage('IMPORT FAILED');
  });
}

function handleArchiveKeys(event) {
  if (!(event.metaKey || event.ctrlKey)) return;
  let k = event.key.toLowerCase();
  if (k === 's') {
    event.preventDefault();
    saveCurrentSeed();
  } else if (k === 'e') {
    event.preventDefault();
    exportSavedSeeds();
  } else if (k === 'backspace' || k === 'delete') {
    event.preventDefault();
    removeCurrentSeed();
  }
}

function isAttractMode() {
  return attractTimer !== null;
}

function startAttractMode() {
  if (!ATTRACT_ENABLED || isAttractMode()) return;
  if (loadSavedSeeds().length === 0) {
    showArchiveMessage('NOTHING SAVED');
    return;
  }
  clearTimeout(idleTimer);
  showNextSavedSeed();
  attractTimer = setInterval(showNextSavedSeed, ATTRACT_INTERVAL);
}

function stopAttractMode() {
  if (isAttractMode()) {
    clearInterval(attractTimer);
    attractTimer = null;
  }
  noteUserActivity();
}

function toggleAttractMode() {
  if (isAttractMode()) {
    stopAttractMode();
  } else {
    startAttractMode();
  }
}

function showNextSavedSeed() {
  if (isQuickening()) return;
  let list = loadSavedSeeds();
  if (list.length === 0) {
    stopAttractMode();
    return;
  }
  attractIndex = attractIndex % list.length;
  initializeSketch(list[attractIndex].seed);
  attractIndex++;
}

// Any visitor input restarts the countdown to attract mode.
function noteUserActivity() {
  resetIdleQuicken();
  clearTimeout(idleTimer);
  if (!ATTRACT_ENABLED) return;
  idleTimer = setTimeout(() => {
    if (!isAttractMode() && loadSavedSeeds().length > 0) startAttractMode();
  }, IDLE_BEFORE_ATTRACT);
}

function showArchiveMessage(text, duration = 1500) {
  archiveMessage = text;
  archiveMessageUntil = millis() + duration;
}

// Called from draw(); uses the sketch's own glyph text.
function drawArchiveMessage() {
  if (archiveMessage && millis() < archiveMessageUntil) {
    displayText(archiveMessage, height - 3 * globalVars.TILE_HEIGHT, false);
  }
}
