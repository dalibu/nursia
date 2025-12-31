"""
Comprehensive tests for balance calculations in api/routers/balances.py

These tests cement the logic for:
- get_balance_summary (Dashboard cards)
- get_monthly_summary (Monthly overview table)
- get_mutual_balances (Взаимные расчёты table)
"""
import pytest
import pytest_asyncio
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from database.models import (
    Base, User, Contributor, Payment, PaymentCategory, PaymentCategoryGroup, UserRole
)
from api.routers.balances import (
    get_balance_summary, get_monthly_summary, get_mutual_balances, MutualBalance
)


# ============================================================================
# TEST FIXTURES
# ============================================================================

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db():
    """Create fresh in-memory database for each test"""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )

    async with AsyncSessionLocal() as session:
        yield session
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def setup_categories(db: AsyncSession):
    """Create standard payment category groups and categories"""
    # Create groups
    salary_group = PaymentCategoryGroup(name="Зарплата", code="salary")
    debt_group = PaymentCategoryGroup(name="Долги", code="debt")
    bonus_group = PaymentCategoryGroup(name="Премии", code="bonus")
    expense_group = PaymentCategoryGroup(name="Расходы", code="expense")
    repayment_group = PaymentCategoryGroup(name="Погашения", code="repayment")
    
    db.add_all([salary_group, debt_group, bonus_group, expense_group, repayment_group])
    await db.flush()
    
    # Create categories
    salary_cat = PaymentCategory(name="Зарплата", group_id=salary_group.id)
    advance_cat = PaymentCategory(name="Аванс", group_id=debt_group.id)
    debt_cat = PaymentCategory(name="Долг", group_id=debt_group.id)
    bonus_cat = PaymentCategory(name="Премия", group_id=bonus_group.id)
    expense_cat = PaymentCategory(name="Расходы", group_id=expense_group.id)
    repayment_cat = PaymentCategory(name="Возврат долга", group_id=repayment_group.id)
    
    db.add_all([salary_cat, advance_cat, debt_cat, bonus_cat, expense_cat, repayment_cat])
    await db.commit()
    
    return {
        "salary": salary_cat,
        "advance": advance_cat,
        "debt": debt_cat,
        "bonus": bonus_cat,
        "expense": expense_cat,
        "repayment": repayment_cat
    }


@pytest_asyncio.fixture
async def setup_users(db: AsyncSession):
    """Create test users and contributors"""
    # Create admin user
    admin = User(
        username="admin", 
        email="admin@test.com", 
        full_name="Admin User",
        role=UserRole.ADMIN, 
        password_hash="test123"
    )
    
    # Create employer contributor
    employer = Contributor(name="АВК", type="organization")
    
    # Create worker contributor  
    worker = Contributor(name="Татьяна", type="user")
    
    # Create worker user
    worker_user = User(
        username="tatiana", 
        email="tatiana@test.com",
        full_name="Татьяна Иванова",
        role=UserRole.USER,
        password_hash="test123"
    )
    
    db.add_all([admin, employer, worker, worker_user])
    await db.flush()
    
    # Link worker contributor to user
    worker.user_id = worker_user.id
    await db.commit()
    
    return {
        "admin": admin,
        "worker_user": worker_user,
        "employer": employer,
        "worker": worker
    }


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def create_payment(
    db: AsyncSession,
    payer_id: int,
    recipient_id: int,
    category_id: int,
    amount: float,
    status: str = "paid",
    currency: str = "UAH",
    payment_date: date = None
) -> Payment:
    """Helper to create a payment"""
    payment = Payment(
        payer_id=payer_id,
        recipient_id=recipient_id,
        category_id=category_id,
        amount=amount,
        payment_status=status,
        currency=currency,
        payment_date=payment_date or date.today(),
        description="Test payment"
    )
    db.add(payment)
    await db.flush()
    return payment


# ============================================================================
# TEST: MUTUAL BALANCES - BASIC SCENARIO
# ============================================================================

