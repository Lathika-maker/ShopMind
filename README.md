# SHOPMIND — Full-Stack Retail Decision Intelligence Platform

SHOPMIND is an end-to-end retail decision science platform designed for merchandising directors, pricing strategists, and inventory planners. It enables users to upload retail transaction datasets, validate schema and quality, train chronological forecasting models without future leakage, detect demand regimes, estimate econometric price elasticity, simulate commercial decisions under explicit business constraints, and conduct stress testing across demand shocks.

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
   $$\text{estimated\_profit} = (\text{selling\_price} - \text{unit\_cost}) \times \text{fulfilled} - \text{promotion\_cost} - \text{advertising\_cost}$$

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
4. **Demand Forecasting & Evaluation**: Train baseline, Moving Average, Linear Regression, and Random Forest models on chronological 80/20 train/test split. View MAE, RMSE, R² (with math caveats), Actual vs. Predicted time series charts, Residual distribution histogram & scatter, feature importances bar chart.
5. **Demand-Regime Analysis**: Statistical regime detection (High/Normal/Low demand via 14-day rolling Z-score), product-level regime breakdown, historical regime timeline, forecast error segregated by regime.
6. **Price Sensitivity & Elasticity**: OLS log-log elasticity calculation with confounder controls (promotions, weekend calendar), 95% confidence intervals, price vs demand scatter plot with regression curves, elasticity classification, association vs causation disclaimer.
7. **Decision Studio**: Interactive simulation sandbox with sliders and inputs for Product, Selling Price, Unit Cost, Discount %, Promo Cost, Ad Cost, Inventory, Competitor Price. Computes fulfilled, unmet, leftover, revenue, estimated profit, and stock-out risk % using exact verified formulas.
8. **Scenario Stress Testing**: Uncertainty-aware stress tests comparing Baseline, Conservative (-25% demand shock), and Surge (+35% demand spike) with financial and inventory impacts.
9. **Scenario Comparison**: Side-by-side comparison of saved scenarios with delta analysis, profit vs risk trade-off chart, and CSV export.
10. **Constraint-Aware Decision Center**: Multi-criteria optimization ranking scenarios against configurable constraints (e.g., minimum margin % >= 35%, max stock-out risk <= 15%, max price ceiling), transparent weighted scoring breakdown.
11. **Explainable Insights & Diagnostics**: Structured 5-field insights (What observed, Supporting data, Why it matters, Recommended investigation, Uncertainty & limitations) auto-generated from active data.
12. **Settings & Business Constraints**: Global default constraints, model hyperparameters, dataset metadata, system diagnostic logs, and environment documentation.

---

## 4. Execution & Verification

### Running Automated Calculation Unit Tests
Execute the automated test suite verifying all 36 test assertions:
```bash
npm test
```
Result: `TEST SUMMARY: 36 Passed, 0 Failed`

### Building for Production
```bash
npm run build
```

### Running Development Server
```bash
npm run dev
```
Dev server starts at `http://0.0.0.0:3000`.

### Running Python Microservice with PostgreSQL
```bash
cd backend
docker-compose up --build
```
FastAPI Swagger docs will be accessible at `http://localhost:8000/docs`.

---

## 5. Security & Reliability Controls
- **Input Validation**: Rigorous numeric bounds checking on prices, discounts, and inventory.
- **Zero Future Leakage**: All forecasting train/test partitions are chronologically split by date.
- **Safe File Handling**: Client-side CSV stream parsing with memory limit caps (50MB) and validation error reporting.
- **No Hardcoded Secrets**: Secrets and API keys are isolated via environment variables (`.env.example`).
