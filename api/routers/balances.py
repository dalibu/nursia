"""
API роутер для расчёта балансов и задолженностей
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import date, timedelta
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from pydantic import BaseModel

from database.core import get_db
from database.models import User, Payment, WorkSession, Contributor
from api.auth.oauth import get_current_user

router = APIRouter(prefix="/balances", tags=["balances"])


class BalanceItem(BaseModel):
    """Баланс между двумя участниками"""
    debtor_id: int
    debtor_name: str
    creditor_id: int
    creditor_name: str
    amount: float
    currency: str


class MonthlySummary(BaseModel):
    """Месячная сводка (как в Übersicht)"""
    period: str  # "2025-09"
    visits: int  # Количество посещений (сессий)
    hours: float  # Часы работы
    netto: float  # Заработано
    paid: float  # Выплачено
    to_pay: float  # К выплате
    expenses: float  # Потрачено (расходы)
    expenses_paid: float  # Возмещено расходов
    bonus: float  # Премии
    remaining: float  # Остаток
    total: float  # Итого (netto + expenses + bonus)
    currency: str


class DashboardSummary(BaseModel):
    """Сводка для Dashboard"""
    total_debt: float  # Общая задолженность
    total_paid: float  # Общая сумма выплат
    total_expenses: float  # Общие расходы
    currency: str
    balances: List[BalanceItem]  # Детальные балансы


@router.get("/summary", response_model=DashboardSummary)
async def get_balance_summary(
    employer_id: Optional[int] = Query(None, description="ID работодателя (А)"),
    worker_id: Optional[int] = Query(None, description="ID работника (Е)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сводку задолженностей для Dashboard"""
    
    # Получаем неоплаченные платежи (задолженности)
    unpaid_query = select(
        Payment.payer_id,
        Payment.recipient_id,
        func.sum(Payment.amount).label("total"),
        Payment.currency
    ).where(
        Payment.is_paid == False
    ).group_by(
        Payment.payer_id, Payment.recipient_id, Payment.currency
    )
    
    if employer_id:
        unpaid_query = unpaid_query.where(Payment.payer_id == employer_id)
    if worker_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
    
    result = await db.execute(unpaid_query)
    unpaid_rows = result.all()
    
    # Получаем оплаченные платежи
    paid_query = select(
        func.sum(Payment.amount).label("total"),
        Payment.currency
    ).where(
        Payment.is_paid == True
    ).group_by(Payment.currency)
    
    if employer_id:
        paid_query = paid_query.where(Payment.payer_id == employer_id)
    if worker_id:
        paid_query = paid_query.where(Payment.recipient_id == worker_id)
    
    result = await db.execute(paid_query)
    paid_rows = result.all()
    
    # Собираем имена участников
    contributor_ids = set()
    for row in unpaid_rows:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    contributor_names = {}
    if contributor_ids:
        result = await db.execute(
            select(Contributor).where(Contributor.id.in_(contributor_ids))
        )
        for c in result.scalars().all():
            contributor_names[c.id] = c.name
    
    # Формируем балансы
    balances = []
    total_debt = Decimal(0)
    currency = "UAH"
    
    for row in unpaid_rows:
        currency = row.currency
        total_debt += row.total or Decimal(0)
        balances.append(BalanceItem(
            debtor_id=row.payer_id,
            debtor_name=contributor_names.get(row.payer_id, f"ID:{row.payer_id}"),
            creditor_id=row.recipient_id or 0,
            creditor_name=contributor_names.get(row.recipient_id, "—") if row.recipient_id else "—",
            amount=float(row.total),
            currency=row.currency
        ))
    
    total_paid = sum(float(r.total or 0) for r in paid_rows)
    
    # Получаем расходы (expense type)
    expenses_query = select(
        func.sum(Payment.amount).label("total")
    ).where(
        Payment.payment_type == "expense"
    )
    
    if employer_id:
        expenses_query = expenses_query.where(Payment.payer_id == employer_id)
    
    result = await db.execute(expenses_query)
    expenses_row = result.one()
    total_expenses = float(expenses_row.total or 0)
    
    return DashboardSummary(
        total_debt=float(total_debt),
        total_paid=total_paid,
        total_expenses=total_expenses,
        currency=currency,
        balances=balances
    )


