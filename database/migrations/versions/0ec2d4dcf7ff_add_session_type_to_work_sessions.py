"""Add session_type to work_sessions

Revision ID: 0ec2d4dcf7ff
Revises: 003_dynamic_category_groups
Create Date: 2025-12-27 06:51:42.451081

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ec2d4dcf7ff'
down_revision: Union[str, Sequence[str], None] = '003_dynamic_category_groups'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('work_sessions', sa.Column('session_type', sa.String(length=10), nullable=False, server_default='work'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('work_sessions', 'session_type')
