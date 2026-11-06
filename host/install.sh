#!/bin/bash
# Registers the native host with Chrome (and Chromium-family browsers that exist).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ID="$(cat "$DIR/EXTENSION_ID")"
NAME=com.barron.oneclick_dl
for base in "$HOME/Library/Application Support/Google/Chrome" "$HOME/Library/Application Support/Chromium" "$HOME/Library/Application Support/BraveSoftware/Brave-Browser"; do
  [ -d "$base" ] || continue
  mkdir -p "$base/NativeMessagingHosts"
  cat > "$base/NativeMessagingHosts/$NAME.json" <<JSON
{"name":"$NAME","description":"One-click engine downloader","path":"$DIR/oneclick_host.py","type":"stdio","allowed_origins":["chrome-extension://$ID/"]}
JSON
  echo "registered: $base/NativeMessagingHosts/$NAME.json"
done
