import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.core import get_db
from database.models import User, RegistrationRequest
from api.schemas.auth import Token, UserLogin, UserRegister, RegistrationRequestResponse, ChangePassword
from api.auth.oauth import create_access_token, get_current_user
from config.settings import settings
from utils.settings_helper import get_jwt_expire_minutes
from utils.password_utils import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegistrationRequestResponse)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    # Проверяем, что username уникален
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    result = await db.execute(select(RegistrationRequest).where(RegistrationRequest.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Registration request already exists")
    
    # Хешируем пароль с bcrypt (пароль уже SHA-256 с клиента)
    password_hash = hash_password(user_data.password)
    
    # Создаем заявку на регистрацию
    request = RegistrationRequest(
        username=user_data.username,
        email=user_data.email or '',
        full_name=user_data.full_name,
        password_hash=password_hash
    )
    
    db.add(request)
    await db.commit()
    await db.refresh(request)
    
    return request


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    import asyncio
    from datetime import datetime
    from utils.settings_helper import get_setting
    
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
            # Сравниваем naive UTC datetimes
            if datetime.utcnow() - user.last_failed_login > timedelta(hours=1):
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
    is_password_correct = False
    if user.password_hash and user.password_hash != 'temp_hash':
        is_password_correct = verify_password(user_data.password, user.password_hash)
    
    if not is_password_correct:
        # Увеличиваем счетчик неудачных попыток
        user.failed_login_attempts += 1
        user.last_failed_login = datetime.utcnow()
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
    
    expire_minutes = await get_jwt_expire_minutes()
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expire_minutes * 60,
        "force_password_change": user.force_password_change
    }


@router.post("/change-password")
async def change_password(
    data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "force_password_change": current_user.force_password_change
    }