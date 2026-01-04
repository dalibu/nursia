import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from database.core import get_db
from database.models import User, RegistrationRequest, Role, Permission, user_roles, role_permissions
from api.schemas.auth import RegistrationRequestResponse
from api.auth.oauth import get_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])


# ================================
# Pydantic Schemas
# ================================

class ApproveRequest(BaseModel):
    role: str = "worker"


class RoleCreate(BaseModel):
    name: str
    type: str = "business"  # auth or business
    description: Optional[str] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None


class RoleResponse(BaseModel):
    id: int
    name: str
    type: str
    description: Optional[str] = None
    permissions: List[str] = []

    class Config:
        from_attributes = True


class PermissionCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PermissionResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class UserRoleUpdate(BaseModel):
    role_ids: List[int]


class RolePermissionUpdate(BaseModel):
    permission_ids: List[int]


# ================================
# Roles CRUD
# ================================

@router.get("/roles", response_model=List[RoleResponse])
async def get_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить список всех ролей с их разрешениями"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions))
    )
    roles = result.scalars().all()
    
    return [
        RoleResponse(
            id=role.id,
            name=role.name,
            type=role.type,
            description=role.description,
            permissions=[p.name for p in role.permissions]
        )
        for role in roles
    ]


@router.post("/roles", response_model=RoleResponse)
async def create_role(
    role_data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать новую роль"""
    # Check if role already exists
    existing = await db.execute(select(Role).where(Role.name == role_data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Роль '{role_data.name}' уже существует")
    
    role = Role(
        name=role_data.name,
        type=role_data.type,
        description=role_data.description
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        type=role.type,
        description=role.description,
        permissions=[]
    )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    role_data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить роль"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Protect system roles
    if role.name in ['admin'] and role_data.name and role_data.name != role.name:
        raise HTTPException(status_code=400, detail="Нельзя переименовать системную роль 'admin'")
    
    if role_data.name is not None:
        # Check for duplicate
        existing = await db.execute(
            select(Role).where(Role.name == role_data.name, Role.id != role_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Роль '{role_data.name}' уже существует")
        role.name = role_data.name
    
    if role_data.type is not None:
        role.type = role_data.type
    if role_data.description is not None:
        role.description = role_data.description
    
    await db.commit()
    await db.refresh(role)
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        type=role.type,
        description=role.description,
        permissions=[p.name for p in role.permissions]
    )


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить роль"""
    result = await db.execute(
        select(Role).options(selectinload(Role.users)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Protect system roles
    if role.name in ['admin', 'worker', 'employer']:
        raise HTTPException(status_code=400, detail=f"Нельзя удалить системную роль '{role.name}'")
    
    # Check if role is in use
    if role.users:
        raise HTTPException(
            status_code=400, 
            detail=f"Нельзя удалить роль, назначенную пользователям ({len(role.users)} пользователей)"
        )
    
    await db.delete(role)
    await db.commit()
    
    return {"message": f"Роль '{role.name}' удалена"}


# ================================
# Permissions CRUD
# ================================

@router.get("/permissions", response_model=List[PermissionResponse])
async def get_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить список всех разрешений"""
    result = await db.execute(select(Permission).order_by(Permission.name))
    return result.scalars().all()


@router.post("/permissions", response_model=PermissionResponse)
async def create_permission(
    perm_data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать новое разрешение"""
    existing = await db.execute(select(Permission).where(Permission.name == perm_data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Разрешение '{perm_data.name}' уже существует")
    
    perm = Permission(
        name=perm_data.name,
        description=perm_data.description
    )
    db.add(perm)
    await db.commit()
    await db.refresh(perm)
    
    return perm


@router.put("/permissions/{permission_id}", response_model=PermissionResponse)
async def update_permission(
    permission_id: int,
    perm_data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить разрешение"""
    result = await db.execute(select(Permission).where(Permission.id == permission_id))
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Разрешение не найдено")
    
    # Check for duplicate name
    existing = await db.execute(
        select(Permission).where(Permission.name == perm_data.name, Permission.id != permission_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Разрешение '{perm_data.name}' уже существует")
    
    perm.name = perm_data.name
    perm.description = perm_data.description
    
    await db.commit()
    await db.refresh(perm)
    
    return perm


@router.delete("/permissions/{permission_id}")
async def delete_permission(
    permission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить разрешение"""
    result = await db.execute(
        select(Permission).options(selectinload(Permission.roles)).where(Permission.id == permission_id)
    )
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Разрешение не найдено")
    
    # Check if permission is in use
    if perm.roles:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя удалить разрешение, назначенное ролям ({len(perm.roles)} ролей)"
        )
    
    await db.delete(perm)
    await db.commit()
    
    return {"message": f"Разрешение '{perm.name}' удалено"}


# ================================
# Role-Permission Management
# ================================

@router.put("/roles/{role_id}/permissions")
async def set_role_permissions(
    role_id: int,
    data: RolePermissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Назначить разрешения роли (заменяет все существующие)"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Get permissions by IDs
    perm_result = await db.execute(
        select(Permission).where(Permission.id.in_(data.permission_ids))
    )
    permissions = perm_result.scalars().all()
    
    # Replace all permissions
    role.permissions = list(permissions)
    
    await db.commit()
    
    return {
        "message": f"Роли '{role.name}' назначено {len(permissions)} разрешений",
        "permissions": [p.name for p in permissions]
    }


@router.post("/roles/{role_id}/permissions/{permission_id}")
async def add_permission_to_role(
    role_id: int,
    permission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Добавить разрешение к роли"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    perm_result = await db.execute(select(Permission).where(Permission.id == permission_id))
    perm = perm_result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Разрешение не найдено")
    
    if perm not in role.permissions:
        role.permissions.append(perm)
        await db.commit()
    
    return {"message": f"Разрешение '{perm.name}' добавлено к роли '{role.name}'"}


@router.delete("/roles/{role_id}/permissions/{permission_id}")
async def remove_permission_from_role(
    role_id: int,
    permission_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить разрешение из роли"""
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    perm_result = await db.execute(select(Permission).where(Permission.id == permission_id))
    perm = perm_result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Разрешение не найдено")
    
    if perm in role.permissions:
        role.permissions.remove(perm)
        await db.commit()
    
    return {"message": f"Разрешение '{perm.name}' удалено из роли '{role.name}'"}


# ================================
# User-Role Management
# ================================

@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Получить роли пользователя"""
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    return {
        "user_id": user.id,
        "username": user.username,
        "roles": [{"id": r.id, "name": r.name, "type": r.type} for r in user.roles]
    }


@router.put("/users/{user_id}/roles")
async def set_user_roles(
    user_id: int,
    data: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Назначить роли пользователю (заменяет все существующие)"""
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Prevent removing admin role from self
    if user.id == current_user.id:
        admin_role = await db.execute(select(Role).where(Role.name == 'admin'))
        admin = admin_role.scalar_one_or_none()
        if admin and admin.id not in data.role_ids:
            raise HTTPException(status_code=400, detail="Нельзя снять роль admin с себя")
    
    # Get roles by IDs
    roles_result = await db.execute(
        select(Role).where(Role.id.in_(data.role_ids))
    )
    roles = roles_result.scalars().all()
    
    if not roles:
        raise HTTPException(status_code=400, detail="Необходимо назначить хотя бы одну роль")
    
    # Replace all roles
    user.roles = list(roles)
    
    await db.commit()
    
    return {
        "message": f"Пользователю '{user.username}' назначено {len(roles)} ролей",
        "roles": [r.name for r in roles]
    }


@router.post("/users/{user_id}/roles/{role_id}")
async def add_role_to_user(
    user_id: int,
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Добавить роль пользователю"""
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    if role not in user.roles:
        user.roles.append(role)
        await db.commit()
    
    return {"message": f"Роль '{role.name}' добавлена пользователю '{user.username}'"}


@router.delete("/users/{user_id}/roles/{role_id}")
async def remove_role_from_user(
    user_id: int,
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Удалить роль у пользователя"""
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    role_result = await db.execute(select(Role).where(Role.id == role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    
    # Prevent removing admin role from self
    if user.id == current_user.id and role.name == 'admin':
        raise HTTPException(status_code=400, detail="Нельзя снять роль admin с себя")
    
    # Ensure user has at least one role
    if len(user.roles) <= 1:
        raise HTTPException(status_code=400, detail="У пользователя должна быть хотя бы одна роль")
    
    if role in user.roles:
        user.roles.remove(role)
        await db.commit()
    
    return {"message": f"Роль '{role.name}' удалена у пользователя '{user.username}'"}


# ================================
# Registration Requests
# ================================

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
    approval_data: ApproveRequest,
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
    
    # Получаем роль
    role_result = await db.execute(select(Role).where(Role.name == approval_data.role))
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{approval_data.role}' not found")

    # Создаем пользователя
    user = User(
        username=request.username,
        password_hash=request.password_hash,
        email=request.email,
        full_name=request.full_name,
        status="active"
    )
    user.roles.append(role)
    
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