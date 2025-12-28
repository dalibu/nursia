"""add_missing_foreign_keys

Revision ID: fix_fk_001
Revises: 8b377b57422f
Create Date: 2025-12-28 08:55:00.000000

This migration fixes missing foreign key constraints in:
- assignments (worker_id, employer_id -> contributors.id)
- contributors (user_id -> users.id)

SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we need to recreate
the tables using batch mode.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fix_fk_001'
down_revision: Union[str, Sequence[str], None] = '8b377b57422f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add missing foreign key constraints to assignments and contributors tables."""
    
    # Fix assignments table - add FK constraints for worker_id and employer_id
    with op.batch_alter_table('assignments', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_assignments_worker_id', 
            'contributors', 
            ['worker_id'], 
            ['id']
        )
        batch_op.create_foreign_key(
            'fk_assignments_employer_id', 
            'contributors', 
            ['employer_id'], 
            ['id']
        )
    
    # Fix contributors table - add FK constraint for user_id
    with op.batch_alter_table('contributors', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_contributors_user_id', 
            'users', 
            ['user_id'], 
            ['id']
        )


def downgrade() -> None:
    """Remove the added foreign key constraints."""
    
    with op.batch_alter_table('contributors', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contributors_user_id', type_='foreignkey')
    
    with op.batch_alter_table('assignments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_assignments_employer_id', type_='foreignkey')
        batch_op.drop_constraint('fk_assignments_worker_id', type_='foreignkey')
