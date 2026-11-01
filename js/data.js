'use strict';
// ---------- Данные: расы, юниты, здания, улучшения, заклинания ----------
const TW = 64, TH = 32;          // изометрическая клетка
const STEP = 0.05;               // шаг симуляции, с (20 тиков в секунду)
const MAPN = 96;                 // карта MAPN × MAPN клеток
const NEUTRAL = 3, MONSTER = 4;  // владельцы: 0..2 — игроки, 3 — отшельники, 4 — дракон
const COLORS = ['#e8402a', '#2f8fe8', '#f2c230', '#9aa', '#a33'];
const CNAMES = ['красный', 'синий', 'жёлтый'];

const RACES = {
  rus: { name: 'Русичи', flam: 1.0, bHp: 1.0, bTime: 0.9, bCost: 1.0, uSpd: 1.0, armor: 0, wood: 1.2,
    about: 'Деревянные терема — дёшево и быстро строятся, но хорошо горят. Лесорубы рубят на 20% быстрее. Волхв насылает огненный дождь, Богатырь сносит толпу ударом палицы.',
    ruin: ['ruin_s', 'ruin_l'] },
  mon: { name: 'Монголы', flam: 1.3, bHp: 0.85, bTime: 0.7, bCost: 0.85, uSpd: 1.15, armor: 0, wood: 1.0,
    about: 'Войлочные юрты ставятся мгновенно и стоят дёшево, но вспыхивают как солома. Все войска на 15% быстрее, конные лучники стреляют на скаку. Шаман лечит, камнемёт мечет горшки с огнём.',
    ruin: ['ruin_yurt', 'ruin_yurt'] },
  teu: { name: 'Тевтонцы', flam: 0.35, bHp: 1.4, bTime: 1.3, bCost: 1.2, uSpd: 0.95, armor: 1, wood: 1.0,
    about: 'Камень и фахверк: постройки дороги и медленны, зато крепки и почти не горят. Броня всех воинов +1. Рыцари — самая тяжёлая конница, требушет бьёт дальше всех.',
    ruin: ['ruin_stone', 'ruin_stone'] },
};

// архетипы юнитов: hp, урон, броня, дальность (клетки), перезарядка, скорость (клеток/с), обзор, цена, время, откуда
const UBASE = {
  worker: { hp: 40, dmg: 4, arm: 0, rng: 0.8, cd: 1.2, spd: 2.0, sight: 6, g: 50, w: 0, time: 12, from: 'hall', h: 44, key: 'Q' },
  inf:    { hp: 110, dmg: 11, arm: 2, rng: 0.8, cd: 1.1, spd: 1.9, sight: 7, g: 70, w: 20, time: 18, from: 'barracks', h: 50, key: 'Q', torch: 1 },
  spear:  { hp: 90, dmg: 9, arm: 1, rng: 1.3, cd: 1.2, spd: 1.9, sight: 7, g: 50, w: 30, time: 16, from: 'barracks', h: 50, key: 'W', vsCav: 2.5 },
  archer: { hp: 60, dmg: 8, arm: 0, rng: 6, cd: 1.5, spd: 1.9, sight: 8, g: 50, w: 40, time: 18, from: 'range', h: 48, key: 'Q', proj: 'arrow' },
  cav:    { hp: 160, dmg: 14, arm: 2, rng: 0.9, cd: 1.3, spd: 3.2, sight: 8, g: 120, w: 40, time: 24, from: 'stable', h: 66, key: 'Q', cav: 1 },
  mage:   { hp: 70, dmg: 12, arm: 0, rng: 5, cd: 2.0, spd: 1.8, sight: 8, g: 120, w: 20, time: 26, from: 'temple', h: 50, key: 'Q', proj: 'magic', magic: 1, mana: 100 },
  siege:  { hp: 180, dmg: 45, arm: 2, rng: 8, minR: 2, cd: 4.5, spd: 1.1, sight: 9, g: 150, w: 150, time: 34, from: 'smith', h: 60, key: 'Q', proj: 'stone', splash: 0.9, vsB: 2.5, siege: 1 },
  hero:   { hp: 600, dmg: 30, arm: 4, rng: 0.9, cd: 1.1, spd: 2.2, sight: 9, g: 400, w: 100, time: 45, from: 'hall', h: 62, key: 'W', hero: 1, regen: 1.5 },
};
// названия и отличия по расам
const URACE = {
  rus: {
    worker: { name: 'Смерд' }, inf: { name: 'Ратник' }, spear: { name: 'Копейщик' },
    archer: { name: 'Лучник' }, cav: { name: 'Дружинник', hp: 170 },
    mage: { name: 'Волхв', spell: 'firerain', fx: 'fire' }, siege: { name: 'Порок' },
    hero: { name: 'Богатырь', hp: 750, dmg: 34, ability: 'smash' },
  },
  mon: {
    worker: { name: 'Арат' }, inf: { name: 'Нукер', dmg: 10, hp: 100 }, spear: { name: 'Хашар' },
    archer: { name: 'Конный лучник', hp: 85, spd: 3.0, rng: 5.5, g: 80, w: 40, h: 62, cav: 1 },
    cav: { name: 'Тургауд', hp: 190, arm: 3 }, mage: { name: 'Шаман', spell: 'spirits', fx: 'heal' },
    siege: { name: 'Камнемёт', dmg: 40, firePot: 1 },
    hero: { name: 'Багатур', hp: 650, spd: 3.0, h: 70, cav: 1, ability: 'smash' },
  },
  teu: {
    worker: { name: 'Кнехт' }, inf: { name: 'Сержант', hp: 130, arm: 3, g: 80 }, spear: { name: 'Пикинёр', rng: 1.5 },
    archer: { name: 'Арбалетчик', dmg: 14, cd: 2.2, rng: 6.5, g: 60, proj: 'bolt' },
    cav: { name: 'Рыцарь', hp: 220, arm: 4, dmg: 16, spd: 2.8, g: 160 }, mage: { name: 'Капеллан', spell: 'prayer', fx: 'heal' },
    siege: { name: 'Требушет', dmg: 70, rng: 9.5, spd: 0.8, cd: 5.5, g: 180 },
    hero: { name: 'Магистр', hp: 820, arm: 6, ability: 'smash' },
  },
};
const UARCH = ['worker', 'inf', 'spear', 'archer', 'cav', 'mage', 'siege', 'hero'];

