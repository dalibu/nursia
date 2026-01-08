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
from database.models import User, Assignment, Task, EmploymentRelation, Payment, PaymentCategory, AssignmentType
from api.auth.oauth import get_current_user

router = APIRouter(prefix="/assignments", tags=["assignments"])


class WorkSessionStart(BaseModel):
    """Начало рабочей сессии"""
    worker_id: int
    employer_id: int
    description: Optional[str] = None
    task_description: Optional[str] = None  # For first task, if different from assignment


class WorkSessionResponse(BaseModel):
    id: int
    worker_id: int
    employer_id: int
    start_time: datetime  # Полная дата+время
    end_time: Optional[datetime] = None  # Полная дата+время
    duration_hours: Optional[float] = None
    hourly_rate: Optional[float] = None  # Из employment_relations
    currency: Optional[str] = None
    amount: Optional[float] = None
    is_active: bool
    session_type: str = "work"
    assignment_id: Optional[int] = None
    description: Optional[str] = None
    worker_name: Optional[str] = None
    employer_name: Optional[str] = None
    tracking_nr: Optional[str] = None  # Task tracking number
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
    tracking_nr: str
    assignment_type: str = "work"  # work, sick_leave, vacation, day_off, unpaid_leave
    assignment_date: Optional[date] = None  # Вычисляется из tasks.start_time
    worker_id: int
    worker_name: Optional[str] = None
    employer_id: int
    employer_name: Optional[str] = None
    start_time: Optional[datetime] = None  # Начало первого task (полная дата+время)
    end_time: Optional[datetime] = None  # Конец последнего task (полная дата+время)
    total_work_seconds: int
    total_pause_seconds: int
    total_hours: float
    total_amount: float
    hourly_rate: Optional[float] = None  # Из employment_relations
    currency: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    payment_id: Optional[int] = None  # Linked payment ID
    payment_tracking_nr: Optional[str] = None  # Linked payment tracking number
    payment_status: Optional[str] = None  # Payment status: unpaid, paid
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
    assignment_type: Optional[str] = None
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    """Обновление Task"""
    start_time: Optional[datetime] = None  # Полная дата+время
    end_time: Optional[datetime] = None  # Полная дата+время
    task_type: Optional[str] = None  # work или pause
    description: Optional[str] = None


class ManualTaskCreate(BaseModel):
    """Задание для ручного создания смены"""
    start_time: datetime  # Полная дата+время
    end_time: datetime  # Полная дата+время
    task_type: str = "work"  # work или pause
    description: Optional[str] = None


class ManualAssignmentCreate(BaseModel):
    """Ручное создание смены"""
    worker_id: int
    assignment_type: str = "work"  # work, sick_leave, vacation, day_off, unpaid_leave
    description: Optional[str] = None
    tasks: List[ManualTaskCreate] = []  # Пустой для не-work типов


class TimeOffCreate(BaseModel):
    """Создание записи отсутствия (отпуск, больничный и т.д.) — один assignment с одним task"""
    worker_id: int
    assignment_type: str  # sick_leave, vacation, day_off, unpaid_leave
    start_time: datetime  # Начало периода (полная дата+время)
    end_time: datetime  # Конец периода (полная дата+время)
    description: Optional[str] = None


class ManualAssignmentResponse(BaseModel):
    """Ответ на ручное создание смены"""
    assignment_id: int
    tracking_nr: str
    assignment_type: str = "work"
    payment_id: Optional[int] = None
    payment_tracking_nr: Optional[str] = None
    total_hours: float
    total_amount: float
    currency: str


def _task_to_response(task: Task, assignment: Assignment, 
                      worker_name: Optional[str] = None,
                      employer_name: Optional[str] = None,
                      hourly_rate: Optional[float] = None,
                      currency: Optional[str] = None,
                      total_work_seconds: Optional[int] = None,
                      total_pause_seconds: Optional[int] = None) -> WorkSessionResponse:
    """Преобразование Task в WorkSessionResponse для совместимости API"""
    # Calculate amount if task is completed and is work type
    amount = None
    if task.end_time and task.task_type == "work" and hourly_rate:
        amount = task.duration_hours * hourly_rate
    
    return WorkSessionResponse(
        id=task.id,
        worker_id=assignment.user_id,
        employer_id=assignment.user_id,
        start_time=task.start_time,
        end_time=task.end_time,
        duration_hours=task.duration_hours if task.end_time else None,
        hourly_rate=hourly_rate,
        currency=currency,
        amount=amount,
        is_active=task.end_time is None,
        session_type=task.task_type,
        assignment_id=assignment.id,
        description=task.description,
        worker_name=worker_name,
        employer_name=employer_name,
        tracking_nr=task.tracking_nr,
        total_work_seconds=total_work_seconds,
        total_pause_seconds=total_pause_seconds
    )

# Метки типов для отображения
ASSIGNMENT_TYPE_LABELS = {
    AssignmentType.WORK: "Смена",
    AssignmentType.SICK_LEAVE: "Больничный",
    AssignmentType.VACATION: "Отпуск",
    AssignmentType.DAY_OFF: "Отгул",
    AssignmentType.UNPAID_LEAVE: "Отпуск б/с",
}


