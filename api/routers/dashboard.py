"""
API роутер для Nursia Dashboard — карточки работников и сводки
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import date, datetime, timedelta
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import joinedload
from pydantic import BaseModel

from database.core import get_db
from database.models import (
    User, Payment, Assignment, Task, PaymentCategory, 
    PaymentCategoryGroup, PaymentGroupCode, PaymentStatus, EmploymentRelation
)
from api.auth.oauth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ================================
# Pydantic Models
# ================================

class WorkerBalance(BaseModel):
    """Баланс работника"""
    salary: float           # Зарплата начислено
    accrued: float          # Начислено (все статусы) - для показа в блоке Баланс
    salary_unpaid: float    # Неоплаченная зарплата (для карточки)
    paid: float             # Всего выплачено (зарплата paid + кредиты paid)
    credit: float           # Кредит (отрицательный = долг работника)
    credits_given: float    # Всего выданных кредитов/авансов
    debt: float             # Задолженность = Кредиты - Погашения
    expenses: float         # Расходы работника (к возмещению)
    bonuses: float          # Премии/подарки
    due: float              # К выплате (положительный) или К получению (отрицательный)
    is_positive: bool       # true = работодатель должен, false = работник должен


class WorkerStats(BaseModel):
    """Статистика работника"""
    hours: float            # Часы за период
    shifts: int             # Количество смен
    accrued: float          # Начислено (зарплата + расходы + премии)
    paid: float             # Выплачено
    expenses: float         # Расходы (к возмещению)


class WorkerCard(BaseModel):
    """Карточка работника для Dashboard"""
    id: int
    name: str
    avatar: str = "👤"
    hourly_rate: float
    currency: str
    balance: WorkerBalance
    stats: WorkerStats


class DashboardSummary(BaseModel):
    """Summary cards для Dashboard (10 карточек)"""
    shifts: int             # Смены
    hours: float            # Часы
    salary: float           # Зарплата (начислено)
    credits: float          # Кредиты/Авансы
    unpaid: float           # Неоплачено
    balance: float          # Сальдо (+ = работодатель должен, - = работник должен)
    expenses: float         # Расходы
    bonuses: float          # Премии/Подарки
    paid: float             # Выплачено
    currency: str


class DashboardResponse(BaseModel):
    """Полный ответ Dashboard"""
    user_id: int
    user_name: str
    is_employer: bool
    summary: DashboardSummary
    workers: List[WorkerCard]


# ================================
# Helper Functions
# ================================

async def get_worker_balance(
    db: AsyncSession,
    worker_id: int,
    currency: str = "UAH"
) -> WorkerBalance:
    """Рассчитать баланс работника"""
    
    # 1. Зарплата начислено (paid + offset)
    salary_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status.in_([PaymentStatus.PAID.value, PaymentStatus.OFFSET.value]),
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(salary_query)
    salary = float(result.scalar() or 0)
    
    # 1a. Начислено всего (все статусы) - для показа в Баланс
    accrued_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(accrued_query)
    accrued = float(result.scalar() or 0)
    
    # 2. Кредиты/Авансы выданные (paid)
    credit_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value,
            Payment.payment_status == PaymentStatus.PAID.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(credit_query)
    credits = float(result.scalar() or 0)
    
    # 3. Погашения (repayment + salary offset)
    repayment_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value,
            Payment.payment_status == PaymentStatus.PAID.value,
            or_(Payment.payer_id == worker_id, Payment.recipient_id == worker_id)
        )
    )
    result = await db.execute(repayment_query)
    repayment = float(result.scalar() or 0)
    
    # Salary offset (зачтено в счет долга)
    salary_offset_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status == PaymentStatus.OFFSET.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(salary_offset_query)
    salary_offset = float(result.scalar() or 0)
    
    total_repayment = repayment + salary_offset
    
    # 4. Расходы работника (unpaid — ему должны вернуть)
    expenses_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value,
            Payment.payment_status == PaymentStatus.UNPAID.value,
            Payment.payer_id == worker_id
        )
    )
    result = await db.execute(expenses_query)
    expenses = float(result.scalar() or 0)
    
    # 5. Премии/Подарки (paid + offset)
    bonus_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.BONUS.value,
            Payment.payment_status.in_([PaymentStatus.PAID.value, PaymentStatus.OFFSET.value]),
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(bonus_query)
    bonuses = float(result.scalar() or 0)
    
    # Неоплаченная зарплата (UNPAID статус)
    unpaid_salary_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status == PaymentStatus.UNPAID.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(unpaid_salary_query)
    salary_unpaid = float(result.scalar() or 0)
    
    # Выплаченная зарплата (PAID статус)
    paid_salary_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status == PaymentStatus.PAID.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(paid_salary_query)
    paid_salary = float(result.scalar() or 0)
    
    # Всего выплачено = зарплата paid + кредиты paid
    paid_total = paid_salary + credits
    
    # Расчет: Кредит (задолженность работника) = кредиты - погашения
    worker_debt = max(0, credits - total_repayment)
    
    # К выплате = salary_unpaid - debt + expenses
    # salary_unpaid = неоплаченная зарплата (работодатель должен)
    # debt = задолженность (работник должен)
    # expenses = расходы работника (работодатель должен вернуть)
    due = salary_unpaid - worker_debt + expenses
    
    return WorkerBalance(
        salary=round(salary, 2),
        accrued=round(accrued, 2),  # Начислено всего (для показа в Баланс)
        salary_unpaid=round(salary_unpaid, 2),  # Неоплаченная зарплата
        paid=round(paid_total, 2),  # Всего выплачено
        credit=round(-worker_debt, 2),  # Отрицательный = долг работника
        credits_given=round(credits, 2),  # Всего выданных кредитов
        debt=round(worker_debt, 2),  # Задолженность = Кредиты - Погашения
        expenses=round(expenses, 2),
        bonuses=round(bonuses, 2),
        due=round(due, 2),
        is_positive=due >= 0
    )


async def get_worker_stats(
    db: AsyncSession,
    worker_id: int,
    currency: str = "UAH"
) -> WorkerStats:
    """Получить статистику работника"""
    
    # 1. Часы и смены (из tasks)
    hours_query = select(
        func.count(func.distinct(Assignment.id)).label("shifts"),
        func.sum(
            (func.julianday(Task.end_time) - func.julianday(Task.start_time)) * 24
        ).label("hours")
    ).select_from(Task).join(Assignment).where(
        and_(
            Assignment.user_id == worker_id,
            Task.end_time != None,
            Task.task_type == "work"
        )
    )
    result = await db.execute(hours_query)
    row = result.first()
    shifts = row.shifts if row and row.shifts else 0
    hours = float(row.hours) if row and row.hours else 0
    
    # 2. Начислено = зарплата (все статусы)
    accrued_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(accrued_query)
    accrued = float(result.scalar() or 0)
    
    # 3. Выплачено = зарплата paid + кредиты paid
    paid_salary_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status == PaymentStatus.PAID.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(paid_salary_query)
    paid_salary = float(result.scalar() or 0)
    
    credit_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value,
            Payment.payment_status == PaymentStatus.PAID.value,
            Payment.recipient_id == worker_id
        )
    )
    result = await db.execute(credit_query)
    credits = float(result.scalar() or 0)
    
    paid = paid_salary + credits
    
    # 4. Расходы (unpaid — к возмещению)
    expenses_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value,
            Payment.payment_status == PaymentStatus.UNPAID.value,
            Payment.payer_id == worker_id
        )
    )
    result = await db.execute(expenses_query)
    expenses = float(result.scalar() or 0)
    
    return WorkerStats(
        hours=round(hours, 1),
        shifts=shifts,
        accrued=round(accrued, 2),
        paid=round(paid, 2),
        expenses=round(expenses, 2)
    )


# ================================
# API Endpoints
# ================================

@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Получить данные для главного Dashboard.
    
    Для Employer: показывает всех работников
    Для Worker: показывает только свою карточку
    """
    import logging
    logger = logging.getLogger(__name__)
    
    is_employer = current_user.has_permission('view_all_reports')
    currency = "UAH"
    
    # Получаем список работников
    if is_employer:
        # Все активные работники с EmploymentRelation
        query = select(EmploymentRelation).options(
            joinedload(EmploymentRelation.user)
        ).where(EmploymentRelation.is_active == True)
        result = await db.execute(query)
        relations = result.scalars().all()
    else:
        # Только текущий работник
        query = select(EmploymentRelation).options(
            joinedload(EmploymentRelation.user)
        ).where(
            and_(
                EmploymentRelation.user_id == current_user.id,
                EmploymentRelation.is_active == True
            )
        )
        result = await db.execute(query)
        relations = result.scalars().all()
    
    # Формируем карточки работников
    workers = []
    total_shifts = 0
    total_hours = 0.0
    total_salary = 0.0
    total_credits = 0.0
    total_unpaid = 0.0
    total_debt = 0.0
    total_expenses = 0.0
    total_bonuses = 0.0
    total_paid = 0.0
    
    for relation in relations:
        worker = relation.user
        if not worker:
            continue
        
        # Получаем баланс и статистику
        balance = await get_worker_balance(db, worker.id, relation.currency)
        stats = await get_worker_stats(db, worker.id, relation.currency)
        
        # Эмодзи для аватара (можно расширить)
        avatar = "👩🏻" if "а" in worker.full_name.lower()[-2:] else "👨🏻"
        
        workers.append(WorkerCard(
            id=worker.id,
            name=worker.full_name,
            avatar=avatar,
            hourly_rate=float(relation.hourly_rate),
            currency=relation.currency,
            balance=balance,
            stats=stats
        ))
        
        # Суммируем для общих карточек
        total_shifts += stats.shifts
        total_hours += stats.hours
        total_salary += balance.salary
        total_credits += balance.credits_given  # Всего выданных кредитов
        total_debt += balance.due  # Сальдо: положительное = работодатель должен, отрицательное = работник должен
        total_expenses += balance.expenses
        total_bonuses += balance.bonuses
        total_paid += stats.paid

    
    # Неоплаченная зарплата
    unpaid_query = select(func.sum(Payment.amount)).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
            Payment.payment_status == PaymentStatus.UNPAID.value
        )
    )
    if not is_employer:
        unpaid_query = unpaid_query.where(Payment.recipient_id == current_user.id)
    result = await db.execute(unpaid_query)
    total_unpaid = float(result.scalar() or 0)
    
    summary = DashboardSummary(
        shifts=total_shifts,
        hours=round(total_hours, 1),
        salary=round(total_salary, 2),
        credits=round(total_credits, 2),
        unpaid=round(total_unpaid, 2),
        balance=round(total_debt, 2),  # Сальдо
        expenses=round(total_expenses, 2),
        bonuses=round(total_bonuses, 2),
        paid=round(total_paid, 2),
        currency=currency
    )
    
    return DashboardResponse(
        user_id=current_user.id,
        user_name=current_user.full_name,
        is_employer=is_employer,
        summary=summary,
        workers=workers
    )
