"""rename expenses to payments

Revision ID: 008_rename_expenses_to_payments
Revises: 007_add_user_status_table
Create Date: 2025-12-02 08:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '008_rename_expenses_to_payments'
down_revision: str = '007_add_user_status_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Rename tables
    op.rename_table('expense_categories', 'payment_categories')
    op.rename_table('expenses', 'payments')
    
    # Rename foreign key constraints
    op.drop_constraint('expenses_category_id_fkey', 'payments', type_='foreignkey')
    op.drop_constraint('expenses_recipient_id_fkey', 'payments', type_='foreignkey')
    op.drop_constraint('expenses_user_id_fkey', 'payments', type_='foreignkey')
    
    # Recreate foreign keys with new table names
    op.create_foreign_key(
        'payments_category_id_fkey', 'payments', 'payment_categories',
        ['category_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'payments_recipient_id_fkey', 'payments', 'recipients',
        ['recipient_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'payments_user_id_fkey', 'payments', 'users',
        ['user_id'], ['id'], ondelete='CASCADE'
    )
    
    # Rename index if it exists
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_expenses_user_id') THEN
            ALTER INDEX ix_expenses_user_id RENAME TO ix_payments_user_id;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_expenses_category_id') THEN
            ALTER INDEX ix_expenses_category_id RENAME TO ix_payments_category_id;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_expenses_recipient_id') THEN
            ALTER INDEX ix_expenses_recipient_id RENAME TO ix_payments_recipient_id;
        END IF;
    END
    $$;
    """)

def downgrade() -> None:
    # Revert index renaming
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_user_id') THEN
            ALTER INDEX ix_payments_user_id RENAME TO ix_expenses_user_id;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_category_id') THEN
            ALTER INDEX ix_payments_category_id RENAME TO ix_expenses_category_id;
        END IF;
        
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_recipient_id') THEN
            ALTER INDEX ix_payments_recipient_id RENAME TO ix_expenses_recipient_id;
        END IF;
    END
    $$;
    """)
    
    # Drop new foreign key constraints
    op.drop_constraint('payments_category_id_fkey', 'payments', type_='foreignkey')
    op.drop_constraint('payments_recipient_id_fkey', 'payments', type_='foreignkey')
    op.drop_constraint('payments_user_id_fkey', 'payments', type_='foreignkey')
    
    # Recreate old foreign key constraints
    op.create_foreign_key(
        'expenses_category_id_fkey', 'payments', 'payment_categories',
        ['category_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'expenses_recipient_id_fkey', 'payments', 'recipients',
        ['recipient_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'expenses_user_id_fkey', 'payments', 'users',
        ['user_id'], ['id'], ondelete='CASCADE'
    )
    
    # Rename tables back
    op.rename_table('payments', 'expenses')
    op.rename_table('payment_categories', 'expense_categories')
