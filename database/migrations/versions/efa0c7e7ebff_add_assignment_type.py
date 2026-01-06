"""add_assignment_type

Revision ID: efa0c7e7ebff
Revises: 
Create Date: 2026-01-05 20:30:45.028181

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'efa0c7e7ebff'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add assignment_type column with default value for existing records
    op.add_column('assignments', sa.Column('assignment_type', sa.String(length=20), nullable=False, server_default='work'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('assignments', 'assignment_type')
