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
      '#P....G.E#',
      '#....##..#',
      '#........#',
      '#..S.....#',
      '#........#',
      '##########'
    ],
    entities: [
      { kind: 'playerSpawn', x: 1, y: 1 },
      { kind: 'enemy', enemyType: 'Goblin Cutthroat', x: 6, y: 1 },
      { kind: 'enemy', enemyType: 'Skeleton Guard', x: 3, y: 4 },
      { kind: 'puzzle', x: 3, y: 4 },
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
      '#..B#...#',
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

const ENEMIES = {
  'Goblin Cutthroat': { hp: 10, attack: 4, defense: 1, crit: 0.1 },
  'Skeleton Guard': { hp: 14, attack: 3, defense: 3, crit: 0.05 },
  'Cave Slime': { hp: 18, attack: 2, defense: 0, crit: 0.02 },
  'Shadow Wolf': { hp: 20, attack: 5, defense: 2, crit: 0.1 },
  'Ironbound Archer': { hp: 16, attack: 6, defense: 1, crit: 0.1 },
};

const BOSSES = ['The Hollow Knight', 'Maw of Cinders', 'Oracle of Dust'];

const LOOT = {
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

const CLASSES = {
  Warrior: { strength: 8, dexterity: 4, wisdom: 3, vitality: 8 },
  Rogue: { strength: 4, dexterity: 8, wisdom: 4, vitality: 7 },
  Mage: { strength: 3, dexterity: 4, wisdom: 9, vitality: 6 },
};

let state = {
  player: null,
  currentRoom: null,
  selectedDate: todayStr,
  grid: [],
  entities: [],
  playerPos: { x: 0, y: 0 },
  activeTab: 'dungeon',
  owner: ownerMode,
  combatLog: [],
  effects: { tempAttack: 0, autoPuzzle: false, escape: false },
};

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

function migratePlayerStats() {
  if (!state.player) return;
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
  if (saved[filename]) return saved[filename];
  const canFetch = ['http:', 'https:'].includes(location.protocol);
  if (!canFetch) {
    return null;
  }
  try {
    const res = await fetch(filename, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Room fetch failed for', filename, err);
  }
  return null;
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

function init() {
  if (ownerMode) {
    qsa('.owner-only').forEach((b) => (b.style.display = 'inline-flex'));
    setupOwnerDateControl();
  }
  refreshDateUI();
  attachTabEvents();
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
  if (tab === 'character') renderCharacterPanel();
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

function renderCharacterCreation() {
  const panel = qs('#character');
  panel.innerHTML = `
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

function buildGrid(room) {
  const grid = [];
  for (let y = 0; y < room.gridHeight; y++) {
    const row = [];
    const line = room.tiles[y] || ''.padEnd(room.gridWidth, '.');
    for (let x = 0; x < room.gridWidth; x++) {
      const ch = line[x] || '.';
      row.push(ch);
    }
    grid.push(row);
  }
  return grid;
}

async function renderDungeonPanel() {
  const panel = qs('#dungeon');
  if (!state.player) {
    panel.innerHTML = `<div class="section-card">Create a character to enter the dungeon.</div>`;
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

  state.currentRoom = JSON.parse(JSON.stringify(room));
  state.grid = buildGrid(room);
  initEntities(room);
  content.innerHTML = `
      <h2>${room.name}</h2>
      <p class="small">${room.introText}</p>
      <div id="roomGrid" class="grid"></div>
      <div class="status-row" id="statusRow"></div>
      <div id="log" class="small"></div>
      <div class="dpad" id="dpad"></div>
    `;
  renderGrid();
  renderStatus();
  renderDpad();
  state.combatLog = [];
  setActionBar();
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
  wrap.style.gridTemplateColumns = `repeat(${room.gridWidth}, 28px)`;
  wrap.innerHTML = '';
  for (let y = 0; y < room.gridHeight; y++) {
    for (let x = 0; x < room.gridWidth; x++) {
      const tile = state.grid[y][x];
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.x = x; cell.dataset.y = y;
      const ent = state.entities.find((e) => e.x === x && e.y === y);
      if (tile === '#') cell.classList.add('tile-wall');
      else if (tile === 'S') cell.classList.add('tile-puzzle');
      else if (tile === 'T') cell.classList.add('tile-trap');
      else if (tile === 'O') cell.classList.add('tile-obstacle');
      else if (tile === 'E') cell.classList.add('tile-exit');
      else cell.classList.add('tile-floor');
      if (ent) cell.classList.add(entityClass(ent));
      cell.textContent = ent ? entityGlyph(ent) : '';
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
  if (ent.kind === 'player') return 'P';
  if (ent.kind === 'enemy') return 'G';
  if (ent.kind === 'boss') return 'B';
  if (ent.kind === 'exit') return 'E';
  if (ent.kind === 'puzzle') return '?';
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
  row.innerHTML = `
    <div>
      <div>${player.name} (Lv ${player.level} ${player.class})</div>
      <div class="health-bar"><div class="health-fill" style="width:${(player.stats.hpCurrent / (derived.hpMax || 1)) * 100}%"></div></div>
      <div class="small">ATK ${derived.attack} | DEF ${derived.defense} | CRIT ${derived.critChance}%</div>
    </div>`;
}

function renderDpad() {
  const dpad = qs('#dpad');
  if (!dpad) return;
  const order = ['','','','W','','','A','S','D'];
  dpad.innerHTML = '';
  order.forEach((label) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (!label) { btn.disabled = true; btn.style.visibility='hidden'; }
    btn.addEventListener('click', () => handleMove(label.toLowerCase()));
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

function handleMove(dir) {
  if (!state.currentRoom) return;
  const delta = { w: [0,-1], s: [0,1], a: [-1,0], d: [1,0] }[dir];
  if (!delta) return;
  const nx = state.playerPos.x + delta[0];
  const ny = state.playerPos.y + delta[1];
  if (!inBounds(nx, ny)) return;
  const tile = state.grid[ny][nx];
  if (['#','O'].includes(tile)) return;
  const ent = state.entities.find((e) => e.x === nx && e.y === ny && e.kind !== 'player');
  if (ent) {
    if (['enemy','boss'].includes(ent.kind) && state.effects.escape) {
      log('You vanish in smoke, slipping past the foe.');
      state.effects.escape = false;
      state.entities = state.entities.filter((e) => e !== ent);
    }
    if (ent.kind === 'exit') return tryExit();
    if (['enemy','boss'].includes(ent.kind)) return resolveCombat(ent);
    if (ent.kind === 'puzzle') return openPuzzle(ent);
  }
  state.playerPos = { x: nx, y: ny };
  const playerEntity = state.entities.find((e) => e.kind === 'player');
  if (playerEntity) { playerEntity.x = nx; playerEntity.y = ny; }
  if (tile === 'S') return openPuzzle({ x: nx, y: ny, kind: 'puzzle' });
  if (tile === 'T') return triggerTrap(nx, ny);
  if (tile === 'E') return tryExit();
  advanceEnemiesAfterPlayerAction();
}

function inBounds(x,y){
  const r = state.currentRoom;
  return x >=0 && y>=0 && x<r.gridWidth && y<r.gridHeight;
}

function resolveCombat(enemy) {
  const player = state.player;
  const derived = getDerivedStats();
  const dmg = Math.max(
    1,
    derived.attack - (enemy.kind === 'boss' ? enemy.defense || (4 + player.level) : ENEMIES[enemy.enemyType]?.defense || 1)
  );
  const crit = Math.random() < derived.critChance / 100;
  const dealt = crit ? dmg * 2 : dmg;
  enemy.hp -= dealt;
  log(`${player.name} hits ${enemy.enemyType || enemy.kind} for ${dealt}${crit?' (CRIT)':''}.`);
  if (enemy.hp <= 0) {
    state.entities = state.entities.filter((e) => e !== enemy);
    renderGrid();
    if (state.currentRoom.type === 'boss' && !state.entities.some((e) => e.kind==='boss')) log('Boss defeated!');
    advanceEnemiesAfterPlayerAction();
    return;
  }
  enemyAttack(enemy);
  advanceEnemiesAfterPlayerAction();
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

function advanceEnemiesAfterPlayerAction() {
  if (!state.player || state.player.stats.hpCurrent <= 0) return;
  enemyTurn();
  renderGrid();
  renderStatus();
  savePlayer();
}

function attemptMove(ent, pos) {
  if (!inBounds(pos.x,pos.y)) return false;
  const tile = state.grid[pos.y][pos.x];
  if (['#','O','E','S','T'].includes(tile)) return false;
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
    if (state.grid[pos.y]?.[pos.x] === 'S') {
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
    if (config.autoSolve || state.effects.autoPuzzle) { finish(true); state.effects.autoPuzzle = false; advanceEnemiesAfterPlayerAction(); return; }
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
  state.grid[y][x]='.';
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
    state.grid[y][x]='.';
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

function onSuccess() {
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
  if (!state.player.failedRooms.includes(date)) state.player.failedRooms.push(date);
  savePlayer();
  const content = qs('#dungeonContent');
  if (content && state.currentRoom) renderOutcome(content, 'failed', state.currentRoom, date);
  alert('You have been defeated. Try again tomorrow.');
  clearActionBar();
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
  state.combatLog.push(msg);
  const logEl = qs('#log');
  if (logEl) logEl.innerHTML = state.combatLog.slice(-6).map((l)=>`<div>${l}</div>`).join('');
}

function renderCharacterPanel(){
  if (!state.player) return;
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
  savePlayer();
}

function setActionBar(){
  const bar = qs('#actionBar');
  bar.innerHTML = '';
  const attack = document.createElement('button');
  attack.textContent = 'Attack';
  attack.onclick = ()=>{
    const foe = nearestEnemy();
    if (foe) resolveCombat(foe);
  };
  const interact = document.createElement('button');
  interact.textContent = 'Interact';
  interact.onclick = ()=>openPuzzle();
  bar.append(attack, interact);
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
  qs('#saveRoom').onclick = saveEditorRoom;
  qs('#showJson').onclick = previewJson;
  loadEditorRoom(state.selectedDate);
}

function buildPalette(){
  const pal = qs('#palette');
  const buttons = [
    { key: '.', label:'Floor' },
    { key: '#', label:'Wall' },
    { key: 'O', label:'Obstacle' },
    { key: 'E', label:'Exit' },
    { key: 'T', label:'Trap' },
    { key: 'S', label:'Puzzle' },
    { key: 'D', label:'Decoration' },
    { key: 'P', label:'Player Spawn' },
    { key: 'G', label:'Enemy' },
    { key: 'B', label:'Boss' }
  ];
  pal.innerHTML = buttons.map((b)=>`<button data-k="${b.key}">${b.label}</button>`).join('');
  pal.dataset.current = '.';
  pal.querySelectorAll('button').forEach((btn)=>btn.onclick=()=>{
    pal.dataset.current = btn.dataset.k;
  });
}

function buildEditorGrid(prefill){
  const g = qs('#editorGrid');
  const grid = prefill || Array.from({length:8},()=>Array.from({length:10},()=>'.'));
  const h = grid.length; const w = grid[0]?.length || 10;
  g.style.gridTemplateColumns = `repeat(${w}, 28px)`;
  g.innerHTML = '';
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const cell=document.createElement('div');
    cell.dataset.x=x; cell.dataset.y=y;
    updateEditorCell(cell, grid[y][x]);
    cell.onclick=()=>{
      const key = qs('#palette').dataset.current || '.';
      grid[y][x]=key;
      updateEditorCell(cell, key);
      g.dataset.grid = JSON.stringify(grid);
    };
    g.appendChild(cell);
  }
  g.dataset.grid = JSON.stringify(grid);
}

function updateEditorCell(cell, key){
  cell.textContent=key==='P'?'P': key==='G'?'G': key==='B'?'B':'';
  cell.className='cell';
  if (key==='#') cell.classList.add('tile-wall');
  else if (key==='O') cell.classList.add('tile-obstacle');
  else if (key==='E') cell.classList.add('tile-exit');
  else if (key==='T') cell.classList.add('tile-trap');
  else if (key==='S') cell.classList.add('tile-puzzle');
  else cell.classList.add('tile-floor');
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
      if (ent.kind==='enemy') tileGrid[ent.y][ent.x]='G';
      if (ent.kind==='boss') tileGrid[ent.y][ent.x]='B';
    });
    buildEditorGrid(tileGrid.map((row)=>row.map((c)=>['.','#','O','E','T','S','D','P','G','B'].includes(c)?c:'.')));
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
  grid.forEach((row,y)=>row.forEach((cell,x)=>{
    if (cell==='P') entities.push({ kind:'playerSpawn', x,y });
    if (cell==='G') entities.push({ kind:'enemy', enemyType:'Goblin Cutthroat', x,y });
    if (cell==='B') entities.push({ kind:'boss', bossType: qs('#edBoss').value, x,y });
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
    tiles: grid.map((row)=>row.map((c)=>['P','G','B'].includes(c)?'.':c).join('')),
    entities,
    puzzleConfigs,
    trapConfigs,
    bossConfig: { name: qs('#edBoss').value }
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
