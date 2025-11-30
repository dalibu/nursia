from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


class ExpenseCategoryBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None


class ExpenseCategoryCreate(ExpenseCategoryBase):
    pass


class ExpenseCategory(ExpenseCategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseBase(BaseModel):
    category_id: int
    recipient_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    currency: str = Field(default="UAH", max_length=3)
    description: Optional[str] = None
    expense_date: datetime


class ExpenseCreate(ExpenseBase):
    pass


class Expense(ExpenseBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseReport(BaseModel):
    category_name: str
    total_amount: Decimal
    count: int
    period_start: datetime
    period_end: datetime