"""remove microseconds from expense_date

Revision ID: 004
Revises: 003
Create Date: 2024-11-30 19:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None

def upgrade():
    # SQLite не поддерживает изменение типа колонки напрямую
    # Создаем новую таблицу с правильным типом
    op.execute("""
        CREATE TABLE expenses_new (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            recipient_id INTEGER,
            amount NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
            description TEXT,
            expense_date DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(category_id) REFERENCES expense_categories (id),
            FOREIGN KEY(recipient_id) REFERENCES recipients (id)
        )
    """)
    
    # Копируем данные, обрезая микросекунды
    op.execute("""
        INSERT INTO expenses_new (id, user_id, category_id, recipient_id, amount, currency, description, expense_date, created_at)
        SELECT id, user_id, category_id, recipient_id, amount, currency, description, 
               datetime(expense_date, 'localtime'), datetime(created_at, 'localtime')
        FROM expenses
    """)
    
    # Удаляем старую таблицу и переименовываем новую
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_new RENAME TO expenses")

def downgrade():
    # Возвращаем обратно с микросекундами
    op.execute("""
        CREATE TABLE expenses_old (
            id INTEGER NOT NULL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            recipient_id INTEGER,
            amount NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
            description TEXT,
            expense_date DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users (id),
            FOREIGN KEY(category_id) REFERENCES expense_categories (id),
            FOREIGN KEY(recipient_id) REFERENCES recipients (id)
        )
    """)
    
    op.execute("""
        INSERT INTO expenses_old SELECT * FROM expenses
    """)
    
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_old RENAME TO expenses")