// Тест интерфейса: настоящие события мыши/клавиатуры. Запуск: tests/run.sh tests/ui.js
window.addEventListener('load', () => setTimeout(async () => {
  const out = [], L = s => { out.push(s); document.getElementById('out').textContent = out.join('\n') };
  const pre = document.createElement('pre'); pre.id = 'out'; document.body.appendChild(pre);
  window.onerror = (m, s, l) => L('ERROR ' + m + ' @' + l);
  // в режиме --dump-dom кадры не рисуются сами: рисуем и обновляем панели вручную
  const fr = () => new Promise(r => setTimeout(() => { draw(1); uiTick(0.05); r() }, 30)), wait = async n => { for (let i = 0; i < n; i++) await fr() };
  const cv = document.getElementById('cv');
  const ev = (type, x, y, o = {}) => (o.target || cv).dispatchEvent(new MouseEvent(type, Object.assign({ clientX: x, clientY: y, bubbles: true, button: 0, buttons: 1 }, o)));
  const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const run = s => { for (let i = 0; i < s * 20; i++) simStep() };
  try {
    soloMenu(); document.getElementById('r0').value = 'rus'; document.getElementById('k2').value = 'closed'; soloGo();
    G.players[1].kind = 'human'; G.players[1].ai = null; // соперник не мешает
    UI.paused = true; await wait(3);
    const ws = G.units.filter(u => u.own === 0), ss = ws.map(u => toScreen(u.rx, u.ry));
    const xs = ss.map(s => s[0]), ys = ss.map(s => s[1]);
    ev('mousedown', Math.min(...xs) - 30, Math.min(...ys) - 60); ev('mousemove', Math.max(...xs) + 30, Math.max(...ys) + 20); window.dispatchEvent(new MouseEvent('mouseup', { clientX: Math.max(...xs) + 30, clientY: Math.max(...ys) + 20, button: 0 }));
    L('рамка выбрала: ' + UI.sel.size + ' (ждём 5)');
    // ПКМ по дереву
    const hall = G.blds.find(b => b.own === 0 && b.arch === 'hall'), t = nearestTree(hall.x, hall.y, 20);
    let [tx, ty] = toScreen(t[0] + 0.5, t[1] + 0.5); ev('mousedown', tx, ty - 8, { button: 2, buttons: 2 }); UI.paused = false;
    run(0.2); L('после ПКМ по дереву: ' + ws.map(u => u.ord && u.ord.k).join(','));
    run(40); L('дерево через 40 с: ' + Math.floor(me().wood) + ' (было 400)');
    // строительство через клавиши B → E и клик
    UI.sel = new Set([ws[0].id]); UI.sig = ''; await wait(2); key('b'); await wait(2); key('e'); await wait(1);
    const sp = aiSpot(me(), 2, hall.x, hall.y); const [bx, by] = toScreen(sp[0] + 1, sp[1] + 1);
    ev('mousemove', bx, by); await wait(2); ev('mousedown', bx, by); run(0.2);
    const house = G.blds.find(b => b.own === 0 && b.arch === 'house'); L('дом заложен: ' + !!house + ' место ' + (UI.placeAt || []).join(','));
    run(25); L('дом построен: ' + (house && house.prog >= 1) + ', жильё ' + me().cap);
    // заказ работника кнопкой Q у терема
    const [hx, hy] = toScreen(hall.x, hall.y); ev('mousedown', hx, hy - 20); window.dispatchEvent(new MouseEvent('mouseup', { clientX: hx, clientY: hy - 20, button: 0 }));
    await wait(2); L('выбран терем: ' + (UI.sel.has(hall.id)) + ', кнопки: ' + (UI.cmds || []).map(c => c.key + ':' + c.name).join(' | '));
    key('q'); run(0.1); L('очередь терема: ' + hall.q.length);
    run(14); L('работников: ' + G.units.filter(u => u.own === 0 && u.arch === 'worker').length);
    // отшельник: подвести работника, выучить заклинание, применить с панели
    const hut = G.blds.find(b => b.arch === 'hut'), w = ws[1];
    w.x = w.ox = hut.x; w.y = w.oy = hut.y + 2.5; me().gold = 2000; run(0.5);
    UI.sel = new Set([hut.id]); UI.sig = ''; await wait(2);
    L('кнопки скита: ' + (UI.cmds || []).map(c => c.key + ':' + c.name + (c.dis ? '(нет)' : '')).join(' | '));
    key('q'); run(0.1); L('изучено: ' + JSON.stringify(Object.keys(me().hs)));
    key('e'); run(0.1); const he = G.units.find(u => u.arch === 'hermit' && u.own === 0); L('отшельник нанят: ' + !!he);
    // огонь: подожжём свой дом и потушим работниками
    ignite(house, 0.5); run(3); L('дом горит: ' + house.fire.toFixed(2) + ' hp ' + Math.round(house.hp));
    applyCmd(0, { c: 'repair', ids: ws.slice(2, 5).map(u => u.id), tid: house.id }); run(20); L('после тушения: огонь ' + house.fire.toFixed(2) + ' hp ' + Math.round(house.hp));
    // заклинание «Ливень»/другое через F1 и клик
    const s0 = Object.keys(me().hs)[0]; G.t += 100; key('F1'); await wait(1); L('цель заклинания: ' + JSON.stringify(UI.target));
    const [cx, cy] = toScreen(house.x, house.y); ev('mousedown', cx, cy); run(0.2); L('перезарядка ' + s0 + ': ' + Math.round(me().hs[s0] - G.t));
    // факел: вражеская постройка рядом
    const eb = addBld(1, G.players[1].race, 'house', Math.floor(hall.x) + 6, Math.floor(hall.y) - 7, true);
    const inf = addUnit(0, 'rus', 'inf', eb.x - 3, eb.y); UI.sel = new Set([inf.id]); UI.sig = ''; await wait(2);
    key('g'); await wait(1); const [ex, ey] = toScreen(eb.x, eb.y); ev('mousedown', ex, ey - 10); run(5);
    L('факел: вражеский дом горит ' + eb.fire.toFixed(2));
    run(60); L('через минуту: дом ' + (eb.dead ? 'сгорел' : 'hp ' + Math.round(eb.hp)));
    // герой и маг
    const tm = addBld(0, 'rus', 'temple', Math.floor(hall.x) - 7, Math.floor(hall.y) + 3, true); me().gold = 3000; me().wood = 3000;
    applyCmd(0, { c: 'train', bid: hall.id, u: 'hero' }); applyCmd(0, { c: 'train', bid: tm.id, u: 'mage' }); run(60);
    const hero = G.units.find(u => u.own === 0 && u.arch === 'hero'), mage = G.units.find(u => u.own === 0 && u.arch === 'mage');
    L('герой: ' + !!hero + ', волхв: ' + !!mage + ', население ' + me().pop + '/' + me().cap);
    if (mage) { mage.mana = 100; const en = addUnit(1, G.players[1].race, 'inf', mage.x + 3, mage.y); applyCmd(0, { c: 'cast', ids: [mage.id], s: 'firerain', x: en.x, y: en.y }); run(3); L('огненный дождь: враг hp ' + Math.round(en.hp) + '/' + en.mhp + ', мана ' + Math.round(mage.mana)) }
    // пробуждение дракона
    const d = G.units.find(u => u.arch === 'dragon'), lair = G.blds.find(b => b.arch === 'lair');
    const sc = addUnit(0, 'rus', 'archer', lair.x + 4, lair.y + 4); run(3); L('дракон: ' + d.dst);
    run(10); L('лучник у логова: ' + (sc.dead ? 'сгорел' : 'жив hp ' + Math.round(sc.hp)));
    await wait(3); L('ошибок в консоли нет, если выше нет ERROR');
  } catch (e) { L('EXC ' + e.stack) }
}, 1200));
