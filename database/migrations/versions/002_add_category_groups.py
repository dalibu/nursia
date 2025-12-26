"""Add group field to payment_categories

Revision ID: 002_add_category_groups
Revises: 001_add_time_tracking
Create Date: 2025-12-26
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = '002_add_category_groups'
down_revision = '001_add_time_tracking'
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if column exists in table."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        f"SELECT COUNT(*) FROM pragma_table_info('{table_name}') WHERE name='{column_name}'"
    ))
    return result.scalar() > 0


def upgrade() -> None:
    # Add group column to payment_categories if it doesn't exist
    if not column_exists('payment_categories', 'group'):
        op.add_column('payment_categories', sa.Column('group', sa.String(20), nullable=True))
        
        # Set default value for existing rows
        op.execute("UPDATE payment_categories SET \"group\" = 'expense' WHERE \"group\" IS NULL")
        
        # Make column non-nullable after setting defaults
        # SQLite doesn't support ALTER COLUMN, so we leave it nullable


def downgrade() -> None:
    # Remove group column
    if column_exists('payment_categories', 'group'):
        op.drop_column('payment_categories', 'group')
