import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import SystemSetting
from sqlalchemy import select

async def init_settings():
    settings = [
        {"key": "default_currency", "value": "UAH", "description": "Валюта по умолчанию"},
        {"key": "available_currencies", "value": "UAH,EUR,USD,RUB", "description": "Доступные валюты"},
        {"key": "currency_symbols", "value": "UAH:₴,EUR:€,USD:$,RUB:₽", "description": "Символы валют"},
        {"key": "app_name", "value": "Nursia", "description": "Название приложения"},
        {"key": "timezone", "value": "Europe/Kiev", "description": "Часовой пояс"},
        {"key": "remember_me_hours", "value": "24", "description": "Время запоминания пользователя (часы)"}
    ]
    
    async for session in get_db():
        created = 0
        for setting_data in settings:
            result = await session.execute(select(SystemSetting).where(SystemSetting.key == setting_data["key"]))
            if not result.scalar_one_or_none():
                setting = SystemSetting(**setting_data)
                session.add(setting)
                created += 1
        
        if created > 0:
            await session.commit()
            print(f"Создано {created} настроек")
        else:
            print("Все настройки уже существуют")
        break

if __name__ == "__main__":
    asyncio.run(init_settings())