"""
API роутер для рабочих сессий (учёт времени)
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, date, time, timedelta
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload
from pydantic import BaseModel

from database.core import get_db
from database.models import User, WorkSession, EmploymentRelation, Contributor, Payment, PaymentCategory, UserRole
from api.auth.oauth import get_current_user, get_user_contributor

router = APIRouter(prefix="/work-sessions", tags=["work-sessions"])


class WorkSessionStart(BaseModel):
    """Начало рабочей сессии"""
    worker_id: int
    employer_id: int
    description: Optional[str] = None


class WorkSessionResponse(BaseModel):
    id: int
    worker_id: int
    employer_id: int
    session_date: date
    start_time: time
    end_time: Optional[time] = None
    duration_hours: Optional[float] = None
    hourly_rate: float
    currency: str
    amount: Optional[float] = None
    is_active: bool
    description: Optional[str] = None
    worker_name: Optional[str] = None
    employer_name: Optional[str] = None


class WorkSessionSummary(BaseModel):
    """Сводка по рабочим сессиям"""
    period_start: date
    period_end: date
    total_sessions: int
    total_hours: float
    total_amount: float
    currency: str


class WorkSessionUpdate(BaseModel):
    """Обновление рабочей сессии"""
    session_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_hours: Optional[float] = None
    description: Optional[str] = None


@router.post("/start", response_model=WorkSessionResponse)
async def start_work_session(
    session_data: WorkSessionStart,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Начать новую рабочую сессию"""
    # Проверяем, есть ли активное трудовое отношение
    result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.employer_id == session_data.employer_id,
                EmploymentRelation.employee_id == session_data.worker_id,
                EmploymentRelation.is_active == True
            )
        )
    )
    employment = result.scalar_one_or_none()
    
    if not employment:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    # Проверяем, нет ли уже активной сессии
    result = await db.execute(
        select(WorkSession).where(
            and_(
                WorkSession.worker_id == session_data.worker_id,
                WorkSession.is_active == True
            )
        )
    )
    active_session = result.scalar_one_or_none()
    
    if active_session:
        raise HTTPException(status_code=400, detail="У работника уже есть активная сессия")
    
    now = datetime.now()
    new_session = WorkSession(
        worker_id=session_data.worker_id,
        employer_id=session_data.employer_id,
        session_date=now.date(),
        start_time=now.time(),
        hourly_rate=employment.hourly_rate,
        currency=employment.currency,
        is_active=True,
        description=session_data.description
    )
    
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    
    # Загружаем имена участников
    result = await db.execute(
        select(WorkSession)
        .options(joinedload(WorkSession.worker), joinedload(WorkSession.employer))
        .where(WorkSession.id == new_session.id)
    )
    session = result.scalar_one()
    
    return WorkSessionResponse(
        id=session.id,
        worker_id=session.worker_id,
        employer_id=session.employer_id,
        session_date=session.session_date,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_hours=float(session.duration_hours) if session.duration_hours else None,
        hourly_rate=float(session.hourly_rate),
        currency=session.currency,
        amount=float(session.amount) if session.amount else None,
        is_active=session.is_active,
        description=session.description,
        worker_name=session.worker.name if session.worker else None,
        employer_name=session.employer.name if session.employer else None
    )


