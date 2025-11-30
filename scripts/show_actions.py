import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'nursia.db')
DB_PATH = os.path.abspath(DB_PATH)

if not os.path.exists(DB_PATH):
    print(f"Database file not found: {DB_PATH}")
    raise SystemExit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Check if actions table exists
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='actions'")
if not cur.fetchone():
    print("Table 'actions' does not exist in the database.")
    conn.close()
    raise SystemExit(0)

# Fetch last 20 records
cur.execute("SELECT id, telegram_id, username, full_name, start_ts, stop_ts, duration_seconds, created_at FROM actions ORDER BY id DESC LIMIT 20")
rows = cur.fetchall()
if not rows:
    print("No records found in 'actions'.")
else:
    out = [dict(row) for row in rows]
    print(json.dumps(out, ensure_ascii=False, indent=2))

conn.close()
