#!/usr/bin/env python3
"""
Скрипт для создания администратора с новой системой аутентификации
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

import asyncio
from passlib.context import CryptContext
from database.core import AsyncSessionLocal
from database.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    username = input("Введите логин админа: ")
    password = input("Введите пароль: ")
    full_name = input("Введите полное имя: ")
    email = input("Введите email (необязательно): ") or None
    
    password_hash = pwd_context.hash(password)
    
    async with AsyncSessionLocal() as session:
        # Проверяем, есть ли уже такой пользователь
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            print(f"❌ Пользователь {username} уже существует!")
            return
        
        # Создаем админа
        admin = User(
            username=username,
            password_hash=password_hash,
            email=email,
            full_name=full_name,
            role="admin",
            status="active"
        )
        
        session.add(admin)
        await session.commit()
        
        print(f"✅ Администратор {username} создан успешно!")

if __name__ == "__main__":
    asyncio.run(create_admin())