@pytest.mark.asyncio
async def test_mutual_balance_simple_debt(db, setup_categories, setup_users):
    """
    Scenario: АВК gives 1000₴ advance to Татьяна
    Expected: Credit=1000, Offset=0, Remaining=1000
    """
    cats = setup_categories
    users = setup_users
    
    # АВК → Татьяна: 1000₴ (Аванс, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["advance"].id, 1000, "paid"
    )
    await db.commit()
    
    # Call get_mutual_balances
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    assert len(result) == 1
    balance = result[0]
    assert balance.creditor_name == "АВК"
    assert balance.debtor_name == "Татьяна"
    assert balance.credit == 1000
    assert balance.offset == 0
    assert balance.remaining == 1000


@pytest.mark.asyncio
async def test_mutual_balance_with_partial_offset(db, setup_categories, setup_users):
    """
    Scenario: АВК gives 1000₴ debt, Татьяна returns 400₴ via repayment
    Expected: Credit=1000, Offset=400, Remaining=600
    """
    cats = setup_categories
    users = setup_users
    
    # АВК → Татьяна: 1000₴ (Долг, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    
    # Татьяна → АВК: 400₴ (Возврат, paid) - repayment category
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["repayment"].id, 400, "paid"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    assert len(result) == 1
    balance = result[0]
    assert balance.credit == 1000
    assert balance.offset == 400
    assert balance.remaining == 600


@pytest.mark.asyncio
async def test_mutual_balance_mixed_offset_types(db, setup_categories, setup_users):
    """
    Scenario: Multiple payments between parties with repayment
    Expected: credit = debt payments, offset = salary + repayment, remaining = net
    """
    cats = setup_categories
    users = setup_users
    
    # АВК → Татьяна: 1000₴ (Долг, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    
    # АВК → Татьяна: 300₴ (Аванс, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["advance"].id, 300, "paid"
    )
    
    # Татьяна → АВК: 500₴ (Возврат долга, paid) - repayment category
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["repayment"].id, 500, "paid"
    )
    
    # АВК → Татьяна: 200₴ (Зарплата, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 200, "paid"
    )
    
    # АВК → Татьяна: 100₴ (Зарплата, paid)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 100, "paid"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    assert len(result) == 1
    balance = result[0]
    # debt: 1000 + 300 = 1300
    # salary: 200 + 100 = 300
    # repayment: 500
    # net = 1300 - 300 - 500 = 500
    assert balance.credit == 1300
    assert balance.offset == 800  # salary(300) + repayment(500)
    assert balance.remaining == 500


@pytest.mark.asyncio
async def test_mutual_balance_fully_paid(db, setup_categories, setup_users):
    """
    Scenario: Debt fully paid off
    Expected: No balance shown (zero remaining is hidden)
    """
    cats = setup_categories
    users = setup_users
    
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["debt"].id, 1000, "offset"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    # Fully paid debts are not shown (remaining == 0)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_mutual_balance_no_duplicates(db, setup_categories, setup_users):
    """
    Ensure we don't get duplicate rows for reverse direction payments
    """
    cats = setup_categories
    users = setup_users
    
    # Both directions of debt payments
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["debt"].id, 500, "offset"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    # Should be only 1 row (for the actual credit given)
    assert len(result) == 1
    assert result[0].creditor_name == "АВК"


@pytest.mark.asyncio
async def test_mutual_balance_multiple_currencies(db, setup_categories, setup_users):
    """
    Scenario: Debts in different currencies
    Expected: Separate rows for each currency
    """
    cats = setup_categories
    users = setup_users
    
    # UAH debt
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid", "UAH"
    )
    
    # EUR debt
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 100, "paid", "EUR"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    assert len(result) == 2
    currencies = {b.currency for b in result}
    assert currencies == {"UAH", "EUR"}


@pytest.mark.asyncio
async def test_mutual_balance_no_debt_payments(db, setup_categories, setup_users):
    """
    Scenario: Only salary payments, no debt
    Expected: Empty result (no mutual balances)
    """
    cats = setup_categories
    users = setup_users
    
    # Only salary payment
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 500, "paid"
    )
    await db.commit()
    
    result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    assert len(result) == 0


# ============================================================================
# TEST: BALANCE SUMMARY (CARDS)
# ============================================================================

