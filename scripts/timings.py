"""Converts a three-level recitation timing file (ayah, breath group, word) into the app's compact form.
Usage: python3 scripts/timings.py <timing.json> <extracted quran.ws bundle dir> <out.json>

The reciter sometimes takes a breath and goes back a few words, so the file can list more words for an
ayah than the mushaf has. Each timed word is matched to its position in the printed ayah; a repeated
word points back at the same position, which is what lets the highlight jump back with the reciter."""
import json, glob, os, re, sys
src, bundle, out = sys.argv[1:4]
MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ‌-‏]")
def fold(w):
    w = MARKS.sub("", w)
    for a, b in (("ٱ", "ا"), ("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ؤ", "و"), ("ئ", "ي"), ("ء", ""), ("ة", "ه"), ("ـ", "")):
        w = w.replace(a, b)
    return w.strip()
d = json.load(open(src, encoding="utf8"))
surah = int(d["surah_id"])
canon = {}
for f in sorted(glob.glob(os.path.join(bundle, "index/by-page/*.json"))):
    for x in json.load(open(f, encoding="utf8"))["words"]:
        s, a, i = map(int, x["word_key"].split(":"))
        if s == surah: canon.setdefault(a, {})[i] = fold(x["rasm_uthmani"])
ms = lambda v: round(float(v) * 1000)
ayahs, stats = {}, {"ayahs": 0, "words": 0, "repeats": 0, "unmatched": 0, "uncovered": []}
for a in d["ayahs"]:
    n = int(a["ayah_number"]); c = [canon[n][i] for i in sorted(canon[n])]
    p, rows = 0, []
    for w in a["words"]:
        t = fold(w["word"]); j = None
        if p < len(c) and c[p] == t: j = p
        else:
            back = [k for k in range(min(p, len(c)) - 1, -1, -1) if c[k] == t]      # the reciter went back
            fwd = [k for k in range(p + 1, min(len(c), p + 4)) if c[k] == t]
            if back: j = back[0]; stats["repeats"] += 1
            elif fwd: j = fwd[0]
            else: j = min(p, len(c) - 1); stats["unmatched"] += 1
        rows.append([j + 1, ms(w["start"]), ms(w["end"])]); p = j + 1
    seen = {r[0] for r in rows}
    if len(seen) != len(c): stats["uncovered"].append(n)
    ayahs[str(n)] = rows; stats["ayahs"] += 1; stats["words"] += len(rows)
groups = [[ms(g["start_time"]), ms(g["end_time"]), int(g["ayah_numbers"][0]), int(g["ayah_numbers"][-1])] for g in d["breath_groups"]]
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({"surah": surah, "ayahs": ayahs, "groups": groups}, open(out, "w", encoding="utf8"), separators=(",", ":"))
print(stats, "groups", len(groups), "bytes", os.path.getsize(out))
