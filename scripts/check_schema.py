#!/usr/bin/env python3
import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import engine
from sqlalchemy import text

async def check_schema():
    async with engine.connect() as conn:
        res = await conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in res.fetchall()]
        print(f"Columns in 'users' table: {columns}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_schema())
