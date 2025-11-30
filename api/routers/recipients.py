import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, union_all
from database.core import get_db
from database.models import User, Recipient
from api.schemas.recipient import RecipientCreate, Recipient as RecipientSchema
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/recipients", tags=["recipients"])


@router.get("/")
async def get_recipients(
    db: AsyncSession = Depends(get_db)
):
    # Получаем всех получателей
    recipients_result = await db.execute(select(Recipient).order_by(Recipient.name))
    all_recipients = recipients_result.scalars().all()
    
    recipients = []
    for recipient in all_recipients:
        recipients.append({
            "id": recipient.id,
            "name": recipient.name,
            "type": recipient.type
        })
    
    return recipients


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