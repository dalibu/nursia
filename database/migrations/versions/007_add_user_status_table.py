"""Add user_status table

Revision ID: 007_add_user_status_table
Revises: 006_add_currency_default
Create Date: 2024-12-01 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '007_add_user_status_table'
down_revision = '006'
branch_labels = None
depends_on = None

def upgrade():
    # Create user_status table
    op.create_table('user_status',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('changed_by', sa.Integer(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )

def downgrade():
    op.drop_table('user_status')