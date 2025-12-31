"""Add repayment category group

Revision ID: 008
Revises: 007_add_category_group_code
Create Date: 2025-12-31

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008_add_repayment_group'
down_revision = '007_add_category_group_code'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем новую группу категорий "Погашения" (repayment)
    op.execute("""
        INSERT INTO payment_category_groups (code, name)
        VALUES ('repayment', 'Погашения')
    """)
    
    # Добавляем категорию "Возврат долга" в группу repayment
    op.execute("""
        INSERT INTO payment_categories (name, group_id)
        SELECT 'Возврат долга', id
        FROM payment_category_groups
        WHERE code = 'repayment'
    """)


def downgrade():
    # Удаляем категорию
    op.execute("""
        DELETE FROM payment_categories
        WHERE name = 'Возврат долга'
    """)
    
    # Удаляем группу
    op.execute("""
        DELETE FROM payment_category_groups
        WHERE code = 'repayment'
    """)
