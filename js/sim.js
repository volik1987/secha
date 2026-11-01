'use strict';
// ---------- Симуляция: считает только хозяин партии (или одиночная игра) ----------
let G = null;
const ents = new Map();          // id → юнит или здание
const R2 = Math.random;          // случайность в симуляции (у гостей она не нужна — они получают снимки)

function newGame(cfg) {
  // cfg: {seed, slots:[{race, kind:'human'|'ai'|'net'|'closed', name, diff}], me}
  const active = cfg.slots.map((s, i) => ({ s, i })).filter(o => o.s.kind !== 'closed');
  genMap(cfg.seed, active.length >= 3 ? 3 : 2);
  ents.clear();
  G = { cfg, t: 0, nextId: 1, players: [], units: [], blds: [], proj: [], fx: [], sfx: [], notes: [], treeEv: [], burning: new Set(), decay: [],
    visions: [], over: false, winner: -1, cmdq: [], me: cfg.me, hash: new Map(), net: { pr: [], fx: [], sfx: [], notes: [] } };
  cfg.slots.forEach((s, i) => {
    G.players.push({ i, race: s.race || 'rus', name: s.name || ('Игрок ' + (i + 1)), kind: s.kind, diff: s.diff || 'normal', color: COLORS[i],
      gold: 500, wood: 400, pop: 0, cap: 0, up: {}, hs: {}, alive: s.kind !== 'closed', heroT: 0,
      vis: new Uint8Array(MAPN * MAPN), exp: new Uint8Array(MAPN * MAPN), seen: new Map(), stats: { kills: 0, lost: 0, burned: 0 }, attackedT: -99 });
  });
  // базы
  active.forEach((o, k) => {
    const st = M.starts[k], p = G.players[o.i]; p.start = st;
    const hall = addBld(o.i, p.race, 'hall', st.x - 1, st.y - 1, true);
    const taken = new Set();
    for (let j = 0; j < 5; j++) { const [fx, fy] = freeNear(st.x + 2, st.y + 3, taken); taken.add(fy * MAPN + fx); addUnit(o.i, p.race, 'worker', fx + 0.5, fy + 0.5) }
    const [mx, my] = st.mine; addStruct('mine', mx, my, { gold: 12000 });
  });
  for (const [x, y] of M.spots.mines) addStruct('mine', x, y, { gold: 9000 });
  const hs = Object.keys(HSPELLS);
  M.spots.huts.forEach(([x, y], k) => {
    const h = addStruct('hut', x, y, { spells: [hs[k % 4], hs[(k + 2) % 4]] });
    const he = addUnit(NEUTRAL, 'neu', 'hermit', x + 1.5, y + 3.6); he.home = h.id; h.hermit = he.id;
  });
  const [lx, ly] = M.spots.lair; const lair = addStruct('lair', lx, ly, {});
  const dr = addUnit(MONSTER, 'neu', 'dragon', lx + 1.5, ly + 3.5); dr.lair = lair.id; dr.dst = 'sleep'; dr.raidAt = DRAGON.raidFirst;
  for (const p of G.players) recalcPop(p);
  updateVision(true);
  return G;
}

// ---------- создание сущностей ----------
function addUnit(own, race, arch, x, y) {
  const T = UST[race][arch];
  const u = { id: G.nextId++, e: 'u', own, race, arch, T, x, y, ox: x, oy: y, hp: T.hp, mhp: T.hp, dir: 0, anim: 0, atkT: 0, cd: 0,
    ord: null, path: null, pi: 0, tgt: 0, carry: 0, ctype: '', mana: T.mana ? 50 : 0, abCd: 0, inMine: 0, moving: 0, stuck: 0, repT: 0 };
  ents.set(u.id, u); G.units.push(u);
  return u;
}
function addBld(own, race, arch, tx, ty, built) {
  const T = BST[race][arch];
  const b = { id: G.nextId++, e: 'b', own, race, arch, T, tx, ty, s: T.s, hp: built ? T.hp : Math.max(10, T.hp * 0.1), mhp: T.hp,
    prog: built ? 1 : 0, fire: 0, q: [], rally: null, cd: 0, x: tx + T.s / 2, y: ty + T.s / 2 };
  setTiles(b, 4); ents.set(b.id, b); G.blds.push(b);
  return b;
}
// нейтральные постройки: рудник, скит отшельника, логово дракона
const STRUCT = {
  mine: { s: 3, name: 'Золотой рудник', spr: 'mine', k: 1.0 },
  hut:  { s: 3, name: 'Скит отшельника', spr: 'hermit_hut', k: 1.1 },
  lair: { s: 3, name: 'Логово дракона', spr: 'lair', k: 1.15 },
};
function addStruct(arch, tx, ty, extra) {
  const T = STRUCT[arch];
  const b = Object.assign({ id: G.nextId++, e: 'b', own: arch === 'lair' ? MONSTER : NEUTRAL, race: 'neu', arch, T, tx, ty, s: T.s, hp: 1, mhp: 1, prog: 1, fire: 0, q: [], inv: 1, x: tx + T.s / 2, y: ty + T.s / 2 }, extra);
  // убрать лес и воду из-под постройки
  for (let y = ty - 1; y <= ty + T.s; y++) for (let x = tx - 1; x <= tx + T.s; x++) if (inMap(x, y)) {
    const i = tIdx(x, y); if (M.block[i] === 2 || M.block[i] === 3 || M.block[i] === 1) { M.block[i] = 0; M.tree[i] = 0; M.ter[i] = 0 }
  }
  setTiles(b, 4); ents.set(b.id, b); G.blds.push(b);
  return b;
}
function setTiles(b, v) {
  for (let y = b.ty; y < b.ty + b.s; y++) for (let x = b.tx; x < b.tx + b.s; x++) if (inMap(x, y)) {
    const i = tIdx(x, y);
    if (v) { M.tree[i] = 0; M.block[i] = 4; M.bid[i] = b.id } else { M.block[i] = 0; M.bid[i] = -1 }
  }
}
const isPlayer = o => o >= 0 && o < 3;
const unitR = u => u.T.fly ? 0.6 : u.T.siege ? 0.45 : u.T.cav ? 0.38 : u.T.hero ? 0.36 : 0.28;
const popOf = T => T.siege ? 3 : T.cav ? 2 : 1;
function recalcPop(p) {
  let pop = 0, cap = 0;
  for (const u of G.units) if (u.own === p.i) pop += popOf(u.T);
  for (const b of G.blds) if (b.own === p.i && b.prog >= 1 && b.T.pop) cap += b.T.pop;
  for (const b of G.blds) if (b.own === p.i) for (const q of b.q) if (q.u) pop += popOf(UST[p.race][q.u]);
  p.pop = pop; p.cap = Math.min(120, cap);
}
function note(p, text, x, y, kind) { // сообщение игроку (p = -1 — всем)
  const n = { p, text, t: G.t, x, y, kind }; G.notes.push(n); G.net.notes.push(n);
  if (!G.guest && (p === G.me || p < 0) && typeof onNote === 'function') onNote(n);
  if (G.notes.length > 30) G.notes.shift();
}
function sfx(k, x, y) { G.net.sfx.push({ k, x, y }); if (typeof play === 'function') play(k, x, y) }
function fx(k, x, y, dur, extra) { const f = Object.assign({ k, x, y, t: 0, dur }, extra); G.fx.push(f); G.net.fx.push(f); return f }

// ---------- враждебность ----------
function hostile(a, b) { // a, b — владельцы
  if (a === b) return false;
  if (isPlayer(a) && isPlayer(b)) return true;
  if (a === MONSTER || b === MONSTER) return true;
  return false; // отшельников не трогают, пока они не разозлены
}
function canTarget(u, t) {
  if (!t || t.dead || t.inv) return false;
  if (t.e === 'u' && t.inMine) return false;
  if (t.own === NEUTRAL && t.e === 'u') return true;
  if (!hostile(u.own, t.own)) return false;
  return true;
}
function canHit(u, t) { // летящего дракона бьют только стрелки, маги, вышки и герои
  if (t.e === 'u' && t.T.fly && t.dst !== 'sleep') return !!(u.T.proj || u.T.hero || u.e === 'b');
  if (u.T.fly === undefined && t.e === 'u' && u.T.siege) return true;
  return true;
}
function distTo(u, t) {
  if (t.e === 'b') {
    const dx = Math.max(t.tx - u.x, 0, u.x - (t.tx + t.s)), dy = Math.max(t.ty - u.y, 0, u.y - (t.ty + t.s));
    return Math.hypot(dx, dy);
  }
  return Math.max(0, Math.hypot(t.x - u.x, t.y - u.y) - unitR(t));
}

