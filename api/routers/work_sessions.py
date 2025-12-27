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
    session_type: str = "work"
    assignment_id: Optional[int] = None
    description: Optional[str] = None
    worker_name: Optional[str] = None
    employer_name: Optional[str] = None
    # Aggregated times for the assignment
    total_work_seconds: Optional[int] = None
    total_pause_seconds: Optional[int] = None


class WorkSessionSummary(BaseModel):
    """Сводка по рабочим сессиям"""
    period_start: date
    period_end: date
    total_sessions: int
    total_hours: float
    total_amount: float
    currency: str


class AssignmentResponse(BaseModel):
    """Группировка сегментов по assignment"""
    assignment_id: int
    session_date: date
    worker_id: int
    worker_name: Optional[str] = None
    employer_id: int
    employer_name: Optional[str] = None
    start_time: time  # Начало первого сегмента
    end_time: Optional[time] = None  # Конец последнего сегмента
    total_work_seconds: int
    total_pause_seconds: int
    total_hours: float
    total_amount: float
    currency: str
    is_active: bool
    segments: List[WorkSessionResponse] = []  # Все сегменты (work + pause)


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
    
    # Set assignment_id to self (this is the first session in the assignment chain)
    new_session.assignment_id = new_session.id
    await db.commit()
    
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
    
    # Создаём платёж с категорией "Зарплата" (id=3)
    payment = Payment(
        payer_id=session.employer_id,
        recipient_id=session.worker_id,
        category_id=3,  # Зарплата
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


@router.get("/grouped", response_model=List[AssignmentResponse])
async def get_grouped_sessions(
    worker_id: Optional[int] = Query(None),
    employer_id: Optional[int] = Query(None),
    period: str = Query("month", regex="^(day|week|month|year)$"),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сессии сгруппированные по assignment_id"""
    from utils.timezone import now_server
    now = now_server()
    
    # Calculate date range
    if period == "day":
        start_date = now.date()
    elif period == "week":
        start_date = now.date() - timedelta(days=7)
    elif period == "month":
        start_date = now.date().replace(day=1)
    else:
        start_date = now.date().replace(month=1, day=1)
    
    # Get all sessions in date range
    query = select(WorkSession).options(
        joinedload(WorkSession.worker), joinedload(WorkSession.employer)
    ).where(
        WorkSession.session_date >= start_date
    ).order_by(WorkSession.assignment_id, WorkSession.start_time)
    
    if worker_id:
        query = query.where(WorkSession.worker_id == worker_id)
    if employer_id:
        query = query.where(WorkSession.employer_id == employer_id)
    
    # Auto-filter for non-admins
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            query = query.where(WorkSession.worker_id == user_contributor.id)
    
    result = await db.execute(query)
    all_sessions = result.scalars().all()
    
    # Group by assignment_id
    from collections import defaultdict
    assignments = defaultdict(list)
    for s in all_sessions:
        if s.assignment_id:
            assignments[s.assignment_id].append(s)
    
    # Build response
    responses = []
    for assignment_id, segments in sorted(assignments.items(), key=lambda x: (x[1][0].session_date, x[1][0].start_time) if x[1] else (now.date(), now.time()), reverse=True):
        if not segments:
            continue
        
        # Calculate totals
        total_work_seconds = 0
        total_pause_seconds = 0
        total_amount = 0
        is_active = False
        
        for seg in segments:
            if seg.duration_hours:
                seg_seconds = int(float(seg.duration_hours) * 3600)
            elif seg.is_active:
                is_active = True
                start_dt = datetime.combine(seg.session_date, seg.start_time)
                seg_seconds = int((now - start_dt).total_seconds())
            else:
                seg_seconds = 0
            
            if seg.session_type == "work":
                total_work_seconds += seg_seconds
                if seg.amount:
                    total_amount += float(seg.amount)
            else:
                total_pause_seconds += seg_seconds
        
        first_seg = segments[0]
        last_seg = segments[-1]
        
        segment_responses = [
            WorkSessionResponse(
                id=seg.id,
                worker_id=seg.worker_id,
                employer_id=seg.employer_id,
                session_date=seg.session_date,
                start_time=seg.start_time,
                end_time=seg.end_time,
                duration_hours=float(seg.duration_hours) if seg.duration_hours else None,
                hourly_rate=float(seg.hourly_rate),
                currency=seg.currency,
                amount=float(seg.amount) if seg.amount else None,
                is_active=seg.is_active,
                session_type=seg.session_type,
                assignment_id=seg.assignment_id,
                description=seg.description,
                worker_name=seg.worker.name if seg.worker else None,
                employer_name=seg.employer.name if seg.employer else None
            )
            for seg in reversed(segments)
        ]
        
        responses.append(AssignmentResponse(
            assignment_id=assignment_id,
            session_date=first_seg.session_date,
            worker_id=first_seg.worker_id,
            worker_name=first_seg.worker.name if first_seg.worker else None,
            employer_id=first_seg.employer_id,
            employer_name=first_seg.employer.name if first_seg.employer else None,
            start_time=first_seg.start_time,
            end_time=last_seg.end_time if not is_active else None,
            total_work_seconds=total_work_seconds,
            total_pause_seconds=total_pause_seconds,
            total_hours=round(total_work_seconds / 3600, 2),
            total_amount=total_amount,
            currency=first_seg.currency,
            is_active=is_active,
            segments=segment_responses
        ))
    
    return responses[:limit]


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
    
    responses = []
    for s in sessions:
        # Calculate aggregated times for this assignment
        total_work_seconds = 0
        total_pause_seconds = 0
        
        if s.assignment_id:
            # Get all sessions in this assignment
            assignment_query = select(WorkSession).where(
                WorkSession.assignment_id == s.assignment_id
            )
            assignment_result = await db.execute(assignment_query)
            assignment_sessions = assignment_result.scalars().all()
            
            from utils.timezone import now_server
            now = now_server()
            
            for seg in assignment_sessions:
                if seg.duration_hours:
                    # Completed segment
                    seg_seconds = int(float(seg.duration_hours) * 3600)
                elif seg.is_active:
                    # Current running segment
                    start_dt = datetime.combine(seg.session_date, seg.start_time)
                    seg_seconds = int((now - start_dt).total_seconds())
                else:
                    seg_seconds = 0
                
                if seg.session_type == "work":
                    total_work_seconds += seg_seconds
                else:
                    total_pause_seconds += seg_seconds
        
        responses.append(WorkSessionResponse(
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
            session_type=s.session_type,
            assignment_id=s.assignment_id,
            description=s.description,
            worker_name=s.worker.name if s.worker else None,
            employer_name=s.employer.name if s.employer else None,
            total_work_seconds=total_work_seconds,
            total_pause_seconds=total_pause_seconds
        ))
    
    return responses


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
        func.count(func.distinct(WorkSession.assignment_id)).label("total_sessions"),
        func.sum(WorkSession.duration_hours).label("total_hours"),
        func.sum(WorkSession.amount).label("total_amount"),
        WorkSession.currency
    ).where(
        and_(
            WorkSession.session_date >= start_date,
            WorkSession.session_date <= end_date,
            WorkSession.is_active == False,  # Только завершённые сессии
            WorkSession.session_type == "work"  # Только рабочие сегменты
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


@router.post("/{session_id}/pause", response_model=WorkSessionResponse)
async def pause_work_session(
    session_id: int,
    description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Pause active work session - ends current 'work' segment and starts 'pause' segment"""
    from utils.timezone import now_server
    
    # Get current session
    result = await db.execute(
        select(WorkSession).where(WorkSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")
    
    if session.session_type == "pause":
        raise HTTPException(status_code=400, detail="Session is already paused")
    
    now = now_server()
    
    # End current work session
    session.end_time = now.time()
    session.is_active = False
    start_dt = datetime.combine(session.session_date, session.start_time)
    end_dt = datetime.combine(session.session_date, session.end_time)
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    duration = (end_dt - start_dt).total_seconds() / 3600
    session.duration_hours = Decimal(str(round(duration, 2)))
    session.amount = session.duration_hours * session.hourly_rate
    if description:
        session.description = description
    
    # Start new pause session
    pause_session = WorkSession(
        worker_id=session.worker_id,
        employer_id=session.employer_id,
        session_date=now.date(),
        start_time=now.time(),
        hourly_rate=session.hourly_rate,
        currency=session.currency,
        is_active=True,
        session_type="pause",
        assignment_id=session.assignment_id  # Inherit assignment from parent
    )
    db.add(pause_session)
    
    await db.commit()
    await db.refresh(pause_session)
    
    # Get names
    worker = await db.execute(select(Contributor).where(Contributor.id == pause_session.worker_id))
    worker_name = worker.scalar_one_or_none()
    employer = await db.execute(select(Contributor).where(Contributor.id == pause_session.employer_id))
    employer_name = employer.scalar_one_or_none()
    
    return WorkSessionResponse(
        id=pause_session.id,
        worker_id=pause_session.worker_id,
        employer_id=pause_session.employer_id,
        session_date=pause_session.session_date,
        start_time=pause_session.start_time,
        end_time=pause_session.end_time,
        duration_hours=float(pause_session.duration_hours) if pause_session.duration_hours else None,
        hourly_rate=float(pause_session.hourly_rate),
        currency=pause_session.currency,
        amount=float(pause_session.amount) if pause_session.amount else None,
        is_active=pause_session.is_active,
        session_type=pause_session.session_type,
        description=pause_session.description,
        worker_name=worker_name.name if worker_name else None,
        employer_name=employer_name.name if employer_name else None
    )


@router.post("/{session_id}/resume", response_model=WorkSessionResponse)
async def resume_work_session(
    session_id: int,
    description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resume paused session - ends 'pause' segment and starts new 'work' segment"""
    from utils.timezone import now_server
    
    # Get current pause session
    result = await db.execute(
        select(WorkSession).where(WorkSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")
    
    if session.session_type != "pause":
        raise HTTPException(status_code=400, detail="Session is not paused - cannot resume")
    
    now = now_server()
    
    # End pause session (no payment created for pause)
    session.end_time = now.time()
    session.is_active = False
    start_dt = datetime.combine(session.session_date, session.start_time)
    end_dt = datetime.combine(session.session_date, session.end_time)
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    duration = (end_dt - start_dt).total_seconds() / 3600
    session.duration_hours = Decimal(str(round(duration, 2)))
    # No amount for pause
    session.amount = Decimal("0")
    if description:
        session.description = description
    
    # Start new work session
    work_session = WorkSession(
        worker_id=session.worker_id,
        employer_id=session.employer_id,
        session_date=now.date(),
        start_time=now.time(),
        hourly_rate=session.hourly_rate,
        currency=session.currency,
        is_active=True,
        session_type="work",
        assignment_id=session.assignment_id  # Inherit assignment from parent
    )
    db.add(work_session)
    
    await db.commit()
    await db.refresh(work_session)
    
    # Get names
    worker = await db.execute(select(Contributor).where(Contributor.id == work_session.worker_id))
    worker_name = worker.scalar_one_or_none()
    employer = await db.execute(select(Contributor).where(Contributor.id == work_session.employer_id))
    employer_name = employer.scalar_one_or_none()
    
    return WorkSessionResponse(
        id=work_session.id,
        worker_id=work_session.worker_id,
        employer_id=work_session.employer_id,
        session_date=work_session.session_date,
        start_time=work_session.start_time,
        end_time=work_session.end_time,
        duration_hours=float(work_session.duration_hours) if work_session.duration_hours else None,
        hourly_rate=float(work_session.hourly_rate),
        currency=work_session.currency,
        amount=float(work_session.amount) if work_session.amount else None,
        is_active=work_session.is_active,
        session_type=work_session.session_type,
        description=work_session.description,
        worker_name=worker_name.name if worker_name else None,
        employer_name=employer_name.name if employer_name else None
    )
