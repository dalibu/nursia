#!/usr/bin/env python3
import asyncio
import sys
import hashlib
import bcrypt
from pathlib import Path
from sqlalchemy import select, insert

# Добавляем корень проекта в путь
sys.path.append(str(Path(__file__).parent.parent))

from database.core import engine, AsyncSessionLocal
from database.models import (
    Base, User, SystemSetting, PaymentCategory, PaymentCategoryGroup,
    Currency, Role, Permission
)


async def setup_database():
    """Создаёт все таблицы в базе данных, если они не существуют."""
    print("Инициализация структуры базы данных...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Структура таблиц готова.")


async def init_roles(session):
    """Создаёт роли: admin, employer, worker"""
    roles_data = [
        {"name": "admin", "type": "auth", "description": "Полный доступ к системе"},
        {"name": "employer", "type": "business", "description": "Работодатель - создаёт зарплатные платежи"},
        {"name": "worker", "type": "business", "description": "Работник - создаёт расходные платежи"},
    ]
    
    created = 0
    for r_data in roles_data:
        result = await session.execute(select(Role).where(Role.name == r_data["name"]))
        if not result.scalar_one_or_none():
            session.add(Role(**r_data))
            created += 1
    if created > 0:
        print(f"Создано {created} ролей.")
    return created


async def init_permissions(session):
    """Создаёт разрешения"""
    permissions_data = [
        {"name": "manage_users", "description": "Управление пользователями"},
        {"name": "view_all_reports", "description": "Просмотр всех отчётов"},
        {"name": "create_salary_payments", "description": "Создание зарплатных платежей"},
        {"name": "create_expense_payments", "description": "Создание расходных платежей"},
        {"name": "manage_categories", "description": "Управление категориями платежей"},
    ]
    
    created = 0
    for p_data in permissions_data:
        result = await session.execute(select(Permission).where(Permission.name == p_data["name"]))
        if not result.scalar_one_or_none():
            session.add(Permission(**p_data))
            created += 1
    if created > 0:
        print(f"Создано {created} разрешений.")
    await session.flush()


async def init_role_permissions(session):
    """Связывает роли с разрешениями через прямой SQL"""
    from database.models import role_permissions
    
    # Получаем роли
    roles = {}
    result = await session.execute(select(Role))
    for role in result.scalars().all():
        roles[role.name] = role.id
    
    # Получаем разрешения
    perms = {}
    result = await session.execute(select(Permission))
    for perm in result.scalars().all():
        perms[perm.name] = perm.id
    
    mappings = []
    # Admin получает все разрешения
    for perm_id in perms.values():
        mappings.append({"role_id": roles["admin"], "permission_id": perm_id})
    
    # Employer
    for perm_name in ["create_salary_payments", "view_all_reports"]:
        if perm_name in perms:
            mappings.append({"role_id": roles["employer"], "permission_id": perms[perm_name]})
    
    # Worker
    for perm_name in ["create_expense_payments"]:
        if perm_name in perms:
            mappings.append({"role_id": roles["worker"], "permission_id": perms[perm_name]})
    
    for m in mappings:
        try:
            await session.execute(insert(role_permissions).values(**m))
        except Exception:
            pass  # Уже существует
    
    print("Разрешения назначены ролям.")


async def init_settings(session):
    settings = [
        {"key": "app_name", "value": "Nursia", "description": "Название приложения"},
        {"key": "remember_me_hours", "value": "24", "description": "Время запоминания пользователя (часы)"},
        {"key": "jwt_access_token_expire_minutes", "value": "480", "description": "Время жизни JWT токена (минуты)"},
        {"key": "password_rules", "value": "Пароль должен содержать минимум 6 символов и 1 цифру", "description": "Требования к паролю"},
        {"key": "security_login_delay_enabled", "value": "true", "description": "Включить задержку при неверном входе (защита от перебора)"},
        {"key": "security_login_delay_seconds", "value": "1.0", "description": "Длительность задержки в секундах"},
        {"key": "requests_check_interval", "value": "5", "description": "Интервал проверки новых заявок (минуты)"}
    ]
    
    created = 0
    for s_data in settings:
        result = await session.execute(select(SystemSetting).where(SystemSetting.key == s_data["key"]))
        if not result.scalar_one_or_none():
            session.add(SystemSetting(**s_data))
            created += 1
    if created > 0:
        print(f"Создано {created} настроек.")


