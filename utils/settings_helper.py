from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.models import SystemSetting
from database.core import get_db

async def get_jwt_expire_minutes() -> int:
    """Получить время жизни JWT токена из настроек"""
    async for session in get_db():
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == "jwt_access_token_expire_minutes")
        )
        setting = result.scalar_one_or_none()
        if setting:
            return int(setting.value)
        return 480  # Значение по умолчанию
        break