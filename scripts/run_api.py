#!/usr/bin/env python3
"""Запуск API сервера"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

import uvicorn

if __name__ == "__main__":
    uvicorn.run("api.main:app", host="0.0.0.0", port=8001, reload=True)