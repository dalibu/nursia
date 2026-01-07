"""refactor_assignment_task_schema

Revision ID: a1b2c3d4e5f6
Revises: f7dd86d529cd
Create Date: 2026-01-07 17:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f7dd86d529cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.
    
    Refactor assignments and tasks tables:
    - Remove assignment_date, hourly_rate, currency, is_active from assignments
    - Change start_time/end_time from Time to DateTime in tasks
    - Add tracking_nr to tasks
    
    SQLite doesn't support ALTER for constraints, so we use table recreation.
    """
    
    # 1. Recreate tasks table with new schema
    op.execute("""
        CREATE TABLE tasks_new (
            id INTEGER NOT NULL PRIMARY KEY,
            assignment_id INTEGER NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            task_type VARCHAR(10) NOT NULL DEFAULT 'work',
            description TEXT,
            tracking_nr VARCHAR(20) UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(assignment_id) REFERENCES assignments(id)
        )
    """)
    
    # 2. Copy data with transformed columns (combine assignment_date + time)
    op.execute("""
        INSERT INTO tasks_new (id, assignment_id, start_time, end_time, task_type, description, created_at)
        SELECT 
            t.id, 
            t.assignment_id, 
            datetime(a.assignment_date, t.start_time) as start_time,
            CASE 
                WHEN t.end_time IS NOT NULL THEN datetime(a.assignment_date, t.end_time)
                ELSE NULL
            END as end_time,
            t.task_type,
            t.description,
            t.created_at
        FROM tasks t
        JOIN assignments a ON t.assignment_id = a.id
    """)
    
    # 3. Drop old tasks table and rename new one
    op.drop_table('tasks')
    op.rename_table('tasks_new', 'tasks')
    
    # 4. Recreate assignments table without removed columns
    op.execute("""
        CREATE TABLE assignments_new (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            assignment_type VARCHAR(20) NOT NULL DEFAULT 'work',
            description TEXT,
            tracking_nr VARCHAR(20) UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    
    # 5. Copy data (dropping unused columns)
    op.execute("""
        INSERT INTO assignments_new (id, user_id, assignment_type, description, tracking_nr, created_at)
        SELECT id, user_id, assignment_type, description, tracking_nr, created_at
        FROM assignments
    """)
    
    # 6. Drop old assignments table and rename new one
    op.drop_table('assignments')
    op.rename_table('assignments_new', 'assignments')


def downgrade() -> None:
    """Downgrade schema.
    
    Restore original schema:
    - Add back assignment_date, hourly_rate, currency, is_active to assignments
    - Change start_time/end_time from DateTime to Time in tasks
    - Remove tracking_nr from tasks
    """
    
    # Warning: This downgrade loses time zone information and multi-day spans
    
    # 1. Recreate assignments table with old columns
    op.execute("""
        CREATE TABLE assignments_new (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            assignment_date DATE NOT NULL,
            assignment_type VARCHAR(20) NOT NULL DEFAULT 'work',
            hourly_rate NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            tracking_nr VARCHAR(20) UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    
    # Copy data - derive assignment_date from first task's start_time
    # Default hourly_rate to 0, currency to UAH, is_active based on tasks
    op.execute("""
        INSERT INTO assignments_new (id, user_id, assignment_date, assignment_type, hourly_rate, currency, description, is_active, tracking_nr, created_at)
        SELECT 
            a.id, 
            a.user_id, 
            date((SELECT MIN(t.start_time) FROM tasks t WHERE t.assignment_id = a.id)) as assignment_date,
            a.assignment_type,
            100.0 as hourly_rate,
            'UAH' as currency,
            a.description,
            CASE WHEN EXISTS(SELECT 1 FROM tasks t WHERE t.assignment_id = a.id AND t.end_time IS NULL) THEN 1 ELSE 0 END as is_active,
            a.tracking_nr,
            a.created_at
        FROM assignments a
    """)
    
    op.drop_table('assignments')
    op.rename_table('assignments_new', 'assignments')
    
    # 2. Recreate tasks table with old Time columns
    op.execute("""
        CREATE TABLE tasks_new (
            id INTEGER NOT NULL PRIMARY KEY,
            assignment_id INTEGER NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME,
            task_type VARCHAR(10) NOT NULL DEFAULT 'work',
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            FOREIGN KEY(assignment_id) REFERENCES assignments(id)
        )
    """)
    
    # Copy data - extract just the time part
    op.execute("""
        INSERT INTO tasks_new (id, assignment_id, start_time, end_time, task_type, description, created_at)
        SELECT 
            id, 
            assignment_id, 
            time(start_time) as start_time,
            CASE WHEN end_time IS NOT NULL THEN time(end_time) ELSE NULL END as end_time,
            task_type,
            description,
            created_at
        FROM tasks
    """)
    
    op.drop_table('tasks')
    op.rename_table('tasks_new', 'tasks')
