/**
 * Tikrar — التكرار الدائري المتقاطع (circular cross repetition). Specification: ../SPEC.md
 * The method: Ahmad Shams, https://community.itqan.dev/d/432
 *
 * Plain Kotlin, no dependencies, no audio, no timers: usable on Android, in Kotlin Multiplatform and on the JVM.
 * plan() says what is heard, in what order and how many times; Session says what the player must do next.
 * Times are whole milliseconds.
 */
package tikrar

import kotlin.math.floor

const val VERSION = "1.0.0"

/** A stretch of the recitation to memorise: an ayah, several ayahs, a phrase, or a run of words. */
data class TikrarUnit(val start: Long, val end: Long, val id: String = "")

data class Options(
    /** Hearings of each new unit alone, of its joining to what came before, and of the whole passage. */
    val talqin: Int = 5, val wasl: Int = 5, val sard: Int = 3,
    /** "cumulative" (join from the first unit) or "previous" (join to the unit before only). */
    val link: String = "cumulative",
    /** "repeat" (the learner recites after each hearing) or "listen". */
    val mode: String = "repeat",
    /** The pause after a hearing, as a multiple of its length; ignored when manualGap. */
    val gap: Double = 1.0,
    /** The pause lasts until the learner asks to go on. */
    val manualGap: Boolean = false,
    val speed: Double = 1.0,
) {
    /** Every field within its bounds. */
    fun normalized() = Options(
        maxOf(0, talqin), maxOf(0, wasl), maxOf(0, sard),
        if (link == "previous") "previous" else "cumulative",
        if (mode == "listen") "listen" else "repeat",
        if (gap.isFinite() && gap >= 0) gap else 1.0, manualGap,
        if (speed.isFinite() && speed > 0) speed else 1.0,
    )
}

/** kind: "talqin", "wasl" or "sard"; from and to are unit indexes, both included. */
data class Step(val kind: String, val from: Int, val to: Int, val reps: Int, val start: Long, val end: Long)

/** What the player must do next. */
sealed class Action {
    /** Play the audio from start to end at rate, then call ended(). */
    data class Play(val step: Int, val rep: Int, val start: Long, val end: Long, val rate: Double) : Action()
    /** Leave the learner ms to recite, then call resume(). */
    data class Wait(val ms: Long, val step: Int, val rep: Int) : Action()
    /** Wait until the learner asks to go on, then call resume(). */
    data class Await(val step: Int, val rep: Int) : Action()
    object Done : Action()
}

private fun half(x: Double): Long = floor(x + 0.5).toLong()

/** Units of size consecutive ayahs (the last may be shorter) from per-ayah timings. */
fun groupUnits(ayahs: List<TikrarUnit>, size: Int = 1): List<TikrarUnit> {
    val n = maxOf(1, size)
    val units = ArrayList<TikrarUnit>()
    var i = 0
    while (i < ayahs.size) {
        val a = ayahs[i]
        val b = ayahs[minOf(ayahs.size, i + n) - 1]
        val id = if (a.id.isEmpty()) i.toString() else if (a === b || b.id.isEmpty()) a.id else "${a.id}-${b.id}"
        units.add(TikrarUnit(a.start, b.end, id))
        i += n
    }
    return units
}

fun plan(units: List<TikrarUnit>, options: Options = Options()): List<Step> {
    val o = options.normalized()
    val steps = ArrayList<Step>()
    fun step(kind: String, from: Int, to: Int, reps: Int) = Step(kind, from, to, reps, units[from].start, units[to].end)
    for (i in units.indices) {
        if (o.talqin > 0) steps.add(step("talqin", i, i, o.talqin))
        if (i > 0 && o.wasl > 0) steps.add(step("wasl", if (o.link == "cumulative") 0 else i - 1, i, o.wasl))
    }
    if (units.size > 1 && o.sard > 0) steps.add(step("sard", 0, units.size - 1, o.sard))
    return steps
}

fun heardMs(step: Step, options: Options = Options()): Long = half((step.end - step.start) / options.normalized().speed)

fun gapMs(step: Step, options: Options = Options()): Long {
    val o = options.normalized()
    return if (o.mode != "repeat" || o.manualGap) 0 else half(heardMs(step, o) * o.gap)
}

fun remainingMs(steps: List<Step>, options: Options = Options(), stepIndex: Int = 0, repsDone: Int = 0): Long {
    var ms = 0L
    for (i in maxOf(0, stepIndex) until steps.size) ms += (steps[i].reps - (if (i == stepIndex) repsDone else 0)) * (heardMs(steps[i], options) + gapMs(steps[i], options))
    return ms
}

fun totalMs(steps: List<Step>, options: Options = Options()): Long = remainingMs(steps, options, 0, 0)

/** The index of the segment (ayah, phrase or word) being recited at ms, or -1. Segments are in order. */
fun locate(segments: List<TikrarUnit>, ms: Long): Int {
    var lo = 0
    var hi = segments.size - 1
    var at = -1
    while (lo <= hi) {
        val mid = (lo + hi) ushr 1
        if (segments[mid].start <= ms) { at = mid; lo = mid + 1 } else hi = mid - 1
    }
    return if (at >= 0 && ms < segments[at].end) at else -1
}

/** A session over a plan. It holds no clock: the app plays what it is told and reports back. */
class Session(units: List<TikrarUnit>, options: Options = Options()) {
    val options: Options = options.normalized()
    val steps: List<Step> = plan(units, this.options)
    var step = 0; private set
    var rep = 0; private set
    /** "idle", "playing", "gap", "waiting" or "done". */
    var phase = "idle"; private set
    var action: Action? = null; private set

    val remaining: Long get() = if (phase == "done") 0 else remainingMs(steps, options, step, rep)
    val total: Long get() = totalMs(steps, options)

    private fun play(): Action {
        if (step >= steps.size) { phase = "done"; return Action.Done.also { action = it } }
        val s = steps[step]
        phase = "playing"
        return Action.Play(step, rep, s.start, s.end, options.speed).also { action = it }
    }

    private fun advance(): Action {
        rep += 1
        if (rep >= steps[step].reps) { step += 1; rep = 0 }
        return play()
    }

    fun start(): Action { step = 0; rep = 0; return play() }

    fun ended(): Action? {
        if (phase != "playing") return action
        if (options.mode != "repeat") return advance()
        if (options.manualGap) { phase = "waiting"; return Action.Await(step, rep).also { action = it } }
        val ms = gapMs(steps[step], options)
        if (ms <= 0) return advance()
        phase = "gap"
        return Action.Wait(ms, step, rep).also { action = it }
    }

    fun resume(): Action? = if (phase == "gap" || phase == "waiting") advance() else action

    fun goTo(stepIndex: Int): Action? {
        if (steps.isEmpty() || phase == "idle" || phase == "done") return action
        step = stepIndex.coerceIn(0, steps.size - 1)
        rep = 0
        return play()
    }

    fun next(): Action? = goTo(step + 1)
    fun previous(): Action? = goTo(step - 1)
    fun restart(): Action? = goTo(step)
}

fun planText(steps: List<Step>): String = steps.joinToString(";") { "${it.kind}:${it.from}-${it.to}x${it.reps}@${it.start}-${it.end}" }

fun actionText(a: Action?): String = when (a) {
    null -> "none"
    is Action.Play -> "play:${a.step}/${a.rep}@${a.start}-${a.end}"
    is Action.Wait -> "wait:${a.ms}"
    is Action.Await -> "await"
    Action.Done -> "done"
}
