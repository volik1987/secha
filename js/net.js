'use strict';
// ---------- Игра по сети: PeerJS (WebRTC), звезда вокруг создателя комнаты ----------
// Создатель (host) считает всю игру и раз в 0,1 с шлёт каждому гостю снимок того, что тот видит.
// Гости шлют только приказы.
const NET = { role: null, peer: null, conns: [], conn: null, code: '', slots: null, me: 0, snapT: 0, snapDt: 0.1, lastSnap: 0, name: '' };
const PEER_PREFIX = 'secha-rts-';
function netLoad() {
  return window.Peer ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
    s.onload = ok; s.onerror = () => no(new Error('net')); document.head.appendChild(s);
  });
}
const netErr = e => ({ 'peer-unavailable': 'Комната не найдена — проверьте код.', 'network': 'Нет связи с сервером подключения.', 'server-error': 'Сервер подключения недоступен.', 'browser-incompatible': 'Этот браузер не умеет WebRTC.' }[e && e.type] || 'Не удалось подключиться' + (e && e.type ? ` (${e.type})` : '') + '.');
const send = (c, m) => { try { if (c && c.open) c.send(JSON.stringify(m)) } catch (e) { console.error('net', e) } };

// ---------- хозяин ----------
async function netHost(slots) {
  await netLoad();
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; NET.code = [...Array(5)].map(() => A[Math.random() * A.length | 0]).join('');
  NET.role = 'host'; NET.slots = slots; NET.conns = [];
  return new Promise((ok, no) => {
    const p = NET.peer = new Peer(PEER_PREFIX + NET.code.toLowerCase());
    p.on('open', () => ok(NET.code));
    p.on('error', e => { if (e.type === 'unavailable-id') { try { p.destroy() } catch (_) { } netHost(slots).then(ok, no) } else if (!NET.conns.length) no(e); else console.warn(e) });
    p.on('connection', c => {
      c.on('open', () => {
        const slot = NET.slots.findIndex((s, i) => i > 0 && s.kind === 'open');
        if (slot < 0 || (G && !G.over && NET.started)) { send(c, { t: 'full' }); setTimeout(() => c.close(), 300); return }
        const k = { conn: c, slot, name: 'Гость' }; NET.conns.push(k);
        NET.slots[slot] = { kind: 'net', race: ['mon', 'teu', 'rus'][slot % 3], name: 'Гость ' + slot };
        c.on('data', d => { try { hostMsg(k, JSON.parse(d)) } catch (e) { console.error(e) } });
        c.on('close', () => hostDrop(k)); c.on('error', () => hostDrop(k));
        lobbyBroadcast(); play('ready');
      });
    });
  });
}
function lobbyBroadcast() {
  for (const k of NET.conns) send(k.conn, { t: 'lobby', slots: NET.slots, you: k.slot, code: NET.code });
  if (typeof renderLobby === 'function') renderLobby();
}
function hostMsg(k, m) {
  if (m.t === 'hi') { k.name = (m.name || 'Гость').slice(0, 16); NET.slots[k.slot].name = k.name; lobbyBroadcast() }
  else if (m.t === 'race' && !NET.started && RACES[m.race]) { NET.slots[k.slot].race = m.race; lobbyBroadcast() }
  else if (m.t === 'cmd' && G && !G.over) { const c = m.c; c.p = k.slot; G.cmdq.push(c) }
  else if (m.t === 'chat') { note(-1, `${k.name}: ${String(m.text).slice(0, 120)}`); }
}
function hostDrop(k) {
  if (!NET.conns.includes(k)) return;
  NET.conns = NET.conns.filter(x => x !== k);
  if (NET.started && G && !G.over) {
    const p = G.players[k.slot]; if (p && p.alive) { p.kind = 'ai'; aiInit(p); note(-1, `${p.name} отключился — за него играет компьютер`) }
  } else if (NET.slots) { NET.slots[k.slot] = { kind: 'open' }; lobbyBroadcast() }
}
function netStartHost(cfg) {
  NET.started = true;
  for (const k of NET.conns) send(k.conn, { t: 'start', cfg: Object.assign({}, cfg, { me: k.slot }) });
}
// снимок для гостя
const r2 = v => Math.round(v * 100) / 100;
function netSnapshots() {
  if (NET.role !== 'host' || !NET.conns.length || !G) return;
  const ev = G.net; G.net = { pr: [], fx: [], sfx: [], notes: [] };
  const tr = Array.from(new Set(G.treeEv)).map(i => [i, M.tree[i], M.tfire[i] > 0 ? 1 : 0, M.block[i]]); G.treeEv = [];
  const prs = ev.pr.map(p => [p.k, r2(p.x0), r2(p.y0), r2(p.x1), r2(p.y1), r2(p.dur), r2(p.h), p.z0 || 0, p.own, p.fire ? 1 : 0]);
  const fxs = ev.fx.map(f => { const o = Object.assign({}, f); o.x = r2(o.x); o.y = r2(o.y); return o });
  const sfxs = ev.sfx.map(s => [s.k, r2(s.x), r2(s.y)]);
  const bl = G.blds.map(b => {
    const r = [b.id, b.race + '.' + b.arch, b.own, b.tx, b.ty, Math.ceil(b.hp), r2(b.prog), r2(b.fire)];
    return r;
  });
  for (const k of NET.conns) {
    const p = G.players[k.slot]; if (!p) continue;
    const us = [];
    for (const u of G.units) {
      if (u.own !== p.i && (u.inMine || !p.vis[tIdx(Math.floor(u.x), Math.floor(u.y))]) && !G.over) continue;
      us.push([u.id, u.race + '.' + u.arch, u.own, r2(u.x), r2(u.y), Math.ceil(u.hp), u.dir, u.atkT > 0 ? 1 : 0, u.moving, u.carry, u.ctype, Math.floor(u.mana), u.inMine > 0 ? 1 : 0, u.dst || '', Math.ceil(u.abCd), r2(u.anim), u.ord ? u.ord.k : '']);
    }
    // подробности своих построек: очередь, точка сбора; у рудников — золото, у скитов — заклинания
    const extra = {};
    for (const b of G.blds) {
      if (b.own === p.i) extra[b.id] = { q: b.q.map(q => [q.u || '', q.r || '', r2(q.t), q.tt]), rally: b.rally };
      else if (b.arch === 'mine') extra[b.id] = { gold: b.gold };
      else if (b.arch === 'hut') extra[b.id] = { spells: b.spells, hermit: b.hermit };
    }
    const pl = G.players.map(x => x.i === p.i ? { gold: Math.floor(x.gold), wood: Math.floor(x.wood), pop: x.pop, cap: x.cap, up: x.up, hs: x.hs, alive: x.alive, stats: x.stats } : { alive: x.alive, stats: x.stats });
    send(k.conn, { t: 's', tm: r2(G.t), pl, u: us, b: bl, ex: extra, tr, pr: prs, fx: fxs, sfx: sfxs, notes: ev.notes.filter(n => n.p === -1 || n.p === -2 || n.p === p.i), over: G.over, win: G.winner, vis: G.visions.filter(v => v.own === p.i) });
  }
}

