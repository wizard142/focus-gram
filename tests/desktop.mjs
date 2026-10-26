import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-desktop-'));
let app;
try {
  app = await electron.launch({
    ...(process.env.FG_DESKTOP_BINARY ? { executablePath: process.env.FG_DESKTOP_BINARY } : {}),
    args: [...(process.env.FG_DESKTOP_BINARY ? [] : [root]), `--user-data-dir=${temp}/profile`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Create', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.focusGram)), true);
  // Intercept Instagram before testing composer behavior. Never log in or publish to a real account.
  await app.evaluate(async ({ session, webContents }) => {
    const s = session.fromPartition('persist:focus-gram-instagram');
    s.protocol.handle(
      'https',
      () =>
        new Response(
          `<html><body><main><div id="stories">Stories</div><article id="post">Feed post<form><input placeholder="Comment"/></form></article><button aria-label="Create" onclick="document.getElementById('picker').style.display='block'">Create</button><div id="picker" role="dialog" style="display:none"><input type="file" accept="image/jpeg,video/mp4" multiple onchange="document.body.dataset.selected=this.files[0]?.name"/></div></main></body></html>`,
          { headers: { 'content-type': 'text/html' } }
        )
    );
    let remote;
    for (let attempt = 0; attempt < 50; attempt++) {
      remote = webContents.getAllWebContents().find((w) => w.session === s);
      if (remote) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    if (!remote) throw Error('Instagram guest was not created');
    await remote.loadURL('https://www.instagram.com/');
  });
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark');
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  const fixture = path.join(root, 'tests/fixtures/reel.mp4');
  await app.evaluate(({ dialog }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
  }, fixture);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('tab', { name: 'Reel', exact: true }).click();
  await page.getByRole('button', { name: /Choose a video/ }).click();
  await page.getByLabel('Caption', { exact: true }).fill('Ready to share.');
  await page.getByRole('button', { name: 'Continue in Instagram', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /Sign in/);
  await app.evaluate(async ({ session }) => {
    await session.fromPartition('persist:focus-gram-instagram').cookies.set({
      url: 'https://www.instagram.com/',
      name: 'sessionid',
      value: 'test-session-not-real',
    });
  });
  await page.getByRole('button', { name: 'Continue in Instagram', exact: true }).click();
  await page
    .waitForFunction(() => !document.querySelector('[role=dialog]'))
    .catch(async (error) => {
      console.log('Composer UI:', await page.locator('[role=alert]').allTextContents());
      console.log(
        'Guest:',
        await app.evaluate(({ webContents }) =>
          webContents.getAllWebContents().map((w) => ({ url: w.getURL() }))
        )
      );
      throw error;
    });
  const received = await app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('instagram.com'));
    return {
      file: await wc.executeJavaScript('document.body.dataset.selected'),
      prefs: wc.getLastWebPreferences(),
      hidden: await wc.executeJavaScript(
        'getComputedStyle(document.getElementById("post")).display'
      ),
    };
  });
  assert.equal(received.file, 'reel.mp4');
  assert.equal(received.hidden, 'none');
  assert.equal(received.prefs.nodeIntegration, false);
  assert.equal(received.prefs.contextIsolation, true);
  assert.equal(received.prefs.sandbox, true);
  assert.equal(received.prefs.preload, undefined);
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Ready to share.');
  if (process.env.FG_TEST_STORY_SETUP === '1') {
    await page.evaluate(() => window.focusGram.prepareStories());
    assert.equal((await page.evaluate(() => window.focusGram.storyCapabilities())).ready, true);
  }
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/desktop.png') });
  console.log(
    'Desktop passed: native themes, file selection, authenticated composer transfer, caption handoff, focus filtering and guest sandbox. No real posts were made.'
  );
} catch (error) {
  if (app) {
    const windows = await app.windows();
    if (windows[0]) {
      await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
      await windows[0]
        .screenshot({ path: path.join(root, 'test-results/desktop-failure.png') })
        .catch(() => {});
      console.log(
        'Main dialog:',
        await windows[0]
          .locator('[role=dialog]')
          .allTextContents()
          .catch(() => [])
      );
    }
  }
  throw error;
} finally {
  await app?.close();
  await fs.rm(temp, { recursive: true, force: true });
}
