const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));
const todayStr = new Date().toISOString().split('T')[0];
const ownerMode = location.search.includes('owner=1');
const ROOM_FILE_PREFIX = 'room-';
const ROOM_FILE_FOLDER = 'rooms';
const ROOM_FILE_EXTENSION = '.json';

const ROOM_DEFINITIONS = [
  {
    date: todayStr,
    type: 'combat',
    name: 'Training Grounds',
    introText: 'A compact room to practice your skills.',
    successText: 'You catch your breath and spot the exit.',
    failureText: 'You fall during practice — rest and return tomorrow.',
    gridWidth: 10,
    gridHeight: 7,
    tiles: [
      '##########',
      '#P..R...E#',
      '#.Sr.#...#',
      '#...O....#',
      '#..b#B.g.#',
      '#...G....#',
      '##########'
    ],
    entities: [
      { kind: 'playerSpawn', x: 1, y: 1 },
      { kind: 'enemy', enemyType: 'Goblin Cutthroat', x: 6, y: 1 },
      { kind: 'enemy', enemyType: 'Skeleton Guard', x: 6, y: 3 },
      { kind: 'puzzle', x: 2, y: 2 },
      { kind: 'exit', x: 8, y: 1 }
    ],
  },
  {
    date: getNextWeekdayDate('Friday'),
    type: 'boss',
    name: 'Hall of Echoes',
    introText: 'A resonant chamber where a fearsome foe awaits.',
    successText: 'The echoes fade as the boss falls.',
    failureText: 'The chamber claims another hero.',
    gridWidth: 9,
    gridHeight: 7,
    tiles: [
      '#########',
      '#P.....E#',
      '#...#...#',
      '#...#...#',
      '#...#...#',
      '#.......#',
      '#########'
    ],
    entities: [
      { kind: 'playerSpawn', x: 1, y: 1 },
      { kind: 'boss', bossType: 'The Hollow Knight', x: 3, y: 4 },
      { kind: 'exit', x: 7, y: 1 }
    ],
    bossConfig: { name: 'The Hollow Knight' }
  }
];

const DEFAULT_ENEMIES = {
  'Goblin Cutthroat': { hp: 10, attack: 4, defense: 1, crit: 0.1 },
  'Skeleton Guard': { hp: 14, attack: 3, defense: 3, crit: 0.05 },
  'Cave Slime': { hp: 18, attack: 2, defense: 0, crit: 0.02 },
  'Shadow Wolf': { hp: 20, attack: 5, defense: 2, crit: 0.1 },
  'Ironbound Archer': { hp: 16, attack: 6, defense: 1, crit: 0.1 },
};

const DEFAULT_LOOT = {
  weapons: [
    { name: 'Rusty Dagger', attack: 1 },
    { name: 'Iron Longsword', attack: 3 },
    { name: 'Ember Wand', magic: 2 },
    { name: 'Shadow Bow', attack: 2, crit: 3 },
    { name: 'Ogre Smasher', attack: 5, defense: -1 },
  ],
  passives: [
    { name: 'Stone Skin', defense: 2 },
    { name: 'Quick Learner', xp: 0.1 },
    { name: 'Bloodthirst', healOnKill: 2 },
    { name: 'Arcane Wellspring', magic: 3 },
    { name: 'Nimble Reflexes', dodge: 0.05 },
  ],
  items: [
    { name: 'Small Potion', heal: 10 },
    { name: 'Greater Potion', heal: 20 },
    { name: 'Battle Brew', tempAttack: 2 },
    { name: 'Smoke Bomb', escape: true },
    { name: 'Elixir of Clarity', autoPuzzle: true },
  ],
};

const DEFAULT_BOSSES = ['The Hollow Knight', 'Maw of Cinders', 'Oracle of Dust'];

let ENEMIES = { ...DEFAULT_ENEMIES };
let LOOT = { ...DEFAULT_LOOT };
let BOSSES = [...DEFAULT_BOSSES];

const CLASSES = {
  Warrior: { strength: 8, dexterity: 4, wisdom: 3, vitality: 8 },
  Rogue: { strength: 4, dexterity: 8, wisdom: 4, vitality: 7 },
  Mage: { strength: 3, dexterity: 4, wisdom: 9, vitality: 6 },
};

let state = {
  player: null,
  currentRoom: null,
  selectedDate: todayStr,
  baseGrid: [],
  grid: [],
  entities: [],
  playerPos: { x: 0, y: 0 },
  keys: 0,
  activeTab: 'dungeon',
  owner: ownerMode,
  combatLog: [],
  effects: { tempAttack: 0, autoPuzzle: false, escape: false },
  lastDeath: null,
  lockedOutDate: null,
  doorState: { red: false, blue: false, green: false },
  dungeonView: 'dungeon',
};

async function fetchJsonWithFallback(path) {
  const url = path;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`Fetch failed for ${url} with status ${res.status}`);
    } else {
      return await res.json();
    }
  } catch (err) {
    console.warn('Fetch error for', url, err);
  }
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.overrideMimeType('application/json');
      xhr.open('GET', url, true);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText || 'null')); }
          catch (e) { reject(e); }
        } else {
          reject(new Error('XHR status ' + xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('XHR network error'));
      xhr.send();
    } catch (err) {
      reject(err);
    }
  }).catch((err) => {
    console.warn('Fallback load failed for', path, err);
    return null;
  });
}

async function loadStaticData() {
  const [loot, enemies, bosses] = await Promise.all([
    fetchJsonWithFallback('data/loot.json'),
    fetchJsonWithFallback('data/enemies.json'),
    fetchJsonWithFallback('data/bosses.json'),
  ]);
  LOOT = loot || DEFAULT_LOOT;
  ENEMIES = enemies || DEFAULT_ENEMIES;
  BOSSES = bosses || [...DEFAULT_BOSSES];
}

function getDerivedStats(includeEffects = true) {
  if (!state.player) return {};
  const base = state.player.stats || {};
  const strength = base.strength || 0;
  const dexterity = base.dexterity || 0;
  const wisdom = base.wisdom || 0;
  const vitality = base.vitality || 0;
  const hpMax = vitality * 3;
  const className = state.player.class;
  const mageScale = className === 'Mage' ? 1.2 : 1;
  let attack =
    className === 'Warrior'
      ? strength
      : className === 'Rogue'
        ? dexterity
        : Math.round(wisdom * mageScale);
  let defense = Math.floor(strength * 0.6);
  let critChance = 5 + Math.round(dexterity * 0.5);

  const applyBonuses = (obj = {}) => {
    if (obj.attack) attack += obj.attack;
    if (obj.magic || obj.wisdom) {
      const bonus = obj.wisdom ?? obj.magic;
      attack += className === 'Mage' ? Math.round(bonus * 1.5) : bonus;
    }
    if (obj.defense) defense += obj.defense;
    if (obj.crit) critChance += obj.crit;
  };

  applyBonuses(state.player.weapon);
  (state.player.passives || []).forEach(applyBonuses);
  if (includeEffects && state.effects.tempAttack) attack += state.effects.tempAttack;

  return { strength, dexterity, wisdom, vitality, hpMax, attack, defense, critChance: Math.min(critChance, 100) };
}

function clampPlayerHP() {
  if (!state.player) return;
  const { hpMax } = getDerivedStats(false);
  if (hpMax) {
    state.player.stats.hpCurrent = Math.min(state.player.stats.hpCurrent || 0, hpMax);
    if (state.player.stats.hpCurrent < 0) state.player.stats.hpCurrent = 0;
  }
}

function normalizeRoom(room) {
  const copy = JSON.parse(JSON.stringify(room));
  copy.puzzleConfigs = copy.puzzleConfigs || [];
  copy.trapConfigs = copy.trapConfigs || [];

  const tiles = copy.tiles || [];
  const puzzleCoords = [];
  const trapCoords = [];
  tiles.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      if (ch === 'S') puzzleCoords.push({ x, y });
      if (ch === 'T') trapCoords.push({ x, y });
    });
  });

  if (!copy.puzzleConfigs.length && copy.puzzleConfig) {
    const fallback = (copy.entities || []).find((e) => e.kind === 'puzzle') || puzzleCoords[0];
    if (fallback) copy.puzzleConfigs.push({ x: fallback.x, y: fallback.y, ...copy.puzzleConfig });
  }
  if (!copy.trapConfigs.length && copy.trapConfig) {
    const fallback = trapCoords[0];
    if (fallback) copy.trapConfigs.push({ x: fallback.x, y: fallback.y, ...copy.trapConfig });
  }

  puzzleCoords.forEach((p) => {
    if (!copy.puzzleConfigs.some((c) => c.x === p.x && c.y === p.y)) {
      copy.puzzleConfigs.push({ x: p.x, y: p.y, question: 'Solve: 2+2?', options: ['1', '3', '4'], answer: 2 });
    }
  });
  trapCoords.forEach((t) => {
    if (!copy.trapConfigs.some((c) => c.x === t.x && c.y === t.y)) {
      copy.trapConfigs.push({ x: t.x, y: t.y, dc: 12, damage: 5, intro: 'A trap springs!' });
    }
  });

  return copy;
}

function getNextWeekdayDate(name) {
  const target = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(name);
  const now = new Date();
  const diff = (target - now.getDay() + 7) % 7 || 7;
  const next = new Date(now.getTime() + diff * 86400000);
  return next.toISOString().split('T')[0];
}

function savePlayer() {
  localStorage.setItem('dd_player', JSON.stringify(state.player));
}

function loadPlayer() {
  const data = localStorage.getItem('dd_player');
  if (data) {
    state.player = JSON.parse(data);
    migratePlayerStats();
  }
}