// ---------- приказы ----------
function setOrder(u, ord) { u.ord = ord; u.path = null; u.tgt = 0; u.repT = 0; u.stuck = 0; u.nudge = 0 }
function goRect(u, x0, y0, x1, y1, adj) {
  const r = findPath(u.x, u.y, { x0, y0, x1, y1, adj });
  u.path = r.path; u.pi = 0; u.pathOk = r.ok;
  // уже стоим на нужной клетке, но с краю — шагнуть к её середине
  if (!u.path.length && r.ok && Math.hypot(u.x % 1 - 0.5, u.y % 1 - 0.5) > 0.2) u.path = [[Math.floor(u.x) + 0.5, Math.floor(u.y) + 0.5]];
}
function goPoint(u, x, y) { goRect(u, Math.floor(x), Math.floor(y), Math.floor(x), Math.floor(y), false); u.dest = [x, y] }
const dropsOf = p => G.blds.filter(b => b.own === p && b.T.drop && b.prog >= 1);

function applyCmd(pi, c) {
  const p = G.players[pi]; if (!p || !p.alive || G.over) return;
  const mine = (ids) => (ids || []).map(id => ents.get(id)).filter(u => u && u.e === 'u' && u.own === pi && !u.dead);
  switch (c.c) {
    case 'move': case 'amove': {
      const us = mine(c.ids), taken = new Set();
      us.forEach((u, k) => {
        // строй: каждому своя клетка рядом с точкой
        const [fx, fy] = us.length > 1 ? freeNear(c.x + ((k % 5) - 2) * 0.0, c.y, taken) : [c.x - 0.5, c.y - 0.5];
        taken.add(Math.floor(fy) * MAPN + Math.floor(fx));
        setOrder(u, { k: c.c, x: us.length > 1 ? fx + 0.5 : c.x, y: us.length > 1 ? fy + 0.5 : c.y });
      });
      if (us.length) sfx('ack', us[0].x, us[0].y);
      break;
    }
    case 'attack': {
      const t = ents.get(c.tid); if (!t || t.dead) return;
      for (const u of mine(c.ids)) {
        if (t.own === NEUTRAL && t.e === 'u') aggro(t, pi);
        setOrder(u, { k: 'attack', id: t.id });
      }
      break;
    }
    case 'stop': for (const u of mine(c.ids)) setOrder(u, null); break;
    case 'gather': {
      for (const u of mine(c.ids)) if (u.arch === 'worker') {
        if (c.mine) setOrder(u, { k: 'gather', mine: c.mine });
        else setOrder(u, { k: 'gather', tx: c.tx, ty: c.ty });
      }
      break;
    }
    case 'repair': {
      const b = ents.get(c.tid); if (!b || b.e !== 'b' || b.own !== pi) return;
      for (const u of mine(c.ids)) if (u.arch === 'worker') setOrder(u, { k: b.prog < 1 ? 'build' : 'repair', id: b.id });
      break;
    }
    case 'build': {
      const ws = mine(c.ids).filter(u => u.arch === 'worker'); if (!ws.length) return;
      const T = BST[p.race][c.b]; if (!T) return;
      if (!canPlace(T.s, c.tx, c.ty)) return note(pi, 'Здесь строить нельзя');
      if (!reqOk(p, T.req)) return note(pi, 'Сначала нужно: ' + BNAMES[p.race][T.req]);
      if (p.gold < T.g || p.wood < T.w) return note(pi, 'Не хватает ресурсов');
      p.gold -= T.g; p.wood -= T.w;
      const b = addBld(pi, p.race, c.b, c.tx, c.ty, false);
      pushOut(b);
      for (const u of ws) setOrder(u, { k: 'build', id: b.id });
      sfx('build', b.x, b.y);
      break;
    }
    case 'train': {
      const b = ents.get(c.bid); if (!b || b.own !== pi || b.prog < 1 || b.q.length >= 6) return;
      const T = UST[p.race][c.u]; if (!T || !(b.T.trains || []).includes(c.u)) return;
      if (c.u === 'hero') {
        if (G.units.some(u => u.own === pi && u.arch === 'hero') || G.blds.some(x => x.own === pi && x.q.some(q => q.u === 'hero'))) return note(pi, 'Герой может быть только один');
        if (!G.blds.some(x => x.own === pi && x.arch === 'temple' && x.prog >= 1)) return note(pi, 'Для героя нужен храм: ' + BNAMES[p.race].temple);
      }
      if (c.u === 'cav' && !G.blds.some(x => x.own === pi && x.arch === 'smith' && x.prog >= 1)) return note(pi, 'Нужна кузница');
      if (p.gold < T.g || p.wood < T.w) return note(pi, 'Не хватает ресурсов');
      p.gold -= T.g; p.wood -= T.w; b.q.push({ u: c.u, t: 0, tt: T.time }); recalcPop(p);
      break;
    }
    case 'research': {
      const b = ents.get(c.bid), U = UPS[c.r]; if (!b || b.own !== pi || !U || b.arch !== U.at || b.prog < 1 || b.q.length >= 6) return;
      if (p.up[c.r] || (U.req && !p.up[U.req]) || G.blds.some(x => x.own === pi && x.q.some(q => q.r === c.r))) return;
      if (p.gold < U.g || p.wood < U.w) return note(pi, 'Не хватает ресурсов');
      p.gold -= U.g; p.wood -= U.w; b.q.push({ r: c.r, t: 0, tt: U.time });
      break;
    }
    case 'cancel': {
      const b = ents.get(c.bid); if (!b || b.own !== pi) return;
      if (b.prog < 1) { p.gold += Math.round(b.T.g * 0.75); p.wood += Math.round(b.T.w * 0.75); destroyBld(b, true); return }
      const q = b.q.pop(); if (!q) return;
      const C = q.u ? UST[p.race][q.u] : UPS[q.r]; p.gold += C.g; p.wood += C.w; recalcPop(p);
      break;
    }
    case 'rally': { const b = ents.get(c.bid); if (b && b.own === pi) b.rally = [c.x, c.y, c.tgt || 0]; break }
    case 'cast': {
      for (const u of mine(c.ids)) {
        const S = SPELLS[c.s]; if (!S) continue;
        if (c.s === 'smash') { if (u.T.ability === 'smash' && u.abCd <= 0) doSmash(u); continue }
        if (u.T.spell !== c.s || u.mana < S.mana) continue;
        setOrder(u, { k: 'cast', s: c.s, x: c.x, y: c.y }); break; // кастует один маг
      }
      break;
    }
    case 'torch': {
      const b = ents.get(c.tid); if (!b || b.e !== 'b' || !hostile(pi, b.own) || b.inv) return;
      for (const u of mine(c.ids)) if (u.T.torch || u.arch === 'worker') { if (u.abCd <= 0) setOrder(u, { k: 'torch', id: b.id }) }
      break;
    }
    case 'hut': hutDeal(pi, c); break;
    case 'gspell': castGlobal(pi, c.s, c.x, c.y); break;
  }
}
function reqOk(p, req) { return !req || G.blds.some(b => b.own === p.i && b.arch === req && b.prog >= 1) }
function canPlace(s, tx, ty, forAI) {
  for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
    if (!inMap(x, y) || x < 1 || y < 1 || x > MAPN - 2 || y > MAPN - 2) return false;
    if (M.block[tIdx(x, y)]) return false;
  }
  if (forAI) for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) if (inMap(x, y) && M.block[tIdx(x, y)] === 4) return false;
  return true;
}
function pushOut(b) { // юниты внутри новой постройки выталкиваются наружу
  for (const u of G.units) if (!u.T.fly && u.x >= b.tx && u.x < b.tx + b.s && u.y >= b.ty && u.y < b.ty + b.s) {
    const [x, y] = freeNear(u.x, u.y); u.x = u.ox = x + 0.5; u.y = u.oy = y + 0.5; u.path = null;
  }
}

