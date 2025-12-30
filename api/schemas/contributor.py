from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ContributorBase(BaseModel):
    name: str = Field(..., max_length=200)
    type: str = Field(..., max_length=50)  # 'user' или 'organization'
    description: Optional[str] = None
    is_active: bool = True
    user_id: Optional[int] = None  # Связь с User для фильтрации данных


class ContributorCreate(ContributorBase):
    pass


class Contributor(ContributorBase):
    id: int
    created_at: datetime
    changed_at: Optional[datetime] = None
    user_name: Optional[str] = None  # Имя связанного пользователя

    model_config = ConfigDict(from_attributes=True)