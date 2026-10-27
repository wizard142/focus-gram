"""Android lifecycle and desktop-window integration. No timers inspect Instagram."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('FOCUS_GRAM_ANDROID_ROOT', str(ROOT.parent.parent / 'android-instagram')))
ADB = DATA / 'sdk/platform-tools/adb'
SERIAL = 'emulator-5556'
PACKAGE = 'io.github.wizard142.focusgram'
COMPONENT = PACKAGE + '/.FocusService'
GUEST_MEMORY_MB = 4096
SHUTDOWN_TIMEOUT = 75

def command(args, timeout=20, check=True):
    return subprocess.run([str(x) for x in args], capture_output=True, text=True,
                          timeout=timeout, check=check)

def adb(*args, timeout=20, check=True):
    return command([ADB, '-s', SERIAL, *args], timeout, check)

def shell(*args, **kwargs):
    return adb('shell', shlex.join([str(x) for x in args]), **kwargs).stdout.strip()

def console(*args):
    result = adb('emu', *args, timeout=15)
    if 'KO:' in result.stdout:
        raise RuntimeError(result.stdout.strip())
    return result.stdout

class Runtime:
    def __init__(self):
        self.process = None
        self.window = None
        self.pid = None
        self.owned = False
        self.paused = False
        self.cancelled = threading.Event()

    def start(self, report):
        if not ADB.is_file():
            raise RuntimeError('Android setup was not found. Set FOCUS_GRAM_ANDROID_ROOT to its folder.')
        parked_file = DATA / 'state/native-parked.json'
        parked = False
        try:
            saved = json.loads(parked_file.read_text())
            cmdline = Path(f'/proc/{int(saved["pid"])}/cmdline').read_bytes()
            parked = b'qemu-system-x86_64' in cmdline and b'Instagram' in cmdline
        except (OSError, ValueError, KeyError, TypeError):
            pass
        # The guest's adbd cannot finish a new handshake while its VM is paused.
        # Resume a known parked process through the host console before using ADB.
        running = parked or adb('get-state', timeout=4, check=False).returncode == 0
        if running and 'stopped' in console('avd', 'status'):
            console('avd', 'resume')
            self.paused = False
        if not running:
            report('Starting Android…')
            log_dir = DATA / 'logs'
            log_dir.mkdir(exist_ok=True)
            env = dict(os.environ, QT_QPA_PLATFORM='xcb',
                       ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL='60',
                       ANDROID_HOME=str(DATA / 'sdk'), ANDROID_SDK_ROOT=str(DATA / 'sdk'),
                       ANDROID_USER_HOME=str(DATA / 'state'), ANDROID_EMULATOR_HOME=str(DATA / 'state'),
                       ANDROID_AVD_HOME=str(DATA / 'devices'))
            env.pop('QT_PLUGIN_PATH', None)
            persistent_cache = DATA / 'devices/Instagram.avd/cache-persistent.img'
            snapshot_args = [] if persistent_cache.exists() else ['-no-snapshot-load']
            with (log_dir / 'focus-gram.log').open('a') as log:
                self.process = subprocess.Popen([
                    str(DATA / 'sdk/emulator/emulator'), '-avd', 'Instagram', '-port', '5556',
                    '-memory', str(GUEST_MEMORY_MB), '-cores', '4', '-gpu', 'host', '-feature', '-Vulkan', '-no-boot-anim',
                    '-cache', str(persistent_cache),
                    '-skin', '1280x800', '-camera-front', 'webcam0',
                    *snapshot_args,
                ], env=env, stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
            self.owned = True
        for _ in range(180):
            if self.cancelled.is_set():
                raise RuntimeError('Startup canceled.')
            if self.process and self.process.poll() is not None:
                raise RuntimeError('Android stopped during startup. See the local focus-gram.log.')
            result = adb('shell', 'getprop', 'sys.boot_completed', timeout=4, check=False)
            if result.stdout.strip() == '1':
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('Android did not finish starting. Close the app and try again.')
        report('Opening Instagram…')
        apk = ROOT / 'companion/build/focus-guard.apk'
        if not apk.is_file():
            raise RuntimeError('Focus guard is missing. Run native/companion/build.sh first.')
        # Reinstall only when the APK changed; never clear account or app data.
        stamp = DATA / 'state/focus-guard-version'
        version = str(apk.stat().st_mtime_ns)
        if not stamp.exists() or stamp.read_text() != version or not shell('pm', 'path', PACKAGE):
            adb('install', '-r', apk, timeout=60)
            stamp.write_text(version)
        configured = DATA / 'state/native-runtime-v1'
        if not configured.exists():
            for setting, value in [('window_animation_scale', '0.25'), ('transition_animation_scale', '0.25'),
                                   ('animator_duration_scale', '0.25')]:
                shell('settings', 'put', 'global', setting, value)
            shell('settings', 'put', 'system', 'screen_off_timeout', '2147483647')
            shell('settings', 'put', 'system', 'peak_refresh_rate', '60.0')
            shell('settings', 'put', 'system', 'min_refresh_rate', '30.0')
            configured.write_text('1')
        shell('appops', 'set', PACKAGE, 'ACCESS_RESTRICTED_SETTINGS', 'allow')
        self.focus(True)
        enabled = shell('settings', 'get', 'secure', 'enabled_accessibility_services')
        services = [] if enabled in ('null', '') else enabled.split(':')
        if COMPONENT not in services:
            services.append(COMPONENT)
            shell('settings', 'put', 'secure', 'enabled_accessibility_services', ':'.join(services))
            shell('settings', 'put', 'secure', 'accessibility_enabled', '1')
        for _ in range(30):
            state = shell('dumpsys', 'accessibility')
            if any('Bound services:' in line and 'Focus Gram Guard' in line for line in state.splitlines()):
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('Android could not enable Focus Gram Guard. Focus mode is unavailable.')
        if not parked:
            shell('am', 'start', '-n', 'com.instagram.android/.activity.MainTabActivity')
        for _ in range(60):
            result = command(['xdotool', 'search', '--name', '^Android Emulator - Instagram:5556$'],
                             timeout=3, check=False)
            if result.stdout.strip():
                self.window = int(result.stdout.strip().splitlines()[-1])
                break
            time.sleep(0.2)
        if not self.window:
            raise RuntimeError('The Android display could not be attached.')
        result = command(['xdotool', 'getwindowpid', self.window], check=False)
        if result.stdout.strip().isdigit():
            self.pid = int(result.stdout.strip())
        parked_file.unlink(missing_ok=True)
        # The emulator tool strip remains a separate Qt window; the app supplies its controls.
        if self.process:
            result = command(['xdotool', 'search', '--pid', self.process.pid], check=False)
            for item in result.stdout.splitlines():
                if item.isdigit() and int(item) != self.window:
                    name = command(['xdotool', 'getwindowname', item], check=False).stdout.strip()
                    if name == 'Emulator':
                        command(['xdotool', 'windowunmap', item], check=False)
        return self.window

    def focus(self, enabled):
        for _ in range(3):
            result = shell('am', 'broadcast', '--receiver-foreground', '--include-stopped-packages', '-n', PACKAGE + '/.ControlReceiver',
                  '-a', PACKAGE + '.SET_FOCUS', '--ez', 'enabled', 'true' if enabled else 'false')
            if 'Permission Denial' in result:
                break
            if 'data=' in result:
                return
            time.sleep(0.3)
        raise RuntimeError('The Android focus helper did not acknowledge the change.')

    def pause(self, paused):
        if self.paused == paused:
            return
        console('avd', 'pause' if paused else 'resume')
        self.paused = paused
        print('Android paused' if paused else 'Android resumed', flush=True)

    def close(self):
        # Saving/exiting releases the VM, camera and GPU instead of leaving them running.
        if self.paused:
            self.pause(False)
        console('kill')
        # Keep the embedded Qt surface alive until snapshot writing finishes.
        # Destroying its parent immediately can invalidate the saved GL context.
        if self.process:
            self.process.wait(timeout=SHUTDOWN_TIMEOUT)
        elif self.pid:
            for _ in range(SHUTDOWN_TIMEOUT * 10):
                stat = Path(f'/proc/{self.pid}/stat')
                if not stat.exists() or stat.read_text().split(') ', 1)[1].startswith('Z'):
                    break
                time.sleep(0.1)
        (DATA / 'state/native-parked.json').unlink(missing_ok=True)

    def park(self, root_window):
        if not self.window or not self.pid:
            self.close()
            return
        self.pause(True)
        try:
            command(['xdotool', 'windowunmap', self.window])
            command(['xdotool', 'windowreparent', self.window, root_window])
            marker = DATA / 'state/native-parked.json'
            marker.write_text(json.dumps({'pid': self.pid, 'window': self.window}))
            marker.chmod(0o600)
        except Exception:
            # A failed detach must not leave an invisible, running guest behind.
            self.close()
            raise

    def home(self):
        shell('am', 'start', '-n', 'com.instagram.android/.activity.MainTabActivity')

    def theme(self, dark):
        shell('cmd', 'uimode', 'night', 'yes' if dark else 'no')

    def back(self):
        shell('input', 'keyevent', '4')

    def share(self, path, destination):
        from media import share
        return share(path, destination)
