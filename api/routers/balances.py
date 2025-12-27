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
from database.models import User, Payment, Assignment, Task, Contributor, UserRole, PaymentCategory, PaymentCategoryGroup
from api.auth.oauth import get_current_user, get_user_contributor

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
    salary: float  # Зарплата (из work_sessions)
    paid: float  # Выплачено
    to_pay: float  # Задолженность (неоплаченные платежи за период)
    expenses: float  # Потрачено (расходы)
    expenses_paid: float  # Возмещено расходов
    bonus: float  # Премии
    remaining: float  # Остаток
    total: float  # Итого (salary + expenses + bonus)
    currency: str


class DashboardSummary(BaseModel):
    """Сводка для Dashboard"""
    total_salary: float  # Зарплата (категория Зарплата)
    total_expenses: float  # Расходы (группа Расходы)
    total_credits: float  # Кредиты (оплаченные из группы Долги)
    total_unpaid: float  # К оплате (неоплаченные платежи)
    total_bonus: float  # Премии (группа Премии)
    total: float  # Всего (все оплаченные платежи)
    currency: str
    balances: List[BalanceItem]  # Детальные балансы


@router.get("/summary", response_model=DashboardSummary)
async def get_balance_summary(
    employer_id: Optional[int] = Query(None, description="ID работодателя (А)"),
    worker_id: Optional[int] = Query(None, description="ID работника (Е)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сводку для Dashboard карточек"""
    
    # Автофильтрация для не-админов
    user_contributor_id = None
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            user_contributor_id = user_contributor.id
        else:
            return DashboardSummary(
                total_salary=0, total_expenses=0, total_credits=0,
                total_unpaid=0, total_bonus=0, total=0,
                currency="UAH", balances=[]
            )
    
    currency = "UAH"
    
    # 1. Зарплата — оплаченные платежи из категории "Зарплата" (id=3)
    salary_query = select(func.sum(Payment.amount).label("total")).where(
        and_(Payment.category_id == 3, Payment.is_paid == True)
    )
    if user_contributor_id:
        salary_query = salary_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        salary_query = salary_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(salary_query)
    total_salary = float(result.one().total or 0)
    
    # 2. Расходы — платежи из группы "Расходы"
    expenses_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(PaymentCategoryGroup.name == "Расходы")
    if user_contributor_id:
        expenses_query = expenses_query.where(Payment.payer_id == user_contributor_id)
    elif worker_id:
        expenses_query = expenses_query.where(Payment.payer_id == worker_id)
    result = await db.execute(expenses_query)
    total_expenses = float(result.one().total or 0)
    
    # 3. Кредиты — оплаченные платежи из группы "Долги"
    credits_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.name == "Долги", Payment.is_paid == True))
    if user_contributor_id:
        credits_query = credits_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        credits_query = credits_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(credits_query)
    total_credits = float(result.one().total or 0)
    
    # 4. К оплате — неоплаченные платежи
    unpaid_query = select(func.sum(Payment.amount).label("total")).where(Payment.is_paid == False)
    if user_contributor_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(unpaid_query)
    total_unpaid = float(result.one().total or 0)
    
    # 5. Премии — оплаченные платежи из группы "Премии"
    bonus_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.name == "Премии", Payment.is_paid == True))
    if user_contributor_id:
        bonus_query = bonus_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        bonus_query = bonus_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(bonus_query)
    total_bonus = float(result.one().total or 0)
    
    # 6. Всего — все оплаченные платежи
    total_query = select(func.sum(Payment.amount).label("total")).where(Payment.is_paid == True)
    if user_contributor_id:
        total_query = total_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        total_query = total_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(total_query)
    total = float(result.one().total or 0)
    
    # Балансы (неоплаченные долги)
    balances = []
    debt_query = select(
        Payment.payer_id, Payment.recipient_id,
        func.sum(Payment.amount).label("total"), Payment.currency
    ).where(Payment.is_paid == False).group_by(
        Payment.payer_id, Payment.recipient_id, Payment.currency
    )
    if user_contributor_id:
        debt_query = debt_query.where(Payment.recipient_id == user_contributor_id)
    
    result = await db.execute(debt_query)
    debt_rows = result.all()
    
    # Получаем имена
    contributor_ids = set()
    for row in debt_rows:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    contributor_names = {}
    if contributor_ids:
        result = await db.execute(select(Contributor).where(Contributor.id.in_(contributor_ids)))
        for c in result.scalars().all():
            contributor_names[c.id] = c.name
    
    for row in debt_rows:
        currency = row.currency
        balances.append(BalanceItem(
            debtor_id=row.recipient_id or 0,
            debtor_name=contributor_names.get(row.recipient_id, "—") if row.recipient_id else "—",
            creditor_id=row.payer_id,
            creditor_name=contributor_names.get(row.payer_id, f"ID:{row.payer_id}"),
            amount=float(row.total),
            currency=row.currency
        ))
    
    return DashboardSummary(
        total_salary=total_salary,
        total_expenses=total_expenses,
        total_credits=total_credits,
        total_unpaid=total_unpaid,
        total_bonus=total_bonus,
        total=total,
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
    
    # Автофильтрация для не-админов
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            worker_id = user_contributor.id
        else:
            # Нет связанного Contributor — возвращаем пустой результат
            return []
    
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
        
        # Рабочие сессии за месяц (из Assignment + Task)
        sessions_query = select(
            func.count(func.distinct(Assignment.id)).label("visits"),
            Assignment.currency
        ).select_from(Assignment).join(Task).where(
            and_(
                Assignment.assignment_date >= start_date,
                Assignment.assignment_date <= end_date,
                Assignment.is_active == False,
                Task.task_type == "work",
                Task.end_time != None
            )
        ).group_by(Assignment.currency)
        
        if worker_id:
            sessions_query = sessions_query.where(Assignment.worker_id == worker_id)
        if employer_id:
            sessions_query = sessions_query.where(Assignment.employer_id == employer_id)
        
        result = await db.execute(sessions_query)
        session_row = result.first()
        
        visits = session_row.visits if session_row else 0
        currency = session_row.currency if session_row else "UAH"
        
        # Подсчёт часов и суммы отдельным запросом
        hours_query = select(
            func.sum(
                (func.julianday(
                    func.datetime(Assignment.assignment_date, Task.end_time)
                ) - func.julianday(
                    func.datetime(Assignment.assignment_date, Task.start_time)
                )) * 24
            ).label("hours")
        ).select_from(Task).join(Assignment).where(
            and_(
                Assignment.assignment_date >= start_date,
                Assignment.assignment_date <= end_date,
                Assignment.is_active == False,
                Task.task_type == "work",
                Task.end_time != None
            )
        )
        
        if worker_id:
            hours_query = hours_query.where(Assignment.worker_id == worker_id)
        if employer_id:
            hours_query = hours_query.where(Assignment.employer_id == employer_id)
        
        result = await db.execute(hours_query)
        hours_row = result.first()
        hours = float(hours_row.hours) if hours_row and hours_row.hours else 0
        
        # Зарплата из payments, связанных с assignments
        salary_query = select(
            func.sum(Payment.amount).label("salary")
        ).select_from(Payment).join(
            Assignment, Assignment.id == Payment.assignment_id
        ).where(
            and_(
                Assignment.assignment_date >= start_date,
                Assignment.assignment_date <= end_date,
                Payment.category_id == 3  # Зарплата
            )
        )
        
        if worker_id:
            salary_query = salary_query.where(Assignment.worker_id == worker_id)
        if employer_id:
            salary_query = salary_query.where(Assignment.employer_id == employer_id)
        
        result = await db.execute(salary_query)
        salary_row = result.first()
        salary = float(salary_row.salary) if salary_row and salary_row.salary else 0
        
        # Кредит — оплаченные платежи из группы "Долги"
        paid_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.is_paid == True,
                PaymentCategoryGroup.name == "Долги"
            )
        )
        
        if worker_id:
            paid_query = paid_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            paid_query = paid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(paid_query)
        paid_row = result.one()
        paid = float(paid_row.total or 0)
        
        # Итого — все оплаченные платежи любой категории
        total_paid_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.is_paid == True
            )
        )
        
        if worker_id:
            total_paid_query = total_paid_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            total_paid_query = total_paid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(total_paid_query)
        total_paid_row = result.one()
        total_paid = float(total_paid_row.total or 0)
        
        # Расходы за месяц (category_group.code = 'expense')
        expenses_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                PaymentCategoryGroup.name == "Расходы"
            )
        )
        
        if worker_id:
            expenses_query = expenses_query.where(Payment.payer_id == worker_id)
        if employer_id:
            expenses_query = expenses_query.where(Payment.recipient_id == employer_id)
        
        result = await db.execute(expenses_query)
        expenses_row = result.one()
        expenses = float(expenses_row.total or 0)
        
        # Возмещённые расходы (category_group.code = 'expense')
        expenses_paid_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                PaymentCategoryGroup.name == "Расходы",
                Payment.is_paid == True
            )
        )
        
        result = await db.execute(expenses_paid_query)
        expenses_paid_row = result.one()
        expenses_paid = float(expenses_paid_row.total or 0)
        
        # Премии и бонусы (группа "Премии")
        bonus_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                PaymentCategoryGroup.name == "Премии"
            )
        )
        
        if worker_id:
            bonus_query = bonus_query.where(Payment.recipient_id == worker_id)
        if employer_id:
            bonus_query = bonus_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(bonus_query)
        bonus_row = result.one()
        bonus = float(bonus_row.total or 0)
        
        # Задолженность: неоплаченные платежи за период
        unpaid_query = select(func.sum(Payment.amount).label("total")).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.is_paid == False
            )
        )
        
        if worker_id:
            unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            unpaid_query = unpaid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(unpaid_query)
        to_pay = float(result.one().total or 0)
        
        remaining = expenses - expenses_paid
        total = total_paid  # Итого = все оплаченные платежи за период
        
        summaries.append(MonthlySummary(
            period=f"{year}-{month:02d}",
            visits=visits,
            hours=round(hours, 2),
            salary=round(salary, 2),
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
