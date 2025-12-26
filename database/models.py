from datetime import datetime, date, time
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import BigInteger, String, DateTime, Date, Time, func, Numeric, ForeignKey, Text, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    PENDING = "pending"
    BLOCKED = "blocked"

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
    role: Mapped[UserRole] = mapped_column(String, default=UserRole.PENDING)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    force_password_change: Mapped[bool] = mapped_column(default=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    last_failed_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())




    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"


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


class PaymentCategoryGroup(Base):
    """Группы категорий платежей (Зарплата, Расходы, Премии, Долги и т.д.)"""
    __tablename__ = "payment_category_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)  # Название группы
    color: Mapped[str] = mapped_column(String(7), default="#808080")  # Hex color
    emoji: Mapped[str] = mapped_column(String(10), default="💰")  # Emoji icon
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categories: Mapped[list["PaymentCategory"]] = relationship("PaymentCategory", back_populates="category_group")

    def __repr__(self) -> str:
        return f"<PaymentCategoryGroup(id={self.id}, name={self.name})>"


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


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("payment_categories.id"))
    recipient_id: Mapped[Optional[int]] = mapped_column(ForeignKey("contributors.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_paid: Mapped[bool] = mapped_column(default=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    work_session_id: Mapped[Optional[int]] = mapped_column(ForeignKey("work_sessions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    payer: Mapped["Contributor"] = relationship("Contributor", foreign_keys=[payer_id])
    category: Mapped["PaymentCategory"] = relationship("PaymentCategory", back_populates="payments")
    recipient: Mapped[Optional["Contributor"]] = relationship("Contributor", foreign_keys=[recipient_id], back_populates="payments")
    work_session: Mapped[Optional["WorkSession"]] = relationship("WorkSession", back_populates="payment")

    def __repr__(self) -> str:
        return f"<Payment(id={self.id}, amount={self.amount}, category_id={self.category_id})>"


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
    code: Mapped[str] = mapped_column(String(3), unique=True)  # UAH, EUR, USD, RUB
    name: Mapped[str] = mapped_column(String(100))  # Ukrainian Hryvnia
    symbol: Mapped[str] = mapped_column(String(10))  # ₴, €, $, ₽
    is_active: Mapped[bool] = mapped_column(default=True)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<Currency(id={self.id}, code={self.code}, name={self.name})>"


class Contributor(Base):
    __tablename__ = "contributors"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)  # Связь с User
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))  # 'user' или 'organization'
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    user: Mapped[Optional["User"]] = relationship("User")
    payments: Mapped[list["Payment"]] = relationship("Payment", foreign_keys="[Payment.recipient_id]", back_populates="recipient")
    payments_made: Mapped[list["Payment"]] = relationship("Payment", foreign_keys="[Payment.payer_id]", back_populates="payer")

    def __repr__(self) -> str:
        return f"<Contributor(id={self.id}, name={self.name}, type={self.type})>"


class EmploymentRelation(Base):
    """Трудовые отношения: работодатель нанимает работника с почасовой ставкой"""
    __tablename__ = "employment_relations"

    id: Mapped[int] = mapped_column(primary_key=True)
    employer_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))  # Кто нанимает (А)
    employee_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))  # Кто работает (Е)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # 100 ₴/час
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    employer: Mapped["Contributor"] = relationship("Contributor", foreign_keys=[employer_id])
    employee: Mapped["Contributor"] = relationship("Contributor", foreign_keys=[employee_id])

    def __repr__(self) -> str:
        return f"<EmploymentRelation(employer={self.employer_id}, employee={self.employee_id}, rate={self.hourly_rate})>"


class WorkSession(Base):
    """Рабочая сессия: начало и конец работы"""
    __tablename__ = "work_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))  # Кто работает (Е)
    employer_id: Mapped[int] = mapped_column(ForeignKey("contributors.id"))  # Кто нанял (А)
    session_date: Mapped[date] = mapped_column(Date)  # Дата работы
    start_time: Mapped[time] = mapped_column(Time)  # Время начала
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)  # Время окончания
    duration_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)  # Длительность в часах
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))  # Ставка за час
    currency: Mapped[str] = mapped_column(String(3), default="UAH")
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)  # duration × rate
    is_active: Mapped[bool] = mapped_column(default=True)  # В процессе работы?
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    worker: Mapped["Contributor"] = relationship("Contributor", foreign_keys=[worker_id])
    employer: Mapped["Contributor"] = relationship("Contributor", foreign_keys=[employer_id])
    payment: Mapped[Optional["Payment"]] = relationship("Payment", back_populates="work_session", uselist=False)

    def __repr__(self) -> str:
        return f"<WorkSession(id={self.id}, date={self.session_date}, worker={self.worker_id})>"
