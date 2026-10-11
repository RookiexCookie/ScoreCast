/* Dataset: load, validate, summarise and split the exam-score data. */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});

  const NUMERIC = ['study_hours', 'class_attendance', 'sleep_hours', 'age', 'exam_score'];
  const CATEGORICAL = ['sleep_quality', 'study_method', 'facility_rating', 'gender', 'course', 'internet_access', 'exam_difficulty'];
  const REQUIRED = NUMERIC.concat(CATEGORICAL);
  // Logical level order. Must match tools/build_data.py.
  const ORDER = {
    sleep_quality: ['poor', 'average', 'good'],
    study_method: ['self-study', 'online videos', 'group study', 'mixed', 'coaching'],
    facility_rating: ['low', 'medium', 'high'],
    internet_access: ['no', 'yes'],
    exam_difficulty: ['easy', 'moderate', 'hard'],
  };

  /** Deterministic PRNG. Never use Math.random() for modelling. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function range(n) {
    const out = new Int32Array(n);
    for (let i = 0; i < n; i++) out[i] = i;
    return out;
  }

  /** Columnar raw object (window.EXAM_DATA shape) -> typed dataset. */
  function load(raw) {
    const cols = {};
    NUMERIC.forEach((c) => { cols[c] = Float64Array.from(raw.columns[c]); });
    CATEGORICAL.forEach((c) => { cols[c] = Uint8Array.from(raw.columns[c]); });
    return { n: raw.rows, cols, levels: raw.levels, source: raw.source || 'dataset' };
  }

  /** Parse a CSV with the same schema into the raw columnar shape. Throws readable errors. */
  function parseCSV(text, name) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) throw new Error('The file has no data rows.');
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const missing = REQUIRED.filter((c) => header.indexOf(c) === -1);
    if (missing.length) throw new Error('Missing columns: ' + missing.join(', '));
    const pos = {};
    REQUIRED.forEach((c) => { pos[c] = header.indexOf(c); });

    const values = {};
    REQUIRED.forEach((c) => { values[c] = []; });
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      for (const c of NUMERIC) {
        const v = Number(parts[pos[c]]);
        if (parts[pos[c]] === '' || !Number.isFinite(v)) throw new Error(`Row ${i + 1}: "${c}" is not a number.`);
        values[c].push(v);
      }
      for (const c of CATEGORICAL) {
        const v = (parts[pos[c]] || '').toLowerCase();
        if (!v) throw new Error(`Row ${i + 1}: "${c}" is empty.`);
        values[c].push(v);
      }
    }
    if (values.exam_score.length < 200) throw new Error('At least 200 rows are needed to train and test the models.');

    const levels = {};
    const columns = {};
    NUMERIC.forEach((c) => { columns[c] = values[c]; });
    CATEGORICAL.forEach((c) => {
      const seen = Array.from(new Set(values[c])).sort();
      if (ORDER[c]) {
        const unknown = seen.filter((l) => ORDER[c].indexOf(l) === -1);
        if (unknown.length) throw new Error(`Unknown values in "${c}": ${unknown.join(', ')}`);
        levels[c] = ORDER[c].slice();
      } else {
        if (seen.length > 255) throw new Error(`Too many distinct values in "${c}".`);
        levels[c] = seen;
      }
      const idx = {};
      levels[c].forEach((l, k) => { idx[l] = k; });
      columns[c] = values[c].map((v) => idx[v]);
    });
    return { source: name || 'uploaded.csv', rows: values.exam_score.length, columns, levels };
  }

  function quantileSorted(sorted, p) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /** Summary statistics. `rows` is an optional subset of row indices. */
  function summary(ds, rows) {
    const idx = rows || range(ds.n);
    const m = idx.length;
    const out = { n: m, numeric: {}, categorical: {} };
    NUMERIC.forEach((c) => {
      const col = ds.cols[c];
      const v = new Float64Array(m);
      let s = 0;
      for (let i = 0; i < m; i++) { v[i] = col[idx[i]]; s += v[i]; }
      const mean = m ? s / m : NaN;
      let ss = 0;
      for (let i = 0; i < m; i++) ss += (v[i] - mean) * (v[i] - mean);
      v.sort();
      out.numeric[c] = {
        mean, sd: m ? Math.sqrt(ss / m) : NaN, min: v[0], max: v[m - 1],
        q1: quantileSorted(v, 0.25), median: quantileSorted(v, 0.5), q3: quantileSorted(v, 0.75),
      };
    });
    const y = ds.cols.exam_score;
    CATEGORICAL.forEach((c) => {
      const col = ds.cols[c];
      const L = ds.levels[c].length;
      const cnt = new Float64Array(L), sum = new Float64Array(L), sq = new Float64Array(L);
      for (let i = 0; i < m; i++) {
        const r = idx[i]; const k = col[r];
        cnt[k]++; sum[k] += y[r]; sq[k] += y[r] * y[r];
      }
      out.categorical[c] = ds.levels[c].map((level, k) => {
        const n = cnt[k];
        const mean = n ? sum[k] / n : NaN;
        const sd = n > 1 ? Math.sqrt(Math.max(0, (sq[k] - n * mean * mean) / (n - 1))) : 0;
        return { level, n, mean, sd };
      });
    });
    return out;
  }

  /** Deterministic train/test split. */
  function split(n, seed = 42, testFraction = 0.2) {
    const idx = shuffleInPlace(range(n), mulberry32(seed));
    const testN = Math.round(n * testFraction);
    return { test: idx.slice(0, testN), train: idx.slice(testN) };
  }

  function pearson(x, y) {
    const n = x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    return sxy / Math.sqrt(sxx * syy);
  }

  /** Simple least-squares line y = a + b·x. */
  function linfit(x, y) {
    const n = x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b };
  }

  /** Cache key for trained models: rows + sum(exam_score). */
  function hash(ds) {
    let s = 0;
    const y = ds.cols.exam_score;
    for (let i = 0; i < y.length; i++) s += y[i];
    const str = ds.n + ':' + s.toFixed(3);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  S.Dataset = { NUMERIC, CATEGORICAL, ORDER, mulberry32, shuffleInPlace, range, load, parseCSV, quantileSorted, summary, split, pearson, linfit, hash };
})();
