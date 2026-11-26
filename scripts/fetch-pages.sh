#!/usr/bin/env bash
# Downloads the word-split mushaf pages from quran.ws and builds public/pages, public/data, public/content.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
curl -fsSL -o "$TMP/q.tar.gz" https://github.com/quran-ws/quran-svg-elements/releases/download/v1.0.0/quran-svg-hafs-kfgqpc.tar.gz
tar xzf "$TMP/q.tar.gz" -C "$TMP"
python3 scripts/build.py "$TMP/quran-svg-hafs-kfgqpc" public
rm -rf "$TMP"