// ---------- шаг симуляции ----------
function simStep() {
  const dt = STEP; G.t += dt;
  for (const c of G.cmdq.splice(0)) applyCmd(c.p, c);
  buildHash();
  for (const u of G.units) { u.ox = u.x; u.oy = u.y }
  for (const u of G.units.slice()) if (!u.dead) updUnit(u, dt);
  separate();
  for (const b of G.blds.slice()) if (!b.dead) updBld(b, dt);
  updProj(dt); updFire(dt); updFx(dt); runTimers();
  for (const p of G.players) if (p.ai) aiStep(p, dt);
  G.units = G.units.filter(u => !u.dead); G.blds = G.blds.filter(b => !b.dead);
  if ((G.t / dt | 0) % 5 === 0) updateVision();
  if ((G.t / dt | 0) % 20 === 0) checkEnd();
}
function buildHash() {
  G.hash.clear();
  for (const u of G.units) { const k = (u.x >> 2) * 64 + (u.y >> 2); let a = G.hash.get(k); if (!a) G.hash.set(k, a = []); a.push(u) }
}
function near(x, y, r, f) { // все юниты в радиусе
  const out = [];
  for (let gx = (x - r) >> 2; gx <= (x + r) >> 2; gx++) for (let gy = (y - r) >> 2; gy <= (y + r) >> 2; gy++) {
    const a = G.hash.get(gx * 64 + gy); if (!a) continue;
    for (const u of a) if (!u.dead && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r && (!f || f(u))) out.push(u);
  }
  return out;
}
// поиск цели: сначала опасные юниты, потом постройки
function findTarget(u, r) {
  let best = null, bd = 1e9;
  for (const t of near(u.x, u.y, r, t => t.own !== u.own)) {
    if (!hostile(u.own, t.own) && !(t.own === NEUTRAL && t.aggro && t.aggro[u.own] > G.t) && !(u.own === NEUTRAL && u.aggro && u.aggro[t.own] > G.t)) continue;
    if (!canTarget(u, t) || !canHit(u, t)) continue;
    if (t.own === MONSTER && t.dst === 'sleep' && u.own !== MONSTER) continue; // спящего дракона не будим сами
    const d = (t.x - u.x) ** 2 + (t.y - u.y) ** 2 + (t.arch === 'worker' ? 4 : 0);
    if (d < bd) { bd = d; best = t }
  }
  if (best || u.own === NEUTRAL) return best;
  for (const b of G.blds) {
    if (b.inv || b.dead || !hostile(u.own, b.own)) continue;
    const d = distTo(u, b); if (d <= r && d * d < bd) { bd = d * d; best = b }
  }
  return best;
}
function aggro(t, pi) { t.aggro = t.aggro || {}; t.aggro[pi] = G.t + 40 }

function updUnit(u, dt) {
  u.atkT = Math.max(0, u.atkT - dt); u.cd -= dt; u.abCd = Math.max(0, u.abCd - dt); u.moving = 0;
  if (u.T.mana) u.mana = Math.min(u.T.mana, u.mana + dt * 1.2);
  if (u.T.regen) u.hp = Math.min(u.mhp, u.hp + u.T.regen * dt);
  if (u.inMine > 0) { // работник внутри рудника
    u.inMine -= dt; if (u.inMine <= 0) { u.inMine = 0; const m = ents.get(u.ord && u.ord.mine); if (m && !m.dead) { const g = Math.min(10, m.gold); m.gold -= g; u.carry = g; u.ctype = 'g'; if (m.gold <= 0) exhaustMine(m) } }
    return;
  }
  if (u.arch === 'dragon') return updDragon(u, dt);
  if (u.arch === 'hermit') return updHermit(u, dt);
  const o = u.ord;
  if (!o) { // стоит: защищается и подбирает цель
    if ((u.repT -= dt) <= 0) {
      u.repT = 0.5 + R2() * 0.3;
      if (u.T.spell && u.T.spell !== 'firerain') autoHeal(u);
      if (u.arch !== 'worker' || u.hp < u.mhp) {
        const t = findTarget(u, u.arch === 'worker' ? 2 : u.T.sight); if (t && (u.arch !== 'worker' || t.e === 'u')) { u.ord = { k: 'attack', id: t.id, auto: 1, hx: u.x, hy: u.y } }
      }
    }
    return;
  }
  switch (o.k) {
    case 'move': if (moveAlong(u, dt, o)) setOrder(u, null); break;
    case 'amove': {
      if ((u.repT -= dt) <= 0) { u.repT = 0.4; const t = findTarget(u, u.T.sight); if (t) { u.ord = { k: 'attack', id: t.id, auto: 1, back: o }; return } }
      if (moveAlong(u, dt, o)) setOrder(u, null);
      break;
    }
    case 'attack': doAttack(u, dt, o); break;
    case 'gather': doGather(u, dt, o); break;
    case 'return': doReturn(u, dt, o); break;
    case 'build': case 'repair': doBuild(u, dt, o); break;
    case 'torch': doTorch(u, dt, o); break;
    case 'cast': doCast(u, dt, o); break;
  }
}
// движение по пути к точке приказа; true — пришли
function moveAlong(u, dt, o) {
  if (!u.path) { goPoint(u, o.x, o.y); if (!u.path.length && Math.hypot(o.x - u.x, o.y - u.y) < 0.6) return true }
  return stepPath(u, dt, o.x, o.y);
}
function stepPath(u, dt, fx, fy) {
  let sp = u.T.spd * dt * (u.slowT > G.t ? 0.5 : 1);
  if (u.pi < u.path.length && M.block[tIdx(Math.floor(u.path[u.pi][0]), Math.floor(u.path[u.pi][1]))] && !u.T.fly) { u.path = null; return false } // путь перекрыли
  // срезаем углы: если следующая точка видна напрямую, текущую пропускаем — без зигзага по клеткам
  while (u.pi + 1 < u.path.length && lineFree(u.x, u.y, u.path[u.pi + 1][0], u.path[u.pi + 1][1], u.T.fly)) u.pi++;
  if (u.pi >= u.path.length - 1 && fx !== undefined && u.pathOk !== false && lineFree(u.x, u.y, fx, fy, u.T.fly)) u.pi = u.path.length;
  // идём весь шаг целиком, переходя через точки пути, — без остановки на каждой
  let mx = 0, my = 0;
  for (let n = 0; n < 4 && sp > 1e-6; n++) {
    let tx, ty;
    if (u.pi < u.path.length) [tx, ty] = u.path[u.pi];
    else if (fx !== undefined && u.pathOk !== false) { tx = fx; ty = fy } else break;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (d <= sp) { u.x = tx; u.y = ty; mx += dx; my += dy; sp -= d; if (u.pi < u.path.length) u.pi++; else break }
    else { u.x += dx / d * sp; u.y += dy / d * sp; mx += dx / d * sp; my += dy / d * sp; sp = 0 }
  }
  if (mx || my) { u.moving = 1; faceTo(u, mx, my) }
  u.anim += dt * u.T.spd;
  return u.pi >= u.path.length && (fx === undefined || u.pathOk === false || Math.hypot(fx - u.x, fy - u.y) < 0.15);
}
// прямая между точками не задевает занятых клеток (проверка с шагом в треть клетки, с запасом по бокам)
function lineFree(x0, y0, x1, y1, fly) {
  if (fly) return true;
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 3);
  if (d > 12) return false;
  const ox = d ? -(y1 - y0) / d * 0.3 : 0, oy = d ? (x1 - x0) / d * 0.3 : 0;
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (!passable(Math.floor(x), Math.floor(y)) || !passable(Math.floor(x + ox), Math.floor(y + oy)) || !passable(Math.floor(x - ox), Math.floor(y - oy))) return false;
  }
  return true;
}
function faceTo(u, dx, dy) { // экран: x = dx - dy, y = dx + dy
  const sx = dx - dy, sy = dx + dy, L = Math.hypot(sx, sy) || 1, d = u.dir | 0;
  // гистерезис: у границы секторов оставляем прежний поворот, чтобы спрайт не мигал
  const flip = Math.abs(sx) / L < 0.2 ? d & 1 : (sx < 0 ? 1 : 0);
  const back = Math.abs(sy + 0.15 * Math.abs(sx)) / L < 0.2 ? d & 2 : (sy < -0.15 * Math.abs(sx) ? 2 : 0);
  u.dir = back + flip;
}
function separate() {
  for (const a of G.units) {
    if (a.T.fly || a.inMine || a.dead) continue;
    const ra = unitR(a);
    for (const b of near(a.x, a.y, 1.0)) {
      if (b === a || b.T.fly || b.inMine || b.id < a.id) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = ra + unitR(b);
      if (d >= m || d < 1e-4) { if (d < 1e-4) { a.x += 0.01; } continue }
      const push = (m - d) * 0.25, nx = dx / d, ny = dy / d;
      const am = a.moving ? 0.3 : 1, bm = b.moving ? 0.3 : 1;
      tryShift(a, -nx * push * am, -ny * push * am); tryShift(b, nx * push * bm, ny * push * bm);
    }
    // застрял в занятой клетке — вытолкнуть
    if (!passable(Math.floor(a.x), Math.floor(a.y))) { const [x, y] = freeNear(a.x, a.y); a.x = x + 0.5; a.y = y + 0.5 }
  }
}
function tryShift(u, dx, dy) { const nx = u.x + dx, ny = u.y + dy; if (passable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny } }

