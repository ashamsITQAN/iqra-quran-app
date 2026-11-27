/* The feedback engine, as Quran Lab documents it (https://sdk.quranlab.ai/docs/engine): the one computation the model's
   thresholds were fitted for. It reads the heads of a whole take, once the take has ended, with the thresholds of the
   loaded model's calibration and the expected units of the ayah, and gives, per place, what the model heard against
   what the ayah has. No number here is a threshold: every cut comes from the calibration passed in.
   Token ids: blank 0, word bar 1, consonants 2..29, ikhfa nasal 30, short vowels 31..33, long vowels 34..36. */
(function (root) {
  "use strict";
  const NEG = -Infinity, BLANK = 0, BAR = 1;
  const lae = (a, b) => (a === NEG ? b : b === NEG ? a : a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));
  const isCons = (u) => u >= 2 && u <= 29, isVowel = (u) => u >= 31 && u <= 36, isLong = (u) => u >= 34 && u <= 36, isShort = (u) => u >= 31 && u <= 33;
  const clip = (x, c) => (Number.isNaN(x) ? -30 : Math.max(c[0], Math.min(c[1], x)));

  // Forward and backward variables of the path on one CTC head (frames x classes, log-probabilities, row by row).
  function lattice(H, T, C, P) {
    const n = P.length, S = 2 * n + 1, sym = new Int32Array(S); for (let i = 0; i < n; i++) sym[2 * i + 1] = P[i];
    const al = new Float64Array(T * S).fill(NEG), be = new Float64Array(T * S).fill(NEG);
    al[0] = H[BLANK]; if (n) al[1] = H[P[0]];
    for (let t = 1; t < T; t++) {
      const o = t * S, p = o - S, h = t * C;
      for (let s = 0; s < S; s++) {
        let v = al[p + s]; if (s > 0) v = lae(v, al[p + s - 1]);
        if (s > 1 && sym[s] !== BLANK && sym[s] !== sym[s - 2]) v = lae(v, al[p + s - 2]);
        al[o + s] = v === NEG ? NEG : v + H[h + sym[s]];
      }
    }
    const L = (T - 1) * S; be[L + S - 1] = 0; if (S > 1) be[L + S - 2] = 0;
    for (let t = T - 2; t >= 0; t--) {
      const o = t * S, q = o + S, h = (t + 1) * C;
      for (let s = 0; s < S; s++) {
        let v = be[q + s] === NEG ? NEG : be[q + s] + H[h + sym[s]];
        if (s + 1 < S && be[q + s + 1] !== NEG) v = lae(v, be[q + s + 1] + H[h + sym[s + 1]]);
        if (s + 2 < S && sym[s + 2] !== BLANK && sym[s + 2] !== sym[s] && be[q + s + 2] !== NEG) v = lae(v, be[q + s + 2] + H[h + sym[s + 2]]);
        be[o + s] = v;
      }
    }
    const ll = S > 1 ? lae(al[L + S - 1], al[L + S - 2]) : al[L + S - 1];
    return { al, be, S, ll };
  }
  // The likelihood of the path with units [i, i+k) replaced by W: the forward variables before the window, a short forward
  // over the changed window on every frame, and the backward variables after it. Exact.
  function llAlt(H, T, C, P, lat, i, k, W) {
    const n = P.length, S = lat.S, al = lat.al, be = lat.be, m = W.length, J = 2 * m + 1, sym = new Int32Array(J);
    for (let j = 0; j < m; j++) sym[2 * j + 1] = W[j];
    const pre = i > 0 ? 2 * i - 1 : -1, prevU = i > 0 ? P[i - 1] : -1, q = i + k < n ? 2 * (i + k) + 1 : -1, nextU = q >= 0 ? P[i + k] : -1;
    let a = new Float64Array(J).fill(NEG), b = new Float64Array(J).fill(NEG), total = NEG;
    if (i === 0) { a[0] = H[BLANK]; if (m) a[1] = H[W[0]]; if (q >= 0 && m === 0) total = H[nextU] + be[q]; }   // the take may begin on the unit after an emptied window
    for (let t = 1; t < T; t++) {
      const h = t * C, inPrev = pre >= 0 ? al[(t - 1) * S + pre] : NEG;
      if (q >= 0) {   // what enters the first state after the window at this frame
        let e = a[J - 1];
        if (m) { if (W[m - 1] !== nextU) e = lae(e, a[J - 2]); } else if (pre >= 0 && prevU !== nextU) e = lae(e, inPrev);
        if (e !== NEG && be[t * S + q] !== NEG) total = lae(total, e + H[h + nextU] + be[t * S + q]);
      }
      for (let j = 0; j < J; j++) {
        let v = a[j]; if (j > 0) v = lae(v, a[j - 1]);
        if (j > 1 && sym[j] !== BLANK && sym[j] !== sym[j - 2]) v = lae(v, a[j - 2]);
        if (j === 0) v = lae(v, inPrev); else if (j === 1 && W[0] !== prevU) v = lae(v, inPrev);
        b[j] = v === NEG ? NEG : v + H[h + sym[j]];
      }
      const x = a; a = b; b = x;
    }
    if (q < 0) { total = a[J - 1]; if (m) total = lae(total, a[J - 2]); else if (pre >= 0) total = lae(total, al[(T - 1) * S + pre]); }
    return total;
  }
  // The alternatives of a window, in the documented order: per position every substitution within the group in ascending
  // id, then the deletion, then (a consonant or the nasal with no vowel after it inside the window) each vowel inserted.
  function alternatives(win) {
    const out = [];
    win.forEach((u, p) => {
      const v = isVowel(u), lo = v ? 31 : 2, hi = v ? 36 : 30;
      for (let x = lo; x <= hi; x++) {
        if (x === u) continue;
        const w = win.slice(); w[p] = x;
        out.push({ w, cls: v ? (Math.abs(x - u) === 3 ? (u < 34 ? "short_to_long" : "long_to_short") : "vowel_sub") : "cons_sub", edit: ["sub", p, x] });
      }
      const d = win.slice(); d.splice(p, 1); out.push({ w: d, cls: v ? "vowel_del" : "cons_del", edit: ["del", p] });
      if (!v && !(p + 1 < win.length && isVowel(win[p + 1]))) for (let x = 31; x <= 36; x++) { const w = win.slice(); w.splice(p + 1, 0, x); out.push({ w, cls: "vowel_ins", edit: ["ins", p + 1, x] }); }
    });
    return out;
  }
  const shows = (status, chosen) => status === "validated" || ((status === "experimental" || status === "unverified") && chosen);
  const f64 = (h) => (h.values instanceof Float64Array ? h.values : Float64Array.from(h.values));

  /* run({ heads, calibration, context, units, words, lengthening, geminate, sets, optIn })
     heads: { name: { frames, classes, values } }; calibration: the parsed calibration; units and words as model.reference
     gives them (word bars included); lengthening [{unit, class, scoring}] and geminate [unit] by position in the units
     without the word bars. Returns every value, with the flags of each set asked for. */
  function run(o) {
    const cx = o.calibration.contexts[o.context], chosen = new Set(o.optIn || []), order = o.calibration.classes;
    const P = [], pw = []; o.units.forEach((u, i) => { if (u !== BAR) { P.push(u); pw.push(o.words[i]); } });
    const n = P.length, hA = o.heads.log_probs, hB = o.heads.inter1_log_probs, T = hA.frames, C = hA.classes, A = f64(hA), B = Float64Array.from(hB.values);
    for (let t = 0; t < T; t++) { B[t * C + BLANK] = lae(B[t * C + BLANK], B[t * C + BAR]); B[t * C + BAR] = NEG; }   // the word bar folded into blank
    const LA = lattice(A, T, C, P), LB = lattice(B, T, C, P), fz = cx.fusion;
    const score = (i, k, alt) => {
      const a = llAlt(A, T, C, P, LA, i, k, alt.w) - LA.ll, b = llAlt(B, T, C, P, LB, i, k, alt.w) - LB.ll, w = fz.a[alt.cls] != null ? fz.a[alt.cls] : fz.a.default;
      return { llrA: clip(a, fz.clip), llrB: clip(b, fz.clip), fused: clip(w * a + (1 - w) * b, fz.clip) };
    };
    const siteSets = o.sets || ["strict"], sites = [];
    for (let i = 0; i < n; i++) {
      if (!isCons(P[i])) continue;
      const k = i + 1 < n && isVowel(P[i + 1]) ? 2 : 1, win = P.slice(i, i + k), classes = {};
      alternatives(win).forEach((alt) => { const s = score(i, k, alt), cur = classes[alt.cls]; if (!cur || s.fused > cur.fused) classes[alt.cls] = { alternative: alt.w, edit: alt.edit, llr_log_probs: s.llrA, llr_inter1: s.llrB, fused: s.fused }; });
      const flagged = {};
      siteSets.forEach((set) => {
        const list = order.filter((c) => classes[c] && cx.sites[c] && shows(cx.sites[c].status, chosen.has(c)) && classes[c].fused > cx.sites[c].thresholds[set]);
        let best = null; list.forEach((c) => { if (best === null || classes[c].fused > classes[best].fused) best = c; });
        flagged[set] = { classes: list, site_class: best };
      });
      sites.push({ i, window: win, word: pw[i], classes, flagged });
    }
    // the per-word readout
    const words = [];
    if (cx.word) {
      for (let i = 0; i < n; ) {
        let j = i; while (j < n && pw[j] === pw[i]) j++;
        let best = null;
        alternatives(P.slice(i, j)).forEach((alt) => { if (!alt.w.length) return; const s = score(i, j - i, alt); if (!best || s.fused > best.fused) best = { fused: s.fused, class: alt.cls, edit: alt.edit, alternative: alt.w }; });
        const flagged = {}; Object.keys(cx.word.presets).forEach((set) => { flagged[set] = !!best && shows(cx.word.status, chosen.has("word")) && best.fused >= Math.max(cx.word.presets[set].tau, cx.word.floor); });
        words.push(Object.assign({ word: pw[i], flagged }, best)); i = j;
      }
    }
    // the spans: the best path of the units on the timing head, one blank between words and at both ends
    const hT = o.heads.timing_log_probs, T2 = hT.frames, C2 = hT.classes, V = hT.values, st = [], unitState = new Int32Array(n);
    st.push(-1); for (let i = 0; i < n; i++) { if (i && pw[i] !== pw[i - 1]) st.push(-1); unitState[i] = st.length; st.push(i); } st.push(-1);
    const NS = st.length, em = (t, s) => V[t * C2 + (st[s] < 0 ? BLANK : P[st[s]])], back = new Int8Array(T2 * NS);
    let dp = new Float64Array(NS).fill(NEG), nx = new Float64Array(NS);
    dp[0] = em(0, 0); if (NS > 1) dp[1] = em(0, 1);
    for (let t = 1; t < T2; t++) {
      for (let s = 0; s < NS; s++) {
        let v = dp[s], b = 0;   // staying comes before moving, moving before jumping
        if (s > 0 && dp[s - 1] > v) { v = dp[s - 1]; b = 1; }
        if (s > 1 && st[s] >= 0 && st[s - 1] < 0 && dp[s - 2] > v) { v = dp[s - 2]; b = 2; }
        nx[s] = v === NEG ? NEG : v + em(t, s); back[t * NS + s] = b;
      }
      const x = dp; dp = nx; nx = x;
    }
    const first = new Int32Array(NS).fill(-1), last = new Int32Array(NS).fill(-1);
    let s = NS > 1 && dp[NS - 2] > dp[NS - 1] ? NS - 2 : NS - 1;   // of the two ends, the last blank wins a tie
    for (let t = T2 - 1; t >= 0; t--) { if (last[s] < 0) last[s] = t; first[s] = t; s -= back[t * NS + s]; }
    const spans = []; for (let i = 0; i < n; i++) spans.push([i, first[unitState[i]], last[unitState[i]] + 1]);
    const len = (i) => spans[i][2] - spans[i][1], lenSets = o.lengthSets || siteSets.filter((x) => x === "strict" || x === "balanced");
    // lengthening
    const shortLens = []; for (let i = 0; i < n; i++) if (isShort(P[i])) shortLens.push(len(i)); shortLens.sort((a, b) => a - b);
    const med = shortLens.length ? (shortLens.length % 2 ? shortLens[(shortLens.length - 1) / 2] : (shortLens[shortLens.length / 2 - 1] + shortLens[shortLens.length / 2]) / 2) : null;
    const entry = new Map(); (o.lengthening || []).forEach((e) => entry.set(e.unit, e));
    const madd = { short_vowel_median_frames: med, items: [] }, M = cx.madd;
    for (let i = 0; i < n; i++) {
      if (!isLong(P[i])) continue;
      let e = entry.get(i), cls = e ? e.class : null, scoring = e ? e.scoring : null, aared = false;
      if (i === n - 2 && isCons(P[n - 1]) && (!e || cls === "fixed2")) { cls = "free"; scoring = [2, 4, 6]; aared = true; }   // the last word is read with its stop
      if (!cls) continue;
      const ok = M && shortLens.length >= M.min_short_vowels && med > 0, ratio = ok ? len(i) / med : null, count = {}, flagged = {};
      lenSets.forEach((set) => {
        if (!ok) { count[set] = null; flagged[set] = false; return; }
        const pc = M.preset_cuts && M.preset_cuts[set] && M.preset_cuts[set][cls], cuts = pc || M.cuts[cls] || (M.preset_cuts && M.preset_cuts[set] && M.preset_cuts[set].free) || M.cuts.free;
        const c24 = cuts["2|4"], c46 = cuts["4|6"] > c24 ? cuts["4|6"] : c24, cnt = ratio < c24 ? 2 : ratio < c46 ? 4 : 6;
        let show = shows(M.status, chosen.has("madd")); if (cls === "lazim") show = show && shows((M.cuts.lazim || {}).status, chosen.has("lazim"));
        count[set] = cnt; flagged[set] = show && !scoring.includes(cnt);
      });
      madd.items.push({ i, class: cls, scoring, aared_at_stop: aared, ratio, count, flagged });
    }
    // qalqalah: the burst after a qalqalah letter with no vowel after it
    const qal = [], hQ = o.heads.attr_qalqalah, Q = cx.qalqalah;
    if (hQ && Q) for (let i = 0; i < n; i++) {
      if (![3, 6, 9, 17, 22].includes(P[i]) || (i + 1 < n && isVowel(P[i + 1]))) continue;
      const e = spans[i][2], a = e + 2, b = Math.min(hQ.frames, e + 14); let p = null;
      if (a < hQ.frames) { let sum = 0; for (let f = a; f < b; f++) sum += hQ.values[f * hQ.classes + 1] + hQ.values[f * hQ.classes + 2]; p = sum / (b - a); }
      const flagged = {}; lenSets.forEach((set) => { const tau = Q.preset_tau && Q.preset_tau[set] != null ? Q.preset_tau[set] : Q.tau; flagged[set] = p !== null && shows(Q.status, chosen.has("qalqalah")) && p < tau; });
      qal.push({ i, p_burst: p, flagged });
    }
    // gemination: a geminate letter held
    const gem = [], hG = o.heads.gem, G = cx.gemination;
    if (hG && G) (o.geminate || []).forEach((i) => {
      const a = spans[i][1], b = Math.max(spans[i][2], a + 1); let sum = 0; for (let f = a; f < b; f++) sum += hG.values[f * hG.classes + 1];
      const p = sum / (b - a), flagged = {}; lenSets.forEach((set) => { const tau = G.preset_tau && G.preset_tau[set] != null ? G.preset_tau[set] : G.tau; flagged[set] = shows(G.status, chosen.has("gemination")) && p < tau; });
      gem.push({ i, p_held: p, flagged });
    });
    return { path: P, path_word: pw, sites, words, spans, madd, qalqalah: qal, gemination: gem, ll: { log_probs: LA.ll, inter1: LB.ll } };
  }
  const api = { run, _lattice: lattice, _llAlt: llAlt, _alternatives: alternatives };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.TajweedEngine = api;
})(typeof self !== "undefined" ? self : this);
