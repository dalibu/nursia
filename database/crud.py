from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import User, UserRole
from database.models import Action
from datetime import datetime
from sqlalchemy import select

async def get_user(session: AsyncSession, telegram_id: int) -> Optional[User]:
    return await session.get(User, telegram_id)

async def create_user(
    session: AsyncSession, 
    telegram_id: int, 
    full_name: str, 
    username: Optional[str] = None,
    role: UserRole = UserRole.PENDING
) -> User:
    user = User(
        telegram_id=telegram_id,
        full_name=full_name,
        username=username,
        role=role
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user

async def update_user_role(session: AsyncSession, telegram_id: int, new_role: UserRole) -> Optional[User]:
    user = await get_user(session, telegram_id)
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


async def create_action(
    session: AsyncSession,
    telegram_id: int,
    full_name: Optional[str],
    username: Optional[str],
    start_ts: datetime,
    stop_ts: Optional[datetime],
    duration_seconds: Optional[int],
) -> Action:
    action = Action(
        telegram_id=telegram_id,
        full_name=full_name,
        username=username,
        start_ts=start_ts,
        stop_ts=stop_ts,
        duration_seconds=duration_seconds,
    )
    session.add(action)
    await session.commit()
    await session.refresh(action)
    return action


async def get_actions_by_user(session: AsyncSession, telegram_id: int, limit: int = 20):
    stmt = select(Action).where(Action.telegram_id == telegram_id).order_by(Action.id.desc()).limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())
