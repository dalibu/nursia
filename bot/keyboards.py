from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton

def get_approval_keyboard(user_id: int) -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("Approve", callback_data=f"approve_{user_id}"),
            InlineKeyboardButton("Reject", callback_data=f"reject_{user_id}"),
        ]
    ]
    return InlineKeyboardMarkup(keyboard)


def get_start_stop_keyboard() -> InlineKeyboardMarkup:
    """Return an inline keyboard with two buttons: 'Старт' and 'Стоп'.

    Callback data values are `bot_start` and `bot_stop` respectively.
    """
    keyboard = [
        [
            InlineKeyboardButton("Старт", callback_data="bot_start"),
            InlineKeyboardButton("Стоп", callback_data="bot_stop"),
        ]
    ]
    return InlineKeyboardMarkup(keyboard)


def get_persistent_start_stop_keyboard() -> ReplyKeyboardMarkup:
    """Return a persistent reply keyboard with two buttons: 'Старт' and 'Стоп'."""
    # add a third button for viewing history
    keyboard = [[KeyboardButton("Старт"), KeyboardButton("Стоп")], [KeyboardButton("История")]]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=False)
