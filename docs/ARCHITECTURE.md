# Architecture

```text
React studio (local renderer, sandbox + context isolation)
      │ small, named contextBridge methods
      ▼
Electron main process
      ├── Native file dialogs → in-memory media registry
      ├── focus-media://<id>/media → only registered media files
      ├── FFprobe metadata → validated edit plan → FFmpeg child processes
      └── WebContentsView → https://www.instagram.com
              separate persistent session, sandbox, no Node, no preload
```

`src/main.jsx` contains the editor, timeline, portrait preview, caption flow and app settings. `electron/media.cjs` validates media references and trims, normalizes each clip to the same format, adds text and audio, concatenates clips, then mixes an optional soundtrack. FFmpeg is spawned with argument arrays and no shell. Temporary files are removed after success, failure, or cancellation.

`electron/policy.cjs` defines origin checks, blocked routes, focus CSS, and a page observer. CSS only hides home-feed articles on the home route, so Story viewer articles stay visible. External redirects and new windows are denied. Permissions are denied by default; calling/recording isn't part of v0.1.

`electron/preload.cjs` exposes named operations only to the local renderer. IPC handlers verify the sending WebContents and main frame. Instagram cannot invoke those handlers. The media protocol maps random IDs to files selected through native dialogs; renderers cannot request arbitrary local paths.

No database, hosted backend, unofficial Instagram API, credential scraping, or analytics. Browser preview provides the same local editor with object URLs but deliberately gates native-only features.