// ---------- бой ----------
function doAttack(u, dt, o) {
  const t = ents.get(o.id);
  const done = () => { if (o.back) { u.ord = o.back; u.path = null } else if (o.auto && o.hx !== undefined && Math.hypot(o.hx - u.x, o.hy - u.y) > 1.5) setOrder(u, { k: 'move', x: o.hx, y: o.hy }); else setOrder(u, null) };
  if (!t || t.dead || (t.e === 'u' && t.inMine) || !canHit(u, t) || (t.e === 'u' && t.own === NEUTRAL && u.own !== NEUTRAL && !(t.aggro && t.aggro[u.own] > G.t))) return done();
  // авто-цель далеко увела — вернуться
  if (o.auto && o.hx !== undefined && Math.hypot(o.hx - u.x, o.hy - u.y) > u.T.sight + 4) return done();
  const d = distTo(u, t), rng = u.T.rng + (u.T.proj === 'arrow' || u.T.proj === 'bolt' ? (G.players[u.own] && G.players[u.own].up.bows ? 1 : 0) : 0);
  if (d <= rng + 0.15 && !(u.T.minR && d < u.T.minR)) {
    u.path = null; faceTo(u, t.x - u.x, t.y - u.y);
    if (u.cd <= 0) { hit(u, t); u.cd = u.T.cd; u.atkT = 0.35 }
    // лучник посреди боя может взять цель ближе
    if (o.auto && t.e === 'b' && (u.repT -= dt) <= 0) { u.repT = 1; const n = findTarget(u, u.T.sight); if (n && n.e === 'u') o.id = n.id }
    return;
  }
  if ((u.repT -= dt) <= 0 || !u.path) {
    u.repT = 0.6 + R2() * 0.4;
    if (o.auto && (u.T.proj || u.arch !== 'worker')) { const n = findTarget(u, Math.min(d, u.T.sight)); if (n && n !== t && n.e === 'u' && t.e === 'b') { o.id = n.id; return } }
    if (t.e === 'b') goRect(u, t.tx, t.ty, t.tx + t.s - 1, t.ty + t.s - 1, true);
    else if (t.T.fly) { u.path = []; u.pi = 0; u.pathOk = true }
    else goPoint(u, t.x, t.y);
  }
  if (t.e === 'u' && t.T.fly) { const dx = t.x - u.x, dy = t.y - u.y, dd = Math.hypot(dx, dy), sp = u.T.spd * dt; if (dd > 0.01) { tryShift(u, dx / dd * sp, dy / dd * sp); u.moving = 1; faceTo(u, dx, dy); u.anim += dt * u.T.spd } return }
  stepPath(u, dt, t.e === 'u' ? t.x : undefined, t.e === 'u' ? t.y : undefined);
}
function hit(u, t) {
  const p = G.players[u.own];
  if (u.T.proj) {
    const pk = u.T.proj, fire = (pk === 'arrow' || pk === 'bolt') && p && p.up.fire;
    const dist = Math.hypot(t.x - u.x, t.y - u.y);
    const pr = { k: pk === 'stone' && u.T.firePot ? 'pot' : pk, x0: u.x, y0: u.y, x1: t.x, y1: t.y, t: 0, dur: Math.max(0.15, dist / (pk === 'stone' ? 7 : pk === 'breath' ? 9 : 16)),
      h: pk === 'stone' ? 2 + dist * 0.25 : pk === 'arrow' ? 0.4 + dist * 0.05 : 0.2, src: u.id, own: u.own, tgt: t.id, dmg: u.T.dmg + (p ? 0 : 0),
      splash: u.T.splash || (pk === 'breath' ? 1.3 : 0), magic: u.T.magic, fire: fire ? 0.2 : (pk === 'stone' ? (u.T.firePot ? 1 : 0.3) : pk === 'breath' ? 1 : u.T.fx === 'fire' ? 0.15 : 0), siege: u.T.siege };
    G.proj.push(pr); G.net.pr.push(pr);
    sfx(pk === 'stone' ? 'throw' : pk === 'breath' ? 'roar' : pk === 'arrow' || pk === 'bolt' ? 'bow' : 'magic', u.x, u.y);
    if (pk === 'lightning') { fx('bolt', t.x, t.y, 0.35) }
  } else {
    damage(u, t, u.T.dmg + meleeUp(p), { melee: 1 });
    sfx(u.arch === 'worker' ? 'chop' : 'hit', t.x, t.y);
  }
}
const meleeUp = p => p ? (p.up.atk1 ? 2 : 0) + (p.up.atk2 ? 2 : 0) : 0;
function armorOf(t) {
  const p = G.players[t.own]; if (t.e === 'b') return 5;
  return t.T.arm + (p ? RACES[p.race] ? RACES[p.race].armor : 0 : 0) + (p && p.up.arm1 ? 1 : 0) + (p && p.up.arm2 ? 1 : 0);
}
function damage(src, t, base, o = {}) {
  if (!t || t.dead || t.inv) return;
  let d;
  if (t.e === 'b') {
    const k = o.siege ? (src && src.T && src.T.vsB || 2.5) : o.magic ? 0.5 : o.melee ? 0.45 : 0.3;
    d = Math.max(1, base * k - (o.siege ? 0 : 2.5));
    if (src && src.arch === 'dragon') d = base * 1.2;
  } else {
    d = o.magic ? base : Math.max(1, base - armorOf(t));
    if (src && src.T && src.T.vsCav && t.T.cav) d *= src.T.vsCav;
    if (o.siege) d *= 0.6;
  }
  t.hp -= d;
  if (src && src.own !== undefined) {
    t.lastHit = src.own;
    if (t.e === 'u' && t.own === NEUTRAL && isPlayer(src.own)) aggro(t, src.own);
    if (isPlayer(t.own) && src.own !== t.own) { const p = G.players[t.own]; if (G.t - p.attackedT > 20) note(t.own, t.e === 'b' ? 'Наши постройки атакуют!' : 'Наши войска атакуют!', t.x, t.y, 'alarm'); p.attackedT = G.t; p.lastAttack = [t.x, t.y] }
    // ответ: стоящий юнит бьёт обидчика
    if (t.e === 'u' && src.e === 'u' && !src.dead && (!t.ord || t.ord.auto && t.ord.k !== 'attack') && t.arch !== 'worker' && canHit(t, src)) t.ord = { k: 'attack', id: src.id, auto: 1, hx: t.x, hy: t.y };
    if (t.e === 'u' && t.arch === 'worker' && !t.ord && src.e === 'u') t.ord = { k: 'attack', id: src.id, auto: 1, hx: t.x, hy: t.y };
    if (t.arch === 'dragon' && t.dst === 'sleep') wakeDragon(t);
  }
  if (t.hp <= 0) kill(t, src);
}
function kill(t, src) {
  if (t.dead) return;
  if (t.e === 'b') return destroyBld(t);
  t.dead = 1; ents.delete(t.id);
  fx('death', t.x, t.y, 0.8, { arch: t.arch, race: t.race, own: t.own, dir: t.dir });
  if (src && isPlayer(src.own)) G.players[src.own].stats.kills++;
  if (isPlayer(t.own)) { G.players[t.own].stats.lost++; recalcPop(G.players[t.own]) }
  if (t.arch === 'dragon') {
    const k = t.lastHit; if (isPlayer(k)) { G.players[k].gold += DRAGON.bounty; note(-1, `${G.players[k].name} убивает дракона и забирает клад: +${DRAGON.bounty} золота!`, t.x, t.y, 'big') }
    sfx('roar', t.x, t.y); fx('boom', t.x, t.y, 1);
  }
  if (t.arch === 'hermit') { const h = ents.get(t.home); if (h) h.hermit = 0 }
}
function destroyBld(b, silent) {
  if (b.dead) return;
  b.dead = 1; ents.delete(b.id); setTiles(b, 0);
  const R = RACES[b.race];
  if (!silent) {
    const big = b.s >= 3;
    const ruin = b.fire > 0 || b.race !== 'teu' ? (R ? R.ruin[big ? 1 : 0] : 'ruin_s') : 'ruin_stone';
    fx('ruin', b.x, b.y, 150, { spr: b.prog < 1 ? 'ruin_s' : ruin, s: b.s, burnt: b.fire > 0 });
    fx('boom', b.x, b.y, 0.9); fx('smoke', b.x, b.y, 3);
    sfx('collapse', b.x, b.y);
    if (b.fire > 0 && isPlayer(b.own)) G.players[b.own].stats.burned++;
  }
  if (isPlayer(b.own)) { recalcPop(G.players[b.own]); if (!silent) note(b.own, `Потеряна постройка: ${b.T.name}`, b.x, b.y) }
  // рабочие этой стройки — свободны
  for (const u of G.units) if (u.ord && u.ord.id === b.id) setOrder(u, null);
}
function updProj(dt) {
  for (const p of G.proj) {
    const t = ents.get(p.tgt);
    if (t && !t.dead && p.k !== 'stone' && p.k !== 'pot' && p.k !== 'rain') { p.x1 = t.x; p.y1 = t.y } // самонаведение стрел
    p.t += dt; if (p.t < p.dur) continue;
    p.done = 1;
    const src = ents.get(p.src) || { own: p.own, T: {}, e: 'x' };
    if (p.splash) {
      for (const u of near(p.x1, p.y1, p.splash + 0.4)) if (u.own !== p.own && (hostile(p.own, u.own) || u.own === NEUTRAL && u.aggro && u.aggro[p.own] > G.t)) damage(src, u, p.dmg * (Math.hypot(u.x - p.x1, u.y - p.y1) < 0.6 ? 1 : 0.6), { magic: p.magic, siege: p.siege });
      for (const b of G.blds) if (!b.inv && !b.dead && hostile(p.own, b.own) && distTo({ x: p.x1, y: p.y1 }, b) < p.splash * 0.6) {
        damage(src, b, p.dmg, { siege: p.siege, magic: p.magic });
        if (p.fire && R2() < p.fire) ignite(b, 0.25);
      }
      if (p.fire >= 1) igniteTreesAt(p.x1, p.y1, p.splash * 0.7, 0.5);
      fx(p.k === 'breath' || p.k === 'pot' ? 'fireball' : 'dust', p.x1, p.y1, 0.6);
      sfx(p.k === 'breath' || p.k === 'pot' ? 'fire' : 'boom', p.x1, p.y1);
    } else if (t && !t.dead) {
      damage(src, t, p.dmg + (p.k === 'magic' && G.players[p.own] ? 0 : 0), { magic: p.magic });
      if (t.e === 'b' && p.fire && R2() < p.fire) ignite(t, 0.15);
    }
  }
  G.proj = G.proj.filter(p => !p.done);
}
function updFx(dt) { for (const f of G.fx) f.t += dt; G.fx = G.fx.filter(f => f.t < f.dur) }

