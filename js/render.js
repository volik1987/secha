'use strict';
// ---------- Отрисовка: изометрия, огонь, туман войны ----------
const IMG = {}, DARK = {};
function loadImages(names, done) {
  let left = names.length;
  for (const n of names) {
    const im = new Image(); im.onload = im.onerror = () => { if (--left === 0) done() }; im.src = 'img/' + n; IMG[n.replace(/\.(png|jpg)$/, '')] = im;
  }
}
function allImageNames() {
  const a = ['g_grass.jpg', 'g_forest.jpg', 'g_dirt.jpg', 'g_water.jpg'];
  for (const r of ['rus', 'mon', 'teu']) {
    for (const b of BARCH) a.push(`b_${r}_${b}.png`);
    for (const u of UARCH) for (const f of ['f', 'b', 'a']) a.push(`u_${r}_${u}_${f}.png`);
    for (const f of ['cw', 'cb', 'cg']) a.push(`u_${r}_worker_${f}.png`);
  }
  for (const n of ['t_spruce', 't_birch', 't_oak', 't_pine', 't_stump', 't_burnt', 'mine', 'rocks', 'build_s', 'build_l', 'ruin_s', 'ruin_l', 'ruin_yurt', 'ruin_stone', 'logs', 'chest',
    'hermit_hut', 'hermit_f', 'hermit_b', 'hermit_a', 'lair', 'dragon_f', 'dragon_b', 'dragon_a', 'dragon_sleep', 'fire1', 'fire2', 'fire3', 'fire4', 'smoke', 'boom', 'bolt', 'heal']) a.push(n + '.png');
  return a;
}
// обугленная копия спрайта — проступает, пока здание горит
function darkOf(n) {
  if (DARK[n]) return DARK[n];
  const im = IMG[n]; if (!im || !im.width) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(22,14,8,0.82)'; x.fillRect(0, 0, c.width, c.height);
  return DARK[n] = c;
}

