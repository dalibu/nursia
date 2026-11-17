import hashlib
import hmac
import re
import secrets
import unicodedata
import logging

import httpx
from disposable_email_domains import blocklist
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from database.models import RegistrationRequest, User

logger = logging.getLogger(__name__)
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


CYRILLIC_TRANSLITERATION = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "ґ": "g", "д": "d",
    "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "і": "i",
    "ї": "yi", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "u",
})


def username_base(full_name: str) -> str:
    transliterated = full_name.casefold().translate(CYRILLIC_TRANSLITERATION)
    ascii_name = unicodedata.normalize("NFKD", transliterated).encode("ascii", "ignore").decode()
    name_parts = re.findall(r"[a-z0-9]+", ascii_name)
    if not name_parts:
        return "user"
    if len(name_parts) == 1:
        return name_parts[0][:50]
    return f"{name_parts[0]}.{name_parts[-1]}"[:50]


def is_disposable_email(email: str) -> bool:
    domain = email.rpartition("@")[2].casefold()
    return domain in blocklist


def new_email_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_email_verification_code(email: str, code: str) -> str:
    payload = f"{email.casefold()}:{code}".encode()
    return hmac.new(settings.JWT_SECRET_KEY.encode(), payload, hashlib.sha256).hexdigest()


def new_invite_token() -> str:
    return secrets.token_urlsafe(32)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def available_usernames(
    db: AsyncSession,
    full_name: str,
    count: int = 1,
    exclude_user_id: int | None = None,
) -> list[str]:
    user_query = select(User.username, User.id)
    if exclude_user_id is not None:
        user_query = user_query.where(User.id != exclude_user_id)
    users = await db.execute(user_query)
    used = {username.casefold() for username, _ in users.all()}

    pending_requests = await db.execute(
        select(RegistrationRequest.username).where(RegistrationRequest.status == "pending")
    )
    used.update(username.casefold() for username in pending_requests.scalars().all())

    base = username_base(full_name)
    suggestions = []
    suffix = 1
    while len(suggestions) < count:
        suffix_text = "" if suffix == 1 else str(suffix)
        candidate = f"{base[:50 - len(suffix_text)]}{suffix_text}"
        if candidate.casefold() not in used:
            suggestions.append(candidate)
            used.add(candidate.casefold())
        suffix += 1
    return suggestions


async def verify_turnstile_token(token: str) -> None:
    if not settings.TURNSTILE_SECRET_KEY:
        raise HTTPException(status_code=503, detail={"code": "turnstile_not_configured"})

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                TURNSTILE_VERIFY_URL,
                data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token},
            )
            response.raise_for_status()
            result = response.json()
    except (httpx.HTTPError, ValueError):
        logger.exception("Cloudflare Turnstile verification request failed")
        raise HTTPException(status_code=503, detail={"code": "turnstile_unavailable"})

    if not result.get("success"):
        raise HTTPException(status_code=400, detail={"code": "turnstile_failed"})
