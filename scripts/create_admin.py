import asyncio
import sys
import getpass
import bcrypt
import hashlib
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import User, UserRole
from sqlalchemy import select

def hash_password(password: str) -> str:
    # Сначала SHA-256 (как на фронтенде)
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    # Затем bcrypt
    return bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def create_admin():
    print("=== Создание администратора ===\n")
    
    username = input("Введите логин (username): ").strip()
    if not username:
        print("Ошибка: логин не может быть пустым")
        return
    
    password = getpass.getpass("Введите пароль: ")
    if len(password) < 4:
        print("Ошибка: пароль должен быть минимум 4 символа")
        return
    
    full_name = input("Введите полное имя: ").strip() or username
    email = input("Введите email (необязательно): ").strip() or None
    telegram_id_str = input("Введите Telegram ID (необязательно): ").strip()
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
                status="active"
            )
            session.add(admin)
            await session.commit()
            print(f"\n✅ Администратор '{username}' успешно создан!")
        
        print(f"\nДанные для входа:")
        print(f"  Логин: {username}")
        print(f"  Пароль: {'*' * len(password)}")
        break

if __name__ == "__main__":
    asyncio.run(create_admin())