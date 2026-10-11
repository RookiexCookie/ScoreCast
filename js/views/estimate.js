/* View: Estimate (hero prediction workspace, population strip, waterfall, levers & scenario compare) */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const P = S.predictor;
  const C = S.charts;

  let root = null;
  let currentInput = null;
  let scenarioA = null;
  let debounceTimer = null;
  let animTimer = null;
  let displayedScore = null;

  function init(container) {
    root = container;
    currentInput = P.defaults();
    renderStructure();
    bindEvents();
    update(true);
  }

  function renderStructure() {
    const r = S.state.ranges;
    const med = S.state.summary.numeric;

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">Estimate Score</h1>
          <p class="view-sub">Real-time marks prediction based on 20,000 student records.</p>
        </div>
        <div class="view-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-reset-median">Reset to median</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-save-est">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save estimate
          </button>
        </div>
      </div>

      <div class="estimate-grid">
        <!-- Left: Input Deck -->
        <div class="deck">
          <!-- Group 1: Study -->
          <div class="panel group">
            <div class="group-head">
              <span class="eyebrow">Study habits</span>
            </div>
            
            <!-- Study Hours -->
            <div class="field" id="field-study_hours">
              <div class="field-head">
                <label class="field-label" for="inp-num-study_hours">Daily study hours</label>
                <div class="num-wrap">
                  <input type="number" id="inp-num-study_hours" class="num-input mono" min="${r.study_hours.min}" max="${r.study_hours.max}" step="0.1" value="${currentInput.study_hours}">
                  <span class="num-unit">h</span>
                </div>
              </div>
              <div class="range-wrap" style="--p: ${(med.study_hours.median - r.study_hours.min) / (r.study_hours.max - r.study_hours.min)}">
                <span class="median-tick" title="Median: ${med.study_hours.median.toFixed(1)} h"></span>
                <input type="range" id="inp-rng-study_hours" class="range" min="${r.study_hours.min}" max="${r.study_hours.max}" step="0.1" value="${currentInput.study_hours}" aria-label="Daily study hours">
              </div>
              <div class="field-foot">
                <span>${r.study_hours.min}h</span>
                <span>Median: ${med.study_hours.median.toFixed(1)}h</span>
                <span>${r.study_hours.max}h</span>
              </div>
              <div class="field-error" hidden></div>
            </div>

            <!-- Study Method -->
            <fieldset class="seg-field">
              <legend class="eyebrow">Study method</legend>
              <div class="seg" role="radiogroup" id="seg-study_method">
                ${S.state.ds.levels.study_method.map(m => `
                  <label class="seg-opt">
                    <input type="radio" name="study_method" value="${m}" ${currentInput.study_method === m ? 'checked' : ''}>
                    <span>${P.levelLabel(m)}</span>
                  </label>
                `).join('')}
              </div>
            </fieldset>
          </div>

          <!-- Group 2: Rest & Recovery -->
          <div class="panel group">
            <div class="group-head">
              <span class="eyebrow">Rest & Sleep</span>
            </div>

            <!-- Sleep Hours -->
            <div class="field" id="field-sleep_hours">
              <div class="field-head">
                <label class="field-label" for="inp-num-sleep_hours">Nightly sleep hours</label>
                <div class="num-wrap">
                  <input type="number" id="inp-num-sleep_hours" class="num-input mono" min="${r.sleep_hours.min}" max="${r.sleep_hours.max}" step="0.1" value="${currentInput.sleep_hours}">
                  <span class="num-unit">h</span>
                </div>
              </div>
              <div class="range-wrap" style="--p: ${(med.sleep_hours.median - r.sleep_hours.min) / (r.sleep_hours.max - r.sleep_hours.min)}">
                <span class="median-tick" title="Median: ${med.sleep_hours.median.toFixed(1)} h"></span>
                <input type="range" id="inp-rng-sleep_hours" class="range" min="${r.sleep_hours.min}" max="${r.sleep_hours.max}" step="0.1" value="${currentInput.sleep_hours}" aria-label="Nightly sleep hours">
              </div>
              <div class="field-foot">
                <span>${r.sleep_hours.min}h</span>
                <span>Median: ${med.sleep_hours.median.toFixed(1)}h</span>
                <span>${r.sleep_hours.max}h</span>
              </div>
              <div class="field-error" hidden></div>
            </div>

            <!-- Sleep Quality -->
            <fieldset class="seg-field">
              <legend class="eyebrow">Sleep quality</legend>
              <div class="seg" role="radiogroup" id="seg-sleep_quality">
                ${S.state.ds.levels.sleep_quality.map(q => `
                  <label class="seg-opt">
                    <input type="radio" name="sleep_quality" value="${q}" ${currentInput.sleep_quality === q ? 'checked' : ''}>
                    <span>${P.levelLabel(q)}</span>
                  </label>
                `).join('')}
              </div>
            </fieldset>
          </div>

          <!-- Group 3: Environment & Attendance -->
          <div class="panel group">
            <div class="group-head">
              <span class="eyebrow">Environment & Attendance</span>
            </div>

            <!-- Attendance -->
            <div class="field" id="field-class_attendance">
              <div class="field-head">
                <label class="field-label" for="inp-num-class_attendance">Class attendance</label>
                <div class="num-wrap">
                  <input type="number" id="inp-num-class_attendance" class="num-input mono" min="${r.class_attendance.min}" max="${r.class_attendance.max}" step="0.5" value="${currentInput.class_attendance}">
                  <span class="num-unit">%</span>
                </div>
              </div>
              <div class="range-wrap" style="--p: ${(med.class_attendance.median - r.class_attendance.min) / (r.class_attendance.max - r.class_attendance.min)}">
                <span class="median-tick" title="Median: ${med.class_attendance.median.toFixed(1)}%"></span>
                <input type="range" id="inp-rng-class_attendance" class="range" min="${r.class_attendance.min}" max="${r.class_attendance.max}" step="0.5" value="${currentInput.class_attendance}" aria-label="Class attendance">
              </div>
              <div class="field-foot">
                <span>${r.class_attendance.min}%</span>
                <span>Median: ${med.class_attendance.median.toFixed(1)}%</span>
                <span>${r.class_attendance.max}%</span>
              </div>
              <div class="field-error" hidden></div>
            </div>

            <!-- Facility Rating -->
            <fieldset class="seg-field">
              <legend class="eyebrow">Campus / Study facility rating</legend>
              <div class="seg" role="radiogroup" id="seg-facility_rating">
                ${S.state.ds.levels.facility_rating.map(f => `
                  <label class="seg-opt">
                    <input type="radio" name="facility_rating" value="${f}" ${currentInput.facility_rating === f ? 'checked' : ''}>
                    <span>${P.levelLabel(f)}</span>
                  </label>
                `).join('')}
              </div>
            </fieldset>
          </div>
        </div>

        <!-- Right: Readout Panel -->
        <aside class="panel readout" id="readout-panel" aria-label="Prediction readout">
          <div class="ro-top">
            <span class="eyebrow">Predicted score</span>
            <span class="ro-status" id="ro-validation-msg" hidden>Fix invalid field</span>
          </div>

          <div class="hero">
            <span class="hero-num" id="hero-score">--.-</span>
            <span class="hero-of">/ 100</span>
          </div>

          <div class="grade-row">
            <div class="chip" id="grade-chip">
              <span class="chip-letter" id="grade-letter">-</span>
              <span id="grade-label">Calculating</span>
            </div>
            <button type="button" class="icon-btn icon-btn-sm" id="btn-bands" title="Adjust grading thresholds" aria-label="Grading thresholds">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>

            <!-- Grade bands popover -->
            <div class="popover" id="popover-bands" hidden>
              <div class="eyebrow">Minimum marks for grades</div>
              <div class="bands-grid" id="bands-inputs"></div>
              <div class="pop-actions">
                <button type="button" class="btn btn-ghost btn-sm" id="btn-bands-reset">Reset</button>
                <button type="button" class="btn btn-primary btn-sm" id="btn-bands-save">Apply</button>
              </div>
            </div>
          </div>

          <!-- Population strip -->
          <canvas class="strip" id="canvas-strip" height="64" aria-label="Score relative to population distribution"></canvas>
          <div class="ro-pct" id="ro-percentile">Higher than <strong>--%</strong> of students.</div>

          <div class="ro-interval">
            <span id="ro-interval-text">80% estimate range: -- – --</span>
            <button type="button" class="info" data-tip="Estimated range based on test set residuals.">i</button>
          </div>

          <!-- Why this number (Waterfall) -->
          <div class="why">
            <div class="group-head">
              <span class="eyebrow">Score factors</span>
              <span class="why-note" id="why-model-tag">Factor impact</span>
            </div>
            <div id="waterfall-container"></div>
          </div>
        </aside>
      </div>

      <!-- Below Grid: Levers & What-if Scenario Compare -->
      <section class="panel levers" aria-labelledby="levers-title">
        <div class="levers-head">
          <div>
            <h2 class="panel-title" id="levers-title">Score Levers</h2>
            <p class="muted" style="font-size:13px;">Adjustable actions and their expected impact on marks.</p>
          </div>
        </div>

        <div class="levers-grid">
          <!-- Part A: Marginal Levers Table -->
          <div>
            <ul class="lever-list" id="lever-items"></ul>
          </div>

          <!-- Part B: Scenario Compare -->
          <div class="scenario">
            <div class="group-head">
              <span class="eyebrow">Compare Scenario</span>
              <div class="scn-actions">
                <button type="button" class="btn btn-sm btn-ghost" id="btn-pin-a">Pin Scenario A</button>
                <button type="button" class="btn btn-sm btn-ghost btn-danger" id="btn-clear-a" hidden>Clear</button>
              </div>
            </div>

            <div id="scenario-content">
              <p class="scn-empty">Pin a scenario to compare adjustments side by side.</p>
            </div>
          </div>
        </div>
        <p class="footnote" id="levers-footnote">Statistical projections based on 20,000 student records.</p>
      </section>
    `;

    renderBandsPopover();
  }

  function renderBandsPopover() {
    const bands = P.bands();
    const cont = root.querySelector('#bands-inputs');
    cont.innerHTML = bands.map((b, i) => `
      <div class="band-input">
        <label for="band-val-${i}">Grade ${b.letter}:</label>
        <div class="num-wrap">
          <input type="number" id="band-val-${i}" class="num-input mono" min="0" max="100" value="${b.min}" ${b.letter === 'E' ? 'disabled' : ''}>
        </div>
      </div>
    `).join('');
  }

  function bindEvents() {
    // Sliders & Number inputs sync
    P.NUM_FIELDS.forEach(col => {
      const rng = root.querySelector(`#inp-rng-${col}`);
      const num = root.querySelector(`#inp-num-${col}`);

      const syncFromRange = () => {
        const val = parseFloat(rng.value);
        num.value = val;
        currentInput[col] = val;
        updateSliderFill(rng);
        scheduleUpdate();
      };

      const syncFromNum = () => {
        const val = parseFloat(num.value);
        if (Number.isFinite(val)) {
          rng.value = val;
          currentInput[col] = val;
          updateSliderFill(rng);
        } else {
          currentInput[col] = NaN;
        }
        scheduleUpdate();
      };

      rng.addEventListener('input', syncFromRange);
      num.addEventListener('input', syncFromNum);
      num.addEventListener('blur', () => {
        // Clamp on blur if needed
        const r = S.state.ranges[col];
        let val = parseFloat(num.value);
        if (isNaN(val)) val = r.min;
        val = Math.min(r.max, Math.max(r.min, val));
        num.value = val;
        rng.value = val;
        currentInput[col] = val;
        updateSliderFill(rng);
        scheduleUpdate();
      });

      updateSliderFill(rng);
    });

    // Segmented radios
    P.CAT_FIELDS.forEach(col => {
      const fieldset = root.querySelector(`#seg-${col}`);
      fieldset.addEventListener('change', (e) => {
        if (e.target.name === col) {
          currentInput[col] = e.target.value;
          scheduleUpdate();
        }
      });
    });

    // Reset median button
    root.querySelector('#btn-reset-median').addEventListener('click', () => {
      setInputValues(P.defaults());
      scheduleUpdate();
    });

    // Save estimate button
    root.querySelector('#btn-save-est').addEventListener('click', () => {
      const valid = P.validate(currentInput);
      if (!valid.ok) return;
      const score = P.predict(currentInput);
      const interv = P.interval(currentInput);
      const gr = P.grade(score);
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: Date.now(),
        input: Object.assign({}, currentInput),
        score,
        interval: interv,
        grade: gr,
        model: S.state.serving.id
      };
      S.storage.addHistory(entry);
      S.ui.toast(`Saved · <b>${score.toFixed(1)}</b> (${gr.letter})`);
    });

    // Grade bands popover toggle
    const bandsBtn = root.querySelector('#btn-bands');
    const bandsPop = root.querySelector('#popover-bands');
    bandsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bandsPop.hidden = !bandsPop.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!bandsPop.contains(e.target) && e.target !== bandsBtn) {
        bandsPop.hidden = true;
      }
    });
    root.querySelector('#btn-bands-reset').addEventListener('click', () => {
      S.storage.setBands(P.DEFAULT_BANDS);
      renderBandsPopover();
      bandsPop.hidden = true;
      update(true);
    });
    root.querySelector('#btn-bands-save').addEventListener('click', () => {
      const bands = P.DEFAULT_BANDS.map((b, i) => {
        if (b.letter === 'E') return Object.assign({}, b, { min: 0 });
        const val = parseFloat(root.querySelector(`#band-val-${i}`).value);
        return Object.assign({}, b, { min: isNaN(val) ? b.min : val });
      });
      // Sort descending
      bands.sort((a, b) => b.min - a.min);
      S.storage.setBands(bands);
      bandsPop.hidden = true;
      update(true);
    });

    // Pin Scenario A
    root.querySelector('#btn-pin-a').addEventListener('click', () => {
      const valid = P.validate(currentInput);
      if (!valid.ok) return;
      scenarioA = {
        input: Object.assign({}, currentInput),
        score: P.predict(currentInput)
      };
      root.querySelector('#btn-clear-a').hidden = false;
      renderScenarioCompare();
    });

    root.querySelector('#btn-clear-a').addEventListener('click', () => {
      scenarioA = null;
      root.querySelector('#btn-clear-a').hidden = true;
      renderScenarioCompare();
    });

    // Lever list click delegation
    root.querySelector('#lever-items').addEventListener('click', (e) => {
      const btn = e.target.closest('button.lever');
      if (!btn) return;
      const feat = btn.dataset.feature;
      const val = btn.dataset.value;
      if (P.FIELDS[feat].kind === 'num') {
        const delta = parseFloat(val);
        const nextVal = Math.min(S.state.ranges[feat].max, Math.max(S.state.ranges[feat].min, currentInput[feat] + delta));
        currentInput[feat] = Math.round(nextVal * 10) / 10;
      } else {
        currentInput[feat] = val;
      }
      setInputValues(currentInput);
      update(false);
    });
  }

  function updateSliderFill(rangeInput) {
    const min = parseFloat(rangeInput.min) || 0;
    const max = parseFloat(rangeInput.max) || 100;
    const val = parseFloat(rangeInput.value) || min;
    const pct = ((val - min) / (max - min)) * 100;
    rangeInput.style.setProperty('--fill', `${pct}%`);
  }

  function setInputValues(input) {
    P.NUM_FIELDS.forEach(col => {
      const rng = root.querySelector(`#inp-rng-${col}`);
      const num = root.querySelector(`#inp-num-${col}`);
      rng.value = input[col];
      num.value = input[col];
      updateSliderFill(rng);
    });
    P.CAT_FIELDS.forEach(col => {
      const r = root.querySelector(`input[name="${col}"][value="${input[col]}"]`);
      if (r) r.checked = true;
    });
    currentInput = Object.assign({}, input);
  }

  function scheduleUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => update(false), 50);
  }

  function update(force) {
    const valid = P.validate(currentInput);
    const readout = root.querySelector('#readout-panel');
    const msg = root.querySelector('#ro-validation-msg');

    // Display inline field errors
    P.NUM_FIELDS.forEach(col => {
      const f = root.querySelector(`#field-${col}`);
      const err = f.querySelector('.field-error');
      if (valid.errors[col]) {
        f.classList.add('has-error');
        err.textContent = valid.errors[col];
        err.hidden = false;
      } else {
        f.classList.remove('has-error');
        err.hidden = true;
      }
    });

    if (!valid.ok) {
      readout.classList.add('is-frozen');
      msg.hidden = false;
      msg.textContent = `Fix ${Object.keys(valid.errors).length} invalid field${Object.keys(valid.errors).length > 1 ? 's' : ''}`;
      return;
    }

    readout.classList.remove('is-frozen');
    msg.hidden = true;

    // Model calculation
    const targetScore = P.predict(currentInput);
    const interv = P.interval(currentInput);
    const pct = P.percentile(targetScore);
    const gr = P.grade(targetScore);

    // Number count-up animation
    animateHeroScore(targetScore, force);

    // Grade chip
    root.querySelector('#grade-letter').textContent = gr.letter;
    root.querySelector('#grade-label').textContent = gr.label;

    // Percentile text
    root.querySelector('#ro-percentile').innerHTML = `Higher than <strong>${pct.toFixed(0)}%</strong> of students.`;

    // Interval text
    root.querySelector('#ro-interval-text').textContent = `80% estimate range: ${interv.lo.toFixed(1)} – ${interv.hi.toFixed(1)}`;

    // Population canvas strip
    const canvas = root.querySelector('#canvas-strip');
    C.strip(canvas, {
      min: 0,
      max: 100,
      counts: S.state.scoreBins50,
      value: targetScore,
      interval: interv
    });

    // Waterfall explanation
    renderWaterfall(currentInput, targetScore);

    // Marginal levers
    renderLevers(currentInput);

    // Scenario compare
    renderScenarioCompare();
  }

  function animateHeroScore(targetScore, immediate) {
    const hero = root.querySelector('#hero-score');
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches || displayedScore === null) {
      displayedScore = targetScore;
      hero.textContent = targetScore.toFixed(1);
      return;
    }

    const start = displayedScore;
    const diff = targetScore - start;
    const startTime = performance.now();
    const duration = 300;

    if (animTimer) cancelAnimationFrame(animTimer);

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = start + diff * ease;
      hero.textContent = val.toFixed(1);
      if (progress < 1) {
        animTimer = requestAnimationFrame(step);
      } else {
        displayedScore = targetScore;
        hero.textContent = targetScore.toFixed(1);
      }
    }
    animTimer = requestAnimationFrame(step);
  }

  function renderWaterfall(input, score) {
    const container = root.querySelector('#waterfall-container');
    const tag = root.querySelector('#why-model-tag');
    if (S.state.serving.id === 'ols') {
      tag.textContent = 'Factor impact';
      const exp = P.explain(input);
      C.waterfall(container, {
        base: exp.base,
        baseLabel: 'Average score',
        total: score,
        totalLabel: 'Prediction',
        rows: exp.rows.map(r => ({
          label: r.label,
          valueText: P.formatValue(r.feature, r.value),
          contribution: r.contribution
        }))
      });
    } else {
      tag.textContent = 'Feature impact';
      const imp = S.state.importance.gbt || S.state.importance.ols;
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text-2);padding:6px 0;">
          Gradient boosting served (RMSE +${(S.state.metrics.ols.rmse - S.state.metrics.gbt.rmse).toFixed(2)} improvement). Relative impact:
        </div>
        <div class="wf">
          ${imp.map(item => `
            <div class="wf-row">
              <span class="wf-label">${P.FIELDS[item.col].short}</span>
              <span class="wf-track"><span class="wf-bar up" style="width:${Math.min(100, item.value * 8)}%"></span></span>
              <span class="wf-val up">+${item.value.toFixed(1)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  function renderLevers(input) {
    const list = root.querySelector('#lever-items');
    const actions = [];

    // Study hours +1h
    const rStudy = S.state.ranges.study_hours;
    if (input.study_hours + 0.1 <= rStudy.max) {
      const delta = P.lever(input, 'study_hours', 1.0);
      actions.push({
        label: '+1 h study per day',
        delta,
        feat: 'study_hours',
        val: 1.0
      });
    } else {
      actions.push({ label: 'Daily study hours', isMax: true });
    }

    // Attendance +10%
    const rAtt = S.state.ranges.class_attendance;
    if (input.class_attendance + 0.5 <= rAtt.max) {
      const delta = P.lever(input, 'class_attendance', 10.0);
      actions.push({
        label: '+10% class attendance',
        delta,
        feat: 'class_attendance',
        val: 10.0
      });
    } else {
      actions.push({ label: 'Class attendance', isMax: true });
    }

    // Sleep +1h
    const rSleep = S.state.ranges.sleep_hours;
    if (input.sleep_hours + 0.1 <= rSleep.max) {
      const delta = P.lever(input, 'sleep_hours', 1.0);
      actions.push({
        label: '+1 h nightly sleep',
        delta,
        feat: 'sleep_hours',
        val: 1.0
      });
    } else {
      actions.push({ label: 'Nightly sleep', isMax: true });
    }

    // Sleep quality to next level
    const sqLevels = S.state.ds.levels.sleep_quality;
    const curSqIdx = sqLevels.indexOf(input.sleep_quality);
    if (curSqIdx < sqLevels.length - 1) {
      const nextSq = sqLevels[curSqIdx + 1];
      const delta = P.lever(input, 'sleep_quality', nextSq);
      actions.push({
        label: `Sleep quality → ${P.levelLabel(nextSq)}`,
        delta,
        feat: 'sleep_quality',
        val: nextSq
      });
    } else {
      actions.push({ label: 'Sleep quality (already Good)', isMax: true });
    }

    // Study method to coaching
    if (input.study_method !== 'coaching') {
      const delta = P.lever(input, 'study_method', 'coaching');
      actions.push({
        label: 'Study method → Coaching',
        delta,
        feat: 'study_method',
        val: 'coaching'
      });
    } else {
      actions.push({ label: 'Study method (already Coaching)', isMax: true });
    }

    // Facility rating to next level
    const facLevels = S.state.ds.levels.facility_rating;
    const curFacIdx = facLevels.indexOf(input.facility_rating);
    if (curFacIdx < facLevels.length - 1) {
      const nextFac = facLevels[curFacIdx + 1];
      const delta = P.lever(input, 'facility_rating', nextFac);
      actions.push({
        label: `Facility rating → ${P.levelLabel(nextFac)}`,
        delta,
        feat: 'facility_rating',
        val: nextFac
      });
    } else {
      actions.push({ label: 'Facility rating (already High)', isMax: true });
    }

    list.innerHTML = actions.map(a => {
      if (a.isMax) {
        return `
          <li>
            <div class="lever is-max">
              <span>${a.label}</span>
              <span class="lever-note">Already at maximum</span>
            </div>
          </li>
        `;
      }
      const isUp = a.delta >= 0;
      return `
        <li>
          <button type="button" class="lever" data-feature="${a.feat}" data-value="${a.val}">
            <span class="lever-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              ${a.label}
            </span>
            <span class="lever-delta ${isUp ? 'up' : 'down'}">${S.ui.signed(a.delta)}</span>
          </button>
        </li>
      `;
    }).join('');
  }

  function renderScenarioCompare() {
    const scn = root.querySelector('#scenario-content');
    if (!scenarioA) {
      scn.innerHTML = `<p class="scn-empty">Click <strong>Pin current as Scenario A</strong>, then adjust any inputs above to observe the live difference.</p>`;
      return;
    }

    const currentScore = P.predict(currentInput);
    const delta = currentScore - scenarioA.score;
    const isUp = delta > 0.001;
    const isDown = delta < -0.001;

    // Detect changed inputs
    const diffs = [];
    P.INPUT_FIELDS.forEach(col => {
      if (scenarioA.input[col] !== currentInput[col]) {
        diffs.push({
          label: P.FIELDS[col].label,
          before: P.formatValue(col, scenarioA.input[col]),
          after: P.formatValue(col, currentInput[col])
        });
      }
    });

    scn.innerHTML = `
      <div class="cmp">
        <div class="cmp-flow">
          <span class="cmp-tag">Scenario A</span> <strong>${scenarioA.score.toFixed(1)}</strong>
          <span class="cmp-arrow">→</span>
          <span class="cmp-tag">Current</span> <strong>${currentScore.toFixed(1)}</strong>
        </div>
        <div class="cmp-delta ${isUp ? 'up' : (isDown ? 'down' : 'zero')}">
          ${S.ui.signed(delta)} marks
        </div>
        ${diffs.length > 0 ? `
          <ul class="cmp-diff">
            ${diffs.map(d => `
              <li>
                <span>${d.label}</span>
                <span class="mono">${d.before} → ${d.after}</span>
              </li>
            `).join('')}
          </ul>
        ` : `<p class="scn-empty" style="font-size:12px;">No input changes yet. Adjust any slider or radio above.</p>`}
      </div>
    `;
  }

  // Public method so history row can load back into workspace
  function loadInput(input) {
    if (!root) return;
    setInputValues(input);
    update(true);
  }

  S.views = S.views || {};
  S.views.estimate = { init, loadInput, onShow: () => { if (root) update(true); } };
})();
