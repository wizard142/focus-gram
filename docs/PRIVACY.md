# Privacy

Focus Gram has no telemetry or analytics endpoint.

- Source media stays on your device unless you manually upload it through Instagram.
- Video processing runs in local FFmpeg child processes.
- Editor preferences, title text and caption are saved in localStorage. Clip references are kept only for the current session.
- Instagram cookies and web storage are kept in Electron's `persist:focus-gram-instagram` session under the app data directory. Use App settings → Sign out and clear Instagram session to clear them.
- Instagram remains a third-party network service, governed by Meta's own policies. Focus mode changes the page you see; it does not stop all Instagram network requests or tracking.
- Native import registers selected files for preview through a restricted custom protocol. Files are not copied into the repository or uploaded by the editor.
- Export uses a temporary directory that is removed when processing completes or is cancelled. A process crash may leave temporary data; use your system's temporary-file cleanup.
- Packaged apps have no auto-update service. Development installs and builds contact npm/Electron distribution servers for dependencies.

Do not put account credentials, session cookies, source videos, or private messages in GitHub issues.
