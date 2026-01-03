"""
API роутер для трудовых отношений (RBAC версия)
В single-employer модели: EmploymentRelation связывает user с hourly_rate.
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from pydantic import BaseModel

from database.core import get_db
from database.models import User, EmploymentRelation
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/employment", tags=["employment"])


class EmploymentCreate(BaseModel):
    user_id: int
    hourly_rate: float
    currency: str = "UAH"


class EmploymentUpdate(BaseModel):
    hourly_rate: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class EmploymentResponse(BaseModel):
    id: int
    user_id: int
    hourly_rate: float
    currency: str
    is_active: bool
    user_name: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    employer_id: Optional[int] = None
    employer_name: Optional[str] = None


@router.get("/", response_model=List[EmploymentResponse])
async def get_employment_relations(
    user_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список трудовых отношений"""
    
    query = select(EmploymentRelation).options(
        joinedload(EmploymentRelation.user)
    )
    
    # Для обычного пользователя — только его трудовые отношения
    if not current_user.is_admin:
        query = query.where(EmploymentRelation.user_id == current_user.id)
    elif user_id:
        query = query.where(EmploymentRelation.user_id == user_id)
    
    if is_active is not None:
        query = query.where(EmploymentRelation.is_active == is_active)
    
    result = await db.execute(query)
    relations = result.scalars().all()
    
    return [
        EmploymentResponse(
            id=r.id,
            user_id=r.user_id,
            hourly_rate=float(r.hourly_rate),
            currency=r.currency,
            is_active=r.is_active,
            user_name=r.user.full_name if r.user else None,
            employee_id=r.user_id,
            employee_name=r.user.full_name if r.user else None,
            employer_id=current_user.id,  # Single employer model
            employer_name=current_user.full_name  # Single employer model
        )
        for r in relations
    ]


@router.post("/", response_model=EmploymentResponse)
async def create_employment_relation(
    data: EmploymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать трудовые отношения"""
    # Проверяем, что пользователь существует и активен
    result = await db.execute(
        select(User).where(User.id == data.user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"Пользователь {data.user_id} не найден")
    
    # Проверяем статус пользователя
    if user.status != 'active':
        raise HTTPException(
            status_code=400, 
            detail=f"Невозможно создать трудовые отношения для пользователя со статусом '{user.status}'"
        )
    
    # Проверяем, нет ли уже активных отношений
    result = await db.execute(
        select(EmploymentRelation).where(
            EmploymentRelation.user_id == data.user_id,
            EmploymentRelation.is_active == True
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Активные трудовые отношения уже существуют")
    
    relation = EmploymentRelation(
        user_id=data.user_id,
        hourly_rate=data.hourly_rate,
        currency=data.currency
    )
    
    db.add(relation)
    await db.commit()
    await db.refresh(relation)
    
    # Загружаем имя пользователя
    result = await db.execute(
        select(EmploymentRelation)
        .options(joinedload(EmploymentRelation.user))
        .where(EmploymentRelation.id == relation.id)
    )
    relation = result.scalar_one()
    
    return EmploymentResponse(
        id=relation.id,
        user_id=relation.user_id,
        hourly_rate=float(relation.hourly_rate),
        currency=relation.currency,
        is_active=relation.is_active,
        user_name=relation.user.full_name if relation.user else None,
        employee_id=relation.user_id,
        employee_name=relation.user.full_name if relation.user else None,
        employer_id=current_user.id,  # Single employer model
        employer_name=current_user.full_name  # Single employer model
    )


@router.put("/{relation_id}", response_model=EmploymentResponse)
async def update_employment_relation(
    relation_id: int,
    data: EmploymentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить трудовые отношения"""
    result = await db.execute(
        select(EmploymentRelation)
        .options(joinedload(EmploymentRelation.user))
        .where(EmploymentRelation.id == relation_id)
    )
    relation = result.scalar_one_or_none()
    
    if not relation:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    if data.hourly_rate is not None:
        relation.hourly_rate = data.hourly_rate
    if data.currency is not None:
        relation.currency = data.currency
    if data.is_active is not None:
        relation.is_active = data.is_active
    
    await db.commit()
    await db.refresh(relation)
    
    return EmploymentResponse(
        id=relation.id,
        user_id=relation.user_id,
        hourly_rate=float(relation.hourly_rate),
        currency=relation.currency,
        is_active=relation.is_active,
        user_name=relation.user.full_name if relation.user else None,
        employee_id=relation.user_id,
        employee_name=relation.user.full_name if relation.user else None,
        employer_id=current_user.id,  # Single employer model
        employer_name=current_user.full_name  # Single employer model
    )


@router.delete("/{relation_id}")
async def delete_employment_relation(
    relation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить (деактивировать) трудовые отношения"""
    result = await db.execute(
        select(EmploymentRelation).where(EmploymentRelation.id == relation_id)
    )
    relation = result.scalar_one_or_none()
    
    if not relation:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    relation.is_active = False
    await db.commit()
    
    return {"message": "Трудовые отношения деактивированы"}
