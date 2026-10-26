# Focus Gram v0.2.0

A smaller interface, real composer handoff, and experimental personal-account Story uploads.

## Changes

- Removed the built-in video editor, sample project, export flow, promotional headings and dashboard cards.
- Instagram now occupies the window below one compact toolbar.
- Added persistent light/dark themes and bundled Instrument Sans typography.
- Create → Post/Reel now opens Instagram's actual composer and selects your finished file. Captions are copied for pasting. You review and share in Instagram; no project downloads are involved.
- Added opt-in experimental photo/video Story publishing using the existing app session and a local instagrapi helper. No phone or Android container is required.

## Stories

Requires Python 3.11+, FFmpeg and one-time setup in Create → Story. Uses unofficial Instagram APIs; it may fail or trigger verification. Explicit acknowledgement is required before each immediate publication. Mobile music, stickers, effects and full mobile feature parity are not included.

No live-account Story was published in testing. Local preparation, dependency setup, session/error handling and mocked publication responses are tested. Normal composer handoff and focus filtering are tested with an isolated native fixture, not your account.

## Linux

AppImage and tarball are attached, with SHA256 checksums. System FFmpeg and Python are not bundled. Keep Electron's sandbox enabled. If FUSE is unavailable, use `--appimage-extract-and-run`.

Your existing Instagram session uses the same application data and partition as v0.1. Editor settings are no longer used. Builds are unsigned and have no automatic update service.
