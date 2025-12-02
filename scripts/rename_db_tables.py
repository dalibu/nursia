import sqlite3
import sys
from pathlib import Path

def rename_tables(db_path):
    """Rename expense-related tables to payment-related tables."""
    try:
        # Connect to the SQLite database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get the list of tables before renaming
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables_before = [table[0] for table in cursor.fetchall()]
        print("Current tables:", ", ".join(tables_before))
        
        # Check if the tables exist
        if 'expense_categories' not in tables_before and 'expenses' not in tables_before:
            print("No expense tables found to rename.")
            if 'payment_categories' in tables_before and 'payments' in tables_before:
                print("Payment tables already exist with correct names.")
            return
        
        # Begin transaction
        cursor.execute("BEGIN;")
        
        # Rename expense_categories to payment_categories if it exists
        if 'expense_categories' in tables_before:
            cursor.execute("ALTER TABLE expense_categories RENAME TO payment_categories;")
            print("Renamed table: expense_categories → payment_categories")
        
        # Rename expenses to payments if it exists
        if 'expenses' in tables_before:
            cursor.execute("ALTER TABLE expenses RENAME TO payments;")
            print("Renamed table: expenses → payments")
        
        # Commit the transaction
        conn.commit()
        print("Changes committed successfully!")
        
        # Verify the changes
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables_after = [table[0] for table in cursor.fetchall()]
        print("\nTables after renaming:", ", ".join(tables_after))
        
    except sqlite3.Error as e:
        # Rollback in case of any error
        if 'conn' in locals():
            conn.rollback()
        print(f"Error: {e}")
        return False
    finally:
        # Close the connection
        if 'conn' in locals():
            conn.close()
    
    return True

if __name__ == "__main__":
    # Get the database path from command line or use default
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        # Default path relative to the script location
        db_path = str(Path(__file__).parent.parent / "data" / "nursia.db")
    
    print(f"Using database: {db_path}")
    
    # Create a backup first
    backup_path = f"{db_path}.backup"
    print(f"\nCreating backup at: {backup_path}")
    
    try:
        # Create a backup of the database
        source = sqlite3.connect(db_path)
        backup = sqlite3.connect(backup_path)
        source.backup(backup)
        print("Backup created successfully!")
    except Exception as e:
        print(f"Warning: Could not create backup: {e}")
        if input("Continue without backup? (y/n): ").lower() != 'y':
            print("Operation cancelled.")
            sys.exit(1)
    finally:
        if 'source' in locals():
            source.close()
        if 'backup' in locals():
            backup.close()
    
    # Rename the tables
    print("\nRenaming tables...")
    if rename_tables(db_path):
        print("\nTable renaming completed successfully!")
    else:
        print("\nFailed to rename tables. Check the error message above.")
        sys.exit(1)
