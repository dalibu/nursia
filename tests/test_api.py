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
    response = client.get("/api")
    assert response.status_code == 200
    assert "Nursia Payment Tracker API" in response.json()["message"]

def test_login_validation(client):
    """Тест валидации данных логина"""
    # Тест с некорректными данными
    response = client.post("/api/auth/login", json={
        "username": "nonexistent",
        "password": "wrong"
    })
    assert response.status_code == 401  # User not found

def test_unauthorized_access(client):
    """Тест доступа без авторизации"""
    response = client.get("/api/payments/categories")
    assert response.status_code == 403
    assert "Not authenticated" in response.json()["detail"]