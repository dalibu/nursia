"""Unit-тесты для contributors API в стиле существующих тестов.

Только проверка существования endpoints и требований авторизации,
без реального доступа к базе данных.
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client():
  """HTTP клиент для тестов contributors."""
  return TestClient(app)


def test_contributors_endpoint_exists(client):
  """Проверка доступности эндпоинта contributors."""
  # GET /contributors/ uses get_current_user -> 401
  response = client.get("/api/contributors/")
  assert response.status_code == 401


def test_contributors_admin_endpoints_exist(client):
  """Проверка доступности админских эндпоинтов contributors."""
  # All admin endpoints use get_admin_user -> 403
  
  # 1. GET /api/contributors/admin
  response = client.get("/api/contributors/admin")
  assert response.status_code == 403

  # 2. POST /api/contributors/
  response = client.post("/api/contributors/", json={
    "name": "Test",
    "type": "user",
    "description": "",
    "is_active": True,
  })
  assert response.status_code == 403

  # 3. PUT /api/contributors/{id}
  response = client.put("/api/contributors/1", json={
    "name": "Updated",
    "type": "user",
    "description": "desc",
    "is_active": False,
  })
  assert response.status_code == 403

  # 4. GET /api/contributors/{id}/validate-delete
  response = client.get("/api/contributors/1/validate-delete")
  assert response.status_code == 403

  # 5. DELETE /api/contributors/{id}
  response = client.delete("/api/contributors/1")
  assert response.status_code == 403
