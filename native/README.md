# Focus Gram native

A GTK desktop window containing the actual Instagram Android app. The shell uses system GTK rather than a second browser engine or a video stream. Create opens the desktop file chooser and sends only the chosen file into Instagram’s editor.

## Run locally

Requires Linux with X11 or Xwayland, Python/PyGObject with GTK 3 and GdkX11, xdotool, KVM, and a configured official Android SDK/Google Play AVD. The AVD must be named `Instagram`, with Instagram installed, on port 5556. Account data stays in the Android setup directory.

By default the Android setup is the sibling `android-instagram` folder. Set `FOCUS_GRAM_ANDROID_ROOT` to use another location. The desktop shell does not bundle Google’s system images or your account data.

Build the small Android focus helper once (requires JDK and Android SDK platform 35 / build-tools 35.0.0):

```sh
bash native/companion/build.sh
bash native/install.sh
bash native/launch.sh
```

### Android setup for a new machine

Use Google’s [official command-line tools](https://developer.android.com/studio#command-tools) and a [Google Play-enabled AVD](https://developer.android.com/studio/run/managing-avds). Put the SDK under `$FOCUS_GRAM_ANDROID_ROOT/sdk` (or symlink an existing SDK there). Keep the configured directories when launching the emulator or creating the AVD:

```sh
export FOCUS_GRAM_ANDROID_ROOT="/your/private/android-instagram"
export ANDROID_HOME="$FOCUS_GRAM_ANDROID_ROOT/sdk"
export ANDROID_USER_HOME="$FOCUS_GRAM_ANDROID_ROOT/state"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$FOCUS_GRAM_ANDROID_ROOT/devices"
mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "emulator" "platform-tools" \
  "platforms;android-35" "build-tools;35.0.0" "system-images;android-35;google_apis_playstore;x86_64"
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd --name Instagram \
  --package "system-images;android-35;google_apis_playstore;x86_64" --device pixel_5
```

Accept the SDK licenses yourself. Before first use, start this AVD with the official emulator on port 5556, sign in to Google Play, install Instagram from Meta, and sign in there. Close the emulator before launching Focus Gram. Never share the `state` or `devices` directories: they contain your virtual phone/account data. Keep `FOCUS_GRAM_ANDROID_ROOT` in your launch environment if you use a non-default location.

The tested AVD uses `hw.lcd.width=1280`, `hw.lcd.height=800`, `hw.lcd.density=180`, `hw.initialOrientation=landscape`, `hw.gpu.mode=host`, `hw.gpu.enabled=yes`, and `showDeviceFrame=no` in its `config.ini`. Apply these while the emulator is stopped. The native launcher supplies the memory/CPU/rendering flags.

Focus mode uses a local accessibility service to cover feed content and block navigation to Reels/Explore. Stories, DMs and creation editors remain available. It queries a fixed set of Instagram layout IDs at most once every 350 ms, skips unrelated app events, and does no scanning while Focus is off. It examines Instagram’s view structure only, stores no screen contents, and requests no internet permission. The local desktop controller enables the helper through the emulator’s ADB connection; existing accessibility services are preserved. This is a screen filter, not an account security feature or an Instagram server filter. Instagram layout updates may require selector changes.

[Local performance checks](PERFORMANCE.md) record the measured startup, CPU and memory tradeoffs.

The controller’s broadcast receiver requires Android’s `DUMP` permission, preventing ordinary Android apps from toggling the guard. The signing key and all account/device data remain outside the repository.

## Resources and lifecycle

- Uses KVM and host OpenGL with Vulkan disabled to avoid waking the discrete NVIDIA GPU alongside the Intel GPU on the tested laptop.
- Allocates 4 GiB of guest memory to reduce Android swap/reclaim stalls.
- Renders 1280 × 800 into a freely resizable desktop window.
- Uses Quick Boot snapshots with a persistent Android cache disk after the first cold boot. Changing the emulator configuration invalidates its previous snapshot. Shutdown allows the snapshot writer up to 60 seconds before the emulator watchdog intervenes.
- Pauses the virtual machine while minimized and resumes it when restored. Android notifications and background uploads also pause, so keep the window open during publishing.
- **Fast reopen** is on by default: closing detaches/hides the Android display and keeps the VM paused in memory (about 5 GB RAM including emulator overhead). Reopening resumes it without restoring a snapshot.
- Use **⋯ → Quit completely**, or turn off **Fast reopen**, to save/exit Android and release its VM, camera and GPU resources. The following launch then needs snapshot restoration.
- No whole-library syncing, screenshot polling, telemetry or unofficial publishing API in this shell.

The Android runtime remains the main resource cost. Startup time and power use depend on the host and saved snapshot; this does not turn Instagram’s Android code into a native Linux application.

Dark/light changes apply to the GTK shell and Android system theme. Instagram may honor its own in-app theme setting if you previously overrode the system default.
