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
    paid: float  # Кредит (выданные авансы)
    offset: float  # Погашение (зачтённые в счёт долга)
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


class MutualBalance(BaseModel):
    """Взаимный баланс между двумя контрибуторами"""
    contributor_a_id: int
    contributor_a_name: str
    contributor_b_id: int
    contributor_b_name: str
    earned: float  # Заработано (зарплата с assignment_id)
    paid: float  # Выплачено (чистое: авансы - offset)
    balance: float  # Баланс
    currency: str

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
    
    # 1. Зарплата — оплаченные платежи из группы "salary"
    salary_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(PaymentCategoryGroup.code == 'salary', Payment.payment_status.in_(['paid', 'offset']))
    )
    if user_contributor_id:
        salary_query = salary_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        salary_query = salary_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(salary_query)
    total_salary = float(result.one().total or 0)
    
    # 2. Расходы — платежи из группы "expense"
    expenses_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(PaymentCategoryGroup.code == 'expense')
    if user_contributor_id:
        expenses_query = expenses_query.where(Payment.payer_id == user_contributor_id)
    elif worker_id:
        expenses_query = expenses_query.where(Payment.payer_id == worker_id)
    result = await db.execute(expenses_query)
    total_expenses = float(result.one().total or 0)
    
    # 3. Кредиты — выданные минус зачтённые (чистый долг)
    # Выданные кредиты (авансы) из группы "debt" со статусом 'paid'
    credits_given_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'debt', Payment.payment_status == 'paid'))
    if user_contributor_id:
        credits_given_query = credits_given_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        credits_given_query = credits_given_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(credits_given_query)
    credits_given = float(result.one().total or 0)
    
    # Зачтённые в счёт долга (все платежи со статусом 'offset')
    credits_offset_query = select(func.sum(Payment.amount).label("total")).where(Payment.payment_status == 'offset')
    if user_contributor_id:
        credits_offset_query = credits_offset_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        credits_offset_query = credits_offset_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(credits_offset_query)
    credits_offset = float(result.one().total or 0)
    
    # Чистый кредит: выдано - погашено
    total_credits = credits_given - credits_offset
    
    # 4. К оплате — неоплаченные платежи
    unpaid_query = select(func.sum(Payment.amount).label("total")).where(Payment.payment_status == 'unpaid')
    if user_contributor_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(unpaid_query)
    total_unpaid = float(result.one().total or 0)
    
    # 5. Премии — оплаченные платежи из группы "bonus"
    bonus_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'bonus', Payment.payment_status.in_(['paid', 'offset'])))
    if user_contributor_id:
        bonus_query = bonus_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        bonus_query = bonus_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(bonus_query)
    total_bonus = float(result.one().total or 0)
    
    # 6. Всего — только реально оплаченные платежи (без offset)
    total_query = select(func.sum(Payment.amount).label("total")).where(Payment.payment_status == 'paid')
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
    ).where(Payment.payment_status == 'unpaid').group_by(
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
        
        # Зарплата из payments по дате платежа (группа "salary")
        salary_query = select(
            func.sum(Payment.amount).label("salary")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                PaymentCategoryGroup.code == 'salary'
            )
        )
        
        if worker_id:
            salary_query = salary_query.where(Payment.recipient_id == worker_id)
        if employer_id:
            salary_query = salary_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(salary_query)
        salary_row = result.first()
        salary = float(salary_row.salary) if salary_row and salary_row.salary else 0
        
        # Кредит — выданные кредиты ('paid') из группы "debt"
        credits_given_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_status == 'paid',
                PaymentCategoryGroup.code == 'debt'
            )
        )
        
        if worker_id:
            credits_given_query = credits_given_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            credits_given_query = credits_given_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(credits_given_query)
        credits_given = float(result.one().total or 0)
        
        # Зачтённые в счёт долга (offset)
        credits_offset_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_status == 'offset'
            )
        )
        
        if worker_id:
            credits_offset_query = credits_offset_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            credits_offset_query = credits_offset_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(credits_offset_query)
        credits_offset = float(result.one().total or 0)
        
        # Итого — только реально оплаченные платежи (без offset)
        total_paid_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date <= end_date,
                Payment.payment_status == 'paid'
            )
        )
        
        if worker_id:
            total_paid_query = total_paid_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            total_paid_query = total_paid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(total_paid_query)
        total_paid_row = result.one()
        total_paid = float(total_paid_row.total or 0)
        
        # Расходы за месяц (группа "expense")
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
                PaymentCategoryGroup.code == 'expense'
            )
        )
        
        if worker_id:
            expenses_query = expenses_query.where(Payment.payer_id == worker_id)
        if employer_id:
            expenses_query = expenses_query.where(Payment.recipient_id == employer_id)
        
        result = await db.execute(expenses_query)
        expenses_row = result.one()
        expenses = float(expenses_row.total or 0)
        
        # Возмещённые расходы (группа "expense")
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
                PaymentCategoryGroup.code == 'expense',
                Payment.payment_status.in_(['paid', 'offset'])
            )
        )
        
        result = await db.execute(expenses_paid_query)
        expenses_paid_row = result.one()
        expenses_paid = float(expenses_paid_row.total or 0)
        
        # Премии и бонусы (группа "bonus")
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
                PaymentCategoryGroup.code == 'bonus'
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
                Payment.payment_status == 'unpaid'
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
            paid=round(credits_given, 2),  # Кредит: выданные авансы
            offset=round(credits_offset, 2),  # Погашение: зачтённые
            to_pay=round(to_pay, 2),
            expenses=round(expenses, 2),
            expenses_paid=round(expenses_paid, 2),
            bonus=round(bonus, 2),
            remaining=round(remaining, 2),
            total=round(total, 2),
            currency=currency
        ))
    
    return summaries


