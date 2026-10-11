/* Predictor: the only API the views use. Swap this file to point at a backend later. */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const M = S.Models;
  const D = S.Dataset;

  const FIELDS = {
    study_hours: { label: 'Daily study hours', short: 'Study', unit: 'h', step: 0.1, kind: 'num' },
    class_attendance: { label: 'Class attendance', short: 'Attendance', unit: '%', step: 0.5, kind: 'num' },
    sleep_hours: { label: 'Sleep hours', short: 'Sleep', unit: 'h', step: 0.1, kind: 'num' },
    sleep_quality: { label: 'Sleep quality', short: 'Sleep quality', kind: 'cat' },
    study_method: { label: 'Study method', short: 'Method', kind: 'cat' },
    facility_rating: { label: 'Facility rating', short: 'Facility', kind: 'cat' },
  };
  const NUM_FIELDS = ['study_hours', 'class_attendance', 'sleep_hours'];
  const CAT_FIELDS = ['sleep_quality', 'study_method', 'facility_rating'];
  const INPUT_FIELDS = NUM_FIELDS.concat(CAT_FIELDS);

  const LEVEL_LABELS = {
    'self-study': 'Self-study', 'online videos': 'Online videos', 'group study': 'Group study',
    'b.com': 'B.Com', 'b.sc': 'B.Sc', 'b.tech': 'B.Tech', ba: 'BA', bba: 'BBA', bca: 'BCA',
  };
  const levelLabel = (l) => LEVEL_LABELS[l] || (String(l).charAt(0).toUpperCase() + String(l).slice(1));

  const DEFAULT_BANDS = [
    { letter: 'A', min: 85, label: 'Excellent' },
    { letter: 'B', min: 70, label: 'Good' },
    { letter: 'C', min: 55, label: 'Satisfactory' },
    { letter: 'D', min: 40, label: 'Pass' },
    { letter: 'E', min: 0, label: 'Below pass' },
  ];

  const st = () => S.state;
  const round1 = (v) => Math.round(v * 10) / 10;
  const roundStep = (v, step) => Math.round(v / step) * step;

  /** Valid input ranges = the observed range of the dataset (rounded outward). */
  function computeRanges(summary) {
    const out = {};
    NUM_FIELDS.forEach((col) => {
      const s = summary.numeric[col];
      let max = Math.ceil(s.max);
      if (col === 'class_attendance') max = Math.min(100, max);
      out[col] = { min: Math.floor(s.min), max };
    });
    return out;
  }

  function srcFor(input) {
    const lv = st().ds.levels;
    return (col) => (FIELDS[col] && FIELDS[col].kind === 'cat' ? lv[col].indexOf(input[col]) : input[col]);
  }

  function servingModel() { return st().models[st().serving.id]; }

  function predictRaw(input) { return M.predict(servingModel(), srcFor(input)); }

  function predict(input) { return round1(M.clampScore(predictRaw(input))); }

  function interval(input, level = 0.8) {
    const res = st().residuals[st().serving.id];
    const p = M.clampScore(predictRaw(input));
    const a = (1 - level) / 2;
    return {
      lo: round1(M.clampScore(p + D.quantileSorted(res, a))),
      hi: round1(M.clampScore(p + D.quantileSorted(res, 1 - a))),
      level,
    };
  }

  /** % of dataset scores strictly below `score`. */
  function percentile(score) {
    const s = st().sortedScores;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < score) lo = mid + 1; else hi = mid; }
    return (lo / s.length) * 100;
  }

  /** Exact OLS decomposition: base (average student) + contributions = prediction (before clamping). */
  function explain(input) {
    const m = st().models.ols;
    const lv = st().ds.levels;
    const betaFor = {};
    m.spec.forEach((sp, j) => { betaFor[sp.col + '|' + (sp.kind === 'num' ? '' : sp.code)] = m.beta[j + 1]; });
    let base = m.beta[0];
    const rows = [];
    m.num.forEach((col) => {
      const b = betaFor[col + '|'];
      base += b * m.means[col];
      rows.push({ feature: col, label: FIELDS[col].short, value: input[col], contribution: b * (input[col] - m.means[col]) });
    });
    m.cat.forEach((col) => {
      const betas = lv[col].map((_, code) => (code === 0 ? 0 : betaFor[col + '|' + code]));
      const avg = betas.reduce((acc, b, code) => acc + b * m.props[col][code], 0);
      base += avg;
      const code = lv[col].indexOf(input[col]);
      rows.push({ feature: col, label: FIELDS[col].label, value: input[col], contribution: betas[code] - avg });
    });
    const total = rows.reduce((a, r) => a + r.contribution, base);
    console.assert(Math.abs(total - M.predict(m, srcFor(input))) < 1e-6, 'explain(): contributions do not sum to prediction');
    rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return { base, rows, total };
  }

  /** Change in predicted score when `feature` moves by `delta` (numeric) or to level `delta` (categorical). */
  function lever(input, feature, delta) {
    const next = Object.assign({}, input);
    if (FIELDS[feature].kind === 'num') {
      const r = st().ranges[feature];
      next[feature] = Math.min(r.max, Math.max(r.min, input[feature] + delta));
    } else {
      next[feature] = delta;
    }
    return M.clampScore(predictRaw(next)) - M.clampScore(predictRaw(input));
  }

  function bands() {
    const saved = S.storage.getBands();
    if (!saved || !Array.isArray(saved) || saved.length !== DEFAULT_BANDS.length) return DEFAULT_BANDS.map((b) => Object.assign({}, b));
    return DEFAULT_BANDS.map((b, i) => Object.assign({}, b, { min: Number(saved[i].min) }));
  }

  function grade(score) {
    const b = bands().find((x) => score >= x.min) || DEFAULT_BANDS[DEFAULT_BANDS.length - 1];
    return { letter: b.letter, label: b.label };
  }

  function validate(input) {
    const errors = {};
    NUM_FIELDS.forEach((col) => {
      const v = input[col];
      const r = st().ranges[col];
      if (typeof v !== 'number' || !Number.isFinite(v)) errors[col] = 'Enter a number.';
      else if (v < r.min || v > r.max) errors[col] = `Enter a value between ${r.min} and ${r.max}.`;
    });
    CAT_FIELDS.forEach((col) => {
      if (st().ds.levels[col].indexOf(input[col]) === -1) errors[col] = 'Choose an option.';
    });
    return { ok: Object.keys(errors).length === 0, errors };
  }

  /** Median student: numeric medians (rounded to step) and categorical modes. */
  function defaults() {
    const sum = st().summary;
    const out = {};
    NUM_FIELDS.forEach((col) => { out[col] = round1(roundStep(sum.numeric[col].median, FIELDS[col].step)); });
    CAT_FIELDS.forEach((col) => {
      const g = sum.categorical[col].slice().sort((a, b) => b.n - a.n)[0];
      out[col] = g.level;
    });
    return out;
  }

  function formatValue(col, v) {
    const f = FIELDS[col];
    if (f.kind === 'cat') return levelLabel(v);
    return Number(v).toFixed(1) + (f.unit === '%' ? '%' : ' ' + f.unit);
  }

  S.predictor = {
    FIELDS, NUM_FIELDS, CAT_FIELDS, INPUT_FIELDS, DEFAULT_BANDS,
    levelLabel, computeRanges, formatValue, defaults, bands,
    predict, interval, percentile, explain, lever, grade, validate,
  };
})();
