"""add workspaces and email verification

Revision ID: 7a8b33c891fe
Revises: 98c15e8bc5c2
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from database.workspace_migration import upgrade_workspace_schema


revision: str = "7a8b33c891fe"
down_revision: Union[str, Sequence[str], None] = "98c15e8bc5c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    upgrade_workspace_schema(op.get_bind())


def downgrade() -> None:
    connection = op.get_bind()
    workspace_count = connection.execute(sa.text("SELECT COUNT(*) FROM workspaces")).scalar_one()
    if workspace_count > 1:
        raise RuntimeError("Cannot downgrade after data has been split across multiple workspaces")

    for table_name in (
        "payment_categories",
        "payment_category_groups",
        "payments",
        "employment_relations",
        "assignments",
        "tasks",
    ):
        with op.batch_alter_table(table_name) as batch:
            if table_name == "payment_categories":
                batch.drop_constraint("uq_payment_category_workspace_name", type_="unique")
                batch.create_unique_constraint("uq_payment_categories_name", ["name"])
            elif table_name == "payment_category_groups":
                batch.drop_constraint("uq_payment_group_workspace_name", type_="unique")
                batch.drop_constraint("uq_payment_group_workspace_code", type_="unique")
                batch.create_unique_constraint("uq_payment_category_groups_name", ["name"])
                batch.create_unique_constraint("uq_payment_category_groups_code", ["code"])
            batch.drop_column("workspace_id")

    op.drop_index("uq_users_verified_email", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("email_verified")

    op.drop_table("workspace_settings")
    op.drop_table("email_verifications")
    op.drop_table("workspace_invites")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
