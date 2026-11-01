// Партия «компьютер против компьютера» без браузера: node tests/aigame.js [минут] [игр] [расы через запятую]
// Проверяет, что симуляция не падает, ИИ развивается и нападает, пожары и дракон работают.
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = path.join(__dirname, '..', 'js');
const ctx = { console, Math, Date, performance: { now: () => Date.now() }, setTimeout, DOMMatrix: class { scale() { return this } } };
vm.createContext(ctx);
const src = ['data.js', 'map.js', 'sim.js', 'ai.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  + '\n;globalThis.__x={get G(){return G},newGame,simStep,aiInit,get M(){return M},get ents(){return ents}};';
vm.runInContext(src, ctx);
const X = ctx.__x;
const mins = +process.argv[2] || 30, games = +process.argv[3] || 1, races = (process.argv[4] || 'rus,mon,teu').split(',');
for (let g = 0; g < games; g++) {
  const seed = 1000 + g * 7919;
  const slots = races.map((r, i) => ({ kind: 'ai', race: r, diff: 'normal', name: r }));
  while (slots.length < 3) slots.push({ kind: 'closed' });
  X.newGame({ seed, me: 0, slots });
  const G = X.G; for (const p of G.players) if (p.kind === 'ai') X.aiInit(p);
  let fires = 0, burntTrees = 0, dragonRaid = 0, t0 = Date.now(), log = [];
  const steps = mins * 60 * 20;
  for (let i = 0; i < steps && !G.over; i++) {
    X.simStep();
    if (i % 200 === 0) {
      fires = Math.max(fires, G.blds.filter(b => b.fire > 0).length);
      const d = G.units.find(u => u.arch === 'dragon'); if (d && d.dst === 'raid') dragonRaid++;
    }
    if (i % (20 * 60 * 5) === 0 && i) log.push(`${(i / 1200) | 0}м: ` + G.players.filter(p => p.kind !== 'closed').map(p => `${p.race} b${G.blds.filter(b => b.own === p.i).length} u${G.units.filter(u => u.own === p.i).length} g${p.gold | 0} w${p.wood | 0} k${p.stats.kills} burn${p.stats.burned}`).join(' | '));
  }
  for (let i = 0; i < X.M.tree.length; i++) if (X.M.tree[i] === 6) burntTrees++;
  console.log(`игра ${g + 1} (зерно ${seed}): ${G.over ? 'победил ' + (G.players[G.winner] || {}).race + ' на ' + ((G.t / 60) | 0) + ' мин' : 'не закончилась за ' + mins + ' мин'}; макс. пожаров ${fires}, сгоревших деревьев ${burntTrees}, дракон в набеге ~${dragonRaid * 10} с; ${Date.now() - t0} мс`);
  for (const l of log) console.log('  ' + l);
  for (const n of G.notes) if (n.kind === 'big') console.log('  [' + ((n.t / 60) | 0) + ':' + String((n.t % 60) | 0).padStart(2, '0') + '] ' + n.text);
  const dr = G.units.find(u => u.arch === 'dragon'); console.log('  дракон: ' + (dr ? dr.dst + ' hp ' + (dr.hp | 0) : 'убит'));
}
