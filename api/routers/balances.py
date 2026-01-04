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
from database.models import User, Payment, Assignment, Task, PaymentCategory, PaymentCategoryGroup, PaymentGroupCode
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
    sessions: int  # Количество посещений (сессий)
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


class PaymentDebug(BaseModel):
    """Платёж для отладки (только ключевые поля)"""
    id: int
    tracking_nr: Optional[str]
    payer_id: int
    payer_name: str
    recipient_id: Optional[int]
    recipient_name: str
    amount: float
    currency: str
    payment_status: str
    payment_date: str
    category_name: str
    category_group: str
    description: Optional[str]


class CardsSummary(BaseModel):
    """Карточки на Dashboard (точно как на GUI)"""
    salary: float       # Зарплата (зелёная карточка)
    expenses: float     # Расходы (розовая карточка)
    credits: float      # Кредиты (фиолетовая карточка)
    repayment: float    # Погашения (оранжевая, показывается как отрицательное)
    to_pay: float       # К оплате (красная карточка)
    bonus: float        # Премии (жёлтая карточка)
    total: float        # Всего (голубая карточка)
    currency: str


class DebugExport(BaseModel):
    """Полный экспорт Dashboard для отладки — структура как на GUI"""
    # Секция 1: Карточки сверху
    cards: CardsSummary
    # Секция 2: Взаимные расчёты
    mutual_balances: List[MutualBalance]
    # Секция 3: Помесячный обзор
    monthly: List[MonthlySummary]
    # Все платежи для анализа
    payments: List[PaymentDebug]
    export_timestamp: str