function loadDeathRecord() {
  const data = localStorage.getItem('dd_death_record');
  return data ? JSON.parse(data) : null;
}

function loadLockoutDate() {
  return localStorage.getItem('dd_lockout_date');
}

function saveLockoutDate(date) {
  if (!date) return;
  localStorage.setItem('dd_lockout_date', date);
  state.lockedOutDate = date;
}

function clearLockoutDate() {
  localStorage.removeItem('dd_lockout_date');
  state.lockedOutDate = null;
}

function saveDeathRecord(record) {
  if (!record) return;
  localStorage.setItem('dd_death_record', JSON.stringify(record));
}

function clearDeathRecord() {
  localStorage.removeItem('dd_death_record');
  state.lastDeath = null;
}

function migratePlayerStats() {
  if (!state.player) return;
  state.player.createdAt = state.player.createdAt || todayStr;
  state.player.streakStartDate = state.player.streakStartDate || state.player.createdAt;
  const stats = state.player.stats || {};
  if (stats.strength == null || stats.dexterity == null || stats.wisdom == null || stats.vitality == null) {
    const base = CLASSES[state.player.class] || { strength: 5, dexterity: 5, wisdom: 5, vitality: 6 };
    stats.strength = stats.attack ?? base.strength;
    stats.dexterity = stats.dexterity ?? Math.max(3, Math.round((stats.critChance || 5) / 2));
    stats.wisdom = stats.magic ?? base.wisdom;
    const derivedHp = stats.hpMax || stats.hpCurrent || base.vitality * 3;
    stats.vitality = Math.max(base.vitality, Math.round(derivedHp / 3));
  }
  const { hpMax } = getDerivedStats(false);
  stats.hpCurrent = Math.min(stats.hpCurrent ?? hpMax, hpMax);
  state.player.stats = stats;
  clampPlayerHP();
}

function getOwnerRooms() {
  const raw = localStorage.getItem('dd_owner_rooms');
  return raw ? JSON.parse(raw) : {};
}

function saveOwnerRooms(obj) {
  localStorage.setItem('dd_owner_rooms', JSON.stringify(obj));
}

function getSavedRoomFiles() {
  const raw = localStorage.getItem('dd_room_files');
  return raw ? JSON.parse(raw) : {};
}

function saveRoomFiles(obj) {
  localStorage.setItem('dd_room_files', JSON.stringify(obj));
}

function getRoomFilename(date) {
  return `${ROOM_FILE_FOLDER}/${ROOM_FILE_PREFIX}${date}${ROOM_FILE_EXTENSION}`;
}

