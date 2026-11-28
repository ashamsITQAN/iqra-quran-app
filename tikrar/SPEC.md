# Tikrar — specification, version 1

*التكرار الدائري المتقاطع — circular cross repetition.* The method is by Ahmad Shams
([community.itqan.dev/d/432](https://community.itqan.dev/d/432)). This document is the single definition of the component;
every implementation in this folder follows it and passes the same test vectors (section 7). To port it to another
language, implement sections 2–6 and run the vectors.

The component has no user interface, plays no audio and holds no clock. It answers two questions:

1. **The plan** — given the units to memorise and the learner's settings: which passages are heard, in what order, how many times.
2. **The session** — given what just happened (a passage finished playing, a pause ended, the learner pressed "next"): what the player does now.

## 1. Idea

The learner does not memorise ayahs apart and join them at the end. Each new unit is heard alone (**talqin**, تلقين), then at
once joined to what came before (**wasl**, وصل), and at the end the whole passage is recited (**sard**, سرد). With three
units and cumulative joining:

```
unit 1 alone ×T
unit 2 alone ×T, then units 1–2 ×W
unit 3 alone ×T, then units 1–3 ×W
units 1–3 ×S
```

## 2. Input

**Units** — an ordered list. A unit is a stretch of one audio recording, `{ id?, start, end }`, times in whole
milliseconds from the start of the recording, `start < end`. Units are in recitation order; silence between two units is
allowed. What a unit *is* belongs to the app, so any level of timing works:

| The recitation is timed by | A unit can be |
| --- | --- |
| ayah | one ayah, or N consecutive ayahs (`groupUnits`) |
| phrase (جملة: a breath group inside a long ayah) | one phrase, so that a long ayah is memorised phrase by phrase |
| word | a run of consecutive words; and the word, phrase and ayah being recited can be coloured with `locate` (section 6) |

**Options**

| Field | Values | Default | Meaning |
| --- | --- | --- | --- |
| `talqin` | integer ≥ 0 | 5 | hearings of each new unit alone |
| `wasl` | integer ≥ 0 | 5 | hearings of the joining step |
| `sard` | integer ≥ 0 | 3 | hearings of the whole passage at the end |
| `link` | `cumulative`, `previous` | `cumulative` | join from the first unit, or to the unit before only |
| `mode` | `repeat`, `listen` | `repeat` | the learner recites after each hearing, or only listens |
| `gap` | number ≥ 0, or `manual` | 1 | the pause after a hearing as a multiple of its heard length; `manual` = until the learner asks to go on |
| `speed` | number > 0 | 1 | playback rate |

Normalisation: a negative count becomes 0; a count with a fraction is rounded down; an unknown `link` or `mode`, a negative
or non-finite `gap`, a non-positive or non-finite `speed`, and (in untyped languages) a value that is not a number, fall
back to the default. In typed implementations `gap = manual` is the separate flag `manualGap`.

## 3. The plan

```
steps = []
for i in 0 .. units.length-1:
    if talqin > 0:           steps += step(talqin, i, i, talqin)
    if i > 0 and wasl > 0:   steps += step(wasl, link == cumulative ? 0 : i-1, i, wasl)
if units.length > 1 and sard > 0:
                             steps += step(sard, 0, units.length-1, sard)

step(kind, from, to, reps) = { kind, from, to, reps, start: units[from].start, end: units[to].end }
```

`from` and `to` are unit indexes, both included. A step is played as one continuous stretch from `start` to `end`. One
unit with `talqin = 0`, or no units, gives an empty plan.

## 4. Durations

```
half(x)       = floor(x + 0.5)
heardMs(step) = half((step.end - step.start) / speed)
gapMs(step)   = 0                              if mode != repeat or gap is manual
              = half(heardMs(step) * gap)      otherwise
remainingMs(steps, i, done) = sum over steps j >= i of (reps_j - (j == i ? done : 0)) * (heardMs_j + gapMs_j)
totalMs(steps) = remainingMs(steps, 0, 0)
```

With a manual gap the learner's own time is not counted.

## 5. The session

State: `step` (index into the plan), `rep` (repetitions of it already finished), `phase` ∈ `idle`, `playing`, `gap`,
`waiting`, `done`, and the current `action`. The session never waits by itself: the app carries out the action and reports.

**Actions**

| Action | The app does | Then reports |
| --- | --- | --- |
| `play { step, rep, start, end, rate }` | plays the recording from `start` to `end` at `rate` | `ended()` |
| `wait { ms, step, rep }` | leaves the learner `ms` to recite | `resume()` |
| `await { step, rep }` | waits until the learner asks to go on | `resume()` |
| `done` | ends the session | — |

**Reports and controls**

```
play():      if step >= steps.length: phase = done; action = done
             else: phase = playing; action = play{step, rep, steps[step].start, steps[step].end, speed}
advance():   rep += 1; if rep >= steps[step].reps: step += 1, rep = 0;  play()

start():     step = 0; rep = 0; play()
ended():     if phase != playing: return action unchanged
             if mode != repeat: advance()
             else if gap is manual: phase = waiting; action = await{step, rep}
             else if gapMs(steps[step]) <= 0: advance()
             else: phase = gap; action = wait{gapMs, step, rep}
resume():    if phase is gap or waiting: advance()   else return action unchanged
goTo(i):     if the plan is empty or phase is idle or done: return action unchanged
             step = clamp(i, 0, steps.length-1); rep = 0; play()
next() = goTo(step+1);  previous() = goTo(step-1);  restart() = goTo(step)
```

Notes. The pause follows every hearing, the last one too. `resume()` during a timed pause cuts it short. A report that
does not fit the phase changes nothing, so a late or doubled callback from an audio player is harmless. Before `start()`
the action is none. `next()` on the last step restarts that step. Pausing and resuming the audio is the app's own matter
and does not involve the session.

## 6. Helpers

- `groupUnits(ayahs, size)` — units of `size` consecutive ayahs; the last may be shorter. A unit's id is the first ayah's
  id, or `first-last` when it spans several.
- `locate(segments, ms)` — the index of the segment with `start <= ms < end`, or −1; segments are in order (binary search).
  Called on the ayah list, the phrase list and the word list of a recording, it tells what to colour at a moment of playback.

## 7. Test vectors

`tests/vectors.txt` (and the same data as `tests/vectors.json`). Blocks of lines, each `KEY value`:

```
CASE name
UNITS start-end,start-end,…        or -
OPT key=value key=value …          or - for the defaults; a value that is not a number is ignored, counts are rounded down
PLAN kind:from-toxreps@start-end;…  or - for an empty plan
TOTAL ms
REMAIN step/rep=ms,…               or -
EVENTS start,ended,resume,next,previous,restart,goto:N,…
ACTIONS one per event, joined by |   play:step/rep@start-end   wait:ms   await   done   none
LOCATE ms=index,…                   over the UNITS, or -
END
```

An implementation conforms when every line of every case is reproduced exactly.

## 8. Versions

The number is `major.minor.patch`. A change in the plan, the durations or the session for the same input is a new major
version and a new vectors file.
