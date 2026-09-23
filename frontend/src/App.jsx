import { useEffect, useRef, useState } from "react";
import "./App.css";

/* ─────────────────────────────────────────────────────────────────────────────
   API
───────────────────────────────────────────────────────────────────────────── */
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

/* ─────────────────────────────────────────────────────────────────────────────
   SIMPLE MARKDOWN RENDERER
───────────────────────────────────────────────────────────────────────────── */
function escHtml(t) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(raw) {
  return escHtml(raw)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="md-ic">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

function renderMarkdown(text) {
  const lines = text.split("\n");
  let html = "";
  let inCode = false;
  let codeBuf = "";
  let codeLang = "";
  let inUl = false;
  let inOl = false;

  const closeList = () => {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = "";
      } else {
        inCode = false;
        html += `<pre class="md-pre"><code class="md-code${codeLang ? " lang-" + escHtml(codeLang) : ""}">${escHtml(codeBuf)}</code></pre>`;
        codeBuf = "";
        codeLang = "";
      }
      continue;
    }
    if (inCode) { codeBuf += (codeBuf ? "\n" : "") + line; continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { closeList(); html += `<h${hm[1].length} class="md-h">${inlineMd(hm[2])}</h${hm[1].length}>`; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { closeList(); html += '<hr class="md-hr">'; continue; }
    if (/^> /.test(line)) { closeList(); html += `<blockquote class="md-bq">${inlineMd(line.slice(2))}</blockquote>`; continue; }

    const ulm = line.match(/^[-*+] (.*)/);
    if (ulm) { if (inOl) { html += "</ol>"; inOl = false; } if (!inUl) { html += '<ul class="md-ul">'; inUl = true; } html += `<li>${inlineMd(ulm[1])}</li>`; continue; }

    const olm = line.match(/^\d+\.\s+(.*)/);
    if (olm) { if (inUl) { html += "</ul>"; inUl = false; } if (!inOl) { html += '<ol class="md-ol">'; inOl = true; } html += `<li>${inlineMd(olm[1])}</li>`; continue; }

    if (line.trim() === "") { closeList(); html += "<br>"; continue; }
    closeList();
    html += `<p class="md-p">${inlineMd(line)}</p>`;
  }
  closeList();
  if (inCode) html += `<pre class="md-pre"><code>${escHtml(codeBuf)}</code></pre>`;
  return html || "<em class='md-empty'>Empty cell</em>";
}

/* ─────────────────────────────────────────────────────────────────────────────
   FACTORIES
───────────────────────────────────────────────────────────────────────────── */
function newCell(type = "code") {
  return {
    id: crypto.randomUUID(),
    type,            // "code" | "markdown"
    input: "",
    results: null,
    error: null,
    executionCount: null,
    searching: false,
    rendered: false, // markdown: true = rendered view
    // code execution (fallback when no search results)
    codeOutput: null,
    codeError:  null,
    wasExecuted: false,   // true when /run was called (not search)
  };
}

function makeNotebook(name) {
  const cell = newCell();
  return { id: crypto.randomUUID(), name, cells: [cell], runCount: 0, activeCellId: cell.id, busy: false };
}

const INIT = [
  makeNotebook("Untitled.ipynb"),
  makeNotebook("Untitled1.ipynb"),
  makeNotebook("Untitled2.ipynb"),
];

/* ─────────────────────────────────────────────────────────────────────────────
   DB MODAL  (separated component so it doesn't remount on every render)
───────────────────────────────────────────────────────────────────────────── */
function DBModal({ onClose }) {
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editRow,  setEditRow]  = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ practical_number: "", topic: "", code: "" });
  const [msg,      setMsg]      = useState(null);
  const [busyDB,   setBusyDB]   = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try { setRecords(await (await fetch(`${API}/all`)).json()); }
    catch { setMsg({ ok: false, text: "Cannot reach Flask server." }); }
    finally { setLoading(false); }
  }

  function startAdd()  { setEditRow(null); setForm({ practical_number: "", topic: "", code: "" }); setMsg(null); setShowForm(true); }
  function startEdit(r){ setEditRow(r); setForm({ practical_number: r.practical_number, topic: r.topic, code: r.code }); setMsg(null); setShowForm(true); }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusyDB(true);
    try { await fetch(`${API}/delete/${id}`, { method: "DELETE" }); await loadAll(); setMsg({ ok: true, text: "Deleted." }); }
    catch { setMsg({ ok: false, text: "Delete failed." }); }
    finally { setBusyDB(false); }
  }

  async function handleSave(e) {
    e.preventDefault();
    const { practical_number, topic, code } = form;
    if (!practical_number.trim() || !topic.trim() || !code.trim()) { setMsg({ ok: false, text: "All three fields are required." }); return; }
    setBusyDB(true);
    try {
      const url = editRow ? `${API}/update/${editRow.id}` : `${API}/add`;
      const res = await fetch(url, { method: editRow ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practical_number: practical_number.trim(), topic: topic.trim(), code: code.trim() }) });
      const data = await res.json();
      if (res.ok) { setMsg({ ok: true, text: editRow ? "✓ Updated!" : "✓ Saved!" }); setShowForm(false); setEditRow(null); await loadAll(); }
      else { setMsg({ ok: false, text: data.error || "Server error." }); }
    } catch { setMsg({ ok: false, text: "Cannot reach Flask server." }); }
    finally { setBusyDB(false); }
  }

  function fld(key, placeholder, rows) {
    return rows
      ? <textarea className="add-textarea" rows={rows} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
      : <input className="add-input" type="text" placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />;
  }

  return (
    <div className="add-overlay" onClick={onClose}>
      <div className="dbm-modal" onClick={e => e.stopPropagation()}>
        <div className="add-modal-header">
          <span className="add-modal-title">📦 Database Manager — Practicals</span>
          <button className="add-modal-close" onClick={onClose}>&#215;</button>
        </div>
        <div className="dbm-toolbar">
          <button className="dbm-add-btn" onClick={startAdd}>+ Add New Practical</button>
          <button className="dbm-refresh-btn" onClick={loadAll}>↻ Refresh</button>
          {msg && <span className={"dbm-inline-msg" + (msg.ok ? " ok" : " err")}>{msg.text}</span>}
        </div>
        {showForm && (
          <form className="dbm-form" onSubmit={handleSave}>
            <div className="dbm-form-title">{editRow ? "✏️ Edit Record" : "➕ New Record"}</div>
            <div className="dbm-form-row">
              <label className="add-label" style={{ flex: "0 0 160px" }}>Practical Name{fld("practical_number", "e.g. BG Practical 1")}</label>
              <label className="add-label" style={{ flex: 1 }}>Topic{fld("topic", "e.g. Introduction to Big Data")}</label>
            </div>
            <label className="add-label">Code / Content{fld("code", "Paste code here…", 5)}</label>
            <div className="dbm-form-actions">
              <button type="button" className="add-btn-cancel" onClick={() => { setShowForm(false); setMsg(null); }}>Cancel</button>
              <button type="submit" className="add-btn-save" disabled={busyDB}>{busyDB ? "Saving…" : (editRow ? "Update" : "Save")}</button>
            </div>
          </form>
        )}
        <div className="dbm-table-wrap">
          {loading ? <div className="dbm-empty">Loading…</div>
            : records.length === 0 ? <div className="dbm-empty">No records yet. Click <strong>+ Add New Practical</strong> to begin.</div>
            : (
              <table className="dbm-table">
                <thead><tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 160 }}>Practical Name</th>
                  <th style={{ width: 200 }}>Topic</th>
                  <th>Code (preview)</th>
                  <th style={{ width: 100 }}>Actions</th>
                </tr></thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className={editRow?.id === r.id ? "dbm-editing" : ""}>
                      <td className="dbm-td-center">{i + 1}</td>
                      <td><strong>{r.practical_number}</strong></td>
                      <td>{r.topic}</td>
                      <td className="dbm-code-preview">{r.code.slice(0, 80)}{r.code.length > 80 ? "…" : ""}</td>
                      <td className="dbm-td-center">
                        <button className="dbm-edit-btn" onClick={() => startEdit(r)} title="Edit">✏️</button>
                        <button className="dbm-del-btn"  onClick={() => handleDelete(r.id, r.practical_number)} title="Delete">🗑</button>
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

/* ─────────────────────────────────────────────────────────────────────────────
   APP
───────────────────────────────────────────────────────────────────────────── */
function App() {
  const [notebooks,        setNotebooks]        = useState(INIT);
  const [openTabIds,       setOpenTabIds]        = useState(() => INIT.map(n => n.id));
  const [activeNotebookId, setActiveNotebookId] = useState(INIT[0].id);
  const [renamingId,       setRenamingId]        = useState(null);
  const [renameValue,      setRenameValue]       = useState("");
  const [showAdd,          setShowAdd]           = useState(false);

  const textareaRefs   = useRef({});
  const renameInputRef = useRef(null);

  // Derived state
  const activeNb    = notebooks.find(n => n.id === activeNotebookId) ?? notebooks[0];
  const openTabs    = openTabIds.map(id => notebooks.find(n => n.id === id)).filter(Boolean);
  const activeIndex = Math.max(0, (activeNb?.cells ?? []).findIndex(c => c.id === activeNb?.activeCellId));
  const activeCell  = activeNb?.cells.find(c => c.id === activeNb?.activeCellId);

  // Sync document title with active notebook name
  useEffect(() => {
    document.title = activeNb ? `${activeNb.name} – JupyterSearch` : "JupyterSearch";
  }, [activeNb?.name, activeNb?.id]);

  // Focus rename input when rename starts
  useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.select(), 10);
  }, [renamingId]);

  /* ── Notebook state helper ─────────────────────────────────────────────── */
  function patchNb(id, patch) {
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }

  /* ── Notebook CRUD ─────────────────────────────────────────────────────── */
  function createNotebook() {
    const used = notebooks
      .map(n => { const m = n.name.match(/^Untitled(\d*)\.ipynb$/); return m ? (m[1] === "" ? 0 : +m[1]) : -1; })
      .filter(n => n >= 0);
    let num = 0;
    while (used.includes(num)) num++;
    const nb = makeNotebook(num === 0 ? "Untitled.ipynb" : `Untitled${num}.ipynb`);
    setNotebooks(prev => [...prev, nb]);
    setOpenTabIds(prev => [...prev, nb.id]);
    setActiveNotebookId(nb.id);
  }

  function openNotebook(id) {
    setOpenTabIds(prev => prev.includes(id) ? prev : [...prev, id]);
    setActiveNotebookId(id);
  }

  function closeTab(id, e) {
    e.stopPropagation();
    setOpenTabIds(prev => {
      const idx  = prev.indexOf(id);
      const next = prev.filter(t => t !== id);
      if (activeNotebookId === id && next.length > 0) setActiveNotebookId(next[Math.max(0, idx - 1)]);
      return next;
    });
  }

  function deleteNotebook(id, name, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"?\nThis cannot be undone.`)) return;
    setOpenTabIds(prev => {
      const idx  = prev.indexOf(id);
      const next = prev.filter(t => t !== id);
      if (activeNotebookId === id && next.length > 0) setActiveNotebookId(next[Math.max(0, idx - 1)]);
      return next;
    });
    setNotebooks(prev => prev.filter(n => n.id !== id));
  }

  /* ── Rename ────────────────────────────────────────────────────────────── */
  function startRename(id, name, e) {
    e.stopPropagation(); e.preventDefault();
    setRenamingId(id);
    setRenameValue(name.replace(/\.ipynb$/, ""));
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      let name = renameValue.trim();
      if (!name.endsWith(".ipynb")) name += ".ipynb";
      patchNb(renamingId, { name });
    }
    setRenamingId(null); setRenameValue("");
  }

  function handleRenameKey(e) {
    if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
  }

  /* ── Cell helpers ──────────────────────────────────────────────────────── */
  function patchCell(nbId, cellId, patch) {
    setNotebooks(prev => prev.map(nb => nb.id !== nbId ? nb : {
      ...nb, cells: nb.cells.map(c => c.id === cellId ? { ...c, ...patch } : c),
    }));
  }

  function addCell(afterCellId, type = "code") {
    const cell = newCell(type);
    setNotebooks(prev => prev.map(nb => {
      if (nb.id !== activeNotebookId) return nb;
      let cells = [...nb.cells];
      if (!afterCellId) { cells.push(cell); }
      else { cells.splice(cells.findIndex(c => c.id === afterCellId) + 1, 0, cell); }
      return { ...nb, cells, activeCellId: cell.id };
    }));
    window.requestAnimationFrame(() => textareaRefs.current[cell.id]?.focus());
  }

  function deleteCell(cellId) {
    setNotebooks(prev => prev.map(nb => {
      if (nb.id !== activeNotebookId) return nb;
      if (nb.cells.length === 1) { const c = newCell(); return { ...nb, cells: [c], activeCellId: c.id }; }
      const idx    = nb.cells.findIndex(c => c.id === cellId);
      const cells  = nb.cells.filter(c => c.id !== cellId);
      return { ...nb, cells, activeCellId: cells[Math.max(0, idx - 1)].id };
    }));
  }

  function changeCellType(cellId, type) {
    patchCell(activeNotebookId, cellId, { type, rendered: false, results: null, error: null });
  }

  function moveCellUp(cellId) {
    setNotebooks(prev => prev.map(nb => {
      if (nb.id !== activeNotebookId) return nb;
      const i = nb.cells.findIndex(c => c.id === cellId);
      if (i === 0) return nb;
      const cells = [...nb.cells];
      [cells[i - 1], cells[i]] = [cells[i], cells[i - 1]];
      return { ...nb, cells };
    }));
  }

  function moveCellDown(cellId) {
    setNotebooks(prev => prev.map(nb => {
      if (nb.id !== activeNotebookId) return nb;
      const i = nb.cells.findIndex(c => c.id === cellId);
      if (i === nb.cells.length - 1) return nb;
      const cells = [...nb.cells];
      [cells[i], cells[i + 1]] = [cells[i + 1], cells[i]];
      return { ...nb, cells };
    }));
  }

  function restartKernel() {
    if (!window.confirm("Restart kernel? All cell outputs will be cleared.")) return;
    setNotebooks(prev => prev.map(nb => nb.id !== activeNotebookId ? nb : {
      ...nb,
      runCount: 0,
      busy: false,
      cells: nb.cells.map(c => ({
        ...c,
        results: null, error: null, executionCount: null,
        searching: false, rendered: false,
        codeOutput: null, codeError: null, wasExecuted: false,
      })),
    }));
  }

  /* ── Run cell ──────────────────────────────────────────────────────────── */
  async function runCell(cellId) {
    const nb   = notebooks.find(n => n.id === activeNotebookId);
    if (!nb) return;
    const cell = nb.cells.find(c => c.id === cellId);
    if (!cell) return;

    // Markdown → render
    if (cell.type === "markdown") {
      patchCell(activeNotebookId, cellId, { rendered: true });
      return;
    }

    // Code → search first, then fall back to Python execution
    if (cell.searching) return;
    const query     = cell.input.trim();
    const nextCount = nb.runCount + 1;

    setNotebooks(prev => prev.map(n => n.id !== activeNotebookId ? n : {
      ...n, runCount: nextCount, busy: true,
      cells: n.cells.map(c => c.id === cellId
        ? { ...c, searching: true, executionCount: nextCount, error: null,
            results: null, codeOutput: null, codeError: null, wasExecuted: false }
        : c),
    }));

    // Helper: attempt one search + run cycle
    const attemptRun = async () => {
      // 1️⃣  Search practical database
      const searchRes = await fetch(`${API}/search?q=${encodeURIComponent(query)}`);
      if (!searchRes.ok) {
        let message = `Search failed (${searchRes.status})`;
        try {
          const errorData = await searchRes.json();
          if (errorData.error) message = errorData.error;
        } catch {
          // Keep the status-based message when the server did not return JSON.
        }
        throw new Error(message);
      }
      const results = await searchRes.json();

      if (results.length > 0) {
        // ✅ Practicals found — show them
        setNotebooks(prev => prev.map(n => n.id !== activeNotebookId ? n : {
          ...n, busy: false,
          cells: n.cells.map(c => c.id === cellId
            ? { ...c, results, error: null, searching: false,
                codeOutput: null, codeError: null, wasExecuted: false }
            : c),
        }));
      } else {
        // 2️⃣  No practicals found — execute as Python code
        const runRes  = await fetch(`${API}/run`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code: query }),
        });
        const runData = await runRes.json();
        setNotebooks(prev => prev.map(n => n.id !== activeNotebookId ? n : {
          ...n, busy: false,
          cells: n.cells.map(c => c.id === cellId ? {
            ...c,
            results:     [],
            error:       null,
            searching:   false,
            wasExecuted: true,
            codeOutput:  runData.output || null,
            codeError:   runData.error  || null,
          } : c),
        }));
      }
    };

    // Retry loop — Render free tier can take up to 60 s to wake up
    const MAX_WAIT_MS  = 65_000;
    const RETRY_MS     = 5_000;
    const started      = Date.now();
    let   lastErr      = null;

    while (Date.now() - started < MAX_WAIT_MS) {
      try {
        await attemptRun();
        return; // success — stop the loop
      } catch (err) {
        lastErr = err;
        const elapsed = Date.now() - started;
        if (elapsed + RETRY_MS >= MAX_WAIT_MS) break; // don't bother waiting if we'd exceed limit

        // Show "waking up" status and wait before retrying
        const secsLeft = Math.ceil((MAX_WAIT_MS - elapsed) / 1000);
        setNotebooks(prev => prev.map(n => n.id !== activeNotebookId ? n : {
          ...n,
          cells: n.cells.map(c => c.id === cellId
            ? { ...c, searching: true, error: null,
                // Repurpose error field temporarily to show wake-up message
              }
            : c),
        }));
        // Update the cell error to show a friendly wake-up countdown
        patchCell(activeNotebookId, cellId, {
          searching: true,
          error: `⏳ Server is waking up… retrying (${secsLeft}s remaining)`,
        });

        await new Promise(r => setTimeout(r, RETRY_MS));

        // Clear the temporary message before next attempt
        patchCell(activeNotebookId, cellId, { error: null, searching: true });
      }
    }

    // All retries exhausted — show final error
    setNotebooks(prev => prev.map(n => n.id !== activeNotebookId ? n : {
      ...n, busy: false,
      cells: n.cells.map(c => c.id === cellId
        ? { ...c, results: [], error: `❌ ${lastErr?.message || "Could not reach the search server. Please check your internet connection or try again in a moment."}`,
            searching: false, wasExecuted: false }
        : c),
    }));
  }

  function runAllCells() {
    if (!activeNb) return;
    activeNb.cells.forEach(c => runCell(c.id));
  }

  function handleKeyDown(e, cellId) {
    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) { e.preventDefault(); runCell(cellId); }
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className="jlab">

      {/* ═══ MENU BAR ════════════════════════════════════════════════════════ */}
      <div className="jlab-menu">
        <img src="/logo.png" alt="logo" width={18}  />
        {["File", "Edit", "View", "Run", "Kernel", "Tabs", "Settings", "Help"].map(m => (
          <span key={m} className="jlab-menu-item">{m}</span>
        ))}
        {/* Active notebook name in the centre */}
        <span className="jlab-menu-nb-title">{activeNb?.name}</span>
      </div>

      {/* ═══ BODY ════════════════════════════════════════════════════════════ */}
      <div className="jlab-body">

        {/* Activity bar */}
        <div className="jlab-activity">
          <button className="jlab-act-btn jlab-act-active" title="File Browser">&#128193;</button>
          <button className="jlab-act-btn" title="Running">&#9711;</button>
          <button className="jlab-act-btn" title="Table of Contents">&#9776;</button>
          <button className="jlab-act-btn" title="Extensions">&#x2B21;</button>
        </div>

        {/* ═══ LEFT PANEL — file browser ═══════════════════════════════════ */}
        <div className="jlab-panel">
          <div className="jlab-panel-path">
            <button className="jlab-panel-new" onClick={createNotebook}>+</button>
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
            {notebooks.length === 0 && (
              <div className="jlab-no-files">No notebooks. Click <strong>+ New</strong>.</div>
            )}
            {notebooks.map(nb => (
              <div
                key={nb.id}
                className={"jlab-file-row" + (activeNotebookId === nb.id && openTabIds.includes(nb.id) ? " active" : "")}
                onClick={() => openNotebook(nb.id)}
                onDoubleClick={e => startRename(nb.id, nb.name, e)}
                title="Click to open · Double-click to rename"
              >
                <span className="jlab-nb-icon">&#x25A3;</span>

                {renamingId === nb.id ? (
                  <input
                    ref={renameInputRef}
                    className="jlab-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKey}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="jlab-file-name">{nb.name}</span>
                )}

                <span className="jlab-file-mod">now</span>

                {/* Delete button — visible on row hover */}
                <button
                  className="jlab-file-del"
                  title={`Delete ${nb.name}`}
                  onClick={e => deleteNotebook(nb.id, nb.name, e)}
                >🗑</button>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ MAIN ════════════════════════════════════════════════════════ */}
        <div className="jlab-main">

          {/* Tab bar */}
          <div className="jlab-tabs">
            {openTabs.map(nb => (
              <div
                key={nb.id}
                className={"jlab-tab" + (activeNotebookId === nb.id ? " active" : "")}
                onClick={() => setActiveNotebookId(nb.id)}
                onDoubleClick={e => startRename(nb.id, nb.name, e)}
                title="Click to switch · Double-click to rename"
              >
                <span className="jlab-tab-icon">&#x25A3;</span>

                {renamingId === nb.id ? (
                  <input
                    ref={renameInputRef}
                    className="jlab-rename-input jlab-rename-tab"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKey}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="jlab-tab-label">{nb.name}</span>
                )}

                {activeNotebookId === nb.id && <span className="jlab-tab-dot">&#9679;</span>}
                <span className="jlab-tab-close" title="Close tab" onClick={e => closeTab(nb.id, e)}>&#215;</span>
              </div>
            ))}
            {openTabs.length === 0 && (
              <div className="jlab-no-tabs">No open notebooks — click a file or + New</div>
            )}
          </div>

          {/* ═══ NOTEBOOK ════════════════════════════════════════════════ */}
          {openTabs.length > 0 && activeNb ? (
            <div className="jlab-notebook">

              {/* Toolbar */}
              <div className="jlab-toolbar">
                {/* Save */}
                <button title="Save" className="jlab-tb-btn">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.5L11.5 1H2zm0 1h9l3 3V14H2V2zm2 8v3h8v-3H4zm1 1h6v1H5v-1zM4 2v4h7V2H4zm1 1h2v2H5V3zm3 0h2v2H8V3z"/></svg>
                </button>
                <div className="jlab-tb-sep" />

                {/* Insert code / markdown */}
                <button title="Insert code cell below"     className="jlab-tb-btn" onClick={() => addCell(activeNb.activeCellId, "code")}>+</button>
                <button title="Insert markdown cell below" className="jlab-tb-btn jlab-md-add-btn" onClick={() => addCell(activeNb.activeCellId, "markdown")}>M+</button>
                <div className="jlab-tb-sep" />

                {/* Run */}
                <button title="Run cell (Shift+Enter)" className="jlab-tb-btn jlab-run" onClick={() => runCell(activeNb.activeCellId)}>&#9654;</button>
                <button title="Stop"                   className="jlab-tb-btn">&#9632;</button>
                <button title="Restart kernel"         className="jlab-tb-btn" onClick={restartKernel}>&#8635;</button>
                <button title="Restart &amp; Run All"  className="jlab-tb-btn" onClick={runAllCells}>&#9193;</button>
                <div className="jlab-tb-sep" />

                {/* Cell type dropdown — reflects + changes active cell type */}
                <select
                  className="jlab-tb-select"
                  value={activeCell?.type === "markdown" ? "Markdown" : "Code"}
                  onChange={e => activeCell && changeCellType(activeCell.id, e.target.value === "Markdown" ? "markdown" : "code")}
                >
                  <option>Code</option>
                  <option>Markdown</option>
                </select>

                <span className="jlab-tb-spacer" />
                <span className="jlab-kernel-name">Notebook&nbsp;|</span>
                <span className={"jlab-kernel-circle" + (activeNb.busy ? " busy" : "")} title={activeNb.busy ? "Busy" : "Idle"} />
                <span className="jlab-kernel-label">{activeNb.name.replace(/\.ipynb$/, "")}</span>
                <div className="jlab-tb-sep" />
                <button title="Open DB Manager" className="jlab-tb-btn jlab-add-btn" onClick={() => setShowAdd(true)}>+ DB</button>
              </div>

              {/* Cells */}
              <div className="jlab-cells">
                {activeNb.cells.map(cell => {
                  const prompt     = cell.executionCount === null ? " " : cell.executionCount;
                  const isActive   = activeNb.activeCellId === cell.id;
                  const isMd       = cell.type === "markdown";
                  const showOutput = !isMd && (
                    cell.searching ||
                    cell.error ||
                    cell.results !== null ||
                    cell.codeOutput !== null ||
                    cell.codeError  !== null
                  );

                  return (
                    <div key={cell.id} className="jlab-cell-block">

                      {/* Input cell */}
                      <div
                        className={"jlab-cell" + (isActive ? " selected" : "") + (isMd ? " md-cell" : "")}
                        onClick={() => patchNb(activeNb.id, { activeCellId: cell.id })}
                      >
                        {/* Prompt / type badge */}
                        <div className={"jlab-in-prompt" + (isMd ? " md-prompt" : "")}>
                          {isMd ? "MD" : `[${prompt}]:`}
                        </div>

                        <div className="jlab-in-body">
                          {/* Markdown rendered view — click to edit */}
                          {isMd && cell.rendered ? (
                            <div
                              className="jlab-md-output"
                              title="Click to edit"
                              onClick={e => { e.stopPropagation(); patchCell(activeNb.id, cell.id, { rendered: false }); patchNb(activeNb.id, { activeCellId: cell.id }); }}
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.input) }}
                            />
                          ) : (
                            <textarea
                              ref={node => { textareaRefs.current[cell.id] = node; }}
                              className={"jlab-textarea" + (isMd ? " jlab-md-textarea" : "")}
                              value={cell.input}
                              spellCheck={isMd}
                              // placeholder={isMd ? "Write **markdown** here… (Shift+Enter to render)" : "Search practicals… (Shift+Enter to run)"}
                              onChange={e => {
                                setNotebooks(prev => prev.map(nb => nb.id !== activeNotebookId ? nb : {
                                  ...nb, cells: nb.cells.map(c => c.id === cell.id ? { ...c, input: e.target.value } : c),
                                }));
                                e.target.style.height = "30px";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }}
                              onFocus={() => patchNb(activeNb.id, { activeCellId: cell.id })}
                              onKeyDown={e => handleKeyDown(e, cell.id)}
                            />
                          )}
                        </div>

                        {/* Mini cell toolbar */}
                        {isActive && (
                          <div className="jlab-cell-toolbar">
                            <button title="Run (Shift+Enter)" onClick={() => runCell(cell.id)}>&#9654;</button>
                            <button title="Add code cell below"     onClick={() => addCell(cell.id, "code")}>+</button>
                            <button title="Add markdown cell below"  onClick={() => addCell(cell.id, "markdown")}>M</button>
                            <button title="Move up"                  onClick={() => moveCellUp(cell.id)}>&#8593;</button>
                            <button title="Move down"                onClick={() => moveCellDown(cell.id)}>&#8595;</button>
                            <button title="Delete cell"              onClick={() => deleteCell(cell.id)}>&#128465;</button>
                          </div>
                        )}
                      </div>

                      {/* Code cell output */}
                      {showOutput && (
                        <div className="jlab-out-row">
                          <div className="jlab-out-prompt">[{prompt}]:</div>
                          <div className="jlab-out-body">

                            {/* Searching spinner */}
                            {cell.searching && (
                              <div className="jlab-searching"><span className="jlab-spinner" />&nbsp;Searching&hellip;</div>
                            )}

                            {/* Network / server error */}
                            {cell.error && <pre className="jlab-error">{cell.error}</pre>}

                            {/* ── Practical search results ── */}
                            {!cell.searching && !cell.error && !cell.wasExecuted && cell.results?.map((item, i) => (
                              <div key={cell.id + i} className="jlab-result">
                                <div className="jlab-result-heading">
                                  <span className="jlab-hash">#</span>
                                  <span className="jlab-topic-text">{item.topic}</span>
                                </div>
                                <pre className="jlab-code">{item.code}</pre>
                              </div>
                            ))}

                            {/* ── Python execution output ── */}
                            {!cell.searching && !cell.error && cell.wasExecuted && (
                              <div className="jlab-exec-output">
                                {/* stdout */}
                                {cell.codeOutput && (
                                  <pre className="jlab-stdout">{cell.codeOutput}</pre>
                                )}
                                {/* stderr / traceback */}
                                {cell.codeError && (
                                  <pre className="jlab-stderr">{cell.codeError}</pre>
                                )}
                                {/* empty output */}
                                {!cell.codeOutput && !cell.codeError && (
                                  <div className="jlab-exec-empty">(no output)</div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="jlab-empty-state">
              <div className="jlab-empty-icon">&#128196;</div>
              <div className="jlab-empty-title">No notebooks open</div>
              <div className="jlab-empty-sub">Click a file in the panel or press <strong>+ New</strong></div>
              <button className="jlab-empty-btn" onClick={createNotebook}>+ New Notebook</button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ STATUS BAR ═══════════════════════════════════════════════════════ */}
      <div className="jlab-status">
        <span className="jlab-kernel-circle jlab-st-kernel-dot" />
        <span className="jlab-st">{activeNb?.name.replace(/\.ipynb$/, "")}</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">{activeNb?.busy ? "Busy" : "Idle"}</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">{activeCell?.type === "markdown" ? "Markdown" : "Code"}</span>
        <div className="jlab-st-spacer" />
        <span className="jlab-st">Cell {activeIndex + 1}/{activeNb?.cells.length ?? 0}</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">Ln 1, Col 1</span>
        <span className="jlab-st-sep">|</span>
        <span className="jlab-st">{activeNb?.name}</span>
      </div>

      {/* ═══ DB MODAL ═══════════════════════════════════════════════════════ */}
      {showAdd && <DBModal onClose={() => setShowAdd(false)} />}

    </div>
  );
}

export default App;
