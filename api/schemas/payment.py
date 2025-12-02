from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class PaymentCategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None


class PaymentCategoryCreate(PaymentCategoryBase):
    pass


class PaymentCategory(PaymentCategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentBase(BaseModel):
    category_id: int
    recipient_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    currency: str = Field(max_length=3)
    description: Optional[str] = Field(None, max_length=1000)
    payment_date: datetime
    is_paid: Optional[bool] = False


class PaymentCreate(PaymentBase):
    user_id: Optional[int] = None


class RecipientInfo(BaseModel):
    id: int
    name: str
    type: str

    class Config:
        from_attributes = True


class UserInfo(BaseModel):
    id: int
    full_name: str
    username: str

    class Config:
        from_attributes = True


class Payment(PaymentBase):
    id: int
    user_id: int
    created_at: datetime
    paid_at: Optional[datetime] = None
    category: Optional[PaymentCategory] = None
    recipient: Optional[RecipientInfo] = None
    user: Optional[UserInfo] = None

    class Config:
        from_attributes = True


class PaymentReport(BaseModel):
    category_name: str
    total_amount: Decimal
    count: int
    period_start: datetime
    period_end: datetime