@router.get("/mutual", response_model=List[MutualBalance])
async def get_mutual_balances(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить взаимные балансы между парами контрибуторов"""
    
    # Автофильтрация для не-админов
    user_contributor_id = None
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            user_contributor_id = user_contributor.id
    
    # Получаем все уникальные пары (payer, recipient, currency)
    pairs_query = select(
        Payment.payer_id,
        Payment.recipient_id,
        Payment.currency
    ).where(
        Payment.recipient_id != None
    ).distinct()
    
    if user_contributor_id:
        # Не-админ видит только свои балансы
        pairs_query = pairs_query.where(
            (Payment.payer_id == user_contributor_id) | 
            (Payment.recipient_id == user_contributor_id)
        )
    
    result = await db.execute(pairs_query)
    pairs = result.all()
    
    # Собираем ID контрибуторов для получения имён
    contributor_ids = set()
    for row in pairs:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    # Получаем имена
    contributor_names = {}
    if contributor_ids:
        result = await db.execute(
            select(Contributor).where(Contributor.id.in_(contributor_ids))
        )
        for c in result.scalars().all():
            contributor_names[c.id] = c.name
    
    # Для каждой пары рассчитываем баланс
    balances = []
    for payer_id, recipient_id, currency in pairs:
        if not recipient_id:
            continue
            
        # Earned = платежи за отработанные смены (с assignment_id)
        earned_query = select(func.sum(Payment.amount)).where(
            and_(
                Payment.payer_id == payer_id,
                Payment.recipient_id == recipient_id,
                Payment.currency == currency,
                Payment.assignment_id != None
            )
        )
        result = await db.execute(earned_query)
        earned = float(result.scalar() or 0)
        
        # Paid advances = выданные авансы из группы "debt" со статусом 'paid'
        paid_advances_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == payer_id,
                Payment.recipient_id == recipient_id,
                Payment.currency == currency,
                Payment.payment_status == 'paid',
                PaymentCategoryGroup.code == 'debt'
            )
        )
        result = await db.execute(paid_advances_query)
        paid_advances = float(result.scalar() or 0)
        
        # Offset = все платежи со статусом 'offset' (погашение долга)
        offset_query = select(func.sum(Payment.amount)).where(
            and_(
                Payment.payer_id == payer_id,
                Payment.recipient_id == recipient_id,
                Payment.currency == currency,
                Payment.payment_status == 'offset'
            )
        )
        result = await db.execute(offset_query)
        offset_amount = float(result.scalar() or 0)
        
        # Чистая сумма выплаченных авансов (за вычетом погашений)
        paid = paid_advances - offset_amount
        
        balance = round(earned - paid, 2)
        
        balances.append(MutualBalance(
            contributor_a_id=payer_id,
            contributor_a_name=contributor_names.get(payer_id, f"ID:{payer_id}"),
            contributor_b_id=recipient_id,
            contributor_b_name=contributor_names.get(recipient_id, f"ID:{recipient_id}"),
            earned=round(earned, 2),
            paid=round(paid, 2),
            balance=balance,
            currency=currency
        ))
    
    return balances
