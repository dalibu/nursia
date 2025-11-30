import pytest
from fastapi.testclient import TestClient
from api.main import app

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
    response = client.get("/")
    assert response.status_code == 200
    assert "Nursia Expense Tracker API" in response.json()["message"]

def test_login_validation(client):
    """Тест валидации данных логина"""
    # Тест с некорректными данными
    response = client.post("/auth/login", json={
        "telegram_id": "invalid",
        "full_name": "Test"
    })
    assert response.status_code == 422  # Validation error

def test_unauthorized_access(client):
    """Тест доступа без авторизации"""
    response = client.get("/expenses/categories")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]