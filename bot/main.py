import logging
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, MessageHandler, filters

from config.settings import settings
from bot.handlers.user import start, help_command, handle_start_stop, persistent_button_handler, history_command
from bot.handlers.admin import admin_panel, handle_approval

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

def main():
    application = ApplicationBuilder().token(settings.TELEGRAM_TOKEN).build()

    # User handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("history", history_command))
    # persistent start/stop/history buttons via ReplyKeyboardMarkup
    application.add_handler(MessageHandler(filters.Regex(r"^(Старт|Стоп|История)$"), persistent_button_handler))
    
    # Admin handlers
    application.add_handler(CommandHandler("admin", admin_panel))
    application.add_handler(CallbackQueryHandler(handle_approval, pattern="^(approve|reject)_"))
    # Start/Stop inline callbacks (legacy / optional)
    application.add_handler(CallbackQueryHandler(handle_start_stop, pattern="^(bot_start|bot_stop)$"))

    application.run_polling()

if __name__ == '__main__':
    main()
