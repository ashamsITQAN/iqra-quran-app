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

ALIAS = {"sura": "surah", "surah_number": "surah", "sura_no": "surah", "surah_id": "surah", "chapter": "surah",
         "aya": "ayah", "ayah_number": "ayah", "aya_no": "ayah", "ayah_id": "ayah", "verse": "ayah",
         "word_number": "word", "word_no": "word", "word_index": "word", "position": "word",
         "tafsir": "text", "meaning": "text", "content": "text", "translation": "text",
         "رقم السورة": "surah", "رقم الآية": "ayah", "رقم الكلمة": "word", "النص": "text", "التفسير": "text", "نص التفسير": "text"}
NOT_TEXT = {"surah", "ayah", "word", "word_id", "الآية", "السورة", "المشروع", "نوع المشروع", "مرحلة العمل", "قابل للنشر"}
POSITIONAL = {2: ["surah", "text"], 3: ["surah", "ayah", "text"], 5: ["word_id", "surah", "ayah", "word", "text"]}

def table(stream):
    """Yields dict rows. Tolerates other delimiters, renamed columns and a missing header row."""
    head = stream.read(8192); stream.seek(0)
    try: dialect = csv.Sniffer().sniff(head, delimiters=",;\t|")
    except csv.Error: dialect = csv.excel
    rows = csv.reader(stream, dialect)
    first = next(rows, None)
    if first is None: return
    names = [ALIAS.get(c.strip().lower(), c.strip().lower()) for c in first]
    print("  header:", first, "delimiter:", repr(dialect.delimiter))
    if "surah" in names and "ayah" in names and "text" not in names:
        # No recognisable text column: take the one holding the most text in the first rows.
        sample = [r for _, r in zip(range(300), rows)]
        totals = {i: sum(len(r[i]) for r in sample if i < len(r)) for i, n in enumerate(names) if n not in NOT_TEXT}
        best = max(totals, key=totals.get)
        print("  text column guessed:", first[best])
        names[best] = "text"
        import itertools
        rows = itertools.chain(sample, rows)
    if "surah" not in names or "text" not in names:
        guess = POSITIONAL.get(len(first))
        if guess is None: print("  unknown layout, skipped"); return
        if first[0].strip().isdigit(): yield dict(zip(guess, first))   # no header row: the first line is data
        names = guess
        print("  using positional columns:", names)
    for r in rows:
        yield dict(zip(names, r))

def read_rows(folder):
    files = [f for f in glob.glob(os.path.join(folder, "*")) if not os.path.basename(f).startswith(".")]
    print("  files:", [(os.path.basename(f), os.path.getsize(f)) for f in files])
    for f in files:
        if zipfile.is_zipfile(f):
            z = zipfile.ZipFile(f)
            for n in z.namelist():
                if n.lower().endswith(".csv"):
                    yield from table(io.StringIO(z.read(n).decode("utf-8-sig"), newline=""))
        elif f.lower().endswith((".csv", ".tsv", ".pkg")):
            yield from table(open(f, encoding="utf-8-sig", newline=""))

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
