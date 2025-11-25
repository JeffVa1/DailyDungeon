import { formatDateForEastern, getNextWeekdayDate } from './utils.js';

export const todayStr = formatDateForEastern();
export const ownerMode = location.search.includes('owner=1');
export const ROOM_FILE_PREFIX = 'room-';
export const ROOM_FILE_FOLDER = 'rooms';
export const ROOM_FILE_EXTENSION = '.json';

export const ROOM_DEFINITIONS = [
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

export const DEFAULT_ENEMIES = {
  'Goblin Cutthroat': { hp: 10, attack: 4, defense: 1, crit: 0.1 },
  'Skeleton Guard': { hp: 14, attack: 3, defense: 3, crit: 0.05 },
  'Cave Slime': { hp: 18, attack: 2, defense: 0, crit: 0.02 },
  'Shadow Wolf': { hp: 20, attack: 5, defense: 2, crit: 0.1 },
  'Ironbound Archer': { hp: 16, attack: 6, defense: 1, crit: 0.1 },
};

export const DEFAULT_LOOT = {
  weapons: [
    { name: 'Rusty Dagger', attack: 1, scrapXp: 5 },
    { name: 'Iron Longsword', attack: 3, scrapXp: 8 },
    { name: 'Ember Wand', magic: 2, scrapXp: 9 },
    { name: 'Shadow Bow', attack: 2, crit: 3, scrapXp: 10 },
    { name: 'Ogre Smasher', attack: 5, defense: -1, scrapXp: 12 },
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

export const DEFAULT_BOSSES = ['The Hollow Knight', 'Maw of Cinders', 'Oracle of Dust'];

export let ENEMIES = { ...DEFAULT_ENEMIES };
export let LOOT = { ...DEFAULT_LOOT };
export let BOSSES = [...DEFAULT_BOSSES];

export const CLASSES = {
  Warrior: { strength: 8, dexterity: 4, wisdom: 3, vitality: 8 },
  Rogue: { strength: 4, dexterity: 8, wisdom: 4, vitality: 7 },
  Mage: { strength: 3, dexterity: 4, wisdom: 9, vitality: 6 },
};

export let state = {
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

export function setEnemies(value) {
  ENEMIES = value;
}

export function setLoot(value) {
  LOOT = value;
}

export function setBosses(value) {
  BOSSES = value;
}