async function loadRoomFromFile(date) {
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

function persistRoomToFile(room) {
  const filename = getRoomFilename(room.date);
  const files = getSavedRoomFiles();
  files[filename] = room;
  saveRoomFiles(files);
  try {
    const blob = new Blob([JSON.stringify(room, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ROOM_FILE_PREFIX}${room.date}${ROOM_FILE_EXTENSION}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  } catch (err) {
    console.warn('Download failed', err);
  }
}

async function init() {
  await loadStaticData();
  if (ownerMode) {
    qsa('.owner-only').forEach((b) => (b.style.display = 'inline-flex'));
    setupOwnerDateControl();
  }
  refreshDateUI();
  attachTabEvents();
  state.lastDeath = loadDeathRecord();
  state.lockedOutDate = loadLockoutDate();
  if (state.lockedOutDate && state.lockedOutDate !== todayStr) {
    clearLockoutDate();
  }
  loadPlayer();
  if (!state.player) {
    renderCharacterCreation();
    switchTab('character');
  } else {
    refreshAllPanels();
  }
  initControls();
}

function setupOwnerDateControl() {
  const container = qs('#ownerDateControl');
  if (!container) return;
  container.style.display = 'flex';
  container.innerHTML = `
    <label for="ownerDatePicker">Date</label>
    <input type="date" id="ownerDatePicker" value="${state.selectedDate}">
  `;
  container.querySelector('#ownerDatePicker').addEventListener('change', (e) => {
    setSelectedDate(e.target.value || todayStr);
  });
}

function refreshDateUI() {
  const todayEl = qs('#todayDisplay');
  if (todayEl) todayEl.textContent = state.owner ? `Date: ${state.selectedDate}` : todayStr;
  const picker = qs('#ownerDatePicker');
  if (picker && picker.value !== state.selectedDate) picker.value = state.selectedDate;
}

function attachTabEvents() {
  qsa('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  qsa('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  qsa('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tab));
  if (tab === 'dungeon') renderDungeonPanel();
  if (tab === 'character') state.player ? renderCharacterPanel() : renderCharacterCreation();
  if (tab === 'map') renderMapPanel();
  if (tab === 'settings') renderSettingsPanel();
  if (tab === 'editor') renderEditorPanel();
}

function refreshAllPanels() {
  clampPlayerHP();
  renderCharacterPanel();
  renderDungeonPanel();
  renderMapPanel();
  renderSettingsPanel();
  if (ownerMode) renderEditorPanel();
}

function renderLossSummary(record, opts = {}) {
  if (!record) return '';
  const stats = record.stats || {};
  const hpMax = stats.hpMax || Math.max((stats.vitality || 0) * 3, 1);
  const hpCurrent = stats.hpCurrent ?? hpMax;
  return `
    <div class="section-card loss-card">
      <div class="loss-header">
        <div>
          <p class="small">${record.lossDate}</p>
          <h2>${record.name} has fallen</h2>
          <p class="small">${record.class} • Level ${record.level}</p>
        </div>
        <span class="pill">Defeated</span>
      </div>
      <p>Win streak from <strong>${record.streakStartDate}</strong> to <strong>${record.lossDate}</strong>.</p>
      <div class="pill-row">
        <span class="pill subtle">Wins: ${record.wins || 0}</span>
        <span class="pill subtle">Start: ${record.streakStartDate}</span>
        <span class="pill subtle">Loss: ${record.lossDate}</span>
      </div>
      <div class="summary-grid loss-grid">
        <div class="info-block">
          <strong>Vitals</strong>
          <div class="bar-row">
            <div class="health-bar"><div class="health-fill" style="width:${(hpCurrent/(hpMax||1))*100}%"></div></div>
            <span class="small">${hpCurrent}/${hpMax} HP</span>
          </div>
          <div class="stat-row"><span>Strength</span><span>${stats.strength ?? '-'}</span></div>
          <div class="stat-row"><span>Dexterity</span><span>${stats.dexterity ?? '-'}</span></div>
          <div class="stat-row"><span>Wisdom</span><span>${stats.wisdom ?? '-'}</span></div>
          <div class="stat-row"><span>Vitality</span><span>${stats.vitality ?? '-'}</span></div>
          <div class="stat-divider" aria-hidden="true"></div>
          <div class="stat-row"><span>Attack</span><span>${stats.attack ?? '-'}</span></div>
          <div class="stat-row"><span>Defense</span><span>${stats.defense ?? '-'}</span></div>
          <div class="stat-row"><span>Crit</span><span>${stats.critChance ?? '-'}%</span></div>
        </div>
        <div class="info-block">
          <strong>Weapon</strong>
          <div class="card-row">
            <div>
              <div class="item-name">${record.weapon?.name || 'None'}</div>
              <div class="small">${describeLoot(record.weapon || {})}</div>
            </div>
          </div>
        </div>
        <div class="info-block">
          <strong>Passives</strong>
          <div class="pill-row">${(record.passives && record.passives.length
            ? record.passives.map((pa)=>`<span class="pill subtle">${pa.name}</span>`).join('')
            : '<span class="small">None</span>')}</div>
        </div>
      </div>
      ${opts.footer || ''}
    </div>`;
}

function renderCharacterCreation() {
  const panel = qs('#character');
  const memorial = state.lastDeath ? renderLossSummary(state.lastDeath, { footer: '<p class="small">Your next adventure awaits. Create a new character to continue.</p>' }) : '';
  panel.innerHTML = `
    ${memorial}
    <div class="section-card">
      <h2>Create Your Character</h2>
      <div class="button-row">
        <label>Name<input id="charName"></label>
        <label>Class
          <select id="charClass">
            ${Object.keys(CLASSES).map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </label>
      </div>
      <button id="createChar">Begin</button>
    </div>`;
  qs('#createChar').onclick = () => {
    const name = qs('#charName').value || 'Hero';
    const cls = qs('#charClass').value;
    const base = CLASSES[cls];
    state.player = {
      name,
      class: cls,
      level: 1,
      xp: 0,
      createdAt: todayStr,
      streakStartDate: todayStr,
      stats: {
        strength: base.strength,
        dexterity: base.dexterity,
        wisdom: base.wisdom,
        vitality: base.vitality,
        hpCurrent: base.vitality * 3,
      },
      weapon: { name: 'Training Blade', attack: 1 },
      passives: [],
      items: [],
      completedRooms: [],
      failedRooms: [],
    };
    clearDeathRecord();
    savePlayer();
    refreshAllPanels();
    switchTab('dungeon');
  };
}

async function getRoomForDate(date) {
  const fileRoom = await loadRoomFromFile(date);
  if (fileRoom) return fileRoom;
  const owners = getOwnerRooms();
  if (owners[date]) return owners[date];
  return ROOM_DEFINITIONS.find((r) => r.date === date) || null;
}

function setSelectedDate(date) {
  state.selectedDate = date || todayStr;
  refreshDateUI();
  if (state.activeTab === 'dungeon') renderDungeonPanel();
  if (state.activeTab === 'editor') renderEditorPanel();
}

function resetDungeonState(date) {
  if (state.currentRoom && state.currentRoom.date !== date) return;
  state.currentRoom = null;
  state.baseGrid = [];
  state.grid = [];
  state.entities = [];
  state.playerPos = { x: 0, y: 0 };
  state.keys = 0;
  state.combatLog = [];
  state.effects = { tempAttack: 0, autoPuzzle: false, escape: false };
  state.doorState = { red: false, blue: false, green: false };
  state.dungeonView = 'dungeon';
}

function initGrid(room) {
  const baseGrid = [];
  const overlayGrid = [];
  for (let y = 0; y < room.gridHeight; y++) {
    const baseRow = [];
    const overlayRow = [];
    const line = room.tiles[y] || ''.padEnd(room.gridWidth, '.');
    for (let x = 0; x < room.gridWidth; x++) {
      const ch = line[x] || '.';
      if (ch === 'O') {
        baseRow.push('.');
        overlayRow.push('O');
      } else {
        baseRow.push(ch);
        overlayRow.push(ch);
      }
    }
    baseGrid.push(baseRow);
    overlayGrid.push(overlayRow);
  }
  state.baseGrid = baseGrid;
  state.grid = overlayGrid;
}

function getOverlayTile(x, y) {
  return state.grid?.[y]?.[x] ?? '.';
}

function setOverlayTile(x, y, value) {
  if (state.grid?.[y]) state.grid[y][x] = value;
}

function getBaseTile(x, y) {
  return state.baseGrid?.[y]?.[x] ?? '.';
}

function setBaseTile(x, y, value) {
  if (state.baseGrid?.[y]) state.baseGrid[y][x] = value;
}

function isDoorTile(tile) {
  return ['R', 'B', 'G'].includes(tile);
}

function isPlateTile(tile) {
  return ['r', 'b', 'g'].includes(tile);
}

function plateColor(tile) {
  return tile === 'r' ? 'red' : tile === 'b' ? 'blue' : tile === 'g' ? 'green' : null;
}

function doorColor(tile) {
  return tile === 'R' ? 'red' : tile === 'B' ? 'blue' : tile === 'G' ? 'green' : null;
}

function isDoorOpen(tile) {
  const color = doorColor(tile);
  if (!color) return true;
  return state.doorState[color];
}

function collisionTileAt(x, y) {
  const overlay = getOverlayTile(x, y);
  if (overlay !== '.') return overlay;
  const base = getBaseTile(x, y);
  if (isDoorTile(base)) return isDoorOpen(base) ? '.' : base;
  return base;
}

async function renderDungeonPanel() {
  const panel = qs('#dungeon');
  if (!state.player) {
    const summary = state.lastDeath
      ? renderLossSummary(state.lastDeath, { footer: '<p class="small">Create a new character to continue.</p>' })
      : '';
    panel.innerHTML = summary || `<div class="section-card">Create a character to enter the dungeon.</div>`;
    return;
  }
  if (state.lockedOutDate && state.lockedOutDate !== todayStr) {
    clearLockoutDate();
  }
  if (!state.owner && state.lockedOutDate === todayStr) {
    panel.innerHTML = `
      <div class="section-card">
        <div class="outcome-card failed">
          <div class="outcome-header">
            <div>
              <p class="small">${todayStr}</p>
              <h2>Today's dungeon is locked</h2>
            </div>
            <span class="pill">Return Tomorrow</span>
          </div>
          <p>You fell in today's dungeon. Rest and return tomorrow to start fresh.</p>
          ${state.lastDeath ? renderLossSummary(state.lastDeath) : ''}
        </div>
      </div>`;
    clearActionBar();
    return;
  }
  const ownerActions = state.owner
    ? `<div class="button-row"><div class="pill subtle">Date: ${state.selectedDate}</div><button id="restartDay">Restart Day</button></div>`
    : '';
  panel.innerHTML = `<div class="section-card">
    ${ownerActions}
    <div id="dungeonContent">Loading room...</div>
  </div>`;
  const targetDate = state.owner ? state.selectedDate : todayStr;
  const rawRoom = await getRoomForDate(targetDate);
  const room = rawRoom ? normalizeRoom(rawRoom) : null;
  const content = qs('#dungeonContent');
  if (qs('#restartDay')) {
    qs('#restartDay').onclick = () => {
      resetDayProgress(targetDate);
      renderDungeonPanel();
    };
  }
  if (!room) {
    content.innerHTML = `<div class="section-card">No dungeon defined for ${targetDate}. ${state.owner ? 'Opening owner editor for this date.' : ''}</div>`;
    if (state.owner) openEditorForDate(targetDate);
    return;
  }

  const status = state.player.completedRooms.includes(targetDate)
    ? 'complete'
    : state.player.failedRooms.includes(targetDate)
      ? 'failed'
      : '';

  if (status) {
    renderOutcome(content, status, room, targetDate);
    clearActionBar();
    return;
  }
  const continuingRun = state.currentRoom && state.currentRoom.date === room.date && state.currentRoom.inProgress;
  if (!continuingRun) {
    state.currentRoom = JSON.parse(JSON.stringify({ ...room, inProgress: true }));
    state.keys = 0;
    state.effects = { tempAttack: 0, autoPuzzle: false, escape: false };
    state.combatLog = [];
    state.dungeonView = 'dungeon';
    initGrid(state.currentRoom);
    initEntities(state.currentRoom);
    updateDoors();
  }

  content.innerHTML = `
      <div id="game-root" class="game-root ${state.dungeonView === 'inventory' ? 'inventory-open' : ''}">
        <div class="dungeon-header">
          <div>
            <p class="pill subtle">${room.type.toUpperCase()}</p>
            <h2>${room.name}</h2>
            <p class="small">${room.introText}</p>
          </div>
          <div class="pill-row">
            <span class="pill subtle">${state.owner ? state.selectedDate : todayStr}</span>
            <span class="pill subtle">Level ${state.player.level}</span>
          </div>
        </div>
        <div class="dungeon-body">
          <div class="dungeon-grid ${state.dungeonView === 'inventory' ? 'hidden' : ''}">
            <div id="roomGrid" class="grid"></div>
          </div>
          <div id="dungeonInventory" class="dungeon-inventory ${state.dungeonView === 'inventory' ? '' : 'hidden'}"></div>
        </div>
        <div class="dungeon-actions">
          <div class="action-buttons">
            <button id="attackBtn" class="primary">Attack</button>
            <button id="inventoryToggle" class="ghost">${state.dungeonView === 'inventory' ? 'Back to Dungeon' : 'Inventory'}</button>
          </div>
          <div class="key-effects">
            <div class="pill subtle">Keys: <span id="keyCount">${state.keys}</span></div>
            <div id="effectTracker" class="effect-tracker"></div>
          </div>
        </div>
        <div class="status-row" id="statusRow"></div>
        <div id="log" class="small log-panel"></div>
      </div>
    `;

  renderGrid();
  renderDungeonInventory();
  renderStatus();
  renderEffectTracker();
  const logEl = qs('#log');
  if (logEl && state.combatLog.length) {
    logEl.innerHTML = state.combatLog.slice(-6).map((l)=>`<div>${l}</div>`).join('');
  }
  setupSwipeControls();

  const attackBtn = qs('#attackBtn');
  if (attackBtn) {
    attackBtn.onclick = () => {
      const attacked = attemptPlayerAttack();
      if (!attacked) log('No enemy in range.');
      advanceEnemiesAfterPlayerAction({ performPlayerAttack: false });
    };
  }
  const invBtn = qs('#inventoryToggle');
  if (invBtn) {
    invBtn.onclick = () => {
      state.dungeonView = state.dungeonView === 'inventory' ? 'dungeon' : 'inventory';
      renderDungeonPanel();
    };
  }
}

function renderOutcome(container, status, room, date) {
  const label = status === 'complete' ? 'Completed' : 'Failed';
  const message = status === 'complete' ? room.successText : room.failureText;
  const next = status === 'complete'
    ? 'Come back tomorrow for a new challenge.'
    : 'Rest up and return tomorrow to try again.';
  container.innerHTML = `
    <div class="outcome-card ${status}">
      <div class="outcome-header">
        <div>
          <p class="small">${date}</p>
          <h2>${room.name}</h2>
        </div>
        <span class="pill">${label}</span>
      </div>
      <p>${message}</p>
      <p class="small">${next}</p>
      ${state.owner ? '<button id="ownerRestart">Restart Day</button>' : ''}
    </div>
  `;
  if (state.owner) {
    qs('#ownerRestart').onclick = () => {
      resetDayProgress(date);
      renderDungeonPanel();
    };
  }
}

function renderGrid() {
  const wrap = qs('#roomGrid');
  if (!wrap) return;
  const room = state.currentRoom;
  wrap.classList.add('grid-labeled');
  wrap.style.gridTemplateColumns = `32px repeat(${room.gridWidth}, 28px)`;
  wrap.style.gridTemplateRows = `24px repeat(${room.gridHeight}, 28px)`;
  wrap.innerHTML = '';
  for (let y = -1; y < room.gridHeight; y++) {
    for (let x = -1; x < room.gridWidth; x++) {
      const cell = document.createElement('div');
      if (x === -1 && y === -1) {
        cell.className = 'label-cell corner';
      } else if (y === -1) {
        cell.className = 'label-cell column-label';
        cell.textContent = x;
      } else if (x === -1) {
        cell.className = 'label-cell row-label';
        cell.textContent = y;
      } else {
        const baseTile = getBaseTile(x, y);
        const overlayTile = getOverlayTile(x, y);
        const displayTile = overlayTile !== '.' ? overlayTile : baseTile;
        cell.classList.add('cell');
        cell.dataset.x = x; cell.dataset.y = y;
        const ent = state.entities.find((e) => e.x === x && e.y === y);
        if (displayTile === '#') cell.classList.add('tile-wall');
        else if (displayTile === 'S') cell.classList.add('tile-puzzle');
        else if (displayTile === 'T') cell.classList.add('tile-trap');
        else if (isPlateTile(displayTile)) cell.classList.add(`tile-plate-${plateColor(displayTile)}`);
        else if (displayTile === 'O') cell.classList.add('tile-pushable');
        else if (displayTile === 'K') cell.classList.add('tile-key');
        else if (displayTile === 'C') cell.classList.add('tile-chest');
        else if (displayTile === 'L') cell.classList.add('tile-locked');
        else if (isDoorTile(displayTile) || isDoorTile(baseTile)) {
          const doorBase = isDoorTile(displayTile) ? displayTile : baseTile;
          const color = doorColor(doorBase);
          cell.classList.add(`tile-door-${color}${isDoorOpen(doorBase) ? '-open' : ''}`);
        }
        else if (displayTile === 'E') cell.classList.add('tile-exit');
        else if (displayTile === 'P') { cell.classList.add('tile-floor'); cell.classList.add('entity-spawn'); }
        else cell.classList.add('tile-floor');
        if (ent) cell.classList.add(entityClass(ent));
        const glyph = ent ? entityGlyph(ent) : tileGlyph(baseTile, overlayTile);
        cell.textContent = glyph;
      }
      wrap.appendChild(cell);
    }
  }
}

function entityClass(ent) {
  if (ent.kind === 'player') return 'entity-player';
  if (ent.kind === 'enemy') return 'entity-enemy';
  if (ent.kind === 'boss') return 'entity-boss';
  if (ent.kind === 'playerSpawn') return 'entity-spawn';
  return 'entity-npc';
}

function entityGlyph(ent) {
  if (ent.kind === 'player') return '';
  if (ent.kind === 'enemy') return '⚔️';
  if (ent.kind === 'boss') return '👑';
  if (ent.kind === 'exit') return '🚪';
  if (ent.kind === 'puzzle') return '❓';
  return '';
}

function tileGlyph(baseTile, overlayTile) {
  if (overlayTile === 'O') return '⬜';
  if (overlayTile !== '.') {
    if (overlayTile === '#') return '';
    if (isPlateTile(overlayTile)) return '';
    if (overlayTile === 'P') return '';
    if (isDoorTile(overlayTile)) {
      const color = doorColor(overlayTile);
      return color === 'red' ? '🟥' : color === 'blue' ? '🟦' : '🟩';
    }
    if (overlayTile === 'K') return '🔑';
    if (overlayTile === 'C') return '💰';
    if (overlayTile === 'L') return '🔒';
    if (overlayTile === 'E') return '🚪';
    if (overlayTile === 'T') return '⚠️';
    if (overlayTile === 'S') return '✨';
    return overlayTile;
  }
  if (isDoorTile(baseTile)) {
    const color = doorColor(baseTile);
    const openSymbol = '🚪';
    return color === 'red' ? (state.doorState.red ? openSymbol : '🟥')
      : color === 'blue' ? (state.doorState.blue ? openSymbol : '🟦')
      : state.doorState.green ? openSymbol : '🟩';
  }
  if (isPlateTile(baseTile)) return '';
  if (baseTile === '#') return '';
  if (baseTile === 'K') return '🔑';
  if (baseTile === 'C') return '💰';
  if (baseTile === 'L') return '🔒';
  if (baseTile === 'E') return '🚪';
  if (baseTile === 'T') return '⚠️';
  if (baseTile === 'S') return '✨';
  if (baseTile === 'P') return '';
  return '';
}

function initEntities(room) {
  state.entities = [];
  room.entities.forEach((e) => {
    if (e.kind === 'playerSpawn') state.playerPos = { x: e.x, y: e.y };
    else state.entities.push({ ...e, hp: resolveHP(e) });
  });
  state.entities.push({ kind: 'player', x: state.playerPos.x, y: state.playerPos.y });
}

function resolveHP(ent) {
  if (ent.kind === 'enemy') return ENEMIES[ent.enemyType]?.hp || 8;
  if (ent.kind === 'boss') {
    return 30 + state.player.level * 10;
  }
  return 1;
}

function renderStatus() {
  const row = qs('#statusRow');
  if (!row) return;
  const player = state.player;
  const derived = getDerivedStats();
  const keyCount = qs('#keyCount');
  if (keyCount) keyCount.textContent = state.keys;
  row.innerHTML = `
    <div class="status-card">
      <div class="status-heading">
        <div>
          <div class="status-name">${player.name}</div>
          <div class="small">Lv ${player.level} ${player.class}</div>
        </div>
        <div class="pill subtle">HP ${(player.stats.hpCurrent || 0)}/${derived.hpMax || 0}</div>
      </div>
      <div class="health-bar"><div class="health-fill" style="width:${(player.stats.hpCurrent / (derived.hpMax || 1)) * 100}%"></div></div>
      <div class="small">ATK ${derived.attack} • DEF ${derived.defense} • CRIT ${derived.critChance}%</div>
    </div>`;
  renderEffectTracker();
}

function getActiveEffects() {
  const active = [];
  if (state.effects.tempAttack) active.push({ label: `+${state.effects.tempAttack} ATK`, detail: 'Run-limited boost' });
  if (state.effects.autoPuzzle) active.push({ label: 'Auto-solve', detail: 'Next puzzle is free' });
  if (state.effects.escape) active.push({ label: 'Escape ready', detail: 'Skip one encounter' });
  return active;
}

function renderEffectTracker() {
  const tracker = qs('#effectTracker');
  if (!tracker) return;
  const active = getActiveEffects();
  if (!active.length) {
    tracker.innerHTML = '<span class="small muted">No active effects</span>';
    return;
  }
  tracker.innerHTML = active
    .map((e) => `
      <div class="effect-pill">
        <span class="pill subtle">${e.label}</span>
        <span class="small">${e.detail}</span>
      </div>
    `)
    .join('');
}

function renderDpad() {
  const dpad = qs('#dpad');
  if (!dpad) return;
  const order = [
    { label: '', dir: '' },
    { label: '', dir: '' },
    { label: '', dir: '' },
    { label: 'W', dir: 'w', aria: 'Move up' },
    { label: '', dir: '' },
    { label: '', dir: '' },
    { label: 'A', dir: 'a', aria: 'Move left' },
    { label: 'S', dir: 's', aria: 'Move down' },
    { label: 'D', dir: 'd', aria: 'Move right' }
  ];
  dpad.setAttribute('aria-label', 'Movement controls');
  dpad.innerHTML = '';
  order.forEach(({ label, dir, aria }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (!label) { btn.disabled = true; btn.style.visibility='hidden'; }
    if (dir) {
      btn.dataset.dir = dir;
      if (aria) btn.setAttribute('aria-label', aria);
    }
    btn.addEventListener('click', () => handleMove((dir || label).toLowerCase()));
    dpad.appendChild(btn);
  });
}

function openEditorForDate(date){
  setSelectedDate(date);
  switchTab('editor');
}

function initControls() {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','w','W'].includes(e.key)) return handleMove('w');
    if (['ArrowDown','s','S'].includes(e.key)) return handleMove('s');
    if (['ArrowLeft','a','A'].includes(e.key)) return handleMove('a');
    if (['ArrowRight','d','D'].includes(e.key)) return handleMove('d');
    if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      state.owner = true; qsa('.owner-only').forEach((b)=>b.style.display='inline-flex');
      setupOwnerDateControl();
      refreshDateUI();
      switchTab('editor');
    }
  });
}

// Attach swipe gestures to the main game container for touch input.
function setupSwipeControls() {
  const root = qs('#game-root');
  if (!root || root.dataset.swipeAttached) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  const minDistance = 30; // px

  root.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    },
    { passive: true }
  );

  root.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < minDistance) return;

      const direction =
        absX > absY
          ? dx > 0
            ? 'right'
            : 'left'
          : dy > 0
          ? 'down'
          : 'up';

      handleMove(direction);
    },
    { passive: true }
  );

  root.dataset.swipeAttached = '1';
}

