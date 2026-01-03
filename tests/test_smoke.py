"""
Smoke Tests - базовые проверки работоспособности приложения.
Запускаются автоматически при старте контейнера.

Эти тесты должны быть максимально простыми и быстрыми.
Сложные тесты с моками вынесены в отдельные файлы:
- test_permissions.py - тесты прав доступа
- test_payments_integration.py - глубокие тесты платежей
"""
import sys
import os
import pytest

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_models_import():
    """Все модели импортируются без ошибок"""
    from database.models import (
        User, Payment, PaymentCategory, PaymentCategoryGroup,
        Currency, Assignment, Task, Role, Permission
    )
    assert User.__tablename__ == "users"
    assert Payment.__tablename__ == "payments"
    assert PaymentCategory.__tablename__ == "payment_categories"
    assert PaymentCategoryGroup.__tablename__ == "payment_category_groups"
    assert Assignment.__tablename__ == "assignments"
    assert Task.__tablename__ == "tasks"


def test_schemas_import():
    """Все схемы импортируются без ошибок"""
    from api.schemas.payment import (
        PaymentBase, PaymentCreate, Payment as PaymentSchema,
        PaymentCategoryBase, PaymentCategoryGroupBase
    )
    assert PaymentBase is not None
    assert PaymentCategoryGroupBase is not None


def test_routers_import():
    """Все роутеры импортируются без ошибок"""
    from api.routers.auth import router as auth_router
    from api.routers.payments import router as payments_router
    from api.routers.balances import router as balances_router
    from api.routers.currencies import router as currencies_router
    from api.routers.assignments import router as assignments_router
    from api.routers.admin import router as admin_router
    from api.routers.users import router as users_router
    from api.routers.settings import router as settings_router
    from api.routers.employment import router as employment_router
    
    assert auth_router is not None
    assert payments_router is not None
    assert balances_router is not None
    assert assignments_router is not None
    assert admin_router is not None
    assert users_router is not None
    assert settings_router is not None
    assert employment_router is not None


def test_api_health():
    """API отвечает на базовые запросы здоровья"""
    from fastapi.testclient import TestClient
    from api.main import app
    
    client = TestClient(app)
    
    # Базовые проверки здоровья
    assert client.get("/api/health").status_code == 200
    
    # Проверка публичного эндпоинта
    assert client.get("/api/users/password-rules").status_code == 200


def test_api_routers_registered():
    """Проверка что все основные роутеры зарегистрированы в приложении"""
    from api.main import app
    
    # Получаем все зарегистрированные пути
    routes = [route.path for route in app.routes]
    
    # Проверяем что основные эндпоинты зарегистрированы
    expected_prefixes = [
        "/api/auth",
        "/api/users",
        "/api/payments",
        "/api/balances",
        "/api/assignments",
        "/api/admin",
        "/api/settings",
    ]
    
    for prefix in expected_prefixes:
        assert any(prefix in route for route in routes), f"Router {prefix} not registered"


def test_app_import():
    """Приложение FastAPI создаётся без ошибок"""
    from api.main import app
    assert app is not None
    assert app.title is not None


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))

