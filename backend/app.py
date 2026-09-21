from flask import Flask, request, jsonify
from pymongo import MongoClient
from bson import ObjectId
import os
import re
import sys
import subprocess
import tempfile
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# ── MongoDB Setup ─────────────────────────────────────────────────────────────
MONGO_URI = os.environ.get(
    "MONGO_URI",
    "mongodb+srv://anmolsah064444_db_user:IyLJruoqDB1sn5I5@cluster0.egjeby1.mongodb.net/?appName=Cluster0"
)

client = MongoClient(MONGO_URI)
db = client["college_practicals"]
practicals = db["practicals"]


# ── CORS ─────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = {
    "https://collegesearchproject.netlify.app",
    "https://anmol-colab.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

@app.after_request
def allow_frontend(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        response.headers["Access-Control-Allow-Origin"] = "https://collegesearchproject.netlify.app"
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


# ── Helper: serialize a MongoDB document ──────────────────────────────────────
def serialize(doc):
    return {
        "id":               str(doc["_id"]),
        "practical_number": doc.get("practical_number", ""),
        "topic":            doc.get("topic", ""),
        "code":             doc.get("code", ""),
    }


# ── LIST ALL ──────────────────────────────────────────────────────────────────
@app.route("/all")
def all_practicals():
    docs = practicals.find().sort("_id", 1)
    return jsonify([serialize(d) for d in docs])


# ── ADD ───────────────────────────────────────────────────────────────────────
@app.route("/add", methods=["POST"])
def add_practical():
    data             = request.json or {}
    practical_number = data.get("practical_number", "").strip()
    topic            = data.get("topic", "").strip()
    code             = data.get("code", "").strip()

    if not practical_number or not topic or not code:
        return jsonify({"error": "All 3 fields are required"}), 400

    result = practicals.insert_one({
        "practical_number": practical_number,
        "topic":            topic,
        "code":             code,
    })
    return jsonify({"message": "Practical added successfully!", "id": str(result.inserted_id)})


# ── UPDATE ────────────────────────────────────────────────────────────────────
@app.route("/update/<string:record_id>", methods=["PUT"])
def update_practical(record_id):
    data             = request.json or {}
    practical_number = data.get("practical_number", "").strip()
    topic            = data.get("topic", "").strip()
    code             = data.get("code", "").strip()

    if not practical_number or not topic or not code:
        return jsonify({"error": "All 3 fields are required"}), 400

    try:
        oid = ObjectId(record_id)
    except Exception:
        return jsonify({"error": "Invalid record ID"}), 400

    practicals.update_one(
        {"_id": oid},
        {"$set": {"practical_number": practical_number, "topic": topic, "code": code}}
    )
    return jsonify({"message": "Updated successfully!"})


# ── DELETE ────────────────────────────────────────────────────────────────────
@app.route("/delete/<string:record_id>", methods=["DELETE"])
def delete_practical(record_id):
    try:
        oid = ObjectId(record_id)
    except Exception:
        return jsonify({"error": "Invalid record ID"}), 400

    practicals.delete_one({"_id": oid})
    return jsonify({"message": "Deleted successfully!"})


# ── SEARCH ────────────────────────────────────────────────────────────────────
@app.route("/search")
def search_practical():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    number_match     = re.search(r"\d+", query)
    practical_number = number_match.group(0) if number_match else None

    conditions = [
        {"topic": {"$regex": query, "$options": "i"}},
        {"practical_number": query},
    ]
    if practical_number:
        conditions.append({"practical_number": practical_number})

    docs = practicals.find({"$or": conditions})
    return jsonify([serialize(d) for d in docs])


# ── RUN CODE ─────────────────────────────────────────────────────────────────
@app.route("/run", methods=["POST"])
def run_code():
    data = request.json or {}
    code = data.get("code", "").strip()

    if not code:
        return jsonify({"output": "", "error": None})

    tmp_path = None
    try:
        # Write code to a temp file — handles multi-line, quotes, indentation
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            tmp_path = f.name

        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=10,
        )

        return jsonify({
            "output":     result.stdout,
            "error":      result.stderr if result.returncode != 0 else None,
            "returncode": result.returncode,
        })

    except subprocess.TimeoutExpired:
        return jsonify({"output": "", "error": "TimeoutError: execution exceeded 10 seconds.", "returncode": 1})
    except Exception as exc:
        return jsonify({"output": "", "error": f"ServerError: {exc}", "returncode": 1})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    import platform
    # Python 3.14 + Windows has a reloader bug (WinError 10038)
    # Disable reloader on Windows to avoid the socket error
    use_reloader = platform.system() != "Windows"
    app.run(debug=True, use_reloader=use_reloader)
