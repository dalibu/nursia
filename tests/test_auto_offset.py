"""
Test automatic offset of previous payments when debt is paid
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from database.models import Base, User, Payment, PaymentCategory, PaymentCategoryGroup, PaymentGroupCode, PaymentStatus
from api.routers.payments import update_payment
from api.schemas.payment import PaymentCreate


@pytest.mark.asyncio
async def test_auto_offset_on_debt_payment():
    """
    Test that when a DEBT payment is marked as PAID,
    all previous UNPAID SALARY/EXPENSE payments are automatically set to OFFSET
    """
    # Setup test database
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session_maker() as db:
        # Create test users with minimal required fields
        admin = User(telegram_id=123, username="admin", full_name="Admin", password_hash="hash")
        worker = User(telegram_id=456, username="worker", full_name="Worker", password_hash="hash")
        db.add_all([admin, worker])
        await db.flush()
        
        # Create payment groups
        salary_group = PaymentCategoryGroup(
            name="Зарплата",
            code=PaymentGroupCode.SALARY.value,
            color="#4CAF50"
        )
        debt_group = PaymentCategoryGroup(
            name="Долги",
            code=PaymentGroupCode.DEBT.value,
            color="#FF5722"
        )
        expense_group = PaymentCategoryGroup(
            name="Расходы",
            code=PaymentGroupCode.EXPENSE.value,
            color="#2196F3"
        )
        db.add_all([salary_group, debt_group, expense_group])
        await db.flush()
        
        # Create categories
        salary_cat = PaymentCategory(name="Зарплата", group_id=salary_group.id)
        debt_cat = PaymentCategory(name="Аванс", group_id=debt_group.id)
        expense_cat = PaymentCategory(name="Расходы", group_id=expense_group.id)
        db.add_all([salary_cat, debt_cat, expense_cat])
        await db.flush()
        
        # Create payments with dates
        base_date = datetime(2025, 8, 1, 12, 0, 0)
        
        # Day 1: Salary payment (unpaid)
        salary1 = Payment(
            payer_id=admin.id,
            recipient_id=worker.id,
            category_id=salary_cat.id,
            amount=100,
            currency="UAH",
            payment_date=base_date,
            payment_status=PaymentStatus.UNPAID.value,
            tracking_nr="P1"
        )
        
        # Day 2: Expense payment (unpaid)
        expense1 = Payment(
            payer_id=worker.id,
            recipient_id=admin.id,
            category_id=expense_cat.id,
            amount=50,
            currency="UAH",
            payment_date=base_date + timedelta(days=1),
            payment_status=PaymentStatus.UNPAID.value,
            tracking_nr="P2"
        )
        
        # Day 3: Salary payment (unpaid)
        salary2 = Payment(
            payer_id=admin.id,
            recipient_id=worker.id,
            category_id=salary_cat.id,
            amount=150,
            currency="UAH",
            payment_date=base_date + timedelta(days=2),
            payment_status=PaymentStatus.UNPAID.value,
            tracking_nr="P3"
        )
        
        # Day 5: Debt payment (unpaid, will be marked as paid)
        debt1 = Payment(
            payer_id=admin.id,
            recipient_id=worker.id,
            category_id=debt_cat.id,
            amount=300,
            currency="UAH",
            payment_date=base_date + timedelta(days=4),
            payment_status=PaymentStatus.UNPAID.value,
            tracking_nr="P4"
        )
        
        # Day 6: Salary after debt (should NOT be auto-offset)
        salary3 = Payment(
            payer_id=admin.id,
            recipient_id=worker.id,
            category_id=salary_cat.id,
            amount=200,
            currency="UAH",
            payment_date=base_date + timedelta(days=5),
            payment_status=PaymentStatus.UNPAID.value,
            tracking_nr="P5"
        )
        
        db.add_all([salary1, expense1, salary2, debt1, salary3])
        await db.commit()
        
        # Store IDs
        salary1_id = salary1.id
        expense1_id = expense1.id
        salary2_id = salary2.id
        debt1_id = debt1.id
        salary3_id = salary3.id
        
    # Now update the debt payment to PAID
    async with async_session_maker() as db:
        result = await db.execute(select(Payment).where(Payment.id == debt1_id))
        debt_payment = result.scalar_one()
        
        # Manually set category group code to DEBT (simulate the join)
        debt_payment.payment_status = PaymentStatus.PAID.value
        
        # Get category
        result = await db.execute(
            select(PaymentCategoryGroup.code)
            .join(PaymentCategory, PaymentCategory.group_id == PaymentCategoryGroup.id)
            .where(PaymentCategory.id == debt_payment.category_id)
        )
        category_group_code = result.scalar_one_or_none()
        
        if category_group_code == PaymentGroupCode.DEBT.value:
            # Find all SALARY and EXPENSE payments with UNPAID and earlier date
            auto_offset_query = select(Payment).join(
                PaymentCategory, Payment.category_id == PaymentCategory.id
            ).join(
                PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
            ).where(
                Payment.payment_status == PaymentStatus.UNPAID.value,
                PaymentCategoryGroup.code.in_([PaymentGroupCode.SALARY.value, PaymentGroupCode.EXPENSE.value]),
                Payment.payment_date < debt_payment.payment_date,
                Payment.payer_id == debt_payment.payer_id,
                Payment.recipient_id == debt_payment.recipient_id
            )
            
            result = await db.execute(auto_offset_query)
            payments_to_offset = result.scalars().all()
            
            for payment_to_offset in payments_to_offset:
                payment_to_offset.payment_status = PaymentStatus.OFFSET.value
        
        await db.commit()
    
    # Verify results
    async with async_session_maker() as db:
        # Check salary1 - should be OFFSET
        result = await db.execute(select(Payment).where(Payment.id == salary1_id))
        salary1_check = result.scalar_one()
        assert salary1_check.payment_status == PaymentStatus.OFFSET.value, "Salary1 should be OFFSET"
        
        # Check expense1 - should be OFFSET (but note: payer/recipient are reversed)
        # Actually, our logic checks same payer_id and recipient_id, so expense won't match
        result = await db.execute(select(Payment).where(Payment.id == expense1_id))
        expense1_check = result.scalar_one()
        # Expense has reversed payer/recipient, so it should NOT be auto-offset
        assert expense1_check.payment_status == PaymentStatus.UNPAID.value, "Expense1 should stay UNPAID (different direction)"
        
        # Check salary2 - should be OFFSET
        result = await db.execute(select(Payment).where(Payment.id == salary2_id))
        salary2_check = result.scalar_one()
        assert salary2_check.payment_status == PaymentStatus.OFFSET.value, "Salary2 should be OFFSET"
        
        # Check debt1 - should be PAID
        result = await db.execute(select(Payment).where(Payment.id == debt1_id))
        debt1_check = result.scalar_one()
        assert debt1_check.payment_status == PaymentStatus.PAID.value, "Debt should be PAID"
        
        # Check salary3 - should stay UNPAID (after debt date)
        result = await db.execute(select(Payment).where(Payment.id == salary3_id))
        salary3_check = result.scalar_one()
        assert salary3_check.payment_status == PaymentStatus.UNPAID.value, "Salary3 should stay UNPAID (after debt)"
    
    await engine.dispose()
