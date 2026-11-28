// Tikrar — التكرار الدائري المتقاطع (circular cross repetition). Specification: ../../SPEC.md
// The method: Ahmad Shams, https://community.itqan.dev/d/432
//
// No dependencies, no audio, no timers. Engine.Plan says what is heard, in what order and how many times; Session says
// what the player must do next. Times are whole milliseconds.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Tikrar
{
    /// <summary>A stretch of the recitation to memorise: an ayah, several ayahs, a phrase, or a run of words.</summary>
    public sealed class Unit
    {
        public long Start { get; }
        public long End { get; }
        public string Id { get; }
        public Unit(long start, long end, string id = "") { Start = start; End = end; Id = id ?? ""; }
    }

    public sealed class Options
    {
        /// <summary>Hearings of each new unit alone.</summary>
        public int Talqin = 5;
        /// <summary>Hearings of its joining to what came before.</summary>
        public int Wasl = 5;
        /// <summary>Hearings of the whole passage.</summary>
        public int Sard = 3;
        /// <summary>"cumulative" (join from the first unit) or "previous" (join to the unit before only).</summary>
        public string Link = "cumulative";
        /// <summary>"repeat" (the learner recites after each hearing) or "listen".</summary>
        public string Mode = "repeat";
        /// <summary>The pause after a hearing, as a multiple of its length; ignored when ManualGap.</summary>
        public double Gap = 1;
        /// <summary>The pause lasts until the learner asks to go on.</summary>
        public bool ManualGap = false;
        public double Speed = 1;

        /// <summary>Every field within its bounds.</summary>
        public Options Normalized()
        {
            return new Options
            {
                Talqin = Math.Max(0, Talqin), Wasl = Math.Max(0, Wasl), Sard = Math.Max(0, Sard),
                Link = Link == "previous" ? "previous" : "cumulative",
                Mode = Mode == "listen" ? "listen" : "repeat",
                Gap = !double.IsNaN(Gap) && !double.IsInfinity(Gap) && Gap >= 0 ? Gap : 1,
                ManualGap = ManualGap,
                Speed = !double.IsNaN(Speed) && !double.IsInfinity(Speed) && Speed > 0 ? Speed : 1,
            };
        }
    }

    /// <summary>Kind: "talqin", "wasl" or "sard"; From and To are unit indexes, both included.</summary>
    public sealed class Step
    {
        public string Kind { get; }
        public int From { get; }
        public int To { get; }
        public int Reps { get; }
        public long Start { get; }
        public long End { get; }
        public Step(string kind, int from, int to, int reps, long start, long end) { Kind = kind; From = from; To = to; Reps = reps; Start = start; End = end; }
    }

    /// <summary>What the player must do next. Type: "play" (from Start to End at Rate, then call Ended()), "wait" (Ms for
    /// the learner, then Resume()), "await" (until the learner asks, then Resume()), "done".</summary>
    public sealed class Action
    {
        public string Type { get; }
        public int Step { get; }
        public int Rep { get; }
        public long Start { get; }
        public long End { get; }
        public long Ms { get; }
        public double Rate { get; }
        public Action(string type, int step = 0, int rep = 0, long start = 0, long end = 0, long ms = 0, double rate = 1) { Type = type; Step = step; Rep = rep; Start = start; End = end; Ms = ms; Rate = rate; }
    }

    public static class Engine
    {
        public const string Version = "1.0.0";

        static long Half(double x) { return (long)Math.Floor(x + 0.5); }

        /// <summary>Units of size consecutive ayahs (the last may be shorter) from per-ayah timings.</summary>
        public static List<Unit> GroupUnits(IList<Unit> ayahs, int size = 1)
        {
            int n = Math.Max(1, size);
            var units = new List<Unit>();
            for (int i = 0; i < ayahs.Count; i += n)
            {
                int last = Math.Min(ayahs.Count, i + n) - 1;
                Unit a = ayahs[i], b = ayahs[last];
                string id = a.Id.Length == 0 ? i.ToString() : (last == i || b.Id.Length == 0 ? a.Id : a.Id + "-" + b.Id);
                units.Add(new Unit(a.Start, b.End, id));
            }
            return units;
        }

        public static List<Step> Plan(IList<Unit> units, Options options = null)
        {
            Options o = (options ?? new Options()).Normalized();
            var steps = new List<Step>();
            for (int i = 0; i < units.Count; i++)
            {
                if (o.Talqin > 0) steps.Add(new Step("talqin", i, i, o.Talqin, units[i].Start, units[i].End));
                if (i > 0 && o.Wasl > 0)
                {
                    int from = o.Link == "cumulative" ? 0 : i - 1;
                    steps.Add(new Step("wasl", from, i, o.Wasl, units[from].Start, units[i].End));
                }
            }
            if (units.Count > 1 && o.Sard > 0) steps.Add(new Step("sard", 0, units.Count - 1, o.Sard, units[0].Start, units[units.Count - 1].End));
            return steps;
        }

        public static long HeardMs(Step step, Options options = null)
        {
            return Half((step.End - step.Start) / (options ?? new Options()).Normalized().Speed);
        }

        public static long GapMs(Step step, Options options = null)
        {
            Options o = (options ?? new Options()).Normalized();
            return o.Mode != "repeat" || o.ManualGap ? 0 : Half(HeardMs(step, o) * o.Gap);
        }

        public static long RemainingMs(IList<Step> steps, Options options = null, int stepIndex = 0, int repsDone = 0)
        {
            long ms = 0;
            for (int i = Math.Max(0, stepIndex); i < steps.Count; i++)
                ms += (steps[i].Reps - (i == stepIndex ? repsDone : 0)) * (HeardMs(steps[i], options) + GapMs(steps[i], options));
            return ms;
        }

        public static long TotalMs(IList<Step> steps, Options options = null) { return RemainingMs(steps, options, 0, 0); }

        /// <summary>The index of the segment (ayah, phrase or word) being recited at ms, or -1. Segments are in order.</summary>
        public static int Locate(IList<Unit> segments, long ms)
        {
            int lo = 0, hi = segments.Count - 1, at = -1;
            while (lo <= hi)
            {
                int mid = (lo + hi) / 2;
                if (segments[mid].Start <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1;
            }
            return at >= 0 && ms < segments[at].End ? at : -1;
        }

        public static string PlanText(IEnumerable<Step> steps)
        {
            return string.Join(";", steps.Select(s => s.Kind + ":" + s.From + "-" + s.To + "x" + s.Reps + "@" + s.Start + "-" + s.End));
        }

        public static string ActionText(Action a)
        {
            if (a == null) return "none";
            if (a.Type == "play") return "play:" + a.Step + "/" + a.Rep + "@" + a.Start + "-" + a.End;
            if (a.Type == "wait") return "wait:" + a.Ms;
            return a.Type;
        }
    }

    /// <summary>A session over a plan. It holds no clock: the app plays what it is told and reports back.</summary>
    public sealed class Session
    {
        public Options Options { get; }
        public List<Step> Steps { get; }
        public int Step { get; private set; }
        public int Rep { get; private set; }
        /// <summary>"idle", "playing", "gap", "waiting" or "done".</summary>
        public string Phase { get; private set; }
        public Action Action { get; private set; }

        public Session(IList<Unit> units, Options options = null)
        {
            Options = (options ?? new Options()).Normalized();
            Steps = Engine.Plan(units, Options);
            Phase = "idle";
        }

        public long Remaining { get { return Phase == "done" ? 0 : Engine.RemainingMs(Steps, Options, Step, Rep); } }
        public long Total { get { return Engine.TotalMs(Steps, Options); } }

        Action Play()
        {
            if (Step >= Steps.Count) { Phase = "done"; Action = new Action("done"); return Action; }
            var s = Steps[Step];
            Phase = "playing";
            Action = new Action("play", Step, Rep, s.Start, s.End, 0, Options.Speed);
            return Action;
        }

        Action Advance()
        {
            Rep += 1;
            if (Rep >= Steps[Step].Reps) { Step += 1; Rep = 0; }
            return Play();
        }

        public Action Start() { Step = 0; Rep = 0; return Play(); }

        public Action Ended()
        {
            if (Phase != "playing") return Action;
            if (Options.Mode != "repeat") return Advance();
            if (Options.ManualGap) { Phase = "waiting"; Action = new Action("await", Step, Rep); return Action; }
            long ms = Engine.GapMs(Steps[Step], Options);
            if (ms <= 0) return Advance();
            Phase = "gap";
            Action = new Action("wait", Step, Rep, 0, 0, ms);
            return Action;
        }

        public Action Resume() { return Phase == "gap" || Phase == "waiting" ? Advance() : Action; }

        public Action GoTo(int stepIndex)
        {
            if (Steps.Count == 0 || Phase == "idle" || Phase == "done") return Action;
            Step = Math.Max(0, Math.Min(Steps.Count - 1, stepIndex));
            Rep = 0;
            return Play();
        }

        public Action Next() { return GoTo(Step + 1); }
        public Action Previous() { return GoTo(Step - 1); }
        public Action Restart() { return GoTo(Step); }
    }
}
