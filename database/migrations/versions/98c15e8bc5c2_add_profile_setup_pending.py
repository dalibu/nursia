"""add profile setup pending flag

Revision ID: 98c15e8bc5c2
Revises: a1b2c3d4e5f6
Create Date: 2026-11-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "98c15e8bc5c2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "profile_setup_pending",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("profile_setup_pending")
