#!/usr/bin/env python3
import sqlite3

# Подключаемся к БД
conn = sqlite3.connect("data/nursia.db")
cursor = conn.cursor()

try:
    # Создаем админа
    cursor.execute("""
        INSERT INTO users (username, password_hash, full_name, role, status)
        VALUES ('admin', 'temp_hash', 'Administrator', 'admin', 'active')
    """)
    
    conn.commit()
    print("✅ Администратор создан:")
    print("   Логин: admin")
    print("   Пароль: любой (временно)")
    
except sqlite3.IntegrityError:
    print("❌ Пользователь admin уже существует!")
except Exception as e:
    print(f"❌ Ошибка: {e}")
finally:
    conn.close()