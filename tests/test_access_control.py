import pytest
from database.crud import create_user, get_user, update_user_role
from database.models import UserRole

@pytest.mark.asyncio
async def test_create_user(db_session):
    user = await create_user(db_session, telegram_id=123, full_name="Test User", username="testuser")
    assert user.telegram_id == 123
    assert user.role == UserRole.PENDING

@pytest.mark.asyncio
async def test_admin_approval_flow(db_session):
    # 1. Create pending user
    user = await create_user(db_session, telegram_id=456, full_name="Pending User")
    assert user.role == UserRole.PENDING
    
    # 2. Approve user
    updated_user = await update_user_role(db_session, 456, UserRole.USER)
    assert updated_user.role == UserRole.USER
    
    # 3. Block user
    blocked_user = await update_user_role(db_session, 456, UserRole.BLOCKED)
    assert blocked_user.role == UserRole.BLOCKED

@pytest.mark.asyncio
async def test_auto_admin_registration(db_session):
    # Simulate logic from middleware (simplified)
    admin_id = 999
    # Assume settings.ADMIN_IDS contains 999
    
    user = await create_user(
        db_session, 
        telegram_id=admin_id, 
        full_name="Admin User", 
        role=UserRole.ADMIN
    )
    assert user.role == UserRole.ADMIN
