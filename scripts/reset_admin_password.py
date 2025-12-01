#!/usr/bin/env python3
import sys
import asyncio
from pathlib import Path

# Добавляем корневую директорию в путь
sys.path.append(str(Path(__file__).parent.parent))

from database.core import AsyncSessionLocal
from database.models import User
from sqlalchemy import select
import bcrypt

def hash_password_double(password: str) -> str:
    """Двойное хеширование: SHA-256 + bcrypt"""
    # Сначала SHA-256 (как на клиенте)
    import hashlib
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    # Затем bcrypt с солью
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(sha256_hash.encode('utf-8'), salt).decode('utf-8')

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

if __name__ == "__main__":
    asyncio.run(reset_admin_password())