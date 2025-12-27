"""refactor_work_sessions_to_assignments_and_tasks

Revision ID: 8b377b57422f
Revises: 20a9fe84807f
Create Date: 2025-12-27 13:21:40.291634

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b377b57422f'
down_revision: Union[str, Sequence[str], None] = '20a9fe84807f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: Migrate work_sessions → assignments + tasks"""
    
    # 1. Create new tables
    op.create_table('assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Integer(), nullable=False),
        sa.Column('employer_id', sa.Integer(), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('hourly_rate', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['employer_id'], ['contributors.id']),
        sa.ForeignKeyConstraint(['worker_id'], ['contributors.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('tasks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=True),
        sa.Column('task_type', sa.String(length=10), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # 2. Migrate data from work_sessions to assignments + tasks
    connection = op.get_bind()
    
    # Find all work_sessions
    work_sessions = connection.execute(sa.text("""
        SELECT id, worker_id, employer_id, session_date, start_time, end_time,
               hourly_rate, currency, is_active, session_type, assignment_id, description, created_at
        FROM work_sessions
        ORDER BY COALESCE(assignment_id, id), start_time
    """)).fetchall()
    
    # Map old assignment_id → new assignment.id
    assignment_map = {}  # old_assignment_id -> new_assignment_id
    
    for ws in work_sessions:
        old_id = ws[0]
        worker_id = ws[1]
        employer_id = ws[2]
        session_date = ws[3]
        start_time = ws[4]
        end_time = ws[5]
        hourly_rate = ws[6]
        currency = ws[7]
        is_active = ws[8]
        session_type = ws[9] or 'work'
        old_assignment_id = ws[10]
        description = ws[11]
        created_at = ws[12]
        
        # Determine the assignment key (group sessions by assignment_id or self)
        assignment_key = old_assignment_id if old_assignment_id else old_id
        
        # Create assignment if not exists
        if assignment_key not in assignment_map:
            connection.execute(sa.text("""
                INSERT INTO assignments (worker_id, employer_id, session_date, hourly_rate, currency, is_active, created_at)
                VALUES (:worker_id, :employer_id, :session_date, :hourly_rate, :currency, :is_active, :created_at)
            """), {
                'worker_id': worker_id,
                'employer_id': employer_id,
                'session_date': session_date,
                'hourly_rate': hourly_rate,
                'currency': currency,
                'is_active': is_active,
                'created_at': created_at
            })
            # Get last inserted ID
            new_assignment_id = connection.execute(sa.text("SELECT last_insert_rowid()")).scalar()
            assignment_map[assignment_key] = new_assignment_id
        
        new_assignment_id = assignment_map[assignment_key]
        
        # Create task
        connection.execute(sa.text("""
            INSERT INTO tasks (assignment_id, start_time, end_time, task_type, description, created_at)
            VALUES (:assignment_id, :start_time, :end_time, :task_type, :description, :created_at)
        """), {
            'assignment_id': new_assignment_id,
            'start_time': start_time,
            'end_time': end_time,
            'task_type': session_type,
            'description': description,
            'created_at': created_at
        })
    
    # 3. Recreate payments table with new FK using batch mode (SQLite)
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assignment_id', sa.Integer(), nullable=True))
    
    # Map work_session_id to new assignment_id
    for old_key, new_assignment_id in assignment_map.items():
        connection.execute(sa.text("""
            UPDATE payments SET assignment_id = :new_id
            WHERE work_session_id = :old_id
        """), {'new_id': new_assignment_id, 'old_id': old_key})
        # Also update for child sessions
        connection.execute(sa.text("""
            UPDATE payments SET assignment_id = :new_id
            WHERE work_session_id IN (
                SELECT id FROM work_sessions WHERE assignment_id = :old_id
            )
        """), {'new_id': new_assignment_id, 'old_id': old_key})
    
    # Drop old column and add FK using batch mode
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.drop_column('work_session_id')
        batch_op.create_foreign_key('fk_payments_assignment', 'assignments', ['assignment_id'], ['id'])
    
    # 4. Drop old table
    op.drop_table('work_sessions')


def downgrade() -> None:
    """Downgrade: Recreate work_sessions from assignments + tasks"""
    
    # Recreate work_sessions table
    op.create_table('work_sessions',
        sa.Column('id', sa.INTEGER(), nullable=False),
        sa.Column('worker_id', sa.INTEGER(), nullable=False),
        sa.Column('employer_id', sa.INTEGER(), nullable=False),
        sa.Column('session_date', sa.DATE(), nullable=False),
        sa.Column('start_time', sa.TIME(), nullable=False),
        sa.Column('end_time', sa.TIME(), nullable=True),
        sa.Column('duration_hours', sa.NUMERIC(precision=5, scale=2), nullable=True),
        sa.Column('hourly_rate', sa.NUMERIC(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.VARCHAR(length=3), nullable=False),
        sa.Column('amount', sa.NUMERIC(precision=10, scale=2), nullable=True),
        sa.Column('is_active', sa.BOOLEAN(), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('created_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('session_type', sa.VARCHAR(length=10), server_default=sa.text("'work'"), nullable=False),
        sa.Column('assignment_id', sa.INTEGER(), nullable=True),
        sa.ForeignKeyConstraint(['employer_id'], ['contributors.id']),
        sa.ForeignKeyConstraint(['worker_id'], ['contributors.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Migrate data back
    connection = op.get_bind()
    
    assignments = connection.execute(sa.text("""
        SELECT id, worker_id, employer_id, session_date, hourly_rate, currency, is_active, created_at
        FROM assignments
    """)).fetchall()
    
    assignment_first_ws = {}
    
    for assignment in assignments:
        a_id = assignment[0]
        tasks = connection.execute(sa.text("""
            SELECT id, start_time, end_time, task_type, description, created_at
            FROM tasks WHERE assignment_id = :aid ORDER BY start_time
        """), {'aid': a_id}).fetchall()
        
        first_ws_id = None
        for task in tasks:
            connection.execute(sa.text("""
                INSERT INTO work_sessions (worker_id, employer_id, session_date, start_time, end_time,
                    hourly_rate, currency, is_active, session_type, description, created_at, assignment_id)
                VALUES (:worker_id, :employer_id, :session_date, :start_time, :end_time,
                    :hourly_rate, :currency, :is_active, :session_type, :description, :created_at, :assignment_id)
            """), {
                'worker_id': assignment[1],
                'employer_id': assignment[2],
                'session_date': assignment[3],
                'start_time': task[1],
                'end_time': task[2],
                'hourly_rate': assignment[4],
                'currency': assignment[5],
                'is_active': assignment[6],
                'session_type': task[3],
                'description': task[4],
                'created_at': task[5],
                'assignment_id': first_ws_id
            })
            ws_id = connection.execute(sa.text("SELECT last_insert_rowid()")).scalar()
            if first_ws_id is None:
                first_ws_id = ws_id
                assignment_first_ws[a_id] = ws_id
    
    # Update payments using batch mode
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('work_session_id', sa.INTEGER(), nullable=True))
    
    for a_id, ws_id in assignment_first_ws.items():
        connection.execute(sa.text("""
            UPDATE payments SET work_session_id = :ws_id WHERE assignment_id = :a_id
        """), {'ws_id': ws_id, 'a_id': a_id})
    
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.drop_constraint('fk_payments_assignment', type_='foreignkey')
        batch_op.create_foreign_key('fk_payments_work_session', 'work_sessions', ['work_session_id'], ['id'])
        batch_op.drop_column('assignment_id')
    
    # Drop new tables
    op.drop_table('tasks')
    op.drop_table('assignments')
