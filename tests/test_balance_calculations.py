"""
Balance Calculation Tests from JSON Fixtures

This test module validates balance calculations by:
1. Loading JSON fixtures from tests/balance_fixtures/
2. Creating an in-memory SQLite database
3. Seeding with payments from the fixture
4. CALLING the actual balance calculation functions from api/routers/balances.py
5. Comparing results with expected values

This follows the DRY principle - we test the real business logic, not a copy of it.
"""
import json
import pytest
import asyncio
from pathlib import Path
from decimal import Decimal
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

# Import models
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.models import (
    Base, User, Payment, PaymentCategory, PaymentCategoryGroup
)
from api.routers.balances import get_balance_summary


# Get all JSON fixtures
FIXTURES_DIR = Path(__file__).parent / "balance_fixtures"


def get_fixture_files():
    """Discover all JSON fixtures in the balance_fixtures directory"""
    if not FIXTURES_DIR.exists():
        return []
    return list(FIXTURES_DIR.glob("*.json"))


def load_fixture(filepath: Path) -> dict:
    """Load a JSON fixture file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


async def setup_async_test_db(fixture_data: dict):
    """Create in-memory async SQLite database and seed with fixture data"""
    # Create async engine with in-memory SQLite
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        poolclass=StaticPool,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create async session
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Create category groups
        groups = {}
        group_codes = {
            "Зарплата": "salary",
            "Расходы": "expense",
            "Долги": "debt",
            "Премии": "bonus",
            "Погашения": "repayment",
            "Прочее": "other"
        }
        for name, code in group_codes.items():
            group = PaymentCategoryGroup(name=name, code=code, color="#000000", emoji="📝")
            session.add(group)
        
        await session.flush()
        
        # Re-fetch groups to get IDs
        result = await session.execute(select(PaymentCategoryGroup))
        for group in result.scalars():
            groups[group.name] = group
        
        # Create categories (one per group for simplicity)
        categories = {}
        for name, group in groups.items():
            cat = PaymentCategory(name=name, description=name, group_id=group.id)
            session.add(cat)
        
        await session.flush()
        
        # Re-fetch categories to get IDs
        result = await session.execute(select(PaymentCategory))
        for cat in result.scalars():
            categories[cat.name] = cat
        
        # Extract unique users from payments
        users_map = {}  # id -> User
        payments = fixture_data.get("payments", [])
        
        for p in payments:
            for user_field in ["payer_id", "recipient_id"]:
                uid = p.get(user_field)
                if uid and uid not in users_map:
                    name = p.get(f"{user_field.replace('_id', '_name')}", f"User {uid}")
                    user = User(
                        id=uid,
                        username=f"user{uid}",
                        password_hash="test",
                        full_name=name,
                        status="active"
                    )
                    session.add(user)
                    users_map[uid] = user
        
        await session.flush()
        
        # Create payments
        for p in payments:
            category_group = p.get("category_group", "Прочее")
            category = categories.get(category_group, categories.get("Прочее"))
            
            payment_date = p.get("payment_date")
            if payment_date:
                if isinstance(payment_date, str):
                    payment_date = datetime.fromisoformat(payment_date.replace("Z", "+00:00"))
            else:
                payment_date = datetime.now()
            
            payment = Payment(
                tracking_nr=p.get("tracking_nr"),
                payer_id=p.get("payer_id"),
                recipient_id=p.get("recipient_id"),
                amount=Decimal(str(p.get("amount", 0))),
                currency=p.get("currency", "UAH"),
                category_id=category.id,
                payment_status=p.get("payment_status", "unpaid"),
                payment_date=payment_date,
                description=p.get("description")
            )
            session.add(payment)
        
        await session.commit()
    
    return engine, async_session


async def calculate_balance_using_real_function(engine, async_session, worker_id=None):
    """
    Call the ACTUAL balance calculation function from api/routers/balances.py
    This is the DRY approach - we test the real business logic!
    """
    from api.routers.balances import get_mutual_balances, get_monthly_summary
    
    async with async_session() as db:
        # Create a mock user with admin permissions to see all data
        mock_user = MagicMock()
        mock_user.id = 999  # Non-existent user to avoid filtering
        mock_user.has_permission = MagicMock(return_value=True)  # Admin can see everything
        
        # If worker_id is specified, limit to that worker
        summary_result = await get_balance_summary(
            employer_id=None,
            worker_id=worker_id,
            db=db,
            current_user=mock_user
        )
        
        # Also get mutual balances
        mutual_result = await get_mutual_balances(
            db=db,
            current_user=mock_user
        )
        
        # Get monthly summary (all months)
        monthly_result = await get_monthly_summary(
            months=24,  # Get maximum available months
            employer_id=None,
            worker_id=worker_id,
            db=db,
            current_user=mock_user
        )
        
        # Convert DashboardSummary to the format expected by tests
        # Note: repayment is inverted to negative (as shown in GUI/debug export)
        return {
            "cards": {
                "salary": summary_result.total_salary,
                "expenses": summary_result.total_expenses,
                "credits": summary_result.total_credits,
                "repayment": -summary_result.total_repayment,  # Invert to match GUI format
                "bonus": summary_result.total_bonus,
                "to_pay": summary_result.total_unpaid,
                "total": summary_result.total
            },
            "mutual_balances": [
                {
                    "creditor_id": mb.creditor_id,
                    "debtor_id": mb.debtor_id,
                    "credit": mb.credit,
                    "offset": mb.offset,
                    "remaining": mb.remaining,
                    "currency": mb.currency
                }
                for mb in mutual_result
            ],
            "monthly": [
                {
                    "period": ms.period,
                    "sessions": ms.sessions,
                    "hours": ms.hours,
                    "salary": ms.salary,
                    "paid": ms.paid,
                    "offset": ms.offset,
                    "to_pay": ms.to_pay,
                    "expenses": ms.expenses,
                    "expenses_paid": ms.expenses_paid,
                    "bonus": ms.bonus,
                    "remaining": ms.remaining,
                    "total": ms.total,
                    "currency": ms.currency
                }
                for ms in monthly_result
            ]
        }


# Parametrize test with all fixture files
fixture_files = get_fixture_files()

@pytest.mark.parametrize("fixture_path", fixture_files, ids=[f.stem for f in fixture_files])
@pytest.mark.asyncio
async def test_balance_calculation(fixture_path: Path):
    """
    Test balance calculation against expected values from JSON fixture.
    
    This test uses the ACTUAL business logic from api/routers/balances.py
    instead of duplicating calculations. This way:
    - We follow the DRY principle
    - We test the real code that runs in production
    - Bugs found here are bugs in the actual business logic
    """
    fixture_data = load_fixture(fixture_path)
    expected_cards = fixture_data.get("cards", {})
    expected_mutual = fixture_data.get("mutual_balances", [])
    
    if not expected_cards:
        pytest.skip(f"No 'cards' section in fixture {fixture_path.name}")
    
    # Determine worker_id from fixture if available
    # Check for explicit worker_id in fixture, or auto-detect from payments
    worker_id = fixture_data.get("worker_id")
    
    if worker_id is None:
        # Auto-detect: find recipient of debt/credit payments (they are the worker)
        payments = fixture_data.get("payments", [])
        for p in payments:
            if p.get("category_group") == "Долги" and p.get("recipient_id"):
                worker_id = p.get("recipient_id")
                break
    
    # Setup async test database
    engine, async_session = await setup_async_test_db(fixture_data)
    
    try:
        # Call the REAL balance calculation function
        calculated = await calculate_balance_using_real_function(engine, async_session, worker_id=worker_id)
        
        # Compare cards
        fields_to_check = ["salary", "expenses", "credits", "repayment", "bonus", "to_pay", "total"]
        
        errors = []
        for field in fields_to_check:
            expected = expected_cards.get(field, 0)
            actual = calculated["cards"].get(field, 0)
            
            if abs(expected - actual) > 0.01:  # Allow small float precision errors
                errors.append(f"cards.{field}: expected {expected}, got {actual}")
        
        # Compare mutual_balances
        if expected_mutual:
            actual_mutual = calculated.get("mutual_balances", [])
            
            if len(expected_mutual) != len(actual_mutual):
                errors.append(f"mutual_balances count: expected {len(expected_mutual)}, got {len(actual_mutual)}")
            else:
                for i, (exp_mb, act_mb) in enumerate(zip(expected_mutual, actual_mutual)):
                    # Compare each field
                    for field in ["creditor_id", "debtor_id", "credit", "offset", "remaining"]:
                        exp_val = exp_mb.get(field, 0)
                        act_val = act_mb.get(field, 0)
                        
                        if isinstance(exp_val, (int, float)) and isinstance(act_val, (int, float)):
                            if abs(exp_val - act_val) > 0.01:
                                errors.append(f"mutual_balances[{i}].{field}: expected {exp_val}, got {act_val}")
                        elif exp_val != act_val:
                            errors.append(f"mutual_balances[{i}].{field}: expected {exp_val}, got {act_val}")
        
        # Compare monthly data
        expected_monthly = fixture_data.get("monthly", [])
        if expected_monthly:
            actual_monthly = calculated.get("monthly", [])
            
            # Create a dict of actual monthly data by period
            actual_monthly_dict = {m["period"]: m for m in actual_monthly}
            
            for i, exp_m in enumerate(expected_monthly):
                period = exp_m.get("period")
                if period not in actual_monthly_dict:
                    errors.append(f"monthly period {period} not found in actual data")
                    continue
                
                act_m = actual_monthly_dict[period]
                
                # Compare each field
                monthly_fields = ["sessions", "hours", "salary", "paid", "offset",
                                 "to_pay", "expenses", "expenses_paid", "bonus", "remaining", "total"]
                for field in monthly_fields:
                    exp_val = exp_m.get(field, 0)
                    act_val = act_m.get(field, 0)
                    
                    if isinstance(exp_val, (int, float)) and isinstance(act_val, (int, float)):
                        if abs(exp_val - act_val) > 0.01:
                            errors.append(f"monthly[{period}].{field}: expected {exp_val}, got {act_val}")
                    elif exp_val != act_val:
                        errors.append(f"monthly[{period}].{field}: expected {exp_val}, got {act_val}")
        
        if errors:
            pytest.fail(f"Balance mismatch in {fixture_path.name}:\n" + "\n".join(errors))
    
    finally:
        await engine.dispose()


# Allow running with no fixtures (useful during development)
if not fixture_files:
    @pytest.mark.asyncio
    async def test_no_fixtures():
        """Placeholder test when no fixtures exist"""
        pytest.skip("No JSON fixtures found in tests/balance_fixtures/. Add fixtures to run tests.")
