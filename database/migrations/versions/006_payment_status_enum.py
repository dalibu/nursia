"""Add payment_status enum to payments

Revision ID: 006_payment_status
Revises: 005_make_tracking_nr_nullable
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_payment_status_enum'
down_revision = '005_make_tracking_nr_nullable'
branch_labels = None
depends_on = None


def upgrade():
    # Add payment_status column with default 'unpaid'
    op.add_column('payments', sa.Column('payment_status', sa.String(20), nullable=True))
    
    # Migrate data from is_paid to payment_status
    op.execute("""
        UPDATE payments 
        SET payment_status = CASE 
            WHEN is_paid = 1 THEN 'paid' 
            ELSE 'unpaid' 
        END
    """)
    
    # Make payment_status not nullable after migration
    op.alter_column('payments', 'payment_status', nullable=False, server_default='unpaid')
    
    # Note: SQLite doesn't support dropping columns directly
    # The is_paid column will be kept for backwards compatibility
    # and can be removed in a future migration if needed


def downgrade():
    # Migrate data back from payment_status to is_paid
    op.execute("""
        UPDATE payments 
        SET is_paid = CASE 
            WHEN payment_status = 'paid' THEN 1 
            WHEN payment_status = 'offset' THEN 1
            ELSE 0 
        END
    """)
    
    # Drop payment_status column
    op.drop_column('payments', 'payment_status')