function getPlayerAttackRange() {
  const cls = state.player?.class;
  if (cls === 'Rogue') return 2;
  if (cls === 'Mage') return 3;
  return 1;
}

function nearestEnemyWithin(range) {
  let best = null;
  let bestDist = Infinity;
  state.entities
    .filter((e) => ['enemy', 'boss'].includes(e.kind))
    .forEach((e) => {
      const d = Math.abs(e.x - state.playerPos.x) + Math.abs(e.y - state.playerPos.y);
      if (d <= range && d < bestDist) { best = e; bestDist = d; }
    });
  return best;
}

function playerStrike(enemy) {
  const player = state.player;
  const derived = getDerivedStats();
  const defense = enemy.kind === 'boss' ? enemy.defense || (4 + player.level) : ENEMIES[enemy.enemyType]?.defense || 1;
  const dmg = Math.max(1, derived.attack - defense);
  const crit = Math.random() < derived.critChance / 100;
  const dealt = crit ? dmg * 2 : dmg;
  enemy.hp -= dealt;
  log(`${player.name} hits ${enemy.enemyType || enemy.kind} for ${dealt}${crit ? ' (CRIT)' : ''}.`);
  if (enemy.hp <= 0) {
    state.entities = state.entities.filter((e) => e !== enemy);
    if (state.currentRoom.type === 'boss' && !state.entities.some((e) => e.kind === 'boss')) log('Boss defeated!');
  }
}

function attemptPlayerAttack() {
  const target = nearestEnemyWithin(getPlayerAttackRange());
  if (!target) return false;
  playerStrike(target);
  return true;
}

