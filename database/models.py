from datetime import datetime, date, time, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import BigInteger, String, DateTime, Date, Time, func, Numeric, ForeignKey, Text, Boolean, Table, Column, Integer, TypeDecorator, Index, UniqueConstraint, and_
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class CleanDateTime(TypeDecorator):
    """DateTime that ensures no microseconds are stored in SQLite"""
    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            # If value is already a string (from DB), parse it first
            if isinstance(value, str):
                try:
                    value = datetime.fromisoformat(value)
                except ValueError:
                    value = datetime.fromisoformat(value.replace(" ", "T"))
            
            # Now value is a datetime object - ensure microsecond is 0
            if isinstance(value, datetime):
                value = value.replace(microsecond=0)
                if dialect.name == 'sqlite':
                    # Enforce clean string format for SQLite
                    return value.strftime('%Y-%m-%d %H:%M:%S')
                # For other dialects, can default to standard behavior or string
                return value.strftime('%Y-%m-%d %H:%M:%S')
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            # Parse back to datetime
            try:
                dt = datetime.fromisoformat(value)
            except ValueError:
                dt = datetime.fromisoformat(value.replace(" ", "T"))
            
            # Since we store as simple strings without TZ info in SQLite, 
            # we need to attach UTC timezone when reading back to match application logic
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        return value


class Base(DeclarativeBase):
    pass


class WorkspaceScoped:
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), index=True)


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
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    full_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    force_password_change: Mapped[bool] = mapped_column(default=False)
    profile_setup_pending: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    last_failed_login: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(CleanDateTime(), onupdate=func.now(), server_default=func.now())

    roles: Mapped[list["Role"]] = relationship("Role", secondary="user_roles", back_populates="users")
    payments_made: Mapped[list["Payment"]] = relationship("Payment", foreign_keys="Payment.payer_id", back_populates="payer")
    payments_received: Mapped[list["Payment"]] = relationship("Payment", foreign_keys="Payment.recipient_id", back_populates="recipient")
    assignments: Mapped[list["Assignment"]] = relationship("Assignment", back_populates="worker")
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def workspace_role(self) -> Optional[str]:
        return self.__dict__.get("_workspace_role")

    @workspace_role.setter
    def workspace_role(self, value: Optional[str]) -> None:
        self.__dict__["_workspace_role"] = value

    def has_role(self, role_name: str) -> bool:
        """Проверить наличие роли у пользователя"""
        if self.workspace_role is not None and role_name in {"admin", "worker", "employer"}:
            if role_name in {"admin", "employer"}:
                return self.workspace_role == "admin"
            return self.workspace_role == "worker"
        return any(r.name == role_name for r in self.roles)

    def has_permission(self, permission_name: str) -> bool:
        """Проверить наличие разрешения у пользователя через роли"""
        if self.workspace_role is not None:
            return self.workspace_role == "admin" and permission_name == "view_all_reports"
        for role in self.roles:
            if any(p.name == permission_name for p in role.permissions):
                return True
        return False

    @property
    def is_admin(self) -> bool:
        if self.workspace_role is not None:
            return self.workspace_role == "admin"
        return self.has_role("admin")

    @property
    def is_employer(self) -> bool:
        if self.workspace_role is not None:
            return self.workspace_role == "admin"
        return self.has_role("employer")

    @property
    def is_worker(self) -> bool:
        if self.workspace_role is not None:
            return self.workspace_role == "worker"
        return self.has_role("worker")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username})>"


Index(
    "uq_users_verified_email",
    func.lower(User.email),
    unique=True,
    sqlite_where=and_(User.email.is_not(None), User.email != "", User.email_verified.is_(True)),
)


class UserStatus(Base):
    __tablename__ = "user_status"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    status: Mapped[UserStatusType] = mapped_column(String(20), default=UserStatusType.PENDING)
    changed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(CleanDateTime(), onupdate=func.now(), server_default=func.now())

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
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(nullable=True)

    def __repr__(self) -> str:
        return f"<RegistrationRequest(id={self.id}, username={self.username}, status={self.status})>"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    default_currency: Mapped[str] = mapped_column(String(3), default="UAH")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id])
    members: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )
    invites: Mapped[list["WorkspaceInvite"]] = relationship(
        "WorkspaceInvite", back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), default="worker")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="workspace_memberships")


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(255), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(20), default="worker")
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(CleanDateTime())
    accepted_at: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="invites")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by])


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    workspace_name: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(CleanDateTime())
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User")


