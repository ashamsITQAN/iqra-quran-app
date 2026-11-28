// Runs the shared vectors against this implementation.  dotnet run --project Tikrar.Tests -- ../tests/vectors.txt
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Tikrar;

static class Program
{
    static int fails, cases, checks;
    static string name = "";

    static void Check(string what, string got, string want)
    {
        checks++;
        if (got != want) { fails++; Console.Error.WriteLine("FAIL " + name + " " + what + "\n  got  " + got + "\n  want " + want); }
    }

    static int Main(string[] args)
    {
        var units = new List<Unit>(); var steps = new List<Step>(); var events = new string[0]; var opt = new Options();
        foreach (string raw in File.ReadAllLines(args.Length > 0 ? args[0] : "../tests/vectors.txt"))
        {
            string line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("#")) continue;
            int sp = line.IndexOf(' ');
            string key = sp < 0 ? line : line.Substring(0, sp), val = sp < 0 ? "" : line.Substring(sp + 1);
            if (key == "CASE") { name = val; cases++; }
            else if (key == "UNITS") units = val == "-" ? new List<Unit>() : val.Split(',').Select(u => new Unit(long.Parse(u.Split('-')[0]), long.Parse(u.Split('-')[1]))).ToList();
            else if (key == "OPT")
            {
                opt = new Options();
                if (val != "-") foreach (string kv in val.Split(' '))
                {
                    string k = kv.Split('=')[0], v = kv.Split('=')[1];
                    if (k == "link") opt.Link = v;
                    if (k == "mode") opt.Mode = v;
                    if (k == "gap" && v == "manual") opt.ManualGap = true;
                    double n;
                    if (!double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out n)) continue;
                    if (k == "talqin") opt.Talqin = (int)Math.Floor(n);
                    if (k == "wasl") opt.Wasl = (int)Math.Floor(n);
                    if (k == "sard") opt.Sard = (int)Math.Floor(n);
                    if (k == "gap") opt.Gap = n;
                    if (k == "speed") opt.Speed = n;
                }
                steps = Engine.Plan(units, opt);
            }
            else if (key == "PLAN") Check("plan", steps.Count == 0 ? "-" : Engine.PlanText(steps), val);
            else if (key == "TOTAL") Check("total", Engine.TotalMs(steps, opt).ToString(CultureInfo.InvariantCulture), val);
            else if (key == "REMAIN")
            {
                if (val != "-") foreach (string r in val.Split(','))
                {
                    string at = r.Split('=')[0];
                    Check("remaining " + at, Engine.RemainingMs(steps, opt, int.Parse(at.Split('/')[0]), int.Parse(at.Split('/')[1])).ToString(CultureInfo.InvariantCulture), r.Split('=')[1]);
                }
            }
            else if (key == "EVENTS") events = val.Split(',');
            else if (key == "ACTIONS")
            {
                var s = new Session(units, opt); var got = new List<string>();
                foreach (string e in events)
                {
                    Tikrar.Action a = e == "start" ? s.Start() : e == "ended" ? s.Ended() : e == "resume" ? s.Resume() : e == "next" ? s.Next() : e == "previous" ? s.Previous() : e == "restart" ? s.Restart() : s.GoTo(int.Parse(e.Substring(5), CultureInfo.InvariantCulture));
                    got.Add(Engine.ActionText(a));
                }
                Check("actions", string.Join("|", got), val);
            }
            else if (key == "LOCATE")
            {
                if (val != "-") foreach (string r in val.Split(','))
                {
                    int eq = r.IndexOf('=');
                    Check("locate " + r.Substring(0, eq), Engine.Locate(units, long.Parse(r.Substring(0, eq), CultureInfo.InvariantCulture)).ToString(CultureInfo.InvariantCulture), r.Substring(eq + 1));
                }
            }
        }
        var g = Engine.GroupUnits(new List<Unit> { new Unit(0, 10, "2:1"), new Unit(10, 30, "2:2"), new Unit(30, 45, "2:3") }, 2);
        Check("groupUnits", string.Join(",", g.Select(u => u.Id + "@" + u.Start + "-" + u.End)), "2:1-2:2@0-30,2:3@30-45");
        Console.WriteLine("csharp: " + cases + " cases, " + checks + " checks, " + fails + " failed");
        return fails > 0 ? 1 : 0;
    }
}
