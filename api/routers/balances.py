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
from sqlalchemy import select, func, and_, or_, case
from pydantic import BaseModel

from database.core import get_db
from database.models import User, Payment, Assignment, Task, PaymentCategory, PaymentCategoryGroup, Role
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
    worker_id: Optional[int]  # From Assignment.user_id
    worker_name: str
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
    worker_id: Optional[int] = Query(None, description="ID работника"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сводку для Dashboard карточек (RBAC версия)"""
    
    # Определяем, для какого worker показывать данные
    target_worker_id = None
    if not current_user.is_admin:
        # Не-админ видит только свои данные
        target_worker_id = current_user.id
    elif worker_id:
        # Админ может фильтровать по worker_id
        target_worker_id = worker_id
    # Если target_worker_id=None, показываем все данные (для админа)
    
    currency = "UAH"
    
    # 1. Зарплата — оплаченные платежи из группы "salary"
    # В RBAC: платёж связан с Assignment через assignment_id
    salary_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(
        and_(PaymentCategoryGroup.code == 'salary', Payment.payment_status == 'paid')
    )
    if target_worker_id:
        # Фильтруем через Assignment.user_id ИЛИ прямо через recipient_id
        salary_query = salary_query.outerjoin(
            Assignment, Payment.assignment_id == Assignment.id
        ).where(
            or_(Assignment.user_id == target_worker_id, Payment.recipient_id == target_worker_id)
        )
    result = await db.execute(salary_query)
    total_salary = float(result.one().total or 0)
    
    # 2. Расходы — платежи из группы "expense" (payer = worker)
    expenses_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(PaymentCategoryGroup.code == 'expense')
    if target_worker_id:
        expenses_query = expenses_query.where(Payment.payer_id == target_worker_id)
    result = await db.execute(expenses_query)
    total_expenses = float(result.one().total or 0)
    
    # 3. Кредиты — выданные авансы (группа "debt")
    credits_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'debt', Payment.payment_status == 'paid'))
    if target_worker_id:
        # Кредиты связаны с Assignment worker-а ИЛИ прямо через recipient_id
        credits_query = credits_query.outerjoin(
            Assignment, Payment.assignment_id == Assignment.id
        ).where(
            or_(Assignment.user_id == target_worker_id, Payment.recipient_id == target_worker_id)
        )
    result = await db.execute(credits_query)
    total_credits = float(result.one().total or 0)
    
    
    # 5. Неоплаченные платежи (unpaid)
    unpaid_query = select(func.sum(Payment.amount).label("total")).where(
        Payment.payment_status == 'unpaid'
    )
    if target_worker_id:
        unpaid_query = unpaid_query.outerjoin(
            Assignment, Payment.assignment_id == Assignment.id
        ).where(
            or_(
                Assignment.user_id == target_worker_id,
                Payment.recipient_id == target_worker_id,
                Payment.payer_id == target_worker_id  # Добавлено условие для платежника
            )
        )
    result = await db.execute(unpaid_query)
    unpaid_amount = float(result.one().total or 0)
    
    # К оплате = только неоплаченные платежи
    # Кредиты (авансы) — это долг РАБОТНИКА перед работодателем, не включаем в to_pay
    total_unpaid = unpaid_amount
    
    # 6. Премии (группа "bonus")
    bonus_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'bonus', Payment.payment_status == 'paid'))
    if target_worker_id:
        bonus_query = bonus_query.outerjoin(
            Assignment, Payment.assignment_id == Assignment.id
        ).where(
            or_(Assignment.user_id == target_worker_id, Payment.recipient_id == target_worker_id)
        )
    result = await db.execute(bonus_query)
    total_bonus = float(result.one().total or 0)
    
    # 7. Погашения (группа "repayment", payer = worker)
    repayment_query = select(func.sum(Payment.amount).label("total")).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).where(and_(PaymentCategoryGroup.code == 'repayment', Payment.payment_status == 'paid'))
    if target_worker_id:
        repayment_query = repayment_query.where(Payment.payer_id == target_worker_id)
    result = await db.execute(repayment_query)
    total_repayment = float(result.one().total or 0)
    
    # Итого = Зарплата + Кредиты + Премии + Расходы - Погашения
    total = total_salary + total_credits + total_bonus + total_expenses - total_repayment
    
    # Взаимные расчёты: долг работника перед работодателем
    # Долг = Кредиты (авансы) - Погашения
    worker_debt = total_credits - total_repayment
    balances = []
    if worker_debt > 0 and target_worker_id:
        balances.append(BalanceItem(
            debtor_id=target_worker_id,
            debtor_name="Работник",
            creditor_id=1,  # Admin/Employer
            creditor_name="Работодатель",
            amount=worker_debt,
            currency=currency
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
    
    # Автофильтрация для не-админов: показываем только свои данные
    if not current_user.is_admin:
        worker_id = current_user.id
    
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
            sessions_query = sessions_query.where(Assignment.user_id == worker_id)
        
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
            hours_query = hours_query.where(Assignment.user_id == worker_id)
        
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
                PaymentCategoryGroup.code == 'salary',
                Payment.payment_status == 'paid'
            )
        )
        
        if worker_id:
            salary_query = salary_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(Assignment.user_id == worker_id, Payment.recipient_id == worker_id)
            )
        
        result = await db.execute(salary_query)
        salary = float(result.scalar() or 0)
        
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
                Payment.payment_date < next_month_start,
                Payment.payment_status == 'paid',
                PaymentCategoryGroup.code == 'debt'
            )
        )
        
        if worker_id:
            credits_given_query = credits_given_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(Assignment.user_id == worker_id, Payment.recipient_id == worker_id)
            )
        
        result = await db.execute(credits_given_query)
        credits_given = float(result.scalar() or 0)
        
        # Погашения (группа 'repayment') — за период, ТОЛЬКО оплаченные
        credits_offset_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date < next_month_start,
                PaymentCategoryGroup.code == 'repayment',
                Payment.payment_status == 'paid'
            )
        )
        
        if worker_id:
            credits_offset_query = credits_offset_query.where(Payment.payer_id == worker_id)
        
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
            cumulative_credits_query = cumulative_credits_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(Assignment.user_id == worker_id, Payment.recipient_id == worker_id)
            )
        
        result = await db.execute(cumulative_credits_query)
        cumulative_credits = float(result.scalar() or 0)
        
        cumulative_offset_query = select(
            func.sum(Payment.amount).label("total")
        ).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                Payment.payment_date < next_month_start,
                PaymentCategoryGroup.code == 'repayment',
                Payment.payment_status == 'paid'
            )
        )
        
        if worker_id:
            cumulative_offset_query = cumulative_offset_query.where(Payment.payer_id == worker_id)
        
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
            total_paid_query = total_paid_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(
                    Assignment.user_id == worker_id,
                    Payment.payer_id == worker_id,
                    Payment.recipient_id == worker_id
                )
            )
        
        result = await db.execute(total_paid_query)
        total_paid = float(result.scalar() or 0)
        
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
        
        result = await db.execute(expenses_query)
        expenses = float(result.scalar() or 0)
        
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
                Payment.payment_status == 'paid'
            )
        )
        
        if worker_id:
            expenses_paid_query = expenses_paid_query.where(Payment.payer_id == worker_id)

        result = await db.execute(expenses_paid_query)
        expenses_paid = float(result.scalar() or 0)
        
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
            bonus_query = bonus_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(Assignment.user_id == worker_id, Payment.recipient_id == worker_id)
            )
        
        result = await db.execute(bonus_query)
        bonus = float(result.scalar() or 0)
        
        # Задолженность: неоплаченные платежи за период
        unpaid_query = select(func.sum(Payment.amount).label("total")).where(
            and_(
                Payment.payment_date >= start_date,
                Payment.payment_date < next_month_start,
                Payment.payment_status == 'unpaid'
            )
        )
        
        if worker_id:
            unpaid_query = unpaid_query.outerjoin(
                Assignment, Payment.assignment_id == Assignment.id
            ).where(
                or_(
                    Assignment.user_id == worker_id,
                    Payment.recipient_id == worker_id,
                    Payment.payer_id == worker_id  # Добавлено условие для платежника
                )
            )
        
        result = await db.execute(unpaid_query)
        unpaid_amount = float(result.scalar() or 0)
        
        # К оплате = накопительные кредиты - накопительные погашения
        cumulative_to_pay = cumulative_credits - cumulative_offset
        
        remaining = expenses - expenses_paid
        total = salary + credits_given + bonus + expenses_paid - credits_offset  # Зарплата + Кредиты + Премии + Расходы - Погашено
        
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
    """Получить взаимные балансы (долги работников перед работодателем).
    
    В single-employer модели показываем долг каждого работника:
    Долг = Кредиты (авансы) - Погашения
    
    権限:
    - Admin: видит расчёты всех workers
    - Worker: видит только свои расчёты
    """
    from sqlalchemy import case
    
    # Получаем workers в зависимости от роли
    if current_user.is_admin:
        # Admin видит всех workers
        workers_query = select(User).join(User.roles).where(Role.name == 'worker')
    else:
        # Worker видит только себя
        workers_query = select(User).where(User.id == current_user.id)
    
    workers_result = await db.execute(workers_query)
    workers = workers_result.scalars().all()
    
    balances = []
    
    for worker in workers:
        # Кредиты (авансы) полученные этим worker'ом
        credits_query = select(func.sum(Payment.amount)).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                PaymentCategoryGroup.code == 'debt',
                Payment.payment_status == 'paid',
                Payment.recipient_id == worker.id
            )
        )
        credits_result = await db.execute(credits_query)
        total_credits = float(credits_result.scalar() or 0)
        
        # Погашения от этого worker'а
        repayment_query = select(func.sum(Payment.amount)).join(
            PaymentCategory, Payment.category_id == PaymentCategory.id
        ).join(
            PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
        ).where(
            and_(
                PaymentCategoryGroup.code == 'repayment',
                Payment.payment_status == 'paid',
                Payment.payer_id == worker.id
            )
        )
        repayment_result = await db.execute(repayment_query)
        total_repayment = float(repayment_result.scalar() or 0)
        
        # Долг = Кредиты - Погашения
        worker_debt = total_credits - total_repayment
        
        if abs(worker_debt) > 0.01:  # Показываем только ненулевые балансы
            balances.append(MutualBalance(
                creditor_id=1,  # Работодатель (admin)
                creditor_name="Работодатель",
                debtor_id=worker.id,
                debtor_name=worker.full_name or worker.username,
                credit=total_credits,
                offset=total_repayment,
                remaining=worker_debt,
                currency="UAH"
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
    Полный экспорт всех данных Dashboard для отладки (только для админов)
    """
    from datetime import datetime
    
    if not current_user.is_admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Только для администраторов")
    
    # Получаем все данные
    summary = await get_balance_summary(
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
    
    # Фильтруем только периоды с данными (исключаем пустые периоды)
    monthly_with_data = [
        m for m in monthly
        if any([m.visits, m.hours, m.salary, m.paid, m.offset, 
                m.to_pay, m.expenses, m.expenses_paid, m.bonus])
    ]
    
    mutual = await get_mutual_balances(
        db=db,
        current_user=current_user
    )
    
    # Получаем все платежи с категориями и именами
    from sqlalchemy.orm import aliased
    PayerUser = aliased(User)
    RecipientUser = aliased(User)
    AssignmentWorkerUser = aliased(User)
    
    payments_query = select(
        Payment.id,
        Payment.tracking_nr,
        Payment.payer_id,
        PayerUser.full_name.label("payer_name"),
        func.coalesce(Payment.recipient_id, Assignment.user_id).label("worker_id"),
        func.coalesce(RecipientUser.full_name, AssignmentWorkerUser.full_name).label("worker_name"),
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
    ).outerjoin(
        Assignment, Payment.assignment_id == Assignment.id
    ).outerjoin(
        AssignmentWorkerUser, Assignment.user_id == AssignmentWorkerUser.id
    ).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).join(
        PaymentCategoryGroup, PaymentCategory.group_id == PaymentCategoryGroup.id
    ).order_by(Payment.payment_date.desc())
    
    result = await db.execute(payments_query)
    payments_data = []
    for row in result.all():
        payments_data.append(PaymentDebug(
            id=row.id,
            tracking_nr=row.tracking_nr,
            payer_id=row.payer_id,
            payer_name=row.payer_name,
            worker_id=row.worker_id,
            worker_name=row.worker_name or "—",
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
        repayment=-summary.total_repayment if summary.total_repayment != 0 else 0,  # Избегаем -0
        to_pay=summary.total_unpaid,
        bonus=summary.total_bonus,
        total=summary.total,
        currency=summary.currency
    )
    
    return DebugExport(
        cards=cards,
        mutual_balances=mutual,
        monthly=monthly_with_data,
        payments=payments_data,
        export_timestamp=datetime.now().isoformat()
    )
