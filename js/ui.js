'use strict';
// ---------- Интерфейс: мышь, клавиши, панели, меню ----------
const UI = { sel: new Set(), mx: 0, my: 0, drag: null, place: null, target: null, menu: null, marks: [], pings: [], groups: {}, keys: new Set(), paused: false, sig: '', infoSig: '', lastAlert: null };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isGuest = () => NET.role === 'guest';
function issue(c) { // приказ от этого игрока
  if (!G || G.over) return;
  if (isGuest()) netCmd(c); else { c.p = G.me; G.cmdq.push(c) }
  play('click');
}
const me = () => G.players[G.me];
const selList = () => [...UI.sel].map(id => ents.get(id)).filter(Boolean);
const myUnits = () => selList().filter(e => e.e === 'u' && e.own === G.me);

// ---------- запуск партии ----------
let acc = 0, lastT = 0, snapAcc = 0, visAcc = 0, overShown = false, crackT = 0;
function startGame(cfg, guest) {
  newGame(cfg);
  if (!guest) for (const p of G.players) if (p.kind === 'ai') aiInit(p);
  G.guest = !!guest;
  UI.sel.clear(); UI.place = null; UI.target = null; UI.menu = null; UI.groups = {}; overShown = false; mmBase = null;
  $('ov').className = 'off'; $('game').classList.add('on');
  resize();
  const p = me(); centerOn(p.start.x + 1, p.start.y + 1); CAM.z = 1;
  acc = 0; lastT = performance.now() / 1000; UI.paused = false;
  $('notes').innerHTML = '';
  onNote({ text: `Вы — ${RACES[p.race].name} (${CNAMES[G.me]}). Стройте, добывайте, жгите врагов!`, kind: 'big' });
}
function frame() {
  requestAnimationFrame(frame);
  if (!G) return;
  const now = performance.now() / 1000, dt = Math.min(0.25, now - lastT); lastT = now;
  let alpha = 1;
  if (!isGuest()) {
    if (!UI.paused || NET.role === 'host') {
      acc += dt;
      while (acc >= STEP) { simStep(); acc -= STEP; snapAcc += STEP; if (snapAcc >= 0.1) { snapAcc = 0; netSnapshots() } }
    }
    alpha = acc / STEP;
  } else { guestTick(dt); alpha = Math.min(1, (now - NET.snapT) / NET.snapDt) }
  scrollCam(dt);
  draw(alpha); drawMinimap();
  uiTick(dt);
}
// вкладка свёрнута — хозяин продолжает считать, иначе у гостей всё замрёт
setInterval(() => {
  if (!G || NET.role !== 'host' || !document.hidden) return;
  const now = performance.now() / 1000, dt = Math.min(0.5, now - lastT); lastT = now; acc += dt;
  while (acc >= STEP) { simStep(); acc -= STEP; snapAcc += STEP; if (snapAcc >= 0.1) { snapAcc = 0; netSnapshots() } }
}, 100);

// ---------- камера ----------
function scrollCam(dt) {
  if (!$('game').classList.contains('on') || $('ov').className !== 'off') return;
  const sp = 900 * dt / CAM.z; let dx = 0, dy = 0;
  if (UI.keys.has('ArrowLeft')) dx -= sp; if (UI.keys.has('ArrowRight')) dx += sp; if (UI.keys.has('ArrowUp')) dy -= sp; if (UI.keys.has('ArrowDown')) dy += sp;
  if (UI.inWin && !UI.drag) { const e = 6; if (UI.mx < e) dx -= sp; if (UI.mx > W - e) dx += sp; if (UI.my < e) dy -= sp; if (UI.my > H - e) dy += sp }
  if (dx || dy) { CAM.x += dx; CAM.y += dy; clampCam() }
}

// ---------- выбор под курсором ----------
function pickAt(sx, sy) {
  const [mx, my] = fromScreen(sx, sy), p = me(); let best = null, bd = -1e9;
  for (const u of G.units) {
    if (u.inMine || u.rx === undefined) continue;
    if (u.own !== G.me && !G.over && !p.vis[tIdx(Math.floor(u.x), Math.floor(u.y))]) continue;
    if (u.arch === 'dragon' && u.dst === 'sleep') continue;
    const [ux, uy] = toScreen(u.rx, u.ry), h = u.T.h * CAM.z, w = h * 0.55, lift = u.T.fly ? 90 * CAM.z : 0;
    if (sx > ux - w / 2 && sx < ux + w / 2 && sy > uy - h - lift && sy < uy + 4 - lift) { const d = u.rx + u.ry + (u.T.fly ? 6 : 0); if (d > bd) { bd = d; best = u } }
  }
  if (best) return best;
  const tx = Math.floor(mx), ty = Math.floor(my);
  if (inMap(tx, ty) && M.bid[tIdx(tx, ty)] > 0) { const b = ents.get(M.bid[tIdx(tx, ty)]); if (b && (p.exp[tIdx(tx, ty)] || G.over)) return b }
  // спрайт здания выше ромба — проверим по прямоугольнику
  for (const b of G.blds) {
    if (!p.seen.has(b.id) && !G.over) continue;
    const g = bGeom(b, bSprite(b)), [cx, by] = [(g.cx - CAM.x) * CAM.z + W / 2, (g.by - CAM.y) * CAM.z + H / 2];
    if (sx > cx - g.w * 0.35 * CAM.z && sx < cx + g.w * 0.35 * CAM.z && sy > by - g.h * CAM.z * 0.9 && sy < by) { const d = b.x + b.y; if (d > bd) { bd = d; best = b } }
  }
  return best;
}
function treeAt(sx, sy) {
  const [mx, my] = fromScreen(sx, sy);
  // дерево выше своей клетки — смотрим и клетки ниже курсора
  for (const [dx, dy] of [[0, 0], [1, 1], [0, 1], [1, 0], [2, 2]]) {
    const x = Math.floor(mx) + dx, y = Math.floor(my) + dy; if (!inMap(x, y)) continue;
    const t = M.tree[tIdx(x, y)]; if (t && t < T_STUMP && me().exp[tIdx(x, y)]) return [x, y];
  }
  return null;
}
function selectEnt(e, add) {
  if (!add) UI.sel.clear();
  if (e) { if (add && UI.sel.has(e.id)) UI.sel.delete(e.id); else UI.sel.add(e.id) }
  UI.menu = null; UI.sig = '';
}

