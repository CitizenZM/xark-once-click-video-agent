#!/bin/bash
# Build dist/one-click-downloader-<version>.zip for the Chrome Web Store (strips the dev-only "key").
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist/build && mkdir -p dist/build
cp extension/*.js extension/*.html extension/*.css extension/*.png extension/manifest.json dist/build/
python3 - <<'PY'
import json
p = "dist/build/manifest.json"; m = json.load(open(p)); m.pop("key", None); json.dump(m, open(p, "w"), indent=2)
print(m["version"], file=open("dist/VERSION", "w"))
PY
V="$(cat dist/VERSION)"
(cd dist/build && zip -qr "../one-click-downloader-$V.zip" .)
echo "built dist/one-click-downloader-$V.zip"
