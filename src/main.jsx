import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Aperture,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  Download,
  Film,
  Focus,
  FolderOpen,
  GripVertical,
  Image,
  Instagram,
  Layers,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import './style.css';
const native = window.focusGram;
const format = (s) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
const defaults = {
  title: 'A little more outside',
  text: 'Less scrolling. More living.',
  textPosition: 'bottom',
  fit: 'cover',
  volume: 0.85,
  musicVolume: 0.35,
  quality: '1080',
  caption: 'A little reminder to look up. 🌿\n\n#CreateMore #FocusGram',
};
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={17} />
    </button>
  );
}
function App() {
  const [page, setPage] = useState('studio'),
    [focus, setFocus] = useState(() => localStorage.getItem('fg-focus') !== 'false'),
    [tab, setTab] = useState('edit');
  const [settings, setSettings] = useState(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem('fg-settings') || '{}') };
    } catch {
      return defaults;
    }
  });
  const [clips, setClips] = useState([]),
    [selected, setSelected] = useState(0),
    [audio, setAudio] = useState(null),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [exported, setExported] = useState(null),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(null),
    [status, setStatus] = useState(
      'Connect directly to Instagram. Your login stays on this device.'
    ),
    [demo, setDemo] = useState(false),
    [importing, setImporting] = useState(false);
  const video = useRef(null),
    audioPlayer = useRef(null),
    fileInput = useRef(null),
    audioInput = useRef(null),
    urls = useRef([]);
  const current = clips[selected],
    total = clips.reduce((s, c) => s + c.end - c.start, 0),
    offset = clips.slice(0, selected).reduce((s, c) => s + c.end - c.start, 0);
  const update = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
  const notify = (message) => setToast(message);
  useEffect(() => {
    localStorage.setItem('fg-settings', JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    localStorage.setItem('fg-focus', String(focus));
  }, [focus]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => native?.onExportProgress(setProgress), []);
  useEffect(() => native?.onInstagramStatus(setStatus), []);
  useEffect(() => {
    native
      ?.setInstagram({
        visible: ['stories', 'messages', 'upload'].includes(page) && !modal,
        focus,
        page,
      })
      .catch((e) => setStatus(e.message));
  }, [page, focus, modal]);
  useEffect(() => {
    if (!current || !video.current) return;
    video.current.currentTime = current.start;
    setTime(current.start);
    if (playing) video.current.play().catch(() => setPlaying(false));
  }, [selected, current?.id]);
  useEffect(() => {
    if (video.current) video.current.volume = settings.volume;
    if (audioPlayer.current) audioPlayer.current.volume = settings.musicVolume;
  }, [settings.volume, settings.musicVolume, audio]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    if (!playing) {
      video.current?.pause();
      audioPlayer.current?.pause();
    }
  }, [playing]);
  useEffect(() => {
    if (audioPlayer.current && audio?.duration) {
      audioPlayer.current.currentTime =
        (offset + Math.max(0, time - (current?.start || 0))) % audio.duration;
    }
  }, [selected, audio?.id]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role=dialog]');
    const first = dialog?.querySelector('button,input,textarea,select');
    first?.focus();
    const handle = (e) => {
      if (e.key === 'Escape') {
        setModal(null);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll('button:not(:disabled),input,textarea,select')];
      const start = items[0],
        end = items.at(-1);
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end?.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start?.focus();
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [modal]);
  async function importFiles(kind, files) {
    if (importing || busy) return;
    setImporting(true);
    try {
      let items;
      if (native) items = await native.importMedia(kind);
      else {
        if (!files) {
          (kind === 'audio' ? audioInput : fileInput).current.click();
          return;
        }
        items = await Promise.all(
          [...files].map(
            (file) =>
              new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                urls.current.push(url);
                const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
                el.preload = 'metadata';
                el.onloadedmetadata = () => {
                  if (!Number.isFinite(el.duration) || el.duration <= 0)
                    return reject(Error('Could not read that media file.'));
                  resolve({
                    id: crypto.randomUUID(),
                    name: file.name,
                    url,
                    duration: el.duration,
                    width: el.videoWidth,
                    height: el.videoHeight,
                    kind,
                    hasAudio: true,
                  });
                  el.removeAttribute('src');
                  el.load();
                };
                el.onerror = () =>
                  reject(Error('That format cannot be previewed. Try MP4 or WebM.'));
                el.src = url;
              })
          )
        );
      }
      if (!items?.length) return;
      if (kind === 'audio') {
        setAudio(items[0]);
        notify('Soundtrack added.');
      } else {
        setClips((c) => [...c, ...items.map((i) => ({ ...i, start: 0, end: i.duration }))]);
        setSelected(clips.length);
        setDemo(false);
        setPlaying(false);
        setExported(null);
      }
    } catch (e) {
      notify(e.message);
    } finally {
      setImporting(false);
    }
  }
  function loadDemo() {
    setClips([
      {
        id: 'demo-1',
        name: 'A quiet moment.mp4',
        url: './demo.mp4',
        duration: 8,
        start: 0,
        end: 8,
        width: 720,
        height: 1280,
        kind: 'video',
        hasAudio: false,
        demo: true,
      },
    ]);
    setSelected(0);
    setDemo(true);
    setTime(0);
    setPlaying(false);
    notify('Sample project loaded. Import your own clips to export.');
  }
  function changeClip(key, value) {
    setClips((c) => c.map((clip, i) => (i === selected ? { ...clip, [key]: value } : clip)));
    setExported(null);
  }
  function togglePlay() {
    if (!current) return;
    if (playing) {
      video.current.pause();
      audioPlayer.current?.pause();
      setPlaying(false);
    } else {
      if (video.current.currentTime >= current.end - 0.05)
        video.current.currentTime = current.start;
      video.current
        .play()
        .then(() => {
          setPlaying(true);
          audioPlayer.current?.play().catch(() => {});
        })
        .catch(() => notify('Unable to play this file. Try another video format.'));
    }
  }
  function onTime() {
    const v = video.current;
    if (!v || !current) return;
    setTime(v.currentTime);
    if (v.currentTime >= current.end - 0.03) {
      if (selected < clips.length - 1) {
        setSelected((i) => i + 1);
      } else {
        v.pause();
        audioPlayer.current?.pause();
        setPlaying(false);
      }
    }
  }
  function seek(value) {
    if (!video.current) return;
    video.current.currentTime = value;
    setTime(value);
    if (audioPlayer.current && audio?.duration)
      audioPlayer.current.currentTime = (offset + value - current.start) % audio.duration;
  }
  async function doExport() {
    if (!clips.length) return notify('Import at least one video first.');
    if (demo) return notify('The sample is for exploring. Import your own clips to export.');
    if (!native) {
      setModal('desktop');
      return;
    }
    setBusy(true);
    setProgress(0);
    setExported(null);
    try {
      const result = await native.exportVideo({
        ...settings,
        clips: clips.map(({ id, start, end }) => ({ id, start, end })),
        soundtrack: audio?.id,
      });
      if (result) {
        setExported(result);
        notify('Your reel is ready. Made locally, on your terms.');
      }
    } catch (e) {
      notify(e.message.split('\n').slice(-3).join(' ').slice(0, 260));
    } finally {
      setBusy(false);
    }
  }
  function removeClip(index) {
    video.current?.pause();
    setPlaying(false);
    setClips((c) => c.filter((_, i) => i !== index));
    setSelected(Math.max(0, Math.min(selected, clips.length - 2)));
    setExported(null);
  }
  const nav = [
    ['studio', Clapperboard, 'Reel studio'],
    ['stories', Instagram, 'Stories'],
    ['messages', MessageCircle, 'Messages'],
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('studio');
          }}
        >
          <span className="brand-icon">
            <Focus size={24} />
          </span>
          <span>
            focus<span className="brand-light">gram</span>
            <small>YOUR SPACE TO CREATE</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              {label}
              {id === 'studio' && <span className="new-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">YOUR ATTENTION, YOUR RULES</div>
        <div className={`focus-card ${focus ? 'enabled' : ''}`}>
          <div className="focus-card-top">
            <span className="focus-symbol">
              <BellOff size={17} />
            </span>
            <button
              role="switch"
              aria-checked={focus}
              aria-label="Focus mode"
              className={`switch ${focus ? 'on' : ''}`}
              onClick={() => setFocus(!focus)}
            >
              <span />
            </button>
          </div>
          <strong>
            Focus mode <span>{focus ? 'ON' : 'OFF'}</span>
          </strong>
          <p>
            {focus
              ? 'A little less noise.\nA lot more headspace.'
              : 'Your full Instagram workspace.'}
          </p>
          <div className="focus-rule">
            <span className={focus ? 'dot muted' : 'dot'} />
            <span>Feed posts & Reels</span>
            <small>{focus ? 'Blocked' : 'Visible'}</small>
          </div>
          <div className="focus-rule">
            <span className="dot" />
            <span>Stories & DMs</span>
            <small>Available</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <ShieldCheck size={16} />
            <span>Local files. Your control.</span>
          </div>
          <button className="nav-item" onClick={() => setModal('about')}>
            <CircleHelp size={18} />
            About Focus Gram
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <div className="avatar">
              Y<span />
            </div>
            <div>
              <strong>Your creative space</strong>
              <small>{native ? 'Linux desktop · v0.1' : 'Browser preview · v0.1'}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>
              {page === 'studio'
                ? 'Reel studio'
                : page === 'stories'
                  ? 'Stories'
                  : page === 'messages'
                    ? 'Messages'
                    : 'Publish'}
            </strong>
          </div>
          <div className="top-right">
            <span className="desktop-chip">
              <Monitor size={13} />
              {native ? 'LINUX DESKTOP' : 'DESKTOP PREVIEW'}
            </span>
            <span className="status-chip">
              <span />
              {focus ? 'Focus is on' : 'Focus is off'}
            </span>
            <IconButton
              icon={Settings2}
              label="App settings"
              onClick={() => setModal('settings')}
            />
          </div>
        </header>
        {page === 'studio' ? (
          <div className="studio">
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span />
                  CREATE WITH INTENTION
                </div>
                <h1>
                  A little more creating.
                  <br />
                  <span>A little less scrolling.</span>
                </h1>
                <p>Your next reel starts here. Make something worth sharing.</p>
              </div>
              <div className="heading-actions">
                <button className="button secondary" onClick={loadDemo}>
                  <Sparkles size={16} />
                  Try a sample
                </button>
                <button
                  className="button primary"
                  disabled={busy || importing}
                  onClick={() => importFiles('video')}
                >
                  {importing ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}New
                  clips
                </button>
              </div>
            </section>
            <div className="editor-shell">
              <div className="editor-top">
                <div className="project-name">
                  <span className="project-dot" />
                  <input
                    aria-label="Project title"
                    value={settings.title}
                    onChange={(e) => update('title', e.target.value)}
                    maxLength={80}
                  />
                  <span className="project-type">REEL</span>
                </div>
                <span className="autosaved">
                  <CheckCheck size={14} />
                  Settings saved locally
                </span>
              </div>
              <div className="editor-body">
                <section className="preview-area">
                  <div className="panel-title">
                    <span>PREVIEW</span>
                    <span className="aspect-pill">
                      9:16 <span>PORTRAIT</span>
                    </span>
                  </div>
                  <div className="preview-stage">
                    <div className="phone-preview">
                      {current ? (
                        <video
                          ref={video}
                          src={current.url}
                          playsInline
                          preload="metadata"
                          style={{ objectFit: settings.fit }}
                          onTimeUpdate={onTime}
                          onLoadedMetadata={() => {
                            if (video.current) {
                              video.current.currentTime = current.start;
                              video.current.volume = settings.volume;
                            }
                          }}
                          onEnded={() => {
                            if (selected < clips.length - 1) setSelected((i) => i + 1);
                            else {
                              setPlaying(false);
                              audioPlayer.current?.pause();
                            }
                          }}
                        />
                      ) : (
                        <div className="preview-art">
                          <div className="art-sun" />
                          <div className="art-hill h1" />
                          <div className="art-hill h2" />
                          <div className="art-hill h3" />
                          <div className="art-grain" />
                          <div className="empty-preview">
                            <span className="empty-icon">
                              <Film size={27} strokeWidth={1.3} />
                            </span>
                            <strong>
                              A blank canvas.
                              <br />A good beginning.
                            </strong>
                            <p>Add your clips to get started</p>
                            <button onClick={() => importFiles('video')}>
                              <Plus size={14} />
                              Import video
                            </button>
                          </div>
                        </div>
                      )}
                      {current && settings.text && (
                        <div className={`text-overlay ${settings.textPosition}`}>
                          <span>{settings.text}</span>
                        </div>
                      )}
                      <div className="preview-watermark">
                        <Focus size={12} />
                        focusgram
                      </div>
                      <span className="safe-tag">
                        {current ? format(current.end - current.start) : 'YOUR NEXT REEL'}
                      </span>
                    </div>
                    <div className="preview-side-note">
                      <span />
                      <span>
                        Made for
                        <br />a smaller screen.
                      </span>
                    </div>
                  </div>
                  <div className="playback">
                    <IconButton
                      icon={playing ? Pause : Play}
                      label={playing ? 'Pause preview' : 'Play preview'}
                      onClick={togglePlay}
                      disabled={!current}
                    />
                    <span className="timecode">
                      {format(Math.max(0, offset + time - (current?.start || 0)))}{' '}
                      <span>/ {format(total)}</span>
                    </span>
                    <input
                      aria-label="Preview position"
                      type="range"
                      min={current?.start || 0}
                      max={current?.end || 1}
                      step="0.01"
                      value={Math.max(current?.start || 0, Math.min(time, current?.end || 1))}
                      onChange={(e) => seek(Number(e.target.value))}
                      disabled={!current}
                    />
                    <IconButton
                      icon={Volume2}
                      label="Mute or unmute preview"
                      onClick={() => update('volume', settings.volume ? 0 : 0.85)}
                    />
                  </div>
                </section>
                <section className="inspector">
                  <div className="inspector-tabs">
                    {[
                      ['edit', SlidersHorizontal, 'Edit'],
                      ['text', Type, 'Text'],
                      ['audio', Music2, 'Audio'],
                    ].map(([id, Icon, label]) => (
                      <button
                        key={id}
                        className={tab === id ? 'selected' : ''}
                        onClick={() => setTab(id)}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === 'edit' ? (
                    <div className="inspector-content">
                      <div className="section-caption">
                        <span>THE DETAILS</span>
                        <Scissors size={15} />
                      </div>
                      <h3>Find your best moments.</h3>
                      <p className="hint">Keep the good part. Leave the rest.</p>
                      <label className="field-label">Canvas</label>
                      <div className="canvas-option">
                        <div className="canvas-icon" />
                        <div>
                          <strong>Portrait</strong>
                          <small>9:16 · Made for Reels</small>
                        </div>
                        <Check size={16} />
                      </div>
                      <label className="field-label">Framing</label>
                      <div className="segmented">
                        {[
                          ['cover', 'Fill frame'],
                          ['contain', 'Fit inside'],
                        ].map(([v, label]) => (
                          <button
                            className={settings.fit === v ? 'selected' : ''}
                            key={v}
                            onClick={() => update('fit', v)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="field-heading">
                        <label className="field-label">Trim selected clip</label>
                        <span>
                          {current ? `${(current.end - current.start).toFixed(1)}s` : '—'}
                        </span>
                      </div>
                      <div className="trim-fields">
                        <label>
                          START{' '}
                          <div>
                            <input
                              aria-label="Trim start"
                              type="number"
                              min="0"
                              max={Math.max(0, (current?.end || 0) - 0.1)}
                              step="0.1"
                              disabled={!current || busy}
                              value={current ? Number(current.start.toFixed(2)) : 0}
                              onChange={(e) => {
                                const v = Math.max(
                                  0,
                                  Math.min(Number(e.target.value), current.end - 0.1)
                                );
                                changeClip('start', v);
                                seek(v);
                              }}
                            />
                            <span>sec</span>
                          </div>
                        </label>
                        <label>
                          END{' '}
                          <div>
                            <input
                              aria-label="Trim end"
                              type="number"
                              min={(current?.start || 0) + 0.1}
                              max={current?.duration || 0}
                              step="0.1"
                              disabled={!current || busy}
                              value={current ? Number(current.end.toFixed(2)) : 0}
                              onChange={(e) =>
                                changeClip(
                                  'end',
                                  Math.min(
                                    current.duration,
                                    Math.max(Number(e.target.value), current.start + 0.1)
                                  )
                                )
                              }
                            />
                            <span>sec</span>
                          </div>
                        </label>
                      </div>
                      <div className="inspector-divider" />
                      <label className="field-label">Export quality</label>
                      <select
                        aria-label="Export quality"
                        value={settings.quality}
                        onChange={(e) => update('quality', e.target.value)}
                      >
                        <option value="1080">1080 × 1920 · Full HD</option>
                        <option value="720">720 × 1280 · Smaller file</option>
                      </select>
                      <div className="export-note">
                        <ShieldCheck size={16} />
                        <span>
                          Rendered on your device.
                          <br />
                          No uploads. No watermark.
                        </span>
                      </div>
                    </div>
                  ) : tab === 'text' ? (
                    <div className="inspector-content">
                      <div className="section-caption">
                        <span>YOUR WORDS</span>
                        <Type size={15} />
                      </div>
                      <h3>Give it a little meaning.</h3>
                      <p className="hint">One title, across your whole reel.</p>
                      <label className="field-label" htmlFor="overlay">
                        Text overlay
                      </label>
                      <textarea
                        id="overlay"
                        value={settings.text}
                        onChange={(e) => update('text', e.target.value)}
                        maxLength={180}
                        rows={4}
                        placeholder="Say something worth keeping…"
                      />
                      <small className="character-count">{settings.text.length}/180</small>
                      <label className="field-label">Position</label>
                      <div className="segmented">
                        {['top', 'center', 'bottom'].map((v) => (
                          <button
                            key={v}
                            className={settings.textPosition === v ? 'selected' : ''}
                            onClick={() => update('textPosition', v)}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <button className="button secondary wide" onClick={() => update('text', '')}>
                        <Trash2 size={15} />
                        Remove text
                      </button>
                      <div className="tip-card">
                        <Sparkles size={17} />
                        <p>
                          Keep text short so it stays readable on a phone. Preview placement is
                          approximate.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="inspector-content">
                      <div className="section-caption">
                        <span>SET THE MOOD</span>
                        <Music2 size={15} />
                      </div>
                      <h3>Find your rhythm.</h3>
                      <p className="hint">Your own sound. Your own story.</p>
                      <label className="field-label">Original clip audio</label>
                      <div className="volume-control">
                        <Volume2 size={16} />
                        <input
                          aria-label="Original audio volume"
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={settings.volume}
                          onChange={(e) => update('volume', Number(e.target.value))}
                        />
                        <span>{Math.round(settings.volume * 100)}%</span>
                      </div>
                      <label className="field-label">Soundtrack</label>
                      <button className="audio-drop" onClick={() => importFiles('audio')}>
                        <Music2 size={22} />
                        <strong>{audio ? audio.name : 'Add your own audio'}</strong>
                        <small>{audio ? 'Click to replace' : 'MP3, WAV, M4A, FLAC'}</small>
                      </button>
                      {audio && (
                        <>
                          <div className="volume-control">
                            <Music2 size={16} />
                            <input
                              aria-label="Soundtrack volume"
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={settings.musicVolume}
                              onChange={(e) => update('musicVolume', Number(e.target.value))}
                            />
                            <span>{Math.round(settings.musicVolume * 100)}%</span>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => {
                              audioPlayer.current?.pause();
                              setAudio(null);
                            }}
                          >
                            Remove soundtrack
                          </button>
                          <audio ref={audioPlayer} src={audio.url} loop />
                        </>
                      )}
                      <div className="tip-card">
                        <CircleHelp size={17} />
                        <p>
                          Use audio you have permission to share. Instagram’s licensed music library
                          isn’t included.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <section className="timeline">
                <div className="timeline-title">
                  <div>
                    <Layers size={15} />
                    <strong>Your sequence</strong>
                    <span>
                      {clips.length} {clips.length === 1 ? 'clip' : 'clips'} <span>·</span>{' '}
                      {format(total)}
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => importFiles('video')}
                    disabled={busy}
                  >
                    <Plus size={14} />
                    Add clips
                  </button>
                </div>
                <div className="timeline-ruler">
                  {['00:00', '00:05', '00:10', '00:15', '00:20', '00:25', '00:30'].map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="clip-track">
                  {clips.length ? (
                    clips.map((clip, i) => (
                      <div
                        className={`clip ${i === selected ? 'selected' : ''}`}
                        key={`${clip.id}-${i}`}
                      >
                        <button
                          className="clip-select"
                          onClick={() => {
                            video.current?.pause();
                            setPlaying(false);
                            setSelected(i);
                          }}
                        >
                          <span className="clip-thumb">
                            <Film size={18} />
                            <span>{String(i + 1).padStart(2, '0')}</span>
                          </span>
                          <span className="clip-name">
                            <strong>{clip.name}</strong>
                            <small>{(clip.end - clip.start).toFixed(1)} sec</small>
                          </span>
                        </button>
                        <div className="clip-tools">
                          <IconButton
                            icon={ArrowLeft}
                            label={`Move clip ${i + 1} left`}
                            disabled={i === 0 || busy}
                            onClick={() => {
                              setClips((c) => {
                                const a = [...c];
                                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                                return a;
                              });
                              setSelected(i - 1);
                              setPlaying(false);
                            }}
                          />
                          <IconButton
                            icon={Trash2}
                            label={`Remove clip ${i + 1}`}
                            disabled={busy}
                            onClick={() => removeClip(i)}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <button className="timeline-empty" onClick={() => importFiles('video')}>
                      <Plus size={19} />
                      <span>
                        Drop into your creative flow. <strong>Add your first clip</strong>
                      </span>
                    </button>
                  )}
                  <button
                    className="add-clip"
                    aria-label="Add another clip"
                    onClick={() => importFiles('video')}
                    disabled={busy}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="audio-track">
                  <Music2 size={13} />
                  <span>{audio ? audio.name : 'A little sound goes a long way.'}</span>
                  <button onClick={() => setTab('audio')}>
                    {audio ? 'Edit audio' : 'Add audio'}
                    <Plus size={12} />
                  </button>
                </div>
              </section>
              <footer className="editor-footer">
                <span>
                  <LockKeyhole size={13} />
                  Your creativity stays yours.
                </span>
                <div>
                  {exported ? (
                    <button className="button secondary" onClick={() => native?.revealExport()}>
                      <FolderOpen size={15} />
                      Show exported reel
                    </button>
                  ) : (
                    <span className="export-spec">
                      MP4 <span>·</span> H.264 <span>·</span> {settings.quality}p
                    </span>
                  )}
                  <button
                    className="button primary"
                    disabled={busy || !clips.length}
                    onClick={doExport}
                  >
                    {busy ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}{' '}
                    {busy ? `Exporting ${Math.round(progress)}%` : 'Export reel'}
                    {!busy && <ArrowUpRight size={15} />}
                  </button>
                  {busy && (
                    <button className="text-button" onClick={() => native?.cancelExport()}>
                      Cancel
                    </button>
                  )}
                </div>
              </footer>
              {busy && <div className="export-progress" style={{ width: `${progress}%` }} />}
            </div>
            <div className="bottom-cards">
              <button className="bottom-card" onClick={() => setPage('stories')}>
                <span className="card-icon stories">
                  <Instagram size={20} />
                </span>
                <div>
                  <strong>Keep up, without the rabbit hole.</strong>
                  <p>Stories and messages. Leave the endless feed behind.</p>
                </div>
                <ArrowUpRight size={19} />
              </button>
              <button className="bottom-card" onClick={() => setModal('publish')}>
                <span className="card-icon">
                  <Upload size={20} />
                </span>
                <div>
                  <strong>Made something you love?</strong>
                  <p>Export your reel, then take it to Instagram.</p>
                </div>
                <ArrowUpRight size={19} />
              </button>
            </div>
            <div className="page-footnote">
              <span>Less noise. More you.</span>
              <span>INDEPENDENT PROJECT · NOT AFFILIATED WITH META</span>
            </div>
          </div>
        ) : (
          <div className="instagram-page">
            <div className="instagram-heading">
              <div>
                <div className="eyebrow">
                  <span />
                  {focus ? 'A QUIETER INSTAGRAM' : 'YOUR INSTAGRAM WORKSPACE'}
                </div>
                <h1>
                  {page === 'messages'
                    ? 'Good conversations.'
                    : page === 'upload'
                      ? 'Ready when you are.'
                      : 'Stay close. Skip the scroll.'}
                </h1>
              </div>
              <button className="button secondary" onClick={() => setPage('studio')}>
                <ArrowLeft size={16} />
                Back to studio
              </button>
            </div>
            <div className="workspace-status">
              <ShieldCheck size={15} />
              {status}
            </div>
            {!native && (
              <div className="browser-workspace">
                <div className="large-icon">
                  <Instagram size={40} />
                </div>
                <h2>Your people. Less noise.</h2>
                <p>
                  The Linux desktop app opens Instagram here, with feed posts and Reels blocked when
                  focus mode is on. Stories and messages stay accessible.
                </p>
                <button className="button primary" onClick={() => setModal('desktop')}>
                  Get the desktop app
                  <ArrowUpRight size={15} />
                </button>
                <small>This browser preview never asks for your Instagram password.</small>
              </div>
            )}
          </div>
        )}
      </main>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="video/*"
        hidden
        onChange={(e) => {
          importFiles('video', e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          importFiles('audio', e.target.files);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <IconButton icon={X} label="Dismiss notification" onClick={() => setToast('')} />
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'publish' ? 'Publish your reel' : 'Focus Gram information'}
          >
            <IconButton icon={X} label="Close dialog" onClick={() => setModal(null)} />
            <div className="large-icon">
              {modal === 'publish' ? (
                <Upload size={29} />
              ) : modal === 'settings' ? (
                <Settings2 size={29} />
              ) : (
                <Focus size={29} />
              )}
            </div>
            {modal === 'publish' ? (
              <>
                <div className="eyebrow">FROM YOUR STUDIO TO YOUR PEOPLE</div>
                <h2>Share it on your terms.</h2>
                <p>
                  Export an MP4, then use Instagram’s Create button to upload it. Mobile-only
                  effects and Instagram’s music library aren’t available here.
                </p>
                <label className="field-label" htmlFor="caption">
                  Your caption
                </label>
                <textarea
                  id="caption"
                  rows={4}
                  value={settings.caption}
                  onChange={(e) => update('caption', e.target.value)}
                  maxLength={2200}
                />
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(settings.caption);
                        notify('Caption copied.');
                      } catch {
                        notify('Select and copy the caption manually.');
                      }
                    }}
                  >
                    Copy caption
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setModal(null);
                      setPage('upload');
                    }}
                  >
                    <Instagram size={16} />
                    Open Instagram
                  </button>
                </div>
                <small>
                  Direct API publishing is not implemented in v0.1. Personal accounts use
                  Instagram’s own upload flow.
                </small>
              </>
            ) : modal === 'settings' ? (
              <>
                <h2>A space that feels like yours.</h2>
                <p>
                  Focus mode hides feed posts and blocks post, Explore, and Reel routes. Stories and
                  DMs remain available. Instagram layout updates may affect filtering.
                </p>
                <div className="settings-focus">
                  <strong>Focus mode</strong>
                  <button
                    role="switch"
                    aria-label="Settings focus mode"
                    aria-checked={focus}
                    className={`switch ${focus ? 'on' : ''}`}
                    onClick={() => setFocus(!focus)}
                  >
                    <span />
                  </button>
                </div>
                <p className="hint">
                  Project settings persist on this device. Source videos stay where you imported
                  them and need to be re-imported after restarting.
                </p>
                <button
                  className="button secondary wide"
                  onClick={() => {
                    setSettings(defaults);
                    notify('Editor settings reset.');
                  }}
                >
                  <RotateCcw size={15} />
                  Reset editor settings
                </button>
                {native && (
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      await native.resetInstagram();
                      setPage('studio');
                      notify('Instagram session cleared.');
                      setModal(null);
                    }}
                  >
                    Sign out and clear Instagram session
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="eyebrow">CREATE MORE. SCROLL LESS.</div>
                <h2>Meet Focus Gram.</h2>
                <p>
                  A Linux-first reel studio with local editing, portrait export, and an Instagram
                  workspace that respects your attention.
                </p>
                <div className="feature-list">
                  <span>
                    <Check size={16} />
                    Trim, arrange, crop, add text and sound
                  </span>
                  <span>
                    <Check size={16} />
                    Local FFmpeg export · no watermark
                  </span>
                  <span>
                    <Check size={16} />
                    Focus mode keeps Stories and messages
                  </span>
                </div>
                <p className="hint">
                  {native
                    ? 'You’re running the desktop app. FFmpeg and ffprobe must be installed for imports and export.'
                    : 'You’re exploring the browser preview. Import and editing previews work here; video export and Instagram integration require the desktop app.'}
                </p>
                <code>
                  npm install
                  <br />
                  sudo pacman -S ffmpeg
                  <br />
                  npm start
                </code>
                <small>
                  Independent, open source software. Not affiliated with Instagram or Meta. Early
                  alpha: live Instagram compatibility needs testing.
                </small>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
