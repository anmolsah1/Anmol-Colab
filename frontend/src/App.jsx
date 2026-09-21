import { useEffect, useRef, useState } from "react";
import "./App.css";

// API base URL — reads from .env locally, from Netlify env vars in production
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const SUBJECTS = ["Python", "SPSS", "Big Data"];


// Display names that match Jupyter's default Untitled naming convention
const FILE_NAMES = {
  "Python": "Untitled.ipynb",
  "SPSS": "Untitled1.ipynb",
  "Big Data": "Untitled2.ipynb",
};


function newCell() {
  return {
    id: crypto.randomUUID(),
    input: "",
    results: null,
    error: null,
    executionCount: null,
    searching: false,
  };
}

function App() {
  const [subject, setSubject] = useState("Python");
  const [cells, setCells] = useState([newCell()]);
  const [activeId, setActiveId] = useState(cells[0].id);
  const [runCount, setRunCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const textareaRefs = useRef({});

  const activeIndex = Math.max(
    0,
    cells.findIndex((cell) => cell.id === activeId)
  );

  function updateCell(id, patch) {
    setCells((current) =>
      current.map((cell) => (cell.id === id ? { ...cell, ...patch } : cell))
    );
  }

  function focusCell(id) {
    setActiveId(id);
    window.requestAnimationFrame(() => {
      const area = textareaRefs.current[id];
      if (area) {
        area.focus();
      }
    });
  }

  function addCell(afterId) {
    const cell = newCell();
    setCells((current) => {
      if (!afterId) {
        return [...current, cell];
      }
      const index = current.findIndex((item) => item.id === afterId);
      const next = [...current];
      next.splice(index + 1, 0, cell);
      return next;
    });
    focusCell(cell.id);
  }

  function deleteCell(id) {
    setCells((current) => {
      if (current.length === 1) {
        const cell = newCell();
        setActiveId(cell.id);
        return [cell];
      }
      const index = current.findIndex((item) => item.id === id);
      const next = current.filter((item) => item.id !== id);
      const neighbor = next[Math.max(0, index - 1)];
      setActiveId(neighbor.id);
      return next;
    });
  }

  async function runCell(id) {
    const cell = cells.find((item) => item.id === id);
    if (!cell || cell.searching) {
      return;
    }

    const query = cell.input.trim();
    const nextCount = runCount + 1;
    setRunCount(nextCount);
    setBusy(true);
    updateCell(id, { searching: true, executionCount: nextCount, error: null, results: null });

    try {
      const response = await fetch(
        `${API}/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        throw new Error("Search failed");
      }
      const results = await response.json();
      updateCell(id, {
        results,
        error: null,
        searching: false,
      });
    } catch {
      updateCell(id, {
        results: [],
        error: "Could not reach the search server.",
        searching: false,
      });
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event, id) {
    if (event.key === "Enter" && (event.shiftKey || event.ctrlKey)) {
      event.preventDefault();
      runCell(id);
    }
  }

  useEffect(() => {
    setCells([newCell()]);
    setActiveId(null);
    setRunCount(0);
  }, [subject]);

  useEffect(() => {
    if (activeId === null && cells[0]) {
      setActiveId(cells[0].id);
    }
  }, [activeId, cells]);

  const subjectLabel = FILE_NAMES[subject];

  /* ── DB Manager Modal (Add / Edit / Delete) ────────────────────── */
  function DBModal() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editRow, setEditRow] = useState(null); // {id, practical_number, topic, code}
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ practical_number: "", topic: "", code: "" });
    const [msg, setMsg] = useState(null);
    const [busy, setBusyDB] = useState(false);

    /* load all records on open */
    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/all`);
        setRecords(await res.json());
      } catch {
        setMsg({ ok: false, text: "Cannot reach Flask server." });
      } finally { setLoading(false); }
    }

    function startAdd() {
      setEditRow(null);
      setForm({ practical_number: "", topic: "", code: "" });
      setMsg(null);
      setShowForm(true);
    }

    function startEdit(row) {
      setEditRow(row);
      setForm({ practical_number: row.practical_number, topic: row.topic, code: row.code });
      setMsg(null);
      setShowForm(true);
    }

    async function handleDelete(id, name) {
      if (!window.confirm(`Delete "${name}"?`)) return;
      setBusyDB(true);
      try {
        await fetch(`${API}/delete/${id}`, { method: "DELETE" });
        await loadAll();
        setMsg({ ok: true, text: "Deleted." });
      } catch {
        setMsg({ ok: false, text: "Delete failed." });
      } finally { setBusyDB(false); }
    }

    async function handleSave(e) {
      e.preventDefault();
      const { practical_number, topic, code } = form;
      if (!practical_number.trim() || !topic.trim() || !code.trim()) {
        setMsg({ ok: false, text: "All three fields are required." });
        return;
      }
      setBusyDB(true);
      try {
        const url = editRow ? `${API}/update/${editRow.id}` : `${API}/add`;
        const method = editRow ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practical_number: practical_number.trim(), topic: topic.trim(), code: code.trim() }),
        });
        const data = await res.json();
        if (res.ok) {
          setMsg({ ok: true, text: editRow ? "✓ Updated!" : "✓ Saved!" });
          setShowForm(false);
          setEditRow(null);
          await loadAll();
        } else {
          setMsg({ ok: false, text: data.error || "Server error." });
        }
      } catch {
        setMsg({ ok: false, text: "Cannot reach Flask server." });
      } finally { setBusyDB(false); }
    }

    function field(key, placeholder, rows) {
      return rows ? (
        <textarea
          className="add-textarea"
          rows={rows}
          placeholder={placeholder}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      ) : (
        <input
          className="add-input"
          type="text"
          placeholder={placeholder}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      );
    }

    return (
      <div className="add-overlay" onClick={() => setShowAdd(false)}>
        <div className="dbm-modal" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="add-modal-header">
            <span className="add-modal-title">📦 Database Manager — Practicals</span>
            <button className="add-modal-close" onClick={() => setShowAdd(false)}>&#215;</button>
          </div>

          {/* Toolbar */}
          <div className="dbm-toolbar">
            <button className="dbm-add-btn" onClick={startAdd}>+ Add New Practical</button>
            <button className="dbm-refresh-btn" onClick={loadAll}>↻ Refresh</button>
            {msg && <span className={"dbm-inline-msg" + (msg.ok ? " ok" : " err")}>{msg.text}</span>}
          </div>

          {/* Add / Edit form */}
          {showForm && (
            <form className="dbm-form" onSubmit={handleSave}>
              <div className="dbm-form-title">{editRow ? "✏️ Edit Record" : "➕ New Record"}</div>
              <div className="dbm-form-row">
                <label className="add-label" style={{ flex: "0 0 160px" }}>
                  Practical Name
                  {field("practical_number", "e.g. BG Practical 1")}
                </label>
                <label className="add-label" style={{ flex: 1 }}>
                  Topic
                  {field("topic", "e.g. Introduction to Big Data")}
                </label>
              </div>
              <label className="add-label">
                Code / Content
                {field("code", "Paste code here…", 5)}
              </label>
              <div className="dbm-form-actions">
                <button type="button" className="add-btn-cancel" onClick={() => { setShowForm(false); setMsg(null); }}>Cancel</button>
                <button type="submit" className="add-btn-save" disabled={busy}>{busy ? "Saving…" : (editRow ? "Update" : "Save")}</button>
              </div>
            </form>
          )}

          {/* Records table */}
          <div className="dbm-table-wrap">
            {loading ? (
              <div className="dbm-empty">Loading…</div>
            ) : records.length === 0 ? (
              <div className="dbm-empty">No records yet. Click <strong>+ Add New Practical</strong> to begin.</div>
            ) : (
              <table className="dbm-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th style={{ width: 160 }}>Practical Name</th>
                    <th style={{ width: 200 }}>Topic</th>
                    <th>Code (preview)</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className={editRow?.id === r.id ? "dbm-editing" : ""}>
                      <td className="dbm-td-center">{i + 1}</td>
                      <td><strong>{r.practical_number}</strong></td>
                      <td>{r.topic}</td>
                      <td className="dbm-code-preview">{r.code.slice(0, 80)}{r.code.length > 80 ? "…" : ""}</td>
                      <td className="dbm-td-center">
                        <button className="dbm-edit-btn" onClick={() => startEdit(r)} title="Edit">✏️</button>
                        <button className="dbm-del-btn" onClick={() => handleDelete(r.id, r.practical_number)} title="Delete">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    );
  }


  return (
    <div className="jlab">

      {/* ===== MENU BAR ===== */}
      <div className="jlab-menu">
        <span className="jlab-logo">&#x2B21;</span>
        {["File", "Edit", "View", "Run", "Kernel", "Tabs", "Settings", "Help"].map((m) => (
          <span key={m} className="jlab-menu-item">{m}</span>
        ))}
      </div>

      {/* ===== BODY (activity + panel + main) ===== */}
      <div className="jlab-body">

        {/* Activity bar - narrow left icon strip */}
        <div className="jlab-activity">
          <button className="jlab-act-btn jlab-act-active" title="File Browser">&#128193;</button>
          <button className="jlab-act-btn" title="Running">&#9711;</button>
          <button className="jlab-act-btn" title="Table of Contents">&#9776;</button>
          <button className="jlab-act-btn" title="Extensions">&#x2B21;</button>
        </div>

        {/* Left panel - file browser */}
        <div className="jlab-panel">
          <div className="jlab-panel-path">
            <button className="jlab-panel-new">+ New</button>
            <div className="jlab-panel-btns">
              <button title="Upload">&#8593;</button>
              <button title="Refresh">&#8635;</button>
              <button title="Filter">&#8859;</button>
            </div>
            <span>/ notebooks /</span>
          </div>
          <div className="jlab-file-header">
            <span className="jlab-fh-name">Name</span>
            <span className="jlab-fh-mod">Modified</span>
          </div>
          <div className="jlab-files">
            {SUBJECTS.map((name) => (
              <div
                key={name}
                className={"jlab-file-row" + (subject === name ? " active" : "")}
                onClick={() => setSubject(name)}
              >
                <span className="jlab-nb-icon">&#x25A3;</span>
                <span className="jlab-file-name">{FILE_NAMES[name]}</span>
                <span className="jlab-file-mod">now</span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== MAIN (tabs + notebook) ===== */}
        <div className="jlab-main">

          {/* Tab bar */}
          <div className="jlab-tabs">
            {SUBJECTS.map((name) => (
              <div
                key={name}
                className={"jlab-tab" + (subject === name ? " active" : "")}
                onClick={() => setSubject(name)}
              >
                <span className="jlab-tab-icon">&#x25A3;</span>
                <span className="jlab-tab-label">{FILE_NAMES[name]}</span>
                {subject === name && <span className="jlab-tab-dot">&#9679;</span>}
                <span className="jlab-tab-close" onClick={(e) => e.stopPropagation()}>&#215;</span>
              </div>
            ))}
          </div>

          {/* Notebook area */}
          <div className="jlab-notebook">

            {/* Toolbar */}
            <div className="jlab-toolbar">
              <button title="Save" className="jlab-tb-btn">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.5L11.5 1H2zm0 1h9l3 3V14H2V2zm2 8v3h8v-3H4zm1 1h6v1H5v-1zM4 2v4h7V2H4zm1 1h2v2H5V3zm3 0h2v2H8V3z" />
                </svg>
              </button>
              <div className="jlab-tb-sep" />
              <button title="Insert cell below" className="jlab-tb-btn" onClick={() => addCell(activeId)}>+</button>
              <button title="Cut" className="jlab-tb-btn">&#9988;</button>
              <button title="Copy" className="jlab-tb-btn">&#9112;</button>
              <button title="Paste" className="jlab-tb-btn">&#8853;</button>
              <div className="jlab-tb-sep" />
              <button title="Run (Shift+Enter)" className="jlab-tb-btn jlab-run" onClick={() => runCell(activeId)}>&#9654;</button>
              <button title="Stop" className="jlab-tb-btn">&#9632;</button>
              <button title="Restart kernel" className="jlab-tb-btn">&#8635;</button>
              <button title="Restart and Run All" className="jlab-tb-btn">&#9193;</button>
              <div className="jlab-tb-sep" />
              <select className="jlab-tb-select" defaultValue="Code">
                <option>Code</option>
                <option>Markdown</option>
                <option>Raw</option>
              </select>
              <span className="jlab-tb-spacer" />
              <span className="jlab-kernel-name">Notebook&nbsp;|</span>
              <span
                className={"jlab-kernel-circle" + (busy ? " busy" : "")}
                title={busy ? "Busy" : "Idle"}
              />
              <span className="jlab-kernel-label">{subject}</span>
              <div className="jlab-tb-sep" />
              <button
                title="Add Practical to Database"
                className="jlab-tb-btn jlab-add-btn"
                onClick={() => setShowAdd(true)}
              >
                + DB
              </button>
            </div>

            {/* Cells */}
            <div className="jlab-cells">
              {cells.map((cell) => {
                const prompt = cell.executionCount === null ? " " : cell.executionCount;
                const showOutput = cell.searching || cell.error || cell.results !== null;

                return (
                  <div key={cell.id} className="jlab-cell-block">

                    {/* Input cell — mini-toolbar lives INSIDE on the right */}
                    <div
                      className={"jlab-cell" + (activeId === cell.id ? " selected" : "")}
                      onClick={() => setActiveId(cell.id)}
                    >
                      <div className="jlab-in-prompt">[{prompt}]:</div>
                      <div className="jlab-in-body">
                        <textarea
                          ref={(node) => { textareaRefs.current[cell.id] = node; }}
                          className="jlab-textarea"
                          value={cell.input}
                          spellCheck="false"
                          onChange={(e) => {
                            updateCell(cell.id, { input: e.target.value });
                            // Auto-grow: shrink to 0 first so scrollHeight reflects content
                            e.target.style.height = "30px";
                            e.target.style.height = e.target.scrollHeight + "px";
                          }}
                          onFocus={() => setActiveId(cell.id)}
                          onKeyDown={(e) => handleKeyDown(e, cell.id)}
                        />
                      </div>

                      {/* Mini-toolbar — right side of cell, visible on active only */}
                      {activeId === cell.id && (
                        <div className="jlab-cell-toolbar">
                          <button title="Run (Shift+Enter)" onClick={() => runCell(cell.id)}>&#9654;</button>
                          <button title="Add cell below" onClick={() => addCell(cell.id)}>+</button>
                          <button title="Move up">&#8593;</button>
                          <button title="Move down">&#8595;</button>
                          <button title="Delete cell" onClick={() => deleteCell(cell.id)}>&#128465;</button>
                        </div>
                      )}
                    </div>

                    {/* Output */}
                    {showOutput && (
                      <div className="jlab-out-row">
                        <div className="jlab-out-prompt">[{prompt}]:</div>
                        <div className="jlab-out-body">

                          {cell.searching && (
                            <div className="jlab-searching">
                              <span className="jlab-spinner" />
                              &nbsp;Searching&hellip;
                            </div>
                          )}

                          {cell.error && (
                            <pre className="jlab-error">{cell.error}</pre>
                          )}

                          {!cell.searching && !cell.error && cell.results && cell.results.length === 0 && (
                            <div className="jlab-no-results">
                              No results found for &ldquo;<strong>{cell.input.trim()}</strong>&rdquo;.
                            </div>
                          )}

                          {!cell.searching && !cell.error && cell.results && cell.results.map((item, i) => (
                            <div key={cell.id + i} className="jlab-result">
                              <div className="jlab-result-heading">
                                <span className="jlab-hash">#</span>
                                <span className="jlab-topic-text">{item.topic}</span>
                              </div>
                              <pre className="jlab-code">{item.code}</pre>
                            </div>
                          ))}

                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===== STATUS BAR ===== */}
      <div className="jlab-status">
        {/* LEFT: kernel name + idle/busy */}
        <span className="jlab-kernel-circle jlab-st-kernel-dot" />
        <span className="jlab-st">{subject}</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">{busy ? "Busy" : "Idle"}</span>
        <div className="jlab-st-spacer" />
        {/* RIGHT: mode / cell / position / file */}
        <span className="jlab-st">Mode: {activeId ? "Edit" : "Command"}</span>
        <span className="jlab-st-bell">&#128276;</span>
        <span className="jlab-st">Cell {activeIndex + 1}/{cells.length}</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">Ln 1, Col 1</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">{subjectLabel}</span>
      </div>

      {/* ===== DB MANAGER MODAL ===== */}
      {showAdd && <DBModal />}

    </div>
  );
}

export default App;