// ---------- мышь ----------
function setupInput() {
  const c = $('cv');
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('mousemove', e => { UI.mx = e.clientX; UI.my = e.clientY; UI.inWin = true; if (UI.drag && Math.hypot(e.clientX - UI.drag.x0, e.clientY - UI.drag.y0) > 6) UI.drag.box = true; if (UI.mdrag) { CAM.x -= e.movementX / CAM.z; CAM.y -= e.movementY / CAM.z; clampCam() } });
  document.addEventListener('mouseleave', () => UI.inWin = false);
  document.addEventListener('mouseenter', () => UI.inWin = true);
  c.addEventListener('mousedown', e => {
    sndInit();
    if (!G || G.over && e.button !== 1) { if (e.button === 0) UI.drag = { x0: e.clientX, y0: e.clientY }; return }
    if (e.button === 1) { UI.mdrag = true; e.preventDefault(); return }
    if (e.button === 2) { rightClick(e); return }
    if (UI.place) { tryPlace(e.shiftKey); return }
    if (UI.target) { targetClick(e); return }
    UI.drag = { x0: e.clientX, y0: e.clientY };
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 1) UI.mdrag = false;
    if (e.button !== 0 || !UI.drag) return;
    const d = UI.drag; UI.drag = null; if (!G) return;
    if (d.box) {
      const x0 = Math.min(d.x0, e.clientX), x1 = Math.max(d.x0, e.clientX), y0 = Math.min(d.y0, e.clientY), y1 = Math.max(d.y0, e.clientY);
      const got = G.units.filter(u => u.own === G.me && !u.inMine && u.rx !== undefined && (() => { const [sx, sy] = toScreen(u.rx, u.ry); return sx >= x0 && sx <= x1 && sy - 15 >= y0 - 20 && sy - 15 <= y1 })());
      if (got.length) {
        if (!e.shiftKey) UI.sel.clear();
        const army = got.filter(u => u.arch !== 'worker'); for (const u of (army.length ? army : got)) UI.sel.add(u.id); UI.menu = null; UI.sig = '';
      }
      return;
    }
    const t = pickAt(e.clientX, e.clientY);
    const now = performance.now();
    if (t && t.e === 'u' && t.own === G.me && UI.lastClick && UI.lastClick.id === t.id && now - UI.lastClick.t < 350) {
      UI.sel.clear(); for (const u of G.units) if (u.own === G.me && u.arch === t.arch && u.race === t.race && u.rx !== undefined) { const [sx, sy] = toScreen(u.rx, u.ry); if (sx > 0 && sx < W && sy > 0 && sy < H) UI.sel.add(u.id) }
      UI.sig = ''; return;
    }
    UI.lastClick = t ? { id: t.id, t: now } : null;
    selectEnt(t, e.shiftKey && t && t.own === G.me);
  });
  c.addEventListener('wheel', e => { e.preventDefault(); const [mx, my] = fromScreen(e.clientX, e.clientY); CAM.z = Math.max(0.45, Math.min(1.8, CAM.z * (e.deltaY < 0 ? 1.12 : 0.89))); const [nx, ny] = fromScreen(e.clientX, e.clientY); CAM.x += isoX(mx, my) - isoX(nx, ny); CAM.y += isoY(mx, my) - isoY(nx, ny); clampCam() }, { passive: false });
  // мини-карта: левая — камера, правая — приказ
  const mini = $('mini');
  const miniPos = e => { const r = mini.getBoundingClientRect(); return mmInv((e.clientX - r.left) * mini.width / r.width, (e.clientY - r.top) * mini.height / r.height) };
  mini.addEventListener('contextmenu', e => e.preventDefault());
  mini.addEventListener('mousedown', e => {
    sndInit(); const [x, y] = miniPos(e);
    if (e.button === 2) { const us = myUnits(); if (us.length) { issue({ c: 'move', ids: us.map(u => u.id), x, y }); mark(x, y, '#7f7') } return }
    if (UI.target && UI.target.k === 'amove') { issue({ c: 'amove', ids: myUnits().map(u => u.id), x, y }); UI.target = null; return }
    centerOn(x, y); UI.miniDrag = true;
  });
  mini.addEventListener('mousemove', e => { if (UI.miniDrag && e.buttons & 1) { const [x, y] = miniPos(e); centerOn(x, y) } });
  window.addEventListener('mouseup', () => UI.miniDrag = false);
  window.addEventListener('resize', () => G && resize());
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => UI.keys.delete(e.key));
  window.addEventListener('blur', () => UI.keys.clear());
  $('menuBtn').onclick = gameMenu;
  $('sndBtn').onclick = () => { sndInit(); SND.on = !SND.on; $('sndBtn').textContent = SND.on ? '🔊' : '🔇'; sndCrackle(0) };
}
function mark(x, y, c) { UI.marks.push({ x, y, c, t: performance.now() }); if (UI.marks.length > 8) UI.marks.shift() }
function rightClick(e) {
  if (UI.place || UI.target) { UI.place = null; UI.target = null; UI.sig = ''; return }
  const [x, y] = fromScreen(e.clientX, e.clientY), sel = selList();
  const us = sel.filter(u => u.e === 'u' && u.own === G.me), ids = us.map(u => u.id);
  const t = pickAt(e.clientX, e.clientY);
  if (!us.length) { // точка сбора у здания
    const b = sel.find(b => b.e === 'b' && b.own === G.me && b.T.trains);
    if (b) { issue({ c: 'rally', bid: b.id, x, y, tgt: t && t.arch === 'mine' ? t.id : 0 }); mark(x, y, '#ff7') }
    return;
  }
  const workers = us.filter(u => u.arch === 'worker'), others = us.filter(u => u.arch !== 'worker');
  if (t && t.e && t.own !== G.me && (hostile(G.me, t.own) || t.own === NEUTRAL && t.e === 'u' && false) && !t.inv) {
    issue({ c: 'attack', ids, tid: t.id }); mark(t.x, t.y, '#f55'); return;
  }
  if (t && t.arch === 'mine' && workers.length) {
    issue({ c: 'gather', ids: workers.map(u => u.id), mine: t.id }); mark(t.x, t.y, '#fd5');
    if (others.length) issue({ c: 'move', ids: others.map(u => u.id), x, y }); return;
  }
  if (t && t.e === 'b' && t.own === G.me && workers.length && (t.prog < 1 || t.hp < t.mhp || t.fire > 0)) {
    issue({ c: 'repair', ids: workers.map(u => u.id), tid: t.id }); mark(t.x, t.y, '#7cf'); if (others.length) issue({ c: 'move', ids: others.map(u => u.id), x, y }); return;
  }
  const tr = workers.length && treeAt(e.clientX, e.clientY);
  if (tr) { issue({ c: 'gather', ids: workers.map(u => u.id), tx: tr[0], ty: tr[1] }); mark(tr[0] + 0.5, tr[1] + 0.5, '#8d5'); if (others.length) issue({ c: 'move', ids: others.map(u => u.id), x, y }); return }
  issue({ c: 'move', ids, x, y }); mark(x, y, '#7f7');
}
function targetClick(e) {
  const [x, y] = fromScreen(e.clientX, e.clientY), T = UI.target, t = pickAt(e.clientX, e.clientY), ids = myUnits().map(u => u.id);
  if (T.k === 'amove') { if (t && t.own !== G.me && !t.inv) issue({ c: 'attack', ids, tid: t.id }); else issue({ c: 'amove', ids, x, y }); mark(x, y, '#f55') }
  else if (T.k === 'cast') { issue({ c: 'cast', ids, s: T.s, x, y }); mark(x, y, '#fc6') }
  else if (T.k === 'gspell') { issue({ c: 'gspell', s: T.s, x, y }) }
  else if (T.k === 'torch') { if (t && t.e === 'b' && hostile(G.me, t.own) && !t.inv) { issue({ c: 'torch', ids, tid: t.id }); mark(t.x, t.y, '#f93') } else { onNote({ text: 'Укажите чужую постройку' }); return } }
  if (!e.shiftKey) UI.target = null; UI.sig = '';
}
function tryPlace(shift) {
  const [tx, ty] = UI.placeAt || [0, 0], ws = myUnits().filter(u => u.arch === 'worker');
  if (!ws.length) { UI.place = null; return }
  const T = BST[me().race][UI.place];
  let ok = canPlace(T.s, tx, ty); for (let y = ty; y < ty + T.s; y++) for (let x = tx; x < tx + T.s; x++) if (inMap(x, y) && !me().exp[tIdx(x, y)]) ok = false;
  if (!ok) { onNote({ text: 'Здесь строить нельзя' }); return }
  // строит ближайший работник (с Shift — все выбранные)
  const w = shift ? ws : [ws.sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0]];
  issue({ c: 'build', ids: w.map(u => u.id), b: UI.place, tx, ty });
  if (!shift) UI.place = null; UI.sig = '';
}

