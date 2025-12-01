from telegram import Update
from telegram.ext import ContextTypes
from bot.middleware import access_control
from bot.keyboards import get_start_stop_keyboard, get_persistent_start_stop_keyboard
from datetime import datetime, timezone
from telegram import Message
from typing import Dict, Any
from sqlalchemy.exc import SQLAlchemyError

from database.core import AsyncSessionLocal
from database.crud import create_action



# in-memory active timers: telegram_id -> dict(job, start_ts, chat_id, message_id)
active_timers: Dict[int, Dict[str, Any]] = {}


def _format_duration(seconds: int) -> str:
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:02}"


@access_control
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a persistent reply keyboard with 'Старт' и 'Стоп'."""
    keyboard = get_persistent_start_stop_keyboard()
    if update.message:
        await update.message.reply_text("Выберите действие:", reply_markup=keyboard)
    else:
        await context.bot.send_message(chat_id=update.effective_user.id, text="Выберите действие:", reply_markup=keyboard)


@access_control
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Available commands:\n/start - Check access\n/help - Show this message")


async def handle_start_stop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle callback queries from the start/stop inline keyboard."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data
    user_id = query.from_user.id if query.from_user else None

    if data == "bot_start":
        text = "Действие: Старт — выполнено."
    elif data == "bot_stop":
        text = "Действие: Стоп — выполнено."
    else:
        text = "Неизвестное действие."

    # Try to edit the original message to reflect the action, fallback to sending a new message.
    try:
        await query.edit_message_text(text)
    except Exception:
        if user_id:
            try:
                await context.bot.send_message(chat_id=user_id, text=text)
            except Exception:
                pass


async def _timer_job(context: ContextTypes.DEFAULT_TYPE):
    """Job that updates the timer message every second."""
    job = context.job
    data = job.data or {}
    telegram_id = data.get("telegram_id")
    start_ts = data.get("start_ts")
    chat_id = data.get("chat_id")
    message_id = data.get("message_id")
    if not (telegram_id and start_ts and chat_id and message_id):
        return

    now = datetime.now(timezone.utc)
    elapsed = int((now - start_ts).total_seconds())
    text = f"Таймер запущен — { _format_duration(elapsed) }"
    try:
        await context.bot.edit_message_text(text=text, chat_id=chat_id, message_id=message_id)
    except Exception:
        # ignore edit failures
        pass


async def persistent_button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle messages from persistent keyboard: 'Старт' and 'Стоп'."""
    if not update.message:
        return
    text = update.message.text.strip()
    user = update.message.from_user
    telegram_id = user.id
    chat_id = update.message.chat_id

    if text == "Старт":
        if telegram_id in active_timers:
            await update.message.reply_text("Таймер уже запущен.")
            return

        start_ts = datetime.now(timezone.utc)
        # send initial timer message
        sent: Message = await update.message.reply_text("Таймер запущен — 00:00:00")

        # schedule job to update message every second
        job = context.job_queue.run_repeating(
            _timer_job,
            interval=1,
            first=1,
            data={
                "telegram_id": telegram_id,
                "start_ts": start_ts,
                "chat_id": chat_id,
                "message_id": sent.message_id,
            },
        )

        active_timers[telegram_id] = {
            "job": job,
            "start_ts": start_ts,
            "chat_id": chat_id,
            "message_id": sent.message_id,
        }

        await update.message.reply_text("Таймер запущен — отсчёт начался.")

    elif text == "Стоп":
        state = active_timers.get(telegram_id)
        if not state:
            await update.message.reply_text("Таймер не запущен.")
            return

        # stop the job
        job = state.get("job")
        try:
            job.schedule_removal()
        except Exception:
            pass

        start_ts = state.get("start_ts")
        stop_ts = datetime.now(timezone.utc)
        duration = int((stop_ts - start_ts).total_seconds())

        # update the timer message to final summary
        chat_id = state.get("chat_id")
        message_id = state.get("message_id")
        final_text = (
            f"Таймер остановлен.\n"
            f"Начало: {start_ts.isoformat()}\n"
            f"Конец: {stop_ts.isoformat()}\n"
            f"Длительность: { _format_duration(duration) }"
        )
        try:
            await context.bot.edit_message_text(text=final_text, chat_id=chat_id, message_id=message_id)
        except Exception:
            pass

        # persist to DB
        try:
            async with AsyncSessionLocal() as session:
                await create_action(
                    session=session,
                    telegram_id=telegram_id,
                    full_name=user.full_name if user else None,
                    username=user.username if user else None,
                    start_ts=start_ts,
                    stop_ts=stop_ts,
                    duration_seconds=duration,
                )
        except SQLAlchemyError:
            # if DB write fails, at least notify user
            await update.message.reply_text("Сохранение в базу данных не удалось.")

        # cleanup
        active_timers.pop(telegram_id, None)
        await update.message.reply_text(f"Таймер остановлен, длительность { _format_duration(duration) }.")

    else:
        # handle history button
        if text == "История":
            await history_command(update, context)
        return


async def history_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show recent action history for the current user."""
    if update.message:
        user = update.message.from_user
        chat_id = update.message.chat_id
    else:
        user = update.effective_user
        chat_id = update.effective_chat.id if update.effective_chat else None

    if not user:
        return

    telegram_id = user.id

    try:
        async with AsyncSessionLocal() as session:
            # Actions functionality removed
            rows = []
    except Exception:
        await context.bot.send_message(chat_id=chat_id, text="Не удалось загрузить историю (ошибка БД).")
        return

    if not rows:
        await context.bot.send_message(chat_id=chat_id, text="Записей по вашим действиям не найдено.")
        return

    lines = []
    for r in rows:
        start = r.start_ts.isoformat() if r.start_ts else "-"
        stop = r.stop_ts.isoformat() if r.stop_ts else "-"
        dur = _format_duration(r.duration_seconds) if r.duration_seconds is not None else "-"
        lines.append(f"ID:{r.id} {start} — {stop} ({dur})")

    text = "Последние действия:\n" + "\n".join(lines)
    # send as message (may be long)
    await context.bot.send_message(chat_id=chat_id, text=text)
