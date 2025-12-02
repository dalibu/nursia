import os
import re
from pathlib import Path

def update_file_content(file_path, changes):
    """Update file content with the given changes"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Apply all replacements
        for old, new in changes.items():
            content = re.sub(r'\b' + re.escape(old) + r'\b', new, content)
        
        # Write changes back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"Error updating {file_path}: {e}")
        return False

def process_directory(directory, changes, extensions=None):
    """Process all files in directory and apply changes"""
    if extensions:
        extensions = tuple(extensions)
    
    for root, _, files in os.walk(directory):
        # Skip migrations and __pycache__ directories
        if 'migrations' in root or '__pycache__' in root:
            continue
            
        for file in files:
            if extensions and not file.endswith(extensions):
                continue
                
            file_path = os.path.join(root, file)
            if update_file_content(file_path, changes):
                print(f"Updated: {file_path}")

def main():
    # Define replacements
    changes = {
        # Model class names
        'Payment': 'Payment',
        'PaymentCategory': 'PaymentCategory',
        'PaymentCreate': 'PaymentCreate',
        'PaymentBase': 'PaymentBase',
        'PaymentUpdate': 'PaymentUpdate',
        'PaymentInDB': 'PaymentInDB',
        'PaymentReport': 'PaymentReport',
        
        # Table names and fields
        'payment_date': 'payment_date',
        'payment_categories': 'payment_categories',
        'payments': 'payments',
        
        # API endpoints
        '/payments': '/payments',
        '/payment-categories': '/payment-categories',
        
        # Variable names
        'payment': 'payment',
        'payments': 'payments',
        'payment_category': 'payment_category',
        'payment_categories': 'payment_categories',
    }
    
    # Process Python files
    process_directory(
        os.path.dirname(os.path.dirname(__file__)),  # Project root
        changes,
        extensions=('.py', '.html', '.js', '.jsx', '.ts', '.tsx', '.json', '.md')
    )
    
    print("\nRenaming complete! Please review the changes and run database migrations.")

if __name__ == '__main__':
    main()
