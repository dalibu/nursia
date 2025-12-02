"""Unit-тесты для recipients API в стиле существующих тестов.

Только проверка существования endpoints и требований авторизации,
без реального доступа к базе данных.
"""

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client():
  """HTTP клиент для тестов recipients."""
  return TestClient(app)


def test_recipients_endpoint_exists(client):
  """Список получателей требует авторизации."""
  response = client.get("/api/recipients/")
  assert response.status_code == 401


def test_recipients_admin_endpoints_exist(client):
  """Тест существования admin endpoints для получателей."""

  # Admin list
  response = client.get("/api/recipients/admin")
  assert response.status_code == 401

  # Create
  response = client.post("/api/recipients/", json={
    "name": "Test",
    "type": "user",
    "description": "",
    "is_active": True,
  })
  assert response.status_code == 401

  # Update
  response = client.put("/api/recipients/1", json={
    "name": "Updated",
    "type": "user",
    "description": "desc",
    "is_active": False,
  })
  assert response.status_code == 401

  # Validate delete
  response = client.get("/api/recipients/1/validate-delete")
  assert response.status_code == 401

  # Delete
  response = client.delete("/api/recipients/1")
  assert response.status_code == 401
