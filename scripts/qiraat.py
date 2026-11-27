#!/usr/bin/env python3
"""Builds the index of words the readings (qiraat) differ on, from the Surah site's word-by-word readings project.

usage: qiraat.py <public dir> <index.json> [minutes]      (run after build.py: it reads data/search.json for the ayahs)

One request per ayah, so the work is spread over builds: each run takes up the ayahs still unread in the index it is
given and stops when its time budget (default 5 minutes) is spent. A complete index is refreshed after 30 days.
A word differs when its text, or its part under "---{عند الوصل}---", is anything but "لا خلاف…".
Output: {"built": epoch, "w": {"2:9": [4, 6], ...}, "missing": ["s:a", ...]}; the app asks for missing ayahs live.
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://dev.surahapp.com/api/v1/word/word-qeraat"
pub, path = sys.argv[1], sys.argv[2]
budget = float(sys.argv[3]) * 60 if len(sys.argv) > 3 else 300
keys = [f"{s}:{a}" for s, a, _p, _w in json.load(open(f"{pub}/data/search.json", encoding="utf8"))]
old = json.load(open(path, encoding="utf8")) if os.path.exists(path) else None
if old and not old.get("missing") and time.time() - old.get("built", 0) > 30 * 86400: old = None
words = dict(old["w"]) if old else {}
todo = list(old["missing"]) if old else keys
t0 = time.time()

def differs(raw):
    return any(t.strip() and not t.strip().startswith("لا خلاف") for t in re.split(r"\n?---\{[^}]*\}---\n?", str(raw or "").replace("\r", ""))[::2])

def one(key):
    if time.time() - t0 > budget: return key, None
    s, a = key.split(":")
    for attempt in range(2):
        try:
            req = urllib.request.Request(f"{API}/{s}/{a}/1/300", headers={"User-Agent": "iqra-quran-app build"})
            with urllib.request.urlopen(req, timeout=12) as r: data = json.load(r)
            return key, sorted(w["word_number"] for w in data if differs(w.get("content")))
        except Exception:
            time.sleep(1)
    return key, None

missing, done = [], 0
with ThreadPoolExecutor(8) as pool:
    for key, nums in pool.map(one, todo):
        if nums is None: missing.append(key); continue
        done += 1
        if nums: words[key] = nums
        if done % 500 == 0: print(f"  {done} ayahs read, {time.time() - t0:.0f}s", flush=True)
print(f"qiraat: read {done} of {len(todo)} ayahs this run in {time.time() - t0:.0f}s; index holds {sum(len(v) for v in words.values())} differing words, {len(missing)} ayahs still unread")
if done or old:
    json.dump({"built": old["built"] if old and missing else time.time(), "w": words, "missing": missing}, open(path, "w", encoding="utf8"), separators=(",", ":"))
