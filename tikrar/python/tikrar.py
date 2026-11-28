"""Tikrar — التكرار الدائري المتقاطع (circular cross repetition). Specification: ../SPEC.md
The method: Ahmad Shams, https://community.itqan.dev/d/432

No dependencies, no audio, no timers. plan() says what is heard, in what order and how many times; Session says what the
player must do next. Times are whole milliseconds."""
import math

VERSION = "1.0.0"
DEFAULTS = {"talqin": 5, "wasl": 5, "sard": 3, "link": "cumulative", "mode": "repeat", "gap": 1, "speed": 1}


def _half(x):
    return math.floor(x + 0.5)


def _number(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf")):
        return None
    return v


def normalize(options=None):
    o = options or {}
    def count(k):
        v = _number(o.get(k))
        return DEFAULTS[k] if v is None else max(0, math.floor(v))
    speed = _number(o.get("speed"))
    gap = o.get("gap")
    if gap != "manual":
        g = _number(gap)
        gap = g if g is not None and g >= 0 else DEFAULTS["gap"]
    return {"talqin": count("talqin"), "wasl": count("wasl"), "sard": count("sard"),
            "link": "previous" if o.get("link") == "previous" else "cumulative",
            "mode": "listen" if o.get("mode") == "listen" else "repeat",
            "gap": gap, "speed": speed if speed is not None and speed > 0 else DEFAULTS["speed"]}


def group_units(ayahs, size=1):
    n = max(1, int(size or 1)); units = []
    for i in range(0, len(ayahs), n):
        a, b = ayahs[i], ayahs[min(len(ayahs), i + n) - 1]
        if "id" not in a: uid = str(i)
        elif b is a or "id" not in b: uid = str(a["id"])
        else: uid = f'{a["id"]}-{b["id"]}'
        units.append({"id": uid, "start": a["start"], "end": b["end"]})
    return units


def plan(units, options=None):
    o = normalize(options); steps = []
    def step(kind, f, t, reps):
        return {"kind": kind, "from": f, "to": t, "reps": reps, "start": units[f]["start"], "end": units[t]["end"]}
    for i in range(len(units)):
        if o["talqin"] > 0: steps.append(step("talqin", i, i, o["talqin"]))
        if i > 0 and o["wasl"] > 0: steps.append(step("wasl", 0 if o["link"] == "cumulative" else i - 1, i, o["wasl"]))
    if len(units) > 1 and o["sard"] > 0: steps.append(step("sard", 0, len(units) - 1, o["sard"]))
    return steps


def heard_ms(step, options=None):
    return _half((step["end"] - step["start"]) / normalize(options)["speed"])


def gap_ms(step, options=None):
    o = normalize(options)
    return 0 if o["mode"] != "repeat" or o["gap"] == "manual" else _half(heard_ms(step, o) * o["gap"])


def remaining_ms(steps, options=None, step_index=0, reps_done=0):
    return sum((s["reps"] - (reps_done if i == step_index else 0)) * (heard_ms(s, options) + gap_ms(s, options))
               for i, s in enumerate(steps) if i >= step_index)


def total_ms(steps, options=None):
    return remaining_ms(steps, options, 0, 0)


def locate(segments, ms):
    lo, hi, at = 0, len(segments) - 1, -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if segments[mid]["start"] <= ms: at = mid; lo = mid + 1
        else: hi = mid - 1
    return at if at >= 0 and ms < segments[at]["end"] else -1


class Session:
    """start() -> action; ended() after a passage is played; resume() after the pause or when the learner says go on;
    next(), previous(), restart(), go_to(i) -> action. Actions are dicts: {"type": "play"|"wait"|"await"|"done", ...}."""

    def __init__(self, units, options=None):
        self.options = normalize(options); self.steps = plan(units, self.options)
        self.step = 0; self.rep = 0; self.phase = "idle"; self.action = None

    @property
    def progress(self):
        return {"step": self.step, "steps": len(self.steps), "rep": self.rep,
                "reps": self.steps[self.step]["reps"] if self.step < len(self.steps) else 0, "phase": self.phase,
                "remainingMs": 0 if self.phase == "done" else remaining_ms(self.steps, self.options, self.step, self.rep),
                "totalMs": total_ms(self.steps, self.options)}

    def _play(self):
        if self.step >= len(self.steps):
            self.phase = "done"; self.action = {"type": "done"}; return self.action
        s = self.steps[self.step]; self.phase = "playing"
        self.action = {"type": "play", "step": self.step, "rep": self.rep, "start": s["start"], "end": s["end"], "rate": self.options["speed"]}
        return self.action

    def _advance(self):
        self.rep += 1
        if self.rep >= self.steps[self.step]["reps"]: self.step += 1; self.rep = 0
        return self._play()

    def start(self):
        self.step = 0; self.rep = 0; return self._play()

    def ended(self):
        if self.phase != "playing": return self.action
        o = self.options
        if o["mode"] != "repeat": return self._advance()
        if o["gap"] == "manual":
            self.phase = "waiting"; self.action = {"type": "await", "step": self.step, "rep": self.rep}; return self.action
        ms = gap_ms(self.steps[self.step], o)
        if ms <= 0: return self._advance()
        self.phase = "gap"; self.action = {"type": "wait", "ms": ms, "step": self.step, "rep": self.rep}; return self.action

    def resume(self):
        return self._advance() if self.phase in ("gap", "waiting") else self.action

    def go_to(self, step_index):
        if not self.steps or self.phase in ("idle", "done"): return self.action
        self.step = max(0, min(len(self.steps) - 1, int(step_index))); self.rep = 0; return self._play()

    def next(self): return self.go_to(self.step + 1)
    def previous(self): return self.go_to(self.step - 1)
    def restart(self): return self.go_to(self.step)


def plan_text(steps):
    return ";".join(f'{s["kind"]}:{s["from"]}-{s["to"]}x{s["reps"]}@{s["start"]}-{s["end"]}' for s in steps)


def action_text(a):
    if not a: return "none"
    if a["type"] == "play": return f'play:{a["step"]}/{a["rep"]}@{a["start"]}-{a["end"]}'
    if a["type"] == "wait": return f'wait:{a["ms"]}'
    return a["type"]