@router.get("/monthly", response_model=List[MonthlySummary])
async def get_monthly_summary(
    employer_id: Optional[int] = Query(None),
    worker_id: Optional[int] = Query(None),
    months: int = Query(12, ge=1, le=24, description="Количество месяцев"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить помесячную сводку (как в Übersicht из Excel)"""
    from utils.timezone import now_server
    
    now = now_server()
    summaries = []
    
    for i in range(months):
        # Вычисляем начало и конец месяца
        month_date = now.date().replace(day=1) - timedelta(days=i * 30)
        month_date = month_date.replace(day=1)
        year = month_date.year
        month = month_date.month
        
        # Начало и конец месяца
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
        
        # Рабочие сессии за месяц
        sessions_query = select(
            func.count(WorkSession.id).label("visits"),
            func.sum(WorkSession.duration_hours).label("hours"),
            func.sum(WorkSession.amount).label("netto"),
            WorkSession.currency
        ).where(
            and_(
                WorkSession.session_date >= start_date,
                WorkSession.session_date <= end_date,
                WorkSession.is_active == False
            )
        ).group_by(WorkSession.currency)
        
        if worker_id:
            sessions_query = sessions_query.where(WorkSession.worker_id == worker_id)
        if employer_id:
            sessions_query = sessions_query.where(WorkSession.employer_id == employer_id)
        
        result = await db.execute(sessions_query)
        session_row = result.first()
        
        visits = session_row.visits if session_row else 0
        hours = float(session_row.hours) if session_row and session_row.hours else 0
        netto = float(session_row.netto) if session_row and session_row.netto else 0
        currency = session_row.currency if session_row else "UAH"
        
        # Выплаты за месяц (type = work, is_paid = True)
        paid_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_type == "work",
                Payment.is_paid == True
            )
        )
        
        if worker_id:
            paid_query = paid_query.where(Payment.recipient_id == worker_id)
        if employer_id:
            paid_query = paid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(paid_query)
        paid_row = result.one()
        paid = float(paid_row.total or 0)
        
        # Расходы за месяц (type = expense)
        expenses_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_type == "expense"
            )
        )
        
        if worker_id:
            expenses_query = expenses_query.where(Payment.payer_id == worker_id)
        if employer_id:
            expenses_query = expenses_query.where(Payment.recipient_id == employer_id)
        
        result = await db.execute(expenses_query)
        expenses_row = result.one()
        expenses = float(expenses_row.total or 0)
        
        # Возмещённые расходы
        expenses_paid_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_type == "expense",
                Payment.is_paid == True
            )
        )
        
        result = await db.execute(expenses_paid_query)
        expenses_paid_row = result.one()
        expenses_paid = float(expenses_paid_row.total or 0)
        
        # Премии и бонусы
        bonus_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_type.in_(["gift", "bonus"])
            )
        )
        
        if worker_id:
            bonus_query = bonus_query.where(Payment.recipient_id == worker_id)
        if employer_id:
            bonus_query = bonus_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(bonus_query)
        bonus_row = result.one()
        bonus = float(bonus_row.total or 0)
        
        to_pay = netto - paid
        remaining = expenses - expenses_paid
        total = netto + expenses + bonus
        
        summaries.append(MonthlySummary(
            period=f"{year}-{month:02d}",
            visits=visits,
            hours=round(hours, 2),
            netto=round(netto, 2),
            paid=round(paid, 2),
            to_pay=round(to_pay, 2),
            expenses=round(expenses, 2),
            expenses_paid=round(expenses_paid, 2),
            bonus=round(bonus, 2),
            remaining=round(remaining, 2),
            total=round(total, 2),
            currency=currency
        ))
    
    return summaries
