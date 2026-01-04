"""
Balance Calculation Tests from JSON Fixtures

This test module validates balance calculations by:
1. Loading JSON fixtures from tests/balance_fixtures/
2. Creating an in-memory SQLite database
3. Seeding with payments from the fixture
4. Running balance calculations
5. Comparing results with expected values
"""
import json
import pytest
from pathlib import Path
from decimal import Decimal
from datetime import datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker, Session

# Import models
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.models import (
    Base, User, Payment, PaymentCategory, PaymentCategoryGroup,
    Role, Permission, EmploymentRelation
)


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


def setup_test_db(fixture_data: dict) -> Session:
    """Create in-memory SQLite database and seed with fixture data"""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
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
        session.flush()
        groups[name] = group
    
    # Create categories (one per group for simplicity)
    categories = {}
    for name, group in groups.items():
        cat = PaymentCategory(name=name, description=name, group_id=group.id)
        session.add(cat)
        session.flush()
        categories[name] = cat
    
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
    
    session.flush()
    
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
    
    session.commit()
    return session, engine


def calculate_balance_from_db(session: Session) -> dict:
    """
    Calculate balance summary from the test database.
    This mirrors the logic in api/routers/balances.py get_balance_summary()
    """
    from database.models import PaymentGroupCode
    
    # Get all payments with categories
    result = session.execute(
        select(
            Payment.amount,
            Payment.payment_status,
            PaymentCategoryGroup.code.label("group_code")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        )
    )
    
    totals = {
        "salary": Decimal(0),
        "expenses": Decimal(0),
        "credits": Decimal(0),
        "repayment": Decimal(0),
        "bonus": Decimal(0),
        "unpaid": Decimal(0)
    }
    
    for row in result:
        amount = row.amount
        status = row.payment_status
        code = row.group_code
        
        if code == PaymentGroupCode.SALARY.value:
            totals["salary"] += amount
        elif code == PaymentGroupCode.EXPENSE.value:
            # Only count PAID expenses
            if status == "paid":
                totals["expenses"] += amount
        elif code == PaymentGroupCode.DEBT.value:
            totals["credits"] += amount
        elif code == PaymentGroupCode.REPAYMENT.value:
            if status == "paid":
                totals["repayment"] += amount
        elif code == PaymentGroupCode.BONUS.value:
            totals["bonus"] += amount
        
        # Unpaid calculation: only non-repayment unpaid payments
        if status == "unpaid" and code != PaymentGroupCode.REPAYMENT.value:
            totals["unpaid"] += amount
    
    # Calculate to_pay: credits - repayment + unpaid
    to_pay = totals["credits"] - totals["repayment"] + totals["unpaid"]
    
    return {
        "salary": float(totals["salary"]),
        "expenses": float(totals["expenses"]),
        "credits": float(totals["credits"]),
        "repayment": float(-totals["repayment"]),  # Negative as on GUI
        "bonus": float(totals["bonus"]),
        "to_pay": float(to_pay),
        "total": float(totals["credits"] - totals["repayment"])
    }


# Parametrize test with all fixture files
fixture_files = get_fixture_files()

@pytest.mark.parametrize("fixture_path", fixture_files, ids=[f.stem for f in fixture_files])
def test_balance_calculation(fixture_path: Path):
    """Test balance calculation against expected values from JSON fixture"""
    fixture_data = load_fixture(fixture_path)
    expected_cards = fixture_data.get("cards", {})
    
    if not expected_cards:
        pytest.skip(f"No 'cards' section in fixture {fixture_path.name}")
    
    # Setup test database
    session, engine = setup_test_db(fixture_data)
    
    try:
        # Calculate balances
        calculated = calculate_balance_from_db(session)
        
        # Compare each field
        fields_to_check = ["salary", "expenses", "credits", "repayment", "bonus", "to_pay", "total"]
        
        errors = []
        for field in fields_to_check:
            expected = expected_cards.get(field, 0)
            actual = calculated.get(field, 0)
            
            if abs(expected - actual) > 0.01:  # Allow small float precision errors
                errors.append(f"{field}: expected {expected}, got {actual}")
        
        if errors:
            pytest.fail(f"Balance mismatch in {fixture_path.name}:\n" + "\n".join(errors))
    
    finally:
        session.close()
        engine.dispose()


# Allow running with no fixtures (useful during development)
if not fixture_files:
    def test_no_fixtures():
        """Placeholder test when no fixtures exist"""
        pytest.skip("No JSON fixtures found in tests/balance_fixtures/. Add fixtures to run tests.")
