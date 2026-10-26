# SHOPMIND — Full-Stack Retail Decision Intelligence Platform

SHOPMIND is a retail decision-support application for uploaded POS and time-series sales data. It validates CSV schemas, exposes data-quality issues, aggregates transactions to product-days for demand modeling, evaluates chronological forecasts against a naive baseline, estimates observational price sensitivity when data supports it, simulates decisions under explicit assumptions and constraints, runs demand stress tests, and provides structured insights plus optional Gemini-powered natural-language analysis.

Every displayed analytical result originates directly from the active dataset, a fitted econometric model, or an explicitly stated simulation assumption.

---

## 1. Core Architecture

### Integrated Full-Stack Layer (Active Development & Production on Port 3000)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts data-driven visualizations.
- **Server**: Express (`server.ts`) mounting Vite middleware in development and serving optimized static assets in production.
- **Calculation Engine**: `src/services/calculations.ts` implementing verified decision simulation formulas, OLS Normal Equations with Ridge regularizer, chronological train/test splits, and rolling Z-score regime detection.
- **Demo Benchmark**: Deterministic 365-day synthetic retail POS dataset across 5 merchandise lines (`src/data/syntheticDemo.ts`), clearly labelled as synthetic.

### Microservice Layer (`/backend`)
- **Framework**: Python 3.10+, FastAPI, Pydantic v2 schemas.
- **Analytics**: Pandas, NumPy, Scikit-learn (`LinearRegression`, `RandomForestRegressor`).
- **Persistence & Migrations**: PostgreSQL, SQLAlchemy 2.0 ORM, and Alembic migrations.
- **Containerization**: `Dockerfile` and `docker-compose.yml` for multi-container deployment with PostgreSQL.

---

## 2. Verified Mathematical & Decision Formulas

The platform implements and tests the following commercial equations:

1. **Fulfilled Units**:
   $$\text{fulfilled} = \min(\max(\text{demand}, 0), \max(\text{inventory}, 0))$$

2. **Unmet Demand**:
   $$\text{unmet} = \max(\text{demand} - \text{inventory}, 0)$$

3. **Leftover Inventory**:
   $$\text{leftover} = \max(\text{inventory} - \text{demand}, 0)$$

4. **Gross Revenue**:
   $$\text{revenue} = \text{effective\_selling\_price} \times \text{fulfilled}$$

5. **Estimated Operating Profit**:
   $\text{estimated\_profit} = (\text{effective\_selling\_price} - \text{unit\_cost}) \times \text{fulfilled} - \text{promotion\_cost} - \text{advertising\_cost}$

6. **Stock-Out Vulnerability Risk**:
   $$\text{stock\_out\_risk\_percent} = \begin{cases} \max\left(0, \frac{\text{demand} - \text{inventory}}{\text{demand}} \times 100\right), & \text{if } \text{demand} > 0 \\ 0, & \text{otherwise} \end{cases}$$

7. **Error Metrics**:
   $$\text{MAE} = \frac{1}{n} \sum |y_i - \hat{y}_i|, \quad \text{RMSE} = \sqrt{\frac{1}{n} \sum (y_i - \hat{y}_i)^2}$$
   $$R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2} \quad (\text{evaluated when target variance } > 0)$$

---

## 3. The 12 Application Modules

