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
module.exports = { run, probe };
