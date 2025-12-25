"""rename_user_id_to_payer_id

Revision ID: d5e39642bd17
Revises: 009_add_fields_to_recipients
Create Date: 2025-12-02 14:28:26.316464

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd5e39642bd17'
down_revision: Union[str, Sequence[str], None] = '009_add_fields_to_recipients'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def get_column_names(table_name):
    """Get list of column names for a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return [col['name'] for col in inspector.get_columns(table_name)]


def upgrade() -> None:
    """Upgrade schema."""
    # Get current columns in payments table
    existing_columns = get_column_names('payments')
    has_recipient_id = 'recipient_id' in existing_columns
    
    # Step 1: Create new payments table with payer_id
    op.execute("""
        CREATE TABLE payments_new (
            id INTEGER NOT NULL PRIMARY KEY,
            payer_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            recipient_id INTEGER,
            amount NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            description TEXT,
            payment_date DATETIME NOT NULL,
            is_paid BOOLEAN NOT NULL DEFAULT 0,
            paid_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(payer_id) REFERENCES recipients (id),
            FOREIGN KEY(category_id) REFERENCES payment_categories (id),
            FOREIGN KEY(recipient_id) REFERENCES recipients (id)
        )
    """)
    
    # Step 2: Copy data from old table, mapping user_id to payer_id
    if has_recipient_id:
        op.execute("""
            INSERT INTO payments_new (id, payer_id, category_id, recipient_id, amount, currency, description, payment_date, is_paid, paid_at, created_at)
            SELECT id, user_id, category_id, recipient_id, amount, currency, description, payment_date, is_paid, paid_at, created_at
            FROM payments
        """)
    else:
        # recipient_id doesn't exist in old table, use NULL
        op.execute("""
            INSERT INTO payments_new (id, payer_id, category_id, recipient_id, amount, currency, description, payment_date, is_paid, paid_at, created_at)
            SELECT id, user_id, category_id, NULL, amount, currency, description, payment_date, is_paid, paid_at, created_at
            FROM payments
        """)
    
    # Step 3: Drop old table
    op.execute("DROP TABLE payments")
    
    # Step 4: Rename new table
    op.execute("ALTER TABLE payments_new RENAME TO payments")


def downgrade() -> None:
    """Downgrade schema."""
    # Reverse the changes: rename payer_id back to user_id
    op.execute("""
        CREATE TABLE payments_old (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            recipient_id INTEGER,
            amount NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            description TEXT,
            payment_date DATETIME NOT NULL,
            is_paid BOOLEAN NOT NULL DEFAULT 0,
            paid_at DATETIME,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(category_id) REFERENCES payment_categories (id),
            FOREIGN KEY(recipient_id) REFERENCES recipients (id)
        )
    """)
    
    op.execute("""
        INSERT INTO payments_old (id, user_id, category_id, recipient_id, amount, currency, description, payment_date, is_paid, paid_at, created_at)
        SELECT id, payer_id, category_id, recipient_id, amount, currency, description, payment_date, is_paid, paid_at, created_at
        FROM payments
    """)
    
    op.execute("DROP TABLE payments")
    op.execute("ALTER TABLE payments_old RENAME TO payments")

