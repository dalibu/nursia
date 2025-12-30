import bcrypt

def hash_password(password: str) -> str:
    """Хеширование пароля с bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Проверка пароля"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def hash_password_double(password: str) -> str:
    """Двойное хеширование: SHA-256 + bcrypt"""
    import hashlib
    # Сначала SHA-256
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    # Затем bcrypt с солью
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(sha256_hash.encode('utf-8'), salt).decode('utf-8')