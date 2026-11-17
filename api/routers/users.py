import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload
from database.core import get_db
from database.models import User, Workspace, WorkspaceMember
from api.auth.oauth import get_current_user, get_workspace_admin_user
from api.auth.registration import available_usernames
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
    role: str = "worker"

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
    current_user: User = Depends(get_current_user)
):
    """Получить список всех активных пользователей (для выбора в формах)"""
    result = await db.execute(
        select(User, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == current_user.active_workspace_id)
        .where(User.status == "active")
        .order_by(User.full_name)
    )
    users = result.all()
    return [
        {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "name": user.full_name,
            "type": "user",
            "roles": [workspace_role],
        }
        for user, workspace_role in users
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
        "roles": [current_user.workspace_role],
        "status": current_user.status,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at,
        "profile_setup_pending": current_user.profile_setup_pending,
    }

@router.put("/me")
async def update_current_user_profile(
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить профиль текущего пользователя"""
    username = user_data.username.strip().casefold()
    # Проверяем уникальность username если он изменился
    if username != current_user.username.casefold():
        result = await db.execute(
            select(User.id).where(
                func.lower(User.username) == username,
                User.id != current_user.id,
            )
        )
        if result.scalar_one_or_none() is not None:
            suggestions = await available_usernames(
                db,
                user_data.full_name,
                count=3,
                exclude_user_id=current_user.id,
            )
            raise HTTPException(
                status_code=409,
                detail={"code": "username_taken", "suggestions": suggestions},
            )
        current_user.username = username

    current_user.full_name = user_data.full_name.strip()
    if user_data.email and user_data.email.casefold() != (current_user.email or "").casefold():
        raise HTTPException(
            status_code=400,
            detail={"code": "email_change_requires_verification"},
        )
    
    # Админы могут изменять статус (роли управляются через отдельный API)
    # Устанавливаем updated_at при редактировании
    current_user.updated_at = datetime.now(timezone.utc)
    current_user.profile_setup_pending = False
    
    await db.commit()
    await db.refresh(current_user)
    
    return {"message": "Profile updated successfully"}

@router.get("/")
async def get_all_users_admin(
    include_deleted: bool = Query(False, description="Включить удалённых пользователей"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    """Получить участников текущего рабочего пространства."""
    query = (
        select(WorkspaceMember)
        .options(joinedload(WorkspaceMember.user))
        .where(WorkspaceMember.workspace_id == current_user.active_workspace_id)
    )
    if not include_deleted:
        query = query.join(User).where(User.status != "deleted")
    
    result = await db.execute(query)
    members = result.unique().scalars().all()
    
    return [
        {
            "id": member.user.id,
            "username": member.user.username,
            "full_name": member.user.full_name,
            "email": member.user.email,
            "roles": [member.role],
            "status": member.user.status,
            "created_at": member.user.created_at,
            "updated_at": member.user.updated_at,
        }
        for member in members
    ]

@router.post("/")
async def create_user(
    user_data: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    """Создать нового пользователя (только для админов).
    
    Пароль генерируется автоматически и возвращается в ответе.
    Пользователь должен сменить пароль при первом входе.
    """
    import hashlib
    from utils.password_utils import hash_password

    if user_data.role not in {"admin", "worker"}:
        raise HTTPException(status_code=400, detail="Invalid workspace role")

    result = await db.execute(
        select(User.id).where(func.lower(User.username) == user_data.username.casefold())
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    if user_data.email:
        email_result = await db.execute(
            select(User.id).where(func.lower(User.email) == user_data.email.strip().casefold())
        )
        if email_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already exists")
    
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
        status="active",
        force_password_change=True  # Требуем смену пароля при первом входе
    )
    db.add(new_user)
    await db.flush()
    db.add(WorkspaceMember(
        workspace_id=current_user.active_workspace_id,
        user_id=new_user.id,
        role=user_data.role,
    ))
    await db.commit()
    await db.refresh(new_user)
    
    return {
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "roles": [user_data.role],
            "status": new_user.status
        },
        "generated_password": plain_password  # Показываем пароль администратору
    }

@router.put("/{user_id}")
async def update_user(
    user_id: int,
    user_data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    """Обновить участника только в текущем рабочем пространстве."""
    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == current_user.active_workspace_id,
        )
    )
    membership, user = result.one_or_none() or (None, None)
    if membership is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user_data.role not in {"admin", "worker"}:
        raise HTTPException(status_code=400, detail="Invalid workspace role")

    # Проверяем уникальность username если он изменился
    if user_data.username != user.username:
        result = await db.execute(
            select(User.id).where(
                func.lower(User.username) == user_data.username.casefold(),
                User.id != user.id,
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = user_data.username
    
    user.full_name = user_data.full_name
    if user_data.email and user_data.email.casefold() != (user.email or "").casefold():
        raise HTTPException(
            status_code=400,
            detail={"code": "email_change_requires_verification"},
        )

    membership.role = user_data.role
    user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(user)
    
    return {"message": "User updated successfully"}

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    """Удалить участника из текущего рабочего пространства."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == current_user.active_workspace_id,
        )
    )
    membership, user = result.one_or_none() or (None, None)
    if membership is None:
        raise HTTPException(status_code=404, detail="User not found")

    workspace = await db.get(Workspace, current_user.active_workspace_id)
    if workspace and workspace.owner_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the workspace owner")

    from database.models import EmploymentRelation
    emp_result = await db.execute(
        select(EmploymentRelation).where(
            EmploymentRelation.user_id == user_id,
            EmploymentRelation.is_active == True
        )
    )
    for emp in emp_result.scalars().all():
        emp.is_active = False

    await db.delete(membership)
    await db.commit()

    return {"message": "Workspace member removed"}

@router.post("/{user_id}/restore")
async def restore_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    raise HTTPException(
        status_code=410,
        detail={"code": "use_workspace_invitation"},
    )

@router.put("/me/password")
async def change_password(
    password_data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Изменить свой пароль"""
    from utils.password_utils import verify_password, hash_password
    
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
    
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid old password")
    
    current_user.password_hash = hash_password(password_data.new_password)
    current_user.force_password_change = False
    current_user.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    return {"message": "Password changed successfully"}

@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user)
):
    """Сбросить пароль пользователя (только для админов)"""
    membership = await db.execute(
        select(WorkspaceMember.id).where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == current_user.active_workspace_id,
        )
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="User not found")
    raise HTTPException(
        status_code=410,
        detail={"code": "password_reset_requires_user"},
    )

@router.get("/password-rules")
async def get_password_rules():
    """Получить правила выбора паролей"""
    from utils.settings_helper import get_setting
    rules = await get_setting("password_rules", "Пароль должен содержать минимум 6 символов и 1 цифру")
    return {"rules": rules}