import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, union_all, func
from database.core import get_db
from database.models import User, Recipient, Payment
from api.schemas.recipient import RecipientCreate, Recipient as RecipientSchema
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/recipients", tags=["recipients"])


@router.get("/")
async def get_recipients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Список активных получателей для использования в формах платежей."""
    recipients_result = await db.execute(
        select(Recipient).where(Recipient.is_active == True).order_by(Recipient.name)
    )
    all_recipients = recipients_result.scalars().all()
    
    recipients = []
    for recipient in all_recipients:
        recipients.append({
            "id": recipient.id,
            "name": recipient.name,
            "type": recipient.type
        })
    
    return recipients


@router.get("/admin", response_model=List[RecipientSchema])
async def get_recipients_admin(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    """Полный список получателей для админки."""
    result = await db.execute(select(Recipient).order_by(Recipient.name))
    return result.scalars().all()


@router.post("/", response_model=RecipientSchema)
async def create_recipient(
    recipient: RecipientCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    db_recipient = Recipient(**recipient.model_dump())
    db.add(db_recipient)
    await db.commit()
    await db.refresh(db_recipient)
    return db_recipient


@router.get("/{recipient_id}/validate-delete")
async def validate_delete_recipient(
    recipient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    """Проверка возможности удаления получателя.

    Возвращает can_delete=false и причину, если у получателя есть связанные платежи
    или если он не найден.
    """
    result = await db.execute(select(Recipient).where(Recipient.id == recipient_id))
    db_recipient = result.scalar_one_or_none()
    if not db_recipient:
        return {"can_delete": False, "reason": "Получатель не найден."}

    payments_count_result = await db.execute(
        select(func.count(Payment.id)).where(Payment.recipient_id == recipient_id)
    )
    payments_count = payments_count_result.scalar_one()

    if payments_count > 0:
        return {
            "can_delete": False,
            "reason": "Нельзя удалить получателя: с ним связаны платежи.",
            "payments_count": payments_count,
        }

    return {"can_delete": True, "reason": None}


@router.delete("/{recipient_id}")
async def delete_recipient(
    recipient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    result = await db.execute(select(Recipient).where(Recipient.id == recipient_id))
    db_recipient = result.scalar_one_or_none()
    if not db_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Повторная защита от удаления, если есть связанные платежи
    payments_count_result = await db.execute(
        select(func.count(Payment.id)).where(Payment.recipient_id == recipient_id)
    )
    payments_count = payments_count_result.scalar_one()
    if payments_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить получателя: с ним связаны платежи."
        )

    await db.delete(db_recipient)
    await db.commit()
    return {"status": "ok"}


@router.put("/{recipient_id}", response_model=RecipientSchema)
async def update_recipient(
    recipient_id: int,
    recipient: RecipientCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_admin_user)
):
    result = await db.execute(select(Recipient).where(Recipient.id == recipient_id))
    db_recipient = result.scalar_one_or_none()
    if not db_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    for field, value in recipient.model_dump().items():
        setattr(db_recipient, field, value)
    db_recipient.changed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(db_recipient)
    return db_recipient