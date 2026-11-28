// Tikrar — التكرار الدائري المتقاطع (circular cross repetition). Specification: ../../../SPEC.md
// The method: Ahmad Shams, https://community.itqan.dev/d/432
//
// Plain Swift, no dependencies, no audio, no timers: usable on iOS, macOS, watchOS, tvOS and Linux.
// Tikrar.plan says what is heard, in what order and how many times; TikrarSession says what the player must do next.
// Times are whole milliseconds.

/// A stretch of the recitation to memorise: an ayah, several ayahs, a phrase, or a run of words.
public struct TikrarUnit {
    public let start: Int, end: Int
    public let id: String
    public init(start: Int, end: Int, id: String = "") { self.start = start; self.end = end; self.id = id }
}

public struct TikrarOptions {
    /// Hearings of each new unit alone, of its joining to what came before, and of the whole passage.
    public var talqin: Int, wasl: Int, sard: Int
    /// "cumulative" (join from the first unit) or "previous" (join to the unit before only).
    public var link: String
    /// "repeat" (the learner recites after each hearing) or "listen".
    public var mode: String
    /// The pause after a hearing, as a multiple of its length; ignored when manualGap.
    public var gap: Double
    /// The pause lasts until the learner asks to go on.
    public var manualGap: Bool
    public var speed: Double

    public init(talqin: Int = 5, wasl: Int = 5, sard: Int = 3, link: String = "cumulative", mode: String = "repeat", gap: Double = 1, manualGap: Bool = false, speed: Double = 1) {
        self.talqin = talqin; self.wasl = wasl; self.sard = sard; self.link = link; self.mode = mode; self.gap = gap; self.manualGap = manualGap; self.speed = speed
    }

    /// Every field within its bounds.
    public func normalized() -> TikrarOptions {
        return TikrarOptions(
            talqin: max(0, talqin), wasl: max(0, wasl), sard: max(0, sard),
            link: link == "previous" ? "previous" : "cumulative", mode: mode == "listen" ? "listen" : "repeat",
            gap: gap.isFinite && gap >= 0 ? gap : 1, manualGap: manualGap, speed: speed.isFinite && speed > 0 ? speed : 1)
    }
}

/// kind: "talqin", "wasl" or "sard"; from and to are unit indexes, both included.
public struct TikrarStep {
    public let kind: String
    public let from: Int, to: Int, reps: Int, start: Int, end: Int
}

/// What the player must do next.
public enum TikrarAction: Equatable {
    /// Play the audio from start to end at rate, then call ended().
    case play(step: Int, rep: Int, start: Int, end: Int, rate: Double)
    /// Leave the learner ms to recite, then call resume().
    case wait(ms: Int, step: Int, rep: Int)
    /// Wait until the learner asks to go on, then call resume().
    case awaitLearner(step: Int, rep: Int)
    case done
}

public enum Tikrar {
    public static let version = "1.0.0"

    static func half(_ x: Double) -> Int { return Int((x + 0.5).rounded(.down)) }

    /// Units of size consecutive ayahs (the last may be shorter) from per-ayah timings.
    public static func groupUnits(_ ayahs: [TikrarUnit], size: Int = 1) -> [TikrarUnit] {
        let n = max(1, size)
        var units: [TikrarUnit] = []
        var i = 0
        while i < ayahs.count {
            let last = min(ayahs.count, i + n) - 1
            let a = ayahs[i], b = ayahs[last]
            let id = a.id.isEmpty ? String(i) : (last == i || b.id.isEmpty ? a.id : "\(a.id)-\(b.id)")
            units.append(TikrarUnit(start: a.start, end: b.end, id: id))
            i += n
        }
        return units
    }

    public static func plan(_ units: [TikrarUnit], _ options: TikrarOptions = TikrarOptions()) -> [TikrarStep] {
        let o = options.normalized()
        var steps: [TikrarStep] = []
        func step(_ kind: String, _ from: Int, _ to: Int, _ reps: Int) -> TikrarStep {
            return TikrarStep(kind: kind, from: from, to: to, reps: reps, start: units[from].start, end: units[to].end)
        }
        for i in 0..<units.count {
            if o.talqin > 0 { steps.append(step("talqin", i, i, o.talqin)) }
            if i > 0 && o.wasl > 0 { steps.append(step("wasl", o.link == "cumulative" ? 0 : i - 1, i, o.wasl)) }
        }
        if units.count > 1 && o.sard > 0 { steps.append(step("sard", 0, units.count - 1, o.sard)) }
        return steps
    }

