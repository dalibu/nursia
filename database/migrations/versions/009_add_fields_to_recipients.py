"""add changed_at and is_active to recipients

Revision ID: 009_add_fields_to_recipients
Revises: 008_rename_expenses_to_payments
Create Date: 2025-12-02 11:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '009_add_fields_to_recipients'
down_revision: str = '008_rename_expenses_to_payments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # Create recipients table if it doesn't exist
    if not table_exists('recipients'):
        op.create_table('recipients',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('type', sa.String(length=50), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
            sa.Column('changed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        # Table exists, just add the new columns
        op.add_column('recipients', sa.Column('changed_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column('recipients', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    if table_exists('recipients'):
        op.drop_column('recipients', 'is_active')
        op.drop_column('recipients', 'changed_at')