// здания: размер (клетки), hp, цена, время, требование, что обучает, k — ширина спрайта к ширине ромба
const BBASE = {
  hall:     { s: 3, hp: 1400, g: 350, w: 250, time: 60, pop: 5, drop: 1, trains: ['worker', 'hero'], sight: 9, key: 'H', k: 1.12 },
  house:    { s: 2, hp: 350, g: 30, w: 60, time: 20, pop: 8, key: 'E', k: 1.05 },
  barracks: { s: 3, hp: 800, g: 120, w: 150, time: 40, req: 'hall', trains: ['inf', 'spear'], key: 'B', k: 1.08 },
  range:    { s: 3, hp: 650, g: 100, w: 150, time: 35, req: 'barracks', trains: ['archer'], key: 'R', k: 1.0 },
  smith:    { s: 3, hp: 650, g: 150, w: 120, time: 40, req: 'barracks', trains: ['siege'], key: 'K', k: 1.0 },
  stable:   { s: 3, hp: 750, g: 150, w: 150, time: 40, req: 'smith', trains: ['cav'], key: 'S', k: 1.1 },
  temple:   { s: 2, hp: 600, g: 200, w: 100, time: 45, req: 'barracks', trains: ['mage'], key: 'T', k: 1.05 },
  tower:    { s: 2, hp: 500, g: 100, w: 100, time: 30, req: 'barracks', atk: { dmg: 10, rng: 7, cd: 1.6 }, sight: 9, key: 'O', k: 0.9 },
};
const BNAMES = {
  rus: { hall: 'Терем', house: 'Изба', barracks: 'Гридница', range: 'Стрельня', smith: 'Кузня', stable: 'Конюшня', temple: 'Капище', tower: 'Сторожевая вышка' },
  mon: { hall: 'Ханская ставка', house: 'Юрта', barracks: 'Юрта нукеров', range: 'Юрта лучников', smith: 'Кузнечная юрта', stable: 'Загон', temple: 'Юрта шамана', tower: 'Дозорная вышка' },
  teu: { hall: 'Замок', house: 'Дом', barracks: 'Казарма', range: 'Мастерская арбалетов', smith: 'Кузница', stable: 'Конюшня', temple: 'Часовня', tower: 'Башня' },
};
const BARCH = ['hall', 'house', 'barracks', 'range', 'smith', 'stable', 'temple', 'tower'];
// у некоторых зданий своя иконка-спрайт
const BSPRITE = { rus: { temple: 'b_rus_temple' }, mon: {}, teu: {} };

