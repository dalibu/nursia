import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import hashlib
from database.core import get_db
from database.models import User, RegistrationRequest
from api.schemas.auth import RegistrationRequestResponse
from api.auth.oauth import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/registration-requests", response_model=List[RegistrationRequestResponse])
async def get_registration_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(
        select(RegistrationRequest).order_by(RegistrationRequest.created_at.desc())
    )
    return result.scalars().all()

@router.post("/registration-requests/{request_id}/approve")
async def approve_registration(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    # Получаем заявку
    result = await db.execute(
        select(RegistrationRequest).where(RegistrationRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Создаем пользователя
    user = User(
        username=request.username,
        password_hash=request.password_hash,
        email=request.email,
        full_name=request.full_name,
        role="user",
        status="active"
    )
    
    db.add(user)
    
    # Обновляем статус заявки
    await db.execute(
        update(RegistrationRequest)
        .where(RegistrationRequest.id == request_id)
        .values(status="approved", reviewed_by=current_user.id)
    )
    
    await db.commit()
    return {"message": "User approved and created"}

@router.post("/registration-requests/{request_id}/reject")
async def reject_registration(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    # Получаем заявку
    result = await db.execute(
        select(RegistrationRequest).where(RegistrationRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Удаляем отклоненную заявку из базы
    await db.delete(request)
    await db.commit()
    return {"message": "Registration request rejected and deleted"}

@router.delete("/registration-requests/{request_id}")
async def delete_registration_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(
        select(RegistrationRequest).where(RegistrationRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    await db.delete(request)
    await db.commit()
    return {"message": "Registration request deleted"}