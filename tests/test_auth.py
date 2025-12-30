import pytest
from datetime import datetime, timedelta, timezone
from api.auth.oauth import create_access_token
from config.settings import settings
from jose import jwt

def test_create_access_token():
    """Тест создания JWT токена"""
    data = {"sub": "123456789"}
    token = create_access_token(data)
    
    assert isinstance(token, str)
    assert len(token) > 0
    
    # Декодируем токен для проверки
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert payload["sub"] == "123456789"
    assert "exp" in payload

def test_create_access_token_with_expiry():
    """Тест создания токена с кастомным временем истечения"""
    data = {"sub": "123456789"}
    expires_delta = timedelta(minutes=5)
    token = create_access_token(data, expires_delta)
    
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    
    # Проверяем, что поле exp существует и это число
    assert "exp" in payload
    assert isinstance(payload["exp"], (int, float))
    
    # Проверяем, что время истечения в будущем
    exp_time = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    now = datetime.now(timezone.utc)
    assert exp_time > now  # Токен должен истекать в будущем

def test_token_expiry():
    """Тест истечения токена"""
    data = {"sub": "123456789"}
    # Создаем токен, который уже истек
    expires_delta = timedelta(seconds=-1)
    token = create_access_token(data, expires_delta)
    
    # Попытка декодировать истекший токен должна вызвать исключение
    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])