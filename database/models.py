from datetime import datetime, date, time
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import BigInteger, String, DateTime, Date, Time, func, Numeric, ForeignKey, Text, Boolean, Table, Column, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ================================
# RBAC: Roles, Permissions
# ================================

class RoleType(str, Enum):
    """Тип роли: техническая или бизнес"""
    AUTH = "auth"
    BUSINESS = "business"


class Role(Base):
    """Роли пользователей (admin, employer, worker)"""
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)  # admin, employer, worker
    type: Mapped[str] = mapped_column(String(20))  # auth, business
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    users: Mapped[list["User"]] = relationship("User", secondary="user_roles", back_populates="roles")
    permissions: Mapped[list["Permission"]] = relationship("Permission", secondary="role_permissions", back_populates="roles")
    category_groups: Mapped[list["PaymentCategoryGroup"]] = relationship("PaymentCategoryGroup", secondary="role_category_groups", back_populates="roles")

    def __repr__(self) -> str:
        return f"<Role(id={self.id}, name={self.name}, type={self.type})>"


class Permission(Base):
    """Разрешения для ролей"""
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)  # manage_users, create_payments
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    roles: Mapped[list["Role"]] = relationship("Role", secondary="role_permissions", back_populates="permissions")

    def __repr__(self) -> str:
        return f"<Permission(id={self.id}, name={self.name})>"


# Junction tables for RBAC
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id"), primary_key=True),
)

role_category_groups = Table(
    "role_category_groups",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id"), primary_key=True),
    Column("group_id", Integer, ForeignKey("payment_category_groups.id"), primary_key=True),
)


# ================================
# Users
# ================================

class UserStatusType(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    BLOCKED = "blocked"
    RESETED = "reseted"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    full_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    force_password_change: Mapped[bool] = mapped_column(default=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    last_failed_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    roles: Mapped[list["Role"]] = relationship("Role", secondary="user_roles", back_populates="users")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="payer")
    assignments: Mapped[list["Assignment"]] = relationship("Assignment", back_populates="worker")

    def has_role(self, role_name: str) -> bool:
        """Проверить наличие роли у пользователя"""
        return any(r.name == role_name for r in self.roles)

    def has_permission(self, permission_name: str) -> bool:
        """Проверить наличие разрешения у пользователя через роли"""
        for role in self.roles:
            if any(p.name == permission_name for p in role.permissions):
                return True
        return False

    @property
    def is_admin(self) -> bool:
        return self.has_role("admin")

    @property
    def is_employer(self) -> bool:
        return self.has_role("employer")

    @property
    def is_worker(self) -> bool:
        return self.has_role("worker")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username})>"


class UserStatus(Base):
    __tablename__ = "user_status"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    status: Mapped[UserStatusType] = mapped_column(String(20), default=UserStatusType.PENDING)
    changed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    changed_by_user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[changed_by])

    def __repr__(self) -> str:
        return f"<UserStatus(id={self.id}, user_id={self.user_id}, status={self.status})>"


class RegistrationRequest(Base):
    __tablename__ = "registration_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(nullable=True)

    def __repr__(self) -> str:
        return f"<RegistrationRequest(id={self.id}, username={self.username}, status={self.status})>"


# ================================
# Payment Categories
# ================================

class PaymentCategoryGroup(Base):
    """Группы категорий платежей (Зарплата, Расходы, Премии, Долги и т.д.)"""
    __tablename__ = "payment_category_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)  # salary, expense, bonus, debt
    color: Mapped[str] = mapped_column(String(7), default="#808080")
    emoji: Mapped[str] = mapped_column(String(10), default="💰")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categories: Mapped[list["PaymentCategory"]] = relationship("PaymentCategory", back_populates="category_group")
    roles: Mapped[list["Role"]] = relationship("Role", secondary="role_category_groups", back_populates="category_groups")

    def __repr__(self) -> str:
        return f"<PaymentCategoryGroup(id={self.id}, name={self.name}, code={self.code})>"


class PaymentCategory(Base):
    __tablename__ = "payment_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("payment_category_groups.id"), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    category_group: Mapped[Optional["PaymentCategoryGroup"]] = relationship("PaymentCategoryGroup", back_populates="categories")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="category")

    def __repr__(self) -> str:
        return f"<PaymentCategory(id={self.id}, name={self.name}, group_id={self.group_id})>"


# ================================
# Payments (упрощённая структура)
# ================================

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Кто платит → users!
    category_id: Mapped[int] = mapped_column(ForeignKey("payment_categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payment_status: Mapped[str] = mapped_column(String(20), default='unpaid')  # unpaid, paid, offset
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    assignment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assignments.id"), nullable=True)
    tracking_nr: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    payer: Mapped["User"] = relationship("User", back_populates="payments")
    category: Mapped["PaymentCategory"] = relationship("PaymentCategory", back_populates="payments")
    assignment: Mapped[Optional["Assignment"]] = relationship("Assignment", back_populates="payment")

    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, amount={self.amount}, category_id={self.category_id})>"


# ================================
# System
# ================================

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    def __repr__(self) -> str:
        return f"<SystemSetting(key={self.key}, value={self.value})>"


class Currency(Base):
    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(3), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    symbol: Mapped[str] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(default=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<Currency(id={self.id}, code={self.code}, name={self.name})>"


# ================================
# Employment & Assignments (упрощённая структура)
# ================================

class EmploymentRelation(Base):
    """Трудовые отношения работника с системой"""
    __tablename__ = "employment_relations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Работник
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<EmploymentRelation(user_id={self.user_id}, rate={self.hourly_rate})>"


class TaskType(str, Enum):
    WORK = "work"
    PAUSE = "pause"


class Assignment(Base):
    """Посещение/смена - родительская сущность для tasks"""
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Кто работал → users!
    assignment_date: Mapped[date] = mapped_column(Date)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    tracking_nr: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    worker: Mapped["User"] = relationship("User", back_populates="assignments")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="assignment", order_by="Task.start_time")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="assignment", uselist=False)

    def __repr__(self) -> str:
        return f"<Assignment(id={self.id}, date={self.assignment_date}, user_id={self.user_id})>"


class Task(Base):
    """Рабочий или паузный сегмент внутри assignment"""
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"))
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    task_type: Mapped[str] = mapped_column(String(10), default="work")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="tasks")

    @property
    def duration_seconds(self) -> int:
        """Вычисляемая длительность в секундах"""
        if not self.end_time or not self.start_time:
            return 0
        from datetime import datetime as dt
        start = dt.combine(dt.today(), self.start_time)
        end = dt.combine(dt.today(), self.end_time)
        return int((end - start).total_seconds())

    @property
    def duration_hours(self) -> float:
        """Вычисляемая длительность в часах"""
        return self.duration_seconds / 3600

    @property
    def amount(self) -> Decimal:
        """Вычисляемая сумма (только для work)"""
        if self.task_type != "work" or not self.assignment:
            return Decimal(0)
        hours = Decimal(str(self.duration_hours))
        return hours * self.assignment.hourly_rate

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, type={self.task_type}, start={self.start_time})>"
