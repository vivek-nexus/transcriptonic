#!/usr/bin/env bash

set -euo pipefail

# Build Chrome (MV3) and Firefox (MV2) variants from unified root using separate manifests

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
CHROME_OUT="$DIST_DIR/chrome"
FIREFOX_OUT="$DIST_DIR/amo"

echo "[build] Root: $ROOT_DIR"

rm -rf "$CHROME_OUT" "$FIREFOX_OUT"
mkdir -p "$CHROME_OUT/icons" "$FIREFOX_OUT/icons" "$DIST_DIR"

read_version() {
  local manifest_path="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$manifest_path" <<'PY'
import json,sys
path=sys.argv[1]
with open(path,'r') as f:
  data=json.load(f)
print(data.get('version','0.0.0'))
PY
  else
    grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$manifest_path" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
  fi
}

VERSION=$(read_version "$SRC_DIR/manifest.json")
echo "[build] Version: $VERSION"

copy_common() {
  local from="$1"; local to="$2"
  local files=(background.js content.js meetings.html meetings.js popup.html popup.js icon.png)
  for f in "${files[@]}"; do
    if [[ -f "$from/$f" ]]; then cp "$from/$f" "$to/$f"; fi
  done
  if [[ -d "$from/icons" ]]; then
    find "$from/icons" -maxdepth 1 -type f -name '*.svg' -exec cp {} "$to/icons/" \;
  fi
}

strip_ts_refs() {
  local f="$1"
  if [[ -f "$f" ]]; then
    if [[ "$OSTYPE" == darwin* ]]; then
      sed -i '' -E 's#^/// <reference.*$##' "$f"
    else
      sed -i -E 's#^/// <reference.*$##' "$f"
    fi
  fi
}

# Chrome (MV3)
echo "[build] Preparing Chrome (MV3) package..."
copy_common "$SRC_DIR" "$CHROME_OUT"
cp "$SRC_DIR/manifest.json" "$CHROME_OUT/manifest.json"
strip_ts_refs "$CHROME_OUT/content.js"; strip_ts_refs "$CHROME_OUT/background.js"
CHROME_ZIP="$DIST_DIR/transcriptonic-chrome-v$VERSION.zip"
(cd "$CHROME_OUT" && zip -qr "$CHROME_ZIP" . -x '*.DS_Store')

# Firefox (MV2)
echo "[build] Preparing Firefox (MV2) package..."
copy_common "$SRC_DIR" "$FIREFOX_OUT"
cp "$SRC_DIR/manifest-firefox.json" "$FIREFOX_OUT/manifest.json"
strip_ts_refs "$FIREFOX_OUT/content.js"; strip_ts_refs "$FIREFOX_OUT/background.js"
if command -v web-ext >/dev/null 2>&1; then
  echo "[lint] Running web-ext lint (Firefox)..."
  web-ext lint --source-dir "$FIREFOX_OUT" || echo "[lint] web-ext reported warnings/errors (continuing)."
fi
FIREFOX_ZIP="$DIST_DIR/transcriptonic-firefox-v$VERSION.zip"
(cd "$FIREFOX_OUT" && zip -qr "$FIREFOX_ZIP" . -x '*.DS_Store')

echo "[done] Chrome: $CHROME_ZIP"
echo "[done] Firefox: $FIREFOX_ZIP"