@router.get("/types")
async def get_assignment_types():
    """Получить список типов записей/смен из enum"""
    return [
        {
            "value": t.value,
            "label": ASSIGNMENT_TYPE_LABELS.get(t, t.value)
        }
        for t in AssignmentType
    ]


@router.post("/start", response_model=WorkSessionResponse)
async def start_work_session(
    session_data: WorkSessionStart,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Начать новую рабочую сессию"""
    
    # Определяем worker_id: для работников — всегда свой id
    target_worker_id = session_data.worker_id
    
    # Проверка прав: работник может начать смену только для себя
    if not current_user.is_admin:
        if target_worker_id != current_user.id:
            raise HTTPException(status_code=403, detail="Вы можете начать смену только для себя")
        target_worker_id = current_user.id
    
    # Проверяем, есть ли активное трудовое отношение для работника
    result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.user_id == target_worker_id,
                EmploymentRelation.is_active == True
            )
        )
    )
    employment = result.scalar_one_or_none()
    
    if not employment:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    # Проверяем, нет ли уже активной сессии (незавершённого task)
    result = await db.execute(
        select(Task).join(Assignment).where(
            and_(
                Assignment.user_id == target_worker_id,
                Task.end_time == None
            )
        )
    )
    active_task = result.scalar_one_or_none()
    
    if active_task:
        raise HTTPException(status_code=400, detail="У работника уже есть активная сессия")
    
    now = datetime.now()
    
    # Создаём Assignment (без assignment_date, hourly_rate, currency, is_active)
    new_assignment = Assignment(
        user_id=target_worker_id,
        description=session_data.description
    )
    db.add(new_assignment)
    await db.flush()  # Получаем ID
    
    # Generate tracking number using assignment ID
    from utils.tracking import format_assignment_tracking_nr
    new_assignment.tracking_nr = format_assignment_tracking_nr(new_assignment.id)
    
    # Создаём первый Task с полным datetime
    new_task = Task(
        assignment_id=new_assignment.id,
        start_time=now,  # Теперь полная дата+время
        task_type="work",
        description=session_data.task_description or session_data.description
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    await db.refresh(new_assignment)
    
    # Загружаем worker и employment relationship
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker))
        .where(Assignment.id == new_assignment.id)
    )
    assignment = result.scalar_one()
    
    return_response = _task_to_response(
        new_task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=None,
        hourly_rate=float(employment.hourly_rate),
        currency=employment.currency
    )
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([target_worker_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "assignment_started",
        "assignment_id": new_assignment.id,
        "user_id": target_worker_id
    }, user_ids=target_users)
    
    return return_response


@router.post("/manual", response_model=ManualAssignmentResponse)
async def create_manual_assignment(
    data: ManualAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать смену вручную (завершённую) с автоматическим созданием платежа"""
    
    target_worker_id = data.worker_id
    
    # Проверка прав: работник может создать смену только для себя
    if not current_user.is_admin:
        if target_worker_id != current_user.id:
            raise HTTPException(status_code=403, detail="Вы можете создать смену только для себя")
        target_worker_id = current_user.id
    
    # Валидация типа записи
    valid_types = ["work", "sick_leave", "vacation", "day_off", "unpaid_leave"]
    if data.assignment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Недопустимый тип записи. Допустимые: {', '.join(valid_types)}")
    
    # Для обычных рабочих смен нужны задания
    is_time_off = data.assignment_type != "work"
    
    if not is_time_off:
        # Проверяем наличие заданий для рабочих смен
        if not data.tasks or len(data.tasks) == 0:
            raise HTTPException(status_code=400, detail="Необходимо указать хотя бы одно задание")
        
        # Валидация заданий: проверка времени (теперь datetime)
        for i, task in enumerate(data.tasks):
            if task.end_time <= task.start_time:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Задание #{i+1}: время окончания должно быть позже времени начала"
                )
            if task.task_type not in ["work", "pause"]:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Задание #{i+1}: тип должен быть 'work' или 'pause'"
                )
        
        # Проверка пересечений между заданиями внутри смены
        for i, task1 in enumerate(data.tasks):
            for j, task2 in enumerate(data.tasks):
                if i >= j:
                    continue
                # Пересечение: (start1 < end2) AND (end1 > start2)
                if task1.start_time < task2.end_time and task1.end_time > task2.start_time:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Задания #{i+1} и #{j+1} пересекаются по времени"
                    )
    
    # Проверяем, есть ли активное трудовое отношение для работника
    result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.user_id == target_worker_id,
                EmploymentRelation.is_active == True
            )
        )
    )
    employment = result.scalar_one_or_none()
    
    if not employment:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    # Получаем ставку и валюту из employment
    hourly_rate = employment.hourly_rate
    currency = employment.currency
    
    # Проверка пересечений с существующими сменами (для work типов)
    if not is_time_off and data.tasks:
        # Получаем диапазон новой смены
        new_tasks_sorted = sorted(data.tasks, key=lambda t: t.start_time)
        new_shift_start = new_tasks_sorted[0].start_time
        new_shift_end = new_tasks_sorted[-1].end_time
        
        # Находим существующие assignments в том же временном диапазоне
        result = await db.execute(
            select(Assignment)
            .options(joinedload(Assignment.tasks))
            .join(Task)
            .where(
                and_(
                    Assignment.user_id == target_worker_id,
                    Assignment.assignment_type == "work",
                    # Check if any tasks overlap with our time range
                    Task.start_time < new_shift_end,
                    Task.end_time > new_shift_start
                )
            )
        )
        existing_assignments = result.unique().scalars().all()
        
        for existing in existing_assignments:
            if not existing.tasks:
                continue
            existing_tasks_sorted = sorted(existing.tasks, key=lambda t: t.start_time)
            existing_start = existing_tasks_sorted[0].start_time
            existing_end = existing_tasks_sorted[-1].end_time if existing_tasks_sorted[-1].end_time else datetime.now()
            
            # Проверяем пересечение
            if new_shift_start < existing_end and new_shift_end > existing_start:
                raise HTTPException(
                    status_code=400,
                    detail=f"Смена пересекается с существующей {existing.tracking_nr} ({existing_start.strftime('%d.%m %H:%M')}-{existing_end.strftime('%H:%M')})'"
                )
    
    # Создаём Assignment (без удалённых полей)
    new_assignment = Assignment(
        user_id=target_worker_id,
        assignment_type=data.assignment_type,
        description=data.description
    )
    db.add(new_assignment)
    await db.flush()
    
    # Generate tracking number
    from utils.tracking import format_assignment_tracking_nr
    new_assignment.tracking_nr = format_assignment_tracking_nr(new_assignment.id)
    
    # Создаём Tasks
    total_work_seconds = 0
    for task_data in data.tasks:
        new_task = Task(
            assignment_id=new_assignment.id,
            start_time=task_data.start_time,  # Now full datetime
            end_time=task_data.end_time,  # Now full datetime
            task_type=task_data.task_type,
            description=task_data.description
        )
        db.add(new_task)
        
        # Считаем рабочее время
        if task_data.task_type == "work":
            duration = task_data.end_time - task_data.start_time
            total_work_seconds += int(duration.total_seconds())
    
    # Рассчитываем сумму
    total_hours = total_work_seconds / 3600
    total_amount = Decimal(str(total_hours)) * hourly_rate
    
    # Создаём платёж если сумма > 0
    payment = None
    if total_amount > 0:
        # Собираем комментарии
        comments = []
        if data.description:
            comments.append(data.description)
        for task_data in data.tasks:
            if task_data.description and task_data.description not in comments:
                comments.append(task_data.description)
        
        joined_comments = ", ".join(comments)
        full_description = f"Смена {new_assignment.tracking_nr}"
        if joined_comments:
            full_description += f": {joined_comments}"
        if len(full_description) > 500:
            full_description = full_description[:497] + "..."
        
        from utils.tracking import format_payment_tracking_nr
        from database.models import Role, PaymentCategoryGroup, PaymentGroupCode
        
        # Get employer (user with employer role)
        employer_result = await db.execute(
            select(User).join(User.roles).where(Role.name == "employer")
        )
        employer = employer_result.scalar_one_or_none()
        payer_id = employer.id if employer else target_worker_id
        
        # Find salary category
        salary_cat_result = await db.execute(
            select(PaymentCategory).join(PaymentCategoryGroup).where(
                PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value
            )
        )
        salary_category = salary_cat_result.scalar_one_or_none()
        if not salary_category:
            raise HTTPException(status_code=500, detail="Категория зарплаты не найдена")
        
        # Payment date = first task's start_time
        first_task = data.tasks[0] if data.tasks else None
        payment_date = first_task.start_time if first_task else datetime.now()
        
        payment = Payment(
            payer_id=payer_id,
            recipient_id=target_worker_id,
            category_id=salary_category.id,
            amount=total_amount,
            currency=currency,
            description=full_description,
            payment_date=payment_date,
            payment_status='unpaid',
            assignment_id=new_assignment.id
        )
        db.add(payment)
        await db.flush()
        payment.tracking_nr = format_payment_tracking_nr(payment.id)
    
    await db.commit()
    await db.refresh(new_assignment)
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([target_worker_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "assignment_started",
        "assignment_id": new_assignment.id,
        "user_id": target_worker_id
    }, user_ids=target_users)
    
    if payment:
        await manager.broadcast({
            "type": "payment_created",
            "payment_id": payment.id,
            "payer_id": payment.payer_id,
            "recipient_id": payment.recipient_id
        }, user_ids=target_users)
    
    return ManualAssignmentResponse(
        assignment_id=new_assignment.id,
        tracking_nr=new_assignment.tracking_nr,
        assignment_type=new_assignment.assignment_type,
        payment_id=payment.id if payment else None,
        payment_tracking_nr=payment.tracking_nr if payment else None,
        total_hours=total_hours,
        total_amount=float(total_amount),
        currency=currency
    )


