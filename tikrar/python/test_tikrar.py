"""Runs the shared vectors (../tests/vectors.txt) against this implementation.  python3 test_tikrar.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tikrar as T

fails = cases = checks = 0
c = {}
def check(what, got, want):
    global fails, checks
    checks += 1
    if got != want: fails += 1; print(f'FAIL {c["name"]} {what}\n  got  {got}\n  want {want}')

def num(v):
    try: return float(v) if "." in v else int(v)
    except ValueError: return None

for raw in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "vectors.txt"), encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#"): continue
    key, _, val = line.partition(" ")
    if key == "CASE": c = {"name": val}; cases += 1
    elif key == "UNITS": c["units"] = [] if val == "-" else [{"id": str(i), "start": int(u.split("-")[0]), "end": int(u.split("-")[1])} for i, u in enumerate(val.split(","))]
    elif key == "OPT":
        o = {}
        if val != "-":
            for kv in val.split(" "):
                k, v = kv.split("=")
                if k in ("link", "mode"): o[k] = v
                elif k == "gap" and v == "manual": o[k] = "manual"
                elif num(v) is not None: o[k] = num(v)
        c["opt"] = o; c["steps"] = T.plan(c["units"], o)
    elif key == "PLAN": check("plan", T.plan_text(c["steps"]) or "-", val)
    elif key == "TOTAL": check("total", str(T.total_ms(c["steps"], c["opt"])), val)
    elif key == "REMAIN":
        if val != "-":
            for r in val.split(","):
                at, ms = r.split("="); i, n = at.split("/")
                check("remaining " + at, str(T.remaining_ms(c["steps"], c["opt"], int(i), int(n))), ms)
    elif key == "EVENTS": c["events"] = val.split(",")
    elif key == "ACTIONS":
        s = T.Session(c["units"], c["opt"]); got = []
        for e in c["events"]:
            a = s.start() if e == "start" else s.ended() if e == "ended" else s.resume() if e == "resume" else s.next() if e == "next" else s.previous() if e == "previous" else s.restart() if e == "restart" else s.go_to(int(e[5:]))
            got.append(T.action_text(a))
        check("actions", "|".join(got), val)
    elif key == "LOCATE":
        if val != "-":
            for r in val.split(","):
                ms, _, idx = r.partition("=")
                check("locate " + ms, str(T.locate(c["units"], int(ms))), idx)

print(f"python: {cases} cases, {checks} checks, {fails} failed")
sys.exit(1 if fails else 0)
