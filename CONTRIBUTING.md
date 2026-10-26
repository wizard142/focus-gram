# Contributing

Keep Focus Gram honest about its capabilities. A web workspace cannot promise mobile-app feature parity.

1. Install dependencies and system FFmpeg.
2. Run `npm test`, `npm run build`, and `npm run test:ui` for changes to the editor or filtering.
3. For native behavior, build and run `node tests/desktop.mjs` in a Linux desktop session.
4. Include reproduction steps and test results with your PR.

For focus-mode changes, preserve Story viewers and login forms. Add fixture coverage before broadening selectors. Do not expose Node or the app bridge to Instagram, disable the sandbox, or use unofficial mobile endpoints.

Please open a focused issue before starting a major feature. Never post secrets or private account data.
