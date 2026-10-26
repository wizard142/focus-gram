const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
function run(command, args, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal, windowsHide: true });
    let output = '',
      error = '';
    child.stdout.on('data', (d) => {
      output += d;
      onProgress?.(String(d));
    });
    child.stderr.on('data', (d) => {
      error = (error + d).slice(-12000);
    });
    child.on('error', (e) =>
      reject(
        new Error(
          e.name === 'AbortError'
            ? 'Export cancelled.'
            : e.code === 'ENOENT'
              ? `${command} is missing. Install ffmpeg and restart Focus Gram.`
              : e.message
        )
      )
    );
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              signal?.aborted ? 'Export cancelled.' : error || `${command} exited with ${code}`
            )
          )
    );
  });
}
async function probe(file) {
  const data = JSON.parse(
    await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file])
  );
  const video = data.streams.find((s) => s.codec_type === 'video');
  return {
    duration: Number(data.format.duration) || 0,
    width: video?.width || 0,
    height: video?.height || 0,
    hasAudio: data.streams.some((s) => s.codec_type === 'audio'),
    kind: video ? 'video' : 'audio',
  };
}
function validateProject(project, media) {
  if (
    !project ||
    !Array.isArray(project.clips) ||
    !project.clips.length ||
    project.clips.length > 30
  )
    throw Error('Add between 1 and 30 clips.');
  const clips = project.clips.map((clip) => {
    const item = media.get(clip.id);
    if (!item || item.kind !== 'video') throw Error('A clip is missing. Import it again.');
    const start = Number(clip.start),
      end = Number(clip.end);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > item.duration + 0.05 ||
      end - start < 0.1
    )
      throw Error('Each trim must be within the source clip and at least 0.1 seconds.');
    return { ...item, start, end };
  });
  if (clips.reduce((s, c) => s + c.end - c.start, 0) > 1800)
    throw Error('Projects must be under 30 minutes.');
  const soundtrack = project.soundtrack ? media.get(project.soundtrack) : null;
  if (project.soundtrack && (!soundtrack || !soundtrack.hasAudio))
    throw Error('Soundtrack is missing or has no audio.');
  return {
    clips,
    soundtrack,
    width: project.quality === '1080' ? 1080 : 720,
    height: project.quality === '1080' ? 1920 : 1280,
    fit: project.fit === 'contain' ? 'contain' : 'cover',
    text: String(project.text || '').slice(0, 180),
    volume: Math.min(1, Math.max(0, Number(project.volume) || 0)),
    musicVolume: Math.min(1, Math.max(0, Number(project.musicVolume) || 0)),
    textPosition: ['top', 'center', 'bottom'].includes(project.textPosition)
      ? project.textPosition
      : 'bottom',
  };
}
async function exportVideo(project, media, destination, { signal, onProgress = () => {} } = {}) {
  const p = validateProject(project, media);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-gram-'));
  const duration = p.clips.reduce((s, c) => s + c.end - c.start, 0);
  let done = 0;
  const files = [];
  try {
    const textfile = path.join(temp, 'title.txt');
    await fs.writeFile(textfile, p.text);
    let font = '';
    for (const f of [
      '/usr/share/fonts/TTF/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]) {
      try {
        await fs.access(f);
        font = `fontfile='${f}':`;
        break;
      } catch {}
    }
    for (let index = 0; index < p.clips.length; index++) {
      const clip = p.clips[index],
        length = clip.end - clip.start,
        output = path.join(temp, `clip-${index}.mp4`);
      const args = ['-y', '-ss', String(clip.start), '-i', clip.path];
      if (!clip.hasAudio)
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
      let vf =
        p.fit === 'cover'
          ? `scale=${p.width}:${p.height}:force_original_aspect_ratio=increase,crop=${p.width}:${p.height}`
          : `scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease,pad=${p.width}:${p.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
      vf += ',setsar=1,fps=30';
      if (p.text) {
        const y =
          p.textPosition === 'top'
            ? 'h*0.12'
            : p.textPosition === 'center'
              ? '(h-text_h)/2'
              : 'h*0.78';
        vf += `,drawtext=${font}textfile='${textfile}':expansion=none:fontcolor=white:fontsize=${Math.round(p.width * 0.048)}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.45:boxborderw=16`;
      }
      args.push(
        '-t',
        String(length),
        '-map',
        '0:v:0',
        '-map',
        clip.hasAudio ? '0:a:0' : '1:a:0',
        '-vf',
        vf,
        '-af',
        `volume=${p.volume},aresample=48000,apad`,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-video_track_timescale',
        '15360',
        '-progress',
        'pipe:1',
        '-nostats',
        output
      );
      await run('ffmpeg', args, {
        signal,
        onProgress: (chunk) => {
          const m = chunk.match(/out_time_us=(\d+)/);
          if (m) onProgress(Math.min(92, ((done + Number(m[1]) / 1e6) / duration) * 92));
        },
      });
      done += length;
      files.push(output);
    }
    const list = path.join(temp, 'concat.txt');
    await fs.writeFile(list, files.map((f) => `file '${f}'`).join('\n'));
    const assembled = path.join(temp, 'assembled.mp4');
    await run(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        assembled,
      ],
      { signal }
    );
    const final = path.join(temp, 'final.mp4');
    if (p.soundtrack) {
      await run(
        'ffmpeg',
        [
          '-y',
          '-i',
          assembled,
          '-stream_loop',
          '-1',
          '-i',
          p.soundtrack.path,
          '-filter_complex',
          `[1:a]volume=${p.musicVolume}[music];[0:a][music]amix=inputs=2:duration=first:normalize=0[a]`,
          '-map',
          '0:v',
          '-map',
          '[a]',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-t',
          String(duration),
          '-movflags',
          '+faststart',
          final,
        ],
        { signal }
      );
    } else await fs.rename(assembled, final);
    if (signal?.aborted) throw Error('Export cancelled.');
    // Only a complete export replaces the destination.
    await fs.copyFile(final, destination);
    onProgress(100);
    return { path: destination, duration };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
module.exports = { run, probe, validateProject, exportVideo };
