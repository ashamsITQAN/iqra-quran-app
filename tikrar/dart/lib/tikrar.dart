/// Tikrar — التكرار الدائري المتقاطع (circular cross repetition). Specification: ../../SPEC.md
/// The method: Ahmad Shams, https://community.itqan.dev/d/432
///
/// No dependencies, no audio, no timers. [plan] says what is heard, in what order and how many times; [Session] says
/// what the player must do next. Times are whole milliseconds. Works in Flutter and in plain Dart.
library tikrar;

const String version = '1.0.0';

/// A stretch of the recitation to memorise: an ayah, several ayahs, a phrase, or a run of words.
class Unit {
  final String id;
  final int start, end;
  const Unit(this.start, this.end, {this.id = ''});
}

class Options {
  /// Hearings of each new unit alone, of its joining to what came before, and of the whole passage.
  final int talqin, wasl, sard;

  /// 'cumulative' (join from the first unit) or 'previous' (join to the unit before only).
  final String link;

  /// 'repeat' (the learner recites after each hearing) or 'listen'.
  final String mode;

  /// The pause after a hearing, as a multiple of its length; ignored when [manualGap].
  final double gap;

  /// The pause lasts until the learner asks to go on.
  final bool manualGap;
  final double speed;
  const Options({this.talqin = 5, this.wasl = 5, this.sard = 3, this.link = 'cumulative', this.mode = 'repeat', this.gap = 1, this.manualGap = false, this.speed = 1});

  /// Every field within its bounds.
  Options normalized() => Options(
      talqin: talqin < 0 ? 0 : talqin,
      wasl: wasl < 0 ? 0 : wasl,
      sard: sard < 0 ? 0 : sard,
      link: link == 'previous' ? 'previous' : 'cumulative',
      mode: mode == 'listen' ? 'listen' : 'repeat',
      gap: gap.isFinite && gap >= 0 ? gap : 1,
      manualGap: manualGap,
      speed: speed.isFinite && speed > 0 ? speed : 1);
}

class Step {
  /// 'talqin', 'wasl' or 'sard'.
  final String kind;

  /// Unit indexes, both included.
  final int from, to;
  final int reps, start, end;
  const Step(this.kind, this.from, this.to, this.reps, this.start, this.end);
}

/// What the player must do next. [type]: 'play' (from [start] to [end] at [rate], then call ended()), 'wait' ([ms] for
/// the learner, then resume()), 'await' (until the learner asks, then resume()), 'done'.
class Action {
  final String type;
  final int step, rep, start, end, ms;
  final double rate;
  const Action(this.type, {this.step = 0, this.rep = 0, this.start = 0, this.end = 0, this.ms = 0, this.rate = 1});
}

int _half(double x) => (x + 0.5).floor();

/// Units of [size] consecutive ayahs (the last may be shorter) from per-ayah timings.
List<Unit> groupUnits(List<Unit> ayahs, [int size = 1]) {
  final n = size < 1 ? 1 : size, units = <Unit>[];
  for (var i = 0; i < ayahs.length; i += n) {
    final a = ayahs[i], b = ayahs[(i + n < ayahs.length ? i + n : ayahs.length) - 1];
    units.add(Unit(a.start, b.end, id: a.id.isEmpty ? '$i' : (identical(a, b) || b.id.isEmpty ? a.id : '${a.id}-${b.id}')));
  }
  return units;
}

List<Step> plan(List<Unit> units, [Options options = const Options()]) {
  final o = options.normalized(), steps = <Step>[];
  Step step(String kind, int from, int to, int reps) => Step(kind, from, to, reps, units[from].start, units[to].end);
  for (var i = 0; i < units.length; i++) {
    if (o.talqin > 0) steps.add(step('talqin', i, i, o.talqin));
    if (i > 0 && o.wasl > 0) steps.add(step('wasl', o.link == 'cumulative' ? 0 : i - 1, i, o.wasl));
  }
  if (units.length > 1 && o.sard > 0) steps.add(step('sard', 0, units.length - 1, o.sard));
  return steps;
}

int heardMs(Step step, [Options options = const Options()]) => _half((step.end - step.start) / options.normalized().speed);

int gapMs(Step step, [Options options = const Options()]) {
  final o = options.normalized();
  return o.mode != 'repeat' || o.manualGap ? 0 : _half(heardMs(step, o) * o.gap);
}

int remainingMs(List<Step> steps, [Options options = const Options(), int stepIndex = 0, int repsDone = 0]) {
  var ms = 0;
  for (var i = stepIndex < 0 ? 0 : stepIndex; i < steps.length; i++) {
    ms += (steps[i].reps - (i == stepIndex ? repsDone : 0)) * (heardMs(steps[i], options) + gapMs(steps[i], options));
  }
  return ms;
}

int totalMs(List<Step> steps, [Options options = const Options()]) => remainingMs(steps, options, 0, 0);

/// The index of the segment (ayah, phrase or word) being recited at [ms], or -1. Segments are in order.
int locate(List<Unit> segments, int ms) {
  var lo = 0, hi = segments.length - 1, at = -1;
  while (lo <= hi) {
    final mid = (lo + hi) >> 1;
    if (segments[mid].start <= ms) {
      at = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return at >= 0 && ms < segments[at].end ? at : -1;
}

/// A session over a plan. It holds no clock: the app plays what it is told and reports back.
class Session {
  final Options options;
  final List<Step> steps;
  int step = 0, rep = 0;

  /// 'idle', 'playing', 'gap', 'waiting' or 'done'.
  String phase = 'idle';
  Action? action;
  Session(List<Unit> units, [Options options = const Options()])
      : options = options.normalized(),
        steps = plan(units, options);

  int get remaining => phase == 'done' ? 0 : remainingMs(steps, options, step, rep);
  int get total => totalMs(steps, options);

  Action _play() {
    if (step >= steps.length) {
      phase = 'done';
      return action = const Action('done');
    }
    final s = steps[step];
    phase = 'playing';
    return action = Action('play', step: step, rep: rep, start: s.start, end: s.end, rate: options.speed);
  }

  Action _advance() {
    rep += 1;
    if (rep >= steps[step].reps) {
      step += 1;
      rep = 0;
    }
    return _play();
  }

  Action start() {
    step = 0;
    rep = 0;
    return _play();
  }

  Action? ended() {
    if (phase != 'playing') return action;
    if (options.mode != 'repeat') return _advance();
    if (options.manualGap) {
      phase = 'waiting';
      return action = Action('await', step: step, rep: rep);
    }
    final ms = gapMs(steps[step], options);
    if (ms <= 0) return _advance();
    phase = 'gap';
    return action = Action('wait', ms: ms, step: step, rep: rep);
  }

  Action? resume() => phase == 'gap' || phase == 'waiting' ? _advance() : action;

  Action? goTo(int stepIndex) {
    if (steps.isEmpty || phase == 'idle' || phase == 'done') return action;
    step = stepIndex < 0 ? 0 : (stepIndex > steps.length - 1 ? steps.length - 1 : stepIndex);
    rep = 0;
    return _play();
  }

  Action? next() => goTo(step + 1);
  Action? previous() => goTo(step - 1);
  Action? restart() => goTo(step);
}

String planText(List<Step> steps) => steps.map((s) => '${s.kind}:${s.from}-${s.to}x${s.reps}@${s.start}-${s.end}').join(';');

String actionText(Action? a) => a == null
    ? 'none'
    : a.type == 'play'
        ? 'play:${a.step}/${a.rep}@${a.start}-${a.end}'
        : a.type == 'wait'
            ? 'wait:${a.ms}'
            : a.type;
