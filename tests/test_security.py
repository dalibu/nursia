import pytest
from fastapi.testclient import TestClient
from api.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_security_headers(client):
    """Test that security headers are added to responses"""
    response = client.get("/health")
    
    # Check security headers
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-XSS-Protection") == "1; mode=block"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert response.headers.get("X-Permitted-Cross-Domain-Policies") == "none"


def test_process_time_header(client):
    """Test that process time header is added"""
    response = client.get("/health")
    
    assert "X-Process-Time" in response.headers
    # Should be a valid float
    process_time = float(response.headers["X-Process-Time"])
    assert process_time >= 0


def test_cors_headers(client):
    """Test CORS configuration"""
    response = client.options("/api/auth/login", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST"
    })
    
    # Should allow the request from localhost
    assert response.status_code in [200, 204]


def test_settings_loaded(client):
    """Test that settings are properly loaded"""
    from config.settings import settings
    
    assert settings.ENVIRONMENT == "development"
    assert settings.DEBUG is True
    assert "http://localhost:3000" in settings.origins_list