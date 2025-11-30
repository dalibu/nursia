#!/usr/bin/env python3
"""
Скрипт для сборки React приложения в production режиме
"""
import subprocess
import sys
import os
from pathlib import Path

def main():
    project_root = Path(__file__).parent.parent
    frontend_dir = project_root / "frontend"
    
    if not frontend_dir.exists():
        print("❌ Директория frontend не найдена")
        sys.exit(1)
    
    print("🔨 Сборка React приложения...")
    
    try:
        # Установка зависимостей
        print("📦 Установка зависимостей...")
        subprocess.run(["npm", "install"], cwd=frontend_dir, check=True)
        
        # Сборка приложения
        print("⚡ Сборка приложения...")
        subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)
        
        build_dir = frontend_dir / "build"
        if build_dir.exists():
            print("✅ React приложение успешно собрано!")
            print(f"📁 Файлы находятся в: {build_dir}")
        else:
            print("❌ Ошибка сборки - директория build не создана")
            sys.exit(1)
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Ошибка при сборке: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("❌ npm не найден. Установите Node.js")
        sys.exit(1)

if __name__ == "__main__":
    main()