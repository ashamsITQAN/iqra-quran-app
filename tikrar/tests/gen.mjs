// Writes tests/vectors.txt (and vectors.json) from the reference implementation. Run after a deliberate change of behaviour only:
// every other implementation must then be brought to agree with the new file.
import { writeFileSync } from "node:fs";
import * as T from "../js/tikrar.js";

const U = (...ends) => { let s = 0; return ends.map((e, i) => { const u = { id: String(i + 1), start: s, end: e }; s = e; return u; }); };
const gapped = [[500, 4100], [4300, 9800], [10050, 12000], [12400, 20000]].map(([start, end], i) => ({ id: String(i + 1), start, end }));
const drive = (events) => events;
const loop = (n) => Array.from({ length: n }, () => ["ended", "resume"]).flat();

const cases = [
  ["defaults-three-units", U(4000, 9000, 15000), {}, ["start", ...loop(40)], [[0, 0], [1, 2], [4, 0]], [0, 3999, 4000, 14999, 15000, -5]],
  ["previous-link", U(4000, 9000, 15000, 21000), { talqin: 2, wasl: 2, sard: 1, link: "previous" }, ["start", ...loop(20)], [[0, 0], [3, 1]], [20999, 21000]],
  ["single-unit", U(7000), { talqin: 3, wasl: 4, sard: 2 }, ["start", ...loop(5)], [[0, 0], [0, 2]], [0, 7000]],
  ["single-unit-no-talqin", U(7000), { talqin: 0 }, ["start", "ended", "resume", "next"], [[0, 0]], []],
  ["no-units", [], {}, ["start", "ended", "resume"], [[0, 0]], [0]],
  ["no-wasl", U(3000, 6000, 9000), { talqin: 1, wasl: 0, sard: 2 }, ["start", ...loop(6)], [[0, 0], [3, 1]], []],
  ["no-sard", U(3000, 6000), { talqin: 1, wasl: 1, sard: 0 }, ["start", ...loop(4)], [[1, 0]], []],
  ["only-sard", U(3000, 6000, 9000), { talqin: 0, wasl: 0, sard: 2 }, ["start", ...loop(3)], [[0, 1]], []],
  ["listen-mode", U(4000, 9000), { talqin: 2, wasl: 1, sard: 1, mode: "listen" }, ["start", "ended", "ended", "resume", "ended", "ended", "ended", "ended", "ended"], [[0, 0], [2, 0]], []],
  ["manual-gap", U(4000, 9000), { talqin: 1, wasl: 1, sard: 1, gap: "manual" }, ["start", "resume", "ended", "ended", "resume", "ended", "resume", "ended", "resume", "ended", "resume", "resume"], [[0, 0], [1, 0]], []],
  ["zero-gap", U(4000, 9000), { talqin: 1, wasl: 1, sard: 0, gap: 0 }, ["start", "ended", "ended", "ended", "ended"], [[0, 0]], []],
  ["half-gap-fast", U(4000, 9000, 15000), { talqin: 2, wasl: 1, sard: 1, gap: 0.5, speed: 1.25 }, ["start", ...loop(12)], [[0, 0], [2, 1], [5, 0]], []],
  ["double-gap-slow", U(3000, 9000), { talqin: 1, wasl: 1, sard: 1, gap: 2, speed: 0.75 }, ["start", ...loop(5)], [[0, 0], [3, 0]], []],
  ["rounding", U(1001, 2003, 3334), { talqin: 1, wasl: 1, sard: 1, gap: 1.5, speed: 1.5 }, ["start", ...loop(6)], [[0, 0], [1, 0], [4, 0]], []],
  ["units-with-silence-between", gapped, { talqin: 1, wasl: 1, sard: 1 }, ["start", ...loop(9)], [[0, 0], [6, 0]], [0, 499, 500, 4099, 4100, 4200, 4300, 12399, 19999, 20000]],
  ["controls", U(4000, 9000, 15000), { talqin: 2, wasl: 2, sard: 2 }, ["next", "start", "next", "next", "previous", "restart", "ended", "next", "ended", "restart", "goto:99", "next", "goto:-4", "previous", "goto:3", "ended", "resume", "ended", "resume", "ended"], [[0, 0]], []],
  ["controls-after-done", U(2000, 4000), { talqin: 1, wasl: 0, sard: 0, mode: "listen" }, ["start", "ended", "ended", "ended", "next", "previous", "restart", "goto:0", "start", "ended"], [[0, 0]], []],
  ["bad-options-fall-back", U(4000, 9000), { talqin: -3, wasl: "x", sard: 2.9, link: "sideways", mode: "sing", gap: -1, speed: 0 }, ["start", ...loop(3)], [[0, 0]], []],
  ["long-passage", U(...Array.from({ length: 12 }, (_, i) => (i + 1) * 5000 + i * 137)), { talqin: 3, wasl: 2, sard: 2, link: "cumulative", gap: 1, speed: 1 }, ["start", ...loop(8), "goto:20", ...loop(3), "next", "ended"], [[0, 0], [10, 1], [22, 0], [23, 1]], [61000]],
];

const optText = (o) => Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}=${v}`).join(" ") : "-";
const lines = ["# Tikrar test vectors, format 1. Written by tests/gen.mjs from the reference implementation; see SPEC.md, section 7.", ""], json = [];
for (const [name, units, opt, events, remainAt, locateAt] of cases) {
  const steps = T.plan(units, opt), s = new T.Session(units, opt), actions = [];
  for (const e of events) {
    const a = e === "start" ? s.start() : e === "ended" ? s.ended() : e === "resume" ? s.resume() : e === "next" ? s.next() : e === "previous" ? s.previous() : e === "restart" ? s.restart() : s.goTo(+e.split(":")[1]);
    actions.push(T.actionText(a));
  }
  const remain = remainAt.map(([i, r]) => `${i}/${r}=${T.remainingMs(steps, opt, i, r)}`), loc = locateAt.map((ms) => `${ms}=${T.locate(units, ms)}`);
  lines.push(`CASE ${name}`, `UNITS ${units.map((u) => `${u.start}-${u.end}`).join(",") || "-"}`, `OPT ${optText(opt)}`, `PLAN ${T.planText(steps) || "-"}`, `TOTAL ${T.totalMs(steps, opt)}`, `REMAIN ${remain.join(",") || "-"}`, `EVENTS ${events.join(",")}`, `ACTIONS ${actions.join("|")}`, `LOCATE ${loc.join(",") || "-"}`, "END", "");
  json.push({ name, units, options: opt, plan: steps, totalMs: T.totalMs(steps, opt), remaining: remainAt.map(([step, rep]) => ({ step, rep, ms: T.remainingMs(steps, opt, step, rep) })), events, actions, locate: locateAt.map((ms) => ({ ms, index: T.locate(units, ms) })) });
}
writeFileSync(new URL("./vectors.txt", import.meta.url), lines.join("\n"));
writeFileSync(new URL("./vectors.json", import.meta.url), JSON.stringify({ format: 1, cases: json }, null, 1) + "\n");
console.log("wrote", cases.length, "cases");
