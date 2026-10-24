"""
SHOPMIND Retail Decision Engine (Python Service)
Implements exact, tested formulas for decision outcomes, risk, and constraint evaluation.
"""

from typing import Dict, Any, List

def compute_decision_outcomes(
    demand: float,
    inventory: float,
    selling_price: float,
    unit_cost: float,
    promotion_cost: float = 0.0,
    advertising_cost: float = 0.0
) -> Dict[str, float]:
    """
    Rigorously calculates fulfilled demand, unmet volume, leftover stock,
    revenue, estimated operating profit, and stock-out vulnerability.
    """
    fulfilled = min(max(demand, 0.0), max(inventory, 0.0))
    unmet = max(demand - inventory, 0.0)
    leftover = max(inventory - demand, 0.0)
    revenue = selling_price * fulfilled
    estimated_profit = (selling_price - unit_cost) * fulfilled - promotion_cost - advertising_cost

    stock_out_risk_percent = (
        max(0.0, ((demand - inventory) / demand) * 100.0)
        if demand > 0.0
        else 0.0
    )

    profit_margin_pct = (estimated_profit / revenue * 100.0) if revenue > 0 else 0.0

    return {
        "fulfilled": round(fulfilled, 2),
        "unmet": round(unmet, 2),
        "leftover": round(leftover, 2),
        "revenue": round(revenue, 2),
        "estimated_profit": round(estimated_profit, 2),
        "profit_margin_pct": round(profit_margin_pct, 1),
        "stock_out_risk_percent": round(stock_out_risk_percent, 1),
    }

def evaluate_scenario_constraints(
    effective_price: float,
    margin_pct: float,
    stockout_risk_pct: float,
    constraints: Dict[str, Any]
) -> tuple[bool, List[str]]:
    violated = []
    min_margin = constraints.get("min_profit_margin_pct", 25.0)
    max_stockout = constraints.get("max_stock_out_risk_pct", 15.0)
    price_ceiling = constraints.get("max_price_ceiling", 500.0)
    price_floor = constraints.get("min_price_floor", 15.0)

    if margin_pct < min_margin:
        violated.append(f"Margin {margin_pct}% is below required minimum {min_margin}%")
    if stockout_risk_pct > max_stockout:
        violated.append(f"Stockout risk {stockout_risk_pct}% exceeds ceiling {max_stockout}%")
    if effective_price > price_ceiling:
        violated.append(f"Price ${effective_price} exceeds ceiling ${price_ceiling}")
    if effective_price < price_floor:
        violated.append(f"Price ${effective_price} is below floor ${price_floor}")

    return len(violated) == 0, violated
