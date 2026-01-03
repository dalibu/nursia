"""
Smoke-тесты для balances API endpoints
"""
import pytest
from fastapi.testclient import TestClient
from api.main import app


client = TestClient(app)


class TestBalancesAPISmoke:
    """Smoke-тесты для /api/balances/* endpoints"""
    
    def test_balances_summary_unauthorized(self):
        """Без авторизации должен вернуть 401"""
        response = client.get("/api/balances/summary")
        assert response.status_code == 401
    
    def test_balances_monthly_unauthorized(self):
        """Без авторизации должен вернуть 401"""
        response = client.get("/api/balances/monthly")
        assert response.status_code == 401
    
    def test_balances_mutual_unauthorized(self):
        """Без авторизации должен вернуть 401"""
        response = client.get("/api/balances/mutual")
        assert response.status_code == 401
    
    def test_balances_debug_unauthorized(self):
        """Без авторизации должен вернуть 401"""
        response = client.get("/api/balances/debug")
        assert response.status_code == 401


class TestBalancesModelsImport:
    """Тесты импорта моделей и схем для balances"""
    
    def test_import_payment_group_code(self):
        """PaymentGroupCode должен импортироваться из models"""
        from database.models import PaymentGroupCode
        assert PaymentGroupCode is not None
    
    def test_import_balances_router(self):
        """Router balances должен импортироваться"""
        from api.routers import balances
        assert balances.router is not None
    
    def test_balances_router_has_endpoints(self):
        """Router должен иметь зарегистрированные endpoints"""
        from api.routers.balances import router
        routes = [r.path for r in router.routes]
        # Router paths include prefix
        assert "/balances/summary" in routes
        assert "/balances/monthly" in routes
        assert "/balances/mutual" in routes
