#!/usr/bin/env python3
"""Turns the QUL "Mutashabihat ul Quran (Phrase)" export into public/data/mutashabihat.json.

usage: mutashabihat.py <mutashabihat.zip> <public dir>      (run after build.py: it reads data/search.json)

The export gives, per phrase, the ayahs it occurs in and the word range in each (1-based, inclusive). Word numbering
matches the mushaf's own; the few ranges that are off by a word or run past the ayah are realigned or dropped.
Output: {"p": {id: [occurrences, ayahs, [sourceAyah, from, to], {ayah: [[from, to], ...]}]}}
"""
import json, re, sys, zipfile

z = zipfile.ZipFile(sys.argv[1]); out_dir = sys.argv[2]
name = next(n for n in z.namelist() if n.endswith("phrases.json"))
phrases = json.loads(z.read(name))
words = {f"{s}:{a}": w for s, a, _p, w in json.load(open(f"{out_dir}/data/search.json", encoding="utf8"))}
MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ\s]")
def norm(ws): return MARKS.sub("", "".join(ws)).translate(str.maketrans("أإآٱىة", "ااااية"[:6]))

out, moved, dropped = {}, 0, 0
for pid, p in phrases.items():
    src = p["source"]; sw = words.get(src["key"])
    if not sw or src["to"] > len(sw) or src["from"] < 1: dropped += 1; continue
    ref = norm(sw[src["from"] - 1:src["to"]]); ayahs = {}
    for key, ranges in p["ayah"].items():
        w = words.get(key); keep = []
        if not w: dropped += len(ranges); continue
        for f, t in ranges:
            at = lambda d: norm(w[f - 1 + d:t + d]) if f - 1 + d >= 0 and t + d <= len(w) else None
            if at(0) != ref:   # an exact match one to three words away means the range is misaligned, not a variant wording
                d = next((d for d in (-1, 1, -2, 2, -3, 3) if at(d) == ref), 0)
                if d: f, t = f + d, t + d; moved += 1
            if f < 1 or t > len(w): dropped += 1; continue
            keep.append([f, t])
        if keep: ayahs[key] = keep
    if len(ayahs) < 2 and sum(len(v) for v in ayahs.values()) < 2: continue
    out[pid] = [sum(len(v) for v in ayahs.values()), len(ayahs), [src["key"], src["from"], src["to"]], ayahs]
json.dump({"p": out}, open(f"{out_dir}/data/mutashabihat.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print(f"mutashabihat: {len(out)} phrases, {sum(v[0] for v in out.values())} occurrences, {moved} realigned, {dropped} dropped")
