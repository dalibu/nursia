import sys
import asyncio
import logging
import time
import hmac
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from database.core import get_db
from database.models import EmailVerification, User, Workspace, WorkspaceMember
from api.schemas.auth import (
    ChangePassword,
    EmailVerificationRequest,
    EmailVerificationResendRequest,
    Token,
    UserLogin,
    UserRegister,
)
from api.auth.oauth import create_access_token, get_current_user
from api.auth.email import EmailConfigurationError, EmailDeliveryError, send_email
from api.auth.registration import (
    available_usernames,
    hash_email_verification_code,
    is_disposable_email,
    new_email_verification_code,
    username_base,
    verify_turnstile_token,
)
from api.middleware.rate_limiter import limiter
from api.workspace_service import create_workspace
from utils.settings_helper import get_jwt_expire_minutes, get_setting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def register(
    request: Request,
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    elapsed_ms = int(time.time() * 1000) - user_data.form_started_at
    if user_data.website.strip() or not 2_500 <= elapsed_ms <= 3_600_000:
        raise HTTPException(status_code=400, detail={"code": "registration_rejected"})

    await verify_turnstile_token(user_data.turnstile_token)
    email = str(user_data.email).casefold()
    if is_disposable_email(email):
        raise HTTPException(status_code=400, detail={"code": "disposable_email"})

    await cleanup_expired_registrations(db)
    verification_result = await db.execute(
        select(EmailVerification.user_id).where(func.lower(EmailVerification.email) == email)
    )
    if verification_result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail={"code": "verification_pending"})

    existing_email = await db.execute(
        select(User.id).where(func.lower(User.email) == email).limit(1)
    )
    if existing_email.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail={"code": "email_taken"})

    from utils.password_utils import hash_password
    username = (await available_usernames(db, username_base(email.rpartition("@")[0])))[0]
    user = User(
        username=username,
        password_hash=hash_password(user_data.password),
        email=email,
        email_verified=False,
        full_name=user_data.full_name,
        status="unverified",
        profile_setup_pending=True,
    )
    db.add(user)
    await db.flush()

    code = new_email_verification_code()
    verification = EmailVerification(
        user_id=user.id,
        email=email,
        code_hash=hash_email_verification_code(email, code),
        workspace_name=user_data.workspace_name,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(verification)
    try:
        await send_email(
            email,
            "Verify your Nursia account",
            f"Your email verification code is {code}. It expires in 10 minutes.",
        )
        await db.commit()
    except (EmailConfigurationError, EmailDeliveryError) as error:
        await db.rollback()
        if isinstance(error, EmailConfigurationError):
            logger.error("Email delivery is not configured")
            raise HTTPException(
                status_code=503,
                detail={"code": "email_not_configured"},
            )
        logger.error("Email delivery failed: %s", error)
        raise HTTPException(status_code=503, detail={"code": "email_unavailable"})
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": "email_taken"})

    return {"message": "verification_sent"}


async def cleanup_expired_registrations(db: AsyncSession) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(User).where(User.status == "unverified", User.created_at < cutoff)
    )
    expired_users = result.scalars().all()
    if not expired_users:
        return 0

    for user in expired_users:
        await db.execute(
            delete(EmailVerification).where(EmailVerification.user_id == user.id)
        )
        await db.delete(user)
    await db.commit()
    return len(expired_users)


