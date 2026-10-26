# Focus Gram v0.2.1

Fixes the grey Instagram view after publishing a Story.

The app previously hid Instagram on every loading event and only restored it when a new document was ready. Instagram's in-page loading can finish without that event, leaving the view hidden until focus mode was toggled.

The view now stays visible during in-page loading, restores the requested visibility when loading stops, and recovers correctly when a settings update is interrupted by navigation. Refresh waits for the page load and reapplies settings. A refresh failure does not turn a confirmed Story publication into an upload error.

A native regression test reproduces the old failure and verifies the complete Story-success/refresh path with a mocked publication. Tests do not publish to a real account.

Story uploads have been reported working on the user's personal account. They remain experimental. Instagram's mobile effects, music catalog and interactive stickers are not implemented; this patch does not add them.

Linux AppImage and tarball are attached. The existing login, theme and focus preference remain in the same application data directory. Keep Electron's sandbox enabled.
