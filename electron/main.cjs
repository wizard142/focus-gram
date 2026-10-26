const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  dialog,
  protocol,
  net,
  session,
  nativeImage,
  nativeTheme,
  clipboard,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { probe } = require('./media.cjs');
const { isInstagram, blockedRoute, focusCSS, installFocus, themeScript } = require('./policy.cjs');
const { attachFile } = require('./uploads.cjs');
const { StoryService } = require('./stories.cjs');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'focus-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
let win,
  guest,
  guestCSS,
  stories,
  focus = true,
  theme = 'light',
  visible = false,
  page = 'home',
  viewport = { x: 0, y: 76, width: 1280, height: 784 };
const media = new Map();
const status = (type, message) => {
  if (win && !win.isDestroyed()) win.webContents.send('app:status', { type, message });
};
function handle(name, fn) {
  ipcMain.handle(name, (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw Error('Untrusted request.');
    return fn(...args);
  });
}
function setBounds() {
  if (!win || !guest) return;
  const [width, height] = win.getContentSize();
  const x = Math.max(0, Math.min(width, Math.round(viewport.x))),
    y = Math.max(0, Math.min(height, Math.round(viewport.y)));
  guest.setBounds({
    x,
    y,
    width: Math.max(0, Math.min(width - x, Math.round(viewport.width))),
    height: Math.max(0, Math.min(height - y, Math.round(viewport.height))),
  });
}
async function apply() {
  const view = guest;
  if (!view || view.webContents.isDestroyed()) return;
  try {
    if (guestCSS) await view.webContents.removeInsertedCSS(guestCSS);
    guestCSS = await view.webContents.insertCSS(focusCSS);
    await view.webContents.executeJavaScript(installFocus(focus));
    await view.webContents.executeJavaScript(themeScript(theme));
  } catch {
    // Navigation can replace the document while its settings are being applied.
  } finally {
    if (guest === view && !view.webContents.isDestroyed()) view.setVisible(visible);
  }
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
  setBounds();
  const wc = guest.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    if (!isInstagram(url)) {
      event.preventDefault();
      status('error', 'External navigation was blocked. Use direct Instagram login.');
    } else if (blockedRoute(url, focus)) {
      event.preventDefault();
      status('notice', 'Posts and Reels are blocked while focus mode is on.');
    }
  });
  wc.on('will-redirect', (event, url) => {
    if (!isInstagram(url)) event.preventDefault();
  });
  // Loading also fires for in-page updates, which may never emit dom-ready.
  // Only explicit app dialogs should hide an existing Instagram view.
  wc.on('did-stop-loading', () => {
    if (guest?.webContents === wc && !wc.isDestroyed()) guest.setVisible(visible);
  });
  wc.on('dom-ready', apply);
  wc.on('did-navigate-in-page', () => {
    if (blockedRoute(wc.getURL(), focus)) wc.loadURL('https://www.instagram.com/');
    else apply();
  });
  wc.on('did-fail-load', (_, code, description, __, isMain) => {
    if (isMain && code !== -3)
      status('error', `Instagram could not load: ${description}. Use Reload to retry.`);
  });
  wc.on('render-process-gone', () => status('error', 'Instagram stopped. Use Reload to retry.'));
  wc.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  wc.session.setPermissionCheckHandler(() => false);
}
async function navigate(next) {
  ensureGuest();
  const target =
    next === 'messages' ? 'https://www.instagram.com/direct/inbox/' : 'https://www.instagram.com/';
  if (!guest.webContents.getURL() || page !== next) {
    page = next;
    try {
      await guest.webContents.loadURL(target);
    } catch (error) {
      if (error.code !== 'ERR_ABORTED')
        throw Error('Instagram could not load. Use Reload to retry.');
    }
  }
  await apply();
}
app.whenReady().then(() => {
  stories = new StoryService(app.getPath('userData'), (message) => status('progress', message));
  protocol.handle('focus-media', (request) => {
    const item = media.get(new URL(request.url).hostname);
    if (!item) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(item.path).toString(), { headers: request.headers });
  });
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#faf9f7',
    title: 'Focus Gram',
    icon: path.join(__dirname, '../dist/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('resize', setBounds);
  win.on('closed', () => {
    if (guest && !guest.webContents.isDestroyed()) guest.webContents.close();
    guest = null;
    win = null;
  });
  handle('instagram:bounds', (value) => {
    if (
      !value ||
      !['x', 'y', 'width', 'height'].every(
        (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
      )
    )
      return;
    viewport = value;
    setBounds();
  });
  handle('instagram:state', async (state) => {
    if (!state || typeof state !== 'object') throw Error('Invalid workspace state.');
    focus = state.focus !== false;
    visible = state.visible === true;
    if (visible) await navigate(state.page === 'messages' ? 'messages' : 'home');
    else guest?.setVisible(false);
    return true;
  });
  handle('app:theme', async (value) => {
    theme = value === 'dark' ? 'dark' : 'light';
    nativeTheme.themeSource = theme;
    win.setBackgroundColor(theme === 'dark' ? '#171717' : '#faf9f7');
    await apply();
  });
  handle('instagram:refresh', async () => {
    ensureGuest();
    const wc = guest.webContents;
    try {
      await wc.loadURL(
        wc.isCrashed() ? 'https://www.instagram.com/' : wc.getURL() || 'https://www.instagram.com/'
      );
    } finally {
      await apply();
    }
  });
  handle('instagram:reset', async () => {
    if (stories.publishing) throw Error('Wait for the Story upload to finish.');
    if (guest) {
      win.contentView.removeChildView(guest);
      guest.webContents.close();
      guest = null;
      guestCSS = null;
    }
    await session.fromPartition('persist:focus-gram-instagram').clearStorageData();
    await navigate('home');
  });
  handle('upload:select', async (kind) => {
    const result = await dialog.showOpenDialog(win, {
      title:
        kind === 'story' ? 'Choose a Story' : kind === 'reel' ? 'Choose a reel' : 'Choose a post',
      properties: ['openFile'],
      filters: [
        {
          name: kind === 'reel' ? 'Video' : 'Photo or video',
          extensions: kind === 'reel' ? ['mp4'] : ['jpg', 'jpeg', 'png', 'webp', 'mp4'],
        },
      ],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0],
      info = await fs.stat(file);
    if (info.size > 500 * 1024 * 1024) throw Error('Choose a file smaller than 500 MB.');
    const id = randomUUID(),
      isVideo = path.extname(file).toLowerCase() === '.mp4';
    let details;
    if (isVideo) {
      details = await probe(file);
      if (details.kind !== 'video') throw Error('That file is not a video.');
    } else {
      const image = nativeImage.createFromPath(file);
      if (image.isEmpty()) throw Error('That image could not be opened.');
      details = { kind: 'image', ...image.getSize() };
    }
    const item = {
      ...details,
      id,
      path: file,
      name: path.basename(file),
      url: `focus-media://${id}/media`,
    };
    media.set(id, item);
    const { path: _, ...safe } = item;
    return safe;
  });
  handle('upload:composer', async (payload) => {
    const file = media.get(payload?.id);
    if (!file) throw Error('Choose a file first.');
    if (!['post', 'reel'].includes(payload.kind)) throw Error('Invalid upload type.');
    if (payload.kind === 'reel' && file.kind !== 'video') throw Error('Choose a video for a reel.');
    const cookies = await session
      .fromPartition('persist:focus-gram-instagram')
      .cookies.get({ url: 'https://www.instagram.com/' });
    if (!cookies.some((c) => c.name === 'sessionid')) throw Error('Sign in to Instagram first.');
    await navigate('home');
    await attachFile(guest.webContents, file, payload.kind);
    const caption = String(payload.caption || '').slice(0, 2200);
    if (caption) clipboard.writeText(caption);
    visible = true;
    guest.setVisible(true);
    return {
      message: caption
        ? 'File loaded. Caption copied—paste it and finish sharing in Instagram.'
        : 'File loaded. Finish sharing in Instagram.',
    };
  });
  handle('story:capabilities', async () => ({ ready: await stories.ready(), experimental: true }));
  handle('story:prepare', () => stories.setup());
  handle('story:publish', async (payload) => {
    if (payload?.acknowledged !== true)
      throw Error('Acknowledge the experimental integration before publishing.');
    const file = media.get(payload.id);
    if (!file) throw Error('Choose a Story file first.');
    const cookies = await session
      .fromPartition('persist:focus-gram-instagram')
      .cookies.get({ url: 'https://www.instagram.com/' });
    return stories.publish(file, cookies);
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());
