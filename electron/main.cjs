const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
  protocol,
  net,
  shell,
  session,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { probe, exportVideo } = require('./media.cjs');
const { isInstagram, blockedRoute, focusCSS, installFocus } = require('./policy.cjs');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'focus-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
let win,
  guest,
  guestCSS,
  exportController,
  lastExport,
  focus = true,
  guestVisible = false,
  guestPage = 'stories';
const media = new Map();
const send = (channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
};
function handle(name, fn) {
  ipcMain.handle(name, (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw Error('Untrusted request.');
    return fn(...args);
  });
}
function bounds() {
  if (guestVisible && guest && win) {
    const [width, height] = win.getContentSize();
    guest.setBounds({
      x: 256,
      y: 174,
      width: Math.max(0, width - 288),
      height: Math.max(0, height - 206),
    });
  }
}
async function applyFocus() {
  if (!guest || guest.webContents.isDestroyed()) return;
  try {
    if (guestCSS) await guest.webContents.removeInsertedCSS(guestCSS);
    guestCSS = await guest.webContents.insertCSS(focusCSS);
    await guest.webContents.executeJavaScript(installFocus(focus));
  } catch {}
}
function ensureGuest() {
  if (guest) return;
  guest = new WebContentsView({
    webPreferences: {
      partition: 'persist:focus-gram-instagram',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.contentView.addChildView(guest);
  guest.setVisible(false);
  const wc = guest.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    if (!isInstagram(url)) {
      event.preventDefault();
      send(
        'instagram:status',
        'This login needs an external window. Use direct Instagram login here.'
      );
    } else if (blockedRoute(url, focus)) {
      event.preventDefault();
      wc.loadURL('https://www.instagram.com/');
    }
  });
  wc.on('will-redirect', (event, url) => {
    if (!isInstagram(url)) event.preventDefault();
  });
  wc.on('dom-ready', applyFocus);
  wc.on('did-navigate-in-page', () => {
    if (blockedRoute(wc.getURL(), focus)) wc.loadURL('https://www.instagram.com/');
    else applyFocus();
  });
  wc.on('did-finish-load', () =>
    send('instagram:status', 'Instagram workspace · sign in directly to Instagram')
  );
  wc.on('did-fail-load', (_, code, description, __, isMain) => {
    if (isMain && code !== -3)
      send(
        'instagram:status',
        `Instagram could not load: ${description}. Try reopening the workspace.`
      );
  });
  wc.on('render-process-gone', () =>
    send('instagram:status', 'Instagram stopped. Reopen the workspace to retry.')
  );
  const s = wc.session;
  s.setPermissionRequestHandler((_, __, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  s.on('will-download', (_, item) => {
    const filename = path.basename(item.getFilename());
    item.setSavePath(path.join(app.getPath('downloads'), filename));
  });
}
app.whenReady().then(() => {
  protocol.handle('focus-media', (request) => {
    const id = new URL(request.url).hostname;
    const item = media.get(id);
    if (!item) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(item.path).toString(), { headers: request.headers });
  });
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 780,
    backgroundColor: '#111411',
    title: 'Focus Gram',
    icon: path.join(__dirname, '../public/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('resize', bounds);
  win.on('closed', () => {
    exportController?.abort();
    if (guest && !guest.webContents.isDestroyed()) guest.webContents.close();
    guest = null;
    win = null;
  });
  handle('media:import', async (kind) => {
    const audio = kind === 'audio';
    const result = await dialog.showOpenDialog(win, {
      title: audio ? 'Choose a soundtrack' : 'Add your clips',
      properties: audio ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [
        {
          name: audio ? 'Audio' : 'Video',
          extensions: audio
            ? ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']
            : ['mp4', 'mov', 'mkv', 'webm', 'm4v'],
        },
      ],
    });
    if (result.canceled) return [];
    const items = [];
    for (const file of result.filePaths) {
      const info = await probe(file);
      if (!info.duration || (!audio && info.kind !== 'video'))
        throw Error('That file has no playable media.');
      const id = randomUUID();
      const item = {
        ...info,
        id,
        name: path.basename(file),
        path: file,
        url: `focus-media://${id}/media`,
      };
      media.set(id, item);
      const { path: _, ...publicItem } = item;
      items.push(publicItem);
    }
    return items;
  });
  handle('media:export', async (project) => {
    if (exportController) throw Error('An export is already running.');
    const result = await dialog.showSaveDialog(win, {
      title: 'Export your reel',
      defaultPath: path.join(app.getPath('videos'), 'focus-gram-reel.mp4'),
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    });
    if (result.canceled) return null;
    exportController = new AbortController();
    try {
      const out = await exportVideo(project, media, result.filePath, {
        signal: exportController.signal,
        onProgress: (value) => send('export:progress', value),
      });
      lastExport = out.path;
      return { name: path.basename(out.path), duration: out.duration };
    } finally {
      exportController = null;
    }
  });
  handle('media:cancel', () => exportController?.abort());
  handle('media:reveal', () => {
    if (lastExport) shell.showItemInFolder(lastExport);
  });
  handle('instagram:state', async (state) => {
    if (!state || typeof state !== 'object') throw Error('Invalid workspace state');
    focus = state.focus !== false;
    guestVisible = state.visible === true;
    const page = ['stories', 'messages', 'upload'].includes(state.page) ? state.page : 'stories';
    if (guestVisible) {
      const fresh = !guest;
      ensureGuest();
      guest.setVisible(true);
      bounds();
      if (fresh || guestPage !== page) {
        guestPage = page;
        await guest.webContents.loadURL(
          page === 'messages'
            ? 'https://www.instagram.com/direct/inbox/'
            : 'https://www.instagram.com/'
        );
      }
      await applyFocus();
    } else guest?.setVisible(false);
    return true;
  });
  handle('instagram:reset', async () => {
    if (guest) {
      win.contentView.removeChildView(guest);
      guest.webContents.close();
      guest = null;
      guestCSS = null;
    }
    await session.fromPartition('persist:focus-gram-instagram').clearStorageData();
    return true;
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
