"""rename_recipients_to_contributors

Revision ID: 73b5d7bdd8df
Revises: d5e39642bd17
Create Date: 2025-12-02 20:57:59.104936

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73b5d7bdd8df'
down_revision: Union[str, Sequence[str], None] = 'd5e39642bd17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.rename_table('recipients', 'contributors')


def downgrade() -> None:
    """Downgrade schema."""
    op.rename_table('contributors', 'recipients')
