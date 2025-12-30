#!/usr/bin/env python3
import asyncio
import sys
import hashlib
import bcrypt
from pathlib import Path
from sqlalchemy import select

# Добавляем корень проекта в путь
sys.path.append(str(Path(__file__).parent.parent))

from database.core import engine, AsyncSessionLocal
from database.models import Base, User, UserRole, SystemSetting, PaymentCategory, Currency

async def setup_database():
    """Создаёт все таблицы в базе данных, если они не существуют."""
    print("Инициализация структуры базы данных...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Структура таблиц готова.")

async def init_settings(session):
    settings = [
        {"key": "app_name", "value": "Nursia", "description": "Название приложения"},
        {"key": "remember_me_hours", "value": "24", "description": "Время запоминания пользователя (часы)"},
        {"key": "jwt_access_token_expire_minutes", "value": "480", "description": "Время жизни JWT токена (минуты)"},
        {"key": "password_rules", "value": "Пароль должен содержать минимум 6 символов и 1 цифру", "description": "Требования к паролю"},
        {"key": "security_login_delay_enabled", "value": "true", "description": "Включить задержку при неверном входе (защита от перебора)"},
        {"key": "security_login_delay_seconds", "value": "1.0", "description": "Длительность задержки в секундах"}
    ]
    
    created = 0
    for s_data in settings:
        result = await session.execute(select(SystemSetting).where(SystemSetting.key == s_data["key"]))
        if not result.scalar_one_or_none():
            session.add(SystemSetting(**s_data))
            created += 1
    if created > 0:
        print(f"Создано {created} настроек.")

async def init_categories(session):
    categories = [
        {"name": "Аванс", "description": "Авансовые платежи"},
        {"name": "Долг", "description": "Погашение долгов"},
        {"name": "Зарплата", "description": "Заработная плата"},
        {"name": "Коммунальные", "description": "Коммунальные платежи"},
        {"name": "Медицина", "description": "Медицинские платежи"},
        {"name": "Одежда", "description": "Платежи за одежду и обувь"},
        {"name": "Подарки", "description": "Платежи за подарки и сувениры"},
        {"name": "Премии", "description": "Премии и бонусы"},
        {"name": "Продукты", "description": "Платежи за продукты питания"},
        {"name": "Прочее", "description": "Прочие платежи"},
        {"name": "Развлечения", "description": "Платежи за развлечения и досуг"},
        {"name": "Транспорт", "description": "Платежи за транспорт"}
    ]
    created = 0
    for c_data in categories:
        result = await session.execute(select(PaymentCategory).where(PaymentCategory.name == c_data["name"]))
        if not result.scalar_one_or_none():
            session.add(PaymentCategory(**c_data))
            created += 1
    if created > 0:
        print(f"Создано {created} категорий.")

async def init_currencies(session):
    currencies = [
        {"code": "UAH", "name": "Украинская гривна", "symbol": "₴", "is_default": True},
        {"code": "USD", "name": "Доллар США", "symbol": "$", "is_default": False},
        {"code": "EUR", "name": "Евро", "symbol": "€", "is_default": False},
    ]
    created = 0
    for curr_data in currencies:
        result = await session.execute(select(Currency).where(Currency.code == curr_data["code"]))
        if not result.scalar_one_or_none():
            session.add(Currency(**curr_data))
            created += 1
    if created > 0:
        print(f"Создано {created} валют.")

async def init_admin(session):
    # Проверяем наличие любого админа
    result = await session.execute(select(User).where(User.role == UserRole.ADMIN))
    if result.scalar_one_or_none():
        return

    print("Создание стандартного администратора (admin/admin123)...")
    username = "admin"
    password = "admin123"
    
    # Hash password
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    password_hash = bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    admin = User(
        username=username,
        password_hash=password_hash,
        full_name="Administrator",
        role=UserRole.ADMIN,
        status="active",
        force_password_change=True
    )
    session.add(admin)
    print("Администратор создан. Требуется смена пароля при входе.")

async def main():
    # Сначала создаём таблицы (если их нет)
    await setup_database()
    
    # Затем наполняем данными
    async with AsyncSessionLocal() as session:
        await init_settings(session)
        await init_categories(session)
        await init_currencies(session)
        await init_admin(session)
        await session.commit()
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
