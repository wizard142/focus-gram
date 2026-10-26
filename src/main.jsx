import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ImagePlus,
  LoaderCircle,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  X,
} from 'lucide-react';
import '@fontsource-variable/instrument-sans';
import './style.css';

const desktop = window.focusGram;
const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" title={label} aria-label={label} {...props}>
      <Icon size={18} strokeWidth={1.65} />
    </button>
  );
}
function App() {
  const [page, setPage] = useState('home');
  const [theme, setTheme] = useState(() =>
    read('fg-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  const [focus, setFocus] = useState(() => read('fg-focus', 'true') !== 'false');
  const [dialog, setDialog] = useState(null);
  const [kind, setKind] = useState('reel');
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [storiesReady, setStoriesReady] = useState(false);
  const [ack, setAck] = useState(false);
  const [allowStories, setAllowStories] = useState(
    () => read('fg-experimental-stories', 'false') === 'true'
  );
  const viewport = useRef(null);
  const fileInput = useRef(null);
  const browserURL = useRef(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('fg-theme', theme);
    desktop?.setTheme(theme).catch((e) => setError(e.message));
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('fg-focus', String(focus));
  }, [focus]);
  useEffect(() => {
    localStorage.setItem('fg-experimental-stories', String(allowStories));
  }, [allowStories]);
  useEffect(() => {
    desktop?.setInstagram({ visible: !dialog, focus, page }).catch((e) => setError(e.message));
  }, [dialog, focus, page]);
  useEffect(() => {
    const update = () => {
      const r = viewport.current?.getBoundingClientRect();
      if (r) desktop?.setViewport({ x: r.x, y: r.y, width: r.width, height: r.height });
    };
    const observer = new ResizeObserver(update);
    if (viewport.current) observer.observe(viewport.current);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(
    () =>
      desktop?.onStatus((value) => {
        if (value.type === 'error') setError(value.message);
        else if (value.type === 'progress') setStage(value.message);
        else if (value.type === 'notice') setNotice(value.message);
      }),
    []
  );
  useEffect(() => {
    desktop
      ?.storyCapabilities()
      .then((c) => setStoriesReady(c.ready))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement,
      element = document.querySelector('[role=dialog]');
    element?.querySelector('button,input,textarea')?.focus();
    const handler = (e) => {
      if (e.key === 'Escape' && !busy) setDialog(null);
      if (e.key !== 'Tab') return;
      const all = [
        ...element.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea'),
      ];
      if (e.shiftKey && document.activeElement === all[0]) {
        e.preventDefault();
        all.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === all.at(-1)) {
        e.preventDefault();
        all[0]?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [dialog, busy]);
  useEffect(
    () => () => {
      if (browserURL.current) URL.revokeObjectURL(browserURL.current);
    },
    []
  );
  async function selectFile(files) {
    setError('');
    try {
      if (desktop) {
        const selected = await desktop.selectUpload(kind);
        if (selected) setFile(selected);
      } else if (files?.length) {
        const selected = files[0];
        if (browserURL.current) URL.revokeObjectURL(browserURL.current);
        browserURL.current = URL.createObjectURL(selected);
        setFile({
          id: 'preview',
          name: selected.name,
          url: browserURL.current,
          kind: selected.type.startsWith('video/') ? 'video' : 'image',
        });
      } else fileInput.current.click();
    } catch (e) {
      setError(e.message);
    }
  }
  async function prepare() {
    setBusy(true);
    setError('');
    setStage('Installing Story support…');
    try {
      await desktop.prepareStories();
      setStoriesReady(true);
    } catch (e) {
      setStoriesReady(false);
      setError(e.message);
    } finally {
      setBusy(false);
      setStage('');
    }
  }
  async function publish() {
    setError('');
    if (!desktop) {
      setError('Uploads are available in the desktop app.');
      return;
    }
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'story') {
        if (!allowStories || !ack)
          throw Error('Acknowledge the experimental integration before publishing.');
        setStage('Publishing Story…');
        const result = await desktop.publishStory({ id: file.id, acknowledged: true });
        if (!result?.published)
          throw Error('Instagram did not confirm publication. Check your Story before retrying.');
        setNotice('Story published.');
        setDialog(null);
        setFile(null);
        desktop.refresh();
      } else {
        setStage('Opening Instagram’s uploader…');
        const result = await desktop.openComposer({ id: file.id, caption, kind });
        setDialog(null);
        setPage('home');
        setNotice(result.message);
        setFile(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setStage('');
    }
  }
  function openCreate() {
    setError('');
    setFile(null);
    setCaption('');
    setAck(false);
    setDialog('create');
  }
  return (
    <div className="app">
      <header className="toolbar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('home');
          }}
        >
          focus<span>gram</span>
          <span className="wordmark-dot">.</span>
        </a>
        <nav className="navigation" aria-label="Instagram">
          <button className={page === 'home' ? 'current' : ''} onClick={() => setPage('home')}>
            Stories
          </button>
          <button
            className={page === 'messages' ? 'current' : ''}
            onClick={() => setPage('messages')}
          >
            Messages
          </button>
        </nav>
        <div className="toolbar-actions">
          <button
            className={`focus-toggle ${focus ? 'active' : ''}`}
            role="switch"
            aria-checked={focus}
            aria-label="Focus mode"
            title="Hide feed posts, Reels and Explore. Keep Stories and messages."
            onClick={() => setFocus(!focus)}
          >
            <span className="focus-indicator" />
            Focus
            <span className="toggle-track">
              <span />
            </span>
          </button>
          <div className="theme-toggle" aria-label="Theme">
            <button
              aria-label="Light theme"
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
            >
              <Sun size={16} />
            </button>
            <button
              aria-label="Dark theme"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
            >
              <Moon size={16} />
            </button>
          </div>
          <IconButton
            icon={RefreshCw}
            label="Reload Instagram"
            onClick={() => {
              setError('');
              desktop?.refresh().catch((e) => setError(e.message));
            }}
          />
          <IconButton icon={Settings} label="Settings" onClick={() => setDialog('settings')} />
          <button className="button primary create-button" onClick={openCreate}>
            <Plus size={17} />
            Create
          </button>
        </div>
      </header>
      <main className="instagram-viewport" ref={viewport} aria-label="Instagram workspace">
        {!desktop && (
          <div className="preview-placeholder">
            <span className="preview-mark">ig</span>
            <h1>Instagram</h1>
            <p>Open the desktop app to sign in.</p>
            <button className="button secondary" onClick={openCreate}>
              Preview upload controls
            </button>
            <span className="preview-label">Interface preview</span>
          </div>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{notice}</span>
          <IconButton icon={X} label="Dismiss notification" onClick={() => setNotice('')} />
        </div>
      )}
      {error && !dialog && (
        <div className="status-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {dialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setDialog(null);
              setError('');
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={dialog === 'create' ? 'Create' : 'Settings'}
            className={`dialog ${dialog === 'create' && file ? 'with-preview' : ''}`}
          >
            <div className="dialog-heading">
              <h2>{dialog === 'create' ? 'Create' : 'Settings'}</h2>
              <IconButton
                icon={X}
                label="Close dialog"
                disabled={busy}
                onClick={() => {
                  setDialog(null);
                  setError('');
                }}
              />
            </div>
            {dialog === 'settings' ? (
              <div className="settings-body">
                <div className="setting-row">
                  <div>
                    <strong>Appearance</strong>
                  </div>
                  <div className="segmented">
                    {['light', 'dark'].map((value) => (
                      <button
                        aria-pressed={theme === value}
                        key={value}
                        onClick={() => setTheme(value)}
                      >
                        {value === 'light' ? 'Light' : 'Dark'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Focus mode</strong>
                    <p>Hide posts, Reels and Explore. Keep Stories and messages.</p>
                  </div>
                  <button
                    className={`switch ${focus ? 'on' : ''}`}
                    role="switch"
                    aria-checked={focus}
                    aria-label="Settings focus mode"
                    onClick={() => setFocus(!focus)}
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Experimental Stories</strong>
                    <p>Uses unofficial Instagram APIs. May trigger account verification.</p>
                  </div>
                  <button
                    className={`switch ${allowStories ? 'on' : ''}`}
                    role="switch"
                    aria-checked={allowStories}
                    aria-label="Experimental Stories"
                    onClick={() => setAllowStories(!allowStories)}
                  >
                    <span />
                  </button>
                </div>
                {desktop && allowStories && (
                  <div className="setting-row">
                    <div>
                      <strong>Story support</strong>
                      <p>
                        {busy
                          ? stage
                          : storiesReady
                            ? 'Installed on this device.'
                            : 'Python 3.11+ required.'}
                      </p>
                    </div>
                    <button className="button secondary" disabled={busy} onClick={prepare}>
                      {storiesReady ? 'Repair' : 'Set up'}
                    </button>
                  </div>
                )}
                {error && (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="settings-footer">
                  <span>Focus Gram {desktop ? '0.2.0' : '· browser preview'}</span>
                  {desktop && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        await desktop.resetInstagram();
                        setDialog(null);
                        setNotice('Signed out.');
                      }}
                    >
                      Sign out
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="create-tabs" role="tablist" aria-label="Upload type">
                  {[
                    ['post', 'Post'],
                    ['reel', 'Reel'],
                    ['story', 'Story'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={kind === id}
                      disabled={busy}
                      onClick={() => {
                        setKind(id);
                        setFile(null);
                        setError('');
                        setAck(false);
                      }}
                    >
                      {label}
                      {id === 'story' && <span className="experimental-label">Experimental</span>}
                    </button>
                  ))}
                </div>
                <div className="create-content">
                  {kind === 'story' && !allowStories ? (
                    <div className="story-explainer">
                      <h3>Story uploads are experimental.</h3>
                      <p>
                        Personal accounts need an unofficial Instagram integration. It can stop
                        working or trigger verification. Music, stickers and effects are not
                        included.
                      </p>
                      <button className="button secondary" onClick={() => setAllowStories(true)}>
                        Enable experimental Stories
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="upload-layout">
                        <button
                          className={`file-picker ${file ? 'has-file' : ''}`}
                          onClick={() => selectFile()}
                          disabled={busy}
                        >
                          {file ? (
                            <>
                              {file.kind === 'video' ? (
                                <video src={file.url} muted playsInline />
                              ) : (
                                <img src={file.url} alt="Selected upload" />
                              )}
                              <span className="replace-file">Change file</span>
                            </>
                          ) : (
                            <>
                              <ImagePlus size={29} strokeWidth={1.2} />
                              <strong>
                                Choose {kind === 'reel' ? 'a video' : 'a photo or video'}
                              </strong>
                              <span>{kind === 'reel' ? 'MP4' : 'JPG, PNG, WEBP or MP4'}</span>
                            </>
                          )}
                        </button>
                        {file && (
                          <div className="file-details">
                            <div>
                              <span className="field-caption">FILE</span>
                              <strong className="file-name">{file.name}</strong>
                              {file.duration > 0 && (
                                <span className="file-meta">
                                  {file.width} × {file.height} · {Math.round(file.duration)}s
                                </span>
                              )}
                            </div>
                            {kind !== 'story' && (
                              <label className="caption-label">
                                Caption
                                <textarea
                                  aria-label="Caption"
                                  value={caption}
                                  onChange={(e) => setCaption(e.target.value)}
                                  placeholder="Write a caption…"
                                  maxLength={2200}
                                  rows={7}
                                />
                              </label>
                            )}
                            {kind === 'story' && (
                              <p className="story-detail">
                                Publishes to your Story immediately. Use your normal editor to
                                prepare the file.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {kind === 'story' && (
                        <div className="experimental-info">
                          <p>
                            Unofficial integration. Instagram may reject the upload or ask you to
                            verify your account.
                          </p>
                          {desktop && !storiesReady ? (
                            <div className="setup-row">
                              <span>Story support needs a one-time setup.</span>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={prepare}
                              >
                                {busy ? <LoaderCircle size={14} className="spin" /> : null}Set up
                              </button>
                            </div>
                          ) : (
                            <label className="acknowledgement">
                              <input
                                type="checkbox"
                                checked={ack}
                                onChange={(e) => setAck(e.target.checked)}
                                disabled={busy}
                              />
                              I understand. Publish this file to my Story.
                            </label>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {error && (
                    <p className="inline-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
                <div className="dialog-footer">
                  <span>
                    {busy ? stage : kind === 'story' ? '' : 'Review and share in Instagram.'}
                  </span>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !file ||
                      (kind === 'story' && (!allowStories || !ack || (!storiesReady && desktop)))
                    }
                    onClick={publish}
                  >
                    {busy ? <LoaderCircle size={15} className="spin" /> : null}
                    {kind === 'story' ? 'Publish Story' : 'Continue in Instagram'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <input
        hidden
        ref={fileInput}
        type="file"
        accept={kind === 'reel' ? 'video/mp4' : 'image/jpeg,image/png,image/webp,video/mp4'}
        onChange={(e) => {
          selectFile(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
