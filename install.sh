#!/bin/bash
# One-command setup: engine + ffmpeg + the native helper, registered for Chrome-family browsers (macOS, Linux).
#   curl -fsSL https://raw.githubusercontent.com/CitizenZM/one-click-downloader-20261106/main/install.sh | bash
set -euo pipefail
REPO="${ONECLICK_REPO:-https://github.com/CitizenZM/one-click-downloader-20261106}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ ! -f "$SRC/host/oneclick_host.py" ]; then          # running via curl | bash: fetch the repo
  SRC="$HOME/.oneclick-downloader"
  if [ -d "$SRC/.git" ]; then git -C "$SRC" pull -q; else git clone -q --depth 1 "$REPO" "$SRC"; fi
fi
need() { command -v "$1" >/dev/null 2>&1; }
need python3 || { echo "python3 is required"; exit 1; }
if ! need engine; then
  if need pipx; then pipx install engine; elif need brew; then brew install engine; else python3 -m pip install --user -U engine; fi
fi
if ! need ffmpeg; then
  if need brew; then brew install ffmpeg; else echo "Please install ffmpeg (for example: sudo apt-get install ffmpeg)"; fi
fi
chmod +x "$SRC/host/oneclick_host.py"
if [ "$(uname -s)" = Darwin ]; then
  A="$HOME/Library/Application Support"
  ROOTS=("$A/Google/Chrome" "$A/Chromium" "$A/BraveSoftware/Brave-Browser" "$A/Microsoft Edge")
else
  ROOTS=("$HOME/.config/google-chrome" "$HOME/.config/chromium" "$HOME/.config/BraveSoftware/Brave-Browser" "$HOME/.config/microsoft-edge")
fi
n=0
for root in "${ROOTS[@]}"; do
  [ -d "$root" ] || continue
  mkdir -p "$root/NativeMessagingHosts"
  python3 - "$SRC" "$root/NativeMessagingHosts/com.barron.oneclick_dl.json" <<'PY'
import json, sys
src, out = sys.argv[1], sys.argv[2]
ids = [l.strip() for l in open(src + "/host/EXTENSION_IDS") if l.strip() and not l.startswith("#")]
json.dump({"name": "com.barron.oneclick_dl", "description": "One-click engine downloader",
           "path": src + "/host/oneclick_host.py", "type": "stdio",
           "allowed_origins": ["chrome-extension://%s/" % i for i in ids]}, open(out, "w"))
PY
  echo "registered: $root"; n=$((n+1))
done
[ "$n" -gt 0 ] || { echo "No Chrome-family browser profile folder found. Open Chrome once, then re-run."; exit 1; }
echo "Done. Now load the extension (see README), then open its dashboard to confirm 'Helper ready'."