async def init_category_groups(session):
    """Создаёт группы категорий платежей"""
    groups_data = [
        {"name": "Зарплата", "code": "salary", "color": "#11998e", "emoji": "💵"},
        {"name": "Расходы", "code": "expense", "color": "#eb3349", "emoji": "🛒"},
        {"name": "Долги", "code": "debt", "color": "#667eea", "emoji": "💳"},
        {"name": "Премии", "code": "bonus", "color": "#f5af19", "emoji": "🎁"},
        {"name": "Погашения", "code": "repayment", "color": "#ff6b35", "emoji": "↩️"},
        {"name": "Прочее", "code": "other", "color": "#808080", "emoji": "📝"},
    ]
    
    created = 0
    for g_data in groups_data:
        result = await session.execute(select(PaymentCategoryGroup).where(PaymentCategoryGroup.code == g_data["code"]))
        if not result.scalar_one_or_none():
            session.add(PaymentCategoryGroup(**g_data))
            created += 1
    if created > 0:
        print(f"Создано {created} групп категорий.")
    await session.flush()


async def init_role_category_groups(session):
    """Связывает роли с группами категорий через прямой SQL"""
    from database.models import role_category_groups
    
    # Получаем роли
    roles = {}
    result = await session.execute(select(Role))
    for role in result.scalars().all():
        roles[role.name] = role.id
    
    # Получаем группы
    groups = {}
    result = await session.execute(select(PaymentCategoryGroup))
    for group in result.scalars().all():
        groups[group.code] = group.id
    
    mappings = []
    # Employer: зарплата, долги, премии
    for code in ["salary", "debt", "bonus"]:
        if code in groups:
            mappings.append({"role_id": roles["employer"], "group_id": groups[code]})
    
    # Worker: расходы, погашения
    for code in ["expense", "repayment"]:
        if code in groups:
            mappings.append({"role_id": roles["worker"], "group_id": groups[code]})
    
    for m in mappings:
        try:
            await session.execute(insert(role_category_groups).values(**m))
        except Exception:
            pass  # Уже существует
    
    print("Группы категорий назначены ролям.")


async def init_categories(session):
    """Создаёт категории платежей с привязкой к группам"""
    # Получаем группы
    groups = {}
    result = await session.execute(select(PaymentCategoryGroup))
    for group in result.scalars().all():
        groups[group.code] = group.id
    
    categories = [
        # Зарплата
        {"name": "Зарплата", "description": "Заработная плата", "group_id": groups.get("salary")},
        # Долги
        {"name": "Аванс", "description": "Авансовые платежи", "group_id": groups.get("debt")},
        {"name": "Долг", "description": "Выданные долги", "group_id": groups.get("debt")},
        # Премии
        {"name": "Премии", "description": "Премии и бонусы", "group_id": groups.get("bonus")},
        # Расходы
        {"name": "Продукты", "description": "Платежи за продукты питания", "group_id": groups.get("expense")},
        {"name": "Коммунальные", "description": "Коммунальные платежи", "group_id": groups.get("expense")},
        {"name": "Медицина", "description": "Медицинские платежи", "group_id": groups.get("expense")},
        {"name": "Одежда", "description": "Платежи за одежду и обувь", "group_id": groups.get("expense")},
        {"name": "Транспорт", "description": "Платежи за транспорт", "group_id": groups.get("expense")},
        {"name": "Развлечения", "description": "Платежи за развлечения и досуг", "group_id": groups.get("expense")},
        {"name": "Подарки", "description": "Платежи за подарки и сувениры", "group_id": groups.get("expense")},
        # Погашения
        {"name": "Возврат долга", "description": "Возврат выданных долгов", "group_id": groups.get("repayment")},
        # Прочее
        {"name": "Прочее", "description": "Прочие платежи", "group_id": groups.get("other")},
    ]
    
    created = 0
    for c_data in categories:
        result = await session.execute(select(PaymentCategory).where(PaymentCategory.name == c_data["name"]))
        if not result.scalar_one_or_none():
            session.add(PaymentCategory(**c_data))
            created += 1
    if created > 0:
        print(f"Создано {created} категорий.")


async def init_currencies(session):
    currencies = [
        {"code": "UAH", "name": "Украинская гривна", "symbol": "₴", "is_default": True},
        {"code": "USD", "name": "Доллар США", "symbol": "$", "is_default": False},
        {"code": "EUR", "name": "Евро", "symbol": "€", "is_default": False},
    ]
    created = 0
    for curr_data in currencies:
        result = await session.execute(select(Currency).where(Currency.code == curr_data["code"]))
        if not result.scalar_one_or_none():
            session.add(Currency(**curr_data))
            created += 1
    if created > 0:
        print(f"Создано {created} валют.")


