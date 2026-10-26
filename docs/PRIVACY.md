# Privacy

Focus Gram has no analytics or hosted backend.

- Instagram cookies remain in the existing `persist:focus-gram-instagram` Electron session. Sign out in Settings to clear them. The helper never asks for your password.
- Selected files stay local until you continue into Instagram's composer or explicitly publish a Story. Normal Post/Reel handoff gives Instagram's webpage access to the chosen file.
- Experimental Story publication sends your selected media directly to Instagram using the local instagrapi helper. Necessary session cookies travel from the app's main process to that helper over stdin. They are not exposed to the UI, command arguments or logs, and no extra session file is written.
- The helper forces the requests transport and restricts outgoing requests to Instagram and its media CDN hosts. No token service is used.
- One-time Story setup contacts PyPI to install pinned dependencies into a virtual environment in app data. Package dependencies have their own licenses.
- Video preparation creates temporary local files, removed on completion or failure. A crash may leave temporary files for system cleanup.
- Theme, focus and experimental-feature preferences are saved locally. The caption is copied to your system clipboard only when you continue to Instagram and the app tells you it has done so.
- Instagram's own network activity remains governed by Meta's policies. Focus mode changes visibility and navigation; it does not remove tracking from Instagram.

Don't put cookies, tokens, private media or messages into GitHub issues.
