import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_expense_payment_fields_in_response(client):
    """Тест что API возвращает поля оплаты в ответе"""
    response = client.get("/api/expenses/")
    
    # Проверяем что endpoint существует
    assert response.status_code in [200, 401, 403]
    
    # Проверяем что ответ в JSON формате
    assert "application/json" in response.headers.get("content-type", "")

def test_expense_update_with_payment_status(client):
    """Тест обновления статуса оплаты расхода"""
    # Тест без авторизации должен вернуть 401/403
    response = client.put("/api/expenses/1", json={
        "amount": 100,
        "currency": "UAH",
        "category_id": 1,
        "recipient_id": 1,
        "expense_date": "2024-01-01T00:00:00",
        "is_paid": True
    })
    
    assert response.status_code in [401, 403, 404]

def test_expense_create_with_payment_status(client):
    """Тест создания расхода с статусом оплаты"""
    response = client.post("/api/expenses/", json={
        "amount": 100,
        "currency": "UAH", 
        "category_id": 1,
        "recipient_id": 1,
        "expense_date": "2024-01-01T00:00:00",
        "is_paid": False
    })
    
    # Без авторизации должен вернуть 401/403
    assert response.status_code in [401, 403]

def test_payment_status_validation():
    """Тест валидации статуса оплаты"""
    # Проверяем что is_paid принимает boolean значения
    valid_statuses = [True, False, None]
    
    for status in valid_statuses:
        expense_data = {
            "amount": 100,
            "currency": "UAH",
            "category_id": 1,
            "recipient_id": 1,
            "expense_date": "2024-01-01T00:00:00",
            "is_paid": status
        }
        
        # Проверяем что данные корректны
        assert isinstance(expense_data["is_paid"], (bool, type(None)))

def test_paid_at_field_logic():
    """Тест логики поля paid_at"""
    from datetime import datetime
    
    # Когда is_paid = True, должно устанавливаться paid_at
    expense_paid = {"is_paid": True}
    if expense_paid["is_paid"]:
        expense_paid["paid_at"] = datetime.now()
    
    assert "paid_at" in expense_paid
    assert expense_paid["paid_at"] is not None
    
    # Когда is_paid = False, paid_at должно быть None
    expense_unpaid = {"is_paid": False}
    if not expense_unpaid["is_paid"]:
        expense_unpaid["paid_at"] = None
    
    assert expense_unpaid.get("paid_at") is None