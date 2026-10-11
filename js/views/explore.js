/* View: Explore data (20k points distributions, scatter plots with OLS trend lines, small multiples & CI whiskers) */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const D = S.Dataset;
  const C = S.charts;

  let root = null;
  let activeCourse = 'all';

  function init(container) {
    root = container;
    renderStructure();
    bindEvents();
    renderCharts();
  }

  function renderStructure() {
    const ds = S.state.ds;
    const courses = ds.levels.course;

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Explore Data</h1>
          <p class="view-sub">Feature distributions across 20,000 student records.</p>
        </div>
        <div class="view-actions">
          <div class="filter">
            <label for="filter-course">Course:</label>
            <select id="filter-course" class="select">
              <option value="all">All programs (20,000)</option>
              ${courses.map(c => `<option value="${c}">${S.predictor.levelLabel(c)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Stat Row -->
      <div class="stat-row" id="explore-stats"></div>

      <!-- Main Grid -->
      <div class="grid">
        <!-- Score distribution -->
        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <div>
              <h2 class="panel-title">Score Distribution</h2>
            </div>
            <div class="legend">
              <span><i class="k-pop"></i>Scores</span>
            </div>
          </div>
          <canvas id="chart-score-dist" class="chart" aria-label="Exam score histogram"></canvas>
        </div>

        <!-- Study hours vs Score -->
        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <div>
              <h2 class="panel-title">Study Hours vs Score</h2>
            </div>
            <div class="chart-meta" id="meta-corr-study">r = 0.72</div>
          </div>
          <canvas id="chart-study-scatter" class="chart" aria-label="Study hours vs score scatter plot"></canvas>
        </div>

        <!-- Attendance vs Score -->
        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <div>
              <h2 class="panel-title">Attendance vs Score</h2>
            </div>
            <div class="chart-meta" id="meta-corr-att">r = 0.31</div>
          </div>
          <canvas id="chart-att-scatter" class="chart" aria-label="Attendance vs score scatter plot"></canvas>
        </div>

        <!-- Sleep hours vs Score -->
        <div class="panel span-6 chart-panel">
          <div class="chart-head">
            <div>
              <h2 class="panel-title">Sleep Hours vs Score</h2>
            </div>
            <div class="chart-meta" id="meta-corr-sleep">r = 0.13</div>
          </div>
          <canvas id="chart-sleep-scatter" class="chart" aria-label="Sleep hours vs score scatter plot"></canvas>
        </div>

        <!-- Group effects (Sleep Quality, Method, Facility) -->
        <div class="panel span-12">
          <div class="chart-head" style="margin-bottom:14px;">
            <div>
              <h2 class="panel-title">Categorical Factors</h2>
              <p class="muted" style="font-size:13px;">Average scores by subgroup.</p>
            </div>
          </div>
          <div class="multiples">
            <div class="multiple">
              <h3>Sleep quality</h3>
              <canvas id="chart-grp-sleep" class="chart chart-sm"></canvas>
            </div>
            <div class="multiple">
              <h3>Study method</h3>
              <canvas id="chart-grp-method" class="chart chart-sm"></canvas>
            </div>
            <div class="multiple">
              <h3>Facility rating</h3>
              <canvas id="chart-grp-facility" class="chart chart-sm"></canvas>
            </div>
          </div>
        </div>

        <!-- Factors with No Measurable Effect -->
        <div class="panel span-12">
          <details class="disclosure" id="details-no-effect">
            <summary>
              <span>
                <span>Factors with No Measurable Impact</span>
                <span class="summary-sub">Gender, Degree, Internet, Exam Difficulty</span>
              </span>
            </summary>
            <div class="disclosure-body">
              <p class="muted" style="font-size:13px;">
                Subgroup averages for these 4 factors remain within ±0.8 marks of overall average (62.5), showing they do not meaningfully impact exam scores.
              </p>
              <div class="multiples four">
                <div class="multiple">
                  <h3>Gender</h3>
                  <canvas id="chart-no-gender" class="chart chart-sm"></canvas>
                </div>
                <div class="multiple">
                  <h3>Degree course</h3>
                  <canvas id="chart-no-course" class="chart chart-sm"></canvas>
                </div>
                <div class="multiple">
                  <h3>Internet access</h3>
                  <canvas id="chart-no-internet" class="chart chart-sm"></canvas>
                </div>
                <div class="multiple">
                  <h3>Exam difficulty</h3>
                  <canvas id="chart-no-diff" class="chart chart-sm"></canvas>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    const sel = root.querySelector('#filter-course');
    sel.addEventListener('change', (e) => {
      activeCourse = e.target.value;
      renderCharts();
    });

    const disc = root.querySelector('#details-no-effect');
    disc.addEventListener('toggle', () => {
      if (disc.open) {
        renderNoEffectCharts();
      }
    });
  }

  function getFilteredIndices() {
    const ds = S.state.ds;
    if (activeCourse === 'all') return null; // all rows
    const cIdx = ds.levels.course.indexOf(activeCourse);
    const rows = [];
    const col = ds.cols.course;
    for (let i = 0; i < ds.n; i++) {
      if (col[i] === cIdx) rows.push(i);
    }
    return rows;
  }

  function renderCharts() {
    const ds = S.state.ds;
    const rows = getFilteredIndices();
    const sum = D.summary(ds, rows);

    // Update Stat Row
    const statEl = root.querySelector('#explore-stats');
    statEl.innerHTML = `
      <div class="stat">
        <span class="stat-label">Observed students</span>
        <span class="stat-value">${sum.n.toLocaleString()}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Mean score</span>
        <span class="stat-value">${sum.numeric.exam_score.mean.toFixed(1)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Median score</span>
        <span class="stat-value">${sum.numeric.exam_score.median.toFixed(1)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Std deviation</span>
        <span class="stat-value">${sum.numeric.exam_score.sd.toFixed(1)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Observed range</span>
        <span class="stat-value">${sum.numeric.exam_score.min.toFixed(1)} – ${sum.numeric.exam_score.max.toFixed(1)}</span>
      </div>
    `;

    // Extract arrays for filtered subset
    const count = rows ? rows.length : ds.n;
    const scores = new Float64Array(count);
    const study = new Float64Array(count);
    const att = new Float64Array(count);
    const sleep = new Float64Array(count);

    if (rows) {
      for (let i = 0; i < count; i++) {
        const r = rows[i];
        scores[i] = ds.cols.exam_score[r];
        study[i] = ds.cols.study_hours[r];
        att[i] = ds.cols.class_attendance[r];
        sleep[i] = ds.cols.sleep_hours[r];
      }
    } else {
      scores.set(ds.cols.exam_score);
      study.set(ds.cols.study_hours);
      att.set(ds.cols.class_attendance);
      sleep.set(ds.cols.sleep_hours);
    }

    // 1. Histogram of scores
    C.histogram(root.querySelector('#chart-score-dist'), {
      values: scores,
      min: 15,
      max: 100,
      bin: 2.5,
      xLabel: 'Exam score',
      yLabel: 'Students',
      color: 'pop',
      markers: [
        { x: sum.numeric.exam_score.mean, label: 'Mean', color: 'text' },
        { x: sum.numeric.exam_score.median, label: 'Med', color: 'pop' }
      ]
    });

    // 2. Study scatter
    const rStudy = D.pearson(study, scores);
    root.querySelector('#meta-corr-study').innerHTML = `r = <b>${rStudy.toFixed(2)}</b>`;
    C.scatter(root.querySelector('#chart-study-scatter'), {
      x: study,
      y: scores,
      xDomain: [0, 8.5],
      yDomain: [15, 105],
      xLabel: 'Study hours / day',
      yLabel: 'Score',
      trend: D.linfit(study, scores),
      tip: (i) => `<b>${study[i].toFixed(2)} h</b> study<br>Score: <b>${scores[i].toFixed(1)}</b>`
    });

    // 3. Attendance scatter
    const rAtt = D.pearson(att, scores);
    root.querySelector('#meta-corr-att').innerHTML = `r = <b>${rAtt.toFixed(2)}</b>`;
    C.scatter(root.querySelector('#chart-att-scatter'), {
      x: att,
      y: scores,
      xDomain: [38, 102],
      yDomain: [15, 105],
      xLabel: 'Attendance %',
      yLabel: 'Score',
      trend: D.linfit(att, scores),
      tip: (i) => `<b>${att[i].toFixed(1)}%</b> attendance<br>Score: <b>${scores[i].toFixed(1)}</b>`
    });

    // 4. Sleep scatter
    const rSleep = D.pearson(sleep, scores);
    root.querySelector('#meta-corr-sleep').innerHTML = `r = <b>${rSleep.toFixed(2)}</b>`;
    C.scatter(root.querySelector('#chart-sleep-scatter'), {
      x: sleep,
      y: scores,
      xDomain: [3.8, 10.5],
      yDomain: [15, 105],
      xLabel: 'Nightly sleep (h)',
      yLabel: 'Score',
      trend: D.linfit(sleep, scores),
      tip: (i) => `<b>${sleep[i].toFixed(1)} h</b> sleep<br>Score: <b>${scores[i].toFixed(1)}</b>`
    });

    // 5. Categorical Dot Plots with 95% CI
    const overallMean = sum.numeric.exam_score.mean;
    function makeGroups(col) {
      return sum.categorical[col].map(g => {
        const se = g.n > 1 ? g.sd / Math.sqrt(g.n) : 0;
        return {
          label: S.predictor.levelLabel(g.level),
          mean: g.mean,
          lo: g.mean - 1.96 * se,
          hi: g.mean + 1.96 * se,
          n: g.n
        };
      });
    }

    C.dotPlot(root.querySelector('#chart-grp-sleep'), {
      domain: [50, 75],
      groups: makeGroups('sleep_quality'),
      ref: overallMean,
      labelW: 76
    });

    C.dotPlot(root.querySelector('#chart-grp-method'), {
      domain: [50, 75],
      groups: makeGroups('study_method'),
      ref: overallMean,
      labelW: 96
    });

    C.dotPlot(root.querySelector('#chart-grp-facility'), {
      domain: [50, 75],
      groups: makeGroups('facility_rating'),
      ref: overallMean,
      labelW: 76
    });

    const disc = root.querySelector('#details-no-effect');
    if (disc && disc.open) {
      renderNoEffectCharts();
    }
  }

  function renderNoEffectCharts() {
    const sum = D.summary(S.state.ds);
    const overallMean = sum.numeric.exam_score.mean;

    function makeGroups(col) {
      return sum.categorical[col].map(g => {
        const se = g.n > 1 ? g.sd / Math.sqrt(g.n) : 0;
        return {
          label: S.predictor.levelLabel(g.level),
          mean: g.mean,
          lo: g.mean - 1.96 * se,
          hi: g.mean + 1.96 * se,
          n: g.n
        };
      });
    }

    C.dotPlot(root.querySelector('#chart-no-gender'), {
      domain: [58, 66],
      groups: makeGroups('gender'),
      ref: overallMean,
      labelW: 72
    });

    C.dotPlot(root.querySelector('#chart-no-course'), {
      domain: [58, 66],
      groups: makeGroups('course'),
      ref: overallMean,
      labelW: 72
    });

    C.dotPlot(root.querySelector('#chart-no-internet'), {
      domain: [58, 66],
      groups: makeGroups('internet_access'),
      ref: overallMean,
      labelW: 72
    });

    C.dotPlot(root.querySelector('#chart-no-diff'), {
      domain: [58, 66],
      groups: makeGroups('exam_difficulty'),
      ref: overallMean,
      labelW: 72
    });
  }

  S.views = S.views || {};
  S.views.explore = { init, onShow: () => { if (root) renderCharts(); } };
})();
