import pytest
import time
from unittest.mock import AsyncMock, MagicMock

# Skip if telegram module not available
telegram = pytest.importorskip("telegram")
from telegram import Update, User
from bot.rate_limiter import rate_limit

@pytest.mark.asyncio
async def test_rate_limiter():
    # Mock update and context
    update = MagicMock(spec=Update)
    user = MagicMock(spec=User)
    user.id = 12345
    update.effective_user = user
    context = MagicMock()

    # Create a dummy handler decorated with rate limit
    mock_handler = AsyncMock(return_value="success")
    
    @rate_limit(limit=2, window=1)
    async def decorated_handler(u, c):
        return await mock_handler(u, c)

    # 1st call: Should pass
    result = await decorated_handler(update, context)
    assert result == "success"
    assert mock_handler.call_count == 1

    # 2nd call: Should pass
    result = await decorated_handler(update, context)
    assert result == "success"
    assert mock_handler.call_count == 2

    # 3rd call: Should fail (return None)
    result = await decorated_handler(update, context)
    assert result is None
    assert mock_handler.call_count == 2  # Count shouldn't increase

    # Wait for window to expire
    time.sleep(1.1)

    # 4th call: Should pass again
    result = await decorated_handler(update, context)
    assert result == "success"
    assert mock_handler.call_count == 3