// ---------- огонь ----------
function ignite(b, amt) {
  if (!b || b.dead || b.inv) return;
  const was = b.fire > 0;
  b.fire = Math.max(b.fire, amt * Math.min(1, 0.4 + b.T.flam * 0.6));
  if (!was) { sfx('ignite', b.x, b.y); if (isPlayer(b.own)) note(b.own, `Пожар: ${b.T.name}!`, b.x, b.y, 'fire') }
}
function igniteTree(i) {
  if (M.tree[i] && M.tree[i] < T_STUMP && M.tfire[i] <= 0) { M.tfire[i] = 9 + R2() * 6; G.burning.add(i); G.treeEv.push(i) }
}
function igniteTreesAt(x, y, r, ch) {
  for (let ty = Math.floor(y - r); ty <= y + r; ty++) for (let tx = Math.floor(x - r); tx <= x + r; tx++)
    if (inMap(tx, ty) && (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r + 0.5 && R2() < ch) igniteTree(tIdx(tx, ty));
}
let fireAcc = 0;
function updFire(dt) {
  for (const b of G.blds) {
    if (b.inv || b.dead) continue;
    if (b.fire > 0) {
      b.fire = Math.min(1, b.fire + 0.035 * b.T.flam * dt);
      b.hp -= b.mhp * 0.016 * b.fire * (0.3 + b.T.flam * 0.7) * dt;
      if (b.hp <= 0) { destroyBld(b); continue }
    }
  }
  fireAcc += dt; if (fireAcc < 1) return; fireAcc -= 1;
  for (const b of G.blds) {
    if (b.inv || b.dead) continue;
    // полуразрушенное деревянное здание может вспыхнуть само
    if (!b.fire && b.prog >= 1 && b.hp < b.mhp * 0.35 && R2() < 0.04 * b.T.flam) ignite(b, 0.15);
    if (b.fire > 0.35) {
      for (const o of G.blds) if (o !== b && !o.inv && !o.dead && !o.fire) {
        const gap = Math.max(o.tx - (b.tx + b.s), b.tx - (o.tx + o.s), o.ty - (b.ty + b.s), b.ty - (o.ty + o.s));
        if (gap <= 1 && R2() < 0.07 * b.fire * o.T.flam) ignite(o, 0.12);
      }
      for (let ty = b.ty - 1; ty <= b.ty + b.s; ty++) for (let tx = b.tx - 1; tx <= b.tx + b.s; tx++)
        if (inMap(tx, ty) && R2() < 0.05 * b.fire) igniteTree(tIdx(tx, ty));
      // жар обжигает стоящих рядом
      for (const u of near(b.x, b.y, b.s * 0.7 + 0.6)) if (!u.T.fly) u.hp -= 2 * b.fire, u.hp <= 0 && kill(u, null);
    }
  }
  // лесной пожар
  for (const i of Array.from(G.burning)) {
    M.tfire[i] -= 1;
    const x = i % MAPN, y = (i / MAPN) | 0;
    if (M.tfire[i] <= 0) {
      M.tfire[i] = 0; G.burning.delete(i); M.tree[i] = T_BURNT; M.wood[i] = 0; G.treeEv.push(i); G.decay.push([i, G.t + 60 + R2() * 60]);
      continue;
    }
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inMap(nx, ny) && R2() < 0.09) igniteTree(tIdx(nx, ny)) }
    const bi = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => inMap(x + dx, y + dy) ? M.bid[tIdx(x + dx, y + dy)] : -1).find(v => v > 0);
    if (bi && R2() < 0.08) { const b = ents.get(bi); if (b && !b.inv) ignite(b, 0.12) }
  }
  // сгоревшие стволы рассыпаются, освобождая проход
  G.decay = G.decay.filter(([i, t]) => { if (G.t < t) return true; if (M.tree[i] === T_BURNT) { M.tree[i] = 0; M.block[i] = 0; G.treeEv.push(i) } return false });
}

