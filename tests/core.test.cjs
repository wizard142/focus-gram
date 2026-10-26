const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isInstagram, blockedRoute, installFocus, themeScript } = require('../electron/policy.cjs');
const { attachFile } = require('../electron/uploads.cjs');
test('focus blocks consumption routes but permits Stories, messages and creation', () => {
  for (const route of ['/p/a/', '/reel/a/', '/reels/', '/explore/'])
    assert.equal(blockedRoute('https://www.instagram.com' + route), true);
  for (const route of [
    '/',
    '/direct/inbox/',
    '/stories/friend/1/',
    '/create/select/',
    '/accounts/login/',
  ])
    assert.equal(blockedRoute('https://www.instagram.com' + route), false);
  assert.equal(blockedRoute('https://www.instagram.com/reels/', false), false);
});
test('remote origin validation rejects lookalikes and unsafe protocols', () => {
  for (const value of [
    'https://instagram.com.evil.test/',
    'http://instagram.com/',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])
    assert.equal(isInstagram(value), false);
  assert.equal(isInstagram('https://www.instagram.com/'), true);
});
test('page scripts parse and do not add marketing text', () => {
  for (const script of [
    installFocus(true),
    installFocus(false),
    themeScript('dark'),
    themeScript('light'),
  ])
    assert.doesNotThrow(() => new Function(script));
  assert.doesNotMatch(installFocus(true), /createElement|headspace|scroll can wait/);
});
test('composer loads selected file into Instagram without exporting or publishing', async () => {
  const commands = [];
  let attached = false;
  const wc = {
    getURL: () => 'https://www.instagram.com/',
    isDestroyed: () => false,
    executeJavaScript: async () => true,
    debugger: {
      isAttached: () => attached,
      attach: () => {
        attached = true;
      },
      detach: () => {
        attached = false;
      },
      sendCommand: async (name, args) => {
        commands.push({ name, args });
        if (name === 'DOM.getDocument') return { root: { nodeId: 1 } };
        if (name === 'DOM.querySelector') return { nodeId: 2 };
        return {};
      },
    },
  };
  await attachFile(wc, { path: '/selected/finished.mp4' }, 'reel', { wait: async () => {} });
  assert.deepEqual(commands.at(-1), {
    name: 'DOM.setFileInputFiles',
    args: { nodeId: 2, files: ['/selected/finished.mp4'] },
  });
  assert.equal(attached, false);
});
test('composer failures are reported rather than claiming success', async () => {
  const wc = {
    getURL: () => 'https://www.instagram.com/',
    executeJavaScript: async () => false,
    isDestroyed: () => false,
  };
  await assert.rejects(
    () => attachFile(wc, { path: '/clip.mp4' }, 'reel', { wait: async () => {} }),
    /Create button was not found/
  );
  await assert.rejects(
    () => attachFile({ getURL: () => 'https://evil.test/' }, { path: '/clip.mp4' }, 'reel'),
    /sign in/
  );
});
