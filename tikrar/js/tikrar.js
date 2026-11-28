/*!
 * Tikrar — التكرار الدائري المتقاطع (circular cross repetition), reference implementation. Specification: ../SPEC.md
 * The method: Ahmad Shams, https://community.itqan.dev/d/432
 *
 * No dependencies, no audio, no timers, no user interface. It answers two questions for a memorisation session:
 *   plan(units, options)      which passages are heard, in what order and how many times;
 *   new Session(units, options)   what the player must do next (play a passage, wait, wait for the learner, stop).
 */
export const VERSION = "1.0.0";
export const DEFAULTS = Object.freeze({ talqin: 5, wasl: 5, sard: 3, link: "cumulative", mode: "repeat", gap: 1, speed: 1 });

const count = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.max(0, Math.floor(+v)) : d);
const half = (x) => Math.floor(x + 0.5);   // rounding to the nearest millisecond, halves upward, the same in every implementation

/** Options with every field present and within its bounds. */
export function normalize(options = {}) {
  const o = options || {};
  const speed = Number.isFinite(+o.speed) && +o.speed > 0 ? +o.speed : DEFAULTS.speed;
  const gap = o.gap === "manual" ? "manual" : Number.isFinite(+o.gap) && o.gap !== null && o.gap !== "" && +o.gap >= 0 ? +o.gap : DEFAULTS.gap;
  return {
    talqin: count(o.talqin, DEFAULTS.talqin), wasl: count(o.wasl, DEFAULTS.wasl), sard: count(o.sard, DEFAULTS.sard),
    link: o.link === "previous" ? "previous" : "cumulative", mode: o.mode === "listen" ? "listen" : "repeat", gap, speed,
  };
}

/** Units of `size` consecutive ayahs (the last may be shorter) from per-ayah timings [{id?, start, end}]. */
export function groupUnits(ayahs, size = 1) {
  const n = Math.max(1, Math.floor(+size) || 1), units = [];
  for (let i = 0; i < ayahs.length; i += n) {
    const a = ayahs[i], b = ayahs[Math.min(ayahs.length, i + n) - 1];
    units.push({ id: a.id === undefined ? String(i) : b === a || b.id === undefined ? String(a.id) : `${a.id}-${b.id}`, start: a.start, end: b.end });
  }
  return units;
}

/** The plan: steps in order. Each: {kind: "talqin"|"wasl"|"sard", from, to, reps, start, end}; from and to are unit indexes. */
export function plan(units, options) {
  const o = normalize(options), steps = [];
  const step = (kind, from, to, reps) => ({ kind, from, to, reps, start: units[from].start, end: units[to].end });
  for (let i = 0; i < units.length; i++) {
    if (o.talqin > 0) steps.push(step("talqin", i, i, o.talqin));                                    // the new unit alone
    if (i > 0 && o.wasl > 0) steps.push(step("wasl", o.link === "cumulative" ? 0 : i - 1, i, o.wasl));   // joined to what came before
  }
  if (units.length > 1 && o.sard > 0) steps.push(step("sard", 0, units.length - 1, o.sard));           // the whole passage
  return steps;
}

/** How long one hearing of a step lasts at the chosen speed, and the pause for the learner after it (0 when none or manual). */
export function heardMs(step, options) { return half((step.end - step.start) / normalize(options).speed); }
export function gapMs(step, options) { const o = normalize(options); return o.mode !== "repeat" || o.gap === "manual" ? 0 : half(heardMs(step, o) * o.gap); }

/** Time left from a point of the plan (step index, repetitions of it already done). From the start it is the whole session. */
export function remainingMs(steps, options, stepIndex = 0, repsDone = 0) {
  let ms = 0;
  steps.forEach((s, i) => { if (i >= stepIndex) ms += (s.reps - (i === stepIndex ? repsDone : 0)) * (heardMs(s, options) + gapMs(s, options)); });
  return ms;
}
export function totalMs(steps, options) { return remainingMs(steps, options, 0, 0); }

/**
 * A session over a plan. It holds no clock: the app plays what it is told and reports back.
 *   start() -> action;  ended() when the passage has been played;  resume() when the pause is over or the learner says go on;
 *   next(), previous(), restart(), goTo(stepIndex) -> action.
 * An action is one of
 *   {type:"play", step, rep, start, end, rate}   play the audio from start to end (ms) at rate; then call ended()
 *   {type:"wait", ms, step, rep}                 leave the learner ms to recite; then call resume()
 *   {type:"await", step, rep}                    wait until the learner asks to go on; then call resume()
 *   {type:"done"}                                the session is over
 * A report that does not fit the moment (ended() during a pause, say) changes nothing and returns the current action again.
 */
export class Session {
  constructor(units, options) { this.options = normalize(options); this.steps = plan(units, this.options); this.step = 0; this.rep = 0; this.phase = "idle"; this.action = null; }
  get progress() { return { step: this.step, steps: this.steps.length, rep: this.rep, reps: this.steps[this.step] ? this.steps[this.step].reps : 0, phase: this.phase, remainingMs: this.phase === "done" ? 0 : remainingMs(this.steps, this.options, this.step, this.rep), totalMs: totalMs(this.steps, this.options) }; }
  _play() {
    if (this.step >= this.steps.length) { this.phase = "done"; return (this.action = { type: "done" }); }
    const s = this.steps[this.step]; this.phase = "playing";
    return (this.action = { type: "play", step: this.step, rep: this.rep, start: s.start, end: s.end, rate: this.options.speed });
  }
  _advance() { this.rep += 1; if (this.rep >= this.steps[this.step].reps) { this.step += 1; this.rep = 0; } return this._play(); }
  start() { this.step = 0; this.rep = 0; return this._play(); }
  ended() {
    if (this.phase !== "playing") return this.action;
    const o = this.options, s = this.steps[this.step];
    if (o.mode !== "repeat") return this._advance();
    if (o.gap === "manual") { this.phase = "waiting"; return (this.action = { type: "await", step: this.step, rep: this.rep }); }
    const ms = gapMs(s, o);
    if (ms <= 0) return this._advance();
    this.phase = "gap"; return (this.action = { type: "wait", ms, step: this.step, rep: this.rep });
  }
  resume() { return this.phase === "gap" || this.phase === "waiting" ? this._advance() : this.action; }
  goTo(stepIndex) {
    if (!this.steps.length || this.phase === "idle" || this.phase === "done") return this.action;
    this.step = Math.max(0, Math.min(this.steps.length - 1, Math.floor(+stepIndex) || 0)); this.rep = 0; return this._play();
  }
  next() { return this.goTo(this.step + 1); }
  previous() { return this.goTo(this.step - 1); }
  restart() { return this.goTo(this.step); }
}

/**
 * Which segment is being recited at a moment of the audio: the index of the segment with start <= ms < end, or -1.
 * Segments are in order and may be ayahs, phrases or words; call it once per level to colour the ayah, the phrase and the word.
 */
export function locate(segments, ms) {
  let lo = 0, hi = segments.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (segments[mid].start <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at >= 0 && ms < segments[at].end ? at : -1;
}

/* The one-line forms used by the shared test vectors (../tests/vectors.txt). */
export const planText = (steps) => steps.map((s) => `${s.kind}:${s.from}-${s.to}x${s.reps}@${s.start}-${s.end}`).join(";");
export const actionText = (a) => (!a ? "none" : a.type === "play" ? `play:${a.step}/${a.rep}@${a.start}-${a.end}` : a.type === "wait" ? `wait:${a.ms}` : a.type);
