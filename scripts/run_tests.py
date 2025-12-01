#!/usr/bin/env python3
"""
Скрипт для запуска тестов
"""
import subprocess
import sys
from pathlib import Path

# Добавляем корень проекта в путь
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

def run_tests():
    """Запуск всех тестов"""
    print("🧪 Запуск unit tests...")
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            str(project_root / "tests"), 
            "-v", 
            "--tb=short",
            "--color=yes"
        ], check=True, cwd=project_root)
        
        print("✅ Все тесты прошли успешно!")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Тесты завершились с ошибкой: {e}")
        return False
    except FileNotFoundError:
        print("❌ pytest не найден. Установите: pip install pytest pytest-asyncio")
        return False

def run_coverage():
    """Запуск тестов с покрытием кода"""
    print("📊 Запуск тестов с анализом покрытия...")
    
    try:
        subprocess.run([
            sys.executable, "-m", "pytest", 
            str(project_root / "tests"),
            "--cov=api",
            "--cov=database", 
            "--cov-report=html",
            "--cov-report=term"
        ], check=True, cwd=project_root)
        
        print("✅ Отчет о покрытии создан в htmlcov/")
        
    except subprocess.CalledProcessError:
        print("❌ Ошибка при создании отчета о покрытии")
    except FileNotFoundError:
        print("❌ pytest-cov не найден. Установите: pip install pytest-cov")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--coverage":
        run_coverage()
    else:
        run_tests()