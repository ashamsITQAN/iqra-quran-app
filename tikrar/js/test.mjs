// Runs the shared vectors (../tests/vectors.txt) against this implementation.  node test.mjs
import { readFileSync } from "node:fs";
import * as T from "./tikrar.js";

const text = readFileSync(new URL("../tests/vectors.txt", import.meta.url), "utf8");
let c = null, fails = 0, cases = 0, checks = 0;
const check = (what, got, want) => { checks++; if (got !== want) { fails++; console.error(`FAIL ${c.name} ${what}\n  got  ${got}\n  want ${want}`); } };
for (const raw of text.split("\n")) {
  const line = raw.trim(); if (!line || line.startsWith("#")) continue;
  const sp = line.indexOf(" "), key = sp < 0 ? line : line.slice(0, sp), val = sp < 0 ? "" : line.slice(sp + 1);
  if (key === "CASE") { c = { name: val }; cases++; }
  else if (key === "UNITS") c.units = val === "-" ? [] : val.split(",").map((u, i) => { const [a, b] = u.split("-"); return { id: String(i), start: +a, end: +b }; });
  else if (key === "OPT") {
    c.opt = {};
    if (val !== "-") for (const kv of val.split(" ")) { const [k, v] = kv.split("="); if (k === "link" || k === "mode") c.opt[k] = v; else if (k === "gap" && v === "manual") c.opt.gap = "manual"; else if (!Number.isNaN(Number(v))) c.opt[k] = Number(v); }
    c.steps = T.plan(c.units, c.opt);
  }
  else if (key === "PLAN") check("plan", T.planText(c.steps) || "-", val);
  else if (key === "TOTAL") check("total", String(T.totalMs(c.steps, c.opt)), val);
  else if (key === "REMAIN") { if (val !== "-") for (const r of val.split(",")) { const [at, ms] = r.split("="), [i, n] = at.split("/"); check("remaining " + at, String(T.remainingMs(c.steps, c.opt, +i, +n)), ms); } }
  else if (key === "EVENTS") c.events = val.split(",");
  else if (key === "ACTIONS") {
    const s = new T.Session(c.units, c.opt);
    const got = c.events.map((e) => T.actionText(e === "start" ? s.start() : e === "ended" ? s.ended() : e === "resume" ? s.resume() : e === "next" ? s.next() : e === "previous" ? s.previous() : e === "restart" ? s.restart() : s.goTo(+e.slice(5))));
    check("actions", got.join("|"), val);
  }
  else if (key === "LOCATE") { if (val !== "-") for (const r of val.split(",")) { const eq = r.indexOf("="); check("locate " + r.slice(0, eq), String(T.locate(c.units, +r.slice(0, eq))), r.slice(eq + 1)); } }
}
// groupUnits is not in the vectors: three ayahs by two
const g = T.groupUnits([{ id: "2:1", start: 0, end: 10 }, { id: "2:2", start: 10, end: 30 }, { id: "2:3", start: 30, end: 45 }], 2);
check("groupUnits", JSON.stringify(g), JSON.stringify([{ id: "2:1-2:2", start: 0, end: 30 }, { id: "2:3", start: 30, end: 45 }]));
console.log(`js: ${cases} cases, ${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
