#!/usr/bin/env python3
"""
Скрипт для инициализации валют в базе данных
"""
import sys
import asyncio
from pathlib import Path

# Добавляем корневую директорию в путь
sys.path.append(str(Path(__file__).parent.parent))

from database.core import AsyncSessionLocal, engine
from database.models import Currency
from sqlalchemy import text


async def init_currencies():
    """Инициализация валют"""
    async with AsyncSessionLocal() as session:
        # Создаем таблицу если не существует
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS currencies (
                id INTEGER PRIMARY KEY,
                code VARCHAR(3) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                symbol VARCHAR(10) NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Проверяем, есть ли уже валюты
        result = await session.execute(text("SELECT COUNT(*) FROM currencies"))
        count = result.scalar()
        
        if count == 0:
            # Добавляем базовые валюты
            currencies = [
                Currency(code="UAH", name="Ukrainian Hryvnia", symbol="₴", is_active=True),
                Currency(code="EUR", name="Euro", symbol="€", is_active=True),
                Currency(code="USD", name="US Dollar", symbol="$", is_active=True),
            ]
            
            for currency in currencies:
                session.add(currency)
            
            await session.commit()
            print("✅ Валюты успешно инициализированы!")
        else:
            print("ℹ️ Валюты уже существуют в базе данных")


async def main():
    try:
        await init_currencies()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())