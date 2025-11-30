import asyncio
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from database.core import get_db
from database.models import ExpenseCategory

async def init_categories():
    categories = [
        {"name": "Продукты", "description": "Расходы на продукты питания"},
        {"name": "Коммунальные", "description": "Коммунальные платежи"},
        {"name": "Транспорт", "description": "Расходы на транспорт"},
        {"name": "Медицина", "description": "Медицинские расходы"},
        {"name": "Развлечения", "description": "Развлечения и досуг"},
        {"name": "Одежда", "description": "Одежда и обувь"},
        {"name": "Подарки", "description": "Подарки и сувениры"},
        {"name": "Зарплата помощникам", "description": "Оплата труда домохозяек и сиделок"},
        {"name": "Премии", "description": "Премии и бонусы"},
        {"name": "Прочее", "description": "Прочие расходы"}
    ]
    
    async for session in get_db():
        from sqlalchemy import select
        created = 0
        for cat_data in categories:
            result = await session.execute(select(ExpenseCategory).where(ExpenseCategory.name == cat_data["name"]))
            if not result.scalar_one_or_none():
                category = ExpenseCategory(**cat_data)
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