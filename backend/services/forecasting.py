"""
SHOPMIND Demand Forecasting Service (Python / Scikit-Learn)
Chronological train/test split, multiple models (Naive, Moving Average, Linear Regression, Random Forest),
residual diagnostics, and model limitations reporting.
"""

from typing import Dict, Any, List, Optional
import math

def chronological_split(records: List[Dict[str, Any]], train_ratio: float = 0.8):
    sorted_recs = sorted(records, key=lambda x: x["date"])
    split_idx = max(1, int(len(sorted_recs) * train_ratio))
    return sorted_recs[:split_idx], sorted_recs[split_idx:]

def compute_metrics(actuals: List[float], predictions: List[float]) -> Dict[str, Any]:
    n = len(actuals)
    if n == 0:
        return {"mae": 0.0, "rmse": 0.0, "r2": None, "mape": 0.0}

    mae = sum(abs(a - p) for a, p in zip(actuals, predictions)) / n
    mse = sum((a - p) ** 2 for a, p in zip(actuals, predictions)) / n
    rmse = math.sqrt(mse)

    mean_actual = sum(actuals) / n
    ss_tot = sum((a - mean_actual) ** 2 for a in actuals)
    ss_res = sum((a - p) ** 2 for a, p in zip(actuals, predictions))

    r2 = None
    if ss_tot > 1e-9:
        r2 = round(1.0 - (ss_res / ss_tot), 3)

    mape_terms = [abs((a - p) / a) for a, p in zip(actuals, predictions) if a > 0]
    mape = (sum(mape_terms) / len(mape_terms) * 100.0) if mape_terms else 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": r2,
        "mape": round(mape, 1),
    }
