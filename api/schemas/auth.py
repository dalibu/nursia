from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    force_password_change: bool = False


class TokenData(BaseModel):
    user_id: Optional[int] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserRegister(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    full_name: str


class RegistrationRequestResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: Optional[str]
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChangePassword(BaseModel):
    old_password: str
    new_password: str