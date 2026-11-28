// Runs the shared vectors against this implementation.  swift run TikrarVectors ../tests/vectors.txt
import Foundation
import Tikrar

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "../tests/vectors.txt"
guard let text = try? String(contentsOfFile: path, encoding: .utf8) else { print("cannot read \(path)"); exit(2) }

var fails = 0, cases = 0, checks = 0, name = ""
var units: [TikrarUnit] = [], steps: [TikrarStep] = [], events: [String] = []
var opt = TikrarOptions()

func check(_ what: String, _ got: String, _ want: String) {
    checks += 1
    if got != want { fails += 1; print("FAIL \(name) \(what)\n  got  \(got)\n  want \(want)") }
}
func parts(_ s: String, _ sep: Character) -> [String] { return s.split(separator: sep, omittingEmptySubsequences: false).map(String.init) }
func cut(_ s: String, at sep: Character) -> (String, String) {
    guard let i = s.firstIndex(of: sep) else { return (s, "") }
    return (String(s[s.startIndex..<i]), String(s[s.index(after: i)...]))
}

for raw in parts(text, "\n") {
    let line = raw.trimmingCharacters(in: .whitespaces)
    if line.isEmpty || line.hasPrefix("#") { continue }
    let (key, val) = cut(line, at: " ")
    switch key {
    case "CASE": name = val; cases += 1
    case "UNITS":
        units = val == "-" ? [] : parts(val, ",").map { u in let p = parts(u, "-"); return TikrarUnit(start: Int(p[0])!, end: Int(p[1])!) }
    case "OPT":
        opt = TikrarOptions()
        if val != "-" {
            for kv in parts(val, " ") {
                let (k, v) = cut(kv, at: "=")
                if k == "link" { opt.link = v }
                if k == "mode" { opt.mode = v }
                if k == "gap" && v == "manual" { opt.manualGap = true }
                guard let n = Double(v) else { continue }
                switch k {
                case "talqin": opt.talqin = Int(n.rounded(.down))
                case "wasl": opt.wasl = Int(n.rounded(.down))
                case "sard": opt.sard = Int(n.rounded(.down))
                case "gap": opt.gap = n
                case "speed": opt.speed = n
                default: break
                }
            }
        }
        steps = Tikrar.plan(units, opt)
    case "PLAN": check("plan", steps.isEmpty ? "-" : Tikrar.planText(steps), val)
    case "TOTAL": check("total", String(Tikrar.totalMs(steps, opt)), val)
    case "REMAIN":
        if val != "-" {
            for r in parts(val, ",") {
                let (at, ms) = cut(r, at: "="), p = parts(at, "/")
                check("remaining \(at)", String(Tikrar.remainingMs(steps, opt, stepIndex: Int(p[0])!, repsDone: Int(p[1])!)), ms)
            }
        }
    case "EVENTS": events = parts(val, ",")
    case "ACTIONS":
        let s = TikrarSession(units, opt)
        var got: [String] = []
        for e in events {
            let a: TikrarAction?
            switch e {
            case "start": a = s.start()
            case "ended": a = s.ended()
            case "resume": a = s.resume()
            case "next": a = s.next()
            case "previous": a = s.previous()
            case "restart": a = s.restart()
            default: a = s.goTo(Int(e.dropFirst(5))!)
            }
            got.append(Tikrar.actionText(a))
        }
        check("actions", got.joined(separator: "|"), val)
    case "LOCATE":
        if val != "-" {
            for r in parts(val, ",") {
                let (ms, idx) = cut(r, at: "=")
                check("locate \(ms)", String(Tikrar.locate(units, Int(ms)!)), idx)
            }
        }
    default: break
    }
}
let g = Tikrar.groupUnits([TikrarUnit(start: 0, end: 10, id: "2:1"), TikrarUnit(start: 10, end: 30, id: "2:2"), TikrarUnit(start: 30, end: 45, id: "2:3")], size: 2)
check("groupUnits", g.map { "\($0.id)@\($0.start)-\($0.end)" }.joined(separator: ","), "2:1-2:2@0-30,2:3@30-45")
print("swift: \(cases) cases, \(checks) checks, \(fails) failed")
exit(fails > 0 ? 1 : 0)
