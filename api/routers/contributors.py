import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, union_all, func
from database.core import get_db
from database.models import User, Contributor, Payment
from api.schemas.contributor import ContributorCreate, Contributor as ContributorSchema
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/contributors", tags=["contributors"])


@router.get("/")
async def get_contributors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Список активных участников для использования в формах платежей."""
    contributors_result = await db.execute(
        select(Contributor).where(Contributor.is_active == True).order_by(Contributor.name)
    )
    all_contributors = contributors_result.scalars().all()
    
    contributors = []
    for contributor in all_contributors:
        contributors.append({
            "id": contributor.id,
            "name": contributor.name,
            "type": contributor.type
        })
    
    return contributors


@router.get("/admin", response_model=List[ContributorSchema])
async def get_contributors_admin(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    """Полный список участников для админки."""
    result = await db.execute(select(Contributor).order_by(Contributor.name))
    return result.scalars().all()


@router.post("/", response_model=ContributorSchema)
async def create_contributor(
    contributor: ContributorCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    db_contributor = Contributor(**contributor.model_dump())
    db.add(db_contributor)
    await db.commit()
    await db.refresh(db_contributor)
    return db_contributor


@router.get("/{contributor_id}/validate-delete")
async def validate_delete_contributor(
    contributor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    """Проверка возможности удаления участника.

    Возвращает can_delete=false и причину, если у участника есть связанные платежи
    или если он не найден.
    """
    result = await db.execute(select(Contributor).where(Contributor.id == contributor_id))
    db_contributor = result.scalar_one_or_none()
    if not db_contributor:
        return {"can_delete": False, "reason": "Участник не найден."}

    payments_count_result = await db.execute(
        select(func.count(Payment.id)).where(
            (Payment.recipient_id == contributor_id) | (Payment.payer_id == contributor_id)
        )
    )
    payments_count = payments_count_result.scalar_one()

    if payments_count > 0:
        return {
            "can_delete": False,
            "reason": "Нельзя удалить участника: с ним связаны платежи.",
            "payments_count": payments_count,
        }

    return {"can_delete": True, "reason": None}


@router.delete("/{contributor_id}")
async def delete_contributor(
    contributor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    result = await db.execute(select(Contributor).where(Contributor.id == contributor_id))
    db_contributor = result.scalar_one_or_none()
    if not db_contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    # Повторная защита от удаления, если есть связанные платежи
    payments_count_result = await db.execute(
        select(func.count(Payment.id)).where(
            (Payment.recipient_id == contributor_id) | (Payment.payer_id == contributor_id)
        )
    )
    payments_count = payments_count_result.scalar_one()
    if payments_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить участника: с ним связаны платежи."
        )

    await db.delete(db_contributor)
    await db.commit()
    return {"status": "ok"}


@router.put("/{contributor_id}", response_model=ContributorSchema)
async def update_contributor(
    contributor_id: int,
    contributor: ContributorCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    result = await db.execute(select(Contributor).where(Contributor.id == contributor_id))
    db_contributor = result.scalar_one_or_none()
    if not db_contributor:
        raise HTTPException(status_code=404, detail="Contributor not found")

    for field, value in contributor.model_dump().items():
        setattr(db_contributor, field, value)
    db_contributor.changed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_contributor)
    return db_contributor