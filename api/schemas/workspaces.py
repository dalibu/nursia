from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    default_currency: str = Field(default="UAH", min_length=3, max_length=3)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("default_currency", mode="before")
    @classmethod
    def normalize_currency(cls, value):
        return value.strip().upper() if isinstance(value, str) else value


class WorkspaceInviteCreate(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().casefold() if isinstance(value, str) else value


class WorkspaceInviteAccept(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name", mode="before")
    @classmethod
    def strip_full_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class WorkspaceSwitch(BaseModel):
    workspace_id: int = Field(gt=0)


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    role: str
    default_currency: str


class WorkspaceInvitePreview(BaseModel):
    workspace_name: str
    email: EmailStr
    expires_at: datetime


class WorkspaceMemberResponse(BaseModel):
    user_id: int
    username: str
    full_name: str
    email: Optional[EmailStr] = None
    role: str
    joined_at: datetime