// ---------- постройки: строительство, обучение, вышки ----------
function updBld(b, dt) {
  if (b.inv) return;
  const p = G.players[b.own]; if (!p) return;
  if (b.prog < 1) return;
  if (b.q.length) {
    const q = b.q[0];
    if (q.u && q.t >= q.tt) { // готов, но некуда — ждём дом
      if (spawnFrom(b, q.u)) b.q.shift();
    } else {
      q.t += dt * (b.fire > 0.5 ? 0.5 : 1);
      if (q.t >= q.tt) {
        if (q.r) { p.up[q.r] = 1; b.q.shift(); note(b.own, 'Исследовано: ' + UPS[q.r].name); sfx('done', b.x, b.y) }
        else if (spawnFrom(b, q.u)) b.q.shift();
      }
    }
  }
  if (b.T.atk) {
    b.cd -= dt;
    if (b.cd <= 0) {
      const rng = b.T.atk.rng + (p.up.bows ? 1 : 0);
      const fake = { x: b.x, y: b.y, own: b.own, T: { sight: rng }, arch: 'tower', e: 'b' };
      const t = findTarget(fake, rng + 1);
      if (t && t.e === 'u' && Math.hypot(t.x - b.x, t.y - b.y) <= rng + 1) {
        const dist = Math.hypot(t.x - b.x, t.y - b.y);
        const pr = { k: 'arrow', x0: b.x, y0: b.y, x1: t.x, y1: t.y, z0: 2.2, t: 0, dur: Math.max(0.2, dist / 15), h: 0.5, src: b.id, own: b.own, tgt: t.id, dmg: b.T.atk.dmg, fire: p.up.fire ? 0.2 : 0 };
        G.proj.push(pr); G.net.pr.push(pr); b.cd = b.T.atk.cd; sfx('bow', b.x, b.y);
      } else b.cd = 0.4;
    }
  }
}
function spawnFrom(b, arch) {
  const p = G.players[b.own], T = UST[p.race][arch];
  let pop = 0; for (const u of G.units) if (u.own === p.i) pop += popOf(u.T);
  if (pop + popOf(T) > p.cap) { if (!b.popWarn || G.t - b.popWarn > 15) { b.popWarn = G.t; note(b.own, `Нужно больше жилья (${BNAMES[p.race].house})`) } return false }
  const rx = b.rally ? b.rally[0] : b.x + b.s, ry = b.rally ? b.rally[1] : b.y + b.s;
  // ближайшая к точке сбора свободная клетка у стены
  let best = null, bd = 1e9;
  for (let y = b.ty - 1; y <= b.ty + b.s; y++) for (let x = b.tx - 1; x <= b.tx + b.s; x++) {
    if (!passable(x, y)) continue; const d = (x - rx) ** 2 + (y - ry) ** 2; if (d < bd) { bd = d; best = [x, y] }
  }
  if (!best) best = freeNear(b.tx + b.s, b.ty + b.s);
  const u = addUnit(b.own, p.race, arch, best[0] + 0.5, best[1] + 0.5);
  recalcPop(p); sfx('ready', u.x, u.y);
  if (arch === 'hero') note(b.own, `${T.name} готов к бою!`, u.x, u.y);
  if (b.rally) {
    const rt = b.rally[2] && ents.get(b.rally[2]);
    if (arch === 'worker' && rt && rt.arch === 'mine') setOrder(u, { k: 'gather', mine: rt.id });
    else if (arch === 'worker' && M.tree[tIdx(Math.floor(rx), Math.floor(ry))] && M.tree[tIdx(Math.floor(rx), Math.floor(ry))] < T_STUMP) setOrder(u, { k: 'gather', tx: Math.floor(rx), ty: Math.floor(ry) });
    else setOrder(u, { k: 'move', x: rx, y: ry });
  }
  return true;
}

// ---------- работники ----------
const CARRY = 10;
function nearestTree(x, y, r) {
  let best = null, bd = 1e9;
  for (let ty = Math.max(0, Math.floor(y - r)); ty <= Math.min(MAPN - 1, y + r); ty++) for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(MAPN - 1, x + r); tx++) {
    const i = tIdx(tx, ty); if (!M.tree[i] || M.tree[i] >= T_STUMP || M.tfire[i] > 0) continue;
    // дерево должно быть доступно хотя бы с одной стороны
    if (!(passable(tx + 1, ty) || passable(tx - 1, ty) || passable(tx, ty + 1) || passable(tx, ty - 1))) continue;
    const d = (tx - x) ** 2 + (ty - y) ** 2; if (d < bd) { bd = d; best = [tx, ty] }
  }
  return best;
}
function doGather(u, dt, o) {
  if (u.carry >= CARRY || (u.carry > 0 && ((o.mine && u.ctype === 'w') || (!o.mine && u.ctype === 'g')))) { u.ord = { k: 'return', back: o }; u.path = null; return }
  if (o.mine) {
    const m = ents.get(o.mine); if (!m || m.dead) { setOrder(u, null); return }
    if (distTo(u, m) <= 0.75) { u.inMine = 4; u.path = null; u.stuck = u.nudge = 0; return }
    approach(u, dt, m, 0.75);
    return;
  }
  const i = tIdx(o.tx, o.ty);
  if (!M.tree[i] || M.tree[i] >= T_STUMP || M.tfire[i] > 0) {
    const n = nearestTree(o.tx, o.ty, 9); if (!n) { if (u.carry) { u.ord = { k: 'return', back: null }; u.path = null } else setOrder(u, null); return }
    o.tx = n[0]; o.ty = n[1]; u.path = null; return;
  }
  const d = Math.max(Math.abs(o.tx + 0.5 - u.x), Math.abs(o.ty + 0.5 - u.y));
  if (d < 1.25) {
    u.path = null; u.stuck = 0; faceTo(u, o.tx + 0.5 - u.x, o.ty + 0.5 - u.y);
    if (u.cd <= 0) {
      const p = G.players[u.own]; u.cd = 0.9 / (RACES[u.race].wood * (p.up.axes ? 1.25 : 1)); u.atkT = 0.35;
      u.carry++; u.ctype = 'w'; M.wood[i]--; sfx('chop', u.x, u.y);
      if (M.wood[i] <= 0) { M.tree[i] = T_STUMP; M.block[i] = 0; G.treeEv.push(i) }
    }
    return;
  }
  if (!u.path) goRect(u, o.tx, o.ty, o.tx, o.ty, true);
  if (stepPath(u, dt)) { u.path = null; if (++u.stuck > 4) { const n = nearestTree(u.x, u.y, 6); u.stuck = 0; if (n && (n[0] !== o.tx || n[1] !== o.ty)) { o.tx = n[0]; o.ty = n[1] } else setOrder(u, null) } }
}
function doReturn(u, dt, o) {
  if (!u.carry) { if (o.back) { u.ord = o.back; u.path = null } else setOrder(u, null); return }
  let best = null, bd = 1e9; for (const b of dropsOf(u.own)) { const d = distTo(u, b); if (d < bd) { bd = d; best = b } }
  if (!best) { setOrder(u, null); return }
  if (bd <= 0.8) {
    const p = G.players[u.own]; if (u.ctype === 'g') p.gold += u.carry; else p.wood += u.carry;
    u.carry = 0; u.path = null; u.stuck = u.nudge = 0; if (o.back) u.ord = o.back; else setOrder(u, null); return;
  }
  if (o.to !== best.id) { o.to = best.id; u.path = null }
  approach(u, dt, best, 0.8);
}
// подойти к постройке вплотную; после пути, если стоим в углу соседней клетки, — доводка напрямую
function approach(u, dt, b, tol) {
  if (!u.path) goRect(u, b.tx, b.ty, b.tx + b.s - 1, b.ty + b.s - 1, true);
  if (!stepPath(u, dt) || distTo(u, b) <= tol) return;
  const nx = Math.max(b.tx, Math.min(b.tx + b.s, u.x)), ny = Math.max(b.ty, Math.min(b.ty + b.s, u.y)), d = Math.hypot(nx - u.x, ny - u.y);
  if (d < 2 && (u.nudge = (u.nudge || 0) + dt) < 3) { const st = Math.min(d, u.T.spd * dt); tryShift(u, (nx - u.x) / d * st, (ny - u.y) / d * st); u.moving = 1; faceTo(u, nx - u.x, ny - u.y); u.path = []; u.pi = 0 }
  else { u.path = null; u.nudge = 0; if (++u.stuck > 6) setOrder(u, null) }
}
function exhaustMine(m) { note(-1, 'Золотой рудник иссяк', m.x, m.y); destroyBld(m, true) }
function doBuild(u, dt, o) {
  const b = ents.get(o.id); if (!b || b.dead) return setOrder(u, null);
  if (o.k === 'repair' && b.fire <= 0 && b.hp >= b.mhp) return setOrder(u, null);
  if (o.k === 'build' && b.prog >= 1) { o.k = 'repair'; if (b.hp >= b.mhp && !b.fire) return setOrder(u, null) }
  if (distTo(u, b) > 0.8) {
    approach(u, dt, b, 0.8);
    return;
  }
  u.path = null; u.stuck = u.nudge = 0; faceTo(u, b.x - u.x, b.y - u.y);
  if (u.cd <= 0) { u.cd = 0.8; u.atkT = 0.35; sfx(b.fire > 0 ? 'splash' : 'build', b.x, b.y) }
  const p = G.players[u.own];
  if (b.fire > 0) { // тушим
    b.fire -= 0.075 * dt * (p.up.buckets ? 2 : 1);
    if (b.fire <= 0) { b.fire = 0; note(u.own, 'Пожар потушен', b.x, b.y) }
    return;
  }
  if (b.prog < 1) {
    const step = dt / b.T.time; b.prog = Math.min(1, b.prog + step); b.hp = Math.min(b.mhp, b.hp + b.mhp * 0.9 * step);
    if (b.prog >= 1) { recalcPop(p); note(u.own, 'Построено: ' + b.T.name, b.x, b.y); sfx('done', b.x, b.y) }
  } else b.hp = Math.min(b.mhp, b.hp + b.mhp * dt / (b.T.time * 1.5));
}
function doTorch(u, dt, o) {
  const b = ents.get(o.id); if (!b || b.dead || b.fire > 0.3) { setOrder(u, null); return }
  if (distTo(u, b) > 0.8) {
    approach(u, dt, b, 0.8);
    return;
  }
  u.path = null; u.stuck = u.nudge = 0; faceTo(u, b.x - u.x, b.y - u.y);
  o.tt = (o.tt || 0) + dt; u.atkT = 0.2;
  if (o.tt >= 1.6) { ignite(b, 0.3); u.abCd = SPELLS.torch.cd; fx('fireball', b.x, b.y, 0.5); u.ord = { k: 'attack', id: b.id, auto: 1 } }
}

