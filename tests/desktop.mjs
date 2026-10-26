import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-desktop-'));
let app;
try {
  app = await electron.launch({
    ...(process.env.FG_DESKTOP_BINARY ? { executablePath: process.env.FG_DESKTOP_BINARY } : {}),
    args: [...(process.env.FG_DESKTOP_BINARY ? [] : [root]), `--user-data-dir=${temp}/profile`],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: /A little more creating/ }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.focusGram)), true);
  const video = path.join(root, 'public/demo.mp4'),
    output = path.join(temp, 'native-export.mp4');
  await app.evaluate(
    ({ dialog }, { video, output }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [video] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    },
    { video, output }
  );
  await page.getByRole('button', { name: 'New clips', exact: true }).click();
  await page.getByLabel('Trim end', { exact: true }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.timeline-title')?.textContent.includes('1 clip')
  );
  await page.getByLabel('Trim start', { exact: true }).fill('1');
  await page.getByLabel('Trim end', { exact: true }).fill('2');
  await page.getByLabel('Export quality', { exact: true }).selectOption('720');
  await page.getByRole('button', { name: 'Export reel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Show exported reel', exact: true })
    .waitFor({ timeout: 60000 });
  assert.ok((await fs.stat(output)).size > 1000);
  await page.getByRole('button', { name: 'Stories', exact: true }).click();
  await page.waitForTimeout(2500);
  const guest = await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((w) => w.getURL().includes('instagram.com'))
      .map((w) => ({ url: w.getURL(), prefs: w.getLastWebPreferences() }))
  );
  assert.equal(guest.length, 1);
  assert.equal(guest[0].prefs.nodeIntegration, false);
  assert.equal(guest[0].prefs.sandbox, true);
  assert.equal(guest[0].prefs.contextIsolation, true);
  assert.equal(guest[0].prefs.preload, undefined);
  await page.getByRole('button', { name: 'Back to studio', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'docs/screenshots/desktop.png'), fullPage: true });
  console.log(
    'Desktop passed: isolated preload bridge, native import, FFmpeg export, and sandboxed Instagram guest.'
  );
} finally {
  await app?.close();
  await fs.rm(temp, { recursive: true, force: true });
}
