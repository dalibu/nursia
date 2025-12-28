"""Add tracking_nr to payments and assignments

Revision ID: 004_add_tracking_nr
Revises: 8b377b57422f
Create Date: 2024-12-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_add_tracking_nr'
down_revision = '8b377b57422f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tracking_nr column to payments (nullable first for backfill)
    op.add_column('payments', sa.Column('tracking_nr', sa.String(20), nullable=True))
    
    # Add tracking_nr column to assignments (nullable first for backfill)
    op.add_column('assignments', sa.Column('tracking_nr', sa.String(20), nullable=True))
    
    # Backfill existing records with simple P-{id} / A-{id} format
    conn = op.get_bind()
    
    # Update payments to P-{id} format
    conn.execute(sa.text("UPDATE payments SET tracking_nr = 'P-' || id"))
    
    # Update assignments to A-{id} format
    conn.execute(sa.text("UPDATE assignments SET tracking_nr = 'A-' || id"))
    
    # Now make columns non-nullable and add unique constraint
    # SQLite requires table recreation for this
    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=False, existing_type=sa.String(20))
        batch_op.create_unique_constraint('uq_payments_tracking_nr', ['tracking_nr'])
    
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=False, existing_type=sa.String(20))
        batch_op.create_unique_constraint('uq_assignments_tracking_nr', ['tracking_nr'])


def downgrade() -> None:
    with op.batch_alter_table('payments') as batch_op:
        batch_op.drop_constraint('uq_payments_tracking_nr', type_='unique')
        batch_op.drop_column('tracking_nr')
    
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.drop_constraint('uq_assignments_tracking_nr', type_='unique')
        batch_op.drop_column('tracking_nr')
