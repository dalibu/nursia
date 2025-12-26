"""Create payment_category_groups table and migrate data

Revision ID: 003_dynamic_category_groups
Revises: 002_add_category_groups
Create Date: 2025-12-26
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '003_dynamic_category_groups'
down_revision = '002_add_category_groups'
branch_labels = None
depends_on = None


def table_exists(table_name: str) -> bool:
    """Check if table exists."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'"
    ))
    return result.scalar() is not None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists in table."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        f"SELECT COUNT(*) FROM pragma_table_info('{table_name}') WHERE name='{column_name}'"
    ))
    return result.scalar() > 0


def upgrade() -> None:
    # Create payment_category_groups table if it doesn't exist
    if not table_exists('payment_category_groups'):
        op.create_table(
            'payment_category_groups',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('name', sa.String(100), unique=True, nullable=False),
            sa.Column('color', sa.String(7), nullable=False, server_default='#808080'),
            sa.Column('emoji', sa.String(10), nullable=False, server_default='💰'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now())
        )
        
        # Seed initial groups
        op.execute("""
            INSERT INTO payment_category_groups (name, color, emoji) VALUES
            ('Зарплата', '#4caf50', '💰'),
            ('Расходы', '#f44336', '🛒'),
            ('Премии', '#9c27b0', '🎁'),
            ('Долги', '#ff9800', '💳')
        """)
    else:
        # Table exists - add emoji column if missing (migrate from old structure)
        if not column_exists('payment_category_groups', 'emoji'):
            op.add_column('payment_category_groups', sa.Column('emoji', sa.String(10), nullable=True))
            # Set default emoji based on old icon or name
            op.execute("""
                UPDATE payment_category_groups SET emoji = CASE
                    WHEN icon = 'Work' OR name LIKE '%арплат%' THEN '💰'
                    WHEN icon = 'ShoppingCart' OR name LIKE '%асход%' THEN '🛒'
                    WHEN icon = 'CardGiftcard' OR name LIKE '%реми%' OR name LIKE '%одар%' THEN '🎁'
                    WHEN icon = 'AccountBalance' OR name LIKE '%олг%' THEN '💳'
                    ELSE '💰'
                END
            """)
    
    # Add group_id column to payment_categories
    if not column_exists('payment_categories', 'group_id'):
        op.add_column('payment_categories', sa.Column('group_id', sa.Integer(), nullable=True))
        
        # Migrate data: set group_id based on existing group string (if exists)
        if column_exists('payment_categories', 'group'):
            op.execute("""
                UPDATE payment_categories 
                SET group_id = (
                    SELECT id FROM payment_category_groups 
                    WHERE (payment_categories."group" = 'work' AND name = 'Зарплата')
                       OR (payment_categories."group" = 'expense' AND name = 'Расходы')
                       OR (payment_categories."group" = 'bonus' AND name = 'Премии')
                       OR (payment_categories."group" = 'debt' AND name = 'Долги')
                    LIMIT 1
                )
            """)
    
    # Remove legacy 'group' column by recreating table (SQLite doesn't support DROP COLUMN)
    if column_exists('payment_categories', 'group'):
        # Create new table without 'group' column
        op.execute("""
            CREATE TABLE payment_categories_new (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                group_id INTEGER REFERENCES payment_category_groups(id),
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Copy data
        op.execute("""
            INSERT INTO payment_categories_new (id, name, group_id, description, created_at)
            SELECT id, name, group_id, description, created_at FROM payment_categories
        """)
        # Drop old table
        op.execute("DROP TABLE payment_categories")
        # Rename new table
        op.execute("ALTER TABLE payment_categories_new RENAME TO payment_categories")


def downgrade() -> None:
    # Remove group_id column
    if column_exists('payment_categories', 'group_id'):
        op.drop_column('payment_categories', 'group_id')
    
    # Drop payment_category_groups table
    if table_exists('payment_category_groups'):
        op.drop_table('payment_category_groups')
