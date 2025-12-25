#!/usr/bin/env python3
"""
Скрипт для просмотра содержимого БД
"""
import sqlite3
import sys

def view_table(table_name, limit=10):
    conn = sqlite3.connect('data/nursia.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute(f'SELECT * FROM {table_name} LIMIT {limit}')
        rows = cursor.fetchall()
        
        # Получаем названия колонок
        cursor.execute(f'PRAGMA table_info({table_name})')
        columns = [col[1] for col in cursor.fetchall()]
        
        print(f'\n=== {table_name.upper()} (показано {len(rows)} записей) ===')
        if rows:
            # Печатаем заголовки
            print(' | '.join(f'{col:15}' for col in columns))
            print('-' * (len(columns) * 17))
            
            # Печатаем данные
            for row in rows:
                print(' | '.join(f'{str(val)[:15]:15}' for val in row))
        else:
            print('Таблица пустая')
            
    except Exception as e:
        print(f'Ошибка: {e}')
    finally:
        conn.close()

def list_tables():
    conn = sqlite3.connect('data/nursia.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]
    
    print('Доступные таблицы:')
    for i, table in enumerate(tables, 1):
        print(f'{i}. {table}')
    
    conn.close()
    return tables

if __name__ == "__main__":
    if len(sys.argv) > 1:
        table_name = sys.argv[1]
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        view_table(table_name, limit)
    else:
        tables = list_tables()
        print('\nИспользование:')
        print('python scripts/view_db.py <table_name> [limit]')
        print('Например: python scripts/view_db.py users 5')