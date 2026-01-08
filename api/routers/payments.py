import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import joinedload, selectinload
from database.core import get_db
from database.models import User, Payment, PaymentCategory, PaymentCategoryGroup, Currency, Assignment, Role
from api.schemas.payment import (
    PaymentCreate, Payment as PaymentSchema,
    PaymentCategoryCreate, PaymentCategory as PaymentCategorySchema,
    PaymentCategoryGroupCreate, PaymentCategoryGroupResponse,
    PaymentReport
)
from api.auth.oauth import get_current_user, get_admin_user
from utils.timezone import now_server

router = APIRouter(prefix="/payments", tags=["payments"])


# ==================== Payment Category Groups ====================

@router.get("/groups", response_model=List[PaymentCategoryGroupResponse])
async def get_groups(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Получить список групп категорий"""
    query = select(PaymentCategoryGroup)
    if not include_inactive:
        query = query.where(PaymentCategoryGroup.is_active == True)
    result = await db.execute(query.order_by(PaymentCategoryGroup.id))
    return result.scalars().all()


@router.post("/groups", response_model=PaymentCategoryGroupResponse)
async def create_group(
    group: PaymentCategoryGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Создать новую группу категорий"""
    db_group = PaymentCategoryGroup(**group.model_dump())
    db.add(db_group)
    await db.commit()
    await db.refresh(db_group)
    return db_group


@router.put("/groups/{group_id}", response_model=PaymentCategoryGroupResponse)
async def update_group(
    group_id: int,
    group: PaymentCategoryGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Обновить группу категорий"""
    result = await db.execute(select(PaymentCategoryGroup).where(PaymentCategoryGroup.id == group_id))
    db_group = result.scalar_one_or_none()
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    for field, value in group.model_dump().items():
        setattr(db_group, field, value)
    
    await db.commit()
    await db.refresh(db_group)
    return db_group


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    """Деактивировать группу категорий"""
    result = await db.execute(select(PaymentCategoryGroup).where(PaymentCategoryGroup.id == group_id))
    db_group = result.scalar_one_or_none()
    if not db_group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db_group.is_active = False
    await db.commit()
    return {"message": "Group deactivated"}


# ==================== Payment Categories ====================

@router.post("/categories", response_model=PaymentCategorySchema)
async def create_category(
    category: PaymentCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    db_category = PaymentCategory(**category.model_dump())
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.get("/categories", response_model=List[PaymentCategorySchema])
async def get_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[PaymentCategorySchema]:
    result = await db.execute(
        select(PaymentCategory).options(joinedload(PaymentCategory.category_group))
    )
    return result.scalars().unique().all()


@router.post("/", response_model=PaymentSchema)
async def create_payment(
    payment: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    payment_data = payment.model_dump()
    
    # Устанавливаем валюту по умолчанию если не указана
    if not payment_data.get('currency'):
        result = await db.execute(select(Currency).where(Currency.is_default == True))
        default_currency = result.scalar_one_or_none()
        payment_data['currency'] = default_currency.code if default_currency else 'UAH'
    
    # Если payment_date без времени, добавляем текущее время
    if payment_data['payment_date'].time() == datetime.min.time():
        now = now_server()
        payment_data['payment_date'] = payment_data['payment_date'].replace(
            hour=now.hour,
            minute=now.minute,
            second=now.second
        )
    
    # payer_id обязателен
    if not payment_data.get('payer_id'):
        raise HTTPException(status_code=400, detail="payer_id is required")
    
    # Single-employer модель: автоматически устанавливаем recipient_id
    # Если worker платит → recipient = employer (первый admin)
    # Если admin платит worker'у → recipient уже должен быть указан
    if not payment_data.get('recipient_id'):
        payer_id = payment_data['payer_id']
        # Проверяем, является ли payer админом
        payer_result = await db.execute(
            select(User).options(selectinload(User.roles)).where(User.id == payer_id)
        )
        payer = payer_result.scalar_one_or_none()
        
        if payer and not payer.is_admin:
            # Worker платит → recipient = первый admin (employer)
            admin_result = await db.execute(
                select(User).join(User.roles).where(Role.name == 'admin').limit(1)
            )
            admin_user = admin_result.scalar_one_or_none()
            if admin_user:
                payment_data['recipient_id'] = admin_user.id
    
    # Обрабатываем payment_status и paid_at
    payment_status = payment_data.get('payment_status', 'unpaid')
    if payment_status == 'paid':
        payment_data['paid_at'] = now_server()
    else:
        payment_data['paid_at'] = None
    
    # Generate tracking number after getting ID
    from utils.tracking import format_payment_tracking_nr
        
    db_payment = Payment(**payment_data)
    db.add(db_payment)
    await db.flush()  # Получаем ID
    
    db_payment.tracking_nr = format_payment_tracking_nr(db_payment.id)
    await db.commit()
    await db.refresh(db_payment)
    
    result = await db.execute(
        select(Payment)
        .options(
            joinedload(Payment.category).joinedload(PaymentCategory.category_group),
            joinedload(Payment.payer),
            joinedload(Payment.recipient),
            joinedload(Payment.assignment)
        )
        .where(Payment.id == db_payment.id)
    )
    db_payment = result.unique().scalar_one()
    
    # WebSocket broadcast: уведомляем плательщика, получателя и всех админов
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([db_payment.payer_id, db_payment.recipient_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "payment_created",
        "payment_id": db_payment.id,
        "payer_id": db_payment.payer_id,
        "recipient_id": db_payment.recipient_id
    }, user_ids=target_users)
    
    return PaymentSchema.model_validate(db_payment)


@router.get("/", response_model=List[PaymentSchema])
async def get_payments(
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[PaymentSchema]:
    query = select(Payment).options(
        joinedload(Payment.category).joinedload(PaymentCategory.category_group),
        joinedload(Payment.payer),
        joinedload(Payment.recipient),
        joinedload(Payment.assignment)
    )
    
    # RBAC: workers видят только свои платежи (где они payer или recipient)
    if not current_user.is_admin:
        from sqlalchemy import or_
        query = query.where(
            or_(
                Payment.payer_id == current_user.id,
                Payment.recipient_id == current_user.id
            )
        )
    
    if category_id:
        query = query.where(Payment.category_id == category_id)
    if start_date:
        query = query.where(Payment.payment_date >= start_date)
    if end_date:
        query = query.where(Payment.payment_date <= end_date)
    
    query = query.offset(skip)
    if limit is not None:
        query = query.limit(limit)
    
    query = query.order_by(Payment.payment_date.desc())
    result = await db.execute(query)
    payments = result.scalars().all()
    
    serialized = [PaymentSchema.model_validate(p) for p in payments]
    return serialized


@router.get("/reports")
async def get_payment_reports(
    period: str = Query("month", pattern="^(day|week|month|year)$"),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not start_date:
        if period == "day":
            start_date = now_server().replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = now_server() - timedelta(days=7)
        elif period == "month":
            start_date = now_server().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "year":
            start_date = now_server().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    if not end_date:
        end_date = now_server()
    
    # Получаем детальные платежи
    query = select(Payment, PaymentCategory.name, User.full_name).join(
        PaymentCategory, Payment.category_id == PaymentCategory.id
    ).outerjoin(
        User, Payment.payer_id == User.id
    ).where(
        and_(
            Payment.payment_date >= start_date,
            Payment.payment_date <= end_date
        )
    ).order_by(Payment.payment_date.desc())
    
    result = await db.execute(query)
    payments = []
    totals_by_currency = {}
    
    for payment, category_name, payer_name in result:
        payments.append({
            "id": payment.id,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "category_name": category_name,
            "payer_name": payer_name,
            "description": payment.description,
            "payment_date": payment.payment_date.isoformat(),
            "created_at": payment.created_at.isoformat()
        })
        
        # Группируем по валютам
        currency = payment.currency
        if currency not in totals_by_currency:
            totals_by_currency[currency] = 0
        totals_by_currency[currency] += float(payment.amount)
    
    return {
        "payments": payments,
        "totals_by_currency": totals_by_currency,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "count": len(payments)
    }


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    category: PaymentCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(select(PaymentCategory).where(PaymentCategory.id == category_id))
    db_category = result.scalar_one_or_none()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    for field, value in category.model_dump().items():
        setattr(db_category, field, value)
    
    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    result = await db.execute(select(PaymentCategory).where(PaymentCategory.id == category_id))
    db_category = result.scalar_one_or_none()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await db.delete(db_category)
    await db.commit()
    return {"message": "Category deleted"}


@router.put("/{payment_id}")
async def update_payment(
    payment_id: int,
    payment: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Обновить платёж. Админ может редактировать любые, пользователи — только свои неоплаченные."""
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    
    db_payment = result.scalar_one_or_none()
    if not db_payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Проверка прав: только админ может редактировать оплаченные платежи
    if db_payment.payment_status == 'paid' and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может редактировать оплаченные платежи")
    
    # Проверка прав: плательщик или получатель могут редактировать свои неоплаченные платежи
    is_owner = db_payment.payer_id == current_user.id or db_payment.recipient_id == current_user.id
    if not current_user.is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    payment_data = payment.model_dump()
    
    # Если указан payment_status, обновляем paid_at
    if 'payment_status' in payment_data:
        status = payment_data['payment_status']
        if status == 'paid' and not db_payment.paid_at:
            payment_data['paid_at'] = now_server()
        elif status == 'unpaid':
            payment_data['paid_at'] = None
    
    # Удаляем поля, которые не должны перезаписываться из запроса, если они null
    if 'payer_id' in payment_data and payment_data['payer_id'] is None:
        del payment_data['payer_id']
    
    # Если в базе уже был assignment_id, а в обновлении его нет (null) - сохраняем старый
    if db_payment.assignment_id and payment_data.get('assignment_id') is None:
        del payment_data['assignment_id']
    
    # Не позволяем клиенту устанавливать modified_at вручную
    if 'modified_at' in payment_data:
        del payment_data['modified_at']
    
    for field, value in payment_data.items():
        setattr(db_payment, field, value)
    
    # Устанавливаем время изменения принудительно ПОСЛЕ цикла
    db_payment.modified_at = now_server()
    
    await db.commit()
    await db.refresh(db_payment)
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    target_users = list(set([db_payment.payer_id, db_payment.recipient_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "payment_updated",
        "payment_id": db_payment.id
    }, user_ids=target_users)
    
    return {"id": db_payment.id, "message": "Payment updated successfully"}


@router.delete("/{payment_id}")
async def delete_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Удалить платёж. Админ может удалять любые, пользователи — только свои."""
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    
    db_payment = result.scalar_one_or_none()
    if not db_payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Проверка прав: только админ может удалять оплаченные платежи
    if db_payment.payment_status == 'paid' and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может удалять оплаченные платежи")
    
    # Проверяем права доступа: админ, плательщик или получатель платежа
    is_owner = db_payment.payer_id == current_user.id or db_payment.recipient_id == current_user.id
    if not current_user.is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    await db.delete(db_payment)
    await db.commit()
    
    # WebSocket broadcast
    from api.routers.websocket import manager, get_admin_ids
    # For deleted payment, we use IDs from the db_payment object before it was fully detached
    target_users = list(set([db_payment.payer_id, db_payment.recipient_id] + await get_admin_ids()))
    
    await manager.broadcast({
        "type": "payment_deleted",
        "payment_id": payment_id
    }, user_ids=target_users)
    
    return {"message": "Payment deleted"}


class BulkDeleteRequest(BaseModel):
    """Запрос на массовое удаление"""
    ids: List[int]


class BulkDeleteResponse(BaseModel):
    """Ответ на массовое удаление"""
    deleted_count: int
    failed_ids: List[int] = []
    errors: List[str] = []


@router.post("/bulk-delete", response_model=BulkDeleteResponse)
async def bulk_delete_payments(
    request: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Массовое удаление платежей. Только админ может удалять массово."""
    
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может удалять массово")
    
    deleted_count = 0
    failed_ids = []
    errors = []
    affected_user_ids = set()
    
    for payment_id in request.ids:
        try:
            result = await db.execute(
                select(Payment).where(Payment.id == payment_id)
            )
            payment = result.scalar_one_or_none()
            
            if not payment:
                failed_ids.append(payment_id)
                errors.append(f"ID {payment_id}: не найден")
                continue
            
            # Проверяем статус - оплаченные тоже удаляем (админ может)
            # но сохраняем информацию
            affected_user_ids.add(payment.payer_id)
            affected_user_ids.add(payment.recipient_id)
            
            await db.delete(payment)
            deleted_count += 1
            
        except Exception as e:
            failed_ids.append(payment_id)
            errors.append(f"ID {payment_id}: {str(e)}")
    
    await db.commit()
    
    # WebSocket broadcast
    if deleted_count > 0:
        from api.routers.websocket import manager, get_admin_ids
        target_users = list(set(list(affected_user_ids) + await get_admin_ids()))
        await manager.broadcast({
            "type": "payments_bulk_deleted",
            "count": deleted_count
        }, user_ids=target_users)
    
    return BulkDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids,
        errors=errors
    )