@pytest.mark.asyncio
async def test_balance_summary_credits_calculation(db, setup_categories, setup_users):
    """
    Test Credits card: debt given - ALL offsets (both directions)
    """
    cats = setup_categories
    users = setup_users
    
    # Debt given
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    
    # Offset in both directions
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["debt"].id, 300, "offset"
    )
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 200, "offset"
    )
    await db.commit()
    
    # For admin - gets system-wide totals
    result = await get_balance_summary(
        db=db, 
        current_user=users["admin"],
        employer_id=None,
        worker_id=None
    )
    
    # credits_given = 1000, credits_offset = 500 (300 + 200)
    # total_credits shows total given (not net)
    assert result.total_credits == 1000
    assert result.total_salary == 200 # offset salary counts as salary


@pytest.mark.asyncio
async def test_balance_summary_salary_includes_offset(db, setup_categories, setup_users):
    """
    Test Salary card includes both 'paid' and 'offset' status
    """
    cats = setup_categories
    users = setup_users
    
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 500, "paid"
    )
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 300, "offset"
    )
    await db.commit()
    
    result = await get_balance_summary(
        db=db, 
        current_user=users["admin"],
        employer_id=None,
        worker_id=None
    )
    
    assert result.total_salary == 800  # 500 + 300


# ============================================================================
# TEST: MONTHLY SUMMARY
# ============================================================================

@pytest.mark.asyncio
async def test_monthly_summary_offset_both_directions(db, setup_categories, setup_users):
    """
    Test that monthly offset shows repayment from worker to employer
    """
    cats = setup_categories
    users = setup_users
    today = date.today()
    
    # Salary payment (included in salary, not offset)
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 200, "paid", payment_date=today
    )
    
    # Repayment: worker → employer (this becomes negative offset)
    await create_payment(
        db, users["worker"].id, users["employer"].id,
        cats["repayment"].id, 500, "paid", payment_date=today
    )
    await db.commit()
    
    result = await get_monthly_summary(
        months=1,
        worker_id=users["worker"].id,
        employer_id=None,
        db=db,
        current_user=users["admin"]
    )
    
    # Offset shows repayment as negative
    assert len(result) >= 1
    current_month = result[0]
    assert current_month.salary == 200
    assert current_month.offset == -500  # Repayment shown as negative


@pytest.mark.asyncio
async def test_monthly_summary_date_filtering(db, setup_categories, setup_users):
    """
    Test that payments are correctly filtered by date range
    """
    cats = setup_categories
    users = setup_users
    today = date.today()
    last_month = today - timedelta(days=35)
    
    # Payment this month
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 500, "paid", payment_date=today
    )
    
    # Payment last month
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 300, "paid", payment_date=last_month
    )
    await db.commit()
    
    result = await get_monthly_summary(
        months=2,
        employer_id=None,
        worker_id=None,
        db=db,
        current_user=users["admin"]
    )
    
    assert len(result) == 2  # Two months of data


@pytest.mark.asyncio
async def test_balance_summary_worker_view(db, setup_categories, setup_users):
    """
    Test that worker sees only their own data in balance summary
    """
    cats = setup_categories
    users = setup_users
    
    # Debt given to THIS worker
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["debt"].id, 1000, "paid"
    )
    
    # Create another worker
    other_worker = Contributor(name="Other Worker", type="user")
    db.add(other_worker)
    await db.flush()
    
    # Debt given to OTHER worker
    await create_payment(
        db, users["employer"].id, other_worker.id,
        cats["debt"].id, 500, "paid"
    )
    await db.commit()
    
    # Call as THIS worker user
    result = await get_balance_summary(
        db=db, 
        current_user=users["worker_user"],
        employer_id=None,
        worker_id=None
    )
    
    # Should see only their 1000 credit
    assert result.total_credits == 1000


@pytest.mark.asyncio
async def test_balance_summary_no_data(db, setup_users):
    """
    Test balance summary with no payments
    """
    users = setup_users
    
    result = await get_balance_summary(
        db=db, 
        current_user=users["admin"],
        employer_id=None,
        worker_id=None
    )
    
    assert result.total_salary == 0
    assert result.total_credits == 0
    assert result.total_unpaid == 0
    assert result.balances == []


