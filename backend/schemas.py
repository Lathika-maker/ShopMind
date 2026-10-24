from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class DataRecordSchema(BaseModel):
    id: str
    date: str
    product_id: str
    product_name: str
    category: str
    units_sold: float
    price: float
    unit_cost: float
    discount_pct: float = 0.0
    promo_active: bool = False
    inventory_on_hand: float = 0.0
    competitor_price: float = 0.0

class DatasetMetadataSchema(BaseModel):
    id: str
    name: str
    source: str
    row_count: int
    is_synthetic: bool
    date_range: Dict[str, str]
    products: List[str]
    categories: List[str]

class ScenarioInputSchema(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    product_id: str
    selling_price: float = Field(gt=0)
    unit_cost: float = Field(ge=0)
    discount_pct: float = Field(default=0.0, ge=0, le=100)
    promotion_cost: float = Field(default=0.0, ge=0)
    advertising_cost: float = Field(default=0.0, ge=0)
    inventory: float = Field(ge=0)
    competitor_price: Optional[float] = None
    is_promo: Optional[bool] = False

class ScenarioSimulationResponse(BaseModel):
    scenario_id: str
    name: str
    product_id: str
    product_name: str
    selling_price: float
    unit_cost: float
    discount_pct: float
    effective_price: float
    promotion_cost: float
    advertising_cost: float
    inventory: float
    demand: float
    demand_source: str
    fulfilled: float
    unmet: float
    leftover: float
    revenue: float
    estimated_profit: float
    profit_margin_pct: float
    stock_out_risk_percent: float
    is_feasible: bool
    violated_constraints: List[str] = []
    decision_score: Optional[float] = None
    created_at: str

class ForecastRequestSchema(BaseModel):
    product_id: str
    algorithm: str = "linear_regression"
    train_ratio: float = 0.8

class BusinessConstraintsSchema(BaseModel):
    min_profit_margin_pct: float = 25.0
    max_stock_out_risk_pct: float = 15.0
    min_inventory_coverage_units: float = 50.0
    max_price_ceiling: float = 500.0
    min_price_floor: float = 15.0
