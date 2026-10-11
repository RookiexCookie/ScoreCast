/* Charts: small, reusable, theme-aware canvas primitives + one shared tooltip. */
(function () {
  'use strict';
  const S = (window.Scorecast = window.Scorecast || {});

  let colors = {};
  let fonts = { mono: 'monospace', sans: 'sans-serif' };

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    colors = {
      bg: g('--bg'), surface: g('--surface'), line: g('--line'), lineStrong: g('--line-strong'),
      text: g('--text'), text2: g('--text-2'), text3: g('--text-3'),
      you: g('--you'), pop: g('--pop'), up: g('--up'), down: g('--down'),
    };
    fonts = { mono: g('--font-mono'), sans: g('--font-sans') };
  }

  function rgba(hex, a) {
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const col = (name) => colors[name] || name;

  /* ---------- Mounting & resize ---------- */
  const mounts = new Map();
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
      for (const e of entries) {
        const m = mounts.get(e.target);
        if (!m) continue;
        const w = Math.round(e.contentRect.width);
        if (w > 0 && w !== m.w) { m.w = w; m.draw(); }
      }
    })
    : null;

  function mount(canvas, draw) {
    let m = mounts.get(canvas);
    if (!m) { m = { w: 0, draw }; mounts.set(canvas, m); if (ro) ro.observe(canvas); }
    m.draw = draw;
    if (canvas.clientWidth > 0) { m.w = Math.round(canvas.clientWidth); draw(); }
  }

  function redrawAll() {
    readColors();
    mounts.forEach((m, canvas) => { if (canvas.isConnected && canvas.clientWidth > 0) m.draw(); });
  }

  function prep(canvas) {
    if (!colors.text) readColors();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `11px ${fonts.mono}`;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    return { ctx, w, h };
  }

  /* ---------- Scales & axes ---------- */
  function scale(d0, d1, r0, r1) {
    const k = (r1 - r0) / ((d1 - d0) || 1);
    const f = (v) => r0 + (v - d0) * k;
    f.inv = (p) => d0 + (p - r0) / k;
    return f;
  }
  function niceStep(range, count) {
    const raw = range / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(min, max, count = 5) {
    const step = niceStep((max - min) || 1, count);
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  const fmtNum = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(Math.round(v * 100) / 100));

  function gridY(ctx, F, ys, yt, fmt) {
    ctx.strokeStyle = colors.line; ctx.fillStyle = colors.text3;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach((v) => {
      const y = Math.round(ys(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(F.x0, y); ctx.lineTo(F.x1, y); ctx.stroke();
      ctx.fillText((fmt || fmtNum)(v), F.x0 - 8, y);
    });
  }
  function axisX(ctx, F, xs, xt, fmt) {
    ctx.fillStyle = colors.text3; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.forEach((v) => ctx.fillText((fmt || fmtNum)(v), xs(v), F.y1 + 6));
  }
  function axisLabels(ctx, F, w, h, xLabel, yLabel) {
    ctx.font = `11px ${fonts.sans}`; ctx.fillStyle = colors.text2;
    if (xLabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(xLabel, F.x1, h - 1); }
    if (yLabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(yLabel, 0, 0); }
    ctx.font = `11px ${fonts.mono}`;
  }

  /* ---------- Tooltip ---------- */
  const tipEl = document.createElement('div');
  tipEl.className = 'chart-tip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  const tip = {
    show(html, x, y) {
      tipEl.innerHTML = html;
      tipEl.style.display = 'block';
      const r = tipEl.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      tipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    },
    hide() { tipEl.style.display = 'none'; },
  };
  window.addEventListener('scroll', tip.hide, { passive: true });

  function bindHover(canvas, onMove, onLeave) {
    canvas._hover = onMove;
    canvas._leave = onLeave;
    if (canvas._hoverBound) return;
    canvas._hoverBound = true;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const html = canvas._hover && canvas._hover(e.clientX - r.left, e.clientY - r.top);
      if (html) tip.show(html, e.clientX, e.clientY); else tip.hide();
    });
    canvas.addEventListener('pointerleave', () => { tip.hide(); if (canvas._leave) canvas._leave(); });
  }

  /* ---------- Histogram ---------- */
  function histogram(canvas, o) {
    let hk = -1;
    const nb = Math.round((o.max - o.min) / o.bin);
    const counts = new Array(nb).fill(0);
    const v = o.values;
    for (let i = 0; i < v.length; i++) {
      let k = Math.floor((v[i] - o.min) / o.bin);
      if (k < 0) k = 0; if (k >= nb) k = nb - 1;
      counts[k]++;
    }
    const ymax = Math.max(1, ...counts) * 1.1;
    let F, xs;
    const draw = () => {
      const { ctx, w, h } = prep(canvas);
      F = { x0: 44, x1: w - 8, y0: 20, y1: h - 34 };
      xs = scale(o.min, o.max, F.x0, F.x1);
      const ys = scale(0, ymax, F.y1, F.y0);
      gridY(ctx, F, ys, ticks(0, ymax, 4));
      const c = col(o.color || 'pop');
      for (let k = 0; k < nb; k++) {
        if (!counts[k]) continue;
        const x = xs(o.min + k * o.bin) + 0.5, x2 = xs(o.min + (k + 1) * o.bin) - 0.5;
        const y = ys(counts[k]);
        ctx.fillStyle = rgba(c, k === hk ? 1 : 0.7);
        ctx.fillRect(x, y, Math.max(1, x2 - x), F.y1 - y);
      }
      axisX(ctx, F, xs, o.xTicks || ticks(o.min, o.max, 5));
      (o.markers || []).forEach((m, i) => {
        const x = Math.round(xs(m.x)) + 0.5;
        ctx.strokeStyle = col(m.color || 'text'); ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, F.y0 - 4); ctx.lineTo(x, F.y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col(m.color || 'text2'); ctx.textBaseline = 'bottom';
        ctx.textAlign = i % 2 ? 'left' : 'right';
        ctx.fillText(`${m.label} ${m.x.toFixed(1)}`, x + (i % 2 ? 5 : -5), F.y0 - 4);
      });
      axisLabels(ctx, F, w, h, o.xLabel, o.yLabel);
    };
    mount(canvas, draw);
    bindHover(canvas, (mx, my) => {
      if (!F || mx < F.x0 || mx > F.x1 || my < F.y0 - 8 || my > F.y1) { if (hk !== -1) { hk = -1; draw(); } return null; }
      const k = Math.min(nb - 1, Math.max(0, Math.floor((xs.inv(mx) - o.min) / o.bin)));
      if (k !== hk) { hk = k; draw(); }
      const lo = o.min + k * o.bin;
      const fmt = o.fmtX || ((x) => x.toFixed(1));
      return `<b>${fmt(lo)} – ${fmt(lo + o.bin)}</b><br>${counts[k].toLocaleString()} ${o.unit || 'students'}`;
    }, () => { if (hk !== -1) { hk = -1; draw(); } });
  }

  /* ---------- Scatter (density by alpha) ---------- */
  function scatter(canvas, o) {
    let hi = -1;
    let P = null;
    const draw = () => {
      const { ctx, w, h } = prep(canvas);
      const F = { x0: 40, x1: w - 10, y0: 20, y1: h - 34 };
      const [xa, xb] = o.xDomain, [ya, yb] = o.yDomain;
      const xs = scale(xa, xb, F.x0, F.x1), ys = scale(ya, yb, F.y1, F.y0);
      gridY(ctx, F, ys, ticks(ya, yb, 4));
      axisX(ctx, F, xs, ticks(xa, xb, 5));
      const x = o.x, y = o.y, n = x.length;
      const size = o.size || 2.5, half = size / 2, cell = 10;
      const px = new Float32Array(n), py = new Float32Array(n), grid = new Map();
      ctx.fillStyle = rgba(col(o.color || 'pop'), o.alpha == null ? 0.14 : o.alpha);
      for (let i = 0; i < n; i++) {
        const X = xs(x[i]), Y = ys(y[i]);
        px[i] = X; py[i] = Y;
        ctx.fillRect(X - half, Y - half, size, size);
        const key = ((X / cell) | 0) * 4096 + ((Y / cell) | 0);
        let a = grid.get(key);
        if (!a) { a = []; grid.set(key, a); }
        a.push(i);
      }
      P = { px, py, grid, cell, F };
      ctx.save();
      ctx.beginPath(); ctx.rect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); ctx.clip();
      if (o.diagonal) {
        const lo = Math.max(xa, ya), up = Math.min(xb, yb);
        ctx.strokeStyle = colors.text2; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xs(lo), ys(lo)); ctx.lineTo(xs(up), ys(up)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (o.trend) {
        ctx.strokeStyle = colors.you; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(xs(xa), ys(o.trend.a + o.trend.b * xa)); ctx.lineTo(xs(xb), ys(o.trend.a + o.trend.b * xb)); ctx.stroke();
      }
      ctx.restore();
      if (hi >= 0 && hi < n) {
        ctx.strokeStyle = colors.text; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px[hi], py[hi], 5, 0, Math.PI * 2); ctx.stroke();
      }
      axisLabels(ctx, F, w, h, o.xLabel, o.yLabel);
    };
    mount(canvas, draw);
    bindHover(canvas, (mx, my) => {
      if (!P) return null;
      const cx = (mx / P.cell) | 0, cy = (my / P.cell) | 0;
      let best = -1, bd = 100;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const a = P.grid.get((cx + dx) * 4096 + (cy + dy));
        if (!a) continue;
        for (let j = 0; j < a.length; j++) {
          const i = a[j]; const d = (P.px[i] - mx) ** 2 + (P.py[i] - my) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best !== hi) { hi = best; draw(); }
      return best >= 0 ? o.tip(best) : null;
    }, () => { if (hi !== -1) { hi = -1; draw(); } });
  }

  /* ---------- Dot plot with CI whiskers ---------- */
  function dotPlot(canvas, o) {
    let hk = -1, F = null;
    const draw = () => {
      const { ctx, w, h } = prep(canvas);
      const labelW = o.labelW || 104;
      F = { x0: labelW, x1: w - 10, y0: 4, y1: h - 22 };
      const xs = scale(o.domain[0], o.domain[1], F.x0, F.x1);
      const rowH = (F.y1 - F.y0) / o.groups.length;
      ctx.strokeStyle = colors.line;
      const xt = ticks(o.domain[0], o.domain[1], 4);
      xt.forEach((v) => { const x = Math.round(xs(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, F.y0); ctx.lineTo(x, F.y1); ctx.stroke(); });
      axisX(ctx, F, xs, xt);
      if (o.ref != null) {
        const x = Math.round(xs(o.ref)) + 0.5;
        ctx.strokeStyle = colors.text3; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, F.y0); ctx.lineTo(x, F.y1); ctx.stroke(); ctx.setLineDash([]);
      }
      o.groups.forEach((g, i) => {
        const cy = F.y0 + rowH * (i + 0.5);
        ctx.font = `12px ${fonts.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = i === hk ? colors.text : colors.text2;
        ctx.fillText(g.label, 0, cy, labelW - 10);
        if (!Number.isFinite(g.mean)) return;
        ctx.strokeStyle = rgba(colors.pop, 0.7); ctx.lineWidth = 1.5;
        const a = xs(g.lo), b = xs(g.hi);
        ctx.beginPath(); ctx.moveTo(a, cy); ctx.lineTo(b, cy);
        ctx.moveTo(a, cy - 4); ctx.lineTo(a, cy + 4); ctx.moveTo(b, cy - 4); ctx.lineTo(b, cy + 4); ctx.stroke();
        ctx.fillStyle = colors.pop;
        ctx.beginPath(); ctx.arc(xs(g.mean), cy, i === hk ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1;
      });
      ctx.font = `11px ${fonts.mono}`;
    };
    mount(canvas, draw);
    bindHover(canvas, (mx, my) => {
      if (!F || my < F.y0 || my > F.y1) { if (hk !== -1) { hk = -1; draw(); } return null; }
      const k = Math.min(o.groups.length - 1, Math.floor((my - F.y0) / ((F.y1 - F.y0) / o.groups.length)));
      if (k !== hk) { hk = k; draw(); }
      const g = o.groups[k];
      return `<b>${g.label}</b><br>Mean <b>${g.mean.toFixed(1)}</b> · 95% CI ${g.lo.toFixed(1)}–${g.hi.toFixed(1)}<br><span class="tip-k">n = ${g.n.toLocaleString()}</span>`;
    }, () => { if (hk !== -1) { hk = -1; draw(); } });
  }

  /* ---------- Population strip (You vs Population) ---------- */
  function strip(canvas, o) {
    let F = null, xs = null;
    const nb = o.counts.length, bin = (o.max - o.min) / nb;
    const draw = () => {
      const { ctx, w, h } = prep(canvas);
      F = { x0: 1, x1: w - 1, y0: 4, y1: h - 18 };
      xs = scale(o.min, o.max, F.x0, F.x1);
      const maxC = Math.max(1, ...o.counts);
      if (o.interval) {
        ctx.fillStyle = rgba(colors.you, 0.16);
        ctx.fillRect(xs(o.interval.lo), F.y0, xs(o.interval.hi) - xs(o.interval.lo), F.y1 - F.y0);
      }
      ctx.fillStyle = rgba(colors.pop, 0.45);
      for (let k = 0; k < nb; k++) {
        const x = xs(o.min + k * bin) + 0.5, x2 = xs(o.min + (k + 1) * bin) - 0.5;
        const bh = (o.counts[k] / maxC) * (F.y1 - F.y0);
        ctx.fillRect(x, F.y1 - bh, Math.max(1, x2 - x), bh);
      }
      ctx.strokeStyle = colors.line; ctx.beginPath(); ctx.moveTo(F.x0, F.y1 + 0.5); ctx.lineTo(F.x1, F.y1 + 0.5); ctx.stroke();
      if (o.value != null) {
        const x = Math.round(xs(o.value)) + 0.5;
        ctx.strokeStyle = colors.you; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, F.y0 - 2); ctx.lineTo(x, F.y1 + 1); ctx.stroke();
        ctx.fillStyle = colors.you; ctx.beginPath(); ctx.arc(x, F.y0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = colors.text3; ctx.textBaseline = 'top';
      [0, 25, 50, 75, 100].forEach((v, i, arr) => {
        ctx.textAlign = i === 0 ? 'left' : i === arr.length - 1 ? 'right' : 'center';
        ctx.fillText(String(v), xs(v), F.y1 + 5);
      });
    };
    mount(canvas, draw);
    bindHover(canvas, (mx) => {
      if (!F) return null;
      const k = Math.min(nb - 1, Math.max(0, Math.floor((xs.inv(mx) - o.min) / bin)));
      const lo = o.min + k * bin;
      return `<b>${lo}–${lo + bin}</b><br>${o.counts[k].toLocaleString()} students`;
    });
  }

  /* ---------- Horizontal (grouped) bars ---------- */
  function hbars(canvas, o) {
    let hk = -1, F = null;
    const draw = () => {
      const { ctx, w, h } = prep(canvas);
      const labelW = o.labelW || 132;
      F = { x0: labelW, x1: w - 52, y0: o.ref ? 18 : 4, y1: h - 22 };
      let max = o.max || 0;
      o.rows.forEach((r) => r.values.forEach((v) => { if (v != null && v > max) max = v; }));
      if (o.ref && o.ref.value > max) max = o.ref.value;
      max *= 1.05;
      const xs = scale(0, max, F.x0, F.x1);
      const xt = ticks(0, max, 4);
      ctx.strokeStyle = colors.line;
      xt.forEach((v) => { const x = Math.round(xs(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, F.y0); ctx.lineTo(x, F.y1); ctx.stroke(); });
      axisX(ctx, F, xs, xt);
      const nS = o.series.length;
      const rowH = (F.y1 - F.y0) / o.rows.length;
      const barH = Math.min(14, (rowH * 0.62) / nS);
      o.rows.forEach((r, i) => {
        const cy = F.y0 + rowH * (i + 0.5);
        ctx.font = `12px ${fonts.sans}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = i === hk ? colors.text : colors.text2;
        ctx.fillText(r.label, 0, cy, labelW - 10);
        ctx.font = `11px ${fonts.mono}`;
        r.values.forEach((v, s) => {
          if (v == null) return;
          const y = cy - (nS * barH) / 2 + s * barH;
          const c = col((r.colors && r.colors[s]) || o.series[s].color);
          ctx.fillStyle = i === hk ? c : rgba(c, 0.85);
          ctx.fillRect(F.x0, y + 1, Math.max(1, xs(v) - F.x0), barH - 2);
          ctx.fillStyle = colors.text2; ctx.textAlign = 'left';
          ctx.fillText((o.fmt || ((x) => x.toFixed(2)))(v), xs(v) + 6, y + barH / 2);
        });
      });
      if (o.ref) {
        const x = Math.round(xs(o.ref.value)) + 0.5;
        ctx.strokeStyle = colors.text2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, F.y0 - 4); ctx.lineTo(x, F.y1); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = colors.text2; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.font = `11px ${fonts.sans}`;
        ctx.fillText(o.ref.label, x - 4, F.y0 - 4);
      }
    };
    mount(canvas, draw);
    bindHover(canvas, (mx, my) => {
      if (!F || my < F.y0 || my > F.y1) { if (hk !== -1) { hk = -1; draw(); } return null; }
      const k = Math.min(o.rows.length - 1, Math.floor((my - F.y0) / ((F.y1 - F.y0) / o.rows.length)));
      if (k !== hk) { hk = k; draw(); }
      const r = o.rows[k];
      const lines = r.values.map((v, s) => (v == null ? '' : `<span class="tip-k">${o.series[s].name}</span> <b>${(o.fmt || ((x) => x.toFixed(2)))(v)}</b>`)).filter(Boolean);
      return `<b>${r.label}</b><br>${lines.join('<br>')}`;
    }, () => { if (hk !== -1) { hk = -1; draw(); } });
  }

  /* ---------- Waterfall (DOM, diverging from a centre axis) ---------- */
  function waterfall(el, o) {
    const esc = S.ui.esc;
    const max = Math.max(1e-9, ...o.rows.map((r) => Math.abs(r.contribution)));
    const row = (r) => {
      const pos = r.contribution >= 0;
      const w = (Math.abs(r.contribution) / max) * 50;
      return `<div class="wf-row"><span class="wf-label" title="${esc(r.label)}">${esc(r.label)}<span class="wf-sub">${esc(r.valueText)}</span></span>` +
        `<span class="wf-track"><span class="wf-bar ${pos ? 'up' : 'down'}" style="width:${w.toFixed(2)}%"></span></span>` +
        `<span class="wf-val ${pos ? 'up' : 'down'}">${S.ui.signed(r.contribution)}</span></div>`;
    };
    el.innerHTML = `<div class="wf">` +
      `<div class="wf-row wf-edge"><span class="wf-label">${esc(o.baseLabel)}</span><span></span><span class="wf-val">${o.base.toFixed(1)}</span></div>` +
      o.rows.map(row).join('') +
      `<div class="wf-row wf-total"><span class="wf-label">${esc(o.totalLabel)}</span><span></span><span class="wf-val">${o.total.toFixed(1)}</span></div></div>`;
  }

  S.charts = { readColors, redrawAll, mount, tip, histogram, scatter, dotPlot, strip, hbars, waterfall, rgba };
})();
