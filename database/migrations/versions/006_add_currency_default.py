"""Add is_default field to currencies table

Revision ID: 006
Revises: 005
Create Date: 2025-12-01 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None

def upgrade():
    # Add is_default column
    op.add_column('currencies', sa.Column('is_default', sa.Boolean(), default=False))
    
    # Set UAH as default currency
    op.execute("UPDATE currencies SET is_default = 1 WHERE code = 'UAH'")
    op.execute("UPDATE currencies SET is_default = 0 WHERE code != 'UAH'")

def downgrade():
    op.drop_column('currencies', 'is_default')