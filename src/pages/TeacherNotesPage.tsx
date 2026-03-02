import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { showSuccess } from "../lib/notify";

type ClassItem = { id: string; name: string; stream: string | null };
type NoteItem = {
  id: string;
  class_id: string;
  title: string;
  content_html: string;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function sortClasses(items: ClassItem[]) {
  const rank = (name: string) => {
    if (name.includes("Form 1")) return 1;
    if (name.includes("Form 2")) return 2;
    if (name.includes("Form 3")) return 3;
    if (name.includes("Form 4")) return 4;
    return 99;
  };
  return [...items].sort((a, b) => {
    const r = rank(a.name) - rank(b.name);
    if (r !== 0) return r;
    return (a.stream || "").localeCompare(b.stream || "");
  });
}

function stripHtml(value: string) {
  if (typeof window === "undefined") return value.replace(/<[^>]*>/g, " ").trim();
  const holder = document.createElement("div");
  holder.innerHTML = value;
  return (holder.textContent || holder.innerText || "").replace(/\s+/g, " ").trim();
}

export default function TeacherNotesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [exportDate, setExportDate] = useState(new Date().toISOString().slice(0, 10));
  const [exportFrom, setExportFrom] = useState(new Date().toISOString().slice(0, 10));
  const [exportTo, setExportTo] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [editingId, setEditingId] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api("/classes").then((data) => {
      const sorted = sortClasses(data || []);
      setClasses(sorted);
      if (sorted.length) setClassId(String(sorted[0].id));
    });
  }, []);

  useEffect(() => {
    if (!classId) {
      setNotes([]);
      return;
    }
    api(`/classes/${classId}/teacher-notes`).then((data) => setNotes(data || []));
  }, [classId]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== contentHtml) {
      editorRef.current.innerHTML = contentHtml || "";
    }
  }, [contentHtml]);

  const classLabel = useMemo(() => {
    const found = classes.find((item) => String(item.id) === String(classId));
    return found ? `${found.name}${found.stream ? ` - ${found.stream}` : ""}` : "Class";
  }, [classes, classId]);

  const activeNotes = useMemo(() => notes.filter((item) => !item.is_completed), [notes]);
  const historyNotes = useMemo(() => notes.filter((item) => item.is_completed), [notes]);

  function resetForm() {
    setTitle("");
    setDueDate("");
    setContentHtml("");
    setEditingId("");
    setStatus("");
    if (editorRef.current) editorRef.current.innerHTML = "";
  }

  function syncEditor() {
    setContentHtml(editorRef.current?.innerHTML || "");
  }

  async function reloadNotes() {
    if (!classId) return;
    const data = await api(`/classes/${classId}/teacher-notes`);
    setNotes(data || []);
  }

  function applyFormat(command: string, value?: string) {
    if (typeof document === "undefined") return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditor();
  }

  async function saveNote() {
    const cleanTitle = title.trim();
    const cleanContent = stripHtml(contentHtml);
    if (!classId) {
      setStatus("Select a class first.");
      return;
    }
    if (!cleanTitle) {
      setStatus("Add a title for the reminder.");
      return;
    }
    if (!cleanContent) {
      setStatus("Write the reminder details.");
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const payload = {
        title: cleanTitle,
        due_date: dueDate || null,
        content_html: contentHtml,
      };

      if (editingId) {
        await api(`/teacher-notes/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setStatus("Reminder note updated.");
        showSuccess("Reminder note updated successfully.");
      } else {
        await api(`/classes/${classId}/teacher-notes`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setStatus("Reminder note saved.");
        showSuccess("Reminder note saved successfully.");
      }

      await reloadNotes();
      resetForm();
    } catch (error: any) {
      setStatus(error.message || "Failed to save reminder note.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(note: NoteItem) {
    setEditingId(note.id);
    setTitle(note.title);
    setDueDate(note.due_date || "");
    setContentHtml(note.content_html || "");
    setStatus("Editing reminder note.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeStatus(noteId: string, completed: boolean) {
    setStatus("");
    try {
      await api(`/teacher-notes/${noteId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      await reloadNotes();
      setStatus(completed ? "Reminder marked as complete." : "Reminder reopened.");
      showSuccess(completed ? "Reminder marked as complete." : "Reminder reopened successfully.");
      if (editingId === noteId && completed) resetForm();
    } catch (error: any) {
      setStatus(error.message || "Failed to update reminder.");
    }
  }

  async function removeNote(noteId: string) {
    setStatus("");
    try {
      await api(`/teacher-notes/${noteId}`, { method: "DELETE" });
      await reloadNotes();
      setStatus("Reminder deleted.");
      showSuccess("Reminder deleted successfully.");
      if (editingId === noteId) resetForm();
    } catch (error: any) {
      setStatus(error.message || "Failed to delete reminder.");
    }
  }

  function noteDateKey(note: NoteItem) {
    return new Date(note.created_at).toISOString().slice(0, 10);
  }

  function buildExportHtml(exportItems: NoteItem[], heading: string) {
    if (!exportItems.length) {
      return "";
    }

    const sections = exportItems
      .map((note, index) => {
        const meta = [
          `No. ${index + 1}`,
          `Status: ${note.is_completed ? "Completed" : "Active"}`,
          `Due Date: ${note.due_date || "-"}`,
          `Created: ${new Date(note.created_at).toLocaleString()}`,
          `Updated: ${new Date(note.updated_at).toLocaleString()}`,
          note.completed_at ? `Completed: ${new Date(note.completed_at).toLocaleString()}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        return `
          <section style="margin-bottom:24px;padding:16px;border:1px solid #d7e2f3;border-radius:12px;">
            <h2 style="margin:0 0 8px;color:#123b7a;">${note.title}</h2>
            <p style="margin:0 0 12px;color:#4a6389;font-size:14px;">${meta}</p>
            <div>${note.content_html}</div>
          </section>
        `;
      })
      .join("");

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${heading}</title>
        </head>
        <body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#102341;">
          <h1 style="margin-top:0;">${heading}</h1>
          ${sections}
        </body>
      </html>
    `;
  }

  function triggerDownload(exportItems: NoteItem[], fileLabel: string, heading: string) {
    if (!exportItems.length) {
      setStatus("No reminder notes found for the selected date.");
      return;
    }

    const html = buildExportHtml(exportItems, heading);

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${classLabel.replace(/\s+/g, "_")}_teacher_notes_${fileLabel}.html`;
    link.click();
    URL.revokeObjectURL(url);
    showSuccess("Reminder notes downloaded successfully.");
  }

  function downloadDayNotes() {
    const exportItems = notes.filter((note) => noteDateKey(note) === exportDate);
    triggerDownload(exportItems, exportDate, `${classLabel} Teacher Reminder Notes (${exportDate})`);
    if (exportItems.length) {
      setStatus(`Reminder notes downloaded for ${exportDate}.`);
    }
  }

  function downloadRangeNotes() {
    if (!exportFrom || !exportTo) {
      setStatus("Select both From and To dates.");
      return;
    }
    if (exportFrom > exportTo) {
      setStatus("From date must be before or equal to To date.");
      return;
    }
    const exportItems = notes.filter((note) => {
      const createdDate = noteDateKey(note);
      return createdDate >= exportFrom && createdDate <= exportTo;
    });
    triggerDownload(exportItems, `${exportFrom}_to_${exportTo}`, `${classLabel} Teacher Reminder Notes (${exportFrom} to ${exportTo})`);
    if (exportItems.length) {
      setStatus(`Reminder notes downloaded from ${exportFrom} to ${exportTo}.`);
    }
  }

  return (
    <div>
      <h2>Teacher Reminder Notes</h2>
      <p className="muted">Write class-specific reminders, assignments, CAT plans, and follow-up tasks in one place.</p>

      <section className="panel teacher-notes-editor-panel">
        <div className="panel-head">
          <div>
            <h3>{editingId ? "Edit Reminder" : "New Reminder"}</h3>
            <p className="muted teacher-notes-subtext">Choose a class, write the note, then save it. Completed notes move to history.</p>
          </div>
        </div>

        <div className="inline-form">
          <input type="date" value={exportDate} onChange={(e) => setExportDate(e.target.value)} />
          <button className="btn btn-outline" type="button" onClick={downloadDayNotes} disabled={!notes.length}>
            Download Day
          </button>
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
          <button className="btn btn-outline" type="button" onClick={downloadRangeNotes} disabled={!notes.length}>
            Download Range
          </button>
        </div>

        <div className="teacher-notes-form">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} {item.stream ? `- ${item.stream}` : ""}
              </option>
            ))}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reminder title" />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="teacher-notes-toolbar">
          <button className="btn btn-outline" type="button" onClick={() => applyFormat("bold")}>
            Bold
          </button>
          <button className="btn btn-outline" type="button" onClick={() => applyFormat("italic")}>
            Italic
          </button>
          <button className="btn btn-outline" type="button" onClick={() => applyFormat("formatBlock", "<h3>")}>
            Heading
          </button>
          <button className="btn btn-outline" type="button" onClick={() => applyFormat("insertUnorderedList")}>
            Bullets
          </button>
          <button className="btn btn-outline" type="button" onClick={() => applyFormat("removeFormat")}>
            Clear
          </button>
        </div>

        <div
          ref={editorRef}
          className="teacher-notes-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={syncEditor}
          data-placeholder="Write the reminder here. Example: Give CAT next week. Collect assignment on Friday."
        />

        <div className="inline-form">
          <button className="btn" type="button" onClick={saveNote} disabled={saving || !classId}>
            {saving ? "Saving..." : editingId ? "Update Reminder" : "Save Reminder"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={resetForm}>
            Clear
          </button>
          <span className="tag tag-blue">Active: {activeNotes.length}</span>
          <span className="tag tag-green">Completed: {historyNotes.length}</span>
        </div>
        {!!status && <p className="muted">{status}</p>}
      </section>

      <section className="teacher-notes-grid">
        <section className="panel">
          <h3>Active Reminders</h3>
          <p className="muted teacher-notes-subtext">These are the notes still pending for {classLabel}.</p>
          <div className="teacher-notes-list">
            {activeNotes.map((note) => (
              <article key={note.id} className="teacher-note-card">
                <div className="teacher-note-head">
                  <div>
                    <h4>{note.title}</h4>
                    <p className="muted">
                      Due: {note.due_date || "-"} | Updated: {new Date(note.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="tag tag-yellow">Pending</span>
                </div>
                <div className="teacher-note-body" dangerouslySetInnerHTML={{ __html: note.content_html }} />
                <div className="table-actions inline-form">
                  <button className="btn btn-outline" type="button" onClick={() => startEdit(note)}>
                    Edit
                  </button>
                  <button className="btn btn-green" type="button" onClick={() => changeStatus(note.id, true)}>
                    Mark Complete
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => removeNote(note.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {!activeNotes.length && <p className="muted">No active reminders for this class.</p>}
          </div>
        </section>

        <section className="panel">
          <h3>Reminder History</h3>
          <p className="muted teacher-notes-subtext">Completed reminders stay here for records until you delete them.</p>
          <div className="teacher-notes-list">
            {historyNotes.map((note) => (
              <article key={note.id} className="teacher-note-card teacher-note-complete">
                <div className="teacher-note-head">
                  <div>
                    <h4>{note.title}</h4>
                    <p className="muted">
                      Completed: {note.completed_at ? new Date(note.completed_at).toLocaleString() : "-"}
                    </p>
                  </div>
                  <span className="tag tag-green">Completed</span>
                </div>
                <div className="teacher-note-body" dangerouslySetInnerHTML={{ __html: note.content_html }} />
                <div className="table-actions inline-form">
                  <button className="btn btn-outline" type="button" onClick={() => changeStatus(note.id, false)}>
                    Reopen
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => removeNote(note.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {!historyNotes.length && <p className="muted">No reminder history for this class yet.</p>}
          </div>
        </section>
      </section>
    </div>
  );
}
