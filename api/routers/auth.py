import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt
from database.core import get_db
from database.models import User, RegistrationRequest
from api.schemas.auth import Token, UserLogin, UserRegister, RegistrationRequestResponse
from api.auth.oauth import create_access_token, get_current_user
from config.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])

def hash_password(password: str) -> str:
    # Пароль уже захеширован SHA-256 на клиенте, добавляем bcrypt с солью
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


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
    result = await db.execute(select(User).where(User.username == user_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Временно: если пароль не установлен, принимаем любой
    if user.password_hash and user.password_hash != 'temp_hash':
        if not verify_password(user_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password"
            )
    
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not activated"
        )
    
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role
    }