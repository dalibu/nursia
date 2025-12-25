#!/usr/bin/env python3
import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.models import Base
from database.core import engine

async def create_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("База данных создана")

async def main():
    try:
        await create_database()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())