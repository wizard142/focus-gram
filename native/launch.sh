#!/usr/bin/env bash
set -euo pipefail
export GDK_BACKEND=x11
export QT_QPA_PLATFORM=xcb
exec python3 "$(dirname -- "$0")/app.py" "$@"
