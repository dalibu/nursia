#!/bin/bash
# Run balance calculation tests from JSON fixtures
cd "$(dirname "$0")/.."
PYTHONPATH="$(pwd)" python -m pytest tests/test_balance_calculations.py -v "$@"
