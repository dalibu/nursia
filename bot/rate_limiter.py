import time
from functools import wraps
from cachetools import TTLCache
from telegram import Update
from telegram.ext import ContextTypes

# Cache stores user_id -> list of timestamps
# TTL is the window size (e.g., 60 seconds)
# Maxsize is max number of users tracked
_rate_limit_cache = TTLCache(maxsize=10000, ttl=60)

def rate_limit(limit: int, window: int):
    """
    Rate limit decorator.
    :param limit: Max requests allowed
    :param window: Time window in seconds
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
            user = update.effective_user
            if not user:
                return await func(update, context, *args, **kwargs)

            current_time = time.time()
            
            # Get user history
            history = _rate_limit_cache.get(user.id, [])
            
            # Filter out old timestamps (although TTL handles key expiration, we need to filter values manually if we store list)
            # Actually, TTLCache expires the whole key. 
            # Better approach for sliding window with TTLCache is tricky.
            # Let's use a simple Token Bucket or Leaky Bucket per user?
            # Or just use the history list and clean it up.
            
            # Clean up history based on window
            history = [t for t in history if current_time - t < window]
            
            if len(history) >= limit:
                # Rate limit exceeded
                # Optional: Warn user (but don't spam warnings)
                # We can check if we already warned them recently?
                # For now, just ignore or log.
                print(f"Rate limit exceeded for user {user.id}")
                return

            history.append(current_time)
            _rate_limit_cache[user.id] = history
            
            return await func(update, context, *args, **kwargs)
        return wrapper
    return decorator
