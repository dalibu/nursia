import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import Dict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.core import get_db
from database.models import SystemSetting
from api.auth.oauth import get_current_user

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("/")
async def get_currencies(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Dict:
    # Получаем доступные валюты
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "available_currencies"))
    currencies_setting = result.scalar_one_or_none()
    currencies = currencies_setting.value.split(",") if currencies_setting else ["UAH"]
    
    # Получаем символы валют
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "currency_symbols"))
    symbols_setting = result.scalar_one_or_none()
    symbols = {}
    if symbols_setting:
        for pair in symbols_setting.value.split(","):
            code, symbol = pair.split(":")
            symbols[code] = symbol
    
    # Получаем валюту по умолчанию
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "default_currency"))
    default_setting = result.scalar_one_or_none()
    default_currency = default_setting.value if default_setting else "UAH"
    
    return {
        "currencies": currencies,
        "symbols": symbols,
        "default": default_currency
    }