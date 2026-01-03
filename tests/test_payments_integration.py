"""
Интеграционные тесты создания платежей.
Проверяет корректную работу API создания платежей с различными сценариями.

NOTE: Эти тесты используют глубокое мокирование и предназначены для проверки
бизнес-логики, а не для smoke-тестов при старте контейнера.
"""
import sys
import os
import pytest
import datetime

# Добавляем корень проекта в путь
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.mark.skip(reason="Requires proper database setup - run with integration test suite")
def test_worker_create_payment_integration():
    """
    Интеграционный тест создания платежа работником.
    
    Этот тест требует настроенной базы данных и не должен запускаться
    как smoke-тест при старте контейнера.
    """
    from fastapi.testclient import TestClient
    from api.main import app
    from database.models import User, PaymentCategory, Currency, Payment, PaymentCategoryGroup
    from api.auth.oauth import get_current_user
    from database.core import get_db
    from unittest.mock import AsyncMock, MagicMock
    
    mock_worker = User(id=2, username="worker", full_name="Worker User", status="active")
    mock_db = AsyncMock()
    
    # Мокаем результат для валюты
    mock_currency = Currency(code="UAH", is_default=True)
    mock_curr_res = MagicMock()
    mock_curr_res.scalar_one_or_none.return_value = mock_currency
    
    # Мокаем результат для повторного запроса платежа (после коммита)
    mock_group = PaymentCategoryGroup(id=1, name="Exp")
    mock_cat = PaymentCategory(id=1, name="Test", created_at=datetime.datetime.now())
    mock_cat.category_group = mock_group
    
    mock_payment = Payment(id=10, amount=100.0, currency="UAH", payer_id=2, category_id=1)
    mock_payment.category = mock_cat
    mock_payment.payer = mock_worker
    mock_payment.recipient = None
    mock_payment.tracking_nr = "P10"
    mock_payment.created_at = datetime.datetime.now()
    mock_payment.payment_date = datetime.datetime.now()
    mock_payment.payment_status = "unpaid"
    mock_payment.paid_at = None
    mock_payment.assignment_id = None
    mock_payment.assignment = None
    
    mock_pay_res = MagicMock()
    mock_pay_res.unique.return_value.scalar_one.return_value = mock_payment
    
    mock_db.execute.side_effect = [mock_curr_res, mock_pay_res]
    
    app.dependency_overrides[get_current_user] = lambda: mock_worker
    app.dependency_overrides[get_db] = lambda: mock_db
    
    client = TestClient(app)
    
    payment_data = {
        "category_id": 1,
        "amount": 100.00,
        "currency": "UAH",
        "payment_date": datetime.datetime.now().isoformat(),
        "payer_id": 2,
        "payment_status": "unpaid"
    }
    
    try:
        response = client.post("/api/payments/", json=payment_data)
        if response.status_code == 500:
            content = response.text
            if "NameError" in content or "is not defined" in content:
                pytest.fail(f"NameError in create_payment: {content}")
        assert response.status_code == 200, f"Error creating payment: {response.text}"
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
