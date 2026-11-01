'use strict';
// Настольная версия «Сечи»: та же игра из app/, в отдельном окне
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

app.setName('Сеча');
Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
  { label: 'Сеча', submenu: [{ role: 'about', label: 'О программе' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Во весь экран' }, { role: 'quit', label: 'Выйти' }] },
  { label: 'Правка', submenu: [{ role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' }, { role: 'selectAll', label: 'Выделить всё' }] },
]) : null);

function open() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#17120c', title: 'Сеча: Три знамени',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false }, // хозяин сетевой игры считает и в свёрнутом окне
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // F11 — во весь экран (на Mac ещё и зелёная кнопка окна)
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault() } });
  // внешние ссылки — в обычном браузере
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } });
}
app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());