// ---------- маги и герои ----------
function doCast(u, dt, o) {
  const S = SPELLS[o.s];
  if (u.mana < S.mana) return setOrder(u, null);
  const d = Math.hypot(o.x - u.x, o.y - u.y);
  if (d > S.rng) { if (moveAlong(u, dt, o) || Math.hypot(o.x - u.x, o.y - u.y) <= S.rng) u.path = null; return }
  u.mana -= S.mana; u.atkT = 0.6; faceTo(u, o.x - u.x, o.y - u.y);
  spellAt(u.own, o.s, o.x, o.y, u);
  setOrder(u, null);
}
function spellAt(own, s, x, y, src) {
  const S = SPELLS[s] || HSPELLS[s];
  if (s === 'firerain') {
    fx('firerain', x, y, 1.6, { r: S.r }); sfx('fire', x, y);
    setTimeout0(() => {
      for (const t of near(x, y, S.r)) if (hostile(own, t.own)) damage(src || { own, T: {}, e: 'x' }, t, S.dmg, { magic: 1 });
      for (const b of G.blds) if (!b.inv && hostile(own, b.own) && distTo({ x, y }, b) < S.r) { damage(src, b, S.dmg * 2, { magic: 1 }); ignite(b, 0.35) }
      igniteTreesAt(x, y, S.r, 0.6);
    }, 0.6);
  } else if (s === 'spirits' || s === 'prayer' || s === 'heal') {
    fx('heal', x, y, 1.2, { r: S.r }); sfx('heal', x, y);
    for (const t of near(x, y, S.r)) if (t.own === own) t.hp = Math.min(t.mhp, t.hp + S.heal);
  } else if (s === 'bolt') {
    fx('bolt', x, y, 0.5, { big: 1 }); sfx('thunder', x, y);
    for (const t of near(x, y, S.r)) if (t.own !== own) { if (t.own === NEUTRAL) aggro(t, own); damage({ own, T: {}, e: 'x' }, t, S.dmg, { magic: 1 }) }
    for (const b of G.blds) if (!b.inv && b.own !== own && distTo({ x, y }, b) < S.r) { damage({ own, T: {}, e: 'x' }, b, S.dmg, { magic: 1 }); ignite(b, 0.4) }
    igniteTreesAt(x, y, 1.2, 0.8);
  } else if (s === 'rain') {
    fx('rain', x, y, 3, { r: S.r }); sfx('rain', x, y);
    for (const b of G.blds) if (distTo({ x, y }, b) < S.r) b.fire = 0;
    for (const i of Array.from(G.burning)) { const tx = i % MAPN, ty = (i / MAPN) | 0; if ((tx - x) ** 2 + (ty - y) ** 2 < S.r * S.r) { G.burning.delete(i); M.tfire[i] = 0; G.treeEv.push(i) } }
  } else if (s === 'vision') {
    G.visions.push({ own, x, y, r: S.r, until: G.t + 20 }); fx('vision', x, y, 1.5, { r: S.r });
  }
}
const timers = [];
function setTimeout0(f, t) { timers.push({ f, at: G.t + t }) } // таймер в игровом времени
function runTimers() { for (let i = timers.length - 1; i >= 0; i--) if (G.t >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.f() } }
function doSmash(u) {
  const S = SPELLS.smash; u.abCd = S.cd; u.atkT = 0.6;
  fx('smash', u.x, u.y, 0.7, { r: S.r }); sfx('boom', u.x, u.y);
  for (const t of near(u.x, u.y, S.r + 0.3)) if (canTarget(u, t) && hostile(u.own, t.own) && canHit(u, t)) {
    damage(u, t, S.dmg, { magic: 1 });
    if (!t.T.fly && !t.dead) { const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1; tryShift(t, dx / d * 0.8, dy / d * 0.8); t.slowT = G.t + 2 }
  }
}
function autoHeal(u) {
  const S = SPELLS[u.T.spell]; if (!S || !S.heal || u.mana < S.mana) return;
  const hurt = near(u.x, u.y, S.rng, t => t.own === u.own && t.hp < t.mhp * 0.65);
  if (hurt.length >= 2 || hurt.some(t => t.T.hero)) { const t = hurt[0]; setOrder(u, { k: 'cast', s: u.T.spell, x: t.x, y: t.y }) }
}

