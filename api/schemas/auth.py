from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    user_id: Optional[int] = None


class UserLogin(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    full_name: str


class UserResponse(BaseModel):
    telegram_id: int
    username: Optional[str]
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True