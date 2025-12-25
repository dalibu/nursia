import asyncio
import hashlib
import bcrypt
from sqlalchemy import select
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent.parent))

from database.core import engine, AsyncSessionLocal
from database.models import User

async def check_admin():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        user = result.scalar_one_or_none()
        if user:
            print(f"Админ найден: {user.username}, Роль: {user.role}, Статус: {user.status}")
            print(f"Колонки защиты: failed_login_attempts={user.failed_login_attempts}")
        else:
            print("Админ НЕ найден!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_admin())