async def init_admin(session):
    """Создаёт админа с ролями admin + employer"""
    from database.models import user_roles
    
    # Проверяем есть ли уже пользователи
    result = await session.execute(select(User))
    if result.scalars().first():
        print("Пользователи уже существуют.")
        return

    print("Создание стандартного администратора (admin/admin123)...")
    username = "admin"
    password = "admin123"
    
    # Double hash: SHA256 (client simulation) + bcrypt (server storage)
    # This matches what the frontend sends
    sha256_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    password_hash = bcrypt.hashpw(sha256_hash.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    admin = User(
        username=username,
        password_hash=password_hash,
        full_name="Administrator",
        status="active",
        force_password_change=True
    )
    session.add(admin)
    await session.flush()  # Получаем ID
    
    # Назначаем роли через прямой SQL
    roles = {}
    result = await session.execute(select(Role))
    for role in result.scalars().all():
        roles[role.name] = role.id
    
    for role_name in ["admin", "employer"]:
        if role_name in roles:
            await session.execute(insert(user_roles).values(user_id=admin.id, role_id=roles[role_name]))
    
    # Create initial status entry for admin
    from database.models import UserStatus, UserStatusType
    admin_status = UserStatus(
        user_id=admin.id,
        status=UserStatusType.ACTIVE,
        changed_by=admin.id,
        reason="Начальная настройка системы"
    )
    session.add(admin_status)
    
    print("Администратор создан (admin + employer). Статус: Активен. Требуется смена пароля при входе.") 
    
    # Create EmploymentRelation for admin so they can also track work time
    from database.models import EmploymentRelation
    from decimal import Decimal
    
    result = await session.execute(
        select(EmploymentRelation).where(EmploymentRelation.user_id == admin.id)
    )
    if not result.scalar_one_or_none():
        admin_employment = EmploymentRelation(
            user_id=admin.id,
            hourly_rate=Decimal("100.00"),
            currency="UAH"
        )
        session.add(admin_employment)
        print("Создано трудовое отношение для администратора (ставка 100 UAH/час).")


async def init_employment_relations(session):
    """Создаёт EmploymentRelation для всех пользователей с ролью worker или admin, у кого её нет"""
    from database.models import EmploymentRelation
    from sqlalchemy.orm import joinedload
    from decimal import Decimal
    
    # Получаем всех пользователей с их ролями
    result = await session.execute(
        select(User).options(joinedload(User.roles))
    )
    users = result.unique().scalars().all()
    
    created = 0
    for user in users:
        # Пропускаем неактивных пользователей
        if user.status != 'active':
            continue
            
        # Проверяем роли
        role_names = [r.name for r in user.roles]
        should_have_employment = 'admin' in role_names or 'worker' in role_names or 'employer' in role_names
        
        if not should_have_employment:
            continue
            
        # Проверяем есть ли уже EmploymentRelation
        result = await session.execute(
            select(EmploymentRelation).where(
                EmploymentRelation.user_id == user.id,
                EmploymentRelation.is_active == True
            )
        )
        if result.scalar_one_or_none():
            continue
        
        # Создаём EmploymentRelation
        # Admin/Employer получает ставку 100, Worker - 50
        rate = Decimal("100.00") if 'admin' in role_names or 'employer' in role_names else Decimal("50.00")
        
        employment = EmploymentRelation(
            user_id=user.id,
            hourly_rate=rate,
            currency="UAH"
        )
        session.add(employment)
        created += 1
        print(f"  Создано трудовое отношение для {user.full_name} (ставка {rate} UAH/час)")
    
    if created > 0:
        print(f"Всего создано {created} трудовых отношений.")


async def main():
    # Сначала создаём таблицы (если их нет)
    await setup_database()
    
    # Затем наполняем данными
    async with AsyncSessionLocal() as session:
        await init_roles(session)
        await init_permissions(session)
        await session.flush()
        await init_role_permissions(session)
        await init_settings(session)
        await init_category_groups(session)
        await init_role_category_groups(session)
        await init_categories(session)
        await init_currencies(session)
        await init_admin(session)
        await init_employment_relations(session)  # Ensure all workers have employment
        await session.commit()
    
    await engine.dispose()
    print("\n✓ Инициализация завершена!")


if __name__ == "__main__":
    asyncio.run(main())
