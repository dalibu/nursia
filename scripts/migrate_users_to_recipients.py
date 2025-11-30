import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import User, Recipient
from sqlalchemy import select

async def migrate_users():
    async for session in get_db():
        # Получаем всех пользователей
        users_result = await session.execute(select(User))
        users = users_result.scalars().all()
        
        for user in users:
            # Проверяем, есть ли уже такой получатель
            existing = await session.execute(
                select(Recipient).where(
                    Recipient.name == user.full_name,
                    Recipient.type == 'user'
                )
            )
            if not existing.scalar_one_or_none():
                recipient = Recipient(
                    name=user.full_name,
                    type='user',
                    description=f'Пользователь системы (ID: {user.telegram_id})'
                )
                session.add(recipient)
        
        await session.commit()
        print(f'Пользователи добавлены в таблицу получателей')
        break

if __name__ == "__main__":
    asyncio.run(migrate_users())