class TimeOffResponse(BaseModel):
    """Ответ на создание записей отсутствия"""
    created_count: int
    assignments: List[ManualAssignmentResponse]
    skipped_dates: List[str] = []


class BulkDeleteRequest(BaseModel):
    """Запрос на массовое удаление"""
    ids: List[int]


class BulkDeleteResponse(BaseModel):
    """Ответ на массовое удаление"""
    deleted_count: int
    failed_ids: List[int] = []
    errors: List[str] = []  # Даты, которые были пропущены (уже существуют)


@router.post("/time-off", response_model=TimeOffResponse)
async def create_time_off(
    data: TimeOffCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Создать записи отсутствия (отпуск, больничный и т.д.) на диапазон дат"""
    
    target_worker_id = data.worker_id
    
    # Проверка прав
    if not current_user.is_admin:
        if target_worker_id != current_user.id:
            raise HTTPException(status_code=403, detail="Вы можете создать запись только для себя")
        target_worker_id = current_user.id
    
    # Валидация типа записи
    valid_types = ["sick_leave", "vacation", "day_off", "unpaid_leave"]
    if data.assignment_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Для данного endpoint допустимые типы: {', '.join(valid_types)}")
    
    # Проверка времени
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="Время окончания должно быть позже времени начала")
    
    # Ограничение на продолжительность (защита от случайных ошибок)
    duration = data.end_time - data.start_time
    if duration.days > 365:
        raise HTTPException(status_code=400, detail="Максимальный период: 365 дней")
    
    # Проверяем трудовые отношения
    result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.user_id == target_worker_id,
                EmploymentRelation.is_active == True
            )
        )
    )
    employment = result.scalar_one_or_none()
    if not employment:
        raise HTTPException(status_code=404, detail="Трудовые отношения не найдены")
    
    hourly_rate = employment.hourly_rate
    currency = employment.currency
    
    # Проверяем пересечение с существующими записями того же типа
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.tasks))
        .join(Task)
        .where(
            and_(
                Assignment.user_id == target_worker_id,
                Assignment.assignment_type == data.assignment_type,
                # Пересечение временных диапазонов
                Task.start_time < data.end_time,
                Task.end_time > data.start_time
            )
        )
    )
    existing = result.scalars().first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Запись типа '{data.assignment_type}' уже существует и пересекается с указанным периодом"
        )
    
    # Создаём один Assignment с одним Task на весь период
    from utils.tracking import format_assignment_tracking_nr
    
    new_assignment = Assignment(
        user_id=target_worker_id,
        assignment_type=data.assignment_type,
        description=data.description
    )
    db.add(new_assignment)
    await db.flush()
    new_assignment.tracking_nr = format_assignment_tracking_nr(new_assignment.id)
    
    # Создаём Task на весь период
    new_task = Task(
        assignment_id=new_assignment.id,
        start_time=data.start_time,
        end_time=data.end_time,
        task_type="work",  # Time-off uses work type for the task
        description=data.description
    )
    db.add(new_task)
    
    await db.commit()
    await db.refresh(new_assignment)
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([target_worker_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "assignment_started",
        "assignment_id": new_assignment.id,
        "user_id": target_worker_id
    }, user_ids=target_users)
    
    # Calculate hours for response
    total_hours = duration.total_seconds() / 3600
    total_amount = float(hourly_rate) * total_hours if data.assignment_type != "unpaid_leave" else 0.0
    
    # Формируем ответ
    response = ManualAssignmentResponse(
        assignment_id=new_assignment.id,
        tracking_nr=new_assignment.tracking_nr,
        assignment_type=new_assignment.assignment_type,
        payment_id=None,
        payment_tracking_nr=None,
        total_hours=round(total_hours, 2),
        total_amount=round(total_amount, 2),
        currency=currency
    )
    
    return TimeOffResponse(
        created_count=1,
        assignments=[response],
        skipped_dates=[]
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
        .options(joinedload(Task.assignment).joinedload(Assignment.worker))
        .where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    if task.end_time is not None:
        raise HTTPException(status_code=400, detail="Сессия уже завершена")
    
    assignment = task.assignment
    now = datetime.now()
    task.end_time = now  # Full datetime now
    
    # is_active is now a computed property, no need to set it
    
    # Get employment relation for rate/currency
    emp_result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.user_id == assignment.user_id,
                EmploymentRelation.is_active == True
            )
        )
    )
    employment = emp_result.scalar_one_or_none()
    hourly_rate = employment.hourly_rate if employment else Decimal(0)
    currency = employment.currency if employment else "UAH"
    
    # Рассчитываем общую сумму по всем work-tasks
    result = await db.execute(
        select(Task).where(Task.assignment_id == assignment.id)
    )
    all_tasks = result.scalars().all()
    
    total_amount = Decimal(0)
    for t in all_tasks:
        if t.task_type == "work" and t.end_time:
            # Calculate amount manually: hours * hourly_rate
            task_hours = Decimal(str(t.duration_hours))
            total_amount += task_hours * hourly_rate
    
    # Создаём платёж только если сумма > 0
    employer = None
    if total_amount > 0:
        # Собираем комментарии из смены и всех заданий
        comments = []
        if assignment.description:
            comments.append(assignment.description)
        
        for t in all_tasks:
            if t.description and t.description not in comments:
                comments.append(t.description)
        
        joined_comments = ", ".join(comments)
        full_description = f"Смена {assignment.tracking_nr}"
        if joined_comments:
            full_description += f": {joined_comments}"
            
        # Ограничиваем длину до 500 символов
        if len(full_description) > 500:
            full_description = full_description[:497] + "..."

        # Generate tracking number for payment
        from utils.tracking import format_payment_tracking_nr
        from database.models import Role, PaymentCategoryGroup, PaymentGroupCode
        
        # Get employer (user with employer role)
        employer_result = await db.execute(
            select(User).join(User.roles).where(Role.name == "employer")
        )
        employer = employer_result.scalar_one_or_none()
        payer_id = employer.id if employer else assignment.user_id  # fallback
        
        # Find salary category by group code (more reliable than name)
        salary_cat_result = await db.execute(
            select(PaymentCategory).join(PaymentCategoryGroup).where(
                PaymentCategoryGroup.code == PaymentGroupCode.SALARY.value
            )
        )
        salary_category = salary_cat_result.scalar_one_or_none()
        if not salary_category:
            raise HTTPException(status_code=500, detail="Категория зарплаты не найдена")

        payment = Payment(
            payer_id=payer_id,
            recipient_id=assignment.user_id,  # Работник — получатель
            category_id=salary_category.id,
            amount=total_amount,
            currency=currency,
            description=full_description,
            payment_date=now,
            payment_status='unpaid',
            assignment_id=assignment.id
        )
        db.add(payment)
        await db.flush()  # Получаем ID
        payment.tracking_nr = format_payment_tracking_nr(payment.id)
    await db.commit()
    await db.refresh(task)
    
    return_response = _task_to_response(
        task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=employer.full_name if employer else None,
        hourly_rate=float(hourly_rate),
        currency=currency
    )
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    
    # Notify about the new payment if it was created
    if total_amount > 0:
        await manager.broadcast({
            "type": "payment_created",
            "payment_id": payment.id,
            "payer_id": payment.payer_id,
            "recipient_id": payment.recipient_id
        }, user_ids=target_users)

    await manager.broadcast({
        "type": "assignment_stopped",
        "assignment_id": assignment.id,
        "user_id": assignment.user_id
    }, user_ids=target_users)
    
    return return_response


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
        .options(joinedload(Assignment.worker), joinedload(Assignment.worker))
        .where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Смена не найдена")
    
    if not assignment.is_active:
        raise HTTPException(status_code=400, detail="Смена уже завершена")
    
    # Проверка прав
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if assignment.user_id != current_user.id:
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
        current_task.end_time = now  # Full datetime now
    
    # Создаём новый work task
    new_task = Task(
        assignment_id=assignment_id,
        start_time=now,  # Full datetime now
        task_type="work",
        description=request.description
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "task_created",
        "assignment_id": assignment_id,
        "task_id": new_task.id,
        "user_id": assignment.user_id
    }, user_ids=target_users)
    
    return _task_to_response(
        new_task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=None,  # Assignment does not have employer relationship
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
                 joinedload(Task.assignment).joinedload(Assignment.worker))
        .where(Task.id == session_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    assignment = task.assignment
    
    # Проверка прав: пользователь может редактировать только свои сессии
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if assignment.user_id != current_user.id:
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
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "payment_updated", # Re-using this to trigger refresh as it affects balances/times
        "assignment_id": assignment.id,
        "task_id": task.id
    }, user_ids=target_users)
    
    return _task_to_response(
        task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=None,  # Assignment does not have employer relationship
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
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if assignment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление этой сессии")
    
    # Проверяем связанный платёж
    if assignment.payment:
        if assignment.payment.payment_status != 'unpaid':
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
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "task_deleted",
        "assignment_id": assignment.id,
        "task_id": session_id
    }, user_ids=target_users)
    
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
    if not current_user.is_admin:
        if assignment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на редактирование")
    
    # Обновляем только те поля, которые ещё есть в модели
    # assignment_date, hourly_rate, currency теперь computed/from employment
    if update_data.description is not None:
        # Allow empty string to clear description
        assignment.description = update_data.description if update_data.description else None
    
    await db.commit()
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    await manager.broadcast({
        "type": "assignment_updated",
        "assignment_id": assignment_id
    }, user_ids=target_users)
    
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
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if assignment.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав на удаление")
    
    # Проверяем платёж
    if assignment.payment and assignment.payment.payment_status != 'unpaid':
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
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    await manager.broadcast({
        "type": "assignment_deleted",
        "assignment_id": assignment_id
    }, user_ids=target_users)
    
    return {"message": "Assignment удалён", "id": assignment_id}


@router.post("/assignment/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_assignments(
    request: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Массовое удаление assignments. Только админ может удалять массово."""
    
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может удалять массово")
    
    deleted_count = 0
    failed_ids = []
    errors = []
    deleted_user_ids = set()
    
    for assignment_id in request.ids:
        try:
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
                failed_ids.append(assignment_id)
                errors.append(f"ID {assignment_id}: не найден")
                continue
            
            # Проверяем платёж
            if assignment.payment and assignment.payment.payment_status != 'unpaid':
                failed_ids.append(assignment_id)
                errors.append(f"ID {assignment_id}: платёж уже оплачен")
                continue
            
            # Удаляем платёж если есть
            if assignment.payment:
                await db.delete(assignment.payment)
            
            # Удаляем все tasks
            for task in assignment.tasks:
                await db.delete(task)
            
            # Удаляем assignment
            await db.delete(assignment)
            deleted_count += 1
            deleted_user_ids.add(assignment.user_id)
            
        except Exception as e:
            failed_ids.append(assignment_id)
            errors.append(f"ID {assignment_id}: {str(e)}")
    
    await db.commit()
    
    # WebSocket broadcast
    if deleted_count > 0:
        from api.routers.websocket import manager, get_admin_ids
        target_users = list(set(list(deleted_user_ids) + await get_admin_ids()))
        await manager.broadcast({
            "type": "assignments_bulk_deleted",
            "count": deleted_count
        }, user_ids=target_users)
    
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids,
        errors=errors
    )


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
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if assignment.user_id != current_user.id:
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
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([assignment.user_id] + await get_admin_ids()))
    await manager.broadcast({
        "type": "task_updated",
        "assignment_id": assignment.id,
        "task_id": task_id
    }, user_ids=target_users)
    
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
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if True:  # User is worker
            worker_id = current_user.id
        else:
            return []
    
    query = select(Task).join(Assignment).options(
        joinedload(Task.assignment).joinedload(Assignment.worker),
        joinedload(Task.assignment).joinedload(Assignment.worker)
    )
    
    if worker_id:
        query = query.where(Assignment.user_id == worker_id)
    if False:  # employer_id removed - single employer
        query = query.where(Assignment.user_id == employer_id)
    if start_date:
        from datetime import datetime as dt
        start_datetime = dt.combine(start_date, dt.min.time())
        query = query.where(Task.start_time >= start_datetime)
    if end_date:
        from datetime import datetime as dt
        end_datetime = dt.combine(end_date + timedelta(days=1), dt.min.time())
        query = query.where(Task.start_time < end_datetime)
    if is_active is not None:
        if is_active:
            query = query.where(Task.end_time == None)
        else:
            query = query.where(Task.end_time != None)
    
    query = query.order_by(Task.start_time.desc())
    query = query.limit(limit).offset(offset)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [
        _task_to_response(
            t, t.assignment,
            worker_name=t.assignment.worker.full_name if t.assignment.worker else None,
            employer_name=None  # Assignment doesn't have employer relationship
        )
        for t in tasks
    ]