// ---------- отшельники ----------
function hutDeal(pi, c) {
  const h = ents.get(c.hid), p = G.players[pi]; if (!h || h.arch !== 'hut') return;
  if (!G.units.some(u => u.own === pi && distTo(u, h) < 4.5)) return note(pi, 'Подведите к скиту любого своего воина или работника');
  if (c.opt === 'hire') {
    const he = ents.get(h.hermit); if (!he || he.own !== NEUTRAL) return note(pi, 'Отшельника здесь больше нет');
    if (he.aggro && he.aggro[pi] > G.t) return note(pi, 'Отшельник зол на вас и не пойдёт в услужение');
    if (p.gold < HERMIT_HIRE) return note(pi, 'Не хватает золота');
    p.gold -= HERMIT_HIRE; he.own = pi; he.ord = null; he.aggro = null; h.hermit = 0; recalcPop(p);
    note(pi, 'Отшельник присоединился к вам', he.x, he.y); sfx('heal', he.x, he.y);
  } else {
    const s = c.opt; if (!h.spells.includes(s)) return;
    if (p.hs[s] !== undefined) return note(pi, 'Это заклинание уже изучено');
    if (p.gold < HSPELLS[s].g) return note(pi, 'Не хватает золота');
    p.gold -= HSPELLS[s].g; p.hs[s] = G.t; note(pi, `Отшельник научил: «${HSPELLS[s].name}». Кнопка — на верхней панели.`, h.x, h.y); sfx('heal', h.x, h.y);
  }
}
function castGlobal(pi, s, x, y) {
  const p = G.players[pi], S = HSPELLS[s]; if (!S || p.hs[s] === undefined || G.t < p.hs[s]) return;
  if (!p.exp[tIdx(Math.floor(x), Math.floor(y))]) return note(pi, 'Можно колдовать только на разведанной земле');
  p.hs[s] = G.t + S.cd; spellAt(pi, s, x, y, null);
}
function updHermit(u, dt) {
  if (u.own !== NEUTRAL) { // нанятый — обычный боевой юнит
    u.hermitMode = 1;
    const o = u.ord;
    if (!o) { if ((u.repT -= dt) <= 0) { u.repT = 0.5; const t = findTarget(u, u.T.sight); if (t) u.ord = { k: 'attack', id: t.id, auto: 1, hx: u.x, hy: u.y } } return }
    if (o.k === 'move') { if (moveAlong(u, dt, o)) setOrder(u, null) }
    else if (o.k === 'amove') { if ((u.repT -= dt) <= 0) { u.repT = 0.4; const t = findTarget(u, u.T.sight); if (t) { u.ord = { k: 'attack', id: t.id, auto: 1, back: o }; return } } if (moveAlong(u, dt, o)) setOrder(u, null) }
    else if (o.k === 'attack') doAttack(u, dt, o);
    else setOrder(u, null);
    return;
  }
  u.hp = Math.min(u.mhp, u.hp + dt * 2);
  const h = ents.get(u.home);
  if (u.ord && u.ord.k === 'attack') { doAttack(u, dt, u.ord); return }
  if ((u.repT -= dt) <= 0) {
    u.repT = 1;
    const t = findTarget(u, u.T.sight); if (t) { u.ord = { k: 'attack', id: t.id, auto: 1, hx: u.x, hy: u.y }; return }
    if (!u.ord && h && R2() < 0.15) { const [x, y] = freeNear(h.x + (R2() - 0.5) * 7, h.y + (R2() - 0.5) * 7); u.ord = { k: 'move', x: x + 0.5, y: y + 0.5 } }
  }
  if (u.ord && u.ord.k === 'move' && moveAlong(u, dt * 0.6, u.ord)) setOrder(u, null);
}

// ---------- дракон ----------
function wakeDragon(d) {
  if (d.dst !== 'sleep') return;
  d.dst = 'guard'; d.guardT = G.t; sfx('roar', d.x, d.y); note(-1, 'Дракон проснулся!', d.x, d.y, 'big');
}
function updDragon(d, dt) {
  const lair = ents.get(d.lair);
  const lx = lair ? lair.x : d.x, ly = lair ? lair.y + 2 : d.y;
  if (d.dst === 'sleep') {
    d.hp = Math.min(d.mhp, d.hp + dt * 6);
    if ((d.repT -= dt) <= 0) {
      d.repT = 0.5;
      if (near(lx, ly, DRAGON.wakeR, t => isPlayer(t.own)).length) wakeDragon(d);
      else if (G.t >= d.raidAt) { wakeDragon(d); d.raidGo = 1 }
    }
    return;
  }
  const fly = (tx, ty, sp) => { const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy); if (dd > 0.1) { const s = Math.min(dd, d.T.spd * dt * (sp || 1)); d.x += dx / dd * s; d.y += dy / dd * s; faceTo(d, dx, dy); d.moving = 1 } d.anim += dt * 3; return dd < 0.5 };
  // бой с целью
  const atk = t => {
    const dist = Math.hypot(t.x - d.x, t.y - d.y) - (t.e === 'b' ? t.s / 2 : 0);
    if (dist > d.T.rng) fly(t.x, t.y);
    else { faceTo(d, t.x - d.x, t.y - d.y); d.anim += dt * 3; if (d.cd <= 0) { hit(d, t); d.cd = d.T.cd; d.atkT = 0.6 } }
  };
  if (d.dst === 'guard') {
    if ((d.repT -= dt) <= 0) { d.repT = 0.5; const t = findTarget(d, 10); d.tgt = t && Math.hypot(t.x - lx, t.y - ly) < 13 ? t.id : 0 }
    const t = ents.get(d.tgt);
    if (t && !t.dead) { atk(t); d.guardT = G.t; return }
    if (G.t - d.guardT > 6) {
      if (G.t >= d.raidAt || d.raidGo) { d.raidGo = 0; startRaid(d) }
      else if (fly(lx, ly)) { d.dst = 'sleep'; d.moving = 0 }
    } else fly(lx, ly, 0.5);
    return;
  }
  if (d.dst === 'raid') {
    if (G.t > d.raidEnd || d.hp < d.mhp * 0.35) { d.dst = 'back'; d.raidAt = G.t + 200 + R2() * 90; return }
    if ((d.repT -= dt) <= 0) {
      d.repT = 0.6;
      const t = findTarget(d, 7);
      if (t) d.tgt = t.id; else if (!ents.get(d.tgt)) { const v = G.players[d.victim]; const bs = G.blds.filter(b => b.own === d.victim); d.tgt = bs.length ? bs[(R2() * bs.length) | 0].id : 0; if (!d.tgt) d.raidEnd = 0 }
    }
    const t = ents.get(d.tgt); if (t && !t.dead) atk(t);
    return;
  }
  if (d.dst === 'back') { if (fly(lx, ly)) { d.dst = 'guard'; d.guardT = G.t - 3; d.raidAt = Math.max(d.raidAt, G.t + 180) } }
}
function startRaid(d) {
  const alive = G.players.filter(p => p.alive && G.blds.some(b => b.own === p.i));
  if (!alive.length) { d.raidAt = G.t + 200; return }
  const v = alive[(R2() * alive.length) | 0];
  d.dst = 'raid'; d.victim = v.i; d.raidEnd = G.t + 40; d.tgt = 0;
  note(v.i, 'Дракон летит жечь нашу деревню!', d.x, d.y, 'big'); note(-2, `Дракон полетел к игроку ${v.name}`, d.x, d.y);
  sfx('roar', d.x, d.y);
}

// ---------- обзор и туман войны ----------
function stamp(vis, exp, x, y, r) {
  const r2 = r * r, x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(MAPN - 1, Math.floor(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(MAPN - 1, Math.floor(y + r));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r2) { const i = ty * MAPN + tx; vis[i] = 1; exp[i] = 1 }
}
function updateVision() {
  G.visions = G.visions.filter(v => v.until > G.t);
  for (const p of G.players) {
    if (p.kind === 'closed') continue;
    p.vis.fill(0);
    for (const u of G.units) if (u.own === p.i && !u.inMine) stamp(p.vis, p.exp, u.x, u.y, u.T.sight);
    for (const b of G.blds) if (b.own === p.i) stamp(p.vis, p.exp, b.x, b.y, b.prog >= 1 ? (b.T.sight || 6) : 3);
    for (const v of G.visions) if (v.own === p.i) stamp(p.vis, p.exp, v.x, v.y, v.r);
    if (G.over || G.reveal) p.vis.fill(1);
  }
}
function checkEnd() {
  for (const p of G.players) {
    if (!p.alive) continue;
    const has = G.blds.some(b => b.own === p.i) || G.units.some(u => u.own === p.i && u.arch !== 'hermit');
    if (!has) { p.alive = false; note(-1, `${p.name} (${RACES[p.race].name}) повержен!`, 0, 0, 'big'); for (const u of G.units) if (u.own === p.i) kill(u) }
  }
  const alive = G.players.filter(p => p.alive);
  if (alive.length <= 1 && !G.over) { G.over = true; G.winner = alive.length ? alive[0].i : -1; updateVision() }
}
