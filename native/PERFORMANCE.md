# Local verification — 2026-10-28

Tested on the configured CachyOS laptop: Intel i5-13420H, 16 GB RAM, Intel integrated graphics and NVIDIA RTX 3050. These are short local checks, not a battery-life benchmark or a guarantee for other machines.

The October 28 investigation found an invalid Quick Boot cache snapshot, Android memory pressure with a 3 GiB guest, and excessive accessibility-tree traversal in the Focus guard. The runtime now uses a persistent cache disk, a 4 GiB guest and a fixed set of structural ID queries, coalesced at 350 ms. Focus-off events do not query Instagram. Control broadcasts run in the foreground and schedule inspection rather than blocking the receiver on a tree scan.

| Check | Result |
| --- | --- |
| Full shutdown, then launch with repaired snapshot | Native window attached in 14.37 seconds; emulator log confirms snapshot loaded in 8.97 seconds |
| Full shutdown and snapshot save | 12.19 seconds; persistent cache disk contains `default_boot` |
| Broken restore before repair | 77.43 seconds, falling back to a full boot |
| First cold boot with the new memory/cache configuration | 66.02 seconds; configuration changes require a new snapshot |
| Focus toggle acknowledgment, warmed guest | 0.073–0.191 seconds over three toggles |
| Stories-tray scrolling, Focus on, final warmed sample | 216 frames, median 28 ms, 90th percentile 32 ms, 12.96% janky frames |
| Same scrolling sequence, Focus off, preceding sample | 204 frames, median 29 ms, 90th percentile 42 ms, 17.65% janky frames |
| Earlier Focus-on sample during warmup | 149 frames, median 34 ms, 47.65% janky frames |
| Visible emulator, post-restore 5-second sample | 39.4% of one logical core; resident memory about 4.66 GiB |
| Fast reopen after closing to paused RAM | 0.96–1.97 seconds in the October 27 checks; no laptop reboot between those checks |

Frame statistics come from Android `dumpsys gfxinfo` during six pairs of horizontal swipes across the Stories tray. No Stories were opened and nothing was published. Samples run sequentially, with cache warming and background Android work affecting the results; they are not controlled comparative benchmarks. The earlier pre-repair sample had a median of 113 ms under different startup/memory conditions. The improved samples still miss frames and do not establish consistent 60 FPS.

CPU percentages use 100% for one logical core, not the whole laptop. In the October 27 checks, minimizing reduced emulator CPU from 109.4% to 3.2% over short 5-second samples. Fast reopen deliberately retains the emulator's RAM, now budgeted at about 5 GB including overhead. Use **⋯ → Quit completely** to release it; the next launch requires restoring the snapshot. Fast reopen does not survive rebooting the laptop.

Verified locally:

- One GTK window embeds the emulator display without a second browser engine or video-stream decoder.
- Home posts are covered while the Stories tray stays visible. Reels/Explore navigation controls are covered. Profile-grid and post-view selectors are included; Instagram layout changes can require updates.
- A selected generated photo opened in Instagram’s native Story and Post editors. A generated MP4 opened in its Reel editor, with focus still enabled. No Share/Publish buttons were pressed.
- Temporary test-media copies were removed; desktop originals and user-selected media were preserved.
- The Android guard APK declares no internet permission.
- Eight native controller tests and seven existing core tests pass.
- Installed application launcher validates, native source parses, and build scripts pass shell syntax checks.

This remains an Android app running under the official emulator. Active Instagram rendering, effects and networking still carry Android’s resource costs. The main idle savings come from pausing, and the fast reopening comes from keeping the paused guest in memory.
