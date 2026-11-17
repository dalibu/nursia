import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from api.main import app
from api.routers import auth as auth_router
from database.core import get_db

@pytest.fixture
def client():
    """HTTP клиент для тестов"""
    return TestClient(app)

def test_health_check(client):
    """Тест проверки здоровья API"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_root_endpoint(client):
    """Тест корневого endpoint"""
    response = client.get("/api")
    assert response.status_code == 200
    assert "Nursia Payment Tracker API" in response.json()["message"]

@pytest.mark.asyncio
async def test_login_validation(db_session, monkeypatch):
    """Тест валидации данных логина"""

    async def override_get_db():
        yield db_session

    async def disable_login_delay(key, default=None):
        return "false" if key == "security_login_delay_enabled" else "0"

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(auth_router, "get_setting", disable_login_delay)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/login", json={
                "username": "nonexistent",
                "password": "wrong"
            })
        assert response.status_code == 401  # User not found
    finally:
        app.dependency_overrides.pop(get_db, None)

def test_unauthorized_access(client):
    """Тест доступа без авторизации"""
    # GET /payments/categories uses get_current_user -> 401
    response = client.get("/api/payments/categories")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]