@router.post("/{session_id}/stop", response_model=WorkSessionResponse)
async def stop_work_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Завершить рабочую сессию и создать платёж"""
    result = await db.execute(
        select(WorkSession)
        .options(joinedload(WorkSession.worker), joinedload(WorkSession.employer))
        .where(WorkSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Сессия уже завершена")
    
    now = datetime.now()
    session.end_time = now.time()
    session.is_active = False
    
    # Рассчитываем длительность
    start_dt = datetime.combine(session.session_date, session.start_time)
    end_dt = datetime.combine(session.session_date, session.end_time)
    
    # Если работа перешла через полночь
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    
    duration = (end_dt - start_dt).total_seconds() / 3600  # в часах
    session.duration_hours = Decimal(str(round(duration, 2)))
    session.amount = session.duration_hours * session.hourly_rate
    
    # Создаём платёж типа "work"
    # Находим или создаём категорию "Работа"
    result = await db.execute(
        select(PaymentCategory).where(PaymentCategory.name == "Работа")
    )
    work_category = result.scalar_one_or_none()
    
    if not work_category:
        work_category = PaymentCategory(name="Работа", description="Оплата за работу")
        db.add(work_category)
        await db.flush()
    
    payment = Payment(
        payer_id=session.employer_id,
        recipient_id=session.worker_id,
        category_id=work_category.id,
        amount=session.amount,
        currency=session.currency,
        description=f"Оплата за работу {session.session_date}",
        payment_date=now,
        is_paid=False,
        work_session_id=session.id
    )
    
    db.add(payment)
    await db.commit()
    await db.refresh(session)
    
    return WorkSessionResponse(
        id=session.id,
        worker_id=session.worker_id,
        employer_id=session.employer_id,
        session_date=session.session_date,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_hours=float(session.duration_hours) if session.duration_hours else None,
        hourly_rate=float(session.hourly_rate),
        currency=session.currency,
        amount=float(session.amount) if session.amount else None,
        is_active=session.is_active,
        description=session.description,
        worker_name=session.worker.name if session.worker else None,
        employer_name=session.employer.name if session.employer else None
    )


@router.put("/{session_id}", response_model=WorkSessionResponse)
async def update_work_session(
    session_id: int,
    update_data: WorkSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Редактировать рабочую сессию"""
    
    # Получаем сессию
    result = await db.execute(
        select(WorkSession)
        .options(joinedload(WorkSession.worker), joinedload(WorkSession.employer))
        .where(WorkSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    # Проверка прав: пользователь может редактировать только свои сессии
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or session.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на редактирование этой сессии")
    
    # Обновляем поля
    if update_data.session_date is not None:
        session.session_date = update_data.session_date
    if update_data.start_time is not None:
        session.start_time = update_data.start_time
    if update_data.end_time is not None:
        session.end_time = update_data.end_time
        session.is_active = False  # Если указано время окончания — сессия завершена
    if update_data.description is not None:
        session.description = update_data.description
    
    # Пересчитываем duration и amount
    if update_data.duration_hours is not None:
        session.duration_hours = update_data.duration_hours
    elif session.start_time and session.end_time:
        # Автоматический расчёт длительности
        start_dt = datetime.combine(session.session_date, session.start_time)
        end_dt = datetime.combine(session.session_date, session.end_time)
        if end_dt < start_dt:
            end_dt += timedelta(days=1)  # Ночная смена
        duration = (end_dt - start_dt).total_seconds() / 3600
        session.duration_hours = round(duration, 2)
    
    # Пересчитываем сумму
    if session.duration_hours and session.hourly_rate:
        session.amount = round(float(session.duration_hours) * float(session.hourly_rate), 2)
    
    await db.commit()
    await db.refresh(session)
    
    return WorkSessionResponse(
        id=session.id,
        worker_id=session.worker_id,
        employer_id=session.employer_id,
        session_date=session.session_date,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_hours=float(session.duration_hours) if session.duration_hours else None,
        hourly_rate=float(session.hourly_rate),
        currency=session.currency,
        amount=float(session.amount) if session.amount else None,
        is_active=session.is_active,
        description=session.description,
        worker_name=session.worker.name if session.worker else None,
        employer_name=session.employer.name if session.employer else None
    )


@router.delete("/{session_id}")
async def delete_work_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить рабочую сессию"""
    
    # Получаем сессию с платежом
    result = await db.execute(
        select(WorkSession)
        .options(joinedload(WorkSession.payment))
        .where(WorkSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    # Проверка прав: пользователь может удалять только свои сессии
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or session.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление этой сессии")
    
    # Проверяем связанный платёж
    if session.payment:
        if session.payment.is_paid:
            raise HTTPException(
                status_code=400, 
                detail="Невозможно удалить сессию: платёж уже оплачен"
            )
        # Удаляем неоплаченный платёж вместе с сессией
        await db.delete(session.payment)
    
    await db.delete(session)
    await db.commit()
    
    return {"message": "Сессия удалена"}


@router.get("/", response_model=List[WorkSessionResponse])
async def get_work_sessions(
    worker_id: Optional[int] = Query(None),
    employer_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):                                                         
    """Получить список рабочих сессий с фильтрами"""
    
    # Автофильтрация для не-админов
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            worker_id = user_contributor.id
        else:
            # Нет связанного Contributor — возвращаем пустой результат
            return []
    
    query = select(WorkSession).options(
        joinedload(WorkSession.worker),
        joinedload(WorkSession.employer)
    )
    
    if worker_id:
        query = query.where(WorkSession.worker_id == worker_id)
    if employer_id:
        query = query.where(WorkSession.employer_id == employer_id)
    if start_date:
        query = query.where(WorkSession.session_date >= start_date)
    if end_date:
        query = query.where(WorkSession.session_date <= end_date)
    if is_active is not None:
        query = query.where(WorkSession.is_active == is_active)
    
    query = query.order_by(WorkSession.session_date.desc(), WorkSession.start_time.desc())
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    sessions = result.scalars().all()
    
    return [
        WorkSessionResponse(
            id=s.id,
            worker_id=s.worker_id,
            employer_id=s.employer_id,
            session_date=s.session_date,
            start_time=s.start_time,
            end_time=s.end_time,
            duration_hours=float(s.duration_hours) if s.duration_hours else None,
            hourly_rate=float(s.hourly_rate),
            currency=s.currency,
            amount=float(s.amount) if s.amount else None,
            is_active=s.is_active,
            description=s.description,
            worker_name=s.worker.name if s.worker else None,
            employer_name=s.employer.name if s.employer else None
        )
        for s in sessions
    ]


@router.get("/active")
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):                                    
    """Получить активные рабочие сессии"""
    
    # Автофильтрация для не-админов
    user_contributor = None
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
    
    query = select(WorkSession).options(
        joinedload(WorkSession.worker), joinedload(WorkSession.employer)
    ).where(WorkSession.is_active == True)
    
    if user_contributor:
        query = query.where(WorkSession.worker_id == user_contributor.id)
    
    result = await db.execute(query)
    sessions = result.scalars().all()
    
    return [
        WorkSessionResponse(
            id=s.id,
            worker_id=s.worker_id,
            employer_id=s.employer_id,
            session_date=s.session_date,
            start_time=s.start_time,
            end_time=s.end_time,
            duration_hours=float(s.duration_hours) if s.duration_hours else None,
            hourly_rate=float(s.hourly_rate),
            currency=s.currency,
            amount=float(s.amount) if s.amount else None,
            is_active=s.is_active,
            description=s.description,
            worker_name=s.worker.name if s.worker else None,
            employer_name=s.employer.name if s.employer else None
        )
        for s in sessions
    ]


@router.get("/summary")
async def get_sessions_summary(
    worker_id: Optional[int] = Query(None),
    employer_id: Optional[int] = Query(None),
    period: str = Query("month", regex="^(day|week|month|year)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):                                                       
    """Получить сводку по рабочим сессиям"""
    from utils.timezone import now_server
    
    # Автофильтрация для не-админов
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            worker_id = user_contributor.id
    
    now = now_server()
    
    if not start_date:
        if period == "day":
            start_date = now.date()
        elif period == "week":
            start_date = now.date() - timedelta(days=7)
        elif period == "month":
            start_date = now.date().replace(day=1)
        elif period == "year":
            start_date = now.date().replace(month=1, day=1)
    
    if not end_date:
        end_date = now.date()
    
    query = select(
        func.count(WorkSession.id).label("total_sessions"),
        func.sum(WorkSession.duration_hours).label("total_hours"),
        func.sum(WorkSession.amount).label("total_amount"),
        WorkSession.currency
    ).where(
        and_(
            WorkSession.session_date >= start_date,
            WorkSession.session_date <= end_date,
            WorkSession.is_active == False  # Только завершённые сессии
        )
    ).group_by(WorkSession.currency)
    
    if worker_id:
        query = query.where(WorkSession.worker_id == worker_id)
    if employer_id:
        query = query.where(WorkSession.employer_id == employer_id)
    
    result = await db.execute(query)
    rows = result.all()
    
    summaries = []
    for row in rows:
        summaries.append(WorkSessionSummary(
            period_start=start_date,
            period_end=end_date,
            total_sessions=row.total_sessions or 0,
            total_hours=float(row.total_hours) if row.total_hours else 0,
            total_amount=float(row.total_amount) if row.total_amount else 0,
            currency=row.currency
        ))
    
    return summaries
