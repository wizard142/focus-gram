const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { isInstagram, blockedRoute, installFocus } = require('../electron/policy.cjs');
const { validateProject, run, probe, exportVideo } = require('../electron/media.cjs');
test('focus blocks content routes but preserves Stories, inbox, create and login', () => {
  for (const route of ['/reel/a/', '/reels/', '/p/123/', '/explore/', '/reels'])
    assert.equal(blockedRoute(`https://www.instagram.com${route}`), true, route);
  for (const route of [
    '/',
    '/stories/friend/123/',
    '/direct/inbox/',
    '/accounts/login/',
    '/create/style/',
    '/friend/',
  ])
    assert.equal(blockedRoute(`https://www.instagram.com${route}`), false, route);
  assert.equal(blockedRoute('https://www.instagram.com/reels/', false), false);
});
test('Instagram origin check rejects lookalikes and unsafe protocols', () => {
  assert.equal(isInstagram('https://instagram.com/'), true);
  for (const url of [
    'https://instagram.com.evil.test/',
    'http://instagram.com/',
    'file:///instagram.com',
    'javascript:alert(1)',
    'https://evil.test/',
  ])
    assert.equal(isInstagram(url), false, url);
});
test('focus injection is valid JavaScript and can be disabled', () => {
  assert.doesNotThrow(() => new Function(installFocus(true)));
  assert.match(installFocus(false), /enabled=false/);
});
const media = new Map([
  ['clip', { id: 'clip', path: '/tmp/source.mp4', duration: 12, kind: 'video', hasAudio: true }],
]);
test('export rejects missing files and malformed trims before spawning FFmpeg', () => {
  for (const project of [
    { clips: [] },
    { clips: [{ id: 'absent', start: 0, end: 2 }] },
    { clips: [{ id: 'clip', start: -1, end: 2 }] },
    { clips: [{ id: 'clip', start: 5, end: 2 }] },
    { clips: [{ id: 'clip', start: 0, end: 50 }] },
    { clips: [{ id: 'clip', start: 0, end: NaN }] },
  ])
    assert.throws(() => validateProject(project, media));
  const valid = validateProject(
    { clips: [{ id: 'clip', start: 1, end: 3 }], text: 'hello', volume: 10, quality: '1080' },
    media
  );
  assert.equal(valid.volume, 1);
  assert.equal(valid.height, 1920);
});
test(
  'FFmpeg exports multiple trimmed clips, overlays literal text and mixes a soundtrack',
  { timeout: 120000 },
  async (t) => {
    try {
      await run('ffmpeg', ['-version']);
    } catch {
      t.skip('FFmpeg not installed');
      return;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-test-'));
    try {
      const video = path.join(dir, 'source.mp4'),
        sound = path.join(dir, 'music.wav'),
        out = path.join(dir, 'reel.mp4');
      await run('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x4b6841:s=320x240:r=30:d=1.6',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        video,
      ]);
      await run('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-c:a',
        'pcm_s16le',
        sound,
      ]);
      const v = await probe(video),
        a = await probe(sound);
      const files = new Map([
        ['v', { ...v, id: 'v', path: video }],
        ['a', { ...a, id: 'a', path: sound }],
      ]);
      let progress = 0;
      await exportVideo(
        {
          clips: [
            { id: 'v', start: 0.2, end: 0.8 },
            { id: 'v', start: 0.8, end: 1.4 },
          ],
          quality: '720',
          fit: 'contain',
          text: '100% focus: creator’s cut',
          textPosition: 'bottom',
          volume: 0.8,
          musicVolume: 0.2,
          soundtrack: 'a',
        },
        files,
        out,
        { onProgress: (p) => (progress = p) }
      );
      const result = await probe(out);
      assert.equal(result.width, 720);
      assert.equal(result.height, 1280);
      assert.equal(result.hasAudio, true);
      assert.ok(Math.abs(result.duration - 1.2) < 0.15);
      assert.equal(progress, 100);
      await fs.writeFile(out, 'previous export');
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(() =>
        exportVideo({ clips: [{ id: 'v', start: 0, end: 0.5 }], quality: '720' }, files, out, {
          signal: controller.signal,
        })
      );
      assert.equal(await fs.readFile(out, 'utf8'), 'previous export');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
);
