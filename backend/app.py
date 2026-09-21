from flask import Flask, request, jsonify
import sqlite3
import os
import re

app = Flask(__name__)

DATABASE = os.path.join(os.path.dirname(__file__), "practicals.db")


def get_database():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """Create the practicals table if it doesn't already exist."""
    connection = get_database()
    connection.execute("""
        CREATE TABLE IF NOT EXISTS practicals (
            practical_number TEXT NOT NULL,
            topic            TEXT NOT NULL,
            code             TEXT NOT NULL
        )
    """)
    connection.commit()
    connection.close()


# Run once at startup so Render's fresh environment has the table ready
init_db()


def field_names(connection):
    columns = [
        row[1] for row in connection.execute("PRAGMA table_info(practicals)")
    ]
    topic   = "topic"   if "topic"   in columns else "title"
    code    = "code"    if "code"    in columns else "content"
    subject = "subject" if "subject" in columns else None
    return topic, code, subject


# ── CORS ─────────────────────────────────────────────────────────────────────
@app.after_request
def allow_frontend(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

@app.route("/", methods=["OPTIONS"])
@app.route("/<path:p>", methods=["OPTIONS"])
def options_handler(p=""):
    return "", 204


# ── HOME ──────────────────────────────────────────────────────────────────────
@app.route("/")
def home():
    return "College Practical Search Engine is running!"


# ── LIST ALL ──────────────────────────────────────────────────────────────────
@app.route("/all")
def all_practicals():
    connection = get_database()
    topic_col, code_col, _ = field_names(connection)
    rows = connection.execute(
        f"SELECT rowid AS id, practical_number, {topic_col} AS topic, {code_col} AS code "
        f"FROM practicals ORDER BY rowid"
    ).fetchall()
    connection.close()
    return jsonify([dict(r) for r in rows])


# ── ADD ───────────────────────────────────────────────────────────────────────
@app.route("/add", methods=["POST"])
def add_practical():
    data             = request.json
    practical_number = data.get("practical_number")
    topic            = data.get("topic")
    code             = data.get("code")

    if not practical_number or not topic or not code:
        return jsonify({"error": "All 3 fields are required"}), 400

    connection = get_database()
    topic_col, code_col, subject_col = field_names(connection)

    if subject_col:
        connection.execute(
            f"INSERT INTO practicals ({subject_col}, practical_number, {topic_col}, {code_col}) "
            f"VALUES (?, ?, ?, ?)",
            ("", practical_number, topic, code)
        )
    else:
        connection.execute(
            f"INSERT INTO practicals (practical_number, {topic_col}, {code_col}) VALUES (?, ?, ?)",
            (practical_number, topic, code)
        )

    connection.commit()
    connection.close()
    return jsonify({"message": "Practical added successfully!"})


# ── UPDATE ────────────────────────────────────────────────────────────────────
@app.route("/update/<int:record_id>", methods=["PUT"])
def update_practical(record_id):
    data             = request.json
    practical_number = data.get("practical_number")
    topic            = data.get("topic")
    code             = data.get("code")

    if not practical_number or not topic or not code:
        return jsonify({"error": "All 3 fields are required"}), 400

    connection = get_database()
    topic_col, code_col, _ = field_names(connection)
    connection.execute(
        f"UPDATE practicals SET practical_number=?, {topic_col}=?, {code_col}=? WHERE rowid=?",
        (practical_number, topic, code, record_id)
    )
    connection.commit()
    connection.close()
    return jsonify({"message": "Updated successfully!"})


# ── DELETE ────────────────────────────────────────────────────────────────────
@app.route("/delete/<int:record_id>", methods=["DELETE"])
def delete_practical(record_id):
    connection = get_database()
    connection.execute("DELETE FROM practicals WHERE rowid=?", (record_id,))
    connection.commit()
    connection.close()
    return jsonify({"message": "Deleted successfully!"})


# ── SEARCH ────────────────────────────────────────────────────────────────────
@app.route("/search")
def search_practical():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    connection = get_database()
    topic_col, code_col, _ = field_names(connection)

    number_match     = re.search(r"\d+", query)
    practical_number = number_match.group(0) if number_match else query

    results = connection.execute(
        f"SELECT practical_number, {topic_col} AS topic, {code_col} AS code "
        f"FROM practicals "
        f"WHERE CAST(practical_number AS TEXT) = ? "
        f"   OR CAST(practical_number AS TEXT) = ? "
        f"   OR {topic_col} LIKE ?",
        (query, practical_number, "%" + query + "%")
    ).fetchall()
    connection.close()

    return jsonify([
        {"practical_number": r["practical_number"], "topic": r["topic"], "code": r["code"]}
        for r in results
    ])


if __name__ == "__main__":
    app.run(debug=True)
