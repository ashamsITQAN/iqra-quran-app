"""Builds public/data/topics.json from data/topics.csv (thematic division: runs of ayahs on one subject).
CSV columns: sura, aya (first ayah), end (last ayah), text, TITLE.   Usage: python3 scripts/topics.py"""
import csv, json, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
meta_ayahs = {}
try:
    for k, v in json.load(open(os.path.join(root, "public/data/meta.json"), encoding="utf8"))["surahs"].items(): meta_ayahs[int(k)] = v["ayahs"]
except FileNotFoundError: pass
# Proposed titles (data/topic-titles.csv: sura, aya, end, title, source) fill in rows the main file leaves untitled.
proposed = {}
try:
    for r in csv.DictReader(open(os.path.join(root, "data/topic-titles.csv"), encoding="utf-8-sig", newline="")):
        proposed[(int(r["sura"]), int(r["aya"]), int(r["end"]))] = (r["title"].strip(), r.get("source", "").strip() == "مقترح")
except FileNotFoundError: pass
out, bad, rows = {}, [], 0
for r in csv.DictReader(open(os.path.join(root, "data/topics.csv"), encoding="utf-8-sig", newline="")):
    rows += 1
    s, a, e = int(r["sura"]), int(r["aya"]), int(r["end"])
    if e < a or (meta_ayahs and e > meta_ayahs.get(s, 0)): bad.append(f"{s}:{a}-{e}"); continue
    title, guess = (r.get("TITLE") or "").strip(), 0
    if not title and (s, a, e) in proposed: title, guess = proposed[(s, a, e)][0], 1 if proposed[(s, a, e)][1] else 0
    out.setdefault(str(s), []).append([a, e, title, guess])   # guess = 1: a proposed title awaiting review
overlaps, uncovered = [], {}
for s, segs in out.items():
    segs.sort()
    for x, y in zip(segs, segs[1:]):
        if y[0] <= x[1]: overlaps.append(f"{s}:{x[0]}-{x[1]} / {y[0]}-{y[1]}")
    if meta_ayahs:
        covered = {a for x in segs for a in range(x[0], x[1] + 1)}
        miss = [a for a in range(1, meta_ayahs[int(s)] + 1) if a not in covered]
        if miss: uncovered[s] = miss
json.dump(out, open(os.path.join(root, "public/data/topics.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print("rows", rows, "kept", sum(len(v) for v in out.values()), "surahs", len(out), "titled", sum(1 for v in out.values() for x in v if x[2]), "of which proposed", sum(1 for v in out.values() for x in v if x[3]))
print("skipped (end before start, or past the surah):", bad)
print("overlapping:", overlaps)
print("surahs with ayahs outside every topic:", len(uncovered), {k: (v if len(v) < 8 else f"{len(v)} ayahs, {v[0]}..{v[-1]}") for k, v in uncovered.items()})
