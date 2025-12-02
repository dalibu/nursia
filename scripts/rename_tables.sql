-- Begin transaction
BEGIN;

-- Rename expense_categories to payment_categories
ALTER TABLE expense_categories RENAME TO payment_categories;

-- Rename expenses to payments
ALTER TABLE expenses RENAME TO payments;

-- Update foreign key constraints
-- Note: SQLite doesn't support direct constraint modification, so we'll need to recreate the table
-- with the new constraint names if needed

-- Update any indexes if they reference the old table names
-- For example:
-- DROP INDEX IF EXISTS ix_expenses_user_id;
-- CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments(user_id);

-- Commit the transaction
COMMIT;

-- Verify the changes
-- .tables
-- .schema payments
-- .schema payment_categories
