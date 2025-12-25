import asyncio
import sys
import getpass
import bcrypt
import hashlib
import argparse
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import User, UserRole
from sqlalchemy import select


def safe_input(prompt: str) -> str:
    """Safe input that handles encoding issues in Docker"""
    try:
        value = input(prompt)
        # Fix surrogate characters from terminal encoding issues
        return value.encode('utf-8', errors='surrogateescape').decode('utf-8', errors='replace')
    except Exception:
        return input(prompt)


def hash_password(password: str) -> str:
    # Сначала SHA-256 (как на фронтенде)
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    # Затем bcrypt
    return bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


async def create_admin(username: str = None, password: str = None, full_name: str = None):
    force_password_change = False
    
    if not username:
        print("=== Создание администратора ===\n")
        username = safe_input("Логин: ").strip()
        if not username:
            print("Ошибка: логин не может быть пустым")
            return
    
    if password:
        # Пароль передан через CLI - требуется смена при первом входе
        force_password_change = True
        print(f"⚠️  Пароль задан через командную строку - пользователь должен будет сменить его при первом входе")
    else:
        # Интерактивный ввод пароля с подтверждением
        password = getpass.getpass("Пароль: ")
        if len(password) < 4:
            print("Ошибка: пароль должен быть минимум 4 символа")
            return
        
        password_confirm = getpass.getpass("Подтвердите пароль: ")
        if password != password_confirm:
            print("Ошибка: пароли не совпадают")
            return
    
    if not full_name:
        full_name = safe_input("Полное имя (Enter = использовать логин): ").strip() or username
    
    email = safe_input("Email (необязательно): ").strip() or None
    telegram_id_str = safe_input("Telegram ID (необязательно): ").strip()
    telegram_id = int(telegram_id_str) if telegram_id_str else None
    
    password_hash = hash_password(password)
    
    async for session in get_db():
        # Проверяем, существует ли пользователь с таким username
        result = await session.execute(select(User).where(User.username == username))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            existing_user.role = UserRole.ADMIN
            existing_user.full_name = full_name
            existing_user.password_hash = password_hash
            existing_user.status = "active"
            existing_user.force_password_change = force_password_change
            if telegram_id:
                existing_user.telegram_id = telegram_id
            if email:
                existing_user.email = email
            await session.commit()
            print(f"\n✅ Пользователь '{username}' обновлен до администратора")
        else:
            admin = User(
                username=username,
                password_hash=password_hash,
                telegram_id=telegram_id,
                full_name=full_name,
                email=email,
                role=UserRole.ADMIN,
                status="active",
                force_password_change=force_password_change
            )
            session.add(admin)
            await session.commit()
            print(f"\n✅ Администратор '{username}' успешно создан!")
        
        print(f"\nДанные для входа:")
        print(f"  Логин: {username}")
        if force_password_change:
            print(f"  ⚠️  Потребуется смена пароля при первом входе")
        break


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Create admin user')
    parser.add_argument('--username', '-u', help='Admin username')
    parser.add_argument('--password', '-p', help='Initial password (user will be forced to change it)')
    parser.add_argument('--name', '-n', help='Full name')
    args = parser.parse_args()
    
    asyncio.run(create_admin(args.username, args.password, args.name))