// ---------- гость ----------
async function netJoin(code, name) {
  await netLoad();
  NET.role = 'guest'; NET.code = code;
  return new Promise((ok, no) => {
    const p = NET.peer = new Peer();
    const to = setTimeout(() => { if (!NET.conn || !NET.conn.open) no({ type: 'timeout' }) }, 20000);
    p.on('open', () => {
      const c = NET.conn = p.connect(PEER_PREFIX + code.toLowerCase(), { reliable: true });
      c.on('open', () => { clearTimeout(to); send(c, { t: 'hi', name }); ok() });
      c.on('data', d => { try { guestMsg(JSON.parse(d)) } catch (e) { console.error(e) } });
      c.on('close', guestDrop); c.on('error', guestDrop);
    });
    p.on('error', e => { clearTimeout(to); if (!NET.conn || !NET.conn.open) no(e); else guestDrop() });
  });
}
function guestMsg(m) {
  if (m.t === 'lobby') { NET.slots = m.slots; NET.me = m.you; if (typeof renderLobby === 'function') renderLobby() }
  else if (m.t === 'full') { showMsg('Комната заполнена или игра уже идёт.'); netClose() }
  else if (m.t === 'start') { NET.started = true; startGame(m.cfg, true) }
  else if (m.t === 's') applySnap(m);
}
function guestDrop() {
  if (NET.role !== 'guest') return;
  const wasPlaying = G && !G.over; netClose();
  if (wasPlaying) { G.over = true; showMsg('Связь с создателем комнаты потеряна.', true) } else showMsg('Соединение закрыто.');
}
function netClose() {
  try { NET.conn && NET.conn.close() } catch (e) { } for (const k of NET.conns) try { k.conn.close() } catch (e) { }
  try { NET.peer && NET.peer.destroy() } catch (e) { }
  Object.assign(NET, { role: null, peer: null, conns: [], conn: null, slots: null, started: false });
}
function netCmd(c) { send(NET.conn, { t: 'cmd', c }) }

