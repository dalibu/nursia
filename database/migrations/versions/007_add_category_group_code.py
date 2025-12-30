"""Add code field to payment_category_groups

Revision ID: 007_add_category_group_code
Revises: 006_payment_status_enum
Create Date: 2025-12-30

Adds a 'code' column for type-safe group identification:
- salary: Зарплата
- expense: Расходы  
- bonus: Премии
- debt: Долги
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_add_category_group_code'
down_revision = '006_payment_status_enum'
branch_labels = None
depends_on = None


def upgrade():
    # SQLite doesn't support ADD COLUMN with UNIQUE constraint
    # Using table recreation approach
    
    # 1. Create new table with code column
    op.execute("""
        CREATE TABLE payment_category_groups_new (
            id INTEGER PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            code VARCHAR(20) UNIQUE,
            color VARCHAR(7) DEFAULT '#808080',
            emoji VARCHAR(10) DEFAULT '💰',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Copy data from old table
    op.execute("""
        INSERT INTO payment_category_groups_new (id, name, color, emoji, is_active, created_at)
        SELECT id, name, color, emoji, is_active, created_at
        FROM payment_category_groups
    """)
    
    # 3. Set codes based on names
    op.execute("UPDATE payment_category_groups_new SET code = 'salary' WHERE name = 'Зарплата'")
    op.execute("UPDATE payment_category_groups_new SET code = 'expense' WHERE name = 'Расходы'")
    op.execute("UPDATE payment_category_groups_new SET code = 'bonus' WHERE name = 'Премии'")
    op.execute("UPDATE payment_category_groups_new SET code = 'debt' WHERE name = 'Долги'")
    
    # 4. Drop old table
    op.execute("DROP TABLE payment_category_groups")
    
    # 5. Rename new table
    op.execute("ALTER TABLE payment_category_groups_new RENAME TO payment_category_groups")


def downgrade():
    # Remove code column by recreating table
    op.execute("""
        CREATE TABLE payment_category_groups_old (
            id INTEGER PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            color VARCHAR(7) DEFAULT '#808080',
            emoji VARCHAR(10) DEFAULT '💰',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    op.execute("""
        INSERT INTO payment_category_groups_old (id, name, color, emoji, is_active, created_at)
        SELECT id, name, color, emoji, is_active, created_at
        FROM payment_category_groups
    """)
    
    op.execute("DROP TABLE payment_category_groups")
    op.execute("ALTER TABLE payment_category_groups_old RENAME TO payment_category_groups")
