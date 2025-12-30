from datetime import datetime
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, Field


# Payment Category Group schemas
class PaymentCategoryGroupBase(BaseModel):
    name: str = Field(..., max_length=100)
    color: str = Field(default="#808080", max_length=7)
    emoji: str = Field(default="💰", max_length=10)
    is_active: bool = True


class PaymentCategoryGroupCreate(PaymentCategoryGroupBase):
    pass


class PaymentCategoryGroupResponse(PaymentCategoryGroupBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# Payment Category schemas
class PaymentCategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    group_id: Optional[int] = None
    description: Optional[str] = None


class PaymentCategoryCreate(PaymentCategoryBase):
    pass


class PaymentCategory(PaymentCategoryBase):
    id: int
    created_at: datetime
    category_group: Optional[PaymentCategoryGroupResponse] = None

    class Config:
        from_attributes = True


class PaymentBase(BaseModel):
    category_id: int
    recipient_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    currency: str = Field(max_length=3)
    description: Optional[str] = Field(None, max_length=1000)
    payment_date: datetime
    payment_status: Literal['unpaid', 'paid', 'offset'] = 'unpaid'


class PaymentCreate(PaymentBase):
    payer_id: Optional[int] = None


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
    payer_id: int
    tracking_nr: Optional[str] = None
    created_at: datetime
    paid_at: Optional[datetime] = None
    assignment_id: Optional[int] = None
    assignment_tracking_nr: Optional[str] = None
    category: Optional[PaymentCategory] = None
    recipient: Optional[RecipientInfo] = None
    payer: Optional[RecipientInfo] = None

    class Config:
        from_attributes = True


class PaymentReport(BaseModel):
    category_name: str
    total_amount: Decimal
    count: int
    period_start: datetime
    period_end: datetime