const CAM = { x: 0, y: 0, z: 1 };
let cv, ctx, W = 0, H = 0, DPR = 1, PAT = {};
const isoX = (x, y) => (x - y) * TW / 2, isoY = (x, y) => (x + y) * TH / 2;
function toScreen(x, y) { return [(isoX(x, y) - CAM.x) * CAM.z + W / 2, (isoY(x, y) - CAM.y) * CAM.z + H / 2] }
function fromScreen(sx, sy) {
  const ix = (sx - W / 2) / CAM.z + CAM.x, iy = (sy - H / 2) / CAM.z + CAM.y;
  return [(ix / (TW / 2) + iy / (TH / 2)) / 2, (iy / (TH / 2) - ix / (TW / 2)) / 2];
}
function centerOn(x, y) { CAM.x = isoX(x, y); CAM.y = isoY(x, y); clampCam() }
function clampCam() {
  const N = MAPN; CAM.x = Math.max(-N * TW / 2, Math.min(N * TW / 2, CAM.x)); CAM.y = Math.max(0, Math.min(N * TH, CAM.y));
}
function initRender(canvas) {
  cv = canvas; ctx = cv.getContext('2d');
  for (const k of ['grass', 'forest', 'dirt', 'water']) { PAT[k] = ctx.createPattern(IMG['g_' + k], 'repeat'); PAT[k].setTransform(new DOMMatrix().scale(0.6)) }
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
// видимая область в клетках
function viewTiles() {
  const pts = [fromScreen(0, 0), fromScreen(W, 0), fromScreen(0, H), fromScreen(W, H)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return [Math.max(0, Math.floor(x0) - 2), Math.max(0, Math.floor(y0) - 2), Math.min(MAPN - 1, Math.ceil(x1) + 2), Math.min(MAPN - 1, Math.ceil(y1) + 5)];
}
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 };
function diamond(c, x, y, k) { // ромб клетки (x, y), k — увеличение
  const cx = isoX(x + 0.5, y + 0.5), cy = isoY(x + 0.5, y + 0.5), w = TW / 2 * k, h = TH / 2 * k;
  c.moveTo(cx, cy - h); c.lineTo(cx + w, cy); c.lineTo(cx, cy + h); c.lineTo(cx - w, cy); c.closePath();
}
const TREE_H = [0, 92, 88, 86, 98, 24, 72];
const smokes = []; // частицы дыма — только на экране
let lastFrame = 0, ANIM = 0;

function draw(alpha) {
  const now = performance.now() / 1000, fdt = Math.min(0.1, now - (lastFrame || now)); lastFrame = now; ANIM += fdt;
  const me = G.players[G.me] || G.players[0], vis = me.vis, exp = me.exp, allVis = G.over || G.reveal;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#0d0b08'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * CAM.z, 0, 0, DPR * CAM.z, DPR * (W / 2 - CAM.x * CAM.z), DPR * (H / 2 - CAM.y * CAM.z));
  const [x0, y0, x1, y1] = viewTiles(), N = MAPN;
  // земля: трава по всей карте, поверх — грязь, лесная подстилка, вода
  ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(N * TW / 2, N * TH / 2); ctx.lineTo(0, N * TH); ctx.lineTo(-N * TW / 2, N * TH / 2); ctx.closePath(); ctx.clip();
  ctx.fillStyle = PAT.grass; ctx.fillRect(CAM.x - W / 2 / CAM.z, CAM.y - H / 2 / CAM.z, W / CAM.z, H / CAM.z);
  for (const [t, p, k] of [[3, 'forest', 1.25], [1, 'dirt', 1.2], [2, 'water', 1.12]]) {
    ctx.beginPath(); let any = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (M.ter[y * N + x] === t) { diamond(ctx, x, y, k); any = 1 }
    if (any) { ctx.fillStyle = PAT[p]; if (t === 2) { ctx.save(); ctx.translate(Math.sin(ANIM * 0.5) * 6, 0); ctx.fill(); ctx.restore() } else ctx.fill() }
  }
  ctx.restore();
  // руины и следы — на земле
  for (const f of G.fx) if (f.k === 'ruin') drawRuin(f);
  // сбор объектов и сортировка по глубине
  const list = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * N + x; const t = M.tree[i]; if (!t || !(exp[i] || allVis)) continue;
    list.push({ d: x + y + 1, k: 'tree', x, y, t, i });
  }
  for (let k = 0; k < M.rocks.length; k += 2) { const x = M.rocks[k], y = M.rocks[k + 1]; if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && (exp[y * N + x] || allVis)) list.push({ d: x + y + 1, k: 'rock', x, y }) }
  // постройки: видимые — как есть, остальные — по памяти
  const seen = me.seen;
  for (const b of G.blds) {
    const v = allVis || bldVisible(b, vis);
    if (v) seen.set(b.id, { id: b.id, arch: b.arch, race: b.race, tx: b.tx, ty: b.ty, s: b.s, prog: b.prog, own: b.own, T: b.T, x: b.x, y: b.y, hp: b.hp, mhp: b.mhp, ghost: 1 });
    if (b.x + b.s < x0 - 3 || b.x - b.s > x1 + 3 || b.y + b.s < y0 - 3 || b.y - b.s > y1 + 3) continue;
    if (v) list.push({ d: b.x + b.y, k: 'b', o: b });
  }
  for (const [id, g] of seen) {
    if (ents.get(id) && (allVis || bldVisible(ents.get(id), vis))) continue;
    if (bldVisible(g, vis) && !ents.get(id)) { seen.delete(id); continue }
    if (ents.get(id) && bldVisible(g, vis)) continue;
    list.push({ d: g.x + g.y, k: 'b', o: g, ghost: 1 });
  }
  for (const u of G.units) {
    if (u.inMine) continue;
    const rx = u.ox + (u.x - u.ox) * alpha, ry = u.oy + (u.y - u.oy) * alpha; u.rx = rx; u.ry = ry;
    if (!allVis && u.own !== G.me && !vis[Math.floor(ry) * N + Math.floor(rx)]) continue;
    if (rx < x0 - 2 || rx > x1 + 2 || ry < y0 - 2 || ry > y1 + 4) continue;
    list.push({ d: rx + ry + (u.T.fly && u.dst !== 'sleep' ? 6 : 0), k: 'u', o: u });
  }
  for (const f of G.fx) if (f.k === 'death') list.push({ d: f.x + f.y, k: 'death', o: f });
  list.sort((a, b) => a.d - b.d);
  for (const e of list) {
    if (e.k === 'tree') drawTree(e, vis[e.i] || allVis);
    else if (e.k === 'rock') drawSpr('rocks', e.x + 0.5, e.y + 0.5, 56, 0);
    else if (e.k === 'b') drawBld(e.o, e.ghost);
    else if (e.k === 'u') drawUnit(e.o);
    else if (e.k === 'death') drawDeath(e.o);
  }
  drawProj(alpha); drawFx(); drawSmoke(fdt);
  // туман войны
  if (!allVis) {
    ctx.beginPath(); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!exp[y * N + x]) diamond(ctx, x, y, 1.1);
    ctx.fillStyle = '#0d0b08'; ctx.fill();
    ctx.beginPath(); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * N + x; if (exp[i] && !vis[i]) diamond(ctx, x, y, 1.08) }
    ctx.fillStyle = 'rgba(8,6,4,0.5)'; ctx.fill();
  }
  drawOverlay();
}
function bldVisible(b, vis) {
  for (let y = b.ty; y < b.ty + b.s; y++) for (let x = b.tx; x < b.tx + b.s; x++) if (inMap(x, y) && vis[y * MAPN + x]) return true;
  return false;
}
// спрайт с якорем внизу по центру; h — высота в пикселях мира
function drawSpr(n, x, y, h, lift, flip, alpha) {
  const im = IMG[n]; if (!im || !im.width) return;
  const w = im.width * h / im.height, sx = isoX(x, y), sy = isoY(x, y) - (lift || 0);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (flip) { ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, sy - h, w, h); ctx.restore() }
  else ctx.drawImage(im, sx - w / 2, sy - h, w, h);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}