// ---------- клавиатура ----------
function onKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  UI.keys.add(e.key);
  if (!G || !$('game').classList.contains('on')) return;
  if (e.key === 'F10' || (e.key === 'Escape' && !UI.place && !UI.target && !UI.menu && !UI.sel.size)) { e.preventDefault(); if ($('ov').className === 'off') gameMenu(); else closeOv(); return }
  if ($('ov').className !== 'off') return;
  if (e.key === 'Escape') { UI.place = null; UI.target = null; UI.menu = null; UI.sig = ''; if (!UI.place) UI.sel.clear(); return }
  if (e.key === ' ') { e.preventDefault(); if (UI.lastAlert) centerOn(UI.lastAlert[0], UI.lastAlert[1]); return }
  if (/^[0-9]$/.test(e.key)) {
    const n = e.key;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); UI.groups[n] = [...UI.sel]; onNote({ text: `Отряд ${n} запомнен` }) }
    else if (UI.groups[n]) {
      const ids = UI.groups[n].filter(id => ents.get(id)); const now = performance.now();
      if (UI.lastGrp === n && now - UI.lastGrpT < 400 && ids.length) { const u = ents.get(ids[0]); centerOn(u.x, u.y) }
      UI.sel = new Set(ids); UI.lastGrp = n; UI.lastGrpT = now; UI.sig = ''; UI.menu = null;
    }
    return;
  }
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const map = { 'Ф': 'A', 'Ы': 'S', 'И': 'B', 'Й': 'Q', 'Ц': 'W', 'У': 'E', 'К': 'R', 'Е': 'T', 'А': 'F', 'П': 'G', 'Р': 'H', 'Л': 'K', 'Щ': 'O', 'В': 'D', 'Ч': 'X', 'Я': 'Z', 'С': 'C', 'М': 'V' };
  const key = map[k] || k;
  const b = (UI.cmds || []).find(c => c.key === key && !c.dis);
  if (b) { e.preventDefault(); b.act() }
}

