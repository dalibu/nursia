#!/usr/bin/env python3
import sys
import asyncio
from pathlib import Path

# Добавляем корневую директорию в путь
sys.path.append(str(Path(__file__).parent.parent))

from database.core import AsyncSessionLocal, engine
from database.models import User
from sqlalchemy import select
from utils.password_utils import hash_password_double

async def reset_admin_password():
    """Сбросить пароль администратора"""
    async with AsyncSessionLocal() as db:
        # Найти всех администраторов
        result = await db.execute(select(User).where(User.role == "admin"))
        admins = result.scalars().all()
        
        if not admins:
            print("Администраторы не найдены!")
            return
        
        # Установить новый пароль для всех администраторов
        new_password = "admin123"
        
        for admin in admins:
            admin.password_hash = hash_password_double(new_password)
            print(f"Пароль для пользователя '{admin.username}' сброшен на: {new_password}")
        
        await db.commit()
        
        print("Теперь вы можете войти в систему с паролем: admin123")

async def main():
    try:
        await reset_admin_password()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())