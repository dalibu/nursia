"""
Утилита для генерации tracking_nr для платежей и смен.
Формат: P{id} для платежей, A{id} для смен.
"""


def format_payment_tracking_nr(payment_id: int) -> str:
    """
    Форматирует tracking_nr для платежа.
    Формат: P{id}
    """
    return f"P{payment_id}"


def format_assignment_tracking_nr(assignment_id: int) -> str:
    """
    Форматирует tracking_nr для смены.
    Формат: A{id}
    """
    return f"A{assignment_id}"

