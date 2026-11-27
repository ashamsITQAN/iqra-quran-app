#!/usr/bin/env python3
"""Builds the index of words the readings (qiraat) differ on, from the Surah site's word-by-word readings project.

usage: qiraat.py <public dir> <out.json>      (run after build.py: it reads data/search.json for the list of ayahs)

One request per ayah. A word differs when its text, or its part under "---{عند الوصل}---", is anything but "لا خلاف…".
Output: {"w": {"2:9": [4, 6], ...}, "missing": ["s:a", ...]}; ayahs that could not be read are listed so the app asks for them live.
"""
import json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://dev.surahapp.com/api/v1/word/word-qeraat"
pub, out_path = sys.argv[1], sys.argv[2]
ayahs = [(s, a) for s, a, _p, _w in json.load(open(f"{pub}/data/search.json", encoding="utf8"))]

def differs(raw):
    return any(t.strip() and not t.strip().startswith("لا خلاف") for t in re.split(r"\n?---\{[^}]*\}---\n?", str(raw or "").replace("\r", ""))[::2])

def one(sa):
    s, a = sa
    for attempt in range(4):
        try:
            req = urllib.request.Request(f"{API}/{s}/{a}/1/300", headers={"User-Agent": "iqra-quran-app build"})
            with urllib.request.urlopen(req, timeout=30) as r: data = json.load(r)
            return sa, sorted(w["word_number"] for w in data if differs(w.get("content")))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return sa, None

t0 = time.time(); words, missing = {}, []
with ThreadPoolExecutor(8) as pool:
    for (s, a), nums in pool.map(one, ayahs):
        if nums is None: missing.append(f"{s}:{a}")
        elif nums: words[f"{s}:{a}"] = nums
print(f"qiraat: {sum(len(v) for v in words.values())} differing words in {len(words)} ayahs, {len(missing)} ayahs unread, {time.time() - t0:.0f}s")
if len(missing) > len(ayahs) * 0.2: sys.exit("too many ayahs unread; no index written")
json.dump({"w": words, "missing": missing}, open(out_path, "w", encoding="utf8"), separators=(",", ":"))
