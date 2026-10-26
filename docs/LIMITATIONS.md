# Current limits

Focus Gram v0.1 is an early alpha. The app adds a real local video editor to a focused Instagram web workspace. It cannot turn Instagram's web service into its Android app.

- **Instagram access:** Direct Instagram login only. Facebook login popups and external redirects are blocked. Instagram can refuse embedded-browser login. No authenticated account was used during initial testing.
- **Posting:** Manual upload through Instagram's own website. No API publishing or background posting. Reel classification and account eligibility are controlled by Instagram.
- **Focus:** Uses page selectors and route checks. Tested against representative DOM fixtures; live authenticated behavior needs testing. Stories remain visible by design; content inside Stories is not classified or filtered. No guarantee against posts/Reels embedded in DMs or future Instagram layouts. New content may briefly appear while filtering initializes.
- **Calls/effects/music:** No calls or recording permissions; no AR effects or licensed Instagram music catalog.
- **Projects:** Editor preferences and caption persist in localStorage. Clip lists, file permissions, and imported soundtrack references are session-only; re-import after restart. “Settings saved locally” refers to preferences, not a complete saved project.
- **Editing:** One project-wide text overlay, one project-wide framing mode, one soundtrack starting at the beginning, hard cuts between clips, and basic trim controls. No transitions, speed ramps, subtitle generation, multitrack timeline, or color grading.
- **Preview:** Placement approximates output; long titles can wrap differently or exceed the export frame. Keep titles short. Audio preview is basic and may differ from the final FFmpeg mix after seeking or changing clips.
- **Export:** H.264/AAC portrait 30 fps, 720×1280 or 1080×1920. Requires FFmpeg with libx264, AAC, and drawtext support. Max 30 clips and 30 minutes. Export uses temporary disk space roughly proportional to the rendered project and may take time. Destination is written only after encoding completes; final file-copy interruption is not transactional.
- **Packaging:** Linux x64 build tested locally. Other CPUs and operating systems are unverified. FFmpeg remains a system dependency. No auto-update service.
- **Browser preview:** Local editing/preview only. Native filesystem actions, export, and Instagram embedding are unavailable.
- **Security:** Local cookies inherit normal Electron/Chromium protections, not an encrypted password vault. Downloads from Instagram go to your Downloads directory. Remote sites get no filesystem bridge.

Report a reproducible issue with Linux distribution, desktop session, app version, steps, and a redacted screenshot. Never include passwords, cookies, access tokens, or private messages.
