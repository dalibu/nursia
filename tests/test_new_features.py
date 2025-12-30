import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_currencies_endpoint_exists(client):
    """Тест существования endpoint валют"""
    # GET /currencies/ uses get_current_user -> 401
    response = client.get("/api/currencies/")
    assert response.status_code == 401

def test_settings_endpoint_exists(client):
    """Тест существования endpoint настроек"""
    # GET /settings/ uses get_admin_user -> 403
    response = client.get("/api/settings/")
    assert response.status_code == 403

def test_users_endpoint_exists(client):
    """Тест существования endpoint пользователей"""
    # GET /users/ uses get_admin_user -> 403
    response = client.get("/api/users/")
    assert response.status_code == 403

def test_registration_requests_endpoint_exists(client):
    """Тест существования endpoint заявок на регистрацию"""
    # GET /admin/registration-requests uses get_admin_user -> 403
    response = client.get("/api/admin/registration-requests")
    assert response.status_code == 403

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
    # GET uses get_current_user -> 401
    response = client.get("/api/currencies/")
    assert response.status_code == 401
    
    # POST/PUT/DELETE use get_admin_user -> 403
    response = client.post("/api/currencies/", json={
        "code": "TEST",
        "name": "Test",
        "symbol": "T",
        "is_default": False
    })
    assert response.status_code == 403
    
    response = client.put("/api/currencies/1", json={
        "code": "TEST",
        "name": "Test",
        "symbol": "T", 
        "is_default": False
    })
    assert response.status_code == 403
    
    response = client.delete("/api/currencies/1")
    assert response.status_code == 403

def test_settings_crud_endpoints_exist(client):
    """Тест существования CRUD endpoints для настроек"""
    # All settings endpoints use get_admin_user -> 403
    response = client.get("/api/settings/")
    assert response.status_code == 403
    
    response = client.put("/api/settings/test_key", json={"value": "test"})
    assert response.status_code == 403

def test_user_management_endpoints_exist(client):
    """Тест существования endpoints управления пользователями"""
    # All user management endpoints use get_admin_user -> 403
    response = client.get("/api/users/")
    assert response.status_code == 403
    
    response = client.put("/api/users/1", json={
        "username": "test",
        "full_name": "Test",
        "email": "test@test.com",
        "role": "user",
        "status": "active"
    })
    assert response.status_code == 403
    
    response = client.delete("/api/users/1")
    assert response.status_code == 403

def test_admin_endpoints_exist(client):
    """Тест существования admin endpoints"""
    # All admin endpoints use get_admin_user -> 403
    response = client.get("/api/admin/registration-requests")
    assert response.status_code == 403
    
    response = client.post("/api/admin/registration-requests/1/approve")
    assert response.status_code == 403
    
    response = client.post("/api/admin/registration-requests/1/reject")
    assert response.status_code == 403