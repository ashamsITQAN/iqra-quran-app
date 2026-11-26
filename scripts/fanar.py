"""Converts Fanar (cms.itqan.dev) text assets installed by itqan-cli into the app's per-page content files.
Usage: python3 scripts/fanar.py <fanar-assets dir> <public dir>
Run after scripts/build.py: it reads public/content/ayah-text to know which page each ayah is on."""
import csv, glob, io, json, os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
csv.field_size_limit(1 << 30)
EXTRA = {"volume": "المجلد", "page_start": "من الصفحة", "start_page": "من الصفحة", "page_end": "إلى الصفحة", "end_page": "إلى الصفحة", "rabt": "الربط", "words": "الكلمات"}

ayah_page, ayah_words = {}, {}
for f in sorted(glob.glob(os.path.join(dst, "content/ayah-text/*.json"))):
    for k, v in json.load(open(f, encoding="utf8")).items():
        ayah_page[k] = v["الصفحة"]; ayah_words[k] = v["عدد الكلمات"]
if not ayah_page:
    sys.exit("public/content/ayah-text is empty: run scripts/build.py first")

def read_rows(folder):
    files = [f for f in glob.glob(os.path.join(folder, "*")) if not os.path.basename(f).startswith(".")]
    print("  files:", [(os.path.basename(f), os.path.getsize(f)) for f in files])
    for f in files:
        if zipfile.is_zipfile(f):
            z = zipfile.ZipFile(f)
            for n in z.namelist():
                if n.lower().endswith(".csv"):
                    yield from csv.DictReader(io.TextIOWrapper(z.open(n), encoding="utf-8-sig", newline=""))
        elif f.lower().endswith((".csv", ".pkg")):
            yield from csv.DictReader(open(f, encoding="utf-8-sig", newline=""))

report = {}
for folder in sorted(glob.glob(os.path.join(src, "*"))):
    if not os.path.isdir(folder): continue
    slug = os.path.basename(folder)
    print(slug)
    by_page, skipped, rows, level, max_word = {}, 0, 0, "ayah", {}
    for r in read_rows(folder):
        rows += 1
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        try: a = f"{int(r['surah'])}:{int(r['ayah'])}"
        except (KeyError, ValueError): skipped += 1; continue
        if a not in ayah_page or not r.get("text"): skipped += 1; continue
        key = a
        if r.get("word"):
            level = "word"; key = f"{a}:{int(r['word'])}"; max_word[a] = max(max_word.get(a, 0), int(r["word"]))
        entry = {"النص": r["text"]}
        for col, label in EXTRA.items():
            if r.get(col): entry[label] = r[col]
        by_page.setdefault(ayah_page[a], {})[key] = entry
    out = os.path.join(dst, "content", slug); os.makedirs(out, exist_ok=True)
    for n in set(ayah_page.values()):
        json.dump(by_page.get(n, {}), open(os.path.join(out, f"{n:03d}.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    info = {"level": level, "rows": rows, "skipped": skipped, "entries": sum(len(v) for v in by_page.values())}
    if level == "word":
        diff = sorted((a for a in max_word if max_word[a] != ayah_words[a]), key=lambda a: tuple(map(int, a.split(":"))))
        info["ayahs_with_different_word_count"] = len(diff); info["examples"] = [f"{a} (fanar {max_word[a]}, quran.ws {ayah_words[a]})" for a in diff[:15]]
    report[slug] = info
    print("  ", info)
json.dump(report, open(os.path.join(dst, "data/fanar-report.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