function isPlateActive(color) {
  for (let y = 0; y < state.baseGrid.length; y++) {
    for (let x = 0; x < state.baseGrid[y].length; x++) {
      const tile = state.baseGrid[y][x];
      if (plateColor(tile) !== color) continue;
      const hasPlayer = state.playerPos.x === x && state.playerPos.y === y;
      const hasPushable = getOverlayTile(x, y) === 'O';
      const hasEntity = state.entities.some((e) => e.kind !== 'player' && e.x === x && e.y === y);
      if (hasPlayer || hasPushable || hasEntity) return true;
    }
  }
  return false;
}

function updateDoors() {
  state.doorState.red = isPlateActive('red');
  state.doorState.blue = isPlateActive('blue');
  state.doorState.green = isPlateActive('green');

  for (let y = 0; y < state.baseGrid.length; y++) {
    for (let x = 0; x < state.baseGrid[y].length; x++) {
      const base = state.baseGrid[y][x];
      if (!isDoorTile(base)) continue;
      const color = doorColor(base);
      const shouldOpen = state.doorState[color];
      const overlay = getOverlayTile(x, y);
      if (shouldOpen) {
        if (overlay === base) setOverlayTile(x, y, '.');
      } else {
        if (overlay === '.') setOverlayTile(x, y, base);
      }
    }
  }
}

function handleMove(dir) {
  if (!state.currentRoom) return;

  const normalized = (dir || '').toLowerCase();
  const delta = {
    // keyboard
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
    arrowup: [0, -1],
    arrowdown: [0, 1],
    arrowleft: [-1, 0],
    arrowright: [1, 0],
    // swipe directions
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  }[normalized];

  if (!delta) return;
  const nx = state.playerPos.x + delta[0];
  const ny = state.playerPos.y + delta[1];
  if (!inBounds(nx, ny)) return;
  const tile = collisionTileAt(nx, ny);
  if (tile === '#') return;
  if (isDoorTile(tile)) { log('The door is closed. Activate its plate to pass.'); return; }
  if (tile === 'O') {
    const pushX = nx + delta[0];
    const pushY = ny + delta[1];
    const blockingTiles = ['#', 'O', 'E', 'S', 'T', 'L', 'K', 'R', 'B', 'G'];
    if (!inBounds(pushX, pushY)) return;
    const nextTile = collisionTileAt(pushX, pushY);
    const blockedByEntity = state.entities.some((e) => e.kind !== 'player' && e.x === pushX && e.y === pushY);
    if (blockingTiles.includes(nextTile) || blockedByEntity) return;
    setOverlayTile(pushX, pushY, 'O');
    setOverlayTile(nx, ny, '.');
  }
  if (tile === 'L') {
    if (state.keys <= 0) { log('The door is locked. You need a key.'); return; }
    state.keys -= 1;
    setBaseTile(nx, ny, '.');
    setOverlayTile(nx, ny, '.');
    log('You unlock the door.');
  }
  let ent = state.entities.find((e) => e.x === nx && e.y === ny && e.kind !== 'player');
  if (ent) {
    if (['enemy','boss'].includes(ent.kind) && state.effects.escape) {
      log('You vanish in smoke, slipping past the foe.');
      state.effects.escape = false;
      state.entities = state.entities.filter((e) => e !== ent);
      ent = null;
      renderEffectTracker();
    }
    if (ent) {
      if (ent.kind === 'exit') return tryExit();
      if (['enemy','boss'].includes(ent.kind)) { log('An enemy blocks your path. Press Attack to fight.'); return; }
      if (ent.kind === 'puzzle') return openPuzzle(ent);
    }
  }
  state.playerPos = { x: nx, y: ny };
  const playerEntity = state.entities.find((e) => e.kind === 'player');
  if (playerEntity) { playerEntity.x = nx; playerEntity.y = ny; }
  if (tile === 'K') {
    state.keys += 1;
    setBaseTile(nx, ny, '.');
    setOverlayTile(nx, ny, '.');
    log('You pick up a key.');
  }
  if (tile === 'C') openChest(nx, ny);
  if (tile === 'S') return openPuzzle({ x: nx, y: ny, kind: 'puzzle' });
  if (tile === 'T') return triggerTrap(nx, ny);
  if (tile === 'E') return tryExit();
  updateDoors();
  advanceEnemiesAfterPlayerAction({ performPlayerAttack: false });
}

function inBounds(x,y){
  const r = state.currentRoom;
  return x >=0 && y>=0 && x<r.gridWidth && y<r.gridHeight;
}

function enemyAttack(enemy) {
  const player = state.player;
  const base = enemy.kind==='boss' ? (6 + player.level * 2) : ENEMIES[enemy.enemyType]?.attack || 2;
  const { defense, hpMax } = getDerivedStats(false);
  const dmg = Math.max(1, base - defense);
  player.stats.hpCurrent -= dmg;
  log(`${enemy.enemyType || enemy.kind} hits you for ${dmg}.`);
  if (player.stats.hpCurrent <= 0) {
    player.stats.hpCurrent = 0;
    onFailure();
  }
  if (player.stats.hpCurrent > hpMax) player.stats.hpCurrent = hpMax;
  renderStatus();
  savePlayer();
}

function enemyTurn() {
  const foes = state.entities.filter((e)=>['enemy','boss'].includes(e.kind));
  foes.forEach((enemy) => {
    if (state.player.stats.hpCurrent <= 0) return;
    const dx = state.playerPos.x - enemy.x;
    const dy = state.playerPos.y - enemy.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= 1) {
      enemyAttack(enemy);
      return;
    }
    const stepX = dx===0?0:dx/Math.abs(dx);
    const stepY = dy===0?0:dy/Math.abs(dy);
    const tryX = {x: enemy.x + stepX, y: enemy.y};
    const tryY = {x: enemy.x, y: enemy.y + stepY};
    if (Math.abs(dx) > Math.abs(dy)) attemptMove(enemy, tryX) || attemptMove(enemy, tryY);
    else attemptMove(enemy, tryY) || attemptMove(enemy, tryX);
    const newDx = state.playerPos.x - enemy.x;
    const newDy = state.playerPos.y - enemy.y;
    const newDist = Math.abs(newDx) + Math.abs(newDy);
    if (newDist <= 1) {
      enemyAttack(enemy);
    }
  });
}

function advanceEnemiesAfterPlayerAction(options = {}) {
  if (!state.player || state.player.stats.hpCurrent <= 0) return;
  const { performPlayerAttack = false } = options;
  updateDoors();
  if (performPlayerAttack) attemptPlayerAttack();
  enemyTurn();
  updateDoors();
  renderGrid();
  renderStatus();
  savePlayer();
}

function attemptMove(ent, pos) {
  if (!inBounds(pos.x,pos.y)) return false;
  const tile = collisionTileAt(pos.x, pos.y);
  if (['#','O','E','S','T','L','K','R','B','G'].includes(tile)) return false;
  if (state.entities.some((e) => e!==ent && e.x === pos.x && e.y === pos.y)) return false;
  ent.x = pos.x; ent.y = pos.y; return true;
}

function tryExit() {
  if (state.entities.some((e)=>['enemy','boss'].includes(e.kind))) {
    log('Defeat all foes before exiting.');
    return;
  }
  onSuccess();
}

function getPuzzleConfigAt(x, y) {
  return (state.currentRoom?.puzzleConfigs || []).find((p) => p.x === x && p.y === y);
}

function getTrapConfigAt(x, y) {
  return (state.currentRoom?.trapConfigs || []).find((t) => t.x === x && t.y === y);
}

function openPuzzle(ent) {
  const target = ent || state.entities.find((e)=>e.kind==='puzzle' && e.x===state.playerPos.x && e.y===state.playerPos.y);
  const pos = target || { x: state.playerPos.x, y: state.playerPos.y };
  if (!pos) return;
  const config = getPuzzleConfigAt(pos.x, pos.y);
  if (!config) {
    if (getBaseTile(pos.x, pos.y) === 'S') {
      log('This puzzle needs a configuration.');
    }
    return;
  }
  let attempts = 3;
  const modal = qs('#modal');
  const content = qs('#modalContent');
  modal.classList.remove('hidden');
  function render() {
    content.innerHTML = `
      <h3>Puzzle</h3>
      <p>${config.question}</p>
      ${config.options.map((opt,i)=>`<button data-i="${i}">${opt}</button>`).join(' ')}
      <div class="small">Attempts left: ${attempts}</div>
    `;
    content.querySelectorAll('button').forEach((b)=>b.onclick=()=>choose(parseInt(b.dataset.i)));
  }
  function choose(i) {
    if (config.autoSolve || state.effects.autoPuzzle) { finish(true); state.effects.autoPuzzle = false; renderEffectTracker(); advanceEnemiesAfterPlayerAction(); return; }
    if (i === config.answer) { finish(true); advanceEnemiesAfterPlayerAction(); }
    else {
      attempts--;
      if (attempts<=0) { finish(false); advanceEnemiesAfterPlayerAction(); }
      else { advanceEnemiesAfterPlayerAction(); render(); }
    }
  }
  function finish(success) {
    modal.classList.add('hidden');
    if (success) {
      log('Puzzle solved!');
      clearPuzzleTile(target.x, target.y);
    }
    else onFailure();
  }
  render();
}

function clearPuzzleTile(x,y){
  setBaseTile(x, y, '.');
  setOverlayTile(x, y, '.');
  state.entities = state.entities.filter((e)=>!(e.kind==='puzzle' && e.x===x && e.y===y));
  if (state.currentRoom?.puzzleConfigs) {
    state.currentRoom.puzzleConfigs = state.currentRoom.puzzleConfigs.filter((p)=>!(p.x===x && p.y===y));
  }
  renderGrid();
}

