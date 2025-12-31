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
    total_repayment: float  # Погашения (группа Погашения)
    total_unpaid: float  # К оплате (неоплаченные платежи)
    total_bonus: float  # Премии (группа Премии)
    total: float  # Всего (все оплаченные платежи)
    currency: str
    balances: List[BalanceItem]  # Детальные балансы


class MutualBalance(BaseModel):
    """Взаимный баланс между кредитором и должником"""
    creditor_id: int
    creditor_name: str
    debtor_id: int
    debtor_name: str
    credit: float  # Кредит/Аванс (выданные суммы)
    offset: float  # Погашено
    remaining: float  # Остаток долга
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
    
    # 3. Кредиты — всего выданных (без вычитания offset)
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
        credits_offset_query = credits_offset_query.where(
            (Payment.recipient_id == user_contributor_id) | (Payment.payer_id == user_contributor_id)
        )
    elif worker_id:
        credits_offset_query = credits_offset_query.where(
            (Payment.recipient_id == worker_id) | (Payment.payer_id == worker_id)
        )
    result = await db.execute(credits_offset_query)
    credits_offset = float(result.one().total or 0)
    
    # Кредиты = выданные (сумма кредитов)
    total_credits = credits_given
    
    # 4. К оплате — чистый остаток к оплате (кредиты - offset + unpaid)
    # Неоплаченные платежи
    unpaid_query = select(func.sum(Payment.amount).label("total")).where(Payment.payment_status == 'unpaid')
    if user_contributor_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == user_contributor_id)
    elif worker_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(unpaid_query)
    unpaid_amount = float(result.one().total or 0)
    
    # Чистый остаток: (кредиты - offset) + unpaid
    # Если offset > credit, разница показывается как положительный остаток (нам должны)
    net_debt = credits_given - credits_offset  # может быть отрицательным
    total_unpaid = unpaid_amount + max(0, -net_debt)  # добавляем переплату как "к оплате"
    
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
    
    # 6. Погашения (группа 'repayment')
    repayment_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'repayment', Payment.payment_status == 'paid'))
    if user_contributor_id:
        repayment_query = repayment_query.where(Payment.payer_id == user_contributor_id)
    elif worker_id:
        repayment_query = repayment_query.where(Payment.payer_id == worker_id)
    result = await db.execute(repayment_query)
    total_repayment = float(result.one().total or 0)
    
    # 7. Всего = Зарплата + Кредиты + Премии - Погашено
    total = total_salary + total_credits + total_bonus - total_repayment
    
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
        # Для неоплаченных платежей: payer — должник (должен заплатить), recipient — кредитор (ему должны)
        balances.append(BalanceItem(
            debtor_id=row.payer_id,
            debtor_name=contributor_names.get(row.payer_id, f"ID:{row.payer_id}"),
            creditor_id=row.recipient_id or 0,
            creditor_name=contributor_names.get(row.recipient_id, "—") if row.recipient_id else "—",
            amount=float(row.total),
            currency=row.currency
        ))
    
    return DashboardSummary(
        total_salary=total_salary,
        total_expenses=total_expenses,
        total_credits=total_credits,
        total_repayment=total_repayment,
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
            next_month_start = date(year + 1, 1, 1)
        else:
            next_month_start = date(year, month + 1, 1)
        end_date = next_month_start - timedelta(days=1)  # Для Assignment.assignment_date (date only)
        
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
                Payment.payment_date < next_month_start,
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
        # Показываем за период (для таблицы)
        credits_given_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date < next_month_start,
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
        
        # Погашения (группа 'repayment') — за период
        credits_offset_query = select(
            func.sum(Payment.amount).label("total")
        ).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date < next_month_start,
                PaymentCategoryGroup.code == 'repayment'
            )
        )
        
        if worker_id:
            credits_offset_query = credits_offset_query.where(
                (Payment.recipient_id == worker_id) | (Payment.payer_id == worker_id)
            )
        elif employer_id:
            credits_offset_query = credits_offset_query.where(
                (Payment.payer_id == employer_id) | (Payment.recipient_id == employer_id)
            )
        
        result = await db.execute(credits_offset_query)
        credits_offset = float(result.scalar() or 0)
        
        # НАКОПИТЕЛЬНЫЕ значения для to_pay (с начала времён до end_date)
        cumulative_credits_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date < next_month_start,
                Payment.payment_status == 'paid',
                PaymentCategoryGroup.code == 'debt'
            )
        )
        
        if worker_id:
            cumulative_credits_query = cumulative_credits_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            cumulative_credits_query = cumulative_credits_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(cumulative_credits_query)
        cumulative_credits = float(result.one().total or 0)
        
        cumulative_offset_query = select(
            func.sum(Payment.amount).label("total")
        ).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date < next_month_start,
                PaymentCategoryGroup.code == 'repayment'
            )
        )
        
        if worker_id:
            cumulative_offset_query = cumulative_offset_query.where(
                (Payment.recipient_id == worker_id) | (Payment.payer_id == worker_id)
            )
        elif employer_id:
            cumulative_offset_query = cumulative_offset_query.where(
                (Payment.payer_id == employer_id) | (Payment.recipient_id == employer_id)
            )
        
        result = await db.execute(cumulative_offset_query)
        cumulative_offset = float(result.scalar() or 0)
        
        # Итого — только реально оплаченные платежи (без offset)
        total_paid_query = select(
            func.sum(Payment.amount).label("total")
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date < next_month_start,
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
                Payment.payment_date < next_month_start,
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
                Payment.payment_date < next_month_start,
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
                Payment.payment_date < next_month_start,
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
                Payment.payment_date < next_month_start,
                Payment.payment_status == 'unpaid'
            )
        )
        
        if worker_id:
            unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
        elif employer_id:
            unpaid_query = unpaid_query.where(Payment.payer_id == employer_id)
        
        result = await db.execute(unpaid_query)
        unpaid_amount = float(result.one().total or 0)
        
        # К оплате = накопительные кредиты - накопительные погашения
        # Это показывает текущий баланс долга на конец периода
        cumulative_to_pay = cumulative_credits - cumulative_offset
        
        remaining = expenses - expenses_paid
        total = salary + credits_given + bonus - credits_offset  # Зарплата + Кредиты + Премии - Погашено
        
        summaries.append(MonthlySummary(
            period=f"{year}-{month:02d}",
            visits=visits,
            hours=round(hours, 2),
            salary=round(salary, 2),
            paid=round(credits_given, 2),  # Кредит: выданные авансы
            offset=round(-credits_offset, 2),  # Погашено: отрицательное (возврат)
            to_pay=round(unpaid_amount, 2),  # Только неоплаченные платежи
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
    """Получить взаимные балансы долгов между парами контрибуторов.
    
    Показывает ОТДЕЛЬНЫЕ строки для:
    1. Долговых отношений (кредиты/авансы из категории 'debt')
    2. Неоплаченных платежей (зарплаты, бонусы и т.д.)
    """
    
    # Автофильтрация для не-админов
    user_contributor_id = None
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            user_contributor_id = user_contributor.id
    
    balances = []
    
    # === ЧАСТЬ 1: Долговые отношения (категория 'debt') ===
    # Получаем все уникальные пары из debt-платежей
    debt_pairs_query = select(
        Payment.payer_id,
        Payment.recipient_id,
        Payment.currency
    ).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            Payment.recipient_id != None,
            PaymentCategoryGroup.code == 'debt',
            Payment.payment_status == 'paid'  # Только выданные кредиты
        )
    ).distinct()
    
    if user_contributor_id:
        debt_pairs_query = debt_pairs_query.where(
            (Payment.payer_id == user_contributor_id) | 
            (Payment.recipient_id == user_contributor_id)
        )
    
    result = await db.execute(debt_pairs_query)
    debt_pairs = result.all()
    
    # Собираем ID контрибуторов для получения имён
    contributor_ids = set()
    for row in debt_pairs:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    # === ЧАСТЬ 2: Неоплаченные платежи ===
    unpaid_pairs_query = select(
        Payment.payer_id,
        Payment.recipient_id,
        Payment.currency,
        func.sum(Payment.amount).label("total")
    ).where(
        and_(
            Payment.recipient_id != None,
            Payment.payment_status == 'unpaid'
        )
    ).group_by(
        Payment.payer_id,
        Payment.recipient_id,
        Payment.currency
    )
    
    if user_contributor_id:
        unpaid_pairs_query = unpaid_pairs_query.where(
            (Payment.payer_id == user_contributor_id) | 
            (Payment.recipient_id == user_contributor_id)
        )
    
    result = await db.execute(unpaid_pairs_query)
    unpaid_pairs = result.all()
    
    for row in unpaid_pairs:
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
    
    # === Обрабатываем долговые отношения ===
    processed_debt_pairs = set()
    
    for payer_id, recipient_id, currency in debt_pairs:
        if not recipient_id:
            continue
        
        # Избегаем дубликатов (нормализуем пару)
        pair_key = (min(payer_id, recipient_id), max(payer_id, recipient_id), currency)
        if pair_key in processed_debt_pairs:
            continue
        processed_debt_pairs.add(pair_key)
        
        a_id = pair_key[0]
        b_id = pair_key[1]
        
        # === ЛОГИКА ВЗАИМНЫХ РАСЧЁТОВ ===
        # Долг (группа 'debt') создаёт задолженность работника
        # Зарплата (группа 'salary') погашает задолженность / создаёт обратный долг
        # Расходы (группа 'expense') погашают задолженность / создают обратный долг
        # Премия (группа 'bonus') НЕ учитывается
        
        # Долги A→B (группа 'debt') — создаёт долг B перед A
        debt_a_to_b_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == a_id,
                Payment.recipient_id == b_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'debt'
            )
        )
        result = await db.execute(debt_a_to_b_query)
        debt_a_to_b = float(result.scalar() or 0)
        
        # Долги B→A (группа 'debt') — возврат долга (уменьшает долг B)
        debt_b_to_a_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == b_id,
                Payment.recipient_id == a_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'debt'
            )
        )
        result = await db.execute(debt_b_to_a_query)
        debt_b_to_a = float(result.scalar() or 0)
        
        # Зарплата A→B (группа 'salary') — погашает долг B / создаёт долг A
        salary_a_to_b_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == a_id,
                Payment.recipient_id == b_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'salary'
            )
        )
        result = await db.execute(salary_a_to_b_query)
        salary_a_to_b = float(result.scalar() or 0)
        
        # Зарплата B→A (не типично, но на всякий случай)
        salary_b_to_a_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == b_id,
                Payment.recipient_id == a_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'salary'
            )
        )
        result = await db.execute(salary_b_to_a_query)
        salary_b_to_a = float(result.scalar() or 0)
        
        # Расходы A→B (группа 'expense') — погашает долг B / создаёт долг A
        expense_a_to_b_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == a_id,
                Payment.recipient_id == b_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'expense'
            )
        )
        result = await db.execute(expense_a_to_b_query)
        expense_a_to_b = float(result.scalar() or 0)
        
        # Расходы B→A (работник потратил, работодатель компенсирует)
        expense_b_to_a_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == b_id,
                Payment.recipient_id == a_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'expense'
            )
        )
        result = await db.execute(expense_b_to_a_query)
        expense_b_to_a = float(result.scalar() or 0)
        
        # Погашения A→B (группа 'repayment') — прямой возврат долга
        repayment_a_to_b_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == a_id,
                Payment.recipient_id == b_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'repayment'
            )
        )
        result = await db.execute(repayment_a_to_b_query)
        repayment_a_to_b = float(result.scalar() or 0)
        
        # Погашения B→A (группа 'repayment') — возврат долга работником
        repayment_b_to_a_query = select(func.sum(Payment.amount)).select_from(
            Payment
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payer_id == b_id,
                Payment.recipient_id == a_id,
                Payment.currency == currency,
                Payment.payment_status.in_(['paid', 'offset']),
                PaymentCategoryGroup.code == 'repayment'
            )
        )
        result = await db.execute(repayment_b_to_a_query)
        repayment_b_to_a = float(result.scalar() or 0)
        
        # Чистый баланс:
        # balance_b_owes_a = (долги B получил от A) - (зарплата/расходы B получил от A) - (возвраты B отдал A)
        # balance_a_owes_b = (долги A получил от B) - (зарплата/расходы A получил от B) - (возвраты A отдал B)
        # net = balance_b_owes_a - balance_a_owes_b
        # positive = B owes A, negative = A owes B
        
        balance_b_owes_a = debt_a_to_b - salary_a_to_b - expense_a_to_b - repayment_b_to_a
        balance_a_owes_b = debt_b_to_a - salary_b_to_a - expense_b_to_a - repayment_a_to_b
        net_balance = balance_b_owes_a - balance_a_owes_b
        
        # Для отображения: используем ФАКТИЧЕСКИЙ долг из более крупного направления
        if debt_a_to_b >= debt_b_to_a:
            # A дал больше долга B (или равно)
            main_debt = debt_a_to_b
            main_offset = salary_a_to_b + expense_a_to_b + repayment_b_to_a
        else:
            # B дал больше долга A
            main_debt = debt_b_to_a
            main_offset = salary_b_to_a + expense_b_to_a + repayment_a_to_b
        
        if abs(net_balance) > 0.01:
            if net_balance > 0:
                # B должен A
                balances.append(MutualBalance(
                    creditor_id=a_id,
                    creditor_name=contributor_names.get(a_id, f"ID:{a_id}"),
                    debtor_id=b_id,
                    debtor_name=contributor_names.get(b_id, f"ID:{b_id}"),
                    credit=round(main_debt, 2),
                    offset=round(main_offset, 2),
                    remaining=round(net_balance, 2),
                    currency=currency
                ))
            else:
                # A должен B
                balances.append(MutualBalance(
                    creditor_id=b_id,
                    creditor_name=contributor_names.get(b_id, f"ID:{b_id}"),
                    debtor_id=a_id,
                    debtor_name=contributor_names.get(a_id, f"ID:{a_id}"),
                    credit=round(main_debt, 2),
                    offset=round(main_offset, 2),
                    remaining=round(-net_balance, 2),
                    currency=currency
                ))
    
    # === Обрабатываем неоплаченные платежи как отдельные строки ===
    for row in unpaid_pairs:
        payer_id = row.payer_id
        recipient_id = row.recipient_id
        currency = row.currency
        unpaid_amount = float(row.total or 0)
        
        if unpaid_amount < 0.01:
            continue
        
        # Неоплаченный платеж: payer должен recipient
        balances.append(MutualBalance(
            creditor_id=recipient_id,
            creditor_name=contributor_names.get(recipient_id, f"ID:{recipient_id}"),
            debtor_id=payer_id,
            debtor_name=contributor_names.get(payer_id, f"ID:{payer_id}"),
            credit=0,  # Это не кредит, а неоплаченная работа
            offset=0,
            remaining=round(unpaid_amount, 2),
            currency=currency
        ))
    
    return balances
