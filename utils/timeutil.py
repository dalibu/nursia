from datetime import datetime, timezone

def now_server() -> datetime:
    """Получить текущее время сервера без микросекунд (UTC)"""
    return datetime.now(timezone.utc).replace(microsecond=0)

def strip_microseconds(dt: datetime) -> datetime:
    """Обрезать микросекунды у переданной даты"""
    if dt:
        return dt.replace(microsecond=0)
    return dt
