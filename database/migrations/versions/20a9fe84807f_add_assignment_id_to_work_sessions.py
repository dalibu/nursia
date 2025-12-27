"""Add assignment_id to work_sessions

Revision ID: 20a9fe84807f
Revises: 0ec2d4dcf7ff
Create Date: 2025-12-27 07:12:50.466897

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20a9fe84807f'
down_revision: Union[str, Sequence[str], None] = '0ec2d4dcf7ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('work_sessions', sa.Column('assignment_id', sa.Integer(), nullable=True))
    # Set assignment_id = id for existing sessions (each becomes its own assignment)
    op.execute("UPDATE work_sessions SET assignment_id = id WHERE assignment_id IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('work_sessions', 'assignment_id')
