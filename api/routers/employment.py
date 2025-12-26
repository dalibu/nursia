"""
API роутер для трудовых отношений
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
from database.models import User, EmploymentRelation, Contributor
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/employment", tags=["employment"])


class EmploymentCreate(BaseModel):
    employer_id: int
    employee_id: int
    hourly_rate: float
    currency: str = "UAH"


class EmploymentUpdate(BaseModel):
    hourly_rate: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None


class EmploymentResponse(BaseModel):
    id: int
    employer_id: int
    employee_id: int
    hourly_rate: float
    currency: str
    is_active: bool
    employer_name: Optional[str] = None
    employee_name: Optional[str] = None


@router.get("/", response_model=List[EmploymentResponse])
async def get_employment_relations(
    employer_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список трудовых отношений"""
    query = select(EmploymentRelation).options(
        joinedload(EmploymentRelation.employer),
        joinedload(EmploymentRelation.employee)
    )
    
    if employer_id:
        query = query.where(EmploymentRelation.employer_id == employer_id)
    if employee_id:
        query = query.where(EmploymentRelation.employee_id == employee_id)
    if is_active is not None:
        query = query.where(EmploymentRelation.is_active == is_active)
    
    result = await db.execute(query)
    relations = result.scalars().all()
    
    return [
        EmploymentResponse(
            id=r.id,
            employer_id=r.employer_id,
            employee_id=r.employee_id,
            hourly_rate=float(r.hourly_rate),
            currency=r.currency,
            is_active=r.is_active,
            employer_name=r.employer.name if r.employer else None,
            employee_name=r.employee.name if r.employee else None
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
    # Проверяем, что участники существуют
    for contributor_id in [data.employer_id, data.employee_id]:
        result = await db.execute(
            select(Contributor).where(Contributor.id == contributor_id)
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Участник {contributor_id} не найден")
    
    # Проверяем, нет ли уже активных отношений
    result = await db.execute(
        select(EmploymentRelation).where(
            EmploymentRelation.employer_id == data.employer_id,
            EmploymentRelation.employee_id == data.employee_id,
            EmploymentRelation.is_active == True
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Активные трудовые отношения уже существуют")
    
    relation = EmploymentRelation(
        employer_id=data.employer_id,
        employee_id=data.employee_id,
        hourly_rate=data.hourly_rate,
        currency=data.currency
    )
    
    db.add(relation)
    await db.commit()
    await db.refresh(relation)
    
    # Загружаем имена участников
    result = await db.execute(
        select(EmploymentRelation)
        .options(joinedload(EmploymentRelation.employer), joinedload(EmploymentRelation.employee))
        .where(EmploymentRelation.id == relation.id)
    )
    relation = result.scalar_one()
    
    return EmploymentResponse(
        id=relation.id,
        employer_id=relation.employer_id,
        employee_id=relation.employee_id,
        hourly_rate=float(relation.hourly_rate),
        currency=relation.currency,
        is_active=relation.is_active,
        employer_name=relation.employer.name if relation.employer else None,
        employee_name=relation.employee.name if relation.employee else None
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
        .options(joinedload(EmploymentRelation.employer), joinedload(EmploymentRelation.employee))
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
        employer_id=relation.employer_id,
        employee_id=relation.employee_id,
        hourly_rate=float(relation.hourly_rate),
        currency=relation.currency,
        is_active=relation.is_active,
        employer_name=relation.employer.name if relation.employer else None,
        employee_name=relation.employee.name if relation.employee else None
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