// исследования: где, цена, время, эффект
const UPS = {
  atk1:    { at: 'smith', name: 'Закалка клинков', g: 150, w: 50, time: 40, txt: 'Урон ближнего боя +2', key: 'A' },
  atk2:    { at: 'smith', name: 'Булатная сталь', g: 250, w: 100, time: 50, req: 'atk1', txt: 'Урон ближнего боя ещё +2', key: 'A' },
  arm1:    { at: 'smith', name: 'Кольчуги', g: 150, w: 50, time: 40, txt: 'Броня всех воинов +1', key: 'D' },
  arm2:    { at: 'smith', name: 'Пластинчатый доспех', g: 250, w: 100, time: 50, req: 'arm1', txt: 'Броня ещё +1', key: 'D' },
  fire:    { at: 'range', name: 'Огненные стрелы', g: 200, w: 100, time: 45, txt: 'Стрелы лучников и вышек поджигают постройки', key: 'F' },
  axes:    { at: 'hall', name: 'Острые топоры', g: 100, w: 50, time: 30, txt: 'Рубка леса +25%', key: 'A' },
  buckets: { at: 'hall', name: 'Пожарная дружина', g: 100, w: 100, time: 30, txt: 'Работники тушат пожар вдвое быстрее', key: 'F' },
  bows:    { at: 'range', name: 'Дальнобойные луки', g: 150, w: 100, time: 40, txt: 'Дальность стрелков и вышек +1', key: 'R' },
};

// заклинания магов (мана) и умения
const SPELLS = {
  firerain: { name: 'Огненный дождь', mana: 60, rng: 7, r: 1.8, dmg: 45, ignite: 1, key: 'F', txt: 'Огонь с неба: урон по площади, поджигает постройки и лес' },
  spirits:  { name: 'Духи предков', mana: 45, rng: 6, r: 3, heal: 70, key: 'F', txt: 'Лечит своих воинов вокруг точки' },
  prayer:   { name: 'Молитва', mana: 45, rng: 6, r: 3, heal: 70, key: 'F', txt: 'Лечит своих воинов вокруг точки' },
  smash:    { name: 'Богатырский удар', cd: 25, r: 1.8, dmg: 70, key: 'F', txt: 'Удар по всем врагам вокруг героя' },
  torch:    { name: 'Поджечь', cd: 25, key: 'G', txt: 'Подбежать к чужой постройке и поджечь её факелом' },
};
// заклинания отшельников: покупаются у скитов, кастуются из верхней панели
const HSPELLS = {
  rain:   { name: 'Ливень', g: 200, cd: 70, r: 5, txt: 'Тушит все пожары вокруг точки', icon: '🌧' },
  bolt:   { name: 'Молния', g: 300, cd: 50, r: 1.2, dmg: 160, txt: 'Удар молнии: большой урон и пожар', icon: '⚡' },
  heal:   { name: 'Живая вода', g: 250, cd: 60, r: 4, heal: 120, txt: 'Лечит всех своих в круге', icon: '💧' },
  vision: { name: 'Вещий сон', g: 120, cd: 45, r: 9, txt: 'Открывает область карты на 20 секунд', icon: '👁' },
};
const HERMIT_HIRE = 300;
const DRAGON = { hp: 2600, dmg: 38, arm: 3, rng: 3.2, cd: 2.2, spd: 3.4, sight: 9, h: 190, bounty: 2000, wakeR: 6, raidFirst: 540 };

// строки типа для юнита: 'rus.inf'
function uStats(race, arch) {
  const b = UBASE[arch], o = URACE[race][arch], R = RACES[race];
  const s = Object.assign({}, b, o, { race, arch });
  s.spd = (o.spd || b.spd) * R.uSpd;
  return s;
}
function bStats(race, arch) {
  const b = BBASE[arch], R = RACES[race];
  return Object.assign({}, b, {
    race, arch, name: BNAMES[race][arch], hp: Math.round(b.hp * R.bHp), time: b.time * R.bTime,
    g: Math.round(b.g * R.bCost / 5) * 5, w: Math.round(b.w * R.bCost / 5) * 5, flam: R.flam,
  });
}
const UST = {}, BST = {};
for (const r in RACES) { UST[r] = {}; BST[r] = {}; for (const a of UARCH) UST[r][a] = uStats(r, a); for (const a of BARCH) BST[r][a] = bStats(r, a) }
// нейтралы
UST.neu = {
  hermit: { name: 'Отшельник', hp: 160, dmg: 40, arm: 1, rng: 5.5, cd: 3, spd: 1.6, sight: 7, h: 52, proj: 'lightning', magic: 1, race: 'neu', arch: 'hermit', spr: 'hermit' },
  dragon: Object.assign({ name: 'Дракон', race: 'neu', arch: 'dragon', proj: 'breath', magic: 1, fly: 1, spr: 'dragon' }, DRAGON),
};
