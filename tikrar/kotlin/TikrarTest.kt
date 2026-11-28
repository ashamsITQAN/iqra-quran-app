// Runs the shared vectors (../tests/vectors.txt) against this implementation.
//   kotlinc Tikrar.kt TikrarTest.kt -include-runtime -d tikrar-test.jar && java -jar tikrar-test.jar ../tests/vectors.txt
import tikrar.*
import java.io.File
import kotlin.math.floor
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    var fails = 0; var cases = 0; var checks = 0; var name = ""
    var units = listOf<TikrarUnit>(); var steps = listOf<Step>(); var events = listOf<String>(); var opt = Options()
    fun check(what: String, got: String, want: String) {
        checks++
        if (got != want) { fails++; System.err.println("FAIL $name $what\n  got  $got\n  want $want") }
    }
    for (raw in File(args.getOrElse(0) { "../tests/vectors.txt" }).readLines()) {
        val line = raw.trim()
        if (line.isEmpty() || line.startsWith("#")) continue
        val sp = line.indexOf(' ')
        val key = if (sp < 0) line else line.substring(0, sp)
        val v = if (sp < 0) "" else line.substring(sp + 1)
        when (key) {
            "CASE" -> { name = v; cases++ }
            "UNITS" -> units = if (v == "-") listOf() else v.split(",").map { TikrarUnit(it.split("-")[0].toLong(), it.split("-")[1].toLong()) }
            "OPT" -> {
                var talqin = 5; var wasl = 5; var sard = 3; var link = "cumulative"; var mode = "repeat"; var manual = false; var gap = 1.0; var speed = 1.0
                if (v != "-") for (kv in v.split(" ")) {
                    val k = kv.split("=")[0]; val x = kv.split("=")[1]; val n = x.toDoubleOrNull()
                    if (k == "link") link = x
                    if (k == "mode") mode = x
                    if (k == "gap" && x == "manual") manual = true
                    if (n == null) continue
                    when (k) { "talqin" -> talqin = floor(n).toInt(); "wasl" -> wasl = floor(n).toInt(); "sard" -> sard = floor(n).toInt(); "gap" -> gap = n; "speed" -> speed = n }
                }
                opt = Options(talqin, wasl, sard, link, mode, gap, manual, speed)
                steps = plan(units, opt)
            }
            "PLAN" -> check("plan", if (steps.isEmpty()) "-" else planText(steps), v)
            "TOTAL" -> check("total", totalMs(steps, opt).toString(), v)
            "REMAIN" -> if (v != "-") for (r in v.split(",")) {
                val at = r.split("=")[0]
                check("remaining $at", remainingMs(steps, opt, at.split("/")[0].toInt(), at.split("/")[1].toInt()).toString(), r.split("=")[1])
            }
            "EVENTS" -> events = v.split(",")
            "ACTIONS" -> {
                val s = Session(units, opt)
                val got = events.map { e ->
                    actionText(when (e) { "start" -> s.start(); "ended" -> s.ended(); "resume" -> s.resume(); "next" -> s.next(); "previous" -> s.previous(); "restart" -> s.restart(); else -> s.goTo(e.substring(5).toInt()) })
                }
                check("actions", got.joinToString("|"), v)
            }
            "LOCATE" -> if (v != "-") for (r in v.split(",")) {
                val eq = r.indexOf('=')
                check("locate ${r.substring(0, eq)}", locate(units, r.substring(0, eq).toLong()).toString(), r.substring(eq + 1))
            }
        }
    }
    val g = groupUnits(listOf(TikrarUnit(0, 10, "2:1"), TikrarUnit(10, 30, "2:2"), TikrarUnit(30, 45, "2:3")), 2)
    check("groupUnits", g.joinToString(",") { "${it.id}@${it.start}-${it.end}" }, "2:1-2:2@0-30,2:3@30-45")
    println("kotlin: $cases cases, $checks checks, $fails failed")
    exitProcess(if (fails > 0) 1 else 0)
}
