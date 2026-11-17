import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from api.auth.email import EmailConfigurationError, EmailDeliveryError, send_email
from api.auth.oauth import (
    create_access_token,
    get_current_user,
    get_workspace_admin_user,
)
from api.auth.registration import hash_invite_token, new_invite_token
from api.middleware.rate_limiter import limiter
from api.schemas.auth import Token
from api.schemas.workspaces import (
    WorkspaceCreate,
    WorkspaceInviteAccept,
    WorkspaceInviteCreate,
    WorkspaceInvitePreview,
    WorkspaceMemberResponse,
    WorkspaceResponse,
    WorkspaceSwitch,
)
from api.workspace_service import create_workspace
from config.settings import settings
from database.core import get_db
from database.models import (
    Currency,
    EmploymentRelation,
    User,
    Workspace,
    WorkspaceInvite,
    WorkspaceMember,
)
from utils.password_utils import hash_password, verify_password
from utils.settings_helper import get_jwt_expire_minutes


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workspaces", tags=["workspaces"])


async def _token_response(user: User, workspace_id: int) -> dict:
    expires_minutes = await get_jwt_expire_minutes()
    return {
        "access_token": create_access_token(
            data={"sub": str(user.id), "workspace_id": workspace_id},
            expires_delta=timedelta(minutes=expires_minutes),
        ),
        "token_type": "bearer",
        "expires_in": expires_minutes * 60,
        "profile_setup_pending": user.profile_setup_pending,
        "workspace_id": workspace_id,
    }


def _email_failure(error: Exception) -> HTTPException:
    if isinstance(error, EmailConfigurationError):
        logger.error("Email delivery is not configured")
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "email_not_configured"},
        )
    logger.error("Email delivery failed: %s", error)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": "email_unavailable"},
    )


@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
        .order_by(Workspace.id)
    )
    return [
        {
            "id": workspace.id,
            "name": workspace.name,
            "role": role,
            "default_currency": workspace.default_currency,
        }
        for workspace, role in result.all()
    ]


@router.post("/", response_model=WorkspaceResponse)
async def add_workspace(
    workspace_data: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    currency_result = await db.execute(
        select(Currency.code).where(
            Currency.code == workspace_data.default_currency,
            Currency.is_active.is_(True),
        )
    )
    if currency_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail={"code": "currency_invalid"})

    workspace = await create_workspace(
        db,
        current_user,
        workspace_data.name,
        workspace_data.default_currency,
    )
    await db.commit()
    return {
        "id": workspace.id,
        "name": workspace.name,
        "role": "admin",
        "default_currency": workspace.default_currency,
    }


@router.post("/switch", response_model=Token)
async def switch_workspace(
    selection: WorkspaceSwitch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.workspace_id == selection.workspace_id,
        )
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return await _token_response(current_user, selection.workspace_id)


@router.get("/members", response_model=list[WorkspaceMemberResponse])
async def list_workspace_members(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkspaceMember)
        .options(joinedload(WorkspaceMember.user))
        .where(WorkspaceMember.workspace_id == current_user.active_workspace_id)
        .order_by(WorkspaceMember.joined_at)
    )
    return [
        {
            "user_id": member.user.id,
            "username": member.user.username,
            "full_name": member.user.full_name,
            "email": member.user.email,
            "role": member.role,
            "joined_at": member.joined_at,
        }
        for member in result.scalars().all()
    ]