// применить снимок у гостя
function applySnap(m) {
  if (!G) return;
  const now = performance.now() / 1000;
  NET.snapDt = Math.min(0.25, Math.max(0.05, now - (NET.lastSnap || now - 0.1))); NET.lastSnap = now; NET.snapT = now;
  G.t = m.tm;
  m.pl.forEach((x, i) => Object.assign(G.players[i], x));
  // деревья
  for (const [i, t, f, bl] of m.tr) { M.tree[i] = t; M.tfire[i] = f ? 5 : 0; M.block[i] = bl; if (f) G.burning.add(i); else G.burning.delete(i) }
  // постройки
  const seenB = new Set();
  for (const r of m.b) {
    const [id, ra, own, tx, ty, hp, prog, fire] = r, [race, arch] = ra.split('.'); seenB.add(id);
    let b = ents.get(id);
    if (!b) {
      const T = race === 'neu' ? STRUCT[arch] : BST[race][arch];
      b = { id, e: 'b', own, race, arch, T, tx, ty, s: T.s, hp, mhp: race === 'neu' ? 1 : T.hp, prog, fire, q: [], x: tx + T.s / 2, y: ty + T.s / 2, inv: race === 'neu' ? 1 : 0 };
      ents.set(id, b); G.blds.push(b); setTiles(b, 4);
    }
    b.own = own; b.hp = hp; b.prog = prog; b.fire = fire;
    const ex = m.ex[id]; if (ex) { if (ex.q) { b.q = ex.q.map(([u, r, t, tt]) => ({ u: u || undefined, r: r || undefined, t, tt })); b.rally = ex.rally } if (ex.gold !== undefined) b.gold = ex.gold; if (ex.spells) { b.spells = ex.spells; b.hermit = ex.hermit } }
  }
  for (const b of G.blds) if (!seenB.has(b.id)) { b.dead = 1; ents.delete(b.id); setTiles(b, 0) }
  G.blds = G.blds.filter(b => !b.dead);
  // юниты
  const seenU = new Set();
  for (const r of m.u) {
    const [id, ra, own, x, y, hp, dir, atk, moving, carry, ctype, mana, inMine, dst, abCd, anim, ok] = r, [race, arch] = ra.split('.'); seenU.add(id);
    let u = ents.get(id);
    if (!u) { const T = UST[race][arch]; u = { id, e: 'u', own, race, arch, T, x, y, ox: x, oy: y, rx: x, ry: y, hp, mhp: T.hp, dir, anim: 0, atkT: 0, mana: 0 }; ents.set(id, u); G.units.push(u) }
    u.ox = u.rx !== undefined ? u.rx : u.x; u.oy = u.ry !== undefined ? u.ry : u.y;
    if (Math.hypot(u.ox - x, u.oy - y) > 3) { u.ox = x; u.oy = y }
    Object.assign(u, { own, x, y, hp, dir, atkT: atk ? 0.2 : 0, moving, carry, ctype, mana, inMine, dst: dst || undefined, abCd, anim, ordK: ok });
    if (arch === 'hermit') u.mhp = UST.neu.hermit.hp;
  }
  for (const u of G.units) if (!seenU.has(u.id)) { u.dead = 1; ents.delete(u.id) }
  G.units = G.units.filter(u => !u.dead);
  for (const s of UI.sel) if (!ents.get(s)) UI.sel.delete(s);
  // выстрелы, эффекты, звуки, сообщения
  for (const [k, x0, y0, x1, y1, dur, h, z0, own, fire] of m.pr) G.proj.push({ k, x0, y0, x1, y1, dur, h, z0, own, fire, t: 0 });
  for (const f of m.fx) { f.t = 0; G.fx.push(f) }
  for (const [k, x, y] of m.sfx) play(k, x, y);
  for (const n of m.notes) onNote(n);
  G.visions = (m.vis || []).map(v => Object.assign({}, v));
  if (m.over && !G.over) { G.over = true; G.winner = m.win; updateVision() }
  updateVision();
}
// у гостя снаряды и эффекты только летят и гаснут
function guestTick(dt) {
  for (const p of G.proj) p.t += dt; G.proj = G.proj.filter(p => p.t < p.dur);
  for (const f of G.fx) f.t += dt; G.fx = G.fx.filter(f => f.t < f.dur);
}
