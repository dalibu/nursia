"""
Тесты для PaymentGroupCode enum и связанной функциональности
"""
import pytest
from database.models import PaymentGroupCode


class TestPaymentGroupCode:
    """Тесты enum PaymentGroupCode"""
    
    def test_salary_code(self):
        """Проверяем код зарплаты"""
        assert PaymentGroupCode.SALARY.value == "salary"
    
    def test_expense_code(self):
        """Проверяем код расходов"""
        assert PaymentGroupCode.EXPENSE.value == "expense"
    
    def test_bonus_code(self):
        """Проверяем код премий"""
        assert PaymentGroupCode.BONUS.value == "bonus"
    
    def test_debt_code(self):
        """Проверяем код долгов"""
        assert PaymentGroupCode.DEBT.value == "debt"
    
    def test_repayment_code(self):
        """Проверяем код погашений"""
        assert PaymentGroupCode.REPAYMENT.value == "repayment"
    
    def test_enum_is_string(self):
        """PaymentGroupCode должен быть строковым enum"""
        assert isinstance(PaymentGroupCode.SALARY.value, str)
        assert isinstance(PaymentGroupCode.EXPENSE.value, str)
    
    def test_all_codes_unique(self):
        """Все коды должны быть уникальными"""
        codes = [code.value for code in PaymentGroupCode]
        assert len(codes) == len(set(codes))
    
    def test_expected_codes_count(self):
        """Должно быть 5 кодов"""
        assert len(list(PaymentGroupCode)) == 5
