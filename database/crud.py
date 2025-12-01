from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import User, UserRole

from datetime import datetime
from sqlalchemy import select

async def get_user(session: AsyncSession, telegram_id: int) -> Optional[User]:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()

async def create_user(
    session: AsyncSession, 
    telegram_id: int, 
    full_name: str, 
    username: str,
    password_hash: str = "temp_hash",
    role: UserRole = UserRole.PENDING
) -> User:
    user = User(
        telegram_id=telegram_id,
        full_name=full_name,
        username=username,
        password_hash=password_hash,
        role=role
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user

async def update_user_role(session: AsyncSession, telegram_id: int, new_role: UserRole) -> Optional[User]:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if user:
        user.role = new_role
        await session.commit()
        await session.refresh(user)
    return user

async def get_pending_users(session: AsyncSession) -> List[User]:
    stmt = select(User).where(User.role == UserRole.PENDING)
    result = await session.execute(stmt)
    return list(result.scalars().all())

async def get_all_users(session: AsyncSession) -> List[User]:
    stmt = select(User)
    result = await session.execute(stmt)
    return list(result.scalars().all())



