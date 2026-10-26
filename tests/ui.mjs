import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { focusCSS, installFocus } = require('../electron/policy.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.FG_SCREENSHOTS || path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5198'],
  { cwd: root, stdio: 'pipe' }
);
let browser;
const errors = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Vite startup timed out')), 20000);
    server.stdout.on('data', (chunk) => {
      if (String(chunk).includes('5198')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('error', reject);
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.FG_CHROMIUM ? { executablePath: process.env.FG_CHROMIUM } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5198');
  await page.getByRole('heading', { name: 'Instagram', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'light.png') });
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: path.join(output, 'dark.png') });
  await page.getByRole('switch', { name: 'Focus mode', exact: true }).click();
  await page.reload();
  assert.equal(
    await page
      .getByRole('switch', { name: 'Focus mode', exact: true })
      .getAttribute('aria-checked'),
    'false'
  );
  await page.getByRole('switch', { name: 'Focus mode', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('tab', { name: 'Reel', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(root, 'tests/fixtures/reel.mp4'));
  await page.getByLabel('Caption', { exact: true }).fill('A finished project.');
  await page.screenshot({ path: path.join(output, 'create.png') });
  await page.getByRole('button', { name: 'Continue in Instagram', exact: true }).click();
  assert.match(await page.getByRole('alert').textContent(), /desktop app/);
  await page.getByRole('tab', { name: /Story/ }).click();
  await page.getByRole('button', { name: 'Enable experimental Stories', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(root, 'public/icon.png'));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publish Story', exact: true }).click();
  assert.match(await page.getByRole('alert').textContent(), /desktop app/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  const fixture = await browser.newPage();
  const markup =
    '<main><div id="stories"><a href="/stories/friend/1/">Story</a></div><article id="post">Post<form><input placeholder="Add a comment"/></form></article><a id="reel" href="/reels/">Reels</a><a id="dm" href="/direct/inbox/">Messages</a><button id="create">Create</button></main>';
  await fixture.route('https://www.instagram.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: markup })
  );
  await fixture.goto('https://www.instagram.com/');
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(await fixture.locator('#post').isVisible(), false);
  assert.equal(await fixture.locator('#reel').isVisible(), false);
  assert.equal(await fixture.locator('#stories').isVisible(), true);
  assert.equal(await fixture.locator('#dm').isVisible(), true);
  assert.equal(await fixture.locator('#create').isVisible(), true);
  await fixture.evaluate(installFocus(false));
  assert.equal(await fixture.locator('#post').isVisible(), true);
  await fixture.goto('https://www.instagram.com/stories/friend/1/');
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(await fixture.locator('#post').isVisible(), true);
  await fixture.goto('https://www.instagram.com/');
  await fixture.evaluate(
    () =>
      (document.querySelector('main').innerHTML =
        '<article id="login"><form><input name="username"/><input type="password"/></form></article>')
  );
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(await fixture.locator('#login').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    'UI passed: themes, persistence, focus, upload controls, Story acknowledgement, honest browser limitations, and filtering fixtures.'
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
