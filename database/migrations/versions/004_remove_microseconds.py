"""remove microseconds from expense_date

Revision ID: 004
Revises: 003
Create Date: 2024-11-30 19:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers
revision = '004'
down_revision = 'add_user_registration'
branch_labels = None
depends_on = None


def get_column_names(table_name):
    """Get list of column names for a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return [col['name'] for col in inspector.get_columns(table_name)]


def upgrade():
    # Check which columns exist in the expenses table
    existing_columns = get_column_names('expenses')
    
    # Build the new table structure based on what exists
    has_recipient_id = 'recipient_id' in existing_columns
    has_currency = 'currency' in existing_columns
    
    # Create new table with proper datetime format
    recipient_id_col = "recipient_id INTEGER," if has_recipient_id else ""
    recipient_fk = "FOREIGN KEY(recipient_id) REFERENCES recipients (id)," if has_recipient_id else ""
    currency_col = "currency VARCHAR(3) NOT NULL DEFAULT 'UAH'," if has_currency else ""
    
    op.execute(f"""
        CREATE TABLE expenses_new (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            {recipient_id_col}
            amount NUMERIC(10, 2) NOT NULL,
            {currency_col}
            description TEXT,
            expense_date DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(category_id) REFERENCES expense_categories (id)
            {', ' + recipient_fk.rstrip(',') if recipient_fk else ''}
        )
    """)
    
    # Build INSERT statement with available columns
    base_columns = ['id', 'user_id', 'category_id', 'amount', 'description']
    if has_recipient_id:
        base_columns.insert(3, 'recipient_id')
    if has_currency:
        base_columns.insert(base_columns.index('amount') + 1, 'currency')
    
    columns_str = ', '.join(base_columns)
    select_columns = ', '.join([
        f"datetime({col}, 'localtime')" if col in ('expense_date', 'created_at') else col
        for col in base_columns
    ])
    
    # Add date columns to lists
    all_columns = base_columns + ['expense_date', 'created_at']
    columns_str = ', '.join(all_columns)
    select_columns = ', '.join([
        f"datetime({col}, 'localtime')" if col in ('expense_date', 'created_at') else col
        for col in all_columns
    ])
    
    op.execute(f"""
        INSERT INTO expenses_new ({columns_str})
        SELECT {select_columns}
        FROM expenses
    """)
    
    # Drop old table and rename new one
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_new RENAME TO expenses")


def downgrade():
    # For downgrade, use the same dynamic approach
    existing_columns = get_column_names('expenses')
    
    has_recipient_id = 'recipient_id' in existing_columns
    has_currency = 'currency' in existing_columns
    
    recipient_id_col = "recipient_id INTEGER," if has_recipient_id else ""
    recipient_fk = "FOREIGN KEY(recipient_id) REFERENCES recipients (id)," if has_recipient_id else ""
    currency_col = "currency VARCHAR(3) NOT NULL DEFAULT 'UAH'," if has_currency else ""
    
    op.execute(f"""
        CREATE TABLE expenses_old (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            {recipient_id_col}
            amount NUMERIC(10, 2) NOT NULL,
            {currency_col}
            description TEXT,
            expense_date DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(category_id) REFERENCES expense_categories (id)
            {', ' + recipient_fk.rstrip(',') if recipient_fk else ''}
        )
    """)
    
    op.execute("""
        INSERT INTO expenses_old SELECT * FROM expenses
    """)
    
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_old RENAME TO expenses")