"""rename expenses to payments

Revision ID: 008_rename_expenses_to_payments
Revises: 007_add_user_status_table
Create Date: 2025-12-02 08:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '008_rename_expenses_to_payments'
down_revision: str = '007_add_user_status_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite supports simple table renames
    op.rename_table('expense_categories', 'payment_categories')
    op.rename_table('expenses', 'payments')
    
    # Rename expense_date to payment_date using batch mode for SQLite
    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('expense_date', new_column_name='payment_date')
        # Add new columns for payment tracking
        batch_op.add_column(sa.Column('is_paid', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Revert column changes
    with op.batch_alter_table('payments') as batch_op:
        batch_op.drop_column('paid_at')
        batch_op.drop_column('is_paid')
        batch_op.alter_column('payment_date', new_column_name='expense_date')
    
    # Rename tables back
    op.rename_table('payments', 'expenses')
    op.rename_table('payment_categories', 'expense_categories')

