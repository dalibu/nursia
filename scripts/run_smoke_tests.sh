#!/bin/bash
# Smoke Tests Runner
# Запускается при старте контейнера для проверки базовой работоспособности

set -e

echo "🧪 Running smoke tests..."

cd /app

# Запускаем только smoke-тесты
python -m pytest tests/test_smoke.py -v --tb=short

echo "✅ Smoke tests passed!"