@pytest.mark.asyncio
async def test_monthly_summary_worker_view(db, setup_categories, setup_users):
    """
    Test that worker sees only their own data in monthly summary
    """
    cats = setup_categories
    users = setup_users
    today = date.today()
    
    # Salary for THIS worker
    await create_payment(
        db, users["employer"].id, users["worker"].id,
        cats["salary"].id, 1000, "paid", payment_date=today
    )
    
    # Create another worker
    other_worker = Contributor(name="Other Worker", type="user")
    db.add(other_worker)
    await db.flush()
    
    # Salary for OTHER worker
    await create_payment(
        db, users["employer"].id, other_worker.id,
        cats["salary"].id, 500, "paid", payment_date=today
    )
    await db.commit()
    
    # Call as THIS worker user
    result = await get_monthly_summary(
        months=1,
        db=db,
        current_user=users["worker_user"],
        employer_id=None,
        worker_id=None
    )
    
    assert len(result) == 1
    assert result[0].salary == 1000  # Should not see other worker's salary


# ============================================================================
# COMPREHENSIVE REAL-WORLD TEST (mirrors production data)
# ============================================================================

@pytest.mark.asyncio
async def test_real_world_scenario(db, setup_categories, setup_users):
    """
    Comprehensive test mirroring real production data:
    - P1:  15.11.2025 АВК→Татьяна Долг     1000 (debt)
    - P6:  26.11.2025 АВК→Татьяна Премии    500 (bonus - excluded from mutual)
    - P23: 29.12.2025 АВК→Татьяна Зарплата  100 (salary)
    - P24: 30.12.2025 АВК→Татьяна Аванс     300 (debt)
    - P25: 30.12.2025 АВК→Татьяна Зарплата  200 (salary)
    - P26: 30.12.2025 Татьяна→АВК Возврат   500 (repayment)
    - P27: 30.12.2025 АВК→Татьяна Зарплата  600 (salary)
    - P28: 31.12.2025 АВК→Татьяна Зарплата  100 (salary)
    
    Expected results:
    ================
    
    MUTUAL BALANCES (Взаимные расчёты):
    - Кредитор: Татьяна, Должник: АВК
    - Кредит/Аванс: 1300 (debt 1000 + advance 300)
    - Погашено: 1500 (salary 1000 + repayment 500)
    - К оплате: 200 (АВК owes Татьяна because 1300 - 1500 = -200)
    
    MONTHLY SUMMARY 12.2025:
    - Зарплата: 1000 (100 + 200 + 600 + 100)
    - Кредиты: 300 (advance only in Dec)
    - Погашено: -500 (repayment, negative)
    - Итого: 800 (1000 + 300 - 500)
    
    MONTHLY SUMMARY 11.2025:
    - Кредиты: 1000 (долг in Nov)
    - Премии: 500
    - Итого: 1500
    """
    cats = setup_categories
    users = setup_users
    
    # Dates
    nov_15 = date(2025, 11, 15)
    nov_26 = date(2025, 11, 26)
    dec_29 = date(2025, 12, 29)
    dec_30 = date(2025, 12, 30)
    dec_31 = date(2025, 12, 31)
    
    employer = users["employer"]  # АВК
    worker = users["worker"]      # Татьяна
    
    # P1: Долг 1000 (November)
    await create_payment(db, employer.id, worker.id, cats["debt"].id, 1000, "paid", payment_date=nov_15)
    
    # P6: Премия 500 (November) - excluded from mutual balance
    await create_payment(db, employer.id, worker.id, cats["bonus"].id, 500, "paid", payment_date=nov_26)
    
    # P23: Зарплата 100 (December)
    await create_payment(db, employer.id, worker.id, cats["salary"].id, 100, "paid", payment_date=dec_29)
    
    # P24: Аванс 300 (December)
    await create_payment(db, employer.id, worker.id, cats["advance"].id, 300, "paid", payment_date=dec_30)
    
    # P25: Зарплата 200 (December)
    await create_payment(db, employer.id, worker.id, cats["salary"].id, 200, "paid", payment_date=dec_30)
    
    # P26: Возврат долга 500 (December) - Татьяна→АВК (repayment)
    await create_payment(db, worker.id, employer.id, cats["repayment"].id, 500, "paid", payment_date=dec_30)
    
    # P27: Зарплата 600 (December)
    await create_payment(db, employer.id, worker.id, cats["salary"].id, 600, "paid", payment_date=dec_30)
    
    # P28: Зарплата 100 (December with time - testing datetime handling)
    await create_payment(db, employer.id, worker.id, cats["salary"].id, 100, "paid", payment_date=dec_31)
    
    await db.commit()
    
    # ===== TEST 1: MUTUAL BALANCES =====
    print("\n" + "="*60)
    print("TEST: MUTUAL BALANCES (Взаимные расчёты)")
    print("="*60)
    
    mutual_result = await get_mutual_balances(db=db, current_user=users["admin"])
    
    print(f"Found {len(mutual_result)} mutual balance entries")
    for mb in mutual_result:
        print(f"  Creditor: {mb.creditor_name}, Debtor: {mb.debtor_name}")
        print(f"  Credit: {mb.credit}, Offset: {mb.offset}, Remaining: {mb.remaining}")
    
    # Assertions
    assert len(mutual_result) == 1, f"Expected 1 mutual balance, got {len(mutual_result)}"
    mb = mutual_result[0]
    
    # Татьяна is the creditor (АВК owes her because overpaid)
    assert mb.creditor_name == "Татьяна", f"Expected Татьяна as creditor, got {mb.creditor_name}"
    assert mb.debtor_name == "АВК", f"Expected АВК as debtor, got {mb.debtor_name}"
    assert mb.credit == 1300, f"Credit: expected 1300, got {mb.credit}"  # debt 1000 + advance 300
    assert mb.offset == 1500, f"Offset: expected 1500, got {mb.offset}"  # salary 1000 + repayment 500
    assert mb.remaining == 200, f"Remaining: expected 200, got {mb.remaining}"  # АВК owes 200
    
    print("✓ Mutual balances correct!")
    
    # ===== TEST 2: MONTHLY SUMMARY =====
    print("\n" + "="*60)
    print("TEST: MONTHLY SUMMARY (Помесячный обзор)")
    print("="*60)
    
    monthly_result = await get_monthly_summary(
        months=6,
        db=db,
        current_user=users["admin"],
        employer_id=None,
        worker_id=None
    )
    
    # Find December and November summaries
    dec_summary = next((s for s in monthly_result if s.period == "2025-12"), None)
    nov_summary = next((s for s in monthly_result if s.period == "2025-11"), None)
    
    print("\nDecember 2025:")
    if dec_summary:
        print(f"  Зарплата: {dec_summary.salary}")
        print(f"  Кредиты:  {dec_summary.paid}")
        print(f"  Погашено: {dec_summary.offset}")
        print(f"  Итого:    {dec_summary.total}")
    
    print("\nNovember 2025:")
    if nov_summary:
        print(f"  Кредиты:  {nov_summary.paid}")
        print(f"  Премии:   {nov_summary.bonus}")
        print(f"  Итого:    {nov_summary.total}")
    
    # December assertions
    assert dec_summary is not None, "December summary not found"
    assert dec_summary.salary == 1000, f"Dec salary: expected 1000, got {dec_summary.salary}"
    assert dec_summary.paid == 300, f"Dec credits: expected 300, got {dec_summary.paid}"
    assert dec_summary.offset == -500, f"Dec offset: expected -500, got {dec_summary.offset}"
    assert dec_summary.total == 800, f"Dec total: expected 800, got {dec_summary.total}"
    
    # November assertions
    assert nov_summary is not None, "November summary not found"
    assert nov_summary.paid == 1000, f"Nov credits: expected 1000, got {nov_summary.paid}"
    assert nov_summary.bonus == 500, f"Nov bonus: expected 500, got {nov_summary.bonus}"
    
    print("\n✓ Monthly summary correct!")
    print("="*60)
