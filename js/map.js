'use strict';
// ---------- Карта: генерация по зерну, проходимость, поиск пути ----------
function rng(seed) { // mulberry32 — одинаковая карта у всех игроков по одному зерну
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
const TREE_SPR = [null, 't_spruce', 't_birch', 't_oak', 't_pine', 't_stump', 't_burnt'];
const T_STUMP = 5, T_BURNT = 6;
let M = null; // карта

function noiseGrid(R, n, cell) {
  const gw = Math.ceil(n / cell) + 2, g = [];
  for (let i = 0; i < gw * gw; i++) g.push(R());
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const s = t => t * t * (3 - 2 * t), a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return (a + (b - a) * s(tx)) * (1 - s(ty)) + (c + (d - c) * s(tx)) * s(ty);
  };
}

// starts — сколько баз (2 или 3); возвращает карту и точки баз
function genMap(seed, starts) {
  const N = MAPN, R = rng(seed);
  M = { n: N, seed, ter: new Uint8Array(N * N), tree: new Uint8Array(N * N), wood: new Uint16Array(N * N),
    tfire: new Float32Array(N * N), block: new Uint8Array(N * N), bid: new Int32Array(N * N).fill(-1),
    rocks: [], starts: [], spots: {} };
  const n1 = noiseGrid(R, N, 9), n2 = noiseGrid(R, N, 4), n3 = noiseGrid(R, N, 14);
  const C = N / 2, keep = []; // зоны, где не должно быть леса и воды: [x, y, r]
  const ang0 = R() * Math.PI * 2;
  const angs = starts === 2 ? [ang0, ang0 + Math.PI] : [ang0, ang0 + 2.094, ang0 + 4.189];
  for (const a of angs) {
    const x = Math.round(C + Math.cos(a) * 33), y = Math.round(C + Math.sin(a) * 33);
    // рудник по направлению к центру
    const mx = Math.round(x + Math.cos(a + Math.PI) * 8 + Math.cos(a + 1.57) * 3), my = Math.round(y + Math.sin(a + Math.PI) * 8 + Math.sin(a + 1.57) * 3);
    M.starts.push({ x, y, mine: [mx - 1, my - 1], ang: a });
    keep.push([x, y, 10]);
  }
  keep.push([C, C, 7]);
  // скиты отшельников и дополнительные рудники — между базами
  M.spots.huts = []; M.spots.mines = [];
  const mids = starts === 2 ? [ang0 + 1.571, ang0 - 1.571, ang0 + 0.6] : angs.map(a => a + 1.047);
  mids.forEach((a, i) => {
    const r = starts === 2 && i === 2 ? 16 : 24;
    const hx = Math.round(C + Math.cos(a) * r), hy = Math.round(C + Math.sin(a) * r);
    M.spots.huts.push([hx - 1, hy - 1]); keep.push([hx, hy, 5]);
    const mx = Math.round(C + Math.cos(a + 0.5) * 15), my = Math.round(C + Math.sin(a + 0.5) * 15);
    M.spots.mines.push([mx - 1, my - 1]); keep.push([mx, my, 4]);
  });
  M.spots.lair = [C - 1, C - 1];
  const kept = (x, y, pad = 0) => keep.some(k => (x - k[0]) ** 2 + (y - k[1]) ** 2 < (k[2] + pad) ** 2);
  // земля, вода, лес
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, e = n1(x, y) * 0.65 + n2(x, y) * 0.35, w = n3(x, y);
    const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
    if (w > 0.74 && !kept(x, y, 4) && edge > 3) { M.ter[i] = 2; M.block[i] = 1; continue }
    if (n2(x + 50, y) > 0.72) M.ter[i] = 1;
    let forest = e > 0.58 || edge < 3 + n2(y, x) * 4;
    if (forest && !kept(x, y, 1)) {
      M.ter[i] = 3;
      if (R() < 0.9) { const t = R(); M.tree[i] = t < 0.38 ? 1 : t < 0.62 ? 4 : t < 0.85 ? 2 : 3; M.wood[i] = 100; M.block[i] = 2 }
    } else if (e > 0.52 && !kept(x, y)) M.ter[i] = 3;
  }
  // у каждой базы гарантированный лес в 9–14 клетках
  for (const s of M.starts) {
    for (let k = 0; k < 2; k++) {
      const a = s.ang + (k ? 0.9 : -0.9) + (R() - 0.5) * 0.4, cx = s.x + Math.cos(a) * 12, cy = s.y + Math.sin(a) * 12;
      for (let y = Math.floor(cy - 4); y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
        const i = y * N + x;
        if ((x - cx) ** 2 + (y - cy) ** 2 > 14 + R() * 6 || kept(x, y, -1) || M.block[i]) continue;
        M.ter[i] = 3; M.tree[i] = R() < 0.5 ? 1 : 2; M.wood[i] = 100; M.block[i] = 2;
      }
    }
  }
  // камни
  for (let k = 0; k < 26; k++) {
    const x = 3 + (R() * (N - 6)) | 0, y = 3 + (R() * (N - 6)) | 0, i = y * N + x;
    if (M.block[i] || kept(x, y, 2)) continue;
    M.block[i] = 3; M.rocks.push(x, y);
  }
  // у краёв карты — сплошной лес, чтобы не уходили за границу
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x === 0 || y === 0 || x === N - 1 || y === N - 1) {
    const i = y * N + x; if (!M.block[i]) { M.tree[i] = 1; M.wood[i] = 100; M.block[i] = 2; M.ter[i] = 3 }
  }
  return M;
}
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAPN && y < MAPN;
const tIdx = (x, y) => y * MAPN + x;
const passable = (x, y) => inMap(x, y) && !M.block[y * MAPN + x];

