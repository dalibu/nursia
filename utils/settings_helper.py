from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.models import SystemSetting
from database.core import get_db

async def get_setting(key: str, default_value: str = None) -> str:
    """Получить настройку из базы данных"""
    async for session in get_db():
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            return setting.value
        return default_value
        break

async def get_jwt_expire_minutes() -> int:
    """Получить время жизни JWT токена из настроек"""
    value = await get_setting("jwt_access_token_expire_minutes", "480")
    return int(value)