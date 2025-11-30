#!/usr/bin/env python3
"""
Простой скрипт для создания администратора
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

import asyncio
import sqlite3
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    # Подключаемся к SQLite напрямую
    db_path = "data/nursia.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        username = "admin"
        password = "admin123"
        full_name = "Administrator"
        email = "admin@example.com"
        
        # Проверяем, есть ли уже такой пользователь
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            print(f"❌ Пользователь {username} уже существует!")
            return
        
        # Хешируем пароль
        password_hash = pwd_context.hash(password)
        
        # Создаем админа
        cursor.execute("""
            INSERT INTO users (username, password_hash, email, full_name, role, status)
            VALUES (?, ?, ?, ?, 'admin', 'active')
        """, (username, password_hash, email, full_name))
        
        conn.commit()
        print(f"✅ Администратор создан:")
        print(f"   Логин: {username}")
        print(f"   Пароль: {password}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(create_admin())