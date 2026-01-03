"""
Простые тесты без базы данных
"""
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

def test_unauthorized_access(client):
    """Тест доступа без авторизации"""
    # GET /payments/categories uses get_current_user -> 401
    response = client.get("/api/payments/categories")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]

def test_web_app_endpoint(client):
    """Тест веб-приложения"""
    response = client.get("/app")
    assert response.status_code == 200

def test_mobile_app_endpoint(client):
    """Тест мобильного приложения"""
    response = client.get("/mobile")
    assert response.status_code == 200

def test_currencies_unauthorized(client):
    """Тест получения валют без авторизации"""
    # GET /currencies/ uses get_current_user -> 401
    response = client.get("/api/currencies/")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]