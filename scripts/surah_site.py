#!/usr/bin/env python3
"""A copy of the Surah site's projects the app shows (i'rab, an-Nahj al-Qawim, sarf, the readings), kept in step with it.

  surah_site.py crawl  <store dir> <public dir> [minutes]   read from the API into the store, within a time budget
  surah_site.py export <store dir> <public dir>            write the store as page files for the app

The API answers one ayah per request, so a full pass is about 25,000 requests. A crawl first reads what the store has
never read, then reads again what it read longest ago: run on a schedule, the store fills in a few runs and after that
every ayah is read again every few days, so a change at the source reaches the app without downloading everything at
once.  The export writes content/surah-<slug>/<page>.json ({"s:a": text} or {"s:a:w": text}, as the API gives the
text) for every page an ayah has words on, and data/surah-site.json: per slug a string of 0/1, one per ayah in mushaf
order, saying which ayahs the files hold; the app reads the others live.
"""
import glob, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://dev.surahapp.com/api/v1"
SLUGS = [("eerab-word", "word"), ("eerab-aya", "aya"), ("word-tasreef", "word"), ("word-qeraat", "word")]
mode, store, pub = sys.argv[1], sys.argv[2], sys.argv[3]
keys = [f"{s}:{a}" for s, a, _p, _w in json.load(open(f"{pub}/data/search.json", encoding="utf8"))]
os.makedirs(store, exist_ok=True)

def load(slug):
    path = os.path.join(store, slug + ".json")
    return json.load(open(path, encoding="utf8")) if os.path.exists(path) else {"e": {}, "t": {}}

if mode == "crawl":
    budget = float(sys.argv[4]) * 60 if len(sys.argv) > 4 else 300
    t0 = time.time()
    data = {slug: load(slug) for slug, _ in SLUGS}
    jobs = [(data[slug]["t"].get(k, 0), i, slug, kind, k) for i, (slug, kind) in enumerate(SLUGS) for k in keys]
    jobs.sort()   # never read first (slug by slug), then the oldest readings

    def one(job):
        _t, _i, slug, kind, key = job
        if time.time() - t0 > budget: return job, None
        s, a = key.split(":")
        url = f"{API}/word/{slug}/{s}/{a}/1/300" if kind == "word" else f"{API}/aya/{slug}/{s}/{a}"
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "iqra-quran-app build (github.com/ashamsITQAN/iqra-quran-app)"})
                with urllib.request.urlopen(req, timeout=15) as r: j = json.load(r)
                if kind == "word": return job, {str(w["word_number"]): w["content"] for w in j if isinstance(w, dict) and w.get("content")} if isinstance(j, list) else {}
                return job, (j.get("content") or "") if isinstance(j, dict) else ""
            except urllib.error.HTTPError as e:
                if e.code == 404: return job, ({} if kind == "word" else "")   # the source has nothing for this ayah
                time.sleep(1)
            except Exception:
                time.sleep(1)
        return job, None

    done, changed, new = 0, 0, 0
    with ThreadPoolExecutor(8) as pool:
        for job, got in pool.map(one, jobs):
            if got is None: continue
            _t, _i, slug, _kind, key = job
            d = data[slug]; done += 1
            if key not in d["t"]: new += 1
            elif d["e"].get(key) != got: changed += 1
            d["e"][key] = got; d["t"][key] = int(time.time())
            if done % 1000 == 0: print(f"  {done} read, {time.time() - t0:.0f}s", flush=True)
    for slug, _ in SLUGS:
        json.dump(data[slug], open(os.path.join(store, slug + ".json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"surah site: read {done} ayah entries in {time.time() - t0:.0f}s ({new} new, {changed} changed at the source); held: " + ", ".join(f"{slug} {len(data[slug]['t'])}/{len(keys)}" for slug, _ in SLUGS))

elif mode == "export":
    pages = {}   # page -> the ayahs with words on it
    for f in sorted(glob.glob(f"{pub}/content/word-forms/*.json")):
        n = os.path.basename(f)[:-5]
        seen = []
        for wk in json.load(open(f, encoding="utf8")):
            k = wk.rsplit(":", 1)[0]
            if not seen or seen[-1] != k: seen.append(k)
        pages[n] = list(dict.fromkeys(seen))
    have = {}
    for slug, kind in SLUGS:
        d = load(slug)
        have[slug] = "".join("1" if k in d["t"] else "0" for k in keys)
        if not d["t"]: continue
        out = f"{pub}/content/surah-{slug}"; os.makedirs(out, exist_ok=True)
        for n, ayahs in pages.items():
            page = {}
            for k in ayahs:
                if k not in d["t"]: continue
                e = d["e"].get(k)
                if kind == "word":
                    for w, text in sorted((e or {}).items(), key=lambda x: int(x[0])): page[f"{k}:{w}"] = text
                elif e: page[k] = e
            json.dump(page, open(f"{out}/{n}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"built": int(time.time()), "have": have}, open(f"{pub}/data/surah-site.json", "w", encoding="utf8"), separators=(",", ":"))
    print("surah site export: " + ", ".join(f"{slug} {v.count('1')}/{len(v)}" for slug, v in have.items()))
