#!/usr/bin/env python3
"""The list of what can be kept for use without a connection, with a short hash of every file.

A reader's device holds the packs it chose; on every start it compares its hashes with this list and fetches only the
files that changed, so a pack always follows the sources (Fanar, the mushaf pages, the indexes) without downloading
everything again.  Usage: offline.py <public dir>
"""
import hashlib, json, os, sys, time

root = sys.argv[1]
packs = {}

def add(pack, rel):
    path = os.path.join(root, rel)
    if not os.path.isfile(path):
        return
    with open(path, "rb") as f:
        data = f.read()
    packs.setdefault(pack, {})[rel.replace(os.sep, "/")] = [hashlib.sha1(data).hexdigest()[:10], len(data)]

for name in sorted(os.listdir(os.path.join(root, "pages"))):
    if name.endswith(".svg"):
        add("mushaf", os.path.join("pages", name))
skip = {"offline.json"}
for name in sorted(os.listdir(os.path.join(root, "data"))):
    if name.endswith(".json") and name not in skip:
        add("core", os.path.join("data", name))
content = os.path.join(root, "content")
if os.path.isdir(content):
    for name in sorted(os.listdir(content)):
        full = os.path.join(content, name)
        if os.path.isdir(full):
            for f in sorted(os.listdir(full)):
                if f.endswith(".json"):
                    add(name, os.path.join("content", name, f))
        elif name.endswith(".json"):
            add("core", os.path.join("content", name))   # one-file projects: surah objectives, page and surah cards
out = {"built": int(time.time()), "packs": {k: {"bytes": sum(v[1] for v in files.values()), "files": files} for k, files in packs.items()}}
with open(os.path.join(root, "data", "offline.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("offline list:", ", ".join(f"{k} {len(v['files'])} files {v['bytes'] // 1024} KB" for k, v in out["packs"].items()))
