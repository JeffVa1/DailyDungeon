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
