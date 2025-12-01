import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_currencies_endpoint_exists(client):
    """Тест существования endpoint валют"""
    response = client.get("/api/currencies/")
    assert response.status_code == 401  # Требует авторизации

def test_settings_endpoint_exists(client):
    """Тест существования endpoint настроек"""
    response = client.get("/api/settings/")
    assert response.status_code == 401  # Требует авторизации

def test_users_endpoint_exists(client):
    """Тест существования endpoint пользователей"""
    response = client.get("/api/users/")
    assert response.status_code == 401  # Требует авторизации

def test_registration_requests_endpoint_exists(client):
    """Тест существования endpoint заявок на регистрацию"""
    response = client.get("/api/admin/registration-requests")
    assert response.status_code == 401  # Требует авторизации

def test_password_rules_endpoint_exists(client):
    """Тест существования endpoint правил паролей"""
    response = client.get("/api/users/password-rules")
    assert response.status_code == 200  # Публичный endpoint

def test_change_password_endpoint_exists(client):
    """Тест существования endpoint смены пароля"""
    response = client.post("/api/users/change-password", json={
        "current_password": "test",
        "new_password": "test"
    })
    assert response.status_code in [401, 405]  # Требует авторизации или метод не найден

def test_currency_crud_endpoints_exist(client):
    """Тест существования CRUD endpoints для валют"""
    # GET
    response = client.get("/api/currencies/")
    assert response.status_code == 401
    
    # POST
    response = client.post("/api/currencies/", json={
        "code": "TEST",
        "name": "Test",
        "symbol": "T",
        "is_default": False
    })
    assert response.status_code == 401
    
    # PUT
    response = client.put("/api/currencies/1", json={
        "code": "TEST",
        "name": "Test",
        "symbol": "T", 
        "is_default": False
    })
    assert response.status_code == 401
    
    # DELETE
    response = client.delete("/api/currencies/1")
    assert response.status_code == 401

def test_settings_crud_endpoints_exist(client):
    """Тест существования CRUD endpoints для настроек"""
    # GET
    response = client.get("/api/settings/")
    assert response.status_code == 401
    
    # PUT
    response = client.put("/api/settings/test_key", json={"value": "test"})
    assert response.status_code == 401

def test_user_management_endpoints_exist(client):
    """Тест существования endpoints управления пользователями"""
    # GET users
    response = client.get("/api/users/")
    assert response.status_code == 401
    
    # PUT user
    response = client.put("/api/users/1", json={
        "username": "test",
        "full_name": "Test",
        "email": "test@test.com",
        "role": "user",
        "status": "active"
    })
    assert response.status_code == 401
    
    # DELETE user
    response = client.delete("/api/users/1")
    assert response.status_code == 401

def test_admin_endpoints_exist(client):
    """Тест существования admin endpoints"""
    # Registration requests
    response = client.get("/api/admin/registration-requests")
    assert response.status_code == 401
    
    # Approve request
    response = client.post("/api/admin/registration-requests/1/approve")
    assert response.status_code == 401
    
    # Reject request
    response = client.post("/api/admin/registration-requests/1/reject")
    assert response.status_code == 401