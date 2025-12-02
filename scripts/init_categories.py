import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import PaymentCategory

async def init_categories():
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
    
    async for session in get_db():
        from sqlalchemy import select
        created = 0
        for cat_data in categories:
            result = await session.execute(select(PaymentCategory).where(PaymentCategory.name == cat_data["name"]))
            if not result.scalar_one_or_none():
                category = PaymentCategory(**cat_data)
                session.add(category)
                created += 1
        
        if created > 0:
            await session.commit()
            print(f"Создано {created} новых категорий")
        else:
            print("Все категории уже существуют")
        break

if __name__ == "__main__":
    asyncio.run(init_categories())