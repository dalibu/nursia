#!/usr/bin/env python3
"""
Скрипт быстрого развертывания Nursia
"""
import subprocess
import sys
from pathlib import Path

def run_command(command, description):
    """Выполнить команду с описанием"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} - успешно")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} - ошибка: {e.stderr}")
        return False

def main():
    """Главная функция развертывания"""
    print("🚀 Развертывание Nursia Expense Tracker")
    print("=" * 50)
    
    # Проверяем Python версию
    if sys.version_info < (3, 8):
        print("❌ Требуется Python 3.8 или выше")
        return
    
    # Устанавливаем зависимости
    if not run_command("pip install -r requirements.txt", "Установка зависимостей"):
        return
    
    # Применяем миграции
    if not run_command("alembic upgrade head", "Применение миграций БД"):
        return
    
    # Инициализируем категории
    run_command("python scripts/init_categories.py", "Инициализация категорий")
    
    print("\n🎉 Развертывание завершено!")
    print("\n📋 Доступные команды:")
    print("  python scripts/run_api.py          - Запуск REST API")
    print("  python bot/main.py                 - Запуск Telegram бота")
    print("\n🌐 Интерфейсы:")
    print("  REST API: http://localhost:8000")
    print("  API Docs: http://localhost:8000/docs")
    print("  Web UI: http://localhost:8000/app")
    print("  Mobile UI: http://localhost:8000/mobile")
    
    # Предлагаем запустить сервисы
    response = input("\n❓ Запустить API сервер сейчас? (y/n): ")
    if response.lower() in ['y', 'yes', 'да']:
        print("\n🚀 Запуск API сервера...")
        subprocess.run([sys.executable, "scripts/run_api.py"])

if __name__ == "__main__":
    main()