@router.post("/invites")
@limiter.limit("10/hour")
async def create_workspace_invite(
    request: Request,
    data: WorkspaceInviteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user),
):
    email = str(data.email).casefold()
    existing_member = await db.execute(
        select(WorkspaceMember.id)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.workspace_id == current_user.active_workspace_id,
            func.lower(User.email) == email,
        )
    )
    if existing_member.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail={"code": "already_a_member"})

    invite_token = new_invite_token()
    invite = WorkspaceInvite(
        workspace_id=current_user.active_workspace_id,
        email=email,
        token_hash=hash_invite_token(invite_token),
        role="worker",
        invited_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.flush()
    workspace = await db.get(Workspace, current_user.active_workspace_id)
    invite_url = f"{settings.APP_BASE_URL.rstrip('/')}/invite/{quote(invite_token)}"
    try:
        await send_email(
            email,
            f"Invitation to {workspace.name}",
            (
                f"You have been invited to join {workspace.name}.\n\n"
                f"Accept the invitation within 7 days: {invite_url}\n"
            ),
        )
    except (EmailConfigurationError, EmailDeliveryError) as error:
        await db.rollback()
        raise _email_failure(error)

    await db.commit()
    return {"message": "invitation_sent"}


@router.get("/invites/{token}", response_model=WorkspaceInvitePreview)
async def preview_workspace_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceInvite, Workspace.name)
        .join(Workspace, Workspace.id == WorkspaceInvite.workspace_id)
        .where(
            WorkspaceInvite.token_hash == hash_invite_token(token),
            WorkspaceInvite.accepted_at.is_(None),
            WorkspaceInvite.expires_at > datetime.now(timezone.utc),
        )
    )
    invite, workspace_name = result.one_or_none() or (None, None)
    if invite is None:
        raise HTTPException(status_code=404, detail={"code": "invite_invalid"})
    return {
        "workspace_name": workspace_name,
        "email": invite.email,
        "expires_at": invite.expires_at,
    }


@router.post("/invites/accept", response_model=Token)
@limiter.limit("10/hour")
async def accept_workspace_invite(
    request: Request,
    data: WorkspaceInviteAccept,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceInvite)
        .where(
            WorkspaceInvite.token_hash == hash_invite_token(data.token),
            WorkspaceInvite.accepted_at.is_(None),
            WorkspaceInvite.expires_at > datetime.now(timezone.utc),
        )
    )
    invite = result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail={"code": "invite_invalid"})

    email = invite.email.casefold()
    user_result = await db.execute(
        select(User).where(func.lower(User.email) == email).order_by(User.id).limit(1)
    )
    user = user_result.scalar_one_or_none()
    if user is not None:
        if user.status == "unverified":
            raise HTTPException(
                status_code=409,
                detail={"code": "email_verification_required"},
            )
        if user.status != "active" or not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail={"code": "invalid_credentials"})
        user.email_verified = True
    else:
        from api.auth.registration import available_usernames

        username = (await available_usernames(db, data.full_name))[0]
        user = User(
            username=username,
            password_hash=hash_password(data.password),
            email=email,
            email_verified=True,
            full_name=data.full_name,
            status="active",
            profile_setup_pending=True,
        )
        db.add(user)
        await db.flush()

    existing_membership = await db.execute(
        select(WorkspaceMember.id).where(
            WorkspaceMember.workspace_id == invite.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if existing_membership.scalar_one_or_none() is None:
        db.add(WorkspaceMember(
            workspace_id=invite.workspace_id,
            user_id=user.id,
            role=invite.role,
        ))

    workspace_id = invite.workspace_id
    invite.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    return await _token_response(user, workspace_id)


@router.delete("/members/{user_id}")
async def remove_workspace_member(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_workspace_admin_user),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail={"code": "cannot_remove_self"})

    workspace = await db.get(Workspace, current_user.active_workspace_id)
    if workspace.owner_id == user_id:
        raise HTTPException(status_code=400, detail={"code": "cannot_remove_owner"})

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == current_user.active_workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Member not found")

    if membership.role == "admin":
        admins = await db.execute(
            select(func.count()).select_from(WorkspaceMember).where(
                WorkspaceMember.workspace_id == current_user.active_workspace_id,
                WorkspaceMember.role == "admin",
            )
        )
        if admins.scalar_one() <= 1:
            raise HTTPException(status_code=400, detail={"code": "cannot_remove_last_admin"})

    employment_result = await db.execute(
        select(EmploymentRelation).where(
            EmploymentRelation.user_id == user_id,
            EmploymentRelation.is_active.is_(True),
        )
    )
    for relation in employment_result.scalars().all():
        relation.is_active = False

    await db.delete(membership)
    await db.commit()
    return {"message": "Member removed"}
