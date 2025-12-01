import pytest
import pytest_asyncio
from database.models import Currency
from sqlalchemy import select


class TestCurrencyDefault:
    
    @pytest_asyncio.fixture
    async def sample_currencies(self, db_session):
        currencies = [
            Currency(code="UAH", name="Ukrainian Hryvnia", symbol="₴", is_active=True, is_default=True),
            Currency(code="EUR", name="Euro", symbol="€", is_active=True, is_default=False),
            Currency(code="USD", name="US Dollar", symbol="$", is_active=True, is_default=False),
        ]
        
        for currency in currencies:
            db_session.add(currency)
        await db_session.commit()
        
        return currencies
    
    @pytest.mark.asyncio
    async def test_only_one_default_currency(self, db_session, sample_currencies):
        """Тест что только одна валюта может быть по умолчанию"""
        result = await db_session.execute(select(Currency).where(Currency.is_default == True))
        default_currencies = result.scalars().all()
        
        assert len(default_currencies) == 1
        assert default_currencies[0].code == "UAH"
    
    @pytest.mark.asyncio
    async def test_currency_model_has_default_field(self, db_session):
        """Тест что модель Currency имеет поле is_default"""
        currency = Currency(
            code="TEST", 
            name="Test Currency", 
            symbol="T", 
            is_active=True, 
            is_default=False
        )
        
        db_session.add(currency)
        await db_session.commit()
        await db_session.refresh(currency)
        
        assert hasattr(currency, 'is_default')
        assert currency.is_default == False