// ---------- A* по клеткам, 8 направлений, без срезания углов ----------
const PF = { g: new Float32Array(MAPN * MAPN), from: new Int32Array(MAPN * MAPN), stamp: new Uint32Array(MAPN * MAPN), closed: new Uint32Array(MAPN * MAPN), cur: 0 };
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
// goal: {x0,y0,x1,y1} — прямоугольник цели (включительно); дойти до клетки внутри или рядом, если он занят
function findPath(sx, sy, goal, maxN = 7000) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  const N = MAPN, st = ++PF.cur, heap = [], hf = [];
  const gx = (goal.x0 + goal.x1) / 2, gy = (goal.y0 + goal.y1) / 2, adj = goal.adj;
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy) };
  const isGoal = (x, y) => adj
    ? x >= goal.x0 - 1 && x <= goal.x1 + 1 && y >= goal.y0 - 1 && y <= goal.y1 + 1
    : x >= goal.x0 && x <= goal.x1 && y >= goal.y0 && y <= goal.y1;
  const push = (i, f) => { heap.push(i); hf.push(f); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break;[heap[p], heap[k]] = [heap[k], heap[p]];[hf[p], hf[k]] = [hf[k], hf[p]]; k = p } };
  const pop = () => { const top = heap[0], li = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = li; hf[0] = lf; let k = 0; for (; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === k) break;[heap[m], heap[k]] = [heap[k], heap[m]];[hf[m], hf[k]] = [hf[k], hf[m]]; k = m } } return top };
  const s = sy * N + sx; PF.g[s] = 0; PF.stamp[s] = st; PF.from[s] = -1; push(s, h(sx, sy));
  let best = s, bestH = h(sx, sy), cnt = 0, found = -1;
  while (heap.length && cnt++ < maxN) {
    const i = pop(); if (PF.closed[i] === st) continue; PF.closed[i] = st;
    const x = i % N, y = (i / N) | 0;
    if (isGoal(x, y)) { found = i; break }
    const hh = h(x, y); if (hh < bestH) { bestH = hh; best = i }
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
      const j = ny * N + nx;
      if (M.block[j]) continue;
      if (dx && dy && (M.block[y * N + nx] || M.block[ny * N + x])) continue;
      const g = PF.g[i] + c;
      if (PF.stamp[j] === st && g >= PF.g[j]) continue;
      PF.stamp[j] = st; PF.g[j] = g; PF.from[j] = i; push(j, g + h(nx, ny) * 1.05);
    }
  }
  let e = found >= 0 ? found : best; const path = [];
  while (e !== -1 && e !== s) { path.push([e % N + 0.5, ((e / N) | 0) + 0.5]); e = PF.from[e] }
  path.reverse();
  return { path, ok: found >= 0 };
}
// ближайшая свободная клетка к (x, y) по спирали
function freeNear(x, y, taken) {
  x = Math.floor(x); y = Math.floor(y);
  for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (passable(nx, ny) && !(taken && taken.has(ny * MAPN + nx))) return [nx, ny];
  }
  return [x, y];
}