@router.get("/summary", response_model=DashboardSummary)
async def get_balance_summary(
    employer_id: Optional[int] = Query(None, description="ID работодателя (А)"),
    worker_id: Optional[int] = Query(None, description="ID работника (Е)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сводку для Dashboard карточек"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Автофильтрация — пользователи без view_all_reports видят только свои данные
    user_filter_id = None
    try:
        has_perm = current_user.has_permission('view_all_reports')
        logger.info(f"User {current_user.id} has_permission('view_all_reports') = {has_perm}")
        if not has_perm:
            user_filter_id = current_user.id
    except Exception as e:
        logger.error(f"Error checking permission for user {current_user.id}: {e}", exc_info=True)
        # Fallback: filter by user
        user_filter_id = current_user.id
    
    currency = "UAH"
    
    # 1. Зарплата — оплаченные платежи из группы "salary"
    salary_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value, Payment.payment_status.in_(['paid', 'offset']))
    )
    if user_filter_id:
        salary_query = salary_query.where(Payment.recipient_id == user_filter_id)
    elif worker_id:
        salary_query = salary_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(salary_query)
    total_salary = float(result.one().total or 0)
    
    # 2. Расходы для карточек:
    # - Worker (user_filter_id): только UNPAID (что ему должны вернуть)
    # - Admin/Employer: ВСЕ расходы (общая сумма расходов работников)
    if user_filter_id:
        # Worker видит только неоплаченные расходы
        expenses_query = select(func.sum(Payment.amount).label("total")).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value,
                Payment.payment_status == 'unpaid'
            )
        ).where(Payment.payer_id == user_filter_id)
    else:
        # Admin/Employer видит все расходы работников
        expenses_query = select(func.sum(Payment.amount).label("total")).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value)
        if worker_id:
            expenses_query = expenses_query.where(Payment.payer_id == worker_id)
    result = await db.execute(expenses_query)
    total_expenses = float(result.one().total or 0)



    
    # 2b. Только оплаченные расходы (для расчета "Итого")
    expenses_paid_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value,
            Payment.payment_status.in_(['paid', 'offset'])
        )
    )
    if user_filter_id:
        expenses_paid_query = expenses_paid_query.where(Payment.payer_id == user_filter_id)
    elif worker_id:
        expenses_paid_query = expenses_paid_query.where(Payment.payer_id == worker_id)
    result = await db.execute(expenses_paid_query)
    total_expenses_paid = float(result.one().total or 0)
    
    # 3. Кредиты — всего выданных (без вычитания offset)
    credits_given_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value, Payment.payment_status == 'paid'))
    if user_filter_id:
        credits_given_query = credits_given_query.where(Payment.recipient_id == user_filter_id)
    elif worker_id:
        credits_given_query = credits_given_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(credits_given_query)
    credits_given = float(result.one().total or 0)
    
    # Зачтённые в счёт долга (все платежи со статусом 'offset')
    credits_offset_query = select(func.sum(Payment.amount).label("total")).where(Payment.payment_status == 'offset')
    if user_filter_id:
        credits_offset_query = credits_offset_query.where(
            (Payment.recipient_id == user_filter_id) | (Payment.payer_id == user_filter_id)
        )
    elif worker_id:
        credits_offset_query = credits_offset_query.where(
            (Payment.recipient_id == worker_id) | (Payment.payer_id == worker_id)
        )
    result = await db.execute(credits_offset_query)
    credits_offset = float(result.one().total or 0)
    
    # Кредиты = выданные (сумма кредитов)
    total_credits = credits_given
    
    # 4. К оплате — чистый непогашенный долг (кредиты - погашения)
    # Неоплаченные платежи (исключая группу repayment — это намерение погасить, не долг)
    unpaid_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            Payment.payment_status == 'unpaid',
            PaymentCategoryGroup.code != PaymentGroupCode.REPAYMENT.value
        )
    )
    if user_filter_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == user_filter_id)
    elif worker_id:
        unpaid_query = unpaid_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(unpaid_query)
    unpaid_amount = float(result.one().total or 0)
    
    # 5. Премии — оплаченные платежи из группы "bonus"
    bonus_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == PaymentGroupCode.BONUS.value, Payment.payment_status.in_(['paid', 'offset'])))
    if user_filter_id:
        bonus_query = bonus_query.where(Payment.recipient_id == user_filter_id)
    elif worker_id:
        bonus_query = bonus_query.where(Payment.recipient_id == worker_id)
    result = await db.execute(bonus_query)
    total_bonus = float(result.one().total or 0)
    
    # 6. Погашения (группа 'repayment')
    repayment_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value, Payment.payment_status == 'paid'))
    if user_filter_id:
        repayment_query = repayment_query.where(Payment.payer_id == user_filter_id)
    elif worker_id:
        repayment_query = repayment_query.where(Payment.payer_id == worker_id)
    result = await db.execute(repayment_query)
    total_repayment = float(result.one().total or 0)
    
    # К оплате = непогашенные кредиты + неоплаченные платежи
    total_unpaid = max(0, total_credits - total_repayment) + unpaid_amount
    
    # 7. Всего:
    # - Worker: чистый ДОХОД = Зарплата + Кредиты + Премии - Погашения - Невозмещённые расходы
    # - Employer: общие РАСХОДЫ = Зарплата + Кредиты + Премии + Расходы работников - Погашения
    if user_filter_id:
        # Worker: доход минус невозмещённые расходы
        total = total_salary + total_credits + total_bonus - total_repayment - total_expenses
    else:
        # Employer: сумма всех расходов на работников
        total = total_salary + total_credits + total_bonus + total_expenses - total_repayment

    
    # Балансы (неоплаченные долги)
    balances = []
    debt_query = select(
        Payment.payer_id, Payment.recipient_id,
        func.sum(Payment.amount).label("total"), Payment.currency
    ).where(Payment.payment_status == 'unpaid').group_by(
        Payment.payer_id, Payment.recipient_id, Payment.currency
    )
    if user_filter_id:
        debt_query = debt_query.where(Payment.recipient_id == user_filter_id)
    
    result = await db.execute(debt_query)
    debt_rows = result.all()
    
    # Получаем имена
    contributor_ids = set()
    for row in debt_rows:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    user_names = {}
    if contributor_ids:
        result = await db.execute(select(User).where(User.id.in_(contributor_ids)))
        for u in result.scalars().all():
            user_names[u.id] = u.full_name
    
    for row in debt_rows:
        currency = row.currency
        # Для неоплаченных платежей: payer — должник (должен заплатить), recipient — кредитор (ему должны)
        balances.append(BalanceItem(
            debtor_id=row.payer_id,
            debtor_name=user_names.get(row.payer_id, f"ID:{row.payer_id}"),
            creditor_id=row.recipient_id or 0,
            creditor_name=user_names.get(row.recipient_id, "—") if row.recipient_id else "—",
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
    import logging
    logger = logging.getLogger(__name__)
    
    # Автофильтрация — пользователи без view_all_reports видят только свои данные
    is_worker_view = False
    try:
        has_perm = current_user.has_permission('view_all_reports')
        logger.info(f"[monthly] User {current_user.id} has_permission('view_all_reports') = {has_perm}")
        if not has_perm:
            worker_id = current_user.id
            is_worker_view = True
    except Exception as e:
        logger.error(f"[monthly] Error checking permission for user {current_user.id}: {e}", exc_info=True)
        worker_id = current_user.id
        is_worker_view = True

    
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
            func.count(func.distinct(Assignment.id)).label("sessions"),
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
            sessions_query = sessions_query.where(Assignment.user_id == worker_id)
        # Note: employer_id not used for Assignment (single-employer model)
        
        result = await db.execute(sessions_query)
        session_row = result.first()
        
        sessions = session_row.sessions if session_row else 0
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
            hours_query = hours_query.where(Assignment.user_id == worker_id)
        # Note: employer_id not used for Assignment (single-employer model)
        
        result = await db.execute(hours_query)
        hours_row = result.first()
        hours = float(hours_row.hours) if hours_row and hours_row.hours else 0
        
        # Зарплата из payments по дате платежа (группа "salary", только оплаченные)
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
                PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value,
                Payment.payment_status.in_(['paid', 'offset'])  # Только выплаченная зарплата
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
                PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value,
                Payment.payment_status == 'paid'  # Only count confirmed repayments
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
                PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value,
                Payment.payment_status == 'paid'  # Only count confirmed repayments
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
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value,
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
                PaymentCategoryGroup.code == PaymentGroupCode.BONUS.value
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
            unpaid_query = unpaid_query.where(Payment.payer_id == worker_id)
        elif employer_id:
            unpaid_query = unpaid_query.where(Payment.recipient_id == employer_id)
        
        result = await db.execute(unpaid_query)
        unpaid_amount = float(result.one().total or 0)
        
        # К оплате = накопительные кредиты - накопительные погашения
        # Это показывает текущий баланс долга на конец периода
        cumulative_to_pay = cumulative_credits - cumulative_offset
        
        remaining = expenses - expenses_paid
        # Итого:
        # - Worker: чистый ДОХОД = Зарплата + Кредиты + Премии - Погашено - Невозмещённые расходы
        # - Employer: общие РАСХОДЫ = Зарплата + Кредиты + Премии + Расходы - Погашено
        if is_worker_view:
            total = salary + credits_given + bonus - credits_offset - remaining
        else:
            total = salary + credits_given + bonus + expenses - credits_offset


        
        summaries.append(MonthlySummary(
            period=f"{year}-{month:02d}",
            sessions=sessions,
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
    """Получить взаимные балансы долгов между парами пользователей.
    
    Показывает ОТДЕЛЬНЫЕ строки для:
    1. Долговых отношений (кредиты/авансы из категории 'debt')
    2. Неоплаченных платежей (зарплаты, бонусы и т.д.)
    """
    
    # Автофильтрация — пользователи без view_all_reports видят только свои данные
    user_filter_id = None
    if not current_user.has_permission('view_all_reports'):
        user_filter_id = current_user.id
    
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
            PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value,
            Payment.payment_status == 'paid'  # Только выданные кредиты
        )
    ).distinct()
    
    if user_filter_id:
        debt_pairs_query = debt_pairs_query.where(
            (Payment.payer_id == user_filter_id) | 
            (Payment.recipient_id == user_filter_id)
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
        func.sum(Payment.amount).label("total"),
        PaymentCategoryGroup.code.label("group_code")
    ).select_from(Payment).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(
            Payment.recipient_id != None,
            Payment.payment_status == 'unpaid'
        )
    ).group_by(
        Payment.payer_id,
        Payment.recipient_id,
        Payment.currency,
        PaymentCategoryGroup.code
    )
    
    if user_filter_id:
        unpaid_pairs_query = unpaid_pairs_query.where(
            (Payment.payer_id == user_filter_id) | 
            (Payment.recipient_id == user_filter_id)
        )
    
    result = await db.execute(unpaid_pairs_query)
    unpaid_pairs = result.all()
    
    for row in unpaid_pairs:
        contributor_ids.add(row.payer_id)
        if row.recipient_id:
            contributor_ids.add(row.recipient_id)
    
    # Получаем имена
    user_names = {}
    if contributor_ids:
        result = await db.execute(
            select(User).where(User.id.in_(contributor_ids))
        )
        for u in result.scalars().all():
            user_names[u.id] = u.full_name
    
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
                PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.DEBT.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value
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
                PaymentCategoryGroup.code == PaymentGroupCode.REPAYMENT.value
            )
        )
        result = await db.execute(repayment_b_to_a_query)
        repayment_b_to_a = float(result.scalar() or 0)
        
        # === НЕОПЛАЧЕННЫЕ РАСХОДЫ (создают долг) ===
        # Unpaid expense A→B: A потратил, B должен ему — увеличивает долг B перед A
        unpaid_expense_a_to_b_query = select(func.sum(Payment.amount)).select_from(
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
                Payment.payment_status == 'unpaid',
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value
            )
        )
        result = await db.execute(unpaid_expense_a_to_b_query)
        unpaid_expense_a_to_b = float(result.scalar() or 0)
        
        # Unpaid expense B→A: B потратил, A должен ему — увеличивает долг A перед B
        unpaid_expense_b_to_a_query = select(func.sum(Payment.amount)).select_from(
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
                Payment.payment_status == 'unpaid',
                PaymentCategoryGroup.code == PaymentGroupCode.EXPENSE.value
            )
        )
        result = await db.execute(unpaid_expense_b_to_a_query)
        unpaid_expense_b_to_a = float(result.scalar() or 0)
        
        # Чистый баланс:
        # debt = создаёт долг
        # salary = погашает долг (работа)
        # repayment = погашает долг (прямая выплата)
        # ВАЖНО: unpaid_expense НЕ учитывается - неоплаченные расходы не влияют на баланс
        # ВАЖНО: paid expense НЕ вычитается — оплаченные расходы просто "уже возмещены"
        # positive = B owes A, negative = A owes B
        
        balance_b_owes_a = debt_a_to_b - salary_a_to_b - repayment_b_to_a
        balance_a_owes_b = debt_b_to_a - salary_b_to_a - repayment_a_to_b
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
                    creditor_name=user_names.get(a_id, f"ID:{a_id}"),
                    debtor_id=b_id,
                    debtor_name=user_names.get(b_id, f"ID:{b_id}"),
                    credit=round(main_debt, 2),
                    offset=round(main_offset, 2),
                    remaining=round(net_balance, 2),
                    currency=currency
                ))
            else:
                # A должен B
                balances.append(MutualBalance(
                    creditor_id=b_id,
                    creditor_name=user_names.get(b_id, f"ID:{b_id}"),
                    debtor_id=a_id,
                    debtor_name=user_names.get(a_id, f"ID:{a_id}"),
                    credit=round(main_debt, 2),
                    offset=round(main_offset, 2),
                    remaining=round(-net_balance, 2),
                    currency=currency
                ))
    
    return balances


