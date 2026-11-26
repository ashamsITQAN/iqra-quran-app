"""Builds public/pages, public/data and public/content from the quran.ws bundle.
Usage: python3 scripts/build.py <extracted quran-svg-hafs-kfgqpc dir> <public dir>"""
import json, os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
J = lambda p: json.load(open(os.path.join(src, p), encoding="utf8"))
def W(p, o):
    f = os.path.join(dst, p); os.makedirs(os.path.dirname(f), exist_ok=True)
    json.dump(o, open(f, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
pages = J("index/pages.json")["pages"]; surahs = J("index/surahs.json")["surahs"]; dv = J("index/divisions.json")
def div_at(lst, key, page):
    v = None
    for r in lst:
        if r["page"] <= page: v = r[key]
    return v
place = {"makkah": "مكية", "madinah": "مدنية"}
meta = {"first": 1, "last": len(pages), "pages": [], "surahs": {}}
page_info, surah_info, search = {}, {}, []
os.makedirs(os.path.join(dst, "pages"), exist_ok=True)
for p in pages:
    n = p["page"]
    shutil.copy(os.path.join(src, f"pages/{n:03d}.svg"), os.path.join(dst, f"pages/{n:03d}.svg"))
    juz = div_at(dv["juz"], "juz", n); hizb = div_at(dv["hizb"], "hizb", n)
    meta["pages"].append({"page": n, "surahs": p["surahs"], "first": p["first_ayah"], "last": p["last_ayah"], "juz": juz, "hizb": hizb})
    forms, ay = {}, {}
    for x in J(f"index/by-page/{n:03d}.json")["words"]:
        forms[x["word_key"]] = {"إملائي": x["rasm_imlai"], "مجرّد من الضبط": x["rasm"], "صيغة البحث": x["search"], "السطر": x["line"]}
        ay.setdefault(x["ayah_key"], []).append(x)
    text = {}
    for k, ws in ay.items():
        ws.sort(key=lambda x: int(x["word_key"].split(":")[2]))
        text[k] = {"النص": " ".join(x["rasm_imlai"] for x in ws), "عدد الكلمات": len(ws), "الصفحة": n}
        su, ay_no = map(int, k.split(":"))
        search.append([su, ay_no, n, [x["rasm_imlai"] for x in ws]])   # one imla'i spelling per printed word, in order
    W(f"content/word-forms/{n:03d}.json", forms); W(f"content/ayah-text/{n:03d}.json", text)
    page_info[str(n)] = {"الجزء": juz, "الحزب": hizb, "من الآية": p["first_ayah"], "إلى الآية": p["last_ayah"], "عدد الآيات": p["ayahs"], "عدد الكلمات": p["words"], "عدد الأسطر": p["lines"]}
for s in surahs:
    meta["surahs"][str(s["number"])] = {"name": s["name_arabic"], "ayahs": s["ayah_count"]}
    surah_info[str(s["number"])] = {"الاسم": s["name_arabic"], "النزول": place.get(s["revelation_place"], s["revelation_place"]), "ترتيب النزول": s["revelation_order"], "عدد الآيات": s["ayah_count"], "الصفحات": f"{s['pages'][0]} – {s['pages'][1]}"}
search.sort(key=lambda r: (r[0], r[1]))
W("data/search.json", search)
W("data/meta.json", meta); W("content/page-info.json", page_info); W("content/surah-info.json", surah_info)
print("pages:", len(pages))
