"""add changed_at and is_active to recipients

Revision ID: 009_add_fields_to_recipients
Revises: 008_rename_expenses_to_payments
Create Date: 2025-12-02 11:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '009_add_fields_to_recipients'
down_revision: str = '008_rename_expenses_to_payments'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recipients', sa.Column('changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('recipients', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('recipients', 'is_active')
    op.drop_column('recipients', 'changed_at')
