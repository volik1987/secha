// Замер дёрганья при ходьбе: смены направления спрайта, мигание «идёт/стоит», рывки назад
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math, Date, performance: { now: () => Date.now() }, setTimeout };
vm.createContext(ctx);
vm.runInContext(['data.js', 'map.js', 'sim.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n') + ';globalThis.X={get G(){return G},newGame,simStep,applyCmd,get ents(){return ents}}', ctx);
const X = ctx.X;
X.newGame({ seed: 5, me: 0, slots: [{ kind: 'human', race: 'rus' }, { kind: 'closed' }, { kind: 'closed' }] });
const G = X.G, p = G.players[0];
// войско: 12 ратников у терема
for (let i = 0; i < 12; i++) vm.runInContext(`addUnit(0,'rus','inf',${p.start.x + 3 + (i % 4)},${p.start.y + 5 + (i / 4 | 0)})`, ctx);
const us = G.units.filter(u => u.own === 0);
function run(label, tx, ty, ticks) {
  X.applyCmd(0, { c: 'move', ids: us.map(u => u.id), x: tx, y: ty });
  const st = new Map(us.map(u => [u.id, { dir: u.dir, mv: u.moving, dirCh: 0, mvCh: 0, back: 0, vx: 0, vy: 0, n: 0 }]));
  for (let t = 0; t < ticks; t++) {
    const prev = new Map(us.map(u => [u.id, [u.x, u.y]]));
    X.simStep();
    for (const u of us) {
      const s = st.get(u.id), [px, py] = prev.get(u.id), vx = u.x - px, vy = u.y - py;
      if (u.dir !== s.dir) s.dirCh++; if (u.moving !== s.mv) s.mvCh++;
      if (s.vx * vx + s.vy * vy < -1e-5) s.back++; // рывок против прежнего движения
      s.dir = u.dir; s.mv = u.moving; if (Math.hypot(vx, vy) > 1e-4) { s.vx = vx; s.vy = vy }
    }
  }
  const a = [...st.values()], sum = k => a.reduce((s, x) => s + x[k], 0);
  console.log(`${label}: за ${ticks / 20} с на 12 воинов — смен направления ${sum('dirCh')}, мигание идёт/стоит ${sum('mvCh')}, рывков назад ${sum('back')}; в пути ещё ${us.filter(u => u.ord).length}`);
}
run('поход', p.start.x + 3, p.start.y - 12, 400);
run('стоят после', p.start.x + 3, p.start.y - 12, 200);