@router.get("/debug", response_model=DebugExport)
async def get_debug_export(
    employer_id: Optional[int] = Query(None),
    worker_id: Optional[int] = Query(None),
    months: int = Query(6, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Полный экспорт всех данных Dashboard для отладки.
    Админы видят всё, работники - только свои данные.
    """
    from datetime import datetime
    
    # Workers can only export their own data
    if not current_user.has_permission('view_all_reports'):
        if not current_user.is_worker:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Нет прав на экспорт данных")
        # Force worker to see only their own data
        worker_id = current_user.id
    
    # Получаем все данные
    summary = await get_balance_summary(
        employer_id=employer_id,
        worker_id=worker_id,
        db=db,
        current_user=current_user
    )
    
    monthly = await get_monthly_summary(
        employer_id=employer_id,
        worker_id=worker_id,
        months=months,
        db=db,
        current_user=current_user
    )
    
    # Фильтруем пустые периоды для экономии токенов
    monthly = [
        m for m in monthly 
        if m.sessions > 0 or m.hours > 0 or m.salary > 0 or m.expenses > 0 or 
           m.paid > 0 or m.bonus > 0 or m.offset != 0 or m.to_pay > 0
    ]
    
    mutual = await get_mutual_balances(
        db=db,
        current_user=current_user
    )
    
    # Получаем все платежи с категориями и именами
    from sqlalchemy.orm import aliased
    PayerUser = aliased(User)
    RecipientUser = aliased(User)
    
    payments_query = select(
        Payment.id,
        Payment.tracking_nr,
        Payment.payer_id,
        PayerUser.full_name.label("payer_name"),
        Payment.recipient_id,
        RecipientUser.full_name.label("recipient_name"),
        Payment.amount,
        Payment.currency,
        Payment.payment_status,
        Payment.payment_date,
        PaymentCategory.name.label("category_name"),
        PaymentCategoryGroup.name.label("category_group"),
        Payment.description
    ).select_from(Payment).join(
        PayerUser, Payment.payer_id == PayerUser.id
    ).outerjoin(
        RecipientUser, Payment.recipient_id == RecipientUser.id
    ).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    )
    
    # Filter payments for workers - only show their own payments
    if worker_id:
        from sqlalchemy import or_
        payments_query = payments_query.where(
            or_(Payment.payer_id == worker_id, Payment.recipient_id == worker_id)
        )
    
    payments_query = payments_query.order_by(Payment.payment_date.desc())
    
    result = await db.execute(payments_query)
    payments_data = []
    for row in result.all():
        payments_data.append(PaymentDebug(
            id=row.id,
            tracking_nr=row.tracking_nr,
            payer_id=row.payer_id,
            payer_name=row.payer_name,
            recipient_id=row.recipient_id,
            recipient_name=row.recipient_name or "—",
            amount=float(row.amount),
            currency=row.currency,
            payment_status=row.payment_status,
            payment_date=row.payment_date.isoformat() if row.payment_date else "",
            category_name=row.category_name,
            category_group=row.category_group,
            description=row.description
        ))
    
    # Формируем структуру как на GUI
    cards = CardsSummary(
        salary=summary.total_salary,
        expenses=summary.total_expenses,
        credits=summary.total_credits,
        repayment=-summary.total_repayment,  # Показываем как отрицательное (как на GUI)
        to_pay=summary.total_unpaid,
        bonus=summary.total_bonus,
        total=summary.total,
        currency=summary.currency
    )
    
    return DebugExport(
        cards=cards,
        mutual_balances=mutual,
        monthly=monthly,
        payments=payments_data,
        export_timestamp=datetime.now().isoformat()
    )
