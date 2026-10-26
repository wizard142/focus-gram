const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { StoryService } = require('../electron/stories.cjs');
const { run } = require('../electron/media.cjs');
test(
  'Story service prepares standard video locally, passes session through stdin, and cleans temporary files',
  { timeout: 120000 },
  async (t) => {
    try {
      await run('ffmpeg', ['-version']);
    } catch {
      t.skip('FFmpeg is not installed');
      return;
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-story-test-'));
    try {
      const service = new StoryService(directory);
      await fs.mkdir(path.join(service.directory, 'bin'), { recursive: true });
      await fs.writeFile(path.join(service.directory, 'ready-3.2.1'), 'fixture');
      // A local fake worker verifies preparation. No Instagram request is made.
      await fs.writeFile(
        service.python,
        `#!/usr/bin/env python3
import json,sys,subprocess
p=json.load(sys.stdin)
assert p['cookies']['sessionid']=='stdin-only-secret'
assert 'stdin-only-secret' not in ' '.join(sys.argv)
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',p['file']]))
v=next(s for s in info['streams'] if s['codec_type']=='video')
a=next(s for s in info['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['codec_name'])==(1080,1920,'h264')
assert a['codec_name']=='aac'
print(json.dumps({'event':'result','ok':True,'published':True,'id':json.dumps({'file':p['file'],'thumbnail':p['thumbnail']})}))
`,
        { mode: 0o700 }
      );
      const source = path.join(directory, 'short.mp4');
      await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=320x240:r=30:d=0.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        source,
      ]);
      const result = await service.publish({ path: source, kind: 'video' }, [
        { name: 'sessionid', value: 'stdin-only-secret' },
        { name: 'ds_user_id', value: '123' },
      ]);
      assert.equal(result.published, true);
      const prepared = JSON.parse(result.id);
      await assert.rejects(() => fs.access(prepared.file));
      await assert.rejects(() => fs.access(prepared.thumbnail));
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
);
test('Story service refuses missing acknowledgement prerequisites, login and setup without any network', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-no-session-'));
  try {
    const service = new StoryService(directory);
    await assert.rejects(() => service.publish({ path: '/not-used', kind: 'image' }, []), /Set up/);
    await fs.mkdir(path.join(service.directory, 'bin'), { recursive: true });
    await fs.writeFile(path.join(service.directory, 'ready-3.2.1'), 'fixture');
    await fs.writeFile(service.python, '');
    await assert.rejects(
      () => service.publish({ path: '/not-used', kind: 'image' }, []),
      /Sign in/
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
