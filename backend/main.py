"""
SHOPMIND — FastAPI Retail Decision Intelligence Service
"""

import os
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

from .database import engine, Base, get_db
from .models import DatasetModel, ScenarioModel, ForecastRunModel
from .schemas import (
    ScenarioInputSchema,
    ScenarioSimulationResponse,
    BusinessConstraintsSchema,
)
from .services.decision_engine import compute_decision_outcomes, evaluate_scenario_constraints

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SHOPMIND Retail Decision Intelligence API",
    description="Production-grade retail intelligence platform for demand forecasting, regime detection, price sensitivity analysis, and scenario simulation.",
    version="1.0.0"
)

# CORS configuration
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "shopmind-fastapi-backend",
        "database": str(engine.url)
    }

@app.post("/api/scenarios/simulate", response_model=ScenarioSimulationResponse)
def simulate_scenario_endpoint(payload: ScenarioInputSchema):
    if payload.demand_assumption is None:
        raise HTTPException(
            status_code=422,
            detail="Provide demand_assumption from the active uploaded dataset or as an explicitly stated user assumption. The Python service does not invent baseline demand.",
        )

    effective_price = payload.selling_price * (1.0 - (payload.discount_pct / 100.0))
    assumed_demand = payload.demand_assumption
    outcomes = compute_decision_outcomes(
        demand=assumed_demand,
        inventory=payload.inventory,
        selling_price=effective_price,
        unit_cost=payload.unit_cost,
        promotion_cost=payload.promotion_cost,
        advertising_cost=payload.advertising_cost
    )

    is_feasible, violated = evaluate_scenario_constraints(
        effective_price=effective_price,
        margin_pct=outcomes["profit_margin_pct"],
        stockout_risk_pct=outcomes["stock_out_risk_percent"],
        constraints={"min_profit_margin_pct": 25.0, "max_stock_out_risk_pct": 15.0}
    )

    return ScenarioSimulationResponse(
        scenario_id=payload.id or "sim_preview",
        name=payload.name,
        product_id=payload.product_id,
        product_name=payload.product_id,
        selling_price=payload.selling_price,
        unit_cost=payload.unit_cost,
        discount_pct=payload.discount_pct,
        effective_price=round(effective_price, 2),
        promotion_cost=payload.promotion_cost,
        advertising_cost=payload.advertising_cost,
        inventory=payload.inventory,
        demand=assumed_demand,
        demand_source="user_assumed",
        fulfilled=outcomes["fulfilled"],
        unmet=outcomes["unmet"],
        leftover=outcomes["leftover"],
        revenue=outcomes["revenue"],
        estimated_profit=outcomes["estimated_profit"],
        profit_margin_pct=outcomes["profit_margin_pct"],
        stock_out_risk_percent=outcomes["stock_out_risk_percent"],
        is_feasible=is_feasible,
        violated_constraints=violated,
        created_at=datetime.now(timezone.utc).isoformat()
    )
