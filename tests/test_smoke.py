"""
Smoke Tests - базовые проверки работоспособности приложения.
Запускаются автоматически при старте контейнера.
"""
import sys
import os

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
    from api.routers.payments import router as payments_router
    from api.routers.balances import router as balances_router
    from api.routers.currencies import router as currencies_router
    from api.routers.assignments import router as assignments_router
    
    assert payments_router is not None
    assert balances_router is not None
    assert assignments_router is not None


def test_app_import():
    """Приложение FastAPI создаётся без ошибок"""
    from api.main import app
    assert app is not None
    assert app.title is not None


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
