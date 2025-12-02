import pytest
from decimal import Decimal
from datetime import datetime
from database.models import User, PaymentCategory, Payment, Contributor, UserRole

def test_user_model():
    """Тест модели пользователя"""
    user = User(
        telegram_id=123456789,
        username="testuser",
        password_hash="test_hash",
        full_name="Test User",
        role=UserRole.ADMIN
    )
    
    assert user.telegram_id == 123456789
    assert user.username == "testuser"
    assert user.full_name == "Test User"
    assert user.role == UserRole.ADMIN
    # Проверяем что __repr__ содержит нужные поля
    user_str = str(user)
    assert "testuser" in user_str
    assert "UserRole.ADMIN" in user_str

def test_payment_category_model():
    """Тест модели категории платежей"""
    category = PaymentCategory(
        name="Test Category",
        description="Test description"
    )
    
    assert category.name == "Test Category"
    assert category.description == "Test description"

def test_payment_model():
    """Тест модели платежа"""
    payment = Payment(
        payer_id=1,
        category_id=1,
        amount=Decimal("100.50"),
        currency="UAH",
        description="Test payment",
        payment_date=datetime.now()
    )
    
    assert payment.payer_id == 1
    assert payment.category_id == 1
    assert payment.amount == Decimal("100.50")
    assert payment.currency == "UAH"
    assert payment.description == "Test payment"

def test_contributor_model():
    """Тест модели получателя"""
    contributor = Contributor(
        name="Test Contributor",
        type="organization",
        description="Test organization"
    )

    assert contributor.name == "Test Contributor"
    assert contributor.type == "organization"
    assert contributor.description == "Test organization"

def test_user_roles():
    """Тест ролей пользователей"""
    assert UserRole.ADMIN == "admin"
    assert UserRole.USER == "user"
    assert UserRole.PENDING == "pending"
    assert UserRole.BLOCKED == "blocked"