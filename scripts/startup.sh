#!/bin/bash
set -e

echo "Ensuring data directory exists..."
mkdir -p data

echo "Running system setup (database, settings, categories, currencies, admin)..."
python scripts/setup_system.py

echo "Starting application with reload enabled..."
exec uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
