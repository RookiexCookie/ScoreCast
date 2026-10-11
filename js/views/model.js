/* View: Model Performance (simple, efficient comparison, error benchmark, feature importance, and test accuracy) */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const C = S.charts;

  let root = null;

  function init(container) {
    root = container;
    render();
  }

  function render() {
    const st = S.state;
    const serv = st.serving;
    const met = st.metrics;

    const modelKeys = ['baseline', 'ols'];
    if (met.gbt) modelKeys.push('gbt');

    let minMae = Infinity, minRmse = Infinity, maxR2 = -Infinity;
    modelKeys.forEach(k => {
      const m = met[k];
      if (m) {
        if (m.mae < minMae) minMae = m.mae;
        if (m.rmse < minRmse) minRmse = m.rmse;
        if (m.r2 > maxR2) maxR2 = m.r2;
      }
    });

    const isOls = serv.id === 'ols';

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Model Performance</h1>
          <p class="view-sub">Accuracy metrics measured on 4,000 held-out student records.</p>
        </div>
        <div class="view-actions">
          <label class="btn btn-sm btn-ghost file-btn" id="lbl-upload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Load CSV
            <input type="file" id="inp-upload-csv" accept=".csv" class="sr-only">
          </label>
          <button type="button" class="btn btn-sm btn-primary" id="btn-retrain">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Retrain
          </button>
        </div>
      </div>

      <div id="upload-feedback" hidden></div>

      <!-- Active model summary -->
      <div class="panel" style="margin-bottom:var(--gap);padding:14px 18px;">
        <div class="serving-line">
          <span class="tag tag-serving">Active: ${isOls ? 'Linear Regression' : 'Gradient Boosted Trees'}</span>
          <span style="font-size:13px;color:var(--text-2);">
            R² <strong>${(met.ols ? met.ols.r2 : 0.73).toFixed(2)}</strong> · Average error ±<strong>${(met.ols ? met.ols.mae : 7.9).toFixed(1)}</strong> marks. Selected for clear, exact explanations.
          </span>
        </div>
      </div>

      <!-- Row 1: Comparison Table & RMSE Chart -->
      <div class="grid" style="margin-bottom:var(--gap);">
        <div class="panel span-7">
          <div class="chart-head" style="margin-bottom:12px;">
            <h2 class="panel-title">Model Comparison</h2>
          </div>
          <div class="table-scroll">
            <table class="table" id="table-models">
              <thead>
                <tr>
                  <th>Model</th>
                  <th class="num">MAE</th>
                  <th class="num">RMSE</th>
                  <th class="num">R² Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Linear Regression</strong></td>
                  <td class="num ${met.ols.mae === minMae ? 'best' : ''}">${met.ols.mae.toFixed(1)}</td>
                  <td class="num ${met.ols.rmse === minRmse ? 'best' : ''}">${met.ols.rmse.toFixed(1)}</td>
                  <td class="num ${met.ols.r2 === maxR2 ? 'best' : ''}">${met.ols.r2.toFixed(3)}</td>
                  <td>${serv.id === 'ols' ? '<span class="tag tag-serving">Active</span>' : '<span class="tag">Evaluated</span>'}</td>
                </tr>
                <tr id="row-gbt">
                  <td><strong>Gradient Boosted Trees</strong></td>
                  <td class="num ${met.gbt && met.gbt.mae === minMae ? 'best' : ''}">${met.gbt ? met.gbt.mae.toFixed(1) : '--'}</td>
                  <td class="num ${met.gbt && met.gbt.rmse === minRmse ? 'best' : ''}">${met.gbt ? met.gbt.rmse.toFixed(1) : '--'}</td>
                  <td class="num ${met.gbt && met.gbt.r2 === maxR2 ? 'best' : ''}">${met.gbt ? met.gbt.r2.toFixed(3) : '--'}</td>
                  <td>
                    ${met.gbt
                      ? (serv.id === 'gbt' ? '<span class="tag tag-serving">Active</span>' : '<span class="tag">Evaluated</span>')
                      : '<span class="tag" id="tag-gbt-progress">Training...</span>'}
                  </td>
                </tr>
                <tr>
                  <td class="muted">Baseline (Mean)</td>
                  <td class="num muted">${met.baseline.mae.toFixed(1)}</td>
                  <td class="num muted">${met.baseline.rmse.toFixed(1)}</td>
                  <td class="num muted">${met.baseline.r2.toFixed(3)}</td>
                  <td><span class="tag">Baseline</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel span-5 chart-panel">
          <div class="chart-head">
            <h2 class="panel-title">Prediction Error (RMSE)</h2>
            <span class="muted" style="font-size:12px;">Lower is better</span>
          </div>
          <canvas id="chart-rmse-compare" class="chart" aria-label="RMSE comparison chart"></canvas>
        </div>
      </div>

      <!-- Row 2: Factor Impact & Test Accuracy -->
      <div class="grid">
        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <h2 class="panel-title">Top Predictive Factors</h2>
            <span class="muted" style="font-size:12px;">Relative score influence</span>
          </div>
          <canvas id="chart-importance" class="chart" aria-label="Feature importance horizontal bar chart"></canvas>
        </div>

        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <h2 class="panel-title">Model Accuracy</h2>
            <div class="chart-meta">R² = <b>${st.metrics[serv.id].r2.toFixed(3)}</b></div>
          </div>
          <canvas id="chart-pred-vs-actual" class="chart" aria-label="Predicted vs actual exam marks scatter plot"></canvas>
        </div>
      </div>
    `;

    bindEvents();
    renderCharts();
  }

  function bindEvents() {
    // Retrain button
    root.querySelector('#btn-retrain').addEventListener('click', async () => {
      const btn = root.querySelector('#btn-retrain');
      btn.disabled = true;
      btn.innerHTML = 'Retraining...';
      S.storage.clearModel();
      await S.reinit();
      render();
      S.ui.toast('Models retrained on dataset');
    });

    // Upload CSV
    const fileInp = root.querySelector('#inp-upload-csv');
    fileInp.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fb = root.querySelector('#upload-feedback');
      try {
        const text = await file.text();
        const parsed = S.Dataset.parseCSV(text, file.name);
        fb.hidden = false;
        fb.className = 'inline-ok';
        fb.textContent = `Valid CSV parsed (${parsed.rows.toLocaleString()} rows). Retraining...`;
        window.EXAM_DATA = parsed;
        S.storage.clearModel();
        await S.reinit();
        render();
        S.ui.toast(`Loaded ${file.name}`);
      } catch (err) {
        fb.hidden = false;
        fb.className = 'inline-error';
        fb.textContent = `Error: ${err.message}`;
      }
    });
  }

  function renderCharts() {
    const st = S.state;
    const met = st.metrics;

    // 1. Horizontal RMSE comparison
    const rows = [
      { label: 'Linear Model', values: [met.ols.rmse] }
    ];
    if (met.gbt) {
      rows.push({ label: 'Gradient Boosting', values: [met.gbt.rmse] });
    }
    C.hbars(root.querySelector('#chart-rmse-compare'), {
      rows,
      series: [{ name: 'Test RMSE', color: 'pop' }],
      ref: { value: met.baseline.rmse, label: `Baseline (${met.baseline.rmse.toFixed(1)})` },
      fmt: (v) => v.toFixed(1) + ' marks',
      labelW: 130
    });

    // 2. Permutation Feature Importance
    const impOls = st.importance.ols;
    const impGbt = st.importance.gbt;
    const impRows = impOls.map(item => {
      const gbtItem = impGbt ? impGbt.find(g => g.col === item.col) : null;
      return {
        label: S.predictor.FIELDS[item.col].label,
        values: impGbt ? [item.value, gbtItem ? gbtItem.value : null] : [item.value]
      };
    });
    impRows.sort((a, b) => b.values[0] - a.values[0]);

    const impSeries = [{ name: 'Impact', color: 'pop' }];
    if (impGbt) impSeries.push({ name: 'Gradient Boosting', color: 'you' });

    C.hbars(root.querySelector('#chart-importance'), {
      rows: impRows,
      series: impSeries,
      fmt: (v) => '+' + v.toFixed(1),
      labelW: 130
    });

    // 3. Predicted vs Actual scatter
    const servModel = st.models[st.serving.id];
    const testRows = st.split.test;
    const nTest = testRows.length;
    const yActual = new Float64Array(nTest);
    const yPred = new Float64Array(nTest);
    for (let i = 0; i < nTest; i++) {
      const r = testRows[i];
      yActual[i] = st.ds.cols.exam_score[r];
      yPred[i] = S.Models.clampScore(S.Models.predict(servModel, S.Models.rowSrc(st.ds, r)));
    }
    C.scatter(root.querySelector('#chart-pred-vs-actual'), {
      x: yActual,
      y: yPred,
      xDomain: [15, 105],
      yDomain: [15, 105],
      xLabel: 'Actual score',
      yLabel: 'Predicted score',
      diagonal: true,
      color: 'pop',
      tip: (i) => `Actual: <b>${yActual[i].toFixed(1)}</b><br>Predicted: <b>${yPred[i].toFixed(1)}</b>`
    });
  }

  function onGBTProgress(pct) {
    const tag = root ? root.querySelector('#tag-gbt-progress') : null;
    if (tag) tag.textContent = `Training ${(pct * 100).toFixed(0)}%`;
  }

  function onGBTReady() {
    if (root) render();
  }

  S.views = S.views || {};
  S.views.model = { init, onShow: () => { if (root) renderCharts(); }, onGBTProgress, onGBTReady };
})();
