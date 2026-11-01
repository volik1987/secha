'use strict';
// ---------- Компьютерный противник ----------
const DIFF = {
  easy:   { name: 'Лёгкий', work: 12, first: 660, wave: 5, grow: 2, think: 1.6, trickle: 0 },
  normal: { name: 'Средний', work: 18, first: 450, wave: 8, grow: 3, think: 1.0, trickle: 0 },
  hard:   { name: 'Сильный', work: 24, first: 330, wave: 10, grow: 4, think: 0.6, trickle: 1.5 },
};
const PLAN = ['house', 'barracks', 'house', 'range', 'smith', 'house', 'temple', 'tower', 'stable', 'house', 'barracks', 'tower', 'range', 'house', 'house', 'stable', 'house', 'tower'];
const ARMY_MIX = { // веса юнитов по расам
  rus: { inf: 3, spear: 2, archer: 3, cav: 2, mage: 1, siege: 1 },
  mon: { inf: 2, spear: 1, archer: 4, cav: 3, mage: 1, siege: 1 },
  teu: { inf: 3, spear: 2, archer: 2, cav: 3, mage: 1, siege: 1 },
};
function aiInit(p) { const D = DIFF[p.diff] || DIFF.normal; p.ai = { D, t: 0, waveN: 0, size: D.wave, attacking: 0, tgt: 0, reT: 0, sent: 0 } }
function aiStep(p, dt) {
  const A = p.ai; if (!p.alive) return;
  if (A.D.trickle) { p.gold += A.D.trickle * dt; p.wood += A.D.trickle * dt }
  A.t -= dt; if (A.t > 0) return; A.t = A.D.think;
  const my = G.units.filter(u => u.own === p.i), mb = G.blds.filter(b => b.own === p.i);
  const workers = my.filter(u => u.arch === 'worker'), army = my.filter(u => u.arch !== 'worker');
  const halls = mb.filter(b => b.arch === 'hall' && b.prog >= 1), hall = halls[0] || mb.find(b => b.arch === 'hall');
  const cmd = c => applyCmd(p.i, c);
  const count = a => mb.filter(b => b.arch === a).length;
  const building = mb.filter(b => b.prog < 1);
  // 1. пожары: тушить, ремонтировать
  for (const b of mb) {
    if (b.fire > 0) {
      const busy = workers.filter(w => w.ord && w.ord.id === b.id).length;
      if (busy < 3) { const w = workers.filter(w => !(w.ord && w.ord.id === b.id)).sort((a, c) => distTo(a, b) - distTo(c, b))[0]; if (w) cmd({ c: 'repair', ids: [w.id], tid: b.id }) }
      if (p.hs.rain !== undefined && G.t >= p.hs.rain && b.fire > 0.4) cmd({ c: 'gspell', s: 'rain', x: b.x, y: b.y });
    } else if (b.prog >= 1 && b.hp < b.mhp * 0.5 && G.t - p.attackedT > 10 && !workers.some(w => w.ord && w.ord.id === b.id)) {
      const w = workers.find(w => w.ord && w.ord.k === 'gather'); if (w) cmd({ c: 'repair', ids: [w.id], tid: b.id });
    }
    // недостроенное без строителей
    if (b.prog < 1 && !workers.some(w => w.ord && w.ord.id === b.id)) { const w = workers.find(w => !w.ord || w.ord.k === 'gather'); if (w) cmd({ c: 'repair', ids: [w.id], tid: b.id }) }
  }
  if (!hall) { // потеряли главное здание — строим новое
    const w = workers[0]; if (w && p.gold >= BST[p.race].hall.g && p.wood >= BST[p.race].hall.w) { const s = aiSpot(p, 3, w.x, w.y); if (s) cmd({ c: 'build', ids: [w.id], b: 'hall', tx: s[0], ty: s[1] }) }
  }
  // 2. работники
  if (hall && hall.prog >= 1 && workers.length < A.D.work && hall.q.length < 1 && p.gold >= 50 && p.pop < p.cap) cmd({ c: 'train', bid: hall.id, u: 'worker' });
  const onGold = workers.filter(w => w.ord && w.ord.mine).length;
  for (const w of workers) {
    if (w.ord) continue;
    if (!hall) break;
    const mines = G.blds.filter(b => b.arch === 'mine' && !b.dead).sort((a, b) => distTo(hall, a) - distTo(hall, b));
    const m = mines[0];
    if (m && distTo(hall, m) < 22 && onGold < workers.length * 0.34) cmd({ c: 'gather', ids: [w.id], mine: m.id });
    else { const t = nearestTree(hall.x, hall.y, 24); if (t) cmd({ c: 'gather', ids: [w.id], tx: t[0], ty: t[1] }) }
  }
  // 3. жильё и постройки по плану
  const builder = () => workers.filter(w => !w.ord || w.ord.k === 'gather' || w.ord.k === 'return').sort((a, b) => (a.carry - b.carry))[0];
  if (hall && p.cap - p.pop <= 4 && p.cap < 120 && !building.some(b => b.arch === 'house')) aiBuild(p, 'house', builder(), hall);
  else if (hall && building.filter(b => b.arch !== 'house').length < (p.diff === 'hard' ? 2 : 1)) {
    const need = {}; let next = null;
    for (const a of PLAN) { need[a] = (need[a] || 0) + 1; if (count(a) < need[a]) { next = a; break } }
    if (next && G.t > (next === 'barracks' ? 40 : 0)) aiBuild(p, next, builder(), hall);
  }
  // 4. исследования
  const research = (at, list) => { const b = mb.find(x => x.arch === at && x.prog >= 1 && !x.q.length); if (!b) return; for (const r of list) if (!p.up[r] && (!UPS[r].req || p.up[UPS[r].req]) && p.gold >= UPS[r].g + 150 && p.wood >= UPS[r].w) { cmd({ c: 'research', bid: b.id, r }); return } };
  if (army.length >= 4) { research('smith', ['atk1', 'arm1', 'atk2', 'arm2']); research('range', ['fire', 'bows']); research('hall', ['buckets', 'axes']) }
  // 5. армия
  const mix = ARMY_MIX[p.race];
  for (const b of mb) {
    if (b.prog < 1 || b.q.length >= 2 || !b.T.trains || b.arch === 'hall') continue;
    const opts = b.T.trains.filter(u => mix[u]); if (!opts.length) continue;
    let tot = 0; for (const u of opts) tot += mix[u]; let r = R2() * tot, pick = opts[0];
    for (const u of opts) { r -= mix[u]; if (r <= 0) { pick = u; break } }
    const T = UST[p.race][pick];
    if (p.gold >= T.g + 40 && p.wood >= T.w && p.pop + popOf(T) <= p.cap) cmd({ c: 'train', bid: b.id, u: pick });
  }
  if (hall && hall.prog >= 1 && count('temple') && p.gold >= 450 && !my.some(u => u.T.hero) && !hall.q.some(q => q.u === 'hero')) cmd({ c: 'train', bid: hall.id, u: 'hero' });
  // 6. маги и герой
  for (const u of army) {
    if (u.T.spell === 'firerain' && u.mana >= SPELLS.firerain.mana) {
      const en = near(u.x, u.y, 7, t => hostile(p.i, t.own) && !t.T.fly);
      if (en.length >= 3) { const t = en[(R2() * en.length) | 0]; cmd({ c: 'cast', ids: [u.id], s: 'firerain', x: t.x, y: t.y }) }
    }
    if (u.T.ability === 'smash' && u.abCd <= 0 && near(u.x, u.y, 2, t => hostile(p.i, t.own)).length >= 3) cmd({ c: 'cast', ids: [u.id], s: 'smash' });
  }
  // 7. оборона
  const home = hall || mb[0]; if (!home) return;
  if (p.lastAttack && G.t - p.attackedT < 8 && Math.hypot(p.lastAttack[0] - home.x, p.lastAttack[1] - home.y) < 20) {
    const idle = army.filter(u => !u.ord || u.ord.k === 'move' || (u.ord.k === 'amove' && !A.attacking));
    if (idle.length) cmd({ c: 'amove', ids: idle.map(u => u.id), x: p.lastAttack[0], y: p.lastAttack[1] });
    return;
  }
  // 8. нападение волнами
  const fighters = army.filter(u => u.arch !== 'hermit' || true);
  if (!A.attacking && G.t >= A.D.first && fighters.length >= A.size) {
    const tgt = aiTarget(p, home); if (!tgt) return;
    A.attacking = 1; A.tgt = tgt.id; A.sent = fighters.length; A.waveN++; A.size += A.D.grow; A.reT = G.t;
    cmd({ c: 'amove', ids: fighters.map(u => u.id), x: tgt.x, y: tgt.y });
  } else if (A.attacking) {
    const out = fighters.filter(u => Math.hypot(u.x - home.x, u.y - home.y) > 15);
    if (out.length < A.sent * 0.3 && G.t - A.reT > 20) { A.attacking = 0; cmd({ c: 'move', ids: fighters.map(u => u.id), x: home.x + 3, y: home.y + 3 }); return }
    let t = ents.get(A.tgt);
    if (!t || t.dead || G.t - A.reT > 14) {
      t = aiTarget(p, out[0] || home); if (!t) { A.attacking = 0; return }
      A.tgt = t.id; A.reT = G.t;
      const idle = fighters.filter(u => !u.ord || u.ord.k !== 'attack');
      if (idle.length) cmd({ c: 'amove', ids: idle.map(u => u.id), x: t.x, y: t.y });
    }
    // факелы: пехота поджигает деревянные постройки
    for (const u of fighters) if (u.T.torch && u.abCd <= 0 && (!u.ord || u.ord.k !== 'torch') && R2() < 0.3) {
      const b = G.blds.find(b => !b.inv && hostile(p.i, b.own) && isPlayer(b.own) && b.T.flam >= 1 && !b.fire && distTo(u, b) < 5);
      if (b) cmd({ c: 'torch', ids: [u.id], tid: b.id });
    }
  }
  // новые воины без дела собираются у базы
  for (const u of fighters) if (!u.ord && !A.attacking && Math.hypot(u.x - home.x, u.y - home.y) > 12) cmd({ c: 'move', ids: [u.id], x: home.x + 4, y: home.y + 4 });
}
function aiTarget(p, from) {
  let best = null, bd = 1e9;
  for (const b of G.blds) if (!b.inv && isPlayer(b.own) && hostile(p.i, b.own)) { const d = Math.hypot(b.x - from.x, b.y - from.y) - (b.arch === 'hall' ? 6 : 0); if (d < bd) { bd = d; best = b } }
  if (!best) for (const u of G.units) if (isPlayer(u.own) && hostile(p.i, u.own)) { const d = Math.hypot(u.x - from.x, u.y - from.y); if (d < bd) { bd = d; best = u } }
  return best;
}
function aiBuild(p, arch, w, hall) {
  if (!w) return;
  const T = BST[p.race][arch]; if (p.gold < T.g || p.wood < T.w || !reqOk(p, T.req)) return;
  const s = aiSpot(p, T.s, hall.x, hall.y, arch === 'tower'); if (!s) return;
  applyCmd(p.i, { c: 'build', ids: [w.id], b: arch, tx: s[0], ty: s[1] });
}
function aiSpot(p, s, cx, cy, outer) {
  const mines = G.blds.filter(b => b.arch === 'mine');
  for (let r = outer ? 7 : 4; r < 18; r++) {
    const cand = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2 + r, tx = Math.round(cx + Math.cos(a) * r - s / 2), ty = Math.round(cy + Math.sin(a) * r - s / 2);
      if (!canPlace(s, tx, ty, true)) continue;
      if (mines.some(m => tx < m.tx + m.s + 3 && tx + s > m.tx - 3 && ty < m.ty + m.s + 3 && ty + s > m.ty - 3)) continue;
      cand.push([tx, ty]);
    }
    if (cand.length) return cand[(R2() * cand.length) | 0];
  }
  return null;
}
