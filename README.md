# Scorecast — Exam Score Estimator

Scorecast is an in-browser academic analytics instrument and exam score estimator trained on 20,000 real student observations. It delivers deterministic, explainable predictions with empirical intervals, interactive what-if levers, and complete dataset visualizations without frameworks or servers.

---

## Quick Start

### Option 1: Direct File Opening
Double-click `index.html` in your file explorer. It runs fully offline under `file://` with zero external build tools, package managers, or server requirements.

### Option 2: Local HTTP Server
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your web browser.

---

## Data Pipeline

The project is built on `Exam_Score_Prediction.csv` (20,000 rows, 13 features). If the CSV is updated, re-generate the compact columnar bundle:

```bash
python tools/build_data.py
```
This produces `js/data.js` using Python standard library only.

---

## Statistical Modeling & Metrics

All models are trained inside the browser on an 80% training split (16,000 students) and evaluated strictly on a held-out 20% test split (4,000 students) using a deterministic PRNG (seed 42).

### Held-out Test Performance

| Model | MAE | RMSE | R² Score | Note |
|---|---|---|---|---|
| **Baseline (Mean)** | 15.40 | 18.86 | -0.002 | Predicts sample mean (62.5) |
| **OLS (6 Predictors)** | **7.89** | **9.85** | **0.727** | **Serving model** (exact explanations) |
| **OLS (All 11 Features)** | 7.89 | 9.85 | 0.726 | Contextual variables add zero signal |
| **Gradient Boosted Trees** | 7.98 | 9.96 | 0.720 | 150 trees, depth 3, histogram bins |

### Key Findings & Limitations
1. **Primary Drivers:** Daily study hours (correlation $r = 0.72$) and class attendance ($r = 0.31$) drive over 80% of score variation. Sleep quality, study method, and facility rating each offer an additional 8–10 mark shift.
2. **Excluded Variables:** Gender, degree course, internet access, and exam difficulty show virtually zero correlation ($r \approx 0.00$) and their subgroup means all lie within $\pm 0.8$ marks of 62.5. They are purposefully excluded from the input form to prevent spurious extrapolation.
3. **Correlational, Not Causal:** Predictions represent observed historical associations among students. They are probabilistic expectations, not individual guarantees.
4. **Range Safeguards:** Form controls are bounded strictly to observed data ranges (e.g., study hours capped at 8.0 h rather than arbitrary 16 h) to avoid out-of-distribution hallucinations.

---

## Project Structure

```text
crazy/
├── Exam_Score_Prediction.csv   # Source dataset (20,000 rows)
├── index.html                  # Accessible application shell
├── README.md                   # Documentation & evaluation benchmarks
├── PROMPT.md                   # Build specification prompt
├── css/
│   ├── tokens.css              # Design tokens (dark & light color palettes)
│   ├── base.css                # Typography, reset, and shell layout
│   └── components.css          # Panels, sliders, segmented radios, tables, charts
├── js/
│   ├── data.js                 # Columnar JSON bundle of 20,000 rows (generated)
│   ├── dataset.js              # Parsing, summaries, seeded split, correlation
│   ├── models.js               # OLS normal equations, GBT booster, permutation importance
│   ├── predictor.js            # Predictor API, intervals, waterfall decomposition, levers
│   ├── storage.js              # LocalStorage cache (history, grade bands, models)
│   ├── charts.js               # Canvas primitives (histogram, scatter, dot plot, strip, hbars)
│   ├── app.js                  # State orchestration, hash router, theme toggle
│   └── views/
│       ├── estimate.js         # Interactive prediction workspace & what-if levers
│       ├── explore.js          # 20k dataset distributions and scatter correlations
│       ├── model.js            # Model benchmarks, diagnostic charts, coefficients
│       └── history.js          # Saved predictions table, scenario comparison, CSV export
└── tools/
    └── build_data.py           # Python stdlib CSV-to-JS columnar compiler
```
