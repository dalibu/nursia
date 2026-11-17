from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    force_password_change: bool = False
    profile_setup_pending: bool = False


class TokenData(BaseModel):
    user_id: Optional[int] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserRegister(BaseModel):
    password: str = Field(min_length=1)
    full_name: str = Field(min_length=1, max_length=100)
    turnstile_token: str = Field(min_length=1, max_length=2048)

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_full_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class RegistrationRequestResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    status: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: Optional[str]
    roles: List[str]
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChangePassword(BaseModel):
    old_password: str
    new_password: str