// ---------- кнопки команд ----------
function uImg(race, arch, f) { return arch === 'hermit' ? 'img/hermit_f.png' : arch === 'dragon' ? 'img/dragon_f.png' : `img/u_${race}_${arch}_${f || 'f'}.png` }
function bImg(b) { return 'img/' + bSprite(b) + '.png' }
const costTxt = (g, w) => [g ? `🪙${g}` : '', w ? `🪵${w}` : ''].filter(Boolean).join(' ');
function cmdsFor() {
  const sel = selList(), p = me(), out = [];
  if (!sel.length || G.over) return out;
  const own = sel.filter(e => e.own === G.me);
  const us = own.filter(e => e.e === 'u');
  if (UI.menu === 'build') {
    for (const a of BARCH) {
      const T = BST[p.race][a], ok = reqOk(p, T.req);
      out.push({ img: `img/b_${p.race}_${a}.png`, key: T.key, name: T.name, cost: costTxt(T.g, T.w), dis: !ok || p.gold < T.g || p.wood < T.w,
        tip: (ok ? '' : `Нужно: ${BNAMES[p.race][T.req]}. `) + bTip(p.race, a), act: () => { if (!ok) return onNote({ text: 'Сначала нужно: ' + BNAMES[p.race][T.req] }); UI.place = a; UI.sig = '' } });
    }
    out.push({ ic: '↩', key: 'Escape', name: 'Назад', act: () => { UI.menu = null; UI.sig = '' } });
    return out;
  }
  if (us.length) {
    const ids = us.map(u => u.id);
    out.push({ ic: '⚔', key: 'A', name: 'Атаковать', tip: 'Идти к точке, вступая в бой по пути (или атаковать указанную цель)', act: () => { UI.target = { k: 'amove' }; UI.sig = '' }, on: UI.target && UI.target.k === 'amove' });
    out.push({ ic: '✋', key: 'S', name: 'Стоп', act: () => issue({ c: 'stop', ids }) });
    if (us.some(u => u.arch === 'worker')) out.push({ ic: '🔨', key: 'B', name: 'Строить', tip: 'Меню построек', act: () => { UI.menu = 'build'; UI.sig = '' } });
    const torchers = us.filter(u => u.T.torch || u.arch === 'worker');
    if (torchers.length) { const cd = Math.min(...torchers.map(u => u.abCd || 0)); out.push({ ic: '🔥', key: 'G', name: 'Поджечь', tip: SPELLS.torch.txt + '. Деревянные постройки русичей и юрты монголов горят быстро, тевтонский камень — плохо.', cd: cd / SPELLS.torch.cd, act: () => { UI.target = { k: 'torch' }; UI.sig = '' } }) }
    const mage = us.find(u => u.T.spell);
    if (mage) { const S = SPELLS[mage.T.spell]; out.push({ img: uImg(mage.race, 'mage', 'a'), key: 'F', name: S.name, cost: `💧${S.mana} маны`, tip: S.txt, dis: !us.some(u => u.T.spell && u.mana >= S.mana), act: () => { UI.target = { k: 'cast', s: mage.T.spell, r: S.r }; UI.sig = '' } }) }
    const hero = us.find(u => u.T.ability);
    if (hero) { const S = SPELLS.smash; out.push({ img: uImg(hero.race, 'hero', 'a'), key: hero.T.spell ? 'H' : 'F', name: S.name, tip: S.txt, cd: hero.abCd / S.cd, dis: hero.abCd > 0, act: () => issue({ c: 'cast', ids: [hero.id], s: 'smash' }) }) }
    return out;
  }
  const b = own.length === 1 && own[0].e === 'b' ? own[0] : null;
  if (b) {
    if (b.prog < 1) { out.push({ ic: '✖', key: 'Escape', name: 'Отменить стройку', tip: 'Вернётся 75% цены', act: () => issue({ c: 'cancel', bid: b.id }) }); return out }
    for (const a of b.T.trains || []) {
      const T = UST[p.race][a];
      out.push({ img: uImg(p.race, a), key: T.key, name: T.name, cost: costTxt(T.g, T.w) + ` 👥${popOf(T)}`, tip: uTip(p.race, a), dis: p.gold < T.g || p.wood < T.w, act: () => issue({ c: 'train', bid: b.id, u: a }) });
    }
    for (const r in UPS) if (UPS[r].at === b.arch) {
      const U = UPS[r]; if (p.up[r] || (U.req && !p.up[U.req])) continue;
      const busy = G.blds.some(x => x.own === G.me && x.q.some(q => q.r === r));
      out.push({ ic: r === 'fire' ? '🏹' : r.startsWith('atk') ? '🗡' : r.startsWith('arm') ? '🛡' : r === 'axes' ? '🪓' : r === 'buckets' ? '🪣' : '🎯', key: U.key, name: U.name, cost: costTxt(U.g, U.w), tip: U.txt, dis: busy || p.gold < U.g || p.wood < U.w, act: () => issue({ c: 'research', bid: b.id, r }) });
    }
    if (b.q.length) out.push({ ic: '✖', key: 'Escape', name: 'Отменить', tip: 'Убрать последнее из очереди', act: () => issue({ c: 'cancel', bid: b.id }) });
    return out;
  }
  // скит отшельника
  const h = sel.length === 1 && sel[0].arch === 'hut' ? sel[0] : null;
  if (h) {
    for (const s of h.spells || []) {
      const S = HSPELLS[s], has = p.hs[s] !== undefined;
      out.push({ ic: S.icon, key: s === h.spells[0] ? 'Q' : 'W', name: (has ? '✓ ' : 'Выучить: ') + S.name, cost: has ? '' : costTxt(S.g, 0), tip: S.txt + '. Подведите к скиту своего воина или работника.', dis: has || p.gold < S.g, act: () => issue({ c: 'hut', hid: h.id, opt: s }) });
    }
    const he = ents.get(h.hermit);
    if (h.hermit) out.push({ img: 'img/hermit_f.png', key: 'E', name: 'Нанять отшельника', cost: costTxt(HERMIT_HIRE, 0), tip: 'Старец бьёт врагов молниями. Нужен свой юнит рядом со скитом.', dis: p.gold < HERMIT_HIRE, act: () => issue({ c: 'hut', hid: h.id, opt: 'hire' }) });
  }
  return out;
}
function uTip(race, a) {
  const T = UST[race][a];
  return `HP ${T.hp}, урон ${T.dmg}${T.magic ? ' (магия)' : ''}, броня ${T.arm + RACES[race].armor}, дальность ${T.rng >= 2 ? T.rng : 'вплотную'}, скорость ${T.spd.toFixed(1)}` +
    (T.vsCav ? '. Втрое сильнее против конницы' : '') + (T.siege ? '. Крушит постройки, бьёт по площади, поджигает' : '') + (T.spell ? '. ' + SPELLS[T.spell].name + ': ' + SPELLS[T.spell].txt : '') +
    (T.ability ? '. ' + SPELLS.smash.name : '') + (T.torch ? '. Умеет поджигать постройки' : '') + (a === 'hero' ? '. Один на игрока, нужен храм' : '') + (a === 'cav' ? '. Нужна кузница' : '');
}
function bTip(race, a) {
  const T = BST[race][a];
  return `HP ${T.hp}, строится ${Math.round(T.time)} с` + (T.pop ? `, жильё +${T.pop}` : '') + (T.trains ? '. Обучает: ' + T.trains.map(u => UST[race][u].name).join(', ') : '') + (T.atk ? '. Стреляет по врагам' : '') + (a === 'smith' ? '. Улучшения оружия и брони' : '');
}
function renderCmds() {
  const list = cmdsFor(); UI.cmds = list;
  const sig = JSON.stringify(list.map(c => [c.name, c.dis, c.on, c.cost, Math.round((c.cd || 0) * 20)])) + (UI.target ? UI.target.k : '');
  if (sig === UI.sig) return; UI.sig = sig;
  const box = $('cmds'); box.innerHTML = '';
  list.forEach(c => {
    const d = document.createElement('div'); d.className = 'cb' + (c.dis ? ' dis' : '') + (UI.target && c.on ? ' act' : '');
    d.innerHTML = (c.img ? `<img src="${c.img}">` : `<span class="ic">${c.ic}</span>`) + `<span class="k">${c.key === 'Escape' ? 'Esc' : c.key}</span>` + (c.cd > 0 ? `<span class="cdv" style="height:${Math.round(c.cd * 100)}%"></span>` : '');
    d.onmousedown = e => { e.stopPropagation(); sndInit(); if (!c.dis) c.act(); else if (c.act && c.tip) onNote({ text: 'Недоступно: ' + (c.cost ? 'не хватает ресурсов' : c.name) }) };
    d.onmouseenter = () => showTip(d, `<b>${esc(c.name)}</b>${c.cost ? ` <span class="c">${c.cost}</span>` : ''}${c.tip ? `<br>${esc(c.tip)}` : ''}<br><span class="c">Клавиша: ${c.key === 'Escape' ? 'Esc' : c.key}</span>`);
    d.onmouseleave = hideTip;
    box.appendChild(d);
  });
}
function showTip(el, html) { const t = $('tip'); t.innerHTML = html; t.style.display = 'block'; const r = el.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - 310, r.left) + 'px'; t.style.top = (r.top - t.offsetHeight - 8) + 'px' }
function hideTip() { $('tip').style.display = 'none' }

