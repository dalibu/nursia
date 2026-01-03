"""
Тесты прав доступа (permissions).
Проверяет корректную работу разграничения доступа между ролями.
"""
import sys
import os
import pytest

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_worker_cannot_access_admin_users_list():
    """Проверка, что обычный пользователь не может видеть /users/ (admin only)"""
    from fastapi.testclient import TestClient
    from api.main import app
    from database.models import User
    from api.auth.oauth import get_current_user, get_admin_user
    from database.core import get_db
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    
    mock_worker = User(id=2, username="worker", status="active")
    mock_worker.roles = []  # Нет роли admin
    
    mock_db = AsyncMock()
    mock_execute_result = MagicMock()
    mock_db.execute.return_value = mock_execute_result
    mock_execute_result.scalars = MagicMock()
    mock_execute_result.scalars.return_value.all.return_value = []
    mock_execute_result.scalar_one_or_none = MagicMock(return_value=None)
    
    app.dependency_overrides[get_current_user] = lambda: mock_worker
    
    # get_admin_user должен выкидывать 403 для не-админа
    def mock_get_admin_user():
        raise HTTPException(status_code=403, detail="Forbidden")
    app.dependency_overrides[get_admin_user] = mock_get_admin_user
    app.dependency_overrides[get_db] = lambda: mock_db
    
    client = TestClient(app)
    
    try:
        # /api/users/ должен быть ЗАПРЕЩЕН (403) для обычного работника
        resp_admin = client.get("/api/users/")
        assert resp_admin.status_code == 403, "Workers MUST NOT be able to access /api/users/"
        
    finally:
        app.dependency_overrides.clear()


def test_worker_can_access_users_all():
    """Проверка, что обычный пользователь может видеть /users/all"""
    from fastapi.testclient import TestClient
    from api.main import app
    from database.models import User
    from api.auth.oauth import get_current_user, get_admin_user
    from database.core import get_db
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    
    mock_worker = User(id=2, username="worker", status="active")
    mock_worker.roles = []
    
    mock_db = AsyncMock()
    mock_execute_result = MagicMock()
    mock_db.execute.return_value = mock_execute_result
    mock_execute_result.scalars = MagicMock()
    mock_execute_result.scalars.return_value.all.return_value = []
    mock_execute_result.scalar_one_or_none = MagicMock(return_value=None)
    
    app.dependency_overrides[get_current_user] = lambda: mock_worker
    
    def mock_get_admin_user():
        raise HTTPException(status_code=403, detail="Forbidden")
    app.dependency_overrides[get_admin_user] = mock_get_admin_user
    app.dependency_overrides[get_db] = lambda: mock_db
    
    client = TestClient(app)
    
    try:
        # /api/users/all должен быть доступен (не 403)
        resp_all = client.get("/api/users/all")
        assert resp_all.status_code != 403, "Workers should be able to access /api/users/all"
        
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