class WorkspaceSetting(WorkspaceScoped, Base):
    __tablename__ = "workspace_settings"
    __table_args__ = (
        UniqueConstraint("workspace_id", "key", name="uq_workspace_settings_workspace_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(100))
    value: Mapped[str] = mapped_column(String(500))
    updated_at: Mapped[datetime] = mapped_column(CleanDateTime(), onupdate=func.now(), server_default=func.now())


# ================================
# Payment Categories
# ================================

class PaymentGroupCode(str, Enum):
    """Коды групп категорий платежей"""
    SALARY = "salary"      # Зарплата
    EXPENSE = "expense"    # Расходы
    BONUS = "bonus"        # Премии
    DEBT = "debt"          # Долги
    REPAYMENT = "repayment"  # Погашения

class PaymentStatus(str, Enum):
    """Статусы платежей"""
    UNPAID = "unpaid"      # Не оплачено
    PAID = "paid"          # Оплачено
    OFFSET = "offset"      # Зачтено в счет долга

class PaymentCategoryGroup(WorkspaceScoped, Base):
    """Группы категорий платежей (Зарплата, Расходы, Премии, Долги и т.д.)"""
    __tablename__ = "payment_category_groups"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_payment_group_workspace_name"),
        UniqueConstraint("workspace_id", "code", name="uq_payment_group_workspace_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # salary, expense, bonus, debt
    color: Mapped[str] = mapped_column(String(7), default="#808080")
    emoji: Mapped[str] = mapped_column(String(10), default="💰")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categories: Mapped[list["PaymentCategory"]] = relationship("PaymentCategory", back_populates="category_group")
    roles: Mapped[list["Role"]] = relationship("Role", secondary="role_category_groups", back_populates="category_groups")

    def __repr__(self) -> str:
        return f"<PaymentCategoryGroup(id={self.id}, name={self.name}, code={self.code})>"


class PaymentCategory(WorkspaceScoped, Base):
    __tablename__ = "payment_categories"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_payment_category_workspace_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
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

class Payment(WorkspaceScoped, Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Кто платит (работодатель)
    recipient_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)  # Кто получает (работник)
    category_id: Mapped[int] = mapped_column(ForeignKey("payment_categories.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_date: Mapped[datetime] = mapped_column(CleanDateTime())
    payment_status: Mapped[str] = mapped_column(String(20), default='unpaid')  # unpaid, paid
    paid_at: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)
    assignment_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assignments.id"), nullable=True)
    tracking_nr: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    modified_at: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)

    payer: Mapped["User"] = relationship("User", foreign_keys=[payer_id], back_populates="payments_made")
    recipient: Mapped[Optional["User"]] = relationship("User", foreign_keys=[recipient_id], back_populates="payments_received")
    category: Mapped["PaymentCategory"] = relationship("PaymentCategory", back_populates="payments")
    assignment: Mapped[Optional["Assignment"]] = relationship("Assignment", back_populates="payment")

    @property
    def assignment_tracking_nr(self) -> Optional[str]:
        return self.assignment.tracking_nr if self.assignment else None

    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, amount={self.amount}, payer={self.payer_id}, recipient={self.recipient_id})>"


# ================================
# System
# ================================

class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500))
    value_type: Mapped[str] = mapped_column(String(20), default="string")  # string, boolean, number
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(CleanDateTime(), onupdate=func.now(), server_default=func.now())

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

class EmploymentRelation(WorkspaceScoped, Base):
    """Трудовые отношения работника с системой"""
    __tablename__ = "employment_relations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Работник
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), onupdate=func.now(), nullable=True)

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<EmploymentRelation(user_id={self.user_id}, rate={self.hourly_rate})>"


class TaskType(str, Enum):
    WORK = "work"
    PAUSE = "pause"
    ABSENT = "absent"


class AssignmentType(str, Enum):
    """Тип записи/смены"""
    WORK = "work"           # Обычная рабочая смена
    SICK_LEAVE = "sick_leave"   # Больничный
    VACATION = "vacation"       # Отпуск (оплачиваемый)
    DAY_OFF = "day_off"         # Отгул
    UNPAID_LEAVE = "unpaid_leave"  # Отпуск за свой счёт


class Assignment(WorkspaceScoped, Base):
    """Посещение/смена - родительская сущность для tasks"""
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Кто работал → users!
    assignment_type: Mapped[str] = mapped_column(String(20), default="work")  # work, sick_leave, vacation, day_off, unpaid_leave
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tracking_nr: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    worker: Mapped["User"] = relationship("User", back_populates="assignments")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="assignment", order_by="Task.start_time")
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="assignment", uselist=False)

    @property
    def start_time(self) -> Optional[datetime]:
        """Время начала = start_time первого task"""
        if not self.tasks:
            return None
        return min(t.start_time for t in self.tasks)

    @property
    def end_time(self) -> Optional[datetime]:
        """Время окончания = end_time последнего task (None если есть активный)"""
        if not self.tasks:
            return None
        last_task = max(self.tasks, key=lambda t: t.start_time)
        return last_task.end_time

    @property
    def is_active(self) -> bool:
        """Смена активна если есть task без end_time"""
        return any(t.end_time is None for t in self.tasks)

    @property
    def assignment_date(self) -> Optional[date]:
        """Дата смены = дата первого task (для обратной совместимости)"""
        if self.start_time:
            return self.start_time.date()
        return None

    def __repr__(self) -> str:
        return f"<Assignment(id={self.id}, user_id={self.user_id}, type={self.assignment_type})>"


class Task(WorkspaceScoped, Base):
    """Рабочий или паузный сегмент внутри assignment"""
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"))
    start_time: Mapped[datetime] = mapped_column(CleanDateTime())  # Полная дата+время
    end_time: Mapped[Optional[datetime]] = mapped_column(CleanDateTime(), nullable=True)  # Полная дата+время
    task_type: Mapped[str] = mapped_column(String(10), default="work")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tracking_nr: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)  # Txxx
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="tasks")

    @property
    def duration_seconds(self) -> int:
        """Вычисляемая длительность в секундах"""
        if not self.end_time or not self.start_time:
            return 0
        return int((self.end_time - self.start_time).total_seconds())

    @property
    def duration_hours(self) -> float:
        """Вычисляемая длительность в часах"""
        return self.duration_seconds / 3600

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, type={self.task_type}, start={self.start_time})>"

