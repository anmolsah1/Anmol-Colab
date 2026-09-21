require("dotenv").config();
const express    = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { execFile } = require("child_process");
const fs         = require("fs");
const os         = require("os");
const path       = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ||
  "mongodb+srv://anmolsah064444_db_user:IyLJruoqDB1sn5I5@cluster0.egjeby1.mongodb.net/?appName=Cluster0";

let practicals; // collection reference

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db("college_practicals");
  practicals = db.collection("practicals");
  console.log("✅ Connected to MongoDB Atlas");
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

const ALLOWED_ORIGINS = new Set([
  "https://collegesearchproject.netlify.app",
  "https://anmol-colab.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGINS.has(origin) ? origin : "https://collegesearchproject.netlify.app"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Helper ────────────────────────────────────────────────────────────────────
function serialize(doc) {
  return {
    id:               doc._id.toString(),
    practical_number: doc.practical_number ?? "",
    topic:            doc.topic ?? "",
    code:             doc.code  ?? "",
  };
}

// ── HOME ──────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("College Practical Search Engine is running!"));

// ── LIST ALL ──────────────────────────────────────────────────────────────────
app.get("/all", async (_req, res) => {
  try {
    const docs = await practicals.find().sort({ _id: 1 }).toArray();
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADD ───────────────────────────────────────────────────────────────────────
app.post("/add", async (req, res) => {
  const { practical_number = "", topic = "", code = "" } = req.body ?? {};
  if (!practical_number.trim() || !topic.trim() || !code.trim())
    return res.status(400).json({ error: "All 3 fields are required" });

  try {
    const result = await practicals.insertOne({
      practical_number: practical_number.trim(),
      topic:            topic.trim(),
      code:             code.trim(),
    });
    res.json({ message: "Practical added successfully!", id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
app.put("/update/:id", async (req, res) => {
  const { practical_number = "", topic = "", code = "" } = req.body ?? {};
  if (!practical_number.trim() || !topic.trim() || !code.trim())
    return res.status(400).json({ error: "All 3 fields are required" });

  try {
    await practicals.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { practical_number: practical_number.trim(), topic: topic.trim(), code: code.trim() } }
    );
    res.json({ message: "Updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
app.delete("/delete/:id", async (req, res) => {
  try {
    await practicals.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
app.get("/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (!query) return res.json([]);

  const numMatch = query.match(/\d+/);
  const num      = numMatch ? numMatch[0] : null;

  const conditions = [
    { topic:            { $regex: query, $options: "i" } },
    { practical_number: query },
  ];
  if (num) conditions.push({ practical_number: num });

  try {
    const docs = await practicals.find({ $or: conditions }).toArray();
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RUN CODE (Python execution) ───────────────────────────────────────────────
app.post("/run", (req, res) => {
  const code = (req.body?.code || "").trim();
  if (!code) return res.json({ output: "", error: null });

  const tmpFile = path.join(os.tmpdir(), `run_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, code, "utf8");

  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  execFile(pythonCmd, [tmpFile], { timeout: 10000 }, (err, stdout, stderr) => {
    fs.unlink(tmpFile, () => {}); // cleanup

    if (err && err.killed) {
      return res.json({ output: "", error: "TimeoutError: execution exceeded 10 seconds.", returncode: 1 });
    }
    res.json({
      output:     stdout || "",
      error:      stderr || null,
      returncode: err ? 1 : 0,
    });
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on http://127.0.0.1:${PORT}`));
}).catch(err => {
  console.error("❌ MongoDB connection failed:", err.message);
  process.exit(1);
});