// ---------- панель сведений ----------
function renderInfo() {
  const sel = selList(), p = me();
  let html = '', sig = '';
  if (!sel.length) {
    sig = 'none' + p.alive;
    html = `<div><h3>${RACES[p.race].name}</h3><div class="st">${esc(RACES[p.race].about)}</div><div class="st" style="margin-top:6px">ЛКМ — выбрать, ПКМ — приказ, рамка — группа. Колесо — масштаб, стрелки/край экрана — обзор. Пробел — к последней тревоге.</div></div>`;
  } else if (sel.length === 1) {
    const e = sel[0];
    if (e.e === 'u') {
      const T = e.T, own = isPlayer(e.own) ? `<span style="color:${COLORS[e.own]}">${esc(G.players[e.own].name)}</span>` : e.own === NEUTRAL ? 'нейтральный' : 'чудовище';
      const st = [`❤ ${Math.ceil(e.hp)}/${e.mhp}`, `⚔ ${T.dmg}${T.magic ? '✦' : ''}`, `🛡 ${e.own < 3 ? armorOf(e) : T.arm}`, T.rng >= 2 ? `🎯 ${T.rng}` : ''].filter(Boolean).join(' · ');
      const ord = e.ord || (e.ordK ? { k: e.ordK } : null);
      const doing = e.inMine ? 'в руднике' : ord ? ({ move: 'идёт', amove: 'идёт в атаку', attack: 'в бою', gather: 'добывает', 'return': 'несёт добычу', build: 'строит', repair: 'чинит/тушит', torch: 'поджигает', cast: 'колдует' })[ord.k] || '' : e.dst === 'sleep' ? 'спит' : 'стоит';
      sig = [e.id, Math.ceil(e.hp), Math.floor(e.mana || 0), e.carry, doing, Math.ceil(e.abCd || 0)].join();
      html = `<div class="por"><img src="${uImg(e.race, e.arch)}"></div><div><h3>${esc(T.name)}</h3><div class="st">${own} · ${doing}</div><div class="bar"><b style="width:${e.hp / e.mhp * 100}%"></b></div><div class="st">${st}</div>` +
        (T.mana ? `<div class="st">💧 мана ${Math.floor(e.mana)}/${T.mana}</div>` : '') + (e.carry ? `<div class="st">Несёт: ${e.carry} ${e.ctype === 'g' ? 'золота' : 'дерева'}</div>` : '') +
        (e.arch === 'dragon' ? `<div class="st">Убивший дракона получит ${DRAGON.bounty} золота. Летящего бьют только стрелки, маги, вышки и герои.</div>` : '') +
        (e.arch === 'hermit' && e.own === NEUTRAL ? '<div class="st">Мирный старец. Нанять или выучить заклинание — в его скиту.</div>' : '') + '</div>';
    } else {
      const b = e, T = b.T;
      if (b.race === 'neu') {
        sig = [b.id, b.gold, b.hermit].join();
        html = `<div class="por"><img src="${bImg(b)}"></div><div><h3>${T.name}</h3>` +
          (b.arch === 'mine' ? `<div class="st">Осталось золота: ${b.gold}</div><div class="st">Работники: ПКМ по руднику.</div>` : '') +
          (b.arch === 'hut' ? `<div class="st">Отшельник учит заклинаниям за золото и может пойти к вам на службу. Подведите сюда своего юнита.</div>` : '') +
          (b.arch === 'lair' ? `<div class="st">Здесь спит дракон. Подойдёте близко — проснётся. Со временем он и сам полетит жечь деревни.</div>` : '') + '</div>';
      } else {
        const own = `<span style="color:${COLORS[b.own]}">${esc(G.players[b.own].name)}</span>`;
        const fire = b.fire > 0 ? `<div class="st" style="color:#ffa45a">🔥 Горит! ${b.own === G.me ? 'Пошлите работников тушить (ПКМ по зданию).' : ''}</div>` : '';
        sig = [b.id, Math.ceil(b.hp), Math.round(b.prog * 100), Math.round(b.fire * 20), b.q.map(q => q.u + q.r + Math.round(q.t / q.tt * 30)).join()].join();
        let q = '';
        if (b.own === G.me && b.q.length) q = '<div class="queue">' + b.q.map((x, i) => `<div class="qi">${x.u ? `<img src="${uImg(p.race, x.u)}">` : '📜'}<span class="p" style="width:${i ? 0 : Math.min(100, x.t / x.tt * 100)}%"></span></div>`).join('') + '</div>';
        html = `<div class="por"><img src="${bImg(b)}"></div><div><h3>${esc(T.name)}</h3><div class="st">${own}${b.prog < 1 ? ` · стройка ${Math.floor(b.prog * 100)}%` : ''}</div><div class="bar"><b style="width:${b.hp / b.mhp * 100}%;background:${b.fire > 0 ? '#e0602c' : '#4caf50'}"></b></div><div class="st">❤ ${Math.ceil(b.hp)}/${b.mhp} · горючесть ${Math.round(T.flam * 100)}%${T.pop ? ` · жильё +${T.pop}` : ''}</div>${fire}${q}</div>`;
      }
    }
  } else {
    sig = sel.map(e => e.id + ':' + Math.ceil(e.hp / e.mhp * 10)).join();
    html = '<div class="multi">' + sel.slice(0, 36).map(e => `<div class="mu" data-id="${e.id}"><img src="${e.e === 'u' ? uImg(e.race, e.arch) : bImg(e)}"><i style="width:${e.hp / e.mhp * 38}px;background:${e.hp / e.mhp > 0.5 ? '#4caf50' : '#e04030'}"></i></div>`).join('') + '</div>';
  }
  if (sig === UI.infoSig) return; UI.infoSig = sig;
  $('info').innerHTML = html;
  $('info').querySelectorAll('.mu').forEach(d => d.onmousedown = e => { const id = +d.dataset.id; if (e.shiftKey) UI.sel.delete(id); else { UI.sel = new Set([id]) } UI.sig = '' });
}
let topT = 0;
function uiTick(dt) {
  if (!G) return;
  for (const id of [...UI.sel]) if (!ents.get(id)) UI.sel.delete(id);
  renderCmds(); renderInfo();
  if ((topT -= dt) <= 0) {
    topT = 0.2; const p = me();
    $('rG').textContent = Math.floor(p.gold); $('rW').textContent = Math.floor(p.wood);
    $('rP').textContent = `${p.pop}/${p.cap}`; $('rP').style.color = p.pop >= p.cap ? '#ff8a7a' : '';
    const t = Math.floor(G.t); $('clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    // заклинания отшельников
    const hs = Object.keys(p.hs || {}), box = $('hspells');
    const sig = hs.map(s => s + Math.ceil(Math.max(0, p.hs[s] - G.t))).join() + (UI.target && UI.target.k === 'gspell' ? UI.target.s : '');
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig; box.innerHTML = '';
      hs.forEach((s, i) => {
        const S = HSPELLS[s], cd = Math.max(0, p.hs[s] - G.t), d = document.createElement('button');
        d.className = 'hs' + (UI.target && UI.target.s === s ? ' on' : ''); d.innerHTML = S.icon + (cd > 0 ? `<span class="cdv" style="height:${cd / S.cd * 100}%"></span>` : '');
        d.onmouseenter = () => showTip(d, `<b>${S.name}</b> <span class="c">(F${i + 1})</span><br>${S.txt}${cd > 0 ? `<br><span class="c">Через ${Math.ceil(cd)} с</span>` : ''}`); d.onmouseleave = hideTip;
        d.onclick = () => { if (cd <= 0) { UI.target = { k: 'gspell', s, r: S.r }; UI.sig = '' } };
        box.appendChild(d);
      });
    }
    // треск огня — по числу видимых очагов
    if ((crackT -= 0.2) <= 0) { crackT = 0.6; let n = 0; const [x0, y0, x1, y1] = viewTiles(); for (const b of G.blds) if (b.fire > 0 && b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1 && p.vis[tIdx(Math.floor(b.x), Math.floor(b.y))]) n += 2; for (const i of G.burning) { const x = i % MAPN, y = (i / MAPN) | 0; if (x > x0 && x < x1 && y > y0 && y < y1 && p.vis[i]) n++ } sndCrackle(n) }
    if (G.over && !overShown) { overShown = true; setTimeout(showOver, 1500) }
  }
  // курсор
  const c = $('cv'); c.style.cursor = UI.place ? 'copy' : UI.target ? 'crosshair' : 'default';
  // сообщения гаснут
  for (const d of $('notes').children) if (performance.now() - d.t0 > 6000) d.style.opacity = 0;
  while ($('notes').children.length && performance.now() - $('notes').firstChild.t0 > 7000) $('notes').firstChild.remove();
}
function onNote(n) {
  const d = document.createElement('div'); d.textContent = n.text; d.className = n.kind || ''; d.t0 = performance.now();
  $('notes').appendChild(d); while ($('notes').children.length > 5) $('notes').firstChild.remove();
  if (n.x !== undefined && (n.kind === 'alarm' || n.kind === 'fire' || n.kind === 'big')) { UI.lastAlert = [n.x, n.y]; UI.pings.push({ x: n.x, y: n.y, t: performance.now(), c: n.kind === 'fire' ? '#ff9a30' : '#ff4040' }); if (UI.pings.length > 6) UI.pings.shift() }
  if (n.kind === 'alarm' || n.kind === 'fire') play('alarm');
}
window.addEventListener('keydown', e => { // F1..F4 — заклинания отшельников
  if (!G || !/^F[1-4]$/.test(e.key)) return; e.preventDefault();
  const s = Object.keys(me().hs || {})[+e.key[1] - 1]; if (s && me().hs[s] <= G.t) { UI.target = { k: 'gspell', s, r: HSPELLS[s].r }; UI.sig = '' }
});

