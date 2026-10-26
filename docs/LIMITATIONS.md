# Limits in v0.2

- **Personal Story uploads are unofficial and experimental.** Instagram can refuse them, invalidate a web session for mobile API use, or require verification. Photo/video preparation, session bootstrap, safe failure handling and publication-response handling are tested offline. Live Story publication is unverified.
- **No mobile feature parity.** Instagram music, interactive stickers, AR filters, calls, mobile editing tools, Close Friends targeting, and Story reshares are not implemented. Prepare files in a separate editor.
- **Video Stories:** MP4 only, up to 60 seconds, under 500 MB. The app prepares 1080×1920 H.264/AAC video with letterboxing and silent audio when needed. FFmpeg and Python 3.11+ are required. No video splitting or background queue.
- **Photo Stories:** JPG, PNG or WEBP; the library prepares a portrait image without cropping its contents.
- **Post/Reel upload:** selects the file in Instagram's own composer. You must review and share there. Caption handoff uses your system clipboard and tells you when it has been copied. Carousel selection is not implemented. Instagram's own eligibility/format limits still apply.
- **Focus mode:** visual selectors and route blocking, not a network filter or parental control. Instagram layout changes and media embedded in messages can affect coverage. Story contents are not classified or filtered. Profile post links are hidden too.
- **Theme:** follows the toolbar preference using Electron's native theme and Instagram's theme classes. Instagram may change those internal classes.
- **Login:** direct Instagram login only. External redirects and popups are blocked. Camera/microphone permissions are denied. The session from v0.1 remains in the same partition and data directory.
- **Browser preview:** shows the app controls, not a simulated account. Native uploads and Instagram embedding are desktop-only.
- **Publication status:** a confirmed Story identifier is required before showing success. A timeout or connection error after configuration can leave publication uncertain. Check Instagram before retrying. Do not close the app while a Story is uploading.
- **Runtime setup:** optional, installs pinned instagrapi plus its dependencies into app data. Source installs and packaged builds still need system Python and FFmpeg. Python must remain installed. There is no auto-updater.

Never include passwords, cookies, access tokens, private media, or unredacted messages in an issue.
