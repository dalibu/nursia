from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class RecipientBase(BaseModel):
    name: str = Field(..., max_length=200)
    type: str = Field(..., max_length=50)  # 'user' или 'organization'
    description: Optional[str] = None
    is_active: bool = True


class RecipientCreate(RecipientBase):
    pass


class Recipient(RecipientBase):
    id: int
    created_at: datetime
    changed_at: Optional[datetime] = None

    class Config:
        from_attributes = True