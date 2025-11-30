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
    assert "Nursia Expense Tracker API" in response.json()["message"]

def test_unauthorized_access(client):
    """Тест доступа без авторизации"""
    response = client.get("/api/expenses/categories")
    assert response.status_code == 403
    assert "Not authenticated" in response.json()["detail"]

def test_web_app_endpoint(client):
    """Тест веб-приложения"""
    response = client.get("/app")
    assert response.status_code == 200

def test_mobile_app_endpoint(client):
    """Тест мобильного приложения"""
    response = client.get("/mobile")
    assert response.status_code == 200

def test_currencies_public(client):
    """Тест получения валют без авторизации"""
    response = client.get("/api/currencies/")
    assert response.status_code == 200
    assert "currencies" in response.json()

def test_recipients_public(client):
    """Тест получения получателей без авторизации"""
    response = client.get("/api/recipients/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)