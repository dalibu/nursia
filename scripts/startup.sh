#!/bin/bash
set -e

echo "Ensuring data directory exists..."
mkdir -p data

echo "Running database migrations..."
(cd database && python -m alembic upgrade head)

echo "Running system setup (database, settings, categories, currencies, admin)..."
python /app/scripts/setup_system.py

echo "🧪 Running smoke tests..."
python -m pytest tests/test_smoke.py -v --tb=short || { echo "❌ Smoke tests failed!"; exit 1; }
echo "✅ Smoke tests passed!"

echo "Starting application with reload enabled..."
exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
