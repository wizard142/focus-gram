#!/usr/bin/env bash
set -euo pipefail
native_root="$(cd -- "$(dirname -- "$0")" && pwd)"
python3 - "$native_root" <<'PY'
from pathlib import Path
import os, subprocess, sys
import shutil
root = Path(sys.argv[1])
root.joinpath('launch.sh').chmod(0o755)
fonts = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'fonts/focus-gram'
fonts.mkdir(parents=True, exist_ok=True)
shutil.copy2(root / 'assets/InstrumentSans.ttf', fonts / 'InstrumentSans.ttf')
subprocess.run(['fc-cache', str(fonts)], check=False)
apps = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'applications'
apps.mkdir(parents=True, exist_ok=True)
entry = apps / 'io.github.wizard142.FocusGram.Native.desktop'
entry.write_text(f'''[Desktop Entry]
Type=Application
Name=Focus Gram
Comment=Instagram with Stories, creation tools and focus controls
Exec="{root / 'launch.sh'}"
Icon={root.parent / 'public/icon.png'}
Terminal=false
StartupWMClass=focus-gram
Categories=Network;
Keywords=Instagram;Stories;Focus;
''')
entry.chmod(0o755)
desktop = Path(subprocess.check_output(['xdg-user-dir', 'DESKTOP'], text=True).strip())
desktop.mkdir(parents=True, exist_ok=True)
shortcut = desktop / 'Focus Gram.desktop'
old_entry = apps / 'io.github.wizard142.FocusGram.desktop'
if shortcut.is_symlink() and shortcut.resolve() == old_entry:
    shortcut.unlink()
if old_entry.exists() and str(root / 'launch.sh') in old_entry.read_text():
    old_entry.unlink()
if not shortcut.exists() and not shortcut.is_symlink():
    shortcut.symlink_to(entry)
subprocess.run(['update-desktop-database', str(apps)], check=False)
print('Focus Gram installed in the application menu and on the desktop.')
PY
