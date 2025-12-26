"""add time tracking models

Revision ID: 001_add_time_tracking
Revises: 
Create Date: 2025-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '001_add_time_tracking'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Проверяет, существует ли столбец в таблице."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(table_name: str) -> bool:
    """Проверяет, существует ли таблица."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # Добавляем user_id в contributors (если не существует)
    if table_exists('contributors') and not column_exists('contributors', 'user_id'):
        op.add_column('contributors', sa.Column('user_id', sa.Integer(), nullable=True))
        # SQLite не поддерживает ADD CONSTRAINT для foreign key, пропускаем
    
    # Добавляем payment_type в payments (если не существует)
    if table_exists('payments') and not column_exists('payments', 'payment_type'):
        op.add_column('payments', sa.Column('payment_type', sa.String(length=20), server_default='expense', nullable=False))
    
    # Добавляем work_session_id в payments (если не существует)
    if table_exists('payments') and not column_exists('payments', 'work_session_id'):
        op.add_column('payments', sa.Column('work_session_id', sa.Integer(), nullable=True))
    
    # Создаём таблицу employment_relations (если не существует)
    if not table_exists('employment_relations'):
        op.create_table('employment_relations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('employer_id', sa.Integer(), nullable=False),
            sa.Column('employee_id', sa.Integer(), nullable=False),
            sa.Column('hourly_rate', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('currency', sa.String(length=3), server_default='UAH', nullable=False),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['employer_id'], ['contributors.id']),
            sa.ForeignKeyConstraint(['employee_id'], ['contributors.id']),
            sa.PrimaryKeyConstraint('id')
        )
    
    # Создаём таблицу work_sessions (если не существует)
    if not table_exists('work_sessions'):
        op.create_table('work_sessions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('worker_id', sa.Integer(), nullable=False),
            sa.Column('employer_id', sa.Integer(), nullable=False),
            sa.Column('session_date', sa.Date(), nullable=False),
            sa.Column('start_time', sa.Time(), nullable=False),
            sa.Column('end_time', sa.Time(), nullable=True),
            sa.Column('duration_hours', sa.Numeric(precision=5, scale=2), nullable=True),
            sa.Column('hourly_rate', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('currency', sa.String(length=3), server_default='UAH', nullable=False),
            sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(['worker_id'], ['contributors.id']),
            sa.ForeignKeyConstraint(['employer_id'], ['contributors.id']),
            sa.PrimaryKeyConstraint('id')
        )


def downgrade() -> None:
    # Удаляем таблицы (безопасно)
    if table_exists('work_sessions'):
        op.drop_table('work_sessions')
    if table_exists('employment_relations'):
        op.drop_table('employment_relations')
    
    # Удаляем столбцы из payments
    if table_exists('payments'):
        if column_exists('payments', 'work_session_id'):
            op.drop_column('payments', 'work_session_id')
        if column_exists('payments', 'payment_type'):
            op.drop_column('payments', 'payment_type')
    
    # Удаляем user_id из contributors
    if table_exists('contributors') and column_exists('contributors', 'user_id'):
        op.drop_column('contributors', 'user_id')
