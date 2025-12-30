from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from database.models import UserRole, UserStatusType

class UserStatusResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: Optional[str]
    role: UserRole
    status: UserStatusType
    force_password_change: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class UserStatusUpdate(BaseModel):
    status: UserStatusType
    reason: Optional[str] = None