function hasItem(name){
  return state.player.items.some((i)=>i.name===name);
}

function hasPassive(name){
  return state.player.passives.some((p)=>p.name===name);
}

function triggerTrap(x,y){
  const config = getTrapConfigAt(x, y) || { dc: 12, damage: 5, intro: 'A trap springs!' };
  const modal = qs('#modal');
  const content = qs('#modalContent');
  const approaches = [
    { label:'Agile', bonus: state.player.class==='Rogue'?3:1 },
    { label:'Forceful', bonus: state.player.class==='Warrior'?3:1 },
    { label:'Careful', bonus: state.player.class==='Mage'?3:1 },
  ];
  modal.classList.remove('hidden');
  function render(){
    content.innerHTML = `
      <h3>Trap!</h3>
      <p>${config.intro || 'A hidden trap triggers.'}</p>
      <p class="small">DC ${config.dc} | Damage ${config.damage}</p>
      <div class="button-row">${approaches.map((a,i)=>`<button data-i="${i}">${a.label}</button>`).join('')}</div>
    `;
    content.querySelectorAll('button').forEach((b)=>b.onclick=()=>roll(parseInt(b.dataset.i)));
  }
  function roll(index){
    const pick = approaches[index];
    const d20 = Math.ceil(Math.random()*20);
    const total = d20 + pick.bonus;
    const success = total >= config.dc;
    modal.classList.add('hidden');
    setBaseTile(x, y, '.');
    setOverlayTile(x, y, '.');
    log(`Trap roll ${total} (${pick.label}) ${success?'succeeds':'fails'}.`);
    if (!success) {
      state.player.stats.hpCurrent -= config.damage;
      if (state.player.stats.hpCurrent <=0){ state.player.stats.hpCurrent=0; onFailure(); }
    }
    renderStatus();
    renderGrid();
    savePlayer();
    if (state.player.stats.hpCurrent>0){ advanceEnemiesAfterPlayerAction(); }
  }
  render();
}

function openChest(x, y) {
  const pools = [
    { type: 'item', pool: (LOOT.items || []).filter(Boolean) },
    { type: 'weapon', pool: (LOOT.weapons || []).filter(Boolean) },
  ].filter((p) => p.pool.length);

  if (!pools.length) {
    log('The chest is empty.');
    setBaseTile(x, y, '.');
    setOverlayTile(x, y, '.');
    renderGrid();
    return;
  }

  if (state.keys <= 0) {
    log('The chest is locked. You need a key.');
    return;
  }

  state.keys -= 1;
  const selection = randomFrom(pools);
  const reward = randomFrom(selection.pool);

  if (selection.type === 'item') {
    state.player.items.push(reward);
    log(`You unlock the chest and find ${reward.name} (item).`);
  } else {
    state.player.weapon = reward;
    log(`You unlock the chest and find ${reward.name} (weapon).`);
  }

  setBaseTile(x, y, '.');
  setOverlayTile(x, y, '.');
  renderGrid();
  renderCharacterPanel();
  renderStatus();
  savePlayer();
}

function buildDeathRecord(lossDate) {
  if (!state.player) return null;
  const derived = getDerivedStats();
  return {
    name: state.player.name,
    class: state.player.class,
    level: state.player.level,
    stats: {
      ...state.player.stats,
      hpMax: derived.hpMax,
      attack: derived.attack,
      defense: derived.defense,
      critChance: derived.critChance,
    },
    weapon: { ...(state.player.weapon || {}) },
    passives: [...(state.player.passives || [])],
    items: [...(state.player.items || [])],
    wins: state.player.completedRooms?.length || 0,
    streakStartDate: state.player.streakStartDate || state.player.createdAt || todayStr,
    lossDate: lossDate || todayStr,
  };
}

function finalizePlayerDeath(record) {
  state.lastDeath = record || state.lastDeath;
  if (record) saveDeathRecord(record);
  saveLockoutDate(record?.lossDate || todayStr);
  localStorage.removeItem('dd_player');
  state.player = null;
  state.currentRoom = null;
  state.baseGrid = [];
  state.grid = [];
  state.doorState = { red: false, blue: false, green: false };
  state.entities = [];
  clearActionBar();
  renderDungeonPanel();
  renderCharacterCreation();
  switchTab('character');
}

function onSuccess() {
  if (state.currentRoom) state.currentRoom.inProgress = false;
  state.dungeonView = 'dungeon';
  log(state.currentRoom.successText);
  const date = state.currentRoom?.date || todayStr;
  if (!state.player.completedRooms.includes(date)) state.player.completedRooms.push(date);
  grantXP(30);
  offerLoot();
  savePlayer();
  const content = qs('#dungeonContent');
  if (content && state.currentRoom) renderOutcome(content, 'complete', state.currentRoom, date);
  clearActionBar();
}

function onFailure() {
  log(state.currentRoom.failureText);
  const date = state.currentRoom?.date || todayStr;
  if (state.player && !state.player.failedRooms.includes(date)) state.player.failedRooms.push(date);
  const record = buildDeathRecord(date);
  const content = qs('#dungeonContent');
  if (content) {
    content.innerHTML = renderLossSummary(record || state.lastDeath, { footer: '<p class="small">Return tomorrow with a new hero.</p>' });
  }
  finalizePlayerDeath(record);
  alert('You have been defeated. Try again tomorrow.');
}

function offerLoot() {
  const modal = qs('#modal');
  const content = qs('#modalContent');
  const options = [
    { kind:'weapon', data: randomFrom(LOOT.weapons) },
    { kind:'passive', data: randomFrom(LOOT.passives) },
    { kind:'item', data: randomFrom(LOOT.items) },
  ];
  modal.classList.remove('hidden');
  content.innerHTML = `
    <h3>Victory! Choose your reward:</h3>
    <div class="loot-cards">
      ${options.map((o,i)=>`
        <div class="loot-card" data-i="${i}">
          <div><strong>${o.data.name}</strong></div>
          <div class="small">${o.kind}</div>
          <div class="small">${describeLoot(o.data)}</div>
        </div>`).join('')}
    </div>`;
  content.querySelectorAll('.loot-card').forEach((c)=>c.onclick=()=>select(parseInt(c.dataset.i)));
  function select(i){
    const choice = options[i];
    if (choice.kind === 'weapon') state.player.weapon = choice.data;
    if (choice.kind === 'passive') state.player.passives.push(choice.data);
    if (choice.kind === 'item') state.player.items.push(choice.data);
    modal.classList.add('hidden');
    savePlayer();
    renderCharacterPanel();
  }
}

function describeLoot(l){
  const parts=[];
  if (l.attack) parts.push(`+${l.attack} Attack`);
  if (l.magic || l.wisdom) parts.push(`+${l.magic || l.wisdom} Wisdom Power`);
  if (l.defense) parts.push(`${l.defense>0?'+':''}${l.defense} Defense`);
  if (l.crit) parts.push(`+${l.crit}% Crit`);
  if (l.heal) parts.push(`Heal ${l.heal}`);
  if (l.tempAttack) parts.push(`+${l.tempAttack} ATK (room)`);
  if (l.escape) parts.push('Escape combat');
  if (l.autoPuzzle) parts.push('Auto-solve next puzzle');
  return parts.join(', ');
}

function useItem(index){
  const item = state.player.items[index];
  if (!item) return;
  let message = `${item.name} used.`;
  if (item.heal) {
    const before = state.player.stats.hpCurrent;
    const { hpMax } = getDerivedStats();
    state.player.stats.hpCurrent = Math.min(hpMax, state.player.stats.hpCurrent + item.heal);
    const healed = state.player.stats.hpCurrent - before;
    message = `Healed ${healed} HP.`;
  }
  if (item.tempAttack) {
    state.effects.tempAttack = (state.effects.tempAttack || 0) + item.tempAttack;
    message = `Attack increased by ${item.tempAttack} for this run.`;
  }
  if (item.escape) {
    state.effects.escape = true;
    message = 'You are ready to escape the next threat.';
  }
  if (item.autoPuzzle) {
    state.effects.autoPuzzle = true;
    message = 'The next puzzle will be solved automatically.';
  }
  state.player.items.splice(index,1);
  log(message);
  renderCharacterPanel();
  renderStatus();
  renderDungeonInventory();
  renderEffectTracker();
  savePlayer();
}

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function grantXP(amount){
  let xpGain = amount;
  if (hasPassive('Quick Learner')) xpGain = Math.floor(xpGain * 1.1);
  state.player.xp += xpGain;
  const need = 50 + (state.player.level * 25);
  if (state.player.xp >= need) levelUp();
}

function levelUp(){
  state.player.level += 1;
  state.player.xp = 0;
  state.player.stats.vitality += 1;
  if (state.player.class === 'Warrior') state.player.stats.strength += 1;
  if (state.player.class === 'Rogue') state.player.stats.dexterity += 1;
  if (state.player.class === 'Mage') state.player.stats.wisdom += 1;
  clampPlayerHP();
  alert('Level up!');
}

function log(msg){
  if (!Array.isArray(state.combatLog)) state.combatLog = [];
  state.combatLog.push(msg);
  const logEl = qs('#log');
  if (logEl) logEl.innerHTML = state.combatLog.slice(-6).map((l)=>`<div>${l}</div>`).join('');
}

