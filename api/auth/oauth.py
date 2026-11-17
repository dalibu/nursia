import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from database.core import get_db
from database.models import User, WorkspaceMember
from sqlalchemy import select
from config.settings import settings

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создать JWT токен"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    user, payload = await _load_authenticated_user(credentials, db, unauthorized=True)
    workspace_id = payload.get("workspace_id")
    membership_query = select(WorkspaceMember).where(WorkspaceMember.user_id == user.id)
    if workspace_id is not None:
        membership_query = membership_query.where(WorkspaceMember.workspace_id == int(workspace_id))
    membership = (await db.execute(
        membership_query.order_by(WorkspaceMember.workspace_id).limit(1)
    )).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No workspace access")

    user.workspace_role = membership.role
    user.active_workspace_id = membership.workspace_id
    db.sync_session.info["workspace_id"] = membership.workspace_id
    db.sync_session.info["user_id"] = user.id
    return user


async def _load_authenticated_user(credentials, db, *, unauthorized):
    error_status = status.HTTP_401_UNAUTHORIZED if unauthorized else status.HTTP_403_FORBIDDEN
    unauthorized_exception = HTTPException(
        status_code=error_status,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"} if unauthorized else None,
    )
    if credentials is None:
        raise unauthorized_exception

    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise unauthorized_exception

    from database.models import Role
    result = await db.execute(
        select(User).options(
            selectinload(User.roles).selectinload(Role.permissions)
        ).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise unauthorized_exception
    return user, payload


async def get_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    user, _ = await _load_authenticated_user(credentials, db, unauthorized=False)
    membership_result = await db.execute(
        select(WorkspaceMember.id)
        .where(WorkspaceMember.user_id == user.id)
        .limit(1)
    )
    if membership_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace administrators cannot access platform administration",
        )
    if not user.has_role("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return user


async def get_workspace_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace administrator access required",
        )
    return current_user


async def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    user, _ = await _load_authenticated_user(credentials, db, unauthorized=True)
    return user