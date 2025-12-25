"""Add user registration system

Revision ID: add_user_registration
Revises: d3ebf96b1214
Create Date: 2024-11-30 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers
revision = 'add_user_registration'
down_revision = 'd3ebf96b1214'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Добавляем новые поля для обычной регистрации (только если не существуют)
    if not column_exists('users', 'username'):
        op.add_column('users', sa.Column('username', sa.String(50), unique=True, nullable=True))
    if not column_exists('users', 'password_hash'):
        op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    if not column_exists('users', 'email'):
        op.add_column('users', sa.Column('email', sa.String(100), nullable=True))
    if not column_exists('users', 'status'):
        op.add_column('users', sa.Column('status', sa.String(20), default='pending', nullable=False))
    
    # Создаем таблицу заявок на регистрацию
    op.create_table('registration_requests',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.Column('full_name', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime, default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime, nullable=True),
        sa.Column('reviewed_by', sa.Integer, nullable=True)
    )

def downgrade():
    op.drop_table('registration_requests')
    op.drop_column('users', 'status')
    op.drop_column('users', 'email')
    op.drop_column('users', 'password_hash')
    op.drop_column('users', 'username')