function renderDungeonInventory() {
  const container = qs('#dungeonInventory');
  if (!container) return;
  const items = state.player?.items || [];
  if (!items.length) {
    container.innerHTML = '<div class="empty-state">No items in your pack.</div>';
    return;
  }
  container.innerHTML = `
    <div class="inventory-grid">
      ${items
        .map(
          (i, idx) => `
            <div class="inventory-card">
              <div class="item-header">${i.name}</div>
              <div class="small">${describeLoot(i)}</div>
              <button data-index="${idx}" class="use-btn">Use</button>
            </div>`
        )
        .join('')}
    </div>
  `;
  container.querySelectorAll('.use-btn').forEach((b) => (b.onclick = () => useItem(parseInt(b.dataset.index, 10))));
}

function renderCharacterPanel(){
  if (!state.player) {
    renderCharacterCreation();
    return;
  }
  const p = state.player;
  const derived = getDerivedStats();
  const panel = qs('#character');
  panel.innerHTML = `
    <div class="section-card character-card">
      <div class="header-row">
        <div>
          <p class="small">${p.class}</p>
          <h2>${p.name}</h2>
        </div>
        <div class="pill">Level ${p.level}</div>
      </div>
      <div class="summary-grid">
        <div class="info-block">
          <strong>Vitals</strong>
          <div class="bar-row">
            <div class="health-bar">
              <div class="health-fill" style="width:${(p.stats.hpCurrent/(derived.hpMax||1))*100}%"></div>
            </div>
            <span class="small">${p.stats.hpCurrent}/${derived.hpMax} HP</span>
          </div>
          <div class="stat-row"><span>Strength</span><span>${derived.strength}</span></div>
          <div class="stat-row"><span>Dexterity</span><span>${derived.dexterity}</span></div>
          <div class="stat-row"><span>Wisdom</span><span>${derived.wisdom}</span></div>
          <div class="stat-row"><span>Vitality</span><span>${derived.vitality}</span></div>
          <div class="stat-divider" aria-hidden="true"></div>
          <div class="stat-row"><span>Attack</span><span>${derived.attack}</span></div>
          <div class="stat-row"><span>Defense</span><span>${derived.defense}</span></div>
          <div class="stat-row"><span>Crit</span><span>${derived.critChance}%</span></div>
        </div>
        <div class="info-block">
          <strong>Weapon</strong>
          <div class="card-row">
            <div>
              <div class="item-name">${p.weapon?.name || 'None'}</div>
              <div class="small">${describeLoot(p.weapon||{})}</div>
            </div>
          </div>
        </div>
        <div class="info-block">
          <strong>Passives</strong>
          <div class="pill-row">${(p.passives.length? p.passives.map((pa)=>`<span class="pill subtle">${pa.name}</span>`).join(''):'<span class="small">None</span>')}</div>
        </div>
        <div class="info-block">
          <strong>Items</strong>
          <div class="inventory-grid">
            ${(p.items.length? p.items.map((i,idx)=>`<div class="inventory-card">
              <div class="item-header">${i.name}</div>
              <div class="small">${describeLoot(i)}</div>
              <button data-index="${idx}" class="use-btn">Use</button>
            </div>`).join(''):'<span class="small">No items</span>')}
          </div>
        </div>
      </div>
    </div>`;
  panel.querySelectorAll('.use-btn').forEach((b)=>b.onclick=()=>useItem(parseInt(b.dataset.index)));
}

function renderMapPanel(){
  const panel = qs('#map');
  if (!state.player) { panel.innerHTML = `<div class="section-card">Create a character to view progress.</div>`; return; }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(),1);
  const startDay = monthStart.getDay();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1,0).getDate();
  const cells = [];
  for(let i=0;i<startDay;i++) cells.push('');
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  panel.innerHTML = `
    <div class="section-card">
      <h2>${now.toLocaleString('default',{month:'long'})} ${now.getFullYear()}</h2>
      <div class="map-grid">
        ${cells.map((d)=>{
          if (!d) return `<div class="calendar-cell"></div>`;
          const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const status = state.player.completedRooms.includes(dateStr) ? 'complete' : state.player.failedRooms.includes(dateStr) ? 'failed' : '';
          const todayClass = dateStr===todayStr ? 'today' : '';
          const symbol = status==='complete'?'✅': status==='failed'?'❌':'⬜';
          return `<div class="calendar-cell ${status} ${todayClass}">${d}<div>${symbol}</div></div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderSettingsPanel(){
  const panel = qs('#settings');
  panel.innerHTML = `
    <div class="section-card">
      <h2>Settings</h2>
      <button id="resetBtn">Reset Game</button>
    </div>`;
  qs('#resetBtn').onclick = ()=>{
    if (confirm('Clear all progress?')) { localStorage.clear(); location.reload(); }
  };
}

function resetDayProgress(date){
  state.player.completedRooms = state.player.completedRooms.filter((d)=>d!==date);
  state.player.failedRooms = state.player.failedRooms.filter((d)=>d!==date);
  resetDungeonState(date);
  savePlayer();
}

function setActionBar(){
  const bar = qs('#actionBar');
  if (bar) bar.innerHTML = '';
}

function clearActionBar(){
  const bar = qs('#actionBar');
  if (bar) bar.innerHTML = '';
}

function nearestEnemy(){
  let best=null; let bestDist=999;
  state.entities.filter((e)=>['enemy','boss'].includes(e.kind)).forEach((e)=>{
    const d = Math.abs(e.x - state.playerPos.x)+Math.abs(e.y - state.playerPos.y);
    if (d<bestDist) { best=e; bestDist=d; }
  });
  return best;
}

function renderEditorPanel(){
  if (!state.owner) { qs('#editor').innerHTML = '<div class="section-card">Owner mode only.</div>'; return; }
  const panel = qs('#editor');
  panel.innerHTML = `
    <div class="section-card">
      <h2>Owner Editor</h2>
      <div class="button-row">
        <div class="pill subtle">Editing: ${state.selectedDate}</div>
        <label>Type
          <select id="edType">
            <option value="combat">combat</option>
            <option value="puzzle">puzzle</option>
            <option value="trap">trap</option>
            <option value="boss">boss</option>
          </select>
        </label>
        <label class="short">Width<input type="number" id="edWidth" min="3" value="10"></label>
        <label class="short">Height<input type="number" id="edHeight" min="3" value="8"></label>
      </div>
      <label>Room Name<input id="edName"></label>
      <label>Intro Text<textarea id="edIntro"></textarea></label>
      <label>Success Text<textarea id="edSuccess"></textarea></label>
      <label>Failure Text<textarea id="edFailure"></textarea></label>
      <div class="palette" id="palette"></div>
      <div id="editorGrid" class="grid"></div>
      <fieldset id="extraConfig"><legend>Extra Config</legend></fieldset>
      <div class="button-row">
        <button id="saveRoom">Save Room</button>
        <button id="showJson">Show JSON</button>
      </div>
      <pre id="jsonPreview" class="small"></pre>
    </div>`;
  buildPalette();
  buildEditorGrid();
  renderExtraConfig();
  syncBossSelector();
  const widthInput = qs('#edWidth');
  const heightInput = qs('#edHeight');
  if (widthInput) widthInput.addEventListener('change', resizeEditorGridFromInputs);
  if (heightInput) heightInput.addEventListener('change', resizeEditorGridFromInputs);
  qs('#saveRoom').onclick = saveEditorRoom;
  qs('#showJson').onclick = previewJson;
  loadEditorRoom(state.selectedDate);
}

function buildPalette(){
  const pal = qs('#palette');
  const buttons = [
    { key: '.', label:'Floor' },
    { key: '#', label:'Wall' },
    { key: 'O', label:'Pushable' },
    { key: 'K', label:'Key' },
    { key: 'C', label:'Chest' },
    { key: 'L', label:'Locked Door' },
    { key: 'R', label:'Red Door' },
    { key: 'B', label:'Blue Door' },
    { key: 'G', label:'Green Door' },
    { key: 'r', label:'Red Plate' },
    { key: 'b', label:'Blue Plate' },
    { key: 'g', label:'Green Plate' },
    { key: 'E', label:'Exit' },
    { key: 'T', label:'Trap' },
    { key: 'S', label:'Puzzle' },
    { key: 'P', label:'Player Spawn' },
    { key: 'N', label:'Enemy' },
    { key: 'X', label:'Boss' }
  ];
  pal.innerHTML = buttons.map((b)=>`<button data-k="${b.key}">${b.label}</button>`).join('');
  pal.dataset.current = '.';
  pal.querySelectorAll('button').forEach((btn)=>btn.onclick=()=>{
    pal.dataset.current = btn.dataset.k;
  });
}

function buildEditorGrid(prefill){
  const g = qs('#editorGrid');
  const widthInput = qs('#edWidth');
  const heightInput = qs('#edHeight');
  const fallback = Array.from({length:8},()=>Array.from({length:10},()=>'.'));
  let grid = prefill || fallback;
  const h = grid.length; const w = grid[0]?.length || 10;
  if (widthInput) widthInput.value = w;
  if (heightInput) heightInput.value = h;
  g.classList.add('grid-labeled');
  g.style.gridTemplateColumns = `32px repeat(${w}, 28px)`;
  g.style.gridTemplateRows = `24px repeat(${h}, 28px)`;
  g.innerHTML = '';
  for(let y=-1;y<h;y++) for(let x=-1;x<w;x++){
    const cell=document.createElement('div');
    if (x===-1 && y===-1) {
      cell.className='label-cell corner';
    } else if (y===-1) {
      cell.className='label-cell column-label';
      cell.textContent = x;
    } else if (x===-1) {
      cell.className='label-cell row-label';
      cell.textContent = y;
    } else {
      cell.dataset.x=x; cell.dataset.y=y;
      updateEditorCell(cell, grid[y][x]);
      cell.onclick=()=>{
        const key = qs('#palette').dataset.current || '.';
        grid[y][x]=key;
        updateEditorCell(cell, key);
        g.dataset.grid = JSON.stringify(grid);
        syncBossSelector();
      };
    }
    g.appendChild(cell);
  }
  g.dataset.grid = JSON.stringify(grid);
  syncBossSelector();
}

