import pytest
from decimal import Decimal
from datetime import datetime
from database.models import User, ExpenseCategory, Expense, Recipient, UserRole

def test_user_model():
    """Тест модели пользователя"""
    user = User(
        telegram_id=123456789,
        full_name="Test User",
        role=UserRole.ADMIN
    )
    
    assert user.telegram_id == 123456789
    assert user.full_name == "Test User"
    assert user.role == UserRole.ADMIN
    assert str(user) == "<User(id=123456789, role=UserRole.ADMIN)>"

def test_expense_category_model():
    """Тест модели категории расходов"""
    category = ExpenseCategory(
        name="Test Category",
        description="Test description"
    )
    
    assert category.name == "Test Category"
    assert category.description == "Test description"

def test_expense_model():
    """Тест модели расхода"""
    expense = Expense(
        user_id=123456789,
        category_id=1,
        amount=Decimal("100.50"),
        currency="UAH",
        description="Test expense",
        expense_date=datetime.now()
    )
    
    assert expense.user_id == 123456789
    assert expense.category_id == 1
    assert expense.amount == Decimal("100.50")
    assert expense.currency == "UAH"
    assert expense.description == "Test expense"

def test_recipient_model():
    """Тест модели получателя"""
    recipient = Recipient(
        name="Test Recipient",
        type="organization",
        description="Test organization"
    )
    
    assert recipient.name == "Test Recipient"
    assert recipient.type == "organization"
    assert recipient.description == "Test organization"

def test_user_roles():
    """Тест ролей пользователей"""
    assert UserRole.ADMIN == "admin"
    assert UserRole.USER == "user"
    assert UserRole.PENDING == "pending"
    assert UserRole.BLOCKED == "blocked"