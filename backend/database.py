import sqlite3
import os

DATABASE = os.path.join(os.path.dirname(__file__), "practicals.db")

connection = sqlite3.connect(DATABASE)

cursor = connection.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS practicals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    practical_number INTEGER NOT NULL,
    topic TEXT NOT NULL,
    code TEXT NOT NULL
)
""")

connection.commit()
connection.close()

print("Database created successfully!")