function resizeEditorGridFromInputs(){
  const current = gatherEditorGrid();
  const widthInput = qs('#edWidth');
  const heightInput = qs('#edHeight');
  const newW = Math.max(3, parseInt(widthInput?.value,10) || current[0]?.length || 10);
  const newH = Math.max(3, parseInt(heightInput?.value,10) || current.length || 8);
  const resized = Array.from({length:newH}, (_,y)=>Array.from({length:newW},(_,x)=>current[y]?.[x] || '.'));
  buildEditorGrid(resized);
}

function updateEditorCell(cell, key){
  const glyphMap = {
    '#': '',
    '.': '',
    'O': '⬜',
    'K': '🔑',
    'L': '🔒',
    'R': '🟥',
    'B': '🟦',
    'G': '🟩',
    'r': '',
    'b': '',
    'g': '',
    'E': '🚪',
    'T': '⚠️',
    'S': '✨',
    'C': '💰',
    'X': '👑',
    'N': '⚔️',
    'P': '',
  };
  const glyph = Object.prototype.hasOwnProperty.call(glyphMap, key) ? glyphMap[key] : '';
  cell.textContent = glyph;
  cell.className='cell';
  if (key==='#') cell.classList.add('tile-wall');
  else if (key==='O') cell.classList.add('tile-pushable');
  else if (key==='E') cell.classList.add('tile-exit');
  else if (key==='T') cell.classList.add('tile-trap');
  else if (key==='S') cell.classList.add('tile-puzzle');
  else if (key==='K') cell.classList.add('tile-key');
  else if (key==='C') cell.classList.add('tile-chest');
  else if (key==='L') cell.classList.add('tile-locked');
  else if (['R','B','G'].includes(key)) cell.classList.add(`tile-door-${doorColor(key)}`);
  else if (['r','b','g'].includes(key)) cell.classList.add(`tile-plate-${plateColor(key)}`);
  else if (key==='X') cell.classList.add('entity-boss');
  else if (key==='N') cell.classList.add('entity-enemy');
  else if (key==='P') cell.classList.add('entity-spawn');
  else cell.classList.add('tile-floor');
}

function editorHasBoss(){
  const grid = gatherEditorGrid();
  return grid.some((row)=>row.some((c)=>c==='B'));
}

function syncBossSelector(){
  const select = qs('#edBoss');
  if (!select) return;
  const enabled = editorHasBoss();
  select.disabled = !enabled;
  select.title = enabled ? '' : 'Place a boss tile to choose a boss type.';
}

function renderExtraConfig(){
  const box = qs('#extraConfig');
  box.innerHTML = `
    <div class="config-group">
      <div class="config-header"><strong>Puzzles</strong> <button id="addPuzzle">Add Puzzle</button></div>
      <div id="puzzleList"></div>
    </div>
    <div class="config-group">
      <div class="config-header"><strong>Traps</strong> <button id="addTrap">Add Trap</button></div>
      <div id="trapList"></div>
    </div>
    <label>Boss Type<select id="edBoss">${BOSSES.map((b)=>`<option value="${b}">${b}</option>`).join('')}</select></label>
  `;
  qs('#addPuzzle').onclick = () => addPuzzleConfigRow();
  qs('#addTrap').onclick = () => addTrapConfigRow();
}

function addPuzzleConfigRow(data={}){
  const list = qs('#puzzleList');
  const row = document.createElement('div');
  row.className = 'config-row';
  row.innerHTML = `
    <label>X<input type="number" class="puz-x" value="${data.x ?? 0}" min="0"></label>
    <label>Y<input type="number" class="puz-y" value="${data.y ?? 0}" min="0"></label>
    <label>Question<input class="puz-q" value="${data.question || ''}"></label>
    <label>Options (comma list)<input class="puz-opt" value="${(data.options||['A','B','C']).join(',')}"></label>
    <label>Answer Index<input type="number" class="puz-ans" value="${data.answer ?? 0}" min="0"></label>
    <button class="remove-row">Remove</button>
  `;
  row.querySelector('.remove-row').onclick = ()=>row.remove();
  list.appendChild(row);
}

function addTrapConfigRow(data={}){
  const list = qs('#trapList');
  const row = document.createElement('div');
  row.className = 'config-row';
  row.innerHTML = `
    <label>X<input type="number" class="trap-x" value="${data.x ?? 0}" min="0"></label>
    <label>Y<input type="number" class="trap-y" value="${data.y ?? 0}" min="0"></label>
    <label>Intro<input class="trap-intro" value="${data.intro || ''}"></label>
    <label>DC<input type="number" class="trap-dc" value="${data.dc ?? 12}" min="1"></label>
    <label>Damage<input type="number" class="trap-dmg" value="${data.damage ?? 5}" min="0"></label>
    <button class="remove-row">Remove</button>
  `;
  row.querySelector('.remove-row').onclick = ()=>row.remove();
  list.appendChild(row);
}

async function loadEditorRoom(date){
  const room = await getRoomForDate(date);
  if (room) {
    const normalized = normalizeRoom(room);
    qs('#edType').value = room.type;
    qs('#edName').value = room.name;
    qs('#edIntro').value = room.introText;
    qs('#edSuccess').value = room.successText;
    qs('#edFailure').value = room.failureText;
    qs('#edBoss').value = room.bossConfig?.name || BOSSES[0];
    const tileGrid = room.tiles.map((row)=>row.split(''));
    room.entities.forEach((ent)=>{
      if (ent.kind==='playerSpawn') tileGrid[ent.y][ent.x]='P';
      if (ent.kind==='enemy') tileGrid[ent.y][ent.x]='N';
      if (ent.kind==='boss') tileGrid[ent.y][ent.x]='X';
    });
    buildEditorGrid(tileGrid.map((row)=>row.map((c)=>['.','#','O','E','T','S','P','N','X','K','L','R','B','G','r','b','g','C'].includes(c)?c:'.')));
    const puzzleList = qs('#puzzleList');
    const trapList = qs('#trapList');
    puzzleList.innerHTML='';
    trapList.innerHTML='';
    normalized.puzzleConfigs.forEach((p)=>addPuzzleConfigRow(p));
    normalized.trapConfigs.forEach((t)=>addTrapConfigRow(t));
  } else {
    buildEditorGrid();
    qs('#edName').value = '';
    qs('#edIntro').value = '';
    qs('#edSuccess').value = '';
    qs('#edFailure').value = '';
    qs('#puzzleList').innerHTML='';
    qs('#trapList').innerHTML='';
  }
}

function gatherEditorGrid(){
  const g = qs('#editorGrid');
  return JSON.parse(g.dataset.grid || '[]');
}

function saveEditorRoom(){
  const grid = gatherEditorGrid();
  const date = state.selectedDate;
  const width = grid[0]?.length || 10;
  const height = grid.length || 8;
  const entities = [];
  let hasBoss = false;
  grid.forEach((row,y)=>row.forEach((cell,x)=>{
    if (cell==='P') entities.push({ kind:'playerSpawn', x,y });
    if (cell==='N') entities.push({ kind:'enemy', enemyType:'Goblin Cutthroat', x,y });
    if (cell==='X') { hasBoss = true; entities.push({ kind:'boss', bossType: qs('#edBoss').value, x,y }); }
    if (cell==='E') entities.push({ kind:'exit', x, y });
    if (cell==='S') entities.push({ kind:'puzzle', x, y });
  }));
  const puzzleConfigs = Array.from(qs('#puzzleList').children).map((row)=>({
    x: parseInt(row.querySelector('.puz-x').value,10)||0,
    y: parseInt(row.querySelector('.puz-y').value,10)||0,
    question: row.querySelector('.puz-q').value,
    options: (row.querySelector('.puz-opt').value || 'A,B,C').split(',').map((s)=>s.trim()).filter(Boolean),
    answer: parseInt(row.querySelector('.puz-ans').value,10)||0,
  }));
  const trapConfigs = Array.from(qs('#trapList').children).map((row)=>({
    x: parseInt(row.querySelector('.trap-x').value,10)||0,
    y: parseInt(row.querySelector('.trap-y').value,10)||0,
    intro: row.querySelector('.trap-intro').value,
    dc: parseInt(row.querySelector('.trap-dc').value,10)||12,
    damage: parseInt(row.querySelector('.trap-dmg').value,10)||5,
  }));
  const room = {
    date,
    type: qs('#edType').value,
    name: qs('#edName').value || 'Untitled',
    introText: qs('#edIntro').value,
    successText: qs('#edSuccess').value,
    failureText: qs('#edFailure').value,
    gridWidth: width,
    gridHeight: height,
    tiles: grid.map((row)=>row.map((c)=>['P','N','X'].includes(c)?'.':c).join('')),
    entities,
    puzzleConfigs,
    trapConfigs,
    bossConfig: hasBoss ? { name: qs('#edBoss').value } : undefined
  };
  if (puzzleConfigs.length) room.puzzleConfig = puzzleConfigs[0];
  if (trapConfigs.length) room.trapConfig = trapConfigs[0];
  const rooms = getOwnerRooms();
  rooms[date]=room; saveOwnerRooms(rooms);
  persistRoomToFile(room);
  alert('Room saved for '+date);
}

function previewJson(){
  const rooms = getOwnerRooms();
  qs('#jsonPreview').textContent = JSON.stringify(rooms, null, 2);
}

function setPaletteCurrent(key){
  const pal = qs('#palette');
  pal.dataset.current = key;
}

window.addEventListener('load', init);
