"""
API роутер для рабочих сессий (учёт времени)
Работает с моделями Assignment и Task.
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
from database.models import User, Assignment, Task, EmploymentRelation, Contributor, Payment, PaymentCategory, UserRole
from api.auth.oauth import get_current_user, get_user_contributor

router = APIRouter(prefix="/assignments", tags=["assignments"])


class WorkSessionStart(BaseModel):
    """Начало рабочей сессии"""
    worker_id: int
    employer_id: int
    description: Optional[str] = None


class WorkSessionResponse(BaseModel):
    id: int
    worker_id: int
    employer_id: int
    assignment_date: date
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
    assignment_date: date
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
    hourly_rate: float
    currency: str
    description: Optional[str] = None
    is_active: bool
    segments: List[WorkSessionResponse] = []  # Все сегменты (work + pause)


class WorkSessionUpdate(BaseModel):
    """Обновление рабочей сессии (устаревшее, для совместимости)"""
    assignment_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_hours: Optional[float] = None
    description: Optional[str] = None


class AssignmentUpdate(BaseModel):
    """Обновление Assignment"""
    assignment_date: Optional[date] = None
    hourly_rate: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    """Обновление Task"""
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    task_type: Optional[str] = None  # work или pause
    description: Optional[str] = None


def _task_to_response(task: Task, assignment: Assignment, 
                      worker_name: Optional[str] = None,
                      employer_name: Optional[str] = None,
                      total_work_seconds: Optional[int] = None,
                      total_pause_seconds: Optional[int] = None) -> WorkSessionResponse:
    """Преобразование Task в WorkSessionResponse для совместимости API"""
    return WorkSessionResponse(
        id=task.id,
        worker_id=assignment.worker_id,
        employer_id=assignment.employer_id,
        assignment_date=assignment.assignment_date,
        start_time=task.start_time,
        end_time=task.end_time,
        duration_hours=task.duration_hours if task.end_time else None,
        hourly_rate=float(assignment.hourly_rate),
        currency=assignment.currency,
        amount=float(task.amount) if task.end_time and task.task_type == "work" else None,
        is_active=task.end_time is None,
        session_type=task.task_type,
        assignment_id=assignment.id,
        description=task.description,
        worker_name=worker_name,
        employer_name=employer_name,
        total_work_seconds=total_work_seconds,
        total_pause_seconds=total_pause_seconds
    )


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
    
    # Проверяем, нет ли уже активной сессии (незавершённого task у активного assignment)
    result = await db.execute(
        select(Task).join(Assignment).where(
            and_(
                Assignment.worker_id == session_data.worker_id,
                Assignment.is_active == True,
                Task.end_time == None
            )
        )
    )
    active_task = result.scalar_one_or_none()
    
    if active_task:
        raise HTTPException(status_code=400, detail="У работника уже есть активная сессия")
    
    now = datetime.now()
    
    # Создаём Assignment
    new_assignment = Assignment(
        worker_id=session_data.worker_id,
        employer_id=session_data.employer_id,
        assignment_date=now.date(),
        hourly_rate=employment.hourly_rate,
        currency=employment.currency,
        description=session_data.description,  # Save description to assignment
        is_active=True
    )
    db.add(new_assignment)
    await db.flush()  # Получаем ID
    
    # Создаём первый Task
    new_task = Task(
        assignment_id=new_assignment.id,
        start_time=now.time(),
        task_type="work",
        description=session_data.description
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    await db.refresh(new_assignment)
    
    # Загружаем имена участников
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.employer))
        .where(Assignment.id == new_assignment.id)
    )
    assignment = result.scalar_one()
    
    return _task_to_response(
        new_task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )


@router.post("/{session_id}/stop", response_model=WorkSessionResponse)
async def stop_work_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Завершить рабочую сессию и создать платёж"""
    # session_id это ID Task'а
    result = await db.execute(
        select(Task)
        .options(joinedload(Task.assignment).joinedload(Assignment.worker),
                 joinedload(Task.assignment).joinedload(Assignment.employer))
        .where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    if task.end_time is not None:
        raise HTTPException(status_code=400, detail="Сессия уже завершена")
    
    assignment = task.assignment
    now = datetime.now()
    task.end_time = now.time()
    
    # Закрываем Assignment
    assignment.is_active = False
    
    # Рассчитываем общую сумму по всем work-tasks
    result = await db.execute(
        select(Task).where(Task.assignment_id == assignment.id)
    )
    all_tasks = result.scalars().all()
    
    total_amount = Decimal(0)
    for t in all_tasks:
        if t.task_type == "work":
            total_amount += t.amount
    
    # Создаём платёж только если сумма > 0
    if total_amount > 0:
        payment = Payment(
            payer_id=assignment.employer_id,
            recipient_id=assignment.worker_id,
            category_id=3,  # Зарплата
            amount=total_amount,
            currency=assignment.currency,
            description=f"Оплата за работу {assignment.assignment_date}",
            payment_date=now,
            is_paid=False,
            assignment_id=assignment.id
        )
        db.add(payment)
    await db.commit()
    await db.refresh(task)
    
    return _task_to_response(
        task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )


class SwitchTaskRequest(BaseModel):
    """Переключение на новое задание"""
    description: Optional[str] = None


@router.post("/{assignment_id}/switch-task", response_model=WorkSessionResponse)
async def switch_task(
    assignment_id: int,
    request: SwitchTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Завершить текущее задание и начать новое в той же смене"""
    # Находим assignment
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.employer))
        .where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    
    if not assignment.is_active:
        raise HTTPException(status_code=400, detail="Смена уже завершена")
    
    # Проверка прав
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на эту смену")
    
    # Закрываем текущий активный task
    result = await db.execute(
        select(Task).where(
            and_(Task.assignment_id == assignment_id, Task.end_time == None)
        )
    )
    current_task = result.scalar_one_or_none()
    
    now = datetime.now()
    if current_task:
        current_task.end_time = now.time()
    
    # Создаём новый work task
    new_task = Task(
        assignment_id=assignment_id,
        start_time=now.time(),
        task_type="work",
        description=request.description
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    return _task_to_response(
        new_task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )

@router.put("/{session_id}", response_model=WorkSessionResponse)
async def update_work_session(
    session_id: int,
    update_data: WorkSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Редактировать рабочую сессию (Task)"""
    
    result = await db.execute(
        select(Task)
        .options(joinedload(Task.assignment).joinedload(Assignment.worker),
                 joinedload(Task.assignment).joinedload(Assignment.employer))
        .where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    assignment = task.assignment
    
    # Проверка прав: пользователь может редактировать только свои сессии
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на редактирование этой сессии")
    
    # Готовим новые значения
    new_start = update_data.start_time if update_data.start_time is not None else task.start_time
    new_end = update_data.end_time if update_data.end_time is not None else task.end_time
    
    # Хелпер для сравнения времени в минутах (игнорируем секунды)
    def to_minutes(t: time) -> int:
        return t.hour * 60 + t.minute
    
    # Валидация: конец должен быть после начала
    if new_end is not None and to_minutes(new_end) <= to_minutes(new_start):
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")
    
    # Валидация: проверяем пересечение с другими tasks в assignment
    result = await db.execute(
        select(Task).where(
            Task.assignment_id == assignment.id,
            Task.id != session_id
        )
    )
    other_tasks = result.scalars().all()
    
    new_start_min = to_minutes(new_start)
    new_end_min = to_minutes(new_end) if new_end else 24 * 60  # До конца дня
    
    for other in other_tasks:
        other_start_min = to_minutes(other.start_time)
        other_end_min = to_minutes(other.end_time) if other.end_time else 24 * 60
        
        # Строгое пересечение: (start1 < end2) AND (end1 > start2)
        # Смежные интервалы НЕ считаются пересекающимися
        if new_start_min < other_end_min and new_end_min > other_start_min:
            raise HTTPException(
                status_code=400, 
                detail=f"Время пересекается с другим сегментом ({other.start_time.strftime('%H:%M')}-{other.end_time.strftime('%H:%M') if other.end_time else '...'})"
            )
    
    # Обновляем поля Task
    if update_data.start_time is not None:
        task.start_time = update_data.start_time
    if update_data.end_time is not None:
        task.end_time = update_data.end_time
    if update_data.description is not None:
        task.description = update_data.description
    
    # Обновляем поля Assignment
    if update_data.assignment_date is not None:
        assignment.assignment_date = update_data.assignment_date
    
    await db.commit()
    await db.refresh(task)
    
    return _task_to_response(
        task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )


@router.delete("/{session_id}")
async def delete_work_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить рабочую сессию (Task или весь Assignment)"""
    
    result = await db.execute(
        select(Task)
        .options(
            joinedload(Task.assignment).joinedload(Assignment.payment)
        )
        .where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    assignment = task.assignment
    
    # Проверка прав
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление этой сессии")
    
    # Проверяем связанный платёж
    if assignment.payment:
        if assignment.payment.is_paid:
            raise HTTPException(
                status_code=400, 
                detail="Невозможно удалить сессию: платёж уже оплачен"
            )
        # Удаляем неоплаченный платёж
        await db.delete(assignment.payment)
    
    # Проверяем, это единственный task в assignment?
    result = await db.execute(
        select(func.count(Task.id)).where(Task.assignment_id == assignment.id)
    )
    task_count = result.scalar()
    
    if task_count == 1:
        # Удаляем весь assignment вместе с task
        await db.delete(task)
        await db.delete(assignment)
    else:
        # Удаляем только task
        await db.delete(task)
    
    await db.commit()
    
    return {"message": "Сессия удалена"}


@router.put("/assignment/{assignment_id}")
async def update_assignment(
    assignment_id: int,
    update_data: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить Assignment (дату, ставку, валюту, описание)"""
    
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment не найден")
    
    # Проверка прав
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на редактирование")
    
    # Обновляем поля
    if update_data.assignment_date is not None:
        assignment.assignment_date = update_data.assignment_date
    if update_data.hourly_rate is not None:
        assignment.hourly_rate = Decimal(str(update_data.hourly_rate))
    if update_data.currency is not None:
        assignment.currency = update_data.currency
    if update_data.description is not None:
        assignment.description = update_data.description
    
    await db.commit()
    
    return {"message": "Assignment обновлён", "id": assignment_id}


@router.delete("/assignment/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить весь Assignment со всеми tasks и payment"""
    
    result = await db.execute(
        select(Assignment)
        .options(
            joinedload(Assignment.tasks),
            joinedload(Assignment.payment)
        )
        .where(Assignment.id == assignment_id)
    )
    assignment = result.unique().scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment не найден")
    
    # Проверка прав
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление")
    
    # Проверяем платёж
    if assignment.payment and assignment.payment.is_paid:
        raise HTTPException(
            status_code=400,
            detail="Невозможно удалить: платёж уже оплачен"
        )
    
    # Удаляем платёж если есть
    if assignment.payment:
        await db.delete(assignment.payment)
    
    # Удаляем все tasks
    for task in assignment.tasks:
        await db.delete(task)
    
    # Удаляем assignment
    await db.delete(assignment)
    
    await db.commit()
    
    return {"message": "Assignment удалён", "id": assignment_id}


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: int,
    update_data: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить Task (время начала/конца, тип, описание)"""
    
    result = await db.execute(
        select(Task).options(joinedload(Task.assignment)).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task не найден")
    
    assignment = task.assignment
    
    # Проверка прав
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if not user_contributor or assignment.worker_id != user_contributor.id:
            raise HTTPException(status_code=403, detail="Нет прав на редактирование")
    
    # Готовим новые значения
    new_start = update_data.start_time if update_data.start_time is not None else task.start_time
    new_end = update_data.end_time if update_data.end_time is not None else task.end_time
    
    # Хелпер для сравнения времени в минутах (игнорируем секунды)
    def to_minutes(t: time) -> int:
        return t.hour * 60 + t.minute
    
    # Валидация: конец должен быть после начала
    if new_end is not None and to_minutes(new_end) <= to_minutes(new_start):
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")
    
    # Валидация: проверяем пересечение с другими tasks в assignment
    result = await db.execute(
        select(Task).where(
            Task.assignment_id == assignment.id,
            Task.id != task_id
        )
    )
    other_tasks = result.scalars().all()
    
    new_start_min = to_minutes(new_start)
    new_end_min = to_minutes(new_end) if new_end else 24 * 60
    
    for other in other_tasks:
        other_start_min = to_minutes(other.start_time)
        other_end_min = to_minutes(other.end_time) if other.end_time else 24 * 60
        
        # Строгое пересечение: смежные интервалы НЕ считаются пересекающимися
        if new_start_min < other_end_min and new_end_min > other_start_min:
            raise HTTPException(
                status_code=400, 
                detail=f"Время пересекается с другим сегментом ({other.start_time.strftime('%H:%M')}-{other.end_time.strftime('%H:%M') if other.end_time else '...'})"
            )
    
    # Обновляем поля
    if update_data.start_time is not None:
        task.start_time = update_data.start_time
    if update_data.end_time is not None:
        task.end_time = update_data.end_time
    if update_data.task_type is not None:
        if update_data.task_type not in ["work", "pause"]:
            raise HTTPException(status_code=400, detail="task_type должен быть 'work' или 'pause'")
        task.task_type = update_data.task_type
    if update_data.description is not None:
        task.description = update_data.description
    
    await db.commit()
    
    return {"message": "Task обновлён", "id": task_id}


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
            return []
    
    query = select(Task).join(Assignment).options(
        joinedload(Task.assignment).joinedload(Assignment.worker),
        joinedload(Task.assignment).joinedload(Assignment.employer)
    )
    
    if worker_id:
        query = query.where(Assignment.worker_id == worker_id)
    if employer_id:
        query = query.where(Assignment.employer_id == employer_id)
    if start_date:
        query = query.where(Assignment.assignment_date >= start_date)
    if end_date:
        query = query.where(Assignment.assignment_date <= end_date)
    if is_active is not None:
        if is_active:
            query = query.where(Task.end_time == None)
        else:
            query = query.where(Task.end_time != None)
    
    query = query.order_by(Assignment.assignment_date.desc(), Task.start_time.desc())
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [
        _task_to_response(
            t, t.assignment,
            worker_name=t.assignment.worker.name if t.assignment.worker else None,
            employer_name=t.assignment.employer.name if t.assignment.employer else None
        )
        for t in tasks
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
    
    # Get all assignments in date range
    query = select(Assignment).options(
        joinedload(Assignment.worker), 
        joinedload(Assignment.employer),
        joinedload(Assignment.tasks)
    ).where(
        Assignment.assignment_date >= start_date
    ).order_by(Assignment.assignment_date.desc(), Assignment.id.desc())
    
    if worker_id:
        query = query.where(Assignment.worker_id == worker_id)
    if employer_id:
        query = query.where(Assignment.employer_id == employer_id)
    
    # Auto-filter for non-admins
    if current_user.role != UserRole.ADMIN:
        user_contributor = await get_user_contributor(current_user, db)
        if user_contributor:
            query = query.where(Assignment.worker_id == user_contributor.id)
    
    result = await db.execute(query)
    assignments = result.scalars().unique().all()
    
    responses = []
    for assignment in assignments[:limit]:
        tasks = sorted(assignment.tasks, key=lambda t: (t.start_time, t.id))
        if not tasks:
            continue
        
        # Calculate totals
        total_work_seconds = 0
        total_pause_seconds = 0
        total_amount = 0.0
        is_active = assignment.is_active
        
        for task in tasks:
            if task.end_time:
                seg_seconds = task.duration_seconds
            elif task.end_time is None:
                # Active task
                start_dt = datetime.combine(assignment.assignment_date, task.start_time)
                seg_seconds = int((now - start_dt).total_seconds())
            else:
                seg_seconds = 0
            
            if task.task_type == "work":
                total_work_seconds += seg_seconds
                if task.end_time:
                    total_amount += float(task.amount)
            else:
                total_pause_seconds += seg_seconds
        
        first_task = tasks[0]
        last_task = tasks[-1]
        
        # Segments in descending order (newest first), stable sort by (start_time, id)
        segment_responses = [
            _task_to_response(
                task, assignment,
                worker_name=assignment.worker.name if assignment.worker else None,
                employer_name=assignment.employer.name if assignment.employer else None
            )
            for task in sorted(tasks, key=lambda t: (t.start_time, t.id), reverse=True)
        ]
        
        responses.append(AssignmentResponse(
            assignment_id=assignment.id,
            assignment_date=assignment.assignment_date,
            worker_id=assignment.worker_id,
            worker_name=assignment.worker.name if assignment.worker else None,
            employer_id=assignment.employer_id,
            employer_name=assignment.employer.name if assignment.employer else None,
            start_time=first_task.start_time,
            end_time=last_task.end_time if not is_active else None,
            total_work_seconds=total_work_seconds,
            total_pause_seconds=total_pause_seconds,
            total_hours=round(total_work_seconds / 3600, 2),
            total_amount=total_amount,
            hourly_rate=float(assignment.hourly_rate),
            currency=assignment.currency,
            description=assignment.description,
            is_active=is_active,
            segments=segment_responses
        ))
    
    return responses


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
    
    query = select(Task).join(Assignment).options(
        joinedload(Task.assignment).joinedload(Assignment.worker),
        joinedload(Task.assignment).joinedload(Assignment.employer),
        joinedload(Task.assignment).joinedload(Assignment.tasks)
    ).where(Task.end_time == None)
    
    if user_contributor:
        query = query.where(Assignment.worker_id == user_contributor.id)
    
    result = await db.execute(query)
    active_tasks = result.scalars().unique().all()
    
    from utils.timezone import now_server
    now = now_server()
    
    responses = []
    for task in active_tasks:
        assignment = task.assignment
        
        # Calculate aggregated times for this assignment
        total_work_seconds = 0
        total_pause_seconds = 0
        
        for t in assignment.tasks:
            if t.end_time:
                seg_seconds = t.duration_seconds
            elif t.id == task.id:
                # Current running task
                start_dt = datetime.combine(assignment.assignment_date, t.start_time)
                seg_seconds = int((now - start_dt).total_seconds())
            else:
                seg_seconds = 0
            
            if t.task_type == "work":
                total_work_seconds += seg_seconds
            else:
                total_pause_seconds += seg_seconds
        
        responses.append(_task_to_response(
            task, assignment,
            worker_name=assignment.worker.name if assignment.worker else None,
            employer_name=assignment.employer.name if assignment.employer else None,
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
    
    # Query completed work tasks with their assignments
    query = select(
        func.count(func.distinct(Assignment.id)).label("total_sessions"),
        Assignment.currency
    ).join(Task).where(
        and_(
            Assignment.assignment_date >= start_date,
            Assignment.assignment_date <= end_date,
            Assignment.is_active == False,
            Task.task_type == "work",
            Task.end_time != None
        )
    ).group_by(Assignment.currency)
    
    if worker_id:
        query = query.where(Assignment.worker_id == worker_id)
    if employer_id:
        query = query.where(Assignment.employer_id == employer_id)
    
    result = await db.execute(query)
    rows = result.all()
    
    summaries = []
    for row in rows:
        # Get total hours and amount for this currency
        hours_query = select(
            func.sum(
                (func.julianday(
                    func.datetime(Assignment.assignment_date, Task.end_time)
                ) - func.julianday(
                    func.datetime(Assignment.assignment_date, Task.start_time)
                )) * 24
            ).label("total_hours")
        ).select_from(Task).join(Assignment).where(
            and_(
                Assignment.assignment_date >= start_date,
                Assignment.assignment_date <= end_date,
                Assignment.is_active == False,
                Task.task_type == "work",
                Task.end_time != None,
                Assignment.currency == row.currency
            )
        )
        
        if worker_id:
            hours_query = hours_query.where(Assignment.worker_id == worker_id)
        if employer_id:
            hours_query = hours_query.where(Assignment.employer_id == employer_id)
        
        hours_result = await db.execute(hours_query)
        hours_row = hours_result.one()
        
        # Calculate total amount from payments for assignments
        amount_query = select(
            func.sum(Payment.amount).label("total_amount")
        ).select_from(Payment).join(
            Assignment, Assignment.id == Payment.assignment_id
        ).where(
            and_(
                Assignment.assignment_date >= start_date,
                Assignment.assignment_date <= end_date,
                Assignment.currency == row.currency
            )
        )
        
        if worker_id:
            amount_query = amount_query.where(Assignment.worker_id == worker_id)
        if employer_id:
            amount_query = amount_query.where(Assignment.employer_id == employer_id)
        
        amount_result = await db.execute(amount_query)
        amount_row = amount_result.one()
        
        summaries.append(WorkSessionSummary(
            period_start=start_date,
            period_end=end_date,
            total_sessions=row.total_sessions or 0,
            total_hours=float(hours_row.total_hours) if hours_row.total_hours else 0,
            total_amount=float(amount_row.total_amount) if amount_row.total_amount else 0,
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
    """Pause active work session - ends current 'work' task and starts 'pause' task"""
    from utils.timezone import now_server
    
    # session_id is Task ID
    result = await db.execute(
        select(Task).options(joinedload(Task.assignment)).where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if task.end_time is not None:
        raise HTTPException(status_code=400, detail="Session is not active")
    
    if task.task_type == "pause":
        raise HTTPException(status_code=400, detail="Session is already paused")
    
    now = now_server()
    assignment = task.assignment
    
    # End current work task
    task.end_time = now.time()
    if description:
        task.description = description
    
    # Start new pause task
    pause_task = Task(
        assignment_id=assignment.id,
        start_time=now.time(),
        task_type="pause"
    )
    db.add(pause_task)
    
    await db.commit()
    await db.refresh(pause_task)
    
    # Get names
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.employer))
        .where(Assignment.id == assignment.id)
    )
    assignment = result.scalar_one()
    
    return _task_to_response(
        pause_task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )


@router.post("/{session_id}/resume", response_model=WorkSessionResponse)
async def resume_work_session(
    session_id: int,
    description: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Resume paused session - ends 'pause' task and starts new 'work' task"""
    from utils.timezone import now_server
    
    # session_id is Task ID
    result = await db.execute(
        select(Task).options(joinedload(Task.assignment)).where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if task.end_time is not None:
        raise HTTPException(status_code=400, detail="Session is not active")
    
    if task.task_type != "pause":
        raise HTTPException(status_code=400, detail="Session is not paused - cannot resume")
    
    now = now_server()
    assignment = task.assignment
    
    # End pause task
    task.end_time = now.time()
    if description:
        task.description = description
    
    # Start new work task
    work_task = Task(
        assignment_id=assignment.id,
        start_time=now.time(),
        task_type="work"
    )
    db.add(work_task)
    
    await db.commit()
    await db.refresh(work_task)
    
    # Get names
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.employer))
        .where(Assignment.id == assignment.id)
    )
    assignment = result.scalar_one()
    
    return _task_to_response(
        work_task, assignment,
        worker_name=assignment.worker.name if assignment.worker else None,
        employer_name=assignment.employer.name if assignment.employer else None
    )
