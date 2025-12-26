import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.core import get_db
from database.models import User
from api.auth.oauth import get_current_user, get_admin_user
from pydantic import BaseModel

router = APIRouter(prefix="/users", tags=["users"])

class PasswordChange(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str

class UserUpdate(BaseModel):
    username: str
    full_name: str
    email: str = None
    role: str = None
    status: str = None

class AdminUserUpdate(BaseModel):
    username: str
    full_name: str
    email: str = None
    role: str
    status: str

class AdminUserCreate(BaseModel):
    username: str
    full_name: str
    email: str = None
    role: str = "user"

def generate_password(length: int = 12) -> str:
    """Генерирует безопасный пароль"""
    import secrets
    import string
    # Гарантируем наличие цифр, букв и спецсимволов
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Проверяем требования: минимум 1 заглавная, 1 строчная, 1 цифра, 1 спецсимвол
        if (any(c.isupper() for c in password)
            and any(c.islower() for c in password)
            and any(c.isdigit() for c in password)
            and any(c in "!@#$%" for c in password)):
            return password


@router.get("/all")
async def get_all_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить список всех пользователей (для выбора в формах)"""
    result = await db.execute(
        select(User).where(User.status == "active").order_by(User.full_name)
    )
    users = result.scalars().all()
    return [
        {"id": u.id, "username": u.username, "full_name": u.full_name}
        for u in users
    ]

@router.get("/me")
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    """Получить профиль текущего пользователя"""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "status": current_user.status,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at
    }

@router.put("/me")
async def update_current_user_profile(
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить профиль текущего пользователя"""
    from datetime import datetime
    
    # Проверяем уникальность username если он изменился
    if user_data.username != current_user.username:
        result = await db.execute(select(User).where(User.username == user_data.username))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already exists")
        current_user.username = user_data.username
    
    current_user.full_name = user_data.full_name
    if user_data.email:
        current_user.email = user_data.email
    
    # Админы могут изменять свою роль и статус
    if current_user.role == "admin":
        if user_data.role:
            current_user.role = user_data.role
        if user_data.status:
            current_user.status = user_data.status
    
    # Устанавливаем updated_at при редактировании
    current_user.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(current_user)
    
    return {"message": "Profile updated successfully"}

@router.get("/")
async def get_all_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить всех пользователей (только для админов)"""
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "created_at": user.created_at,
            "updated_at": user.updated_at
        }
        for user in users
    ]

@router.post("/")
async def create_user(
    user_data: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать нового пользователя (только для админов).
    
    Пароль генерируется автоматически и возвращается в ответе.
    Пользователь должен сменить пароль при первом входе.
    """
    import hashlib
    from utils.password_utils import hash_password
    
    # Проверяем уникальность username
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Генерируем пароль
    plain_password = generate_password()
    
    # Хешируем пароль (SHA-256 + bcrypt, как ожидает клиент)
    sha256_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
    password_hash = hash_password(sha256_hash)
    
    # Создаём пользователя
    new_user = User(
        username=user_data.username,
        full_name=user_data.full_name,
        email=user_data.email,
        password_hash=password_hash,
        role=user_data.role,
        status="active",
        force_password_change=True  # Требуем смену пароля при первом входе
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return {
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "role": new_user.role,
            "status": new_user.status
        },
        "generated_password": plain_password  # Показываем пароль администратору
    }

@router.put("/{user_id}")
async def update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить пользователя (только для админов)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    from datetime import datetime
    
    # Проверяем уникальность username если он изменился
    if user_data.username != user.username:
        result = await db.execute(select(User).where(User.username == user_data.username))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = user_data.username
    
    user.full_name = user_data.full_name
    if user_data.email:
        user.email = user_data.email
    user.role = user_data.role
    user.status = user_data.status
    user.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(user)
    
    return {"message": "User updated successfully"}

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить пользователя (только для админов)"""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()
    
    return {"message": "User deleted successfully"}

@router.put("/me/password")
async def change_password(
    password_data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Изменить свой пароль"""
    from utils.password_utils import verify_password, hash_password
    from datetime import datetime
    
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
    
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid old password")
    
    current_user.password_hash = hash_password(password_data.new_password)
    current_user.force_password_change = False
    current_user.updated_at = datetime.utcnow()
    
    await db.commit()
    return {"message": "Password changed successfully"}

@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Сбросить пароль пользователя (только для админов)"""
    from datetime import datetime
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.force_password_change = True
    user.updated_at = datetime.utcnow()
    
    await db.commit()
    return {"message": "Password reset. User must change password on next login"}

@router.get("/password-rules")
async def get_password_rules():
    """Получить правила выбора паролей"""
    from utils.settings_helper import get_setting
    rules = await get_setting("password_rules", "Пароль должен содержать минимум 6 символов и 1 цифру")
    return {"rules": rules}