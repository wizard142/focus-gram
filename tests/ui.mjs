import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
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
    const timeout = setTimeout(() => reject(Error('Vite did not start')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes('5198')) {
        clearTimeout(timeout);
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
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5198');
  await page.getByRole('heading', { name: /A little more creating/ }).waitFor();
  await page.screenshot({ path: path.join(output, 'studio.png'), fullPage: true });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await page.locator('video').waitFor();
  await page.getByRole('button', { name: 'Play preview', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByLabel('Text overlay').fill('Create more. Scroll less.');
  await page.getByRole('button', { name: 'center', exact: true }).click();
  assert.equal(
    await page.locator('.text-overlay.center').textContent(),
    'Create more. Scroll less.'
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Trim start').fill('1');
  await page.getByLabel('Trim end').fill('6');
  assert.match(await page.locator('.timeline-title').textContent(), /00:05/);
  await page.getByRole('switch', { name: 'Focus mode', exact: true }).click();
  assert.equal(
    await page
      .getByRole('switch', { name: 'Focus mode', exact: true })
      .getAttribute('aria-checked'),
    'false'
  );
  await page.reload();
  assert.equal(
    await page
      .getByRole('switch', { name: 'Focus mode', exact: true })
      .getAttribute('aria-checked'),
    'false'
  );
  await page.getByRole('switch', { name: 'Focus mode', exact: true }).click();
  // Browser imports use the same UI editing path as desktop imports.
  await page
    .locator('input[type=file][accept="video/*"]')
    .setInputFiles(path.join(root, 'public/demo.mp4'));
  await page
    .getByRole('button', { name: 'Export reel', exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    document.querySelector('.timeline-title')?.textContent.includes('1 clip')
  );
  await page.getByLabel('Trim start').fill('1');
  await page.getByLabel('Trim end').fill('7');
  await page.getByRole('button', { name: 'Export reel', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').textContent(), /require the desktop app/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'editor.png'), fullPage: true });
  await page.getByRole('button', { name: /Made something you love/ }).click();
  await page.getByLabel('Your caption', { exact: true }).fill('Made with Focus Gram.');
  await page.screenshot({ path: path.join(output, 'publish.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Stories', exact: true }).click();
  await page.getByRole('heading', { name: 'Your people. Less noise.' }).waitFor();
  await page.getByRole('button', { name: 'Back to studio', exact: true }).click();
  await page.getByLabel('Remove clip 1', { exact: true }).click();
  assert.match(await page.locator('.timeline-title').textContent(), /0 clips/);
  // Exercise focus injection against a representative DOM, including Story articles and login forms.
  const fixture = await browser.newPage();
  await fixture.route('https://www.instagram.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main><div id="stories"><a href="/stories/friend/1/">Story</a></div><article id="post">A feed post</article><a id="reel" href="/reels/">Reels</a><a id="dm" href="/direct/inbox/">Messages</a></main>',
    })
  );
  await fixture.goto('https://www.instagram.com/');
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(await fixture.locator('#post').isVisible(), false);
  assert.equal(await fixture.locator('#reel').isVisible(), false);
  assert.equal(await fixture.locator('#stories').isVisible(), true);
  assert.equal(await fixture.locator('#dm').isVisible(), true);
  await fixture.evaluate(installFocus(false));
  assert.equal(await fixture.locator('#post').isVisible(), true);
  await fixture.goto('https://www.instagram.com/stories/friend/1/');
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(
    await fixture.locator('#post').isVisible(),
    true,
    'Story viewer articles must remain visible'
  );
  await fixture.goto('https://www.instagram.com/');
  await fixture
    .locator('main')
    .innerHTML()
    .then(async () =>
      fixture.evaluate(() => {
        document.querySelector('main').innerHTML =
          '<article id="login"><form><input placeholder="Username"/></form></article>';
      })
    );
  await fixture.addStyleTag({ content: focusCSS });
  await fixture.evaluate(installFocus(true));
  assert.equal(
    await fixture.locator('#login').isVisible(),
    true,
    'Login forms must remain visible'
  );
  assert.deepEqual(errors, []);
  console.log(
    'UI passed: import, trim, preview, text, export gating, focus persistence, publish, removal, and focus DOM fixtures.'
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
