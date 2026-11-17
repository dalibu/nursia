import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import selectinload

from api import main as main_module
from api.routers import auth as auth_router
from api.routers import users as users_router
from api.auth.registration import available_usernames, username_base, verify_turnstile_token
from config.settings import settings
from database.core import get_db
from database.models import RegistrationRequest, Role, User
from scripts.setup_system import ensure_profile_setup_column


def test_username_base_uses_first_and_last_name():
    assert username_base("Alex Smith") == "alex.smith"
    assert username_base("Олексій Шевченко") == "oleksii.shevchenko"


@pytest.mark.asyncio
async def test_available_usernames_skips_existing_users_and_requests(db_session):
    db_session.add(User(username="alex.smith", password_hash="hash", full_name="Alex Smith"))
    db_session.add(RegistrationRequest(
        username="alex.smith2",
        email="",
        full_name="Alex Smith",
        password_hash="hash",
    ))
    await db_session.commit()

    suggestions = await available_usernames(db_session, "Alex Smith", count=2)

    assert suggestions == ["alex.smith3", "alex.smith4"]


@pytest.mark.asyncio
async def test_turnstile_verification_fails_closed_when_secret_missing(monkeypatch):
    monkeypatch.setattr(settings, "TURNSTILE_SECRET_KEY", "")

    with pytest.raises(HTTPException) as error:
        await verify_turnstile_token("token")

    assert error.value.status_code == 503


def test_existing_database_gets_profile_setup_column():
    from sqlalchemy import create_engine, text

    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        ensure_profile_setup_column(connection)

        assert "profile_setup_pending" in {
            column["name"] for column in inspect(connection).get_columns("users")
        }
    engine.dispose()


@pytest.mark.asyncio
async def test_registration_creates_active_worker_and_authenticates(db_session, monkeypatch):
    async def override_get_db():
        yield db_session

    async def verify_test_token(token):
        assert token == "valid-turnstile-token"

    async def test_expiry():
        return 480

    db_session.add(Role(name="worker", type="business"))
    await db_session.commit()
    main_module.app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(auth_router, "verify_turnstile_token", verify_test_token)
    monkeypatch.setattr(auth_router, "get_jwt_expire_minutes", test_expiry)

    try:
        transport = ASGITransport(app=main_module.app, client=("127.0.0.2", 12345))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/register", json={
                "full_name": "Alex Smith",
                "password": "a" * 64,
                "turnstile_token": "valid-turnstile-token",
            })
            second_response = await client.post("/api/auth/register", json={
                "full_name": "Alex Smith",
                "password": "a" * 64,
                "turnstile_token": "valid-turnstile-token",
            })

        assert response.status_code == 200
        assert response.json()["access_token"]
        assert response.json()["profile_setup_pending"] is True
        assert second_response.status_code == 200

        result = await db_session.execute(
            select(User).options(selectinload(User.roles)).order_by(User.id)
        )
        users = result.scalars().all()
        assert [user.username for user in users] == ["alex.smith", "alex.smith2"]
        assert all(user.status == "active" for user in users)
        assert all(user.profile_setup_pending for user in users)
        assert all([role.name for role in user.roles] == ["worker"] for user in users)
    finally:
        main_module.app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_profile_update_suggests_available_usernames(db_session):
    current_user = User(
        username="current.user",
        password_hash="hash",
        full_name="Alex Smith",
        status="active",
        profile_setup_pending=True,
    )
    existing_user = User(
        username="alex.smith",
        password_hash="hash",
        full_name="Another Alex Smith",
        status="active",
    )
    db_session.add_all([current_user, existing_user])
    await db_session.commit()
    await db_session.refresh(current_user)

    async def override_get_db():
        yield db_session

    async def override_current_user():
        result = await db_session.execute(
            select(User).options(selectinload(User.roles)).where(User.id == current_user.id)
        )
        return result.scalar_one()

    main_module.app.dependency_overrides[get_db] = override_get_db
    main_module.app.dependency_overrides[users_router.get_current_user] = override_current_user

    try:
        transport = ASGITransport(app=main_module.app, client=("127.0.0.3", 12345))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put("/api/users/me", json={
                "username": "alex.smith",
                "full_name": "Alex Smith",
                "email": "",
            })
            assert response.status_code == 409
            assert response.json()["detail"]["suggestions"] == [
                "alex.smith2",
                "alex.smith3",
                "alex.smith4",
            ]

            save_response = await client.put("/api/users/me", json={
                "username": "alex.smith2",
                "full_name": "Alex Smith",
                "email": "",
            })

        assert save_response.status_code == 200
        await db_session.refresh(current_user)
        assert current_user.username == "alex.smith2"
        assert current_user.profile_setup_pending is False
    finally:
        main_module.app.dependency_overrides.pop(get_db, None)
        main_module.app.dependency_overrides.pop(users_router.get_current_user, None)
