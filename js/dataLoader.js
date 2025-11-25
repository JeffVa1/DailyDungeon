// dataLoader.js
// Fetches static JSON data and owner room files, handling fallbacks and persistence for offline use.
import {
  DEFAULT_BOSSES,
  DEFAULT_ENEMIES,
  DEFAULT_LOOT,
  ROOM_FILE_EXTENSION,
  ROOM_FILE_FOLDER,
  ROOM_FILE_PREFIX,
  setBosses,
  setEnemies,
  setLoot,
} from './state.js';

// Attempts to fetch JSON without caching; logs failures and returns null on error.
export async function fetchJsonWithFallback(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`Fetch failed for ${path} with status ${res.status}`);
    } else {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fetch error for', path, err);
  }
  return null;
}

// Loads loot/enemy/boss data with defaults to keep the game playable offline.
export async function loadStaticData() {
  const [loot, enemies, bosses] = await Promise.all([
    fetchJsonWithFallback('data/loot.json'),
    fetchJsonWithFallback('data/enemies.json'),
    fetchJsonWithFallback('data/bosses.json'),
  ]);
  setLoot(loot || DEFAULT_LOOT);
  setEnemies(enemies || DEFAULT_ENEMIES);
  setBosses(bosses || [...DEFAULT_BOSSES]);
}

export function getRoomFilename(date) {
  return `${ROOM_FILE_FOLDER}/${ROOM_FILE_PREFIX}${date}${ROOM_FILE_EXTENSION}`;
}

export function getSavedRoomFiles() {
  const raw = localStorage.getItem('dd_room_files');
  return raw ? JSON.parse(raw) : {};
}

export function saveRoomFiles(obj) {
  localStorage.setItem('dd_room_files', JSON.stringify(obj));
}

// Retrieves a room file for a given date from disk or cached storage when available.
export async function loadRoomFromFile(date) {
  const filename = getRoomFilename(date);
  const saved = getSavedRoomFiles();
  try {
    const data = await fetchJsonWithFallback(filename);
    if (data) {
      saved[filename] = data;
      saveRoomFiles(saved);
      return data;
    }
  } catch (err) {
    console.warn('Room fetch failed for', filename, err);
  }
  return saved[filename] || null;
}