// ---------- меню ----------
function ov(html, dim) { $('ovBox').innerHTML = html; $('ov').className = dim ? 'dim' : '' }
function closeOv() { $('ov').className = 'off'; UI.paused = false }
function showMsg(t, toMenu) { ov(`<h2>Сеча</h2><p>${esc(t)}</p><button class="mb pri" onclick="${toMenu ? 'toMenu()' : 'mainMenu()'}">Понятно</button>`) }
function toMenu() { netClose(); G = null; $('game').classList.remove('on'); mainMenu() }
function mainMenu() {
  ov(`<h1>Сеча: Три знамени</h1><div class="sub">Стратегия о деревянных крепостях, пожарах, отшельниках и драконе</div>
    <button class="mb pri" onclick="soloMenu()">Одиночная игра</button>
    <button class="mb" onclick="netMenu()">Игра по сети (2–3 игрока)</button>
    <button class="mb" onclick="helpMenu()">Как играть</button>
    ${IS_APP ? '' : '<button class="mb" onclick="downloadMenu()">Скачать для ПК</button>'}
    <div class="mut" style="text-align:center;margin-top:10px">Для компьютера с мышью и клавиатурой</div>`);
}
// настольная версия (Electron) — та же игра, кнопка скачивания в ней не нужна
const IS_APP = /Electron/.test(navigator.userAgent);
const DL = 'https://github.com/volik1987/secha/releases/latest/download/';
function downloadMenu() {
  const mac = /Mac/.test(navigator.platform), win = /Win/.test(navigator.platform);
  ov(`<h2>Скачать для ПК</h2><p class="mut">Та же игра в отдельном окне: работает без браузера, одиночная игра — и без интернета. Для игры по сети интернет нужен, и с браузерной версией можно играть вместе.</p>
    <a class="mb ${win ? 'pri' : ''}" style="text-align:center;text-decoration:none;color:var(--txt)" href="${DL}Secha-windows.exe">Windows 10/11 (x64) — 121 МБ</a>
    <a class="mb ${mac ? 'pri' : ''}" style="text-align:center;text-decoration:none;color:var(--txt)" href="${DL}Secha-mac-arm64.dmg">macOS, Apple M1–M4 — 132 МБ</a>
    <a class="mb" style="text-align:center;text-decoration:none;color:var(--txt)" href="${DL}Secha-mac-x64.dmg">macOS, Intel — 137 МБ</a>
    <p class="mut"><b>Windows:</b> программа без установки — просто запустите. Если появится «Windows защитила компьютер», нажмите «Подробнее» → «Выполнить в любом случае».<br>
    <b>Mac:</b> откройте .dmg и перетащите «Secha» в Программы. Если при первом запуске macOS не даёт открыть — правый клик по приложению → «Открыть» (или Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть»).</p>
    <button class="mb" onclick="mainMenu()">Назад</button>`);
}
const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('secha-' + k)); localStorage.setItem('secha-' + k, JSON.stringify(v)) } catch (e) { } };
const raceSel = (id, v, on) => `<select id="${id}" ${on ? `onchange="${on}"` : ''}>${Object.keys(RACES).map(r => `<option value="${r}" ${r === v ? 'selected' : ''}>${RACES[r].name}</option>`).join('')}</select>`;
const diffSel = (id, v) => `<select id="${id}">${Object.keys(DIFF).map(d => `<option value="${d}" ${d === v ? 'selected' : ''}>${DIFF[d].name}</option>`).join('')}</select>`;
function racesHtml() { return '<div class="races">' + Object.keys(RACES).map(r => `<div class="race"><b>${RACES[r].name}</b><br>${esc(RACES[r].about)}</div>`).join('') + '</div>' }
function soloMenu() {
  const o = LS('solo') || { r0: 'rus', r1: 'mon', r2: 'teu', k2: 'ai', d1: 'normal', d2: 'normal' };
  ov(`<h2>Одиночная игра</h2>${racesHtml()}
    <div class="row"><span class="sw" style="background:${COLORS[0]}"></span><span class="nm">Вы</span>${raceSel('r0', o.r0)}</div>
    <div class="row"><span class="sw" style="background:${COLORS[1]}"></span><span class="nm">Компьютер</span>${raceSel('r1', o.r1)} ${diffSel('d1', o.d1)}</div>
    <div class="row"><span class="sw" style="background:${COLORS[2]}"></span><select id="k2" class="nm"><option value="ai" ${o.k2 === 'ai' ? 'selected' : ''}>Компьютер</option><option value="closed" ${o.k2 === 'closed' ? 'selected' : ''}>Нет</option></select>${raceSel('r2', o.r2)} ${diffSel('d2', o.d2)}</div>
    <div class="mut">Каждый сам за себя. Победит тот, кто последним останется на карте.</div>
    <button class="mb pri" onclick="soloGo()">В бой!</button><button class="mb" onclick="mainMenu()">Назад</button>`);
}
function soloGo() {
  const v = id => $(id).value, o = { r0: v('r0'), r1: v('r1'), r2: v('r2'), k2: v('k2'), d1: v('d1'), d2: v('d2') }; LS('solo', o);
  const nm = LS('name') || 'Вы';
  startGame({ seed: (Math.random() * 1e9) | 0, me: 0, slots: [{ kind: 'human', race: o.r0, name: nm }, { kind: 'ai', race: o.r1, diff: o.d1, name: 'Компьютер 1' }, { kind: o.k2, race: o.r2, diff: o.d2, name: 'Компьютер 2' }] });
}
function netMenu() {
  const nm = LS('name') || '';
  ov(`<h2>Игра по сети</h2><p class="mut">Один игрок создаёт комнату и называет код остальным. Нужен интернет; соединение напрямую между браузерами (WebRTC).</p>
    <div class="row"><span class="nm">Ваше имя</span><input id="nm" maxlength="16" value="${esc(nm)}" placeholder="Князь"></div>
    <button class="mb pri" onclick="hostGo()">Создать комнату</button>
    <div class="row"><span class="nm">Код комнаты</span><input id="code" maxlength="5" style="text-transform:uppercase;width:120px" onkeydown="if(event.key==='Enter')joinGo()"><button class="tb mb" style="width:auto;margin:0" onclick="joinGo()">Войти</button></div>
    <button class="mb" onclick="mainMenu()">Назад</button>`);
}
const myName = () => { const v = ($('nm') && $('nm').value.trim()) || LS('name') || 'Игрок'; LS('name', v); return v };
async function hostGo() {
  const nm = myName(); ov('<h2>Создаём комнату…</h2>');
  try { await netHost([{ kind: 'human', race: (LS('solo') || {}).r0 || 'rus', name: nm }, { kind: 'open' }, { kind: 'open' }]) }
  catch (e) { netClose(); return showMsg(e && e.type === 'net' || e && e.message === 'net' ? 'Нет интернета: для сетевой игры он нужен.' : netErr(e)) }
  renderLobby();
}
async function joinGo() {
  const code = ($('code').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 4) return $('code').focus();
  const nm = myName(); ov(`<h2>Подключаемся к ${code}…</h2><button class="mb" onclick="netClose();netMenu()">Отмена</button>`);
  try { await netJoin(code, nm) } catch (e) { netClose(); return showMsg(e && e.type === 'timeout' ? 'Не удалось соединиться за 20 секунд. Проверьте код и интернет; строгие офисные сети иногда не пропускают соединение.' : netErr(e)) }
  ov('<h2>Подключено</h2><p class="mut">Ждём список игроков…</p>');
}
function renderLobby() {
  if (!NET.slots || NET.started) return;
  const host = NET.role === 'host', S = NET.slots;
  const rows = S.map((s, i) => {
    let who, ctl = '';
    if (s.kind === 'human' || s.kind === 'net') {
      who = esc(s.name || 'Игрок') + (i === (host ? 0 : NET.me) ? ' (вы)' : '');
      ctl = (host && i === 0) || (!host && i === NET.me) ? raceSel('lr' + i, s.race, `lobbyRace(${i})`) : `<b>${RACES[s.race].name}</b>`;
    } else if (host) {
      who = `<select onchange="lobbyKind(${i},this.value)"><option value="open" ${s.kind === 'open' ? 'selected' : ''}>Ждём игрока</option><option value="ai" ${s.kind === 'ai' ? 'selected' : ''}>Компьютер</option><option value="closed" ${s.kind === 'closed' ? 'selected' : ''}>Нет</option></select>`;
      if (s.kind === 'ai') ctl = raceSel('lr' + i, s.race, `lobbyRace(${i})`) + ' ' + diffSel('ld' + i, s.diff || 'normal').replace('<select', `<select onchange="lobbyDiff(${i})"`);
    } else who = s.kind === 'open' ? '<span class="mut">Ждём игрока…</span>' : s.kind === 'ai' ? `Компьютер (${RACES[s.race].name})` : '<span class="mut">—</span>';
    return `<div class="row"><span class="sw" style="background:${COLORS[i]}"></span><span class="nm">${who}</span>${ctl}</div>`;
  }).join('');
  const n = S.filter(s => s.kind !== 'open' && s.kind !== 'closed').length;
  ov(`<h2>Комната</h2>${host ? `<div class="mut">Код для друзей:</div><div class="code">${NET.code}</div>` : `<div class="mut">Комната ${NET.code}. Партию начинает создатель.</div>`}
    ${rows}
    ${host ? `<button class="mb pri" ${n < 2 ? 'disabled' : ''} onclick="lobbyStart()">Начать (${n} уч.)</button>` : ''}
    <button class="mb" onclick="netClose();netMenu()">Выйти</button>`);
}
function lobbyRace(i) { const r = $('lr' + i).value; if (NET.role === 'host') { NET.slots[i].race = r; lobbyBroadcast() } else send(NET.conn, { t: 'race', race: r }) }
function lobbyKind(i, k) { NET.slots[i] = k === 'ai' ? { kind: 'ai', race: ['rus', 'mon', 'teu'][i], diff: 'normal', name: 'Компьютер ' + i } : { kind: k }; lobbyBroadcast() }
function lobbyDiff(i) { NET.slots[i].diff = $('ld' + i).value; lobbyBroadcast() }
function lobbyStart() {
  const slots = NET.slots.map(s => s.kind === 'open' ? { kind: 'closed' } : Object.assign({}, s));
  const cfg = { seed: (Math.random() * 1e9) | 0, slots, me: 0 };
  netStartHost(cfg); startGame(cfg, false);
}
function helpMenu() {
  ov(`<h2>Как играть</h2><div class="help">
    <p><b>Цель:</b> уничтожить все постройки и войска соперников.</p>
    <p><b>Хозяйство.</b> Работники рубят лес (ПКМ по дереву) и копают золото (ПКМ по руднику), несут добычу в главное здание. Жильё (изба, юрта, дом) увеличивает население.</p>
    <p><b>Пожары.</b> Здания русичей деревянные, юрты монголов — войлочные: они вспыхивают от огненных стрел (улучшение в стрельне), снарядов камнемётов, магии, дракона и факелов пехоты (кнопка <kbd>G</kbd>). Сильно повреждённое здание может загореться само. Огонь перекидывается на соседние постройки и лес! Тушат работники: ПКМ по горящему зданию. Тевтонский камень горит плохо.</p>
    <p><b>Отшельники</b> живут в скитах. Подведите к скиту любого своего юнита, выберите скит — и купите заклинание (оно появится на верхней панели, клавиши <kbd>F1</kbd>–<kbd>F4</kbd>) или наймите самого старца. Ударите отшельника — он ответит молнией.</p>
    <p><b>Дракон</b> спит в логове в центре карты. Подойдёте близко — проснётся. Со временем он сам летает жечь деревни. Летящего дракона бьют только стрелки, маги, вышки и герои. За его голову — ${DRAGON.bounty} золота.</p>
    <p><b>Управление:</b> ЛКМ — выбрать, рамка — группа, двойной клик — все такие же на экране. ПКМ — идти / атаковать / добывать / чинить. <kbd>A</kbd> — атака с ходу, <kbd>S</kbd> — стоп, <kbd>B</kbd> — строить, <kbd>F</kbd> — заклинание мага или удар героя. <kbd>Ctrl</kbd>+цифра — запомнить отряд, цифра — выбрать. Колесо — масштаб, стрелки, край экрана или средняя кнопка — обзор. <kbd>Пробел</kbd> — к месту тревоги. <kbd>Shift</kbd> при постройке — строить всеми выбранными.</p>
    </div><button class="mb pri" onclick="mainMenu()">Понятно</button>`);
}
function gameMenu() {
  if (!G) return;
  if (!NET.role) UI.paused = true;
  ov(`<h2>Меню</h2>${NET.role ? '<p class="mut">Сетевая игра не ставится на паузу.</p>' : '<p class="mut">Пауза.</p>'}
    <button class="mb pri" onclick="closeOv()">Продолжить</button>
    <button class="mb" onclick="helpMenu2()">Как играть</button>
    ${G.over ? '' : '<button class="mb" onclick="surrender()">Сдаться</button>'}
    <button class="mb" onclick="toMenu()">Выйти в главное меню</button>`, true);
}
function helpMenu2() { helpMenu(); $('ovBox').querySelector('.mb.pri').setAttribute('onclick', 'gameMenu()'); $('ov').className = 'dim' }
function surrender() {
  closeOv();
  if (isGuest()) { netClose(); G.over = true; showOver(); return }
  const p = me(); for (const u of G.units) if (u.own === G.me) kill(u); for (const b of G.blds) if (b.own === G.me) destroyBld(b);
}
function showOver() {
  const w = G.winner, win = w === G.me, rows = G.players.filter(p => p.kind !== 'closed').map(p => `<tr><td><span style="color:${p.color}">■</span> ${esc(p.name)}</td><td>${RACES[p.race].name}</td><td>${p.stats.kills}</td><td>${p.stats.lost}</td><td>${p.stats.burned}</td></tr>`).join('');
  ov(`<h1>${win ? 'Победа!' : w >= 0 ? 'Поражение' : 'Конец игры'}</h1><div class="sub">${w >= 0 ? `Победитель: ${esc(G.players[w].name)} (${RACES[G.players[w].race].name})` : ''}</div>
    <table class="st"><tr><th>Игрок</th><th>Народ</th><th>Убито</th><th>Потеряно</th><th>Сгорело зданий</th></tr>${rows}</table>
    <button class="mb pri" onclick="toMenu()">В главное меню</button><button class="mb" onclick="closeOv()">Посмотреть карту</button>`, true);
}

// ---------- старт ----------
window.addEventListener('load', () => {
  const names = allImageNames(); let n = 0;
  loadImages(names, () => {
    $('load').remove(); initRender($('cv')); setupInput(); mainMenu(); requestAnimationFrame(frame);
    if (location.hash === '#test') window.TEST = true;
  });
  const t = setInterval(() => { const k = Object.values(IMG).filter(i => i.complete).length; const el = $('loadP'); if (el) el.textContent = Math.round(k / names.length * 100) + '%'; else clearInterval(t) }, 150);
});
