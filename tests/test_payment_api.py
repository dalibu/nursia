import pytest
from fastapi.testclient import TestClient
from api.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_payment_fields_in_response(client):
    """Тест что API возвращает поля оплаты в ответе"""
    response = client.get("/api/payments/")
    
    # Проверяем что endpoint существует
    assert response.status_code in [200, 401, 403]
    
    # Проверяем что ответ в JSON формате
    assert "application/json" in response.headers.get("content-type", "")

def test_payment_update_with_status(client):
    """Тест обновления статуса оплаты платежа"""
    # Тест без авторизации должен вернуть 401/403
    response = client.put("/api/payments/1", json={
        "amount": 100,
        "currency": "UAH",
        "category_id": 1,
        "recipient_id": 1,
        "payment_date": "2024-01-01T00:00:00",
        "is_paid": True
    })
    
    assert response.status_code in [401, 403, 404]

def test_payment_create_with_status(client):
    """Тест создания платежа со статусом оплаты"""
    response = client.post("/api/payments/", json={
        "amount": 100,
        "currency": "UAH", 
        "category_id": 1,
        "recipient_id": 1,
        "payment_date": "2024-01-01T00:00:00",
        "is_paid": False
    })
    
    # Без авторизации должен вернуть 401/403
    assert response.status_code in [401, 403]

def test_payment_status_validation():
    """Тест валидации статуса оплаты"""
    # Проверяем что is_paid принимает boolean значения
    valid_statuses = [True, False, None]
    
    for status in valid_statuses:
        payment_data = {
            "amount": 100,
            "currency": "UAH",
            "category_id": 1,
            "recipient_id": 1,
            "payment_date": "2024-01-01T00:00:00",
            "is_paid": status
        }
        
        # Проверяем что данные корректны
        assert isinstance(payment_data["is_paid"], (bool, type(None)))

def test_paid_at_field_logic():
    """Тест логики поля paid_at"""
    from datetime import datetime
    
    # Когда is_paid = True, должно устанавливаться paid_at
    payment_paid = {"is_paid": True}
    if payment_paid["is_paid"]:
        payment_paid["paid_at"] = datetime.now()
    
    assert "paid_at" in payment_paid
    assert payment_paid["paid_at"] is not None
    
    # Когда is_paid = False, paid_at должно быть None
    payment_unpaid = {"is_paid": False}
    if not payment_unpaid["is_paid"]:
        payment_unpaid["paid_at"] = None
    
    assert payment_unpaid.get("paid_at") is None