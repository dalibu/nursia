import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload
from database.core import get_db
from database.models import User, Expense, ExpenseCategory, Recipient
from api.schemas.expense import (
    ExpenseCreate, Expense as ExpenseSchema,
    ExpenseCategoryCreate, ExpenseCategory as ExpenseCategorySchema,
    ExpenseReport
)
from api.auth.oauth import get_current_user, get_admin_user

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post("/categories", response_model=ExpenseCategorySchema)
async def create_category(
    category: ExpenseCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    db_category = ExpenseCategory(**category.dict())
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.get("/categories", response_model=List[ExpenseCategorySchema])
async def get_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(ExpenseCategory))
    return result.scalars().all()


@router.post("/")
async def create_expense(
    expense: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    expense_data = expense.model_dump()
    # Если expense_date без времени, добавляем текущее время
    if expense_data['expense_date'].time() == datetime.min.time():
        now = datetime.now()
        expense_data['expense_date'] = expense_data['expense_date'].replace(
            hour=now.hour,
            minute=now.minute,
            second=now.second
        )
    
    db_expense = Expense(**expense_data, user_id=current_user.id)
    db.add(db_expense)
    await db.commit()
    await db.refresh(db_expense)
    return {"id": db_expense.id, "message": "Expense created successfully"}


@router.get("/")
async def get_expenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category_id: Optional[int] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.recipient),
        joinedload(Expense.user)
    )
    
    # Админ видит все расходы, пользователи только свои
    if current_user.role != "admin":
        query = query.where(Expense.user_id == current_user.id)
    
    if category_id:
        query = query.where(Expense.category_id == category_id)
    if start_date:
        query = query.where(Expense.expense_date >= start_date)
    if end_date:
        query = query.where(Expense.expense_date <= end_date)
    
    query = query.offset(skip).limit(limit).order_by(Expense.expense_date.desc())
    result = await db.execute(query)
    expenses = result.scalars().all()
    
    # Формируем ответ вручную
    response = []
    for expense in expenses:
        expense_dict = {
            "id": expense.id,
            "category_id": expense.category_id,
            "recipient_id": expense.recipient_id,
            "amount": str(expense.amount),
            "currency": expense.currency,
            "description": expense.description,
            "expense_date": expense.expense_date.isoformat(),
            "user_id": expense.user_id,
            "created_at": expense.created_at.isoformat(),
            "category": {
                "id": expense.category.id,
                "name": expense.category.name,
                "description": expense.category.description,
                "created_at": expense.category.created_at.isoformat()
            } if expense.category else None,
            "recipient": {
                "id": expense.recipient.id,
                "name": expense.recipient.name,
                "type": expense.recipient.type
            } if expense.recipient else None,
            "user": {
                "id": expense.user.id,
                "full_name": expense.user.full_name,
                "username": expense.user.username
            } if expense.user else None
        }
        response.append(expense_dict)
    
    return response


@router.get("/reports")
async def get_expense_reports(
    period: str = Query("month", regex="^(day|week|month|year)$"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not start_date:
        if period == "day":
            start_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = datetime.now() - timedelta(days=7)
        elif period == "month":
            start_date = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "year":
            start_date = datetime.now().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    if not end_date:
        end_date = datetime.now()
    
    # Получаем детальные расходы
    query = select(Expense, ExpenseCategory.name, Recipient.name).join(
        ExpenseCategory
    ).outerjoin(
        Recipient, Expense.recipient_id == Recipient.id
    ).where(
        and_(
            Expense.user_id == current_user.id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        )
    ).order_by(Expense.expense_date.desc())
    
    result = await db.execute(query)
    expenses = []
    totals_by_currency = {}
    
    for expense, category_name, recipient_name in result:
        expenses.append({
            "id": expense.id,
            "amount": float(expense.amount),
            "currency": expense.currency,
            "category_name": category_name,
            "recipient_name": recipient_name,
            "description": expense.description,
            "expense_date": expense.expense_date.isoformat(),
            "created_at": expense.created_at.isoformat()
        })
        
        # Группируем по валютам
        currency = expense.currency
        if currency not in totals_by_currency:
            totals_by_currency[currency] = 0
        totals_by_currency[currency] += float(expense.amount)
    
    return {
        "expenses": expenses,
        "totals_by_currency": totals_by_currency,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "count": len(expenses)
    }


@router.put("/{expense_id}")
async def update_expense(
    expense_id: int,
    expense: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Админ может редактировать любые расходы, пользователи только свои
    if current_user.role == "admin":
        result = await db.execute(select(Expense).where(Expense.id == expense_id))
    else:
        result = await db.execute(select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == current_user.id
        ))
    
    db_expense = result.scalar_one_or_none()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    expense_data = expense.model_dump()
    # Применяем ту же логику с временем что и при создании
    if expense_data['expense_date'].time() == datetime.min.time():
        now = datetime.now()
        expense_data['expense_date'] = expense_data['expense_date'].replace(
            hour=now.hour,
            minute=now.minute,
            second=now.second
        )
    
    for field, value in expense_data.items():
        setattr(db_expense, field, value)
    
    await db.commit()
    await db.refresh(db_expense)
    return {"id": db_expense.id, "message": "Expense updated successfully"}


@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Админ может удалять любые расходы, пользователи только свои
    if current_user.role == "admin":
        result = await db.execute(select(Expense).where(Expense.id == expense_id))
    else:
        result = await db.execute(select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == current_user.id
        ))
    
    db_expense = result.scalar_one_or_none()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    await db.delete(db_expense)
    await db.commit()
    return {"message": "Expense deleted"}