function drawTree(e, visible) {
  const { x, y, t, i } = e, r = hash2(x, y), h = TREE_H[t] * (0.85 + r * 0.3);
  const ox = (r - 0.5) * 0.3, oy = (hash2(y, x) - 0.5) * 0.3;
  drawSpr(TREE_SPR[t], x + 0.5 + ox, y + 0.5 + oy, h, -6, r > 0.5);
  if (M.tfire[i] > 0 && visible) {
    const fr = 'fire' + (1 + ((ANIM * 10 + i) | 0) % 4);
    drawSpr(fr, x + 0.5 + ox, y + 0.5 + oy, h * 0.75, h * 0.15);
    glow(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5) - h * 0.4, 70);
    if (Math.random() < 0.08) smokes.push({ x: isoX(x + 0.5, y + 0.5), y: isoY(x + 0.5, y + 0.5) - h * 0.8, t: 0, life: 3, s: 0.5 });
  }
}
function glow(x, y, r) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,150,40,0.35)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
}
function bSprite(b) {
  if (b.race === 'neu') return b.T.spr || STRUCT[b.arch].spr;
  return `b_${b.race}_${b.arch}`;
}
function bGeom(b, n) { // ширина и якорь спрайта постройки
  const im = IMG[n], k = b.T.k || 1, w = b.s * TW * k, h = im && im.width ? im.height * w / im.width : w;
  return { w, h, cx: isoX(b.tx + b.s, b.ty + b.s), by: isoY(b.tx + b.s, b.ty + b.s) + 3 * b.s };
}
function drawBld(b, ghost) {
  const sel = UI.sel.has(b.id), n = bSprite(b), g = bGeom(b, n), im = IMG[n];
  // подложка-ромб в цвет игрока
  if (isPlayer(b.own)) {
    ctx.beginPath(); const p = 0.15;
    ctx.moveTo(isoX(b.tx - p, b.ty - p), isoY(b.tx - p, b.ty - p)); ctx.lineTo(isoX(b.tx + b.s + p, b.ty - p), isoY(b.tx + b.s + p, b.ty - p));
    ctx.lineTo(isoX(b.tx + b.s + p, b.ty + b.s + p), isoY(b.tx + b.s + p, b.ty + b.s + p)); ctx.lineTo(isoX(b.tx - p, b.ty + b.s + p), isoY(b.tx - p, b.ty + b.s + p)); ctx.closePath();
    ctx.fillStyle = 'rgba(40,30,15,0.35)'; ctx.fill();
    ctx.strokeStyle = sel ? '#fff' : COLORS[b.own]; ctx.globalAlpha = sel ? 0.95 : 0.55; ctx.lineWidth = sel ? 2.5 : 2; ctx.stroke(); ctx.globalAlpha = 1;
  } else if (sel) { ctx.beginPath(); diamond(ctx, b.tx + 1, b.ty + 1, 3.2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke() }
  if (!im || !im.width) return;
  if (b.prog < 1) { // стройка: леса и растущее здание
    const sc = b.s >= 3 ? 'build_l' : 'build_s', si = IMG[sc], sw = b.s * TW * 0.95, sh = si.height * sw / si.width;
    ctx.save(); ctx.beginPath(); ctx.rect(g.cx - g.w, g.by - g.h * Math.max(0.12, b.prog), g.w * 2, g.h); ctx.clip();
    ctx.globalAlpha = 0.95; ctx.drawImage(im, g.cx - g.w / 2, g.by - g.h, g.w, g.h); ctx.restore(); ctx.globalAlpha = 1;
    if (b.prog < 0.9) { ctx.globalAlpha = 1 - b.prog * 0.6; ctx.drawImage(si, g.cx - sw / 2, g.by - sh, sw, sh); ctx.globalAlpha = 1 }
  } else {
    if (b.arch === 'lair') { ctx.drawImage(im, g.cx - g.w / 2, g.by - g.h, g.w, g.h) }
    else ctx.drawImage(im, g.cx - g.w / 2, g.by - g.h, g.w, g.h);
  }
  if (ghost) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.drawImage(darkOf(n) || im, g.cx - g.w / 2, g.by - g.h, g.w, g.h); ctx.globalAlpha = 1; return }
  // обугливание по мере повреждений и пожара
  const dmg = 1 - b.hp / b.mhp;
  if (!b.inv && (b.fire > 0 || dmg > 0.3)) { const d = darkOf(n); if (d) { ctx.globalAlpha = Math.min(0.85, dmg * (b.fire > 0 ? 1.1 : 0.5)); ctx.drawImage(d, g.cx - g.w / 2, g.by - g.h, g.w, g.h); ctx.globalAlpha = 1 } }
  if (b.fire > 0) drawBuildingFire(b, g);
  // дракон спит на своём кладе в логове
  if (b.arch === 'lair') { const d = G.units.find(u => u.arch === 'dragon' && u.dst === 'sleep'); if (d) drawSpr('dragon_sleep', b.x + 0.4, b.y + 2.2, 70, 0) }
  if (b.arch === 'mine' && b.gold !== undefined) { /* золото — в подсказке */ }
  if (isPlayer(b.own) && (sel || b.hp < b.mhp || b.prog < 1)) hpBar(g.cx, g.by - g.h - 8, Math.max(40, b.s * 22), b.hp / b.mhp, b.prog < 1 ? b.prog : -1);
  if (isPlayer(b.own)) { // флажок владельца
    const fx_ = g.cx + g.w * 0.32, fy = g.by - g.h * 0.55;
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(fx_, fy - 22, 2, 24);
    ctx.fillStyle = COLORS[b.own]; ctx.beginPath(); ctx.moveTo(fx_ + 2, fy - 22); ctx.lineTo(fx_ + 16 + Math.sin(ANIM * 5 + b.id) * 2, fy - 18); ctx.lineTo(fx_ + 2, fy - 13); ctx.fill();
  }
  if (sel && b.rally && b.own === G.me) {
    const [rx, ry] = [isoX(b.rally[0], b.rally[1]), isoY(b.rally[0], b.rally[1])];
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(g.cx, g.by - TH * b.s / 2); ctx.lineTo(rx, ry); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COLORS[b.own]; ctx.fillRect(rx, ry - 18, 10, 7); ctx.fillStyle = '#ddd'; ctx.fillRect(rx - 1, ry - 18, 2, 18);
  }
}
function drawBuildingFire(b, g) {
  const n = Math.ceil(b.fire * b.s * 2.2) + 1;
  for (let k = 0; k < n; k++) {
    const r1 = hash2(b.id, k), r2 = hash2(k, b.id + 7), r3 = hash2(b.id + k, 3);
    const px = b.tx + 0.3 + r1 * (b.s - 0.6), py = b.ty + 0.3 + r2 * (b.s - 0.6);
    const lift = g.h * (0.15 + r3 * 0.45), fh = (26 + b.fire * 40) * (0.7 + r3 * 0.6);
    const fr = 'fire' + (1 + ((ANIM * 9 + k * 1.7) | 0) % 4);
    drawSpr(fr, px, py, fh, lift);
    if (Math.random() < 0.05 * b.fire) smokes.push({ x: isoX(px, py), y: isoY(px, py) - lift - fh * 0.8, t: 0, life: 3 + Math.random() * 2, s: 0.6 + b.fire * 0.5 });
  }
  glow(g.cx, g.by - g.h * 0.45, 60 + b.s * 30 * b.fire);
}
function drawSmoke(dt) {
  const im = IMG.smoke; if (!im || !im.width) return;
  for (const s of smokes) {
    s.t += dt; s.y -= 22 * dt; s.x += 9 * dt;
    const k = s.t / s.life, sz = 30 * s.s * (1 + k * 2);
    ctx.globalAlpha = Math.max(0, 0.45 * (1 - k)); ctx.drawImage(im, s.x - sz / 2, s.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  for (let i = smokes.length - 1; i >= 0; i--) if (smokes[i].t > smokes[i].life) smokes.splice(i, 1);
  if (smokes.length > 400) smokes.splice(0, smokes.length - 400);
}
function hpBar(x, y, w, k, prog) {
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = k > 0.6 ? '#4caf50' : k > 0.3 ? '#e2b12c' : '#e04030'; ctx.fillRect(x - w / 2, y, w * Math.max(0, k), 4);
  if (prog >= 0) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - w / 2 - 1, y + 5, w + 2, 4); ctx.fillStyle = '#c9a25a'; ctx.fillRect(x - w / 2, y + 6, w * prog, 2) }
}
function uSprite(u) {
  if (u.arch === 'dragon') return u.atkT > 0 ? 'dragon_a' : (u.dir & 2) ? 'dragon_b' : 'dragon_f';
  if (u.arch === 'hermit') return u.atkT > 0 ? 'hermit_a' : (u.dir & 2) ? 'hermit_b' : 'hermit_f';
  const base = `u_${u.race}_${u.arch}_`;
  if (u.arch === 'worker' && u.carry > 0 && u.atkT <= 0) return base + ((u.dir & 2) ? 'cb' : u.ctype === 'g' ? 'cg' : 'cw');
  if (u.atkT > 0) return base + 'a';
  return base + ((u.dir & 2) ? 'b' : 'f');
}
const UH = {}; // масштаб юнита по переднему кадру — чтобы все кадры были одного роста
function uScale(u) {
  const key = u.race + u.arch; if (UH[key]) return UH[key];
  const f = IMG[u.arch === 'dragon' ? 'dragon_f' : u.arch === 'hermit' ? 'hermit_f' : `u_${u.race}_${u.arch}_f`];
  if (!f || !f.height) return 0.3;
  return UH[key] = u.T.h / f.height;
}
function drawUnit(u) {
  if (u.arch === 'dragon' && u.dst === 'sleep') return;
  const x = u.rx, y = u.ry, sx = isoX(x, y), sy = isoY(x, y), sel = UI.sel.has(u.id), r = unitR(u);
  const fly = u.T.fly && u.dst !== 'sleep', lift = fly ? 90 + Math.sin(ANIM * 2 + u.id) * 6 : 0;
  // тень/кольцо
  ctx.beginPath(); ctx.ellipse(sx, sy, r * TW * 0.62, r * TH * 0.62, 0, 0, Math.PI * 2);
  if (fly) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill() }
  else {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    if (isPlayer(u.own) || sel) { ctx.strokeStyle = sel ? '#fff' : COLORS[u.own] || '#ccc'; ctx.lineWidth = sel ? 2.2 : 1.6; ctx.globalAlpha = sel ? 1 : 0.8; ctx.stroke(); ctx.globalAlpha = 1 }
  }
  const n = uSprite(u), im = IMG[n]; if (!im || !im.width) return;
  const k = uScale(u), h = im.height * k, w = im.width * k;
  const bob = u.moving && !fly ? -Math.abs(Math.sin(u.anim * (u.T.cav ? 5 : 7))) * 2.5 : 0;
  const lean = u.atkT > 0 ? 3 : 0, flip = (u.dir & 1) === 1;
  const top = sy - h - lift + bob + 4;
  // покачивание при ходьбе — вокруг ног юнита (раньше точкой поворота был верх экрана, и ходоков мотало)
  ctx.save(); ctx.translate(sx, sy); if (flip) ctx.scale(-1, 1);
  if (u.moving && !fly) ctx.rotate(Math.sin(u.anim * 7) * 0.02);
  ctx.drawImage(im, -w / 2 + lean, top - sy, w, h);
  ctx.restore();
  if (u.slowT > G.t) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '10px sans-serif'; ctx.fillText('✦', sx - 4, top - 2) }
  if (sel || u.hp < u.mhp) hpBar(sx, top - 7, Math.min(46, 22 + u.mhp / 25), u.hp / u.mhp, -1);
  if (sel && u.T.mana) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(sx - 15, top - 2, 30, 3); ctx.fillStyle = '#4aa3ff'; ctx.fillRect(sx - 15, top - 2, 30 * u.mana / u.T.mana, 3) }
  if (u.arch === 'hermit' && u.own === NEUTRAL) { ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.fillText('✧', sx, top - 10); ctx.textAlign = 'left' }
}
function drawDeath(f) {
  const k = f.t / f.dur, x = isoX(f.x, f.y), y = isoY(f.x, f.y);
  const n = f.arch === 'dragon' ? 'dragon_sleep' : f.arch === 'hermit' ? 'hermit_f' : `u_${f.race}_${f.arch}_f`, im = IMG[n]; if (!im || !im.width) return;
  const T = f.arch === 'dragon' ? UST.neu.dragon : f.arch === 'hermit' ? UST.neu.hermit : UST[f.race][f.arch];
  const s = T.h / im.height * 0.95, w = im.width * s, h = im.height * s;
  ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(x, y); ctx.rotate((f.dir & 1 ? -1 : 1) * Math.min(1.3, k * 4)); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); ctx.globalAlpha = 1;
}
function drawRuin(f) {
  const im = IMG[f.spr]; if (!im || !im.width) return;
  const me = G.players[G.me]; if (!G.over && !me.exp[tIdx(Math.floor(f.x), Math.floor(f.y))]) return;
  const w = f.s * TW * 0.95, h = im.height * w / im.width, cx = isoX(f.x, f.y), by = isoY(f.x + f.s / 2, f.y + f.s / 2) + 4;
  ctx.globalAlpha = Math.min(1, (f.dur - f.t) / 10); ctx.drawImage(im, cx - w / 2, by - h, w, h);
  if (f.burnt && f.t < 40 && Math.random() < 0.15) smokes.push({ x: cx + (Math.random() - 0.5) * w * 0.5, y: by - h * 0.5, t: 0, life: 3, s: 0.5 });
  if (f.burnt && f.t < 12) { const fr = 'fire' + (1 + ((ANIM * 9) | 0) % 4); drawSpr(fr, f.x, f.y, 30 * (1 - f.t / 12), 10) }
  ctx.globalAlpha = 1;
}
function drawProj(alpha) {
  for (const p of G.proj) {
    const k = Math.min(1, (p.t + STEP * alpha) / p.dur), x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k;
    const z = (p.z0 || 0.6) * 32 * (1 - k) + Math.sin(Math.PI * k) * p.h * 32 + 14;
    const sx = isoX(x, y), sy = isoY(x, y) - z;
    if (p.k === 'arrow' || p.k === 'bolt') {
      const k2 = Math.min(1, k + 0.05), x2 = p.x0 + (p.x1 - p.x0) * k2, y2 = p.y0 + (p.y1 - p.y0) * k2, z2 = (p.z0 || 0.6) * 32 * (1 - k2) + Math.sin(Math.PI * k2) * p.h * 32 + 14;
      const ex = isoX(x2, y2), ey = isoY(x2, y2) - z2, a = Math.atan2(ey - sy, ex - sx);
      ctx.strokeStyle = p.fire ? '#ffb040' : '#e8dcc0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * 9, sy - Math.sin(a) * 9); ctx.lineTo(sx + Math.cos(a) * 4, sy + Math.sin(a) * 4); ctx.stroke();
      if (p.fire) glow(sx, sy, 12);
    } else if (p.k === 'stone') {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(isoX(x, y), isoY(x, y), 6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6b6258'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a342c'; ctx.stroke();
    } else if (p.k === 'pot' || p.k === 'breath') {
      drawSpr('fire' + (1 + ((ANIM * 12) | 0) % 4), x, y, p.k === 'breath' ? 40 : 22, z - 10); glow(sx, sy, 30);
    } else if (p.k === 'magic') {
      const c = p.own !== undefined && G.players[p.own] ? ({ rus: '255,140,40', mon: '120,255,150', teu: '255,230,120' })[G.players[p.own].race] : '180,200,255';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12); g.addColorStop(0, `rgba(${c},1)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(sx - 12, sy - 12, 24, 24); ctx.globalCompositeOperation = 'source-over';
    }
  }
}
function drawFx() {
  for (const f of G.fx) {
    const k = f.t / f.dur, x = isoX(f.x, f.y), y = isoY(f.x, f.y);
    switch (f.k) {
      case 'boom': case 'fireball': drawSpr('boom', f.x, f.y, (f.k === 'boom' ? 90 : 50) * (0.6 + k), 0, false, 1 - k); break;
      case 'dust': ctx.globalAlpha = 1 - k; drawSpr('smoke', f.x, f.y, 40 * (0.5 + k), 0); ctx.globalAlpha = 1; break;
      case 'smoke': if (Math.random() < 0.5) smokes.push({ x: x + (Math.random() - 0.5) * 60, y: y - 30, t: 0, life: 3, s: 1.2 }); break;
      case 'bolt': ctx.globalCompositeOperation = 'lighter'; drawSpr('bolt', f.x, f.y, f.big ? 220 : 120, 0, Math.random() < 0.5, 1 - k); ctx.globalCompositeOperation = 'source-over'; break;
      case 'heal': ctx.globalCompositeOperation = 'lighter'; drawSpr('heal', f.x, f.y, 40 + (f.r || 1) * 28, -10, false, Math.sin(Math.PI * k)); ctx.globalCompositeOperation = 'source-over'; break;
      case 'firerain': {
        for (let i = 0; i < 9; i++) {
          const r1 = hash2(i, f.x | 0), r2 = hash2(f.y | 0, i), t = (k * 1.6 - r1 * 0.6); if (t < 0 || t > 1) continue;
          const px = f.x + (r1 - 0.5) * f.r * 2, py = f.y + (r2 - 0.5) * f.r * 2;
          drawSpr('fire' + (1 + i % 4), px, py, 34, (1 - t) * 260);
        }
        ellipseRing(x, y, f.r, 'rgba(255,120,40,' + (0.6 * (1 - k)) + ')');
        break;
      }
      case 'rain': {
        ctx.strokeStyle = 'rgba(170,200,255,.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i < 70; i++) { const r1 = Math.random(), r2 = Math.random(), px = x + (r1 - 0.5) * f.r * TW * 1.6, py = y + (r2 - 0.5) * f.r * TH * 1.6 - 60; ctx.moveTo(px, py); ctx.lineTo(px - 4, py + 18) }
        ctx.stroke(); ellipseRing(x, y, f.r, 'rgba(120,170,255,' + (0.5 * (1 - k)) + ')'); break;
      }
      case 'smash': ellipseRing(x, y, f.r * (0.5 + k), 'rgba(255,230,160,' + (1 - k) + ')'); break;
      case 'vision': ellipseRing(x, y, f.r * k, 'rgba(200,180,255,' + (1 - k) + ')'); break;
    }
  }
}
function ellipseRing(x, y, r, c) { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, r * TW * 0.7, r * TH * 0.7, 0, 0, 7); ctx.stroke() }

// ---------- поверх мира: рамка выбора, призрак постройки, прицел ----------
function drawOverlay() {
  if (UI.place) {
    const T = BST[G.players[G.me].race][UI.place], [mx, my] = fromScreen(UI.mx, UI.my), tx = Math.floor(mx - T.s / 2 + 0.5), ty = Math.floor(my - T.s / 2 + 0.5);
    UI.placeAt = [tx, ty];
    const me = G.players[G.me];
    for (let y = ty; y < ty + T.s; y++) for (let x = tx; x < tx + T.s; x++) {
      const ok = inMap(x, y) && !M.block[tIdx(x, y)] && me.exp[tIdx(x, y)];
      ctx.beginPath(); diamond(ctx, x, y, 0.95); ctx.fillStyle = ok ? 'rgba(80,220,90,.35)' : 'rgba(230,50,40,.45)'; ctx.fill();
    }
    const b = { tx, ty, s: T.s, T }, n = `b_${me.race}_${UI.place}`, g = bGeom(b, n);
    ctx.globalAlpha = 0.45; ctx.drawImage(IMG[n], g.cx - g.w / 2, g.by - g.h, g.w, g.h); ctx.globalAlpha = 1;
  }
  if (UI.target && UI.target.r) {
    const [mx, my] = fromScreen(UI.mx, UI.my); ellipseRing(isoX(mx, my), isoY(mx, my), UI.target.r, 'rgba(255,220,120,.8)');
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (UI.drag && UI.drag.box) {
    const d = UI.drag; ctx.strokeStyle = '#9f9'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(120,255,120,.08)';
    ctx.fillRect(d.x0, d.y0, UI.mx - d.x0, UI.my - d.y0); ctx.strokeRect(d.x0 + 0.5, d.y0 + 0.5, UI.mx - d.x0, UI.my - d.y0);
  }
  for (const m of UI.marks) { // отметка приказа
    const k = (performance.now() - m.t) / 500; if (k > 1) continue;
    const [sx, sy] = toScreen(m.x, m.y); ctx.strokeStyle = m.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 14 * (1 - k * 0.5) * CAM.z, 7 * (1 - k * 0.5) * CAM.z, 0, 0, 7); ctx.stroke();
  }
}

// ---------- мини-карта ----------
let mm, mctx, mmBase = null, mmT = 0;
const MMS = 200;
function mmXY(x, y) { return [MMS / 2 + (x - y) * MMS / (2 * MAPN), (x + y) * MMS / (4 * MAPN) + 2] }
function mmInv(px, py) { const a = (px - MMS / 2) * 2 * MAPN / MMS, b = (py - 2) * 4 * MAPN / MMS; return [(a + b) / 2, (b - a) / 2] }
function drawMinimap(force) {
  if (!mm) { mm = document.getElementById('mini'); mm.width = MMS; mm.height = MMS / 2 + 4; mctx = mm.getContext('2d') }
  const now = performance.now(); if (!force && now - mmT < 250) return; mmT = now;
  const me = G.players[G.me], N = MAPN;
  if (!mmBase) { mmBase = document.createElement('canvas'); mmBase.width = N; mmBase.height = N }
  const bc = mmBase.getContext('2d'), id = bc.createImageData(N, N), d = id.data;
  for (let i = 0; i < N * N; i++) {
    let c = [70, 110, 50];
    if (M.ter[i] === 2) c = [40, 80, 110]; else if (M.ter[i] === 1) c = [120, 95, 60];
    if (M.tree[i] && M.tree[i] < T_STUMP) c = [30, 70, 30]; if (M.tree[i] === T_BURNT) c = [40, 35, 30];
    if (M.tfire[i] > 0) c = [255, 120, 30];
    if (M.block[i] === 3) c = [110, 110, 110];
    if (!me.exp[i] && !G.over && !G.reveal) c = [10, 9, 7]; else if (!me.vis[i] && !G.over && !G.reveal) c = c.map(v => v * 0.6);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  bc.putImageData(id, 0, 0);
  for (const [, g] of me.seen) { bc.fillStyle = isPlayer(g.own) ? COLORS[g.own] : g.arch === 'mine' ? '#e8c440' : g.arch === 'lair' ? '#a33' : '#c8b8ff'; bc.fillRect(g.tx, g.ty, g.s, g.s) }
  for (const b of G.blds) if (b.fire > 0 && me.vis[tIdx(Math.floor(b.x), Math.floor(b.y))]) { bc.fillStyle = '#ff8a20'; bc.fillRect(b.tx, b.ty, b.s, b.s) }
  for (const u of G.units) { if (u.inMine || (!G.over && u.own !== G.me && !me.vis[tIdx(Math.floor(u.x), Math.floor(u.y))])) continue; bc.fillStyle = u.own < 3 ? COLORS[u.own] : u.arch === 'dragon' ? '#ff3030' : '#d0c8ff'; bc.fillRect(Math.floor(u.x) - (u.T.fly ? 1 : 0), Math.floor(u.y), u.T.fly ? 3 : 2, u.T.fly ? 3 : 2) }
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mm.width, mm.height);
  // поворот на 45° и сжатие по вертикали — как в игре
  mctx.setTransform(MMS / (2 * N), MMS / (4 * N), -MMS / (2 * N), MMS / (4 * N), MMS / 2, 2);
  mctx.imageSmoothingEnabled = false; mctx.drawImage(mmBase, 0, 0);
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  // рамка экрана
  const c = [fromScreen(0, 0), fromScreen(W, 0), fromScreen(W, H), fromScreen(0, H)].map(([x, y]) => mmXY(x, y));
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); c.forEach(([x, y], i) => i ? mctx.lineTo(x, y) : mctx.moveTo(x, y)); mctx.closePath(); mctx.stroke();
  for (const m of UI.pings) { const k = (now - m.t) / 2500; if (k > 1) continue; const [x, y] = mmXY(m.x, m.y); mctx.strokeStyle = m.c; mctx.beginPath(); mctx.arc(x, y, 3 + 12 * (1 - k), 0, 7); mctx.stroke() }
}
