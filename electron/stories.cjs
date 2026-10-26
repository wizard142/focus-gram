const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { probe, run } = require('./media.cjs');
function diskPath(name) {
  return path.join(__dirname, name).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}
function workerProcess(executable, args, { input, onEvent, timeout = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', IMAGEIO_FFMPEG_EXE: 'ffmpeg' },
      windowsHide: true,
    });
    let output = '',
      failure = false;
    const timer = setTimeout(() => {
      failure = true;
      child.kill('SIGTERM');
      reject(Error('Story operation timed out. Check Instagram before trying to publish again.'));
    }, timeout);
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-64000);
      const lines = String(chunk).split('\n');
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.event === 'progress') onEvent?.(event.message);
        } catch {}
      }
    });
    // Never surface raw helper/pip logs: they may contain remote responses or session details.
    child.stderr.on('data', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        Error(
          'Python 3.11+ is required for experimental Stories. Install Python and try setup again.'
        )
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) return;
      const lines = output.trim().split('\n');
      let result;
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.event === 'result') result = item;
        } catch {}
      }
      if (result) {
        if (result.ok) resolve(result);
        else reject(Error(result.message));
      } else if (code === 0) resolve({ ok: true });
      else
        reject(
          Error(
            'Story support could not run. Check Python 3.11+, internet access, and FFmpeg, then run setup again.'
          )
        );
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ? JSON.stringify(input) : '');
  });
}
class StoryService {
  constructor(dataPath, onProgress) {
    this.directory = path.join(dataPath, 'story-runtime');
    this.python = path.join(this.directory, 'bin', 'python');
    this.onProgress = onProgress;
    this.settingUp = null;
    this.publishing = false;
  }
  async ready() {
    try {
      await fs.access(path.join(this.directory, 'ready-3.2.1'));
      await fs.access(this.python);
      return true;
    } catch {
      return false;
    }
  }
  async setup() {
    if (this.settingUp) return this.settingUp;
    this.settingUp = this._setup();
    try {
      return await this.settingUp;
    } finally {
      this.settingUp = null;
    }
  }
  async _setup() {
    if (this.publishing) throw Error('Wait for the Story upload to finish.');
    await fs.rm(path.join(this.directory, 'ready-3.2.1'), { force: true });
    this.onProgress?.('Preparing Story support…');
    await fs.mkdir(path.dirname(this.directory), { recursive: true });
    await workerProcess('python3', ['-m', 'venv', this.directory], { timeout: 60000 });
    this.onProgress?.('Installing Story dependencies…');
    await workerProcess(
      this.python,
      [
        '-m',
        'pip',
        'install',
        '--disable-pip-version-check',
        '--quiet',
        '-r',
        diskPath('requirements-stories.txt'),
      ],
      { timeout: 300000 }
    );
    await workerProcess(this.python, [diskPath('story_worker.py'), '--check'], { timeout: 30000 });
    await fs.writeFile(path.join(this.directory, 'ready-3.2.1'), 'instagrapi 3.2.1\n', {
      mode: 0o600,
    });
    return { ready: true };
  }
  async publish(file, cookies) {
    if (this.publishing) throw Error('A Story upload is already running.');
    if (!(await this.ready())) throw Error('Set up Story support first.');
    const sessionid = cookies.find((c) => c.name === 'sessionid')?.value,
      userid = cookies.find((c) => c.name === 'ds_user_id')?.value;
    if (!sessionid || !userid) throw Error('Sign in to Instagram first.');
    this.publishing = true;
    let temp;
    try {
      let mediaPath = file.path,
        thumbnail;
      if (file.kind === 'video') {
        const info = await probe(file.path);
        if (info.duration > 60.1)
          throw Error(
            'Experimental video Stories are limited to 60 seconds. Trim the video in your editor first.'
          );
        temp = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-story-'));
        mediaPath = path.join(temp, 'story.mp4');
        thumbnail = path.join(temp, 'cover.jpg');
        this.onProgress?.('Preparing video…');
        const args = ['-y', '-i', file.path];
        if (!info.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
        args.push(
          '-map',
          '0:v:0',
          '-map',
          info.hasAudio ? '0:a:0' : '1:a:0',
          '-t',
          String(info.duration),
          '-vf',
          'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-movflags',
          '+faststart',
          mediaPath
        );
        await run('ffmpeg', args);
        await run('ffmpeg', ['-y', '-i', mediaPath, '-frames:v', '1', thumbnail]);
      }
      const result = await workerProcess(this.python, [diskPath('story_worker.py')], {
        input: {
          file: mediaPath,
          thumbnail,
          kind: file.kind,
          cookies: Object.fromEntries(
            cookies
              .filter((c) => ['sessionid', 'ds_user_id', 'csrftoken', 'mid'].includes(c.name))
              .map((c) => [c.name, c.value])
          ),
        },
        onEvent: this.onProgress,
      });
      return { published: result.published === true, id: result.id };
    } finally {
      this.publishing = false;
      if (temp) await fs.rm(temp, { recursive: true, force: true });
    }
  }
}
module.exports = { StoryService, workerProcess };
