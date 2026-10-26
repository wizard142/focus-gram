# Architecture

The local React renderer contains only the toolbar, upload dialog, and settings. Instagram runs in a separate sandboxed `WebContentsView`, using the same persistent session as v0.1. It has no Node integration or preload bridge.

## Post / Reel

A native dialog registers one file in an in-memory media registry. `focus-media://<random-id>/media` previews only registered files. The privileged main process finds Instagram's Create control, waits for its file input, then uses `DOM.setFileInputFiles` with the selected path. This selects a file; it never clicks Share. The optional caption goes to the clipboard for pasting.

The local UI gets a successful handoff only after the DevTools command completes. Failure leaves the dialog open and reports the error. No export or project file is involved.

## Stories

`StoryService` installs an optional Python virtual environment under application data, with a pinned instagrapi dependency. Python helper and requirements files are unpacked from Electron's ASAR so system Python can read them.

After an explicit publish action, the main process reads the current session's necessary Instagram cookies and sends them to the local helper on stdin. Cookies never reach the React renderer, logs or process arguments. Stable device identifiers are derived without saving another session file. The helper bootstraps the client's session directly; it does not ask for a password or use a third-party token service.

Photo preparation uses Pillow through instagrapi. Video is normalized locally with FFmpeg and supplied with a generated thumbnail, avoiding MoviePy. The helper permits requests only to Instagram/CDN hosts, disables transport retries, avoids extra Story-list lookups, and returns success only for a confirmed Story ID. Instagram processing polling inside the pinned library is separate from retrying a failed upload or login. Verification failures stop the operation.

## Focus and themes

CSS hides feed content on the home route without hiding Story-viewer articles or login fields. Route guards block post, Reel and Explore navigation. Themes update both the local CSS palette and Instagram's theme classes; Electron's native theme keeps `prefers-color-scheme` in sync.

IPC handlers accept only the local window's main frame. The remote Instagram renderer cannot call the app bridge.
