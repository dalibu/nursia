import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from fastapi import APIRouter, Depends, HTTPException
from database.core import get_db
from database.models import Currency
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from api.auth.oauth import get_admin_user, get_current_user
from database.models import User
from pydantic import BaseModel

router = APIRouter(prefix="/currencies", tags=["currencies"])

class CurrencyCreate(BaseModel):
    code: str
    name: str
    symbol: str
    is_active: bool = True

class CurrencyUpdate(BaseModel):
    name: str
    symbol: str
    is_active: bool
    is_default: bool = False

@router.get("/")
async def get_currencies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список доступных валют"""
    result = await db.execute(select(Currency).where(Currency.is_active == True))
    currencies = result.scalars().all()
    
    return {
        "currencies": [currency.code for currency in currencies],
        "details": [
            {
                "id": currency.id,
                "code": currency.code,
                "name": currency.name,
                "symbol": currency.symbol,
                "is_active": currency.is_active,
                "is_default": currency.is_default
            }
            for currency in currencies
        ]
    }

@router.get("/all")
async def get_all_currencies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить все валюты (только для админов)"""
    result = await db.execute(select(Currency))
    currencies = result.scalars().all()
    
    return [
        {
            "id": currency.id,
            "code": currency.code,
            "name": currency.name,
            "symbol": currency.symbol,
            "is_active": currency.is_active,
            "is_default": currency.is_default,
            "created_at": currency.created_at
        }
        for currency in currencies
    ]

@router.post("/")
async def create_currency(
    currency_data: CurrencyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать новую валюту (только для админов)"""
    # Проверяем уникальность кода
    result = await db.execute(select(Currency).where(Currency.code == currency_data.code.upper()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Currency code already exists")
    
    currency = Currency(
        code=currency_data.code.upper(),
        name=currency_data.name,
        symbol=currency_data.symbol,
        is_active=currency_data.is_active
    )
    
    db.add(currency)
    await db.commit()
    await db.refresh(currency)
    
    return {
        "id": currency.id,
        "code": currency.code,
        "name": currency.name,
        "symbol": currency.symbol,
        "is_active": currency.is_active,
        "is_default": currency.is_default
    }

@router.put("/{currency_id}")
async def update_currency(
    currency_id: int,
    currency_data: CurrencyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить валюту (только для админов)"""
    result = await db.execute(select(Currency).where(Currency.id == currency_id))
    currency = result.scalar_one_or_none()
    
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    currency.name = currency_data.name
    currency.symbol = currency_data.symbol
    currency.is_active = currency_data.is_active
    
    # Если устанавливаем как default, снимаем default с всех остальных
    if currency_data.is_default:
        await db.execute(
            select(Currency).where(Currency.id != currency_id)
        )
        result = await db.execute(select(Currency).where(Currency.id != currency_id))
        other_currencies = result.scalars().all()
        for other_currency in other_currencies:
            other_currency.is_default = False
        currency.is_default = True
    else:
        currency.is_default = False
    
    await db.commit()
    await db.refresh(currency)
    
    return {
        "id": currency.id,
        "code": currency.code,
        "name": currency.name,
        "symbol": currency.symbol,
        "is_active": currency.is_active,
        "is_default": currency.is_default
    }

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить валюту (только для админов)"""
    result = await db.execute(select(Currency).where(Currency.id == currency_id))
    currency = result.scalar_one_or_none()
    
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    await db.delete(currency)
    await db.commit()
    
    return {"message": "Currency deleted successfully"}