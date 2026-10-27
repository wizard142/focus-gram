# Local verification — 2026-10-27

Tested on the configured CachyOS laptop: Intel i5-13420H, 16 GB RAM, Intel integrated graphics and NVIDIA RTX 3050. These are short local checks, not a battery-life benchmark or a guarantee for other machines.

| Check | Result |
| --- | --- |
| Reopen after Fast reopen close | Native Android window attached in 0.96–1.97 seconds over two checks |
| Reopen after full shutdown | 18.11–29.95 seconds in the final configuration, including snapshot restoration |
| Initial cold boot after changing configuration | About 60 seconds under the current desktop workload |
| Emulator CPU, visible app | 109.4% over a 5-second sample |
| Emulator CPU, minimized/paused | 3.2% over a 5-second sample |
| Emulator resident memory | About 3.8 GiB (3 GiB configured guest memory plus overhead) |

CPU percentages use 100% for one logical core, not the whole laptop. Minimize correctly stopped the virtual CPUs; restoring resumed them. Fast reopen deliberately retains the emulator's RAM. Use **⋯ → Quit completely** to release it; the next launch requires restoring the snapshot.

Verified locally:

- One GTK window embeds the emulator display without a second browser engine or video-stream decoder.
- Home posts are covered while the Stories tray stays visible. Reels/Explore navigation controls are covered. Profile-grid and post-view selectors are included; Instagram layout changes can require updates.
- A selected generated photo opened in Instagram’s native Story and Post editors. A generated MP4 opened in its Reel editor, with focus still enabled. No Share/Publish buttons were pressed.
- Temporary test-media copies were removed; desktop originals and user-selected media were preserved.
- The Android guard APK declares no internet permission.
- Eight native controller tests and seven existing core tests pass.
- Installed application launcher validates, native source parses, and build scripts pass shell syntax checks.

This remains an Android app running under the official emulator. Active Instagram rendering, effects and networking still carry Android’s resource costs. The main idle savings come from pausing, and the fast reopening comes from keeping the paused guest in memory.
