# SHOPMIND Backend — Python FastAPI Microservice

This directory contains the production-grade Python/FastAPI microservice implementation for SHOPMIND, designed for PostgreSQL persistence, Alembic migrations, and Scikit-Learn data science services.

## Architecture

- **Web Framework**: FastAPI with Pydantic request/response validation.
- **ORM**: SQLAlchemy with declarative models (`datasets`, `scenarios`, `forecast_runs`).
- **Data Engine**: Pandas and NumPy.
- **Forecasting**: Scikit-Learn (LinearRegression, RandomForestRegressor) with chronological train/test splitting.
- **Database**: PostgreSQL (production) or SQLite (local development fallback).

## Quick Start (Docker)

To run the complete Python microservice alongside PostgreSQL:

```bash
cd backend
docker-compose up --build
```

The API will be available at `http://localhost:8000` with Swagger documentation at `http://localhost:8000/docs`.

## Local Development (Without Docker)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start API server
uvicorn main:app --reload --port 8000
```

## Running Tests

```bash
cd backend
pytest
```

## Verified Capabilities & Environment Status
- **Integrated Full-Stack Server**: The main application server runs on Node.js/Express (`server.ts`) with identical mathematical algorithms, serving both REST API endpoints and the React frontend on Port 3000.
- The Python codebase is provided as an enterprise microservice ready for containerized Kubernetes/Docker deployment.
