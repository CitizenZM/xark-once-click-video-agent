#!/bin/bash
# Builds two zips in dist/:
#  - xark-once-click-video-agent-<v>-store.zip     for the Chrome Web Store (no "key": the store assigns its own ID)
#  - xark-once-click-video-agent-<v>-unpacked.zip  for "Load unpacked" (keeps the public "key" so the extension ID matches host/EXTENSION_IDS)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/store dist/unpacked
for d in store unpacked; do cp extension/*.js extension/*.html extension/*.css extension/*.png extension/manifest.json dist/$d/; done
python3 - <<'PY'
import json
p = "dist/store/manifest.json"; m = json.load(open(p)); m.pop("key", None); json.dump(m, open(p, "w"), indent=2)
print(m["version"], file=open("dist/VERSION", "w"))
PY
V="$(cat dist/VERSION)"
(cd dist/store && zip -qr "../xark-once-click-video-agent-$V-store.zip" .)
(cd dist/unpacked && zip -qr "../xark-once-click-video-agent-$V-unpacked.zip" .)
mkdir -p site && cp "dist/xark-once-click-video-agent-$V-unpacked.zip" site/xark-once-click-video-agent.zip
echo "built dist/*-$V-*.zip and site/xark-once-click-video-agent.zip"
