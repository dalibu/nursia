from telegram import Update
from telegram.ext import ContextTypes

from database.core import AsyncSessionLocal
from database.crud import update_user_role, get_user
from database.models import UserRole
from bot.middleware import access_control

@access_control
async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Admin panel: Use /users to see all users.")

async def handle_approval(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    data = query.data
    action, user_id = data.split("_")
    user_id = int(user_id)
    
    async with AsyncSessionLocal() as session:
        if action == "approve":
            await update_user_role(session, user_id, UserRole.USER)
            await query.edit_message_text(f"User {user_id} approved.")
            try:
                await context.bot.send_message(chat_id=user_id, text="Your account has been approved! You can now use the bot.")
            except:
                pass
        elif action == "reject":
            await update_user_role(session, user_id, UserRole.BLOCKED)
            await query.edit_message_text(f"User {user_id} rejected.")
