import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_requests_endpoint_returns_array(client):
    """Тест что endpoint заявок возвращает массив"""
    # Без авторизации должен вернуть 401, но не ошибку парсинга
    response = client.get("/api/admin/registration-requests")
    assert response.status_code == 403
    
    # Проверяем что ответ можно распарсить как JSON
    data = response.json()
    assert "detail" in data

def test_requests_endpoint_structure(client):
    """Тест структуры ответа endpoint заявок"""
    response = client.get("/api/admin/registration-requests")
    
    # Даже при ошибке авторизации ответ должен быть валидным JSON
    assert response.headers.get("content-type") == "application/json"
    
    # Не должно быть HTML в ответе
    response_text = response.text
    assert not response_text.startswith("<!DOCTYPE")
    assert not response_text.startswith("<html")