# Focus Gram v0.1.0 — early alpha

The first Linux desktop build of Focus Gram: a local reel editor and a focused Instagram workspace.

## Included

- Multiple video clips, per-clip trimming and reordering.
- 9:16 portrait canvas, fill/fit framing, text overlay and local soundtrack mixing.
- Local FFmpeg export to 720p/1080p H.264 + AAC MP4, without a watermark.
- A separate sandboxed Instagram session with focus-mode route blocking and feed filtering designed to preserve Stories and messages.
- Caption drafting and a manual handoff to Instagram's own web uploader.

## Download and run

Install FFmpeg first (`sudo pacman -S ffmpeg` on CachyOS/Arch). Mark the AppImage executable and open it. If FUSE is unavailable, run the AppImage with `--appimage-extract-and-run`. Alternatively, extract the tarball and run `focus-gram` inside it. Do not disable Electron's sandbox.

`SHA256SUMS.txt` lists artifact checksums. Builds are not code signed.

## Tested

Local engine tests include a real FFmpeg export with combined trims, a literal text overlay, a soundtrack, and cancellation. Browser tests exercise import, preview, trim, text, settings persistence, publish UI, and focus-mode DOM fixtures. The packaged Linux desktop app passed native import, playback, MP4 export, and sandbox checks on CachyOS.

## Read before trying Instagram

Authenticated login, Stories, messaging, and upload have not been verified with a real account. Instagram may reject embedded browsers or change its layout. Focus filtering is best effort. No direct API publishing, Instagram music catalog, AR effects, mobile feature parity, or calls. Clip lists are session-only; editor preferences persist.

This project is independent and not affiliated with Instagram or Meta. See README and docs/LIMITATIONS.md for details.
