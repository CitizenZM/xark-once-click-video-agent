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
p = "dist/store/manifest.json"; m = json.load(open(p)); m.pop("key", None)
# Chrome Web Store build: no YouTube (the unpacked/GitHub build keeps it)
m["optional_host_permissions"] = [o for o in m.get("optional_host_permissions", []) if "youtube" not in o]
json.dump(m, open(p, "w"), indent=2)
for f in ("urls.js", "detect.js"):
    q = "dist/store/" + f; lines = open(q).read().split("\n")
    kept = [l for l in lines if "youtube" not in l.lower() and "youtu.be" not in l.lower() and "if (yt)" not in l]
    assert len(kept) < len(lines), f + ": no YouTube lines found to strip"
    open(q, "w").write("\n".join(kept))
q = "dist/store/background.js"; t = open(q).read()
open(q, "w").write(t.replace("Instagram, YouTube or X video links", "Instagram or X video links"))
for f in ("urls.js", "detect.js", "manifest.json"):
    assert "youtube" not in open("dist/store/" + f).read().lower(), f + " still mentions YouTube"
print(m["version"], file=open("dist/VERSION", "w"))
PY
V="$(cat dist/VERSION)"
(cd dist/store && zip -qr "../xark-once-click-video-agent-$V-store.zip" .)
(cd dist/unpacked && zip -qr "../xark-once-click-video-agent-$V-unpacked.zip" .)
if [ -n "${NO_SITE_COPY:-}" ]; then echo "built dist/*-$V-*.zip (site/ untouched)"; exit 0; fi
mkdir -p site && cp "dist/xark-once-click-video-agent-$V-unpacked.zip" site/xark-once-click-video-agent.zip
echo "built dist/*-$V-*.zip and site/xark-once-click-video-agent.zip"
