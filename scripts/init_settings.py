#!/usr/bin/env python3
import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import AsyncSessionLocal, engine
from database.models import SystemSetting
from sqlalchemy import select

async def init_settings():
    settings = [
        {"key": "app_name", "value": "Nursia", "description": "Название приложения"},
        {"key": "remember_me_hours", "value": "24", "description": "Время запоминания пользователя (часы)"},
        {"key": "jwt_access_token_expire_minutes", "value": "480", "description": "Время жизни JWT токена (минуты)"},
        {"key": "password_rules", "value": "Пароль должен содержать минимум 6 символов и 1 цифру", "description": "Требования к паролю"},
        {"key": "security_login_delay_enabled", "value": "true", "description": "Включить задержку при неверном входе (защита от перебора)"},
        {"key": "security_login_delay_seconds", "value": "1.0", "description": "Длительность задержки в секундах"}
    ]
    
    async with AsyncSessionLocal() as session:
        created = 0
        for setting_data in settings:
            result = await session.execute(select(SystemSetting).where(SystemSetting.key == setting_data["key"]))
            if not result.scalar_one_or_none():
                setting = SystemSetting(**setting_data)
                session.add(setting)
                created += 1
        
        if created > 0:
            await session.commit()
            print(f"Создано {created} настроек", flush=True)
        else:
            print("Все настройки уже существуют", flush=True)
    
    # Explicitly dispose engine to release all connections
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_settings())