@router.post("/verify-email", response_model=Token)
@limiter.limit("10/hour")
async def verify_email(
    request: Request,
    data: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    email = str(data.email).casefold()
    result = await db.execute(
        select(EmailVerification).where(func.lower(EmailVerification.email) == email)
    )
    verification = result.scalar_one_or_none()
    if verification is None or verification.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail={"code": "verification_invalid"})
    if verification.attempts >= 5:
        raise HTTPException(status_code=429, detail={"code": "verification_attempts_exceeded"})

    expected_hash = hash_email_verification_code(email, data.code)
    if not hmac.compare_digest(expected_hash, verification.code_hash):
        verification.attempts += 1
        await db.commit()
        raise HTTPException(status_code=400, detail={"code": "verification_invalid"})

    user = await db.get(User, verification.user_id)
    if user is None or user.status != "unverified":
        raise HTTPException(status_code=400, detail={"code": "verification_invalid"})

    user.email_verified = True
    user.status = "active"
    workspace = await create_workspace(db, user, verification.workspace_name)
    workspace_id = workspace.id
    await db.delete(verification)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"code": "email_taken"})

    expires_minutes = await get_jwt_expire_minutes()
    return {
        "access_token": create_access_token(
            data={"sub": str(user.id), "workspace_id": workspace_id},
            expires_delta=timedelta(minutes=expires_minutes),
        ),
        "token_type": "bearer",
        "expires_in": expires_minutes * 60,
        "profile_setup_pending": True,
        "workspace_id": workspace_id,
    }


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("3/hour")
async def resend_verification(
    request: Request,
    data: EmailVerificationResendRequest,
    db: AsyncSession = Depends(get_db),
):
    email = str(data.email).casefold()
    result = await db.execute(
        select(EmailVerification).where(func.lower(EmailVerification.email) == email)
    )
    verification = result.scalar_one_or_none()
    if verification is None:
        return {"message": "verification_sent"}
    created_at = verification.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if (datetime.now(timezone.utc) - created_at).total_seconds() < 60:
        raise HTTPException(status_code=429, detail={"code": "verification_resend_wait"})

    code = new_email_verification_code()
    verification.code_hash = hash_email_verification_code(email, code)
    verification.expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    verification.attempts = 0
    verification.created_at = datetime.now(timezone.utc)
    try:
        await send_email(
            email,
            "Your Nursia verification code",
            f"Your email verification code is {code}. It expires in 10 minutes.",
        )
        await db.commit()
    except (EmailConfigurationError, EmailDeliveryError) as error:
        await db.rollback()
        if isinstance(error, EmailConfigurationError):
            logger.error("Email delivery is not configured")
            raise HTTPException(status_code=503, detail={"code": "email_not_configured"})
        logger.error("Email delivery failed: %s", error)
        raise HTTPException(status_code=503, detail={"code": "email_unavailable"})
    return {"message": "verification_sent"}


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    # Получаем настройки безопасности
    delay_enabled = await get_setting("security_login_delay_enabled", "true")
    base_delay = float(await get_setting("security_login_delay_seconds", "1.0"))

    identifier = user_data.username.strip()
    if "@" in identifier:
        result = await db.execute(
            select(User).where(
                func.lower(User.email) == identifier.casefold(),
                User.email_verified.is_(True),
            )
        )
    else:
        result = await db.execute(select(User).where(User.username == identifier))
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
        if user.status == "unverified":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "email_verification_required"},
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account not activated|{total_delay}"
        )

    membership_result = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(WorkspaceMember.workspace_id)
        .limit(1)
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "workspace_access_required"},
        )
    
    # Успешный вход: сбрасываем счетчик
    user.failed_login_attempts = 0
    user.last_failed_login = None
    await db.commit()
    
    expire_minutes = await get_jwt_expire_minutes()
    access_token_expires = timedelta(minutes=expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "workspace_id": membership.workspace_id},
        expires_delta=access_token_expires,
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expire_minutes * 60,
        "force_password_change": user.force_password_change,
        "profile_setup_pending": user.profile_setup_pending,
        "workspace_id": membership.workspace_id,
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
    if current_user.workspace_role is None:
        for role in current_user.roles:
            for permission in role.permissions:
                permissions.add(permission.name)
    elif current_user.workspace_role == "admin":
        permissions.add("view_all_reports")
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "roles": [current_user.workspace_role] if current_user.workspace_role else [
            role.name for role in current_user.roles
        ],
        "system_roles": [] if current_user.workspace_role else [
            role.name for role in current_user.roles
        ],
        "permissions": list(permissions),  # All permissions from all roles
        "force_password_change": current_user.force_password_change,
        "profile_setup_pending": current_user.profile_setup_pending,
        "workspace_id": current_user.active_workspace_id,
    }