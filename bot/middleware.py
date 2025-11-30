from functools import wraps
from telegram import Update
from telegram.ext import ContextTypes

from config.settings import settings
from database.core import AsyncSessionLocal
from database.crud import get_user, create_user, get_all_users
from database.models import UserRole
from bot.keyboards import get_approval_keyboard
from bot.rate_limiter import rate_limit

import logging

logger = logging.getLogger(__name__)

def access_control(func):
    @rate_limit(limit=5, window=10)
    @wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user = update.effective_user
        if not user:
            return

        logger.info(f"Processing update from user {user.id} ({user.username})")

        async with AsyncSessionLocal() as session:
            db_user = await get_user(session, user.id)
            
            # Auto-register admin if in ADMIN_IDS
            if not db_user and user.id in settings.ADMIN_IDS:
                logger.info(f"Auto-registering admin {user.id}")
                db_user = await create_user(
                    session, 
                    telegram_id=user.id, 
                    full_name=user.full_name, 
                    username=user.username,
                    role=UserRole.ADMIN
                )
            
            # Register new user as PENDING
            if not db_user:
                logger.info(f"Registering new user {user.id} as PENDING")
                db_user = await create_user(
                    session, 
                    telegram_id=user.id, 
                    full_name=user.full_name, 
                    username=user.username,
                    role=UserRole.PENDING
                )
                # Notify admins about new user
                admins = [u for u in await get_all_users(session) if u.role == UserRole.ADMIN]
                for admin in admins:
                    try:
                        await context.bot.send_message(
                            chat_id=admin.telegram_id,
                            text=f"New user registration:\nID: {user.id}\nName: {user.full_name}\nUsername: @{user.username}",
                            reply_markup=get_approval_keyboard(user.id)
                        )
                    except Exception as e:
                        logger.error(f"Failed to notify admin {admin.telegram_id}: {e}")

            logger.info(f"User {user.id} role: {db_user.role}")

            if db_user.role == UserRole.BLOCKED:
                logger.info(f"User {user.id} is blocked")
                return # Ignore blocked users
            
            if db_user.role == UserRole.PENDING:
                logger.info(f"User {user.id} is pending")
                await update.message.reply_text("Your account is pending approval. Please wait for an administrator to approve your request.")
                return

            # Allow access for ADMIN and USER
            logger.info(f"Access granted for user {user.id}")
            return await func(update, context, *args, **kwargs)

    return wrapper
