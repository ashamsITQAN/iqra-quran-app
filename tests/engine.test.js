// The gate of the feedback engine: on every published case that carries heads, every number must match within the file's
// tolerance and every flag exactly, at every set the case carries. A failure is a fault in the engine, never in the vectors.
const fs = require("fs"), path = require("path"), engine = require("../public/engine.js");
const dir = path.join(__dirname, "fixtures", "engine-vectors"), index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const head = (h) => ({ frames: h.frames, classes: h.classes, values: new Float32Array(Uint8Array.from(Buffer.from(h.float32le_base64, "base64")).buffer) });
let bad = 0, checked = 0, numbers = 0; const fails = [];
const fail = (id, what) => { bad += 1; if (fails.length < 40) fails.push(id + ": " + what); };
const near = (id, what, got, want, tol) => { numbers += 1; if (want === null || got === null) { if (want !== got) fail(id, `${what}: got ${got}, want ${want}`); } else if (!(Math.abs(got - want) <= tol)) fail(id, `${what}: got ${got}, want ${want}`); };
const same = (id, what, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(id, `${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
for (const f of index.files) {
  const file = JSON.parse(fs.readFileSync(path.join(dir, f.calibration_sha256 + ".json"), "utf8")), tol = file.tolerance, byId = new Map(file.cases.map((c) => [c.id, c]));
  for (const c of file.cases) {
    const src = c.heads ? c : c.heads_from ? byId.get(c.heads_from) : null; if (!src || !src.heads) continue;
    const cal = JSON.parse(file.calibration);
    Object.entries(c.calibration_changes || {}).forEach(([p, v]) => { const ks = p.split("."); let o = cal; ks.slice(0, -1).forEach((k) => { o = o[k]; }); o[ks[ks.length - 1]] = v; });
    const heads = {}; Object.entries(src.heads).forEach(([k, h]) => { heads[k] = head(h); });
    const r = engine.run({ heads, calibration: cal, context: c.context, units: c.input.units, words: c.input.words, lengthening: c.input.lengthening, geminate: c.input.geminate, sets: file.presets.sites, lengthSets: file.presets.lengthening, optIn: c.opt_in });
    checked += 1; const id = c.id;
    same(id, "path", r.path, c.path); same(id, "path_word", r.path_word, c.path_word); same(id, "spans", r.spans, c.spans);
    if (r.sites.length !== c.sites.length) fail(id, `sites: ${r.sites.length} for ${c.sites.length}`);
    c.sites.forEach((w, k) => {
      const g = r.sites[k]; if (!g) return; same(id, `site ${w.i} window`, [g.i, g.window, g.word], [w.i, w.window, w.word]);
      same(id, `site ${w.i} classes`, Object.keys(g.classes).sort(), Object.keys(w.classes).sort());
      Object.entries(w.classes).forEach(([cls, x]) => { const y = g.classes[cls]; if (!y) return; same(id, `site ${w.i} ${cls} alternative`, y.alternative, x.alternative); near(id, `site ${w.i} ${cls} llr_log_probs`, y.llr_log_probs, x.llr_log_probs, tol.llr); near(id, `site ${w.i} ${cls} llr_inter1`, y.llr_inter1, x.llr_inter1, tol.llr); near(id, `site ${w.i} ${cls} fused`, y.fused, x.fused, tol.llr); });
      same(id, `site ${w.i} flagged`, g.flagged, w.flagged);
    });
    const must = {}; file.presets.sites.forEach((set) => { must[set] = r.sites.filter((s) => s.flagged[set].site_class).map((s) => [s.i, s.flagged[set].site_class]); });
    same(id, "must_flag", must, c.must_flag);
    const cw = c.words || []; if (r.words.length !== cw.length) fail(id, `words: ${r.words.length} for ${cw.length}`);
    cw.forEach((w, k) => { const g = r.words[k]; if (!g) return; near(id, `word ${w.word} fused`, g.fused, w.fused, tol.llr); same(id, `word ${w.word} class`, g.class, w.class); same(id, `word ${w.word} flagged`, g.flagged, w.flagged); });
    near(id, "short vowel median", r.madd.short_vowel_median_frames, c.madd.short_vowel_median_frames, tol.ratio);
    same(id, "madd items", r.madd.items.map((x) => [x.i, x.class, x.scoring, x.aared_at_stop, x.count, x.flagged]), c.madd.items.map((x) => [x.i, x.class, x.scoring, x.aared_at_stop, x.count, x.flagged]));
    c.madd.items.forEach((w, k) => { if (r.madd.items[k]) near(id, `madd ${w.i} ratio`, r.madd.items[k].ratio, w.ratio, tol.ratio); });
    same(id, "qalqalah", r.qalqalah.map((x) => [x.i, x.flagged]), c.qalqalah.map((x) => [x.i, x.flagged])); c.qalqalah.forEach((w, k) => { if (r.qalqalah[k]) near(id, `qalqalah ${w.i}`, r.qalqalah[k].p_burst, w.p_burst, tol.probability); });
    same(id, "gemination", r.gemination.map((x) => [x.i, x.flagged]), c.gemination.map((x) => [x.i, x.flagged])); c.gemination.forEach((w, k) => { if (r.gemination[k]) near(id, `gemination ${w.i}`, r.gemination[k].p_held, w.p_held, tol.probability); });
  }
}
// the windowed likelihood against a full forward on changed paths
{
  const f = index.files[0], file = JSON.parse(fs.readFileSync(path.join(dir, f.calibration_sha256 + ".json"), "utf8")), c = file.cases.find((x) => x.heads), h = head(c.heads.log_probs), H = Float64Array.from(h.values), P = c.path, lat = engine._lattice(H, h.frames, h.classes, P);
  [[0, 2], [3, 1], [P.length - 1, 1], [5, 2]].forEach(([i, k]) => engine._alternatives(P.slice(i, i + k)).forEach((alt) => { const S = P.slice(0, i).concat(alt.w, P.slice(i + k)), full = engine._lattice(H, h.frames, h.classes, S).ll, win = engine._llAlt(H, h.frames, h.classes, P, lat, i, k, alt.w); numbers += 1; if (!(Math.abs(full - win) < 1e-8)) fail("windowed", `at ${i}+${k} ${JSON.stringify(alt.w)}: ${win} for ${full}`); }));
}
console.log(`engine vectors: ${checked} cases, ${numbers} numbers compared, ${bad} mismatches`);
fails.forEach((x) => console.log("  " + x));
process.exit(bad ? 1 : 0);
