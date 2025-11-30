import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import User, UserRole
from sqlalchemy import select

async def create_admin():
    telegram_id = int(input("Введите Telegram ID администратора: "))
    full_name = input("Введите имя администратора: ")
    
    async for session in get_db():
        # Проверяем, существует ли пользователь
        result = await session.execute(select(User).where(User.telegram_id == telegram_id))
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            existing_user.role = UserRole.ADMIN
            existing_user.full_name = full_name
            await session.commit()
            print(f"Пользователь {full_name} обновлен до администратора")
        else:
            admin = User(
                telegram_id=telegram_id,
                full_name=full_name,
                role=UserRole.ADMIN
            )
            session.add(admin)
            await session.commit()
            print(f"Администратор {full_name} создан с ID {telegram_id}")
        break

if __name__ == "__main__":
    asyncio.run(create_admin())