/* Models: mean baseline, OLS, gradient-boosted trees, metrics, permutation importance.
   Everything is trained in the browser on the seeded train split and scored on the test split. */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const D = S.Dataset;

  const PREDICTORS = { num: ['study_hours', 'class_attendance', 'sleep_hours'], cat: ['sleep_quality', 'study_method', 'facility_rating'] };
  const CONTEXT = { num: ['age'], cat: ['gender', 'course', 'internet_access', 'exam_difficulty'] };
  const PREDICTOR_COLS = PREDICTORS.num.concat(PREDICTORS.cat);

  const rowSrc = (ds, r) => (col) => ds.cols[col][r];
  const clampScore = (v) => Math.min(100, Math.max(0, v));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /* ---------- OLS ---------- */

  function buildSpec(levels, num, cat) {
    const spec = [];
    num.forEach((col) => spec.push({ kind: 'num', col }));
    cat.forEach((col) => levels[col].forEach((level, code) => {
      if (code > 0) spec.push({ kind: 'cat', col, code, level });
    }));
    return spec;
  }

  function encodeInto(spec, src, x) {
    x[0] = 1;
    for (let j = 0; j < spec.length; j++) {
      const s = spec[j];
      x[j + 1] = s.kind === 'num' ? src(s.col) : (src(s.col) === s.code ? 1 : 0);
    }
  }

  /** Gaussian elimination with partial pivoting. A is k×k (flat), b is length k. */
  function solve(A, b, k) {
    const M = [];
    for (let i = 0; i < k; i++) {
      const row = new Float64Array(k + 1);
      for (let j = 0; j < k; j++) row[j] = A[i * k + j];
      row[k] = b[i];
      M.push(row);
    }
    for (let c = 0; c < k; c++) {
      let p = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
      const piv = M[c][c];
      if (Math.abs(piv) < 1e-12) throw new Error('Singular design matrix');
      for (let r = 0; r < k; r++) {
        if (r === c) continue;
        const f = M[r][c] / piv;
        if (f === 0) continue;
        for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
      }
    }
    const out = new Array(k);
    for (let i = 0; i < k; i++) out[i] = M[i][k] / M[i][i];
    return out;
  }

  function fitMean(ds, rows) {
    const y = ds.cols.exam_score;
    let s = 0;
    for (let i = 0; i < rows.length; i++) s += y[rows[i]];
    return { type: 'mean', value: s / rows.length };
  }

  function fitOLS(ds, rows, num, cat, ridge = 1e-6) {
    const spec = buildSpec(ds.levels, num, cat);
    const k = spec.length + 1;
    const XtX = new Float64Array(k * k), Xty = new Float64Array(k), x = new Float64Array(k);
    const y = ds.cols.exam_score;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      encodeInto(spec, rowSrc(ds, r), x);
      const t = y[r];
      for (let a = 0; a < k; a++) {
        const xa = x[a];
        if (xa === 0) continue;
        Xty[a] += xa * t;
        for (let b = a; b < k; b++) XtX[a * k + b] += xa * x[b];
      }
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a * k + b] = XtX[b * k + a];
    for (let a = 1; a < k; a++) XtX[a * k + a] += ridge;
    const beta = solve(XtX, Xty, k);

    // Population reference values (train split) used for exact explanations.
    const means = {}, props = {};
    num.forEach((col) => {
      let s = 0; const c = ds.cols[col];
      for (let i = 0; i < rows.length; i++) s += c[rows[i]];
      means[col] = s / rows.length;
    });
    cat.forEach((col) => {
      const p = new Array(ds.levels[col].length).fill(0); const c = ds.cols[col];
      for (let i = 0; i < rows.length; i++) p[c[rows[i]]]++;
      props[col] = p.map((v) => v / rows.length);
    });
    return { type: 'ols', spec, beta, num, cat, means, props };
  }

  function predictOLS(m, src) {
    let s = m.beta[0];
    for (let j = 0; j < m.spec.length; j++) {
      const sp = m.spec[j];
      const v = sp.kind === 'num' ? src(sp.col) : (src(sp.col) === sp.code ? 1 : 0);
      s += m.beta[j + 1] * v;
    }
    return s;
  }

  /* ---------- Gradient-boosted trees (histogram splits) ---------- */

  function binOf(f, x) {
    if (f.kind === 'cat') return f.rank[x];
    const e = f.edges;
    let lo = 0, hi = e.length; // number of edges strictly below x
    while (lo < hi) { const mid = (lo + hi) >> 1; if (e[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  async function fitGBT(ds, rows, opts, onProgress, isCancelled) {
    const o = Object.assign({ rounds: 150, lr: 0.1, depth: 3, minLeaf: 40, bins: 32 }, opts || {});
    const y = ds.cols.exam_score;
    const m = rows.length;
    const target = Float64Array.from(rows, (r) => y[r]);

    const feats = [];
    PREDICTORS.num.forEach((col) => {
      const v = Float64Array.from(rows, (r) => ds.cols[col][r]).sort();
      const edges = [];
      for (let k = 1; k < o.bins; k++) {
        const e = D.quantileSorted(v, k / o.bins);
        if (!edges.length || e > edges[edges.length - 1]) edges.push(e);
      }
      feats.push({ kind: 'num', col, edges });
    });
    PREDICTORS.cat.forEach((col) => {
      // Order levels by mean target so binary splits on the rank are optimal for squared error.
      const L = ds.levels[col].length; const sum = new Float64Array(L), cnt = new Float64Array(L);
      for (let i = 0; i < m; i++) { const k = ds.cols[col][rows[i]]; sum[k] += target[i]; cnt[k]++; }
      const order = Array.from({ length: L }, (_, k) => k).sort((a, b) => (sum[a] / (cnt[a] || 1)) - (sum[b] / (cnt[b] || 1)));
      const rank = new Array(L);
      order.forEach((code, pos) => { rank[code] = pos; });
      feats.push({ kind: 'cat', col, rank });
    });

    const F = feats.length;
    const B = feats.map((f) => { const a = new Uint8Array(m); for (let i = 0; i < m; i++) a[i] = binOf(f, ds.cols[f.col][rows[i]]); return a; });
    const nb = feats.map((f) => (f.kind === 'num' ? f.edges.length + 1 : f.rank.length));

    let base = 0;
    for (let i = 0; i < m; i++) base += target[i];
    base /= m;
    const pred = new Float64Array(m).fill(base);
    const res = new Float64Array(m);
    const trees = [];

    function leaf(idx, mean) {
      const val = mean * o.lr;
      for (let i = 0; i < idx.length; i++) pred[idx[i]] += val;
      return { v: val };
    }

    function grow(idx, d) {
      const n = idx.length;
      let S0 = 0;
      for (let i = 0; i < n; i++) S0 += res[idx[i]];
      if (d >= o.depth || n < 2 * o.minLeaf) return leaf(idx, S0 / n);
      const parent = (S0 * S0) / n;
      let best = null;
      for (let f = 0; f < F; f++) {
        const hs = new Float64Array(nb[f]), hc = new Int32Array(nb[f]); const b = B[f];
        for (let i = 0; i < n; i++) { const r = idx[i]; hs[b[r]] += res[r]; hc[b[r]]++; }
        let sl = 0, cl = 0;
        for (let k = 0; k < nb[f] - 1; k++) {
          sl += hs[k]; cl += hc[k];
          const cr = n - cl;
          if (cl < o.minLeaf) continue;
          if (cr < o.minLeaf) break;
          const sr = S0 - sl;
          const gain = (sl * sl) / cl + (sr * sr) / cr - parent;
          if (!best || gain > best.gain) best = { f, k, gain };
        }
      }
      if (!best || best.gain <= 1e-9) return leaf(idx, S0 / n);
      const b = B[best.f];
      let nl = 0;
      for (let i = 0; i < n; i++) if (b[idx[i]] <= best.k) nl++;
      const L = new Int32Array(nl), R = new Int32Array(n - nl);
      let li = 0, ri = 0;
      for (let i = 0; i < n; i++) { const r = idx[i]; if (b[r] <= best.k) L[li++] = r; else R[ri++] = r; }
      return { f: best.f, t: best.k, l: grow(L, d + 1), r: grow(R, d + 1) };
    }

    const all = D.range(m);
    for (let t = 0; t < o.rounds; t++) {
      if (isCancelled && isCancelled()) return null;
      for (let i = 0; i < m; i++) res[i] = target[i] - pred[i];
      trees.push(grow(all, 0));
      if (t % 3 === 2 || t === o.rounds - 1) {
        if (onProgress) onProgress(((t + 1) / o.rounds) * 0.85);
        await tick();
      }
    }
    return { type: 'gbt', feats, base, trees, params: o };
  }

  function predictGBT(m, src) {
    const bins = m.feats.map((f) => binOf(f, src(f.col)));
    let s = m.base;
    for (let t = 0; t < m.trees.length; t++) {
      let node = m.trees[t];
      while (node.v === undefined) node = bins[node.f] <= node.t ? node.l : node.r;
      s += node.v;
    }
    return s;
  }

  /* ---------- Shared ---------- */

  function predict(model, src) {
    if (model.type === 'mean') return model.value;
    if (model.type === 'ols') return predictOLS(model, src);
    return predictGBT(model, src);
  }

  function evaluate(model, ds, rows) {
    const y = ds.cols.exam_score;
    const n = rows.length;
    const res = new Float64Array(n);
    let ae = 0, se = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      const e = y[r] - clampScore(predict(model, rowSrc(ds, r)));
      res[i] = e; ae += Math.abs(e); se += e * e; sy += y[r];
    }
    const my = sy / n;
    let st = 0;
    for (let i = 0; i < n; i++) st += (y[rows[i]] - my) ** 2;
    res.sort();
    return {
      metrics: { mae: ae / n, rmse: Math.sqrt(se / n), r2: 1 - se / st, n },
      residuals: Array.from(res, (v) => Math.round(v * 1000) / 1000),
    };
  }

  function rmseWith(model, ds, rows, col, perm) {
    const y = ds.cols.exam_score;
    let se = 0;
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      const pr = perm ? perm[j] : r;
      const src = (c) => (c === col ? ds.cols[c][pr] : ds.cols[c][r]);
      const e = y[r] - clampScore(predict(model, src));
      se += e * e;
    }
    return Math.sqrt(se / rows.length);
  }

  /** RMSE increase when each predictor is shuffled in the test set (seeded, averaged). */
  async function permutationImportance(model, ds, rows, seed = 7, repeats = 3) {
    const base = rmseWith(model, ds, rows, null, null);
    const out = [];
    for (let c = 0; c < PREDICTOR_COLS.length; c++) {
      const col = PREDICTOR_COLS[c];
      const rng = D.mulberry32(seed + c * 101);
      let inc = 0;
      for (let k = 0; k < repeats; k++) {
        const perm = D.shuffleInPlace(Int32Array.from(rows), rng);
        inc += rmseWith(model, ds, rows, col, perm) - base;
      }
      out.push({ col, value: inc / repeats });
      if (model.type === 'gbt') await tick();
    }
    return out;
  }

  /** Synchronous variant for the fast models. */
  function permutationImportanceSync(model, ds, rows, seed = 7, repeats = 3) {
    const base = rmseWith(model, ds, rows, null, null);
    return PREDICTOR_COLS.map((col, c) => {
      const rng = D.mulberry32(seed + c * 101);
      let inc = 0;
      for (let k = 0; k < repeats; k++) {
        const perm = D.shuffleInPlace(Int32Array.from(rows), rng);
        inc += rmseWith(model, ds, rows, col, perm) - base;
      }
      return { col, value: inc / repeats };
    });
  }

  function trainFast(ds, split) {
    const baseline = fitMean(ds, split.train);
    const ols = fitOLS(ds, split.train, PREDICTORS.num, PREDICTORS.cat);
    const olsAll = fitOLS(ds, split.train, PREDICTORS.num.concat(CONTEXT.num), PREDICTORS.cat.concat(CONTEXT.cat));
    const eB = evaluate(baseline, ds, split.test);
    const eO = evaluate(ols, ds, split.test);
    const eA = evaluate(olsAll, ds, split.test);
    return {
      models: { baseline, ols, ols_all: olsAll },
      metrics: { baseline: eB.metrics, ols: eO.metrics, ols_all: eA.metrics },
      residuals: { ols: eO.residuals },
      importance: { ols: permutationImportanceSync(ols, ds, split.test) },
    };
  }

  async function trainGBT(ds, split, onProgress, isCancelled) {
    const model = await fitGBT(ds, split.train, null, onProgress, isCancelled);
    if (!model) return null;
    const ev = evaluate(model, ds, split.test);
    if (onProgress) onProgress(0.9);
    await tick();
    const importance = await permutationImportance(model, ds, split.test);
    if (isCancelled && isCancelled()) return null;
    if (onProgress) onProgress(1);
    return { model, metrics: ev.metrics, residuals: ev.residuals, importance };
  }

  /** Serve OLS (exactly explainable) unless GBT is clearly better. */
  function decideServing(metrics) {
    const o = metrics.ols, g = metrics.gbt;
    if (!g) return { id: 'ols', reason: 'Chosen for exact explanations. Gradient boosting is still training.' };
    const diff = o.rmse - g.rmse;
    if (diff > 0.5) return { id: 'gbt', reason: `Gradient boosting lowers test RMSE by ${diff.toFixed(2)} (more than the 0.5 threshold), so it is served.` };
    const verb = diff > 0 ? `only ${diff.toFixed(2)} lower` : `${Math.abs(diff).toFixed(2)} higher`;
    return { id: 'ols', reason: `Chosen for exact explanations. Gradient boosting's test RMSE was ${verb}, within the 0.5 threshold.` };
  }

  S.Models = {
    PREDICTORS, CONTEXT, PREDICTOR_COLS, clampScore, rowSrc,
    fitMean, fitOLS, fitGBT, predict, evaluate, trainFast, trainGBT, decideServing,
  };
})();
