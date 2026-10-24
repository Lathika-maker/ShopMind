import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, JSON
from .database import Base

class DatasetModel(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    source = Column(String, default="uploaded_csv")
    row_count = Column(Integer, default=0)
    is_synthetic = Column(Boolean, default=False)
    date_start = Column(String, nullable=True)
    date_end = Column(String, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ScenarioModel(Base):
    __tablename__ = "scenarios"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    product_id = Column(String, nullable=False, index=True)
    product_name = Column(String, nullable=False)
    selling_price = Column(Float, nullable=False)
    unit_cost = Column(Float, nullable=False)
    discount_pct = Column(Float, default=0.0)
    promotion_cost = Column(Float, default=0.0)
    advertising_cost = Column(Float, default=0.0)
    inventory = Column(Float, nullable=False)
    demand = Column(Float, nullable=False)
    fulfilled = Column(Float, nullable=False)
    unmet = Column(Float, nullable=False)
    leftover = Column(Float, nullable=False)
    revenue = Column(Float, nullable=False)
    estimated_profit = Column(Float, nullable=False)
    profit_margin_pct = Column(Float, default=0.0)
    stock_out_risk_percent = Column(Float, default=0.0)
    is_feasible = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ForecastRunModel(Base):
    __tablename__ = "forecast_runs"

    id = Column(String, primary_key=True, index=True)
    product_id = Column(String, nullable=False, index=True)
    algorithm = Column(String, nullable=False)
    train_ratio = Column(Float, default=0.8)
    mae = Column(Float, nullable=False)
    rmse = Column(Float, nullable=False)
    r2 = Column(Float, nullable=True)
    mape = Column(Float, nullable=True)
    metrics_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