@router.get("/grouped", response_model=List[AssignmentResponse])
async def get_grouped_sessions(
    worker_id: Optional[int] = Query(None),
    employer_id: Optional[int] = Query(None),
    period: str = Query("month", pattern="^(all|day|week|month|year)$"),
    limit: Optional[int] = Query(None),  # No limit by default - virtualization handles rendering
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить сессии сгруппированные по assignment_id"""
    from utils.timezone import now_server
    now = now_server()
    
    # Calculate date range (None = no filter)
    start_date = None
    if period == "day":
        start_date = now.date()
    elif period == "week":
        start_date = now.date() - timedelta(days=7)
    elif period == "month":
        start_date = now.date().replace(day=1)
    elif period == "year":
        start_date = now.date().replace(month=1, day=1)
    # period == "all" -> start_date remains None (no filter)
    
    # Get all assignments in date range
    query = select(Assignment).options(
        joinedload(Assignment.worker), 
        joinedload(Assignment.worker),
        joinedload(Assignment.tasks),
        joinedload(Assignment.payment)
    )
    
    # Apply date filter using subquery on Task.start_time
    if start_date:
        from datetime import datetime as dt
        start_datetime = dt.combine(start_date, dt.min.time())
        # Filter assignments that have at least one task starting on or after start_date
        query = query.where(
            Assignment.id.in_(
                select(Task.assignment_id).where(Task.start_time >= start_datetime).distinct()
            )
        )
    
    # Sort by created_at (since assignment_date is now computed)
    query = query.order_by(Assignment.created_at.desc(), Assignment.id.desc())
    
    if worker_id:
        query = query.where(Assignment.user_id == worker_id)
    if False:  # employer_id removed - single employer
        query = query.where(Assignment.user_id == employer_id)
    
    # Auto-filter for non-admins
    if not current_user.is_admin:
        pass  # User is now the worker directly
        if True:  # User is worker
            query = query.where(Assignment.user_id == current_user.id)
    
    result = await db.execute(query)
    assignments = result.scalars().unique().all()
    
    # Apply pagination - if limit is None, return all (from offset)
    if limit is not None:
        paginated = assignments[offset:offset + limit]
    else:
        paginated = assignments[offset:] if offset > 0 else assignments
    
    responses = []
    
    # Pre-load employment relations for rate lookup
    worker_ids = list(set(a.user_id for a in paginated))
    emp_result = await db.execute(
        select(EmploymentRelation).where(
            and_(
                EmploymentRelation.user_id.in_(worker_ids),
                EmploymentRelation.is_active == True
            )
        )
    )
    emp_by_worker = {e.user_id: e for e in emp_result.scalars().all()}
    
    for assignment in paginated:
        tasks = sorted(assignment.tasks, key=lambda t: (t.start_time, t.id))
        
        # Time-off assignments may have no tasks
        is_time_off = assignment.assignment_type != "work"
        
        # For work assignments, skip if no tasks
        if not tasks and not is_time_off:
            continue
        
        # Get employment relation for hourly rate
        employment = emp_by_worker.get(assignment.user_id)
        hourly_rate = float(employment.hourly_rate) if employment else 0.0
        currency = employment.currency if employment else "UAH"
        
        # Calculate totals
        total_work_seconds = 0
        total_pause_seconds = 0
        total_amount = 0.0
        is_active = assignment.is_active
        
        for task in tasks:
            if task.end_time:
                seg_seconds = task.duration_seconds
            elif task.end_time is None:
                # Active task - Task.start_time is now full datetime
                seg_seconds = int((now - task.start_time).total_seconds())
            else:
                seg_seconds = 0
            
            if task.task_type == "work":
                total_work_seconds += seg_seconds
                if task.end_time:
                    # Calculate amount manually: hours * hourly_rate
                    task_hours = task.duration_hours
                    total_amount += task_hours * hourly_rate
            else:
                total_pause_seconds += seg_seconds
        
        first_task = tasks[0] if tasks else None
        last_task = tasks[-1] if tasks else None
        
        # Segments in descending order (newest first), stable sort by (start_time, id)
        segment_responses = [
            _task_to_response(
                task, assignment,
                worker_name=assignment.worker.full_name if assignment.worker else None,
                employer_name=None,
                hourly_rate=hourly_rate,
                currency=currency
            )
            for task in sorted(tasks, key=lambda t: (t.start_time, t.id), reverse=True)
        ]
        
        responses.append(AssignmentResponse(
            assignment_id=assignment.id,
            tracking_nr=assignment.tracking_nr,
            assignment_type=assignment.assignment_type,
            assignment_date=assignment.assignment_date,
            worker_id=assignment.user_id,
            worker_name=assignment.worker.full_name if assignment.worker else None,
            employer_id=assignment.user_id,
            employer_name=None,
            start_time=first_task.start_time if first_task else None,
            end_time=last_task.end_time if last_task and not is_active else None,
            total_work_seconds=total_work_seconds,
            total_pause_seconds=total_pause_seconds,
            total_hours=round(total_work_seconds / 3600, 2),
            total_amount=round(total_amount, 2),
            hourly_rate=hourly_rate,
            currency=currency,
            description=assignment.description,
            is_active=is_active,
            payment_id=assignment.payment.id if assignment.payment else None,
            payment_tracking_nr=assignment.payment.tracking_nr if assignment.payment else None,
            payment_status=assignment.payment.payment_status if assignment.payment else None,
            segments=segment_responses
        ))
    
    return responses


@router.get("/active")
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):                                    
    """Получить активные рабочие сессии"""
    
    query = select(Task).join(Assignment).options(
        joinedload(Task.assignment).joinedload(Assignment.worker),
        joinedload(Task.assignment).joinedload(Assignment.tasks)
    ).where(Task.end_time == None)
    
    # Admin sees all active sessions, workers see only their own
    if not current_user.is_admin:
        query = query.where(Assignment.user_id == current_user.id)
    
    result = await db.execute(query)
    active_tasks = result.scalars().unique().all()
    
    from utils.timezone import now_server
    now = now_server()
    
    # Pre-load employment relations for rate lookup
    worker_ids = list(set(t.assignment.user_id for t in active_tasks))
    if worker_ids:
        emp_result = await db.execute(
            select(EmploymentRelation).where(
                and_(
                    EmploymentRelation.user_id.in_(worker_ids),
                    EmploymentRelation.is_active == True
                )
            )
        )
        emp_by_worker = {e.user_id: e for e in emp_result.scalars().all()}
    else:
        emp_by_worker = {}
    
    responses = []
    for task in active_tasks:
        assignment = task.assignment
        
        # Get employment for rate/currency
        employment = emp_by_worker.get(assignment.user_id)
        hourly_rate = float(employment.hourly_rate) if employment else 0.0
        currency = employment.currency if employment else "UAH"
        
        # Calculate aggregated times for this assignment
        total_work_seconds = 0
        total_pause_seconds = 0
        
        for t in assignment.tasks:
            if t.end_time:
                seg_seconds = t.duration_seconds
            elif t.id == task.id:
                # Current running task - t.start_time is now full datetime
                seg_seconds = int((now - t.start_time).total_seconds())
            else:
                seg_seconds = 0
            
            if t.task_type == "work":
                total_work_seconds += seg_seconds
            else:
                total_pause_seconds += seg_seconds
        
        responses.append(_task_to_response(
            task, assignment,
            worker_name=assignment.worker.full_name if assignment.worker else None,
            employer_name=None,
            hourly_rate=hourly_rate,
            currency=currency,
            total_work_seconds=total_work_seconds,
            total_pause_seconds=total_pause_seconds
        ))
    
    return responses


@router.get("/summary")
async def get_sessions_summary(
    worker_id: Optional[int] = Query(None),
    employer_id: Optional[int] = Query(None),
    period: str = Query("month", pattern="^(all|day|week|month|year)$"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):                                                       
    """Получить сводку по рабочим сессиям"""
    from utils.timezone import now_server
    
    # Автофильтрация для не-админов
    if not current_user.is_admin:
        worker_id = current_user.id
    
    now = now_server()
    
    if not start_date:
        if period == "all":
            start_date = date(2000, 1, 1)  # Very old date to include all records
        elif period == "day":
            start_date = now.date()
        elif period == "week":
            start_date = now.date() - timedelta(days=7)
        elif period == "month":
            start_date = now.date().replace(day=1)
        elif period == "year":
            start_date = now.date().replace(month=1, day=1)
    
    if not end_date:
        end_date = now.date()
    
    # Convert to datetime for Task.start_time filtering
    from datetime import datetime as dt
    start_datetime = dt.combine(start_date, dt.min.time())
    end_datetime = dt.combine(end_date + timedelta(days=1), dt.min.time())
    
    # Query completed work tasks - now use Task.start_time for date filtering
    query = select(
        func.count(func.distinct(Assignment.id)).label("total_sessions")
    ).select_from(Assignment).join(Task).where(
        and_(
            Task.start_time >= start_datetime,
            Task.start_time < end_datetime,
            Task.end_time != None,
            Task.task_type == "work"
        )
    )
    
    if worker_id:
        query = query.where(Assignment.user_id == worker_id)
    
    result = await db.execute(query)
    row = result.one()
    total_sessions = row.total_sessions or 0
    
    # Get total hours - Task.start_time and end_time are now full datetime
    hours_query = select(
        func.sum(
            (func.julianday(Task.end_time) - func.julianday(Task.start_time)) * 24
        ).label("total_hours")
    ).select_from(Task).join(Assignment).where(
        and_(
            Task.start_time >= start_datetime,
            Task.start_time < end_datetime,
            Task.end_time != None,
            Task.task_type == "work"
        )
    )
    
    if worker_id:
        hours_query = hours_query.where(Assignment.user_id == worker_id)
    
    hours_result = await db.execute(hours_query)
    hours_row = hours_result.one()
    total_hours = float(hours_row.total_hours) if hours_row.total_hours else 0
    
    # Calculate total amount from payments for assignments in this period
    amount_query = select(
        func.sum(Payment.amount).label("total_amount")
    ).select_from(Payment).join(
        Assignment, Assignment.id == Payment.assignment_id
    ).join(Task).where(
        and_(
            Task.start_time >= start_datetime,
            Task.start_time < end_datetime
        )
    )
    
    if worker_id:
        amount_query = amount_query.where(Assignment.user_id == worker_id)
    
    amount_result = await db.execute(amount_query)
    amount_row = amount_result.one()
    total_amount = float(amount_row.total_amount) if amount_row.total_amount else 0
    
    # Return single summary (currency from employment relation)
    return [WorkSessionSummary(
        period_start=start_date,
        period_end=end_date,
        total_sessions=total_sessions,
        total_hours=round(total_hours, 2),
        total_amount=round(total_amount, 2),
        currency="UAH"  # Hardcoded for now
    )]


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
    task.end_time = now  # Full datetime
    if description:
        task.description = description
    
    # Start new pause task
    pause_task = Task(
        assignment_id=assignment.id,
        start_time=now,  # Full datetime
        task_type="pause"
    )
    db.add(pause_task)
    
    await db.commit()
    await db.refresh(pause_task)
    
    # Get names
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.worker))
        .where(Assignment.id == assignment.id)
    )
    assignment = result.scalar_one()
    
    return _task_to_response(
        pause_task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=None,  # Assignment does not have employer relationship
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
    task.end_time = now  # Full datetime
    if description:
        task.description = description
    
    # Start new work task
    work_task = Task(
        assignment_id=assignment.id,
        start_time=now,  # Full datetime
        task_type="work"
    )
    db.add(work_task)
    
    await db.commit()
    await db.refresh(work_task)
    
    # Get names
    result = await db.execute(
        select(Assignment)
        .options(joinedload(Assignment.worker), joinedload(Assignment.worker))
        .where(Assignment.id == assignment.id)
    )
    assignment = result.scalar_one()
    
    return _task_to_response(
        work_task, assignment,
        worker_name=assignment.worker.full_name if assignment.worker else None,
        employer_name=None,  # Assignment does not have employer relationship
    )
