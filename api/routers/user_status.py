from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List

from sqlalchemy.orm import selectinload
from database.core import get_db
from database.models import User, UserStatus, UserStatusType, Role
from api.auth.oauth import get_admin_user
from api.schemas.user_status import UserStatusResponse, UserStatusUpdate

router = APIRouter(prefix="/user-status", tags=["user-status"])

@router.get("/", response_model=List[UserStatusResponse])
async def list_user_statuses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить список всех пользователей с их статусами"""
    query = select(User).options(selectinload(User.roles)).order_by(User.created_at.desc())
    result = await db.execute(query)
    users = result.scalars().all()
    
    user_statuses = []
    for user in users:
        # Получаем статус пользователя из таблицы user_status
        status_query = select(UserStatus).where(UserStatus.user_id == user.id)
        status_result = await db.execute(status_query)
        user_status = status_result.scalar_one_or_none()
        
        user_statuses.append(UserStatusResponse(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            roles=[r.name for r in user.roles],
            status=user_status.status if user_status else UserStatusType.PENDING,
            force_password_change=user.force_password_change,
            created_at=user.created_at,
            updated_at=user.updated_at
        ))
    
    return user_statuses

@router.put("/{user_id}", response_model=UserStatusResponse)
async def update_user_status(
    user_id: int,
    status_update: UserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить статус пользователя"""
    # Проверяем, что пользователь существует
    user_query = select(User).options(selectinload(User.roles)).where(User.id == user_id)
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Обновляем или создаем запись в user_status
    status_query = select(UserStatus).where(UserStatus.user_id == user_id)
    status_result = await db.execute(status_query)
    user_status = status_result.scalar_one_or_none()
    
    if user_status:
        # Обновляем существующую запись
        await db.execute(
            update(UserStatus)
            .where(UserStatus.user_id == user_id)
            .values(
                status=status_update.status,
                changed_by=current_user.id,
                reason=status_update.reason
            )
        )
    else:
        # Создаем новую запись
        new_status = UserStatus(
            user_id=user_id,
            status=status_update.status,
            changed_by=current_user.id,
            reason=status_update.reason
        )
        db.add(new_status)
    
    # Если статус "reseted", устанавливаем флаг принудительной смены пароля
    if status_update.status == UserStatusType.RESETED:
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(force_password_change=True)
        )
        user.force_password_change = True
    
    await db.commit()
    
    # Получаем обновленный статус
    status_query = select(UserStatus).where(UserStatus.user_id == user_id)
    status_result = await db.execute(status_query)
    updated_status = status_result.scalar_one()
    
    return UserStatusResponse(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        roles=[r.name for r in user.roles],
        status=updated_status.status,
        force_password_change=user.force_password_change,
        created_at=user.created_at,
        updated_at=user.updated_at
    )

@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Сбросить пароль пользователя"""
    # Проверяем, что пользователь существует
    user_query = select(User).where(User.id == user_id)
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Устанавливаем статус "reseted" и флаг принудительной смены пароля
    status_query = select(UserStatus).where(UserStatus.user_id == user_id)
    status_result = await db.execute(status_query)
    user_status = status_result.scalar_one_or_none()
    
    if user_status:
        await db.execute(
            update(UserStatus)
            .where(UserStatus.user_id == user_id)
            .values(
                status=UserStatusType.RESETED,
                changed_by=current_user.id,
                reason="Пароль сброшен администратором"
            )
        )
    else:
        new_status = UserStatus(
            user_id=user_id,
            status=UserStatusType.RESETED,
            changed_by=current_user.id,
            reason="Пароль сброшен администратором"
        )
        db.add(new_status)
    
    # Устанавливаем флаг принудительной смены пароля
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(force_password_change=True)
    )
    
    await db.commit()
    
    return {"message": "Пароль пользователя сброшен. При следующем входе потребуется установить новый пароль."}