1. **Overview Dashboard**: High-level retail telemetry, active dataset metrics, demand trend preview, regime distribution, top recommended action card, quick navigation.
2. **Data Explorer & CSV Ingestion**: Upload CSV with drag-and-drop, interactive column mapping modal, product/date filters, paginated table, export cleaned CSV, dataset switcher.
3. **Data Quality & Validation**: Data health scorecard (null checks, duplicate detection, range checks, negative value validation, temporal continuity, statistical distribution table, actionable cleaning advice).
4. **Demand Forecasting & Evaluation**: Aggregate transaction rows into one observation per recorded product-day, use a chronological train/holdout split, and compare the selected model with a naive last-observation benchmark on the same holdout. View MAE, RMSE, MAPE, R², actual-versus-predicted trajectory, residual diagnostics, feature importance where supported, and date-coverage warnings. Small holdouts are explicitly labelled as unstable.
5. **Demand-Regime Analysis**: High/normal/low classification via a 14-observation rolling Z-score on recorded product-days. Missing calendar dates are not silently imputed as zero-demand days; the UI discloses product-day and calendar coverage.
6. **Price Sensitivity & Elasticity**: Log-log OLS estimate only when mapped price data, price variation, and sample size are sufficient. A promotional control is included only when a complete promotion flag exists; weekend timing is derived from the record date. Confidence intervals and p-values are approximate, and the estimate is an observational association—not a causal effect.
7. **Decision Studio**: Interactive simulation sandbox with sliders and inputs for Product, Selling Price, Unit Cost, Discount %, Promo Cost, Ad Cost, Inventory, Competitor Price. Computes fulfilled, unmet, leftover, revenue, estimated profit, and stock-out risk % using exact verified formulas.
8. **Scenario Stress Testing**: Compare the baseline with user-configurable conservative and high-demand shocks. Monetary outputs use the selected dataset currency where specified; this setting formats values only and does not convert them.
9. **Scenario Comparison**: Side-by-side comparison of saved scenarios with delta analysis, profit vs risk trade-off chart, and CSV export.
10. **Constraint-Aware Decision Center**: Multi-criteria optimization ranking scenarios against configurable constraints (e.g., minimum margin % >= 35%, max stock-out risk <= 15%, max price ceiling), transparent weighted scoring breakdown.
11. **Explainable Insights & Diagnostics**: Structured evidence-derived findings plus natural-language dataset Q&A powered by the server-side Google Gen AI SDK when `GEMINI_API_KEY` is configured. The AI receives compact aggregate summaries and model diagnostics—not the raw transaction rows—and must distinguish observed facts, model estimates, and assumptions.
12. **Settings & Business Constraints**: Global default constraints, model hyperparameters, dataset metadata, system diagnostic logs, and environment documentation.

---

## 4. Execution & Verification

### Running Automated Tests
Run the calculation, CSV-ingestion, daily-aggregation, currency-formatting, constraint, and AI-context regression suites:
```bash
npm test
```
The authoritative current result is the GitHub Actions check for the commit you are using; do not rely on an old hard-coded assertion count.

### Building for Production
```bash
npm run build
```

### Running the Development Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000`. The Vite API middleware and application state run in the same development process. After pulling updates, restart the dev server and hard-refresh the browser; the project disables HMR for its iframe environment.

### Optional Gemini-powered questions
Create an ignored local `.env` file based on `.env.example`, replace the placeholder `GEMINI_API_KEY` with a real key, then restart the server. Do not commit `.env` or expose the key in client-side `VITE_*` variables. The default model is `gemini-3.8-flash`; `GEMINI_MODEL` may override it. Without a configured key, deterministic empirical insights remain available and the AI question panel reports a configuration error.

### Running Python Microservice with PostgreSQL
```bash
cd backend
docker-compose up --build
```
FastAPI Swagger docs will be accessible at `http://localhost:8000/docs`.

---

## 5. Security & Reliability Controls
- **Input Validation**: Rigorous numeric bounds checking on prices, discounts, and inventory.
- **Forecast Hygiene**: Forecasting and demand regimes operate at recorded product-day grain, use chronological holdouts, report observed-date coverage, and avoid treating absent dates as zero sales. A same-holdout naive baseline helps contextualize model accuracy.
- **Safe File Handling**: CSV parser supports quoted delimiters and quoted line breaks, rejects malformed rows and ambiguous dates, caps client upload size at 40 MB, and provides row-specific validation errors. Negative quantities are rejected by default; excluding them as returns/cancellations is an explicit user choice.
- **No Hardcoded Secrets**: Secrets and API keys are isolated via environment variables (`.env.example`).