    public static func heardMs(_ step: TikrarStep, _ options: TikrarOptions = TikrarOptions()) -> Int {
        return half(Double(step.end - step.start) / options.normalized().speed)
    }

    public static func gapMs(_ step: TikrarStep, _ options: TikrarOptions = TikrarOptions()) -> Int {
        let o = options.normalized()
        return o.mode != "repeat" || o.manualGap ? 0 : half(Double(heardMs(step, o)) * o.gap)
    }

    public static func remainingMs(_ steps: [TikrarStep], _ options: TikrarOptions = TikrarOptions(), stepIndex: Int = 0, repsDone: Int = 0) -> Int {
        var ms = 0
        var i = max(0, stepIndex)
        while i < steps.count {
            ms += (steps[i].reps - (i == stepIndex ? repsDone : 0)) * (heardMs(steps[i], options) + gapMs(steps[i], options))
            i += 1
        }
        return ms
    }

    public static func totalMs(_ steps: [TikrarStep], _ options: TikrarOptions = TikrarOptions()) -> Int {
        return remainingMs(steps, options, stepIndex: 0, repsDone: 0)
    }

    /// The index of the segment (ayah, phrase or word) being recited at ms, or -1. Segments are in order.
    public static func locate(_ segments: [TikrarUnit], _ ms: Int) -> Int {
        var lo = 0, hi = segments.count - 1, at = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if segments[mid].start <= ms { at = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        return at >= 0 && ms < segments[at].end ? at : -1
    }

    public static func planText(_ steps: [TikrarStep]) -> String {
        return steps.map { "\($0.kind):\($0.from)-\($0.to)x\($0.reps)@\($0.start)-\($0.end)" }.joined(separator: ";")
    }

    public static func actionText(_ a: TikrarAction?) -> String {
        guard let a = a else { return "none" }
        switch a {
        case let .play(step, rep, start, end, _): return "play:\(step)/\(rep)@\(start)-\(end)"
        case let .wait(ms, _, _): return "wait:\(ms)"
        case .awaitLearner: return "await"
        case .done: return "done"
        }
    }
}

/// A session over a plan. It holds no clock: the app plays what it is told and reports back.
public final class TikrarSession {
    public let options: TikrarOptions
    public let steps: [TikrarStep]
    public private(set) var step = 0
    public private(set) var rep = 0
    /// "idle", "playing", "gap", "waiting" or "done".
    public private(set) var phase = "idle"
    public private(set) var action: TikrarAction?

    public init(_ units: [TikrarUnit], _ options: TikrarOptions = TikrarOptions()) {
        self.options = options.normalized()
        self.steps = Tikrar.plan(units, options)
    }

    public var remaining: Int { return phase == "done" ? 0 : Tikrar.remainingMs(steps, options, stepIndex: step, repsDone: rep) }
    public var total: Int { return Tikrar.totalMs(steps, options) }

    private func play() -> TikrarAction {
        if step >= steps.count { phase = "done"; action = .done; return .done }
        let s = steps[step]
        phase = "playing"
        let a = TikrarAction.play(step: step, rep: rep, start: s.start, end: s.end, rate: options.speed)
        action = a
        return a
    }

    private func advance() -> TikrarAction {
        rep += 1
        if rep >= steps[step].reps { step += 1; rep = 0 }
        return play()
    }

    @discardableResult public func start() -> TikrarAction { step = 0; rep = 0; return play() }

    @discardableResult public func ended() -> TikrarAction? {
        if phase != "playing" { return action }
        if options.mode != "repeat" { return advance() }
        if options.manualGap { phase = "waiting"; action = .awaitLearner(step: step, rep: rep); return action }
        let ms = Tikrar.gapMs(steps[step], options)
        if ms <= 0 { return advance() }
        phase = "gap"
        action = .wait(ms: ms, step: step, rep: rep)
        return action
    }

    @discardableResult public func resume() -> TikrarAction? { return phase == "gap" || phase == "waiting" ? advance() : action }

    @discardableResult public func goTo(_ stepIndex: Int) -> TikrarAction? {
        if steps.isEmpty || phase == "idle" || phase == "done" { return action }
        step = max(0, min(steps.count - 1, stepIndex))
        rep = 0
        return play()
    }

    @discardableResult public func next() -> TikrarAction? { return goTo(step + 1) }
    @discardableResult public func previous() -> TikrarAction? { return goTo(step - 1) }
    @discardableResult public func restart() -> TikrarAction? { return goTo(step) }
}
