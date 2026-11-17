import re
import time

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from api.routers import auth
from api.routers import workspaces as workspace_router
from api.schemas.auth import EmailVerificationRequest, UserRegister
from api.schemas.workspaces import WorkspaceInviteAccept, WorkspaceInviteCreate
from database.models import EmailVerification, User, Workspace, WorkspaceMember


def _request():
    return auth.Request({
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/auth/register",
        "raw_path": b"/api/auth/register",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


@pytest.mark.asyncio
async def test_email_registration_verification_creates_owner_workspace(db_session, monkeypatch):
    sent = []

    async def accept_turnstile(_token):
        return None

    async def capture_email(recipient, subject, body):
        sent.append((recipient, subject, body))

    monkeypatch.setattr(auth, "verify_turnstile_token", accept_turnstile)
    monkeypatch.setattr(auth, "is_disposable_email", lambda _email: False)
    monkeypatch.setattr(auth, "send_email", capture_email)
    monkeypatch.setattr(auth, "get_jwt_expire_minutes", lambda: _resolved(60))

    request = _request()
    registration = UserRegister(
        email="Owner@Example.com",
        full_name="Alex Smith",
        workspace_name="Smith household",
        password="hashed-password-123",
        turnstile_token="valid-turnstile-token",
        form_started_at=int(time.time() * 1000) - 5_000,
    )
    response = await auth.register.__wrapped__(request, registration, db_session)
    assert response == {"message": "verification_sent"}
    assert sent[0][0] == "owner@example.com"

    verification = (await db_session.execute(
        select(EmailVerification).where(EmailVerification.email == "owner@example.com")
    )).scalar_one()
    code = re.search(r"\b(\d{6})\b", sent[0][2]).group(1)

    with pytest.raises(HTTPException) as invalid_code:
        await auth.verify_email.__wrapped__(
            request,
            EmailVerificationRequest(
                email="owner@example.com",
                code="000000" if code != "000000" else "000001",
            ),
            db_session,
        )
    assert invalid_code.value.status_code == 400
    await db_session.refresh(verification)
    assert verification.attempts == 1

    result = await auth.verify_email.__wrapped__(
        request,
        EmailVerificationRequest(email="owner@example.com", code=code),
        db_session,
    )
    user = (await db_session.execute(
        select(User).where(User.email == "owner@example.com")
    )).scalar_one()
    workspace = (await db_session.execute(
        select(Workspace).where(Workspace.name == "Smith household")
    )).scalar_one()
    membership = (await db_session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.workspace_id == workspace.id,
        )
    )).scalar_one()

    assert result["workspace_id"] == workspace.id
    assert user.status == "active"
    assert user.email_verified is True
    assert user.profile_setup_pending is True
    assert user.username.startswith("owner")
    assert membership.role == "admin"


async def _resolved(value):
    return value


@pytest.mark.asyncio
async def test_workspace_invitation_adds_user_only_to_invited_workspace(db_session, monkeypatch):
    sent = []

    async def capture_email(recipient, subject, body):
        sent.append((recipient, subject, body))

    monkeypatch.setattr(workspace_router, "send_email", capture_email)
    monkeypatch.setattr(
        workspace_router,
        "get_jwt_expire_minutes",
        lambda: _resolved(60),
    )

    workspace = await db_session.get(Workspace, 1)
    workspace.name = "Current workspace"
    admin = User(
        username="workspace-admin",
        full_name="Workspace Admin",
        password_hash="admin-hash",
        status="active",
    )
    db_session.add(admin)
    await db_session.flush()
    admin.active_workspace_id = workspace.id
    db_session.add(WorkspaceMember(
        workspace_id=workspace.id,
        user_id=admin.id,
        role="admin",
    ))
    await db_session.commit()

    request = _request()
    await workspace_router.create_workspace_invite.__wrapped__(
        request,
        WorkspaceInviteCreate(email="worker@example.com"),
        db_session,
        admin,
    )
    token = re.search(r"/invite/([A-Za-z0-9_-]+)", sent[0][2]).group(1)
    preview = await workspace_router.preview_workspace_invite(token, db_session)
    assert preview["workspace_name"] == "Current workspace"

    response = await workspace_router.accept_workspace_invite.__wrapped__(
        request,
        WorkspaceInviteAccept(
            token=token,
            full_name="New Worker",
            password="client-password-hash",
        ),
        db_session,
    )
    worker = (await db_session.execute(
        select(User).where(User.email == "worker@example.com")
    )).scalar_one()
    membership = (await db_session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == worker.id,
            WorkspaceMember.workspace_id == workspace.id,
        )
    )).scalar_one()

    assert response["workspace_id"] == workspace.id
    assert worker.email_verified is True
    assert membership.role == "worker"
