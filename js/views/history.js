/* View: Prediction History (table with date/score sorting, inline scenario comparison, CSV export, inline clear confirmation) */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});
  const P = S.predictor;

  let root = null;
  let sortField = 'ts';
  let sortAsc = false;
  let selectedIds = new Set();
  let clearTimer = null;

  function init(container) {
    root = container;
    render();
  }

  function render() {
    const history = S.storage.getHistory();
    const hasItems = history.length > 0;

    root.innerHTML = `
      <div class="view-head">
        <div>
          <h1 class="view-title">History</h1>
          <p class="view-sub">${history.length} saved predictions.</p>
        </div>
        <div class="view-actions">
          ${hasItems ? `
            <button type="button" class="btn btn-sm btn-ghost" id="btn-compare-selected" disabled>Compare (0)</button>
            <button type="button" class="btn btn-sm btn-ghost" id="btn-export-csv">Export CSV</button>
            <div id="clear-container" style="display:inline-block;">
              <button type="button" class="btn btn-sm btn-ghost btn-danger" id="btn-clear-hist">Clear</button>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="panel">
        ${!hasItems ? `
          <div class="empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="muted"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <p>No saved estimates yet.</p>
            <a href="#/estimate" class="btn btn-sm btn-primary">Go to Estimate workspace</a>
          </div>
        ` : `
          <div class="table-scroll">
            <table class="table" id="table-history">
              <thead>
                <tr>
                  <th style="width:36px;"><span class="sr-only">Select</span></th>
                  <th>
                    <button type="button" class="sort-btn" data-sort="ts">
                      Timestamp <span class="sort-ind">${sortField === 'ts' ? (sortAsc ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                  <th class="num">Study</th>
                  <th class="num">Attendance</th>
                  <th class="num">Sleep</th>
                  <th>Quality</th>
                  <th>Method</th>
                  <th>Facility</th>
                  <th>
                    <button type="button" class="sort-btn" data-sort="score">
                      Score <span class="sort-ind">${sortField === 'score' ? (sortAsc ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody id="tbody-history">
                ${renderRows(history)}
              </tbody>
            </table>
          </div>
          <p class="footnote">Tip: Click any row to load its parameters back into the Estimate workspace.</p>
        `}
      </div>

      <!-- Compare panel -->
      <div class="panel compare-panel" id="hist-compare-panel" hidden>
        <div class="group-head" style="margin-bottom:12px;">
          <h2 class="panel-title">Selected prediction comparison</h2>
          <button type="button" class="btn btn-sm btn-ghost" id="btn-close-cmp">Close</button>
        </div>
        <div id="hist-compare-content"></div>
      </div>
    `;

    bindEvents();
  }

  function renderRows(history) {
    const sorted = history.slice().sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortAsc) return va > vb ? 1 : -1;
      return va < vb ? 1 : -1;
    });

    const df = new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return sorted.map(row => {
      const isSel = selectedIds.has(row.id);
      const pct = Math.min(100, Math.max(0, row.score));
      return `
        <tr class="hist-row ${isSel ? 'is-selected' : ''}" data-id="${row.id}" tabindex="0" role="button" aria-label="Load prediction from ${df.format(row.ts)}">
          <td onclick="event.stopPropagation();">
            <input type="checkbox" class="check" data-id="${row.id}" ${isSel ? 'checked' : ''} aria-label="Select row">
          </td>
          <td class="muted">${df.format(row.ts)}</td>
          <td class="num mono">${row.input.study_hours.toFixed(1)} h</td>
          <td class="num mono">${row.input.class_attendance.toFixed(1)}%</td>
          <td class="num mono">${row.input.sleep_hours.toFixed(1)} h</td>
          <td>${P.levelLabel(row.input.sleep_quality)}</td>
          <td>${P.levelLabel(row.input.study_method)}</td>
          <td>${P.levelLabel(row.input.facility_rating)}</td>
          <td>
            <div class="score-cell">
              <span class="mono" style="font-weight:600;">${row.score.toFixed(1)}</span>
              <div class="score-bar"><i style="width:${pct}%"></i></div>
            </div>
          </td>
          <td><span class="chip"><span class="chip-letter">${row.grade.letter}</span></span></td>
        </tr>
      `;
    }).join('');
  }

  function bindEvents() {
    const table = root.querySelector('#table-history');
    if (!table) return;

    // Sorting
    root.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.sort;
        if (sortField === field) {
          sortAsc = !sortAsc;
        } else {
          sortField = field;
          sortAsc = false;
        }
        render();
      });
    });

    // Row click -> Load into workspace
    root.querySelector('#tbody-history').addEventListener('click', (e) => {
      const rowEl = e.target.closest('.hist-row');
      if (!rowEl) return;
      const id = rowEl.dataset.id;
      loadItemIntoWorkspace(id);
    });

    root.querySelector('#tbody-history').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const rowEl = e.target.closest('.hist-row');
        if (rowEl) {
          e.preventDefault();
          loadItemIntoWorkspace(rowEl.dataset.id);
        }
      }
    });

    // Checkboxes
    root.querySelector('#tbody-history').addEventListener('change', (e) => {
      if (e.target.classList.contains('check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateSelectionUI();
      }
    });

    // Compare button
    const cmpBtn = root.querySelector('#btn-compare-selected');
    if (cmpBtn) {
      cmpBtn.addEventListener('click', () => {
        showComparePanel();
      });
    }

    // Close compare panel
    const closeCmp = root.querySelector('#btn-close-cmp');
    if (closeCmp) {
      closeCmp.addEventListener('click', () => {
        root.querySelector('#hist-compare-panel').hidden = true;
      });
    }

    // Export CSV
    const expBtn = root.querySelector('#btn-export-csv');
    if (expBtn) {
      expBtn.addEventListener('click', () => {
        exportCSV();
      });
    }

    // Clear history 2-step confirmation
    const clearCont = root.querySelector('#clear-container');
    if (clearCont) {
      clearCont.addEventListener('click', (e) => {
        if (e.target.id === 'btn-clear-hist') {
          clearCont.innerHTML = `
            <div class="confirm">
              <button type="button" class="btn btn-sm btn-danger" id="btn-confirm-clear">Confirm clear</button>
              <button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-clear">Cancel</button>
            </div>
          `;
          clearTimeout(clearTimer);
          clearTimer = setTimeout(() => {
            render();
          }, 5000);
        } else if (e.target.id === 'btn-confirm-clear') {
          clearTimeout(clearTimer);
          S.storage.clearHistory();
          selectedIds.clear();
          render();
          S.ui.toast('History cleared');
        } else if (e.target.id === 'btn-cancel-clear') {
          clearTimeout(clearTimer);
          render();
        }
      });
    }
  }

  function updateSelectionUI() {
    const cmpBtn = root.querySelector('#btn-compare-selected');
    if (cmpBtn) {
      const count = selectedIds.size;
      cmpBtn.textContent = `Compare selected (${count})`;
      cmpBtn.disabled = count !== 2;
    }
    // Update row highlight
    root.querySelectorAll('.hist-row').forEach(row => {
      const id = row.dataset.id;
      row.classList.toggle('is-selected', selectedIds.has(id));
    });
  }

  function loadItemIntoWorkspace(id) {
    const history = S.storage.getHistory();
    const item = history.find(h => h.id === id);
    if (!item) return;
    window.location.hash = '#/estimate';
    setTimeout(() => {
      if (S.views && S.views.estimate) {
        S.views.estimate.loadInput(item.input);
        S.ui.toast(`Loaded estimate from ${new Date(item.ts).toLocaleTimeString()}`);
      }
    }, 50);
  }

  function showComparePanel() {
    if (selectedIds.size !== 2) return;
    const history = S.storage.getHistory();
    const ids = Array.from(selectedIds);
    const itemA = history.find(h => h.id === ids[0]);
    const itemB = history.find(h => h.id === ids[1]);
    if (!itemA || !itemB) return;

    const diff = itemB.score - itemA.score;
    const isUp = diff > 0.001;
    const isDown = diff < -0.001;

    const panel = root.querySelector('#hist-compare-panel');
    const content = root.querySelector('#hist-compare-content');
    panel.hidden = false;

    const diffs = [];
    P.INPUT_FIELDS.forEach(col => {
      if (itemA.input[col] !== itemB.input[col]) {
        diffs.push({
          label: P.FIELDS[col].label,
          before: P.formatValue(col, itemA.input[col]),
          after: P.formatValue(col, itemB.input[col])
        });
      }
    });

    content.innerHTML = `
      <div class="cmp">
        <div class="cmp-flow">
          <span class="cmp-tag">Record 1</span> <strong>${itemA.score.toFixed(1)}</strong>
          <span class="cmp-arrow">→</span>
          <span class="cmp-tag">Record 2</span> <strong>${itemB.score.toFixed(1)}</strong>
        </div>
        <div class="cmp-delta ${isUp ? 'up' : (isDown ? 'down' : 'zero')}">
          ${S.ui.signed(diff)} marks
        </div>
        <ul class="cmp-diff">
          ${diffs.map(d => `
            <li>
              <span>${d.label}</span>
              <span class="mono">${d.before} → ${d.after}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function exportCSV() {
    const history = S.storage.getHistory();
    if (!history.length) return;
    const headers = ['id', 'timestamp', 'date', 'study_hours', 'class_attendance', 'sleep_hours', 'sleep_quality', 'study_method', 'facility_rating', 'predicted_score', 'grade'];
    const rows = history.map(h => [
      h.id,
      h.ts,
      new Date(h.ts).toISOString(),
      h.input.study_hours,
      h.input.class_attendance,
      h.input.sleep_hours,
      h.input.sleep_quality,
      h.input.study_method,
      h.input.facility_rating,
      h.score,
      h.grade.letter
    ]);
    const csvContent = [headers.join(',')].concat(rows.map(r => r.join(','))).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scorecast_history_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    S.ui.toast('History exported as CSV');
  }

  S.views = S.views || {};
  S.views.history = { init, onShow: () => { if (root) render(); } };
})();
