/* Main Application Orchestrator: state management, bootstrap, router, theme, toast notifications */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});

  // Common UI helpers
  S.ui = {
    esc(s) {
      if (s == null) return '';
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    },
    signed(v) {
      if (!Number.isFinite(v)) return '0.0';
      const r = Math.round(v * 10) / 10;
      return (r >= 0 ? '+' : '') + r.toFixed(1);
    },
    toast(msg) {
      const region = document.querySelector('#toast-region');
      if (!region) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = msg;
      region.appendChild(el);
      setTimeout(() => {
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 250);
      }, 2600);
    }
  };

  // Global State
  S.state = {
    ds: null,
    summary: null,
    ranges: null,
    split: null,
    models: {},
    metrics: {},
    residuals: {},
    importance: {},
    serving: { id: 'ols', reason: 'Linear regression' },
    sortedScores: null,
    scoreBins50: null
  };

  let isGbtTraining = false;

  async function boot() {
    initTheme();
    setupNavigation();

    if (!window.EXAM_DATA) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center;color:red;">Error: js/data.js failed to load. Run <code>python tools/build_data.py</code> first.</div>';
      return;
    }

    await trainOrLoadModels();
    setupRouter();
  }

  async function trainOrLoadModels() {
    const ds = S.Dataset.load(window.EXAM_DATA);
    S.state.ds = ds;
    const sum = S.Dataset.summary(ds);
    S.state.summary = sum;
    S.state.ranges = S.predictor.computeRanges(sum);

    // Precompute sorted scores and 50 bins for population strip
    const scores = Float64Array.from(ds.cols.exam_score).sort();
    S.state.sortedScores = scores;
    const bins = new Array(50).fill(0);
    for (let i = 0; i < scores.length; i++) {
      let b = Math.floor(scores[i] / 2);
      if (b < 0) b = 0; if (b >= 50) b = 49;
      bins[b]++;
    }
    S.state.scoreBins50 = bins;

    // Train/test split
    const split = S.Dataset.split(ds.n, 42, 0.2);
    S.state.split = split;

    // Check localStorage cache
    const dataHash = S.Dataset.hash(ds);
    const cached = S.storage.getModel(dataHash);

    if (cached) {
      S.state.models = cached.models;
      S.state.metrics = cached.metrics;
      S.state.residuals = cached.residuals;
      S.state.importance = cached.importance;
      S.state.serving = S.Models.decideServing(cached.metrics);
      updateStatusPill();
      return;
    }

    // Step 1: Fast synchronous training (Baseline, OLS, OLS_All)
    const fast = S.Models.trainFast(ds, split);
    S.state.models = fast.models;
    S.state.metrics = fast.metrics;
    S.state.residuals = fast.residuals;
    S.state.importance = fast.importance;
    S.state.serving = S.Models.decideServing(fast.metrics);
    updateStatusPill();

    // Step 2: Background training for Gradient Boosted Trees (non-blocking)
    trainGBTBackground(dataHash);
  }

  function trainGBTBackground(dataHash) {
    if (isGbtTraining) return;
    isGbtTraining = true;
    updateStatusPill(true, 0);

    // Delay slightly to give UI full render priority
    setTimeout(async () => {
      try {
        const gbtRes = await S.Models.trainGBT(S.state.ds, S.state.split, (progress) => {
          updateStatusPill(true, progress);
          if (S.views && S.views.model && S.views.model.onGBTProgress) {
            S.views.model.onGBTProgress(progress);
          }
        });

        if (gbtRes) {
          S.state.models.gbt = gbtRes.model;
          S.state.metrics.gbt = gbtRes.metrics;
          S.state.residuals.gbt = gbtRes.residuals;
          S.state.importance.gbt = gbtRes.importance;
          S.state.serving = S.Models.decideServing(S.state.metrics);

          // Save cache
          S.storage.setModel(dataHash, {
            models: S.state.models,
            metrics: S.state.metrics,
            residuals: S.state.residuals,
            importance: S.state.importance
          });

          if (S.views && S.views.model && S.views.model.onGBTReady) {
            S.views.model.onGBTReady();
          }
        }
      } catch (err) {
        console.warn('GBT training notice:', err);
      } finally {
        isGbtTraining = false;
        updateStatusPill(false);
      }
    }, 100);
  }

  function updateStatusPill(busy, progress) {
    const pill = document.querySelector('#model-status-pill');
    if (!pill) return;
    const dot = pill.querySelector('.status-dot');
    const text = pill.querySelector('#status-text');

    if (busy) {
      pill.className = 'status is-busy';
      text.textContent = progress != null ? `Training GBT ${(progress * 100).toFixed(0)}%` : 'Training...';
    } else {
      pill.className = 'status is-ready';
      const m = S.state.metrics.ols;
      text.textContent = `Linear · R² ${m ? m.r2.toFixed(2) : '--'}`;
    }
  }

  function initTheme() {
    const saved = S.storage.getTheme();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);

    const toggle = document.querySelector('#btn-theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        S.storage.setTheme(next);
        setTimeout(() => S.charts.redrawAll(), 50);
      });
    }

    // Media query change listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!S.storage.getTheme()) {
        const next = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        S.charts.redrawAll();
      }
    });
  }

  function setupNavigation() {
    window.addEventListener('hashchange', handleRoute);
  }

  function setupRouter() {
    if (!window.location.hash || window.location.hash === '#/') {
      window.location.hash = '#/estimate';
    } else {
      handleRoute();
    }
  }

  const viewsInitialized = {};

  function handleRoute() {
    const hash = window.location.hash || '#/estimate';
    const viewName = hash.replace(/^#\//, '').split('?')[0] || 'estimate';
    const validViews = ['estimate', 'explore', 'model', 'history'];
    const active = validViews.includes(viewName) ? viewName : 'estimate';

    // Update Tab Links
    document.querySelectorAll('.tab').forEach(t => {
      const match = t.getAttribute('href') === `#/${active}`;
      if (match) {
        t.setAttribute('aria-current', 'page');
      } else {
        t.removeAttribute('aria-current');
      }
    });

    // Switch View Containers
    validViews.forEach(v => {
      const el = document.querySelector(`#view-${v}`);
      if (!el) return;
      if (v === active) {
        el.classList.add('is-active');
        if (!viewsInitialized[v] && S.views && S.views[v]) {
          S.views[v].init(el);
          viewsInitialized[v] = true;
        } else if (S.views && S.views[v] && S.views[v].onShow) {
          S.views[v].onShow();
        }
      } else {
        el.classList.remove('is-active');
      }
    });

    window.scrollTo(0, 0);
  }

  // Exposed for runtime dataset replacement / retraining
  S.reinit = async function () {
    Object.keys(viewsInitialized).forEach(k => { delete viewsInitialized[k]; });
    await trainOrLoadModels();
    handleRoute();
  };

  window.addEventListener('DOMContentLoaded', boot);
})();
