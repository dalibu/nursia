import pytest
from fastapi.testclient import TestClient
from api.main import app
from database.models import PaymentCategory, User, UserRole
from database.crud import create_user
from api.auth.oauth import create_access_token


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.asyncio
async def test_get_categories_unauthorized(client, db_session):
    """Test that unauthorized users cannot get categories"""
    response = client.get("/api/payments/categories")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_category_unauthorized(client):
    """Test that unauthorized users cannot create categories"""
    response = client.post("/api/payments/categories", json={"name": "Test"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_category_unauthorized(client):
    """Test that unauthorized users cannot update categories"""
    response = client.put("/api/payments/categories/1", json={"name": "Test"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_delete_category_unauthorized(client):
    """Test that unauthorized users cannot delete categories"""
    response = client.delete("/api/payments/categories/1")
    assert response.status_code == 401


def test_category_endpoints_exist(client):
    """Test that category endpoints exist and return proper error codes"""
    # Test without auth - should return 403
    response = client.get("/api/payments/categories")
    assert response.status_code == 401
    
    response = client.post("/api/payments/categories", json={"name": "Test"})
    assert response.status_code == 401
    
    response = client.put("/api/payments/categories/1", json={"name": "Test"})
    assert response.status_code == 401
    
    response = client.delete("/api/payments/categories/1")
    assert response.status_code == 401