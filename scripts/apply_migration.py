#!/usr/bin/env python3
"""
Скрипт для применения миграции системы регистрации
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

import asyncio
import sqlite3
from database.core import engine

async def apply_migration():
    # Подключаемся к SQLite напрямую
    db_path = "data/nursia.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Добавляем новые поля в таблицу users
        print("Добавляем поля в таблицу users...")
        
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'username' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN username VARCHAR(50)")
        if 'password_hash' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)")
        if 'email' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN email VARCHAR(100)")
        if 'status' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'pending'")
        if 'id' not in columns:
            # Создаем новую таблицу с правильной структурой
            cursor.execute("""
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id BIGINT,
                    username VARCHAR(50) UNIQUE,
                    password_hash VARCHAR(255),
                    email VARCHAR(100),
                    full_name VARCHAR(255) NOT NULL,
                    role VARCHAR(20) DEFAULT 'pending',
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Копируем данные
            cursor.execute("""
                INSERT INTO users_new (telegram_id, full_name, role, created_at, updated_at)
                SELECT telegram_id, full_name, role, created_at, updated_at FROM users
            """)
            
            # Удаляем старую таблицу и переименовываем новую
            cursor.execute("DROP TABLE users")
            cursor.execute("ALTER TABLE users_new RENAME TO users")
        
        # Создаем таблицу заявок на регистрацию
        print("Создаем таблицу registration_requests...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS registration_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reviewed_at DATETIME,
                reviewed_by INTEGER
            )
        """)
        
        conn.commit()
        print("✅ Миграция применена успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка миграции: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    asyncio.run(apply_migration())