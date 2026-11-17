import sys
import asyncio
import logging
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from database.core import get_db
from database.models import Role, User
from api.schemas.auth import Token, UserLogin, UserRegister, ChangePassword
from api.auth.oauth import create_access_token, get_current_user
from api.auth.registration import available_usernames, verify_turnstile_token
from api.middleware.rate_limiter import limiter
from utils.settings_helper import get_jwt_expire_minutes, get_setting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
@limiter.limit("5/hour")
async def register(
    request: Request,
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    await verify_turnstile_token(user_data.turnstile_token)

    from utils.password_utils import hash_password
    password_hash = hash_password(user_data.password)
    
    role_result = await db.execute(select(Role).where(Role.name == "worker"))
    worker_role = role_result.scalar_one_or_none()
    if worker_role is None:
        raise HTTPException(status_code=503, detail={"code": "registration_unavailable"})

    for attempt in range(5):
        username = (await available_usernames(db, user_data.full_name))[0]
        user = User(
            username=username,
            password_hash=password_hash,
            full_name=user_data.full_name.strip(),
            status="active",
            profile_setup_pending=True,
        )
        user.roles.append(worker_role)
        db.add(user)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            existing_user = await db.execute(
                select(User.id).where(func.lower(User.username) == username.casefold())
            )
            if existing_user.scalar_one_or_none() is not None and attempt < 4:
                role_result = await db.execute(select(Role).where(Role.name == "worker"))
                worker_role = role_result.scalar_one_or_none()
                if worker_role is None:
                    raise HTTPException(status_code=503, detail={"code": "registration_unavailable"})
                continue
            logger.exception("Failed to create a registered user")
            raise HTTPException(status_code=500, detail={"code": "registration_error"})

        expire_minutes = await get_jwt_expire_minutes()
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=expire_minutes),
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": expire_minutes * 60,
            "profile_setup_pending": True,
        }

    raise HTTPException(status_code=503, detail={"code": "registration_unavailable"})


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    # Получаем настройки безопасности
    delay_enabled = await get_setting("security_login_delay_enabled", "true")
    base_delay = float(await get_setting("security_login_delay_seconds", "1.0"))

    result = await db.execute(select(User).where(User.username == user_data.username))
    user = result.scalar_one_or_none()
    
    # Расчет задержки на основе попыток
    current_delay = 0
    if user:
        # Если последняя неудачная попытка была давно (например, больше часа назад), сбрасываем счетчик
        if user.last_failed_login:
            # Превращаем наивное время в aware UTC для корректного сравнения
            last_failed = user.last_failed_login
            if last_failed.tzinfo is None:
                last_failed = last_failed.replace(tzinfo=timezone.utc)
                
            if datetime.now(timezone.utc) - last_failed > timedelta(hours=1):
                user.failed_login_attempts = 0
                await db.commit()
        
        current_delay = user.failed_login_attempts * 2.0  # +2 секунды за каждую попытку
    
    # Общая задержка (базовая + накопительная)
    total_delay = base_delay + current_delay if delay_enabled.lower() == "true" else 0

    # Если пользователь не найден
    if not user:
        if total_delay > 0:
            await asyncio.sleep(total_delay)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User not found|{total_delay}"
        )
    
    # Проверка пароля
    from utils.password_utils import verify_password
    is_password_correct = False
    if user.password_hash and user.password_hash != 'temp_hash':
        is_password_correct = verify_password(user_data.password, user.password_hash)
    
    if not is_password_correct:
        # Увеличиваем счетчик неудачных попыток
        user.failed_login_attempts += 1
        user.last_failed_login = datetime.now(timezone.utc)
        await db.commit()
        
        if total_delay > 0:
            await asyncio.sleep(total_delay)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect password|{total_delay}"
        )
    
    # Проверка статуса
    if user.status != "active":
        if total_delay > 0:
            await asyncio.sleep(total_delay)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account not activated|{total_delay}"
        )
    
    # Успешный вход: сбрасываем счетчик
    user.failed_login_attempts = 0
    user.last_failed_login = None
    await db.commit()
    
    expire_minutes = await get_jwt_expire_minutes()
    access_token_expires = timedelta(minutes=expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expire_minutes * 60,
        "force_password_change": user.force_password_change,
        "profile_setup_pending": user.profile_setup_pending,
    }


@router.post("/change-password")
async def change_password(
    data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from utils.password_utils import verify_password, hash_password
    # Проверяем старый пароль
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    # Проверяем, что новый пароль отличается от старого
    if data.old_password == data.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password"
        )
    
    # Обновляем пароль
    current_user.password_hash = hash_password(data.new_password)
    current_user.force_password_change = False
    await db.commit()
    
    return {"message": "Password changed successfully"}


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    # Collect all unique permissions from all roles
    permissions = set()
    for role in current_user.roles:
        for permission in role.permissions:
            permissions.add(permission.name)
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "roles": [role.name for role in current_user.roles],  # RBAC roles array
        "permissions": list(permissions),  # All permissions from all roles
        "force_password_change": current_user.force_password_change,
        "profile_setup_pending": current_user.profile_setup_pending
    }