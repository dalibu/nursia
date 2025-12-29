"""Make tracking_nr nullable for deferred assignment after flush
and update format to remove dashes (P-12 -> P12, A-21 -> A21)

Revision ID: 005_make_tracking_nr_nullable
Revises: 004_add_tracking_nr
Create Date: 2024-12-29

The tracking_nr field needs to be nullable because:
1. We create the Assignment/Payment record first
2. Flush to get the ID
3. Then assign tracking_nr based on the ID
This requires the column to accept NULL at INSERT time.

Also updates existing tracking numbers to remove the dash for brevity.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '005_make_tracking_nr_nullable'
down_revision = '004_add_tracking_nr'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite requires table recreation to change nullable constraint
    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=True, existing_type=sa.String(20))
    
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=True, existing_type=sa.String(20))
    
    # Update existing tracking numbers to remove dashes (P-12 -> P12, A-21 -> A21)
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE payments SET tracking_nr = REPLACE(tracking_nr, 'P-', 'P') WHERE tracking_nr LIKE 'P-%'"))
    conn.execute(sa.text("UPDATE assignments SET tracking_nr = REPLACE(tracking_nr, 'A-', 'A') WHERE tracking_nr LIKE 'A-%'"))


def downgrade() -> None:
    # First backfill any NULL values and restore dash format
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE payments SET tracking_nr = 'P-' || id WHERE tracking_nr IS NULL"))
    conn.execute(sa.text("UPDATE assignments SET tracking_nr = 'A-' || id WHERE tracking_nr IS NULL"))
    # Restore dash format for existing records
    conn.execute(sa.text("UPDATE payments SET tracking_nr = 'P-' || SUBSTR(tracking_nr, 2) WHERE tracking_nr LIKE 'P%' AND tracking_nr NOT LIKE 'P-%'"))
    conn.execute(sa.text("UPDATE assignments SET tracking_nr = 'A-' || SUBSTR(tracking_nr, 2) WHERE tracking_nr LIKE 'A%' AND tracking_nr NOT LIKE 'A-%'"))
    
    # Change back to NOT NULL
    with op.batch_alter_table('payments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=False, existing_type=sa.String(20))
    
    with op.batch_alter_table('assignments') as batch_op:
        batch_op.alter_column('tracking_nr', nullable=False, existing_type=sa.String(20))
