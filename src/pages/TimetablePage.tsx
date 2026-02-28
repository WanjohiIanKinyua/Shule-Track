import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import * as XLSX from "xlsx-js-style";

type ClassItem = { id: string; name: string; stream: string | null };
type Subject = { id: string; name: string };
type Lesson = {
  id: string;
  subject_id: string | null;
  subject_name: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  attended: boolean | null;
  reason: string | null;
  compensated: boolean;
  compensation_note?: string | null;
  compensation_date?: string | null;
  compensation_for_lesson_id?: string | null;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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

export default function TimetablePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [day_of_week, setDay] = useState("Monday");
  const [subject_id, setSubjectId] = useState("");
  const [start_time, setStartTime] = useState("08:00");
  const [end_time, setEndTime] = useState("08:40");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [compLesson, setCompLesson] = useState<Lesson | null>(null);
  const [compDay, setCompDay] = useState("Monday");
  const [compStart, setCompStart] = useState("08:00");
  const [compEnd, setCompEnd] = useState("08:40");
  const [compNote, setCompNote] = useState("");
  const [compDate, setCompDate] = useState(new Date().toISOString().slice(0, 10));
  const [compSaving, setCompSaving] = useState(false);
  const [reasonLesson, setReasonLesson] = useState<Lesson | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);

  useEffect(() => {
    api("/classes").then((data) => {
      const sorted = sortClasses(data || []);
      setClasses(sorted);
      if (sorted.length) setClassId(sorted[0].id);
    });
  }, []);

  async function loadClassData(targetClassId: string) {
    const [subjectsData, lessonsData] = await Promise.all([
      api(`/classes/${targetClassId}/subjects`),
      api(`/classes/${targetClassId}/timetable`),
    ]);
    setSubjects(subjectsData);
    setLessons(lessonsData);
    if (subjectsData.length) setSubjectId(subjectsData[0].id);
  }

  useEffect(() => {
    if (!classId) return;
    loadClassData(classId);
  }, [classId]);

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !subject_id) return;
    await api(`/classes/${classId}/timetable`, {
      method: "POST",
      body: JSON.stringify({ subject_id, day_of_week, start_time, end_time }),
    });
    await loadClassData(classId);
  }

  async function mark(lessonId: string, attended: boolean) {
    if (!attended) {
      const lesson = lessons.find((x) => String(x.id) === String(lessonId)) || null;
      setReasonLesson(lesson);
      setReasonText("");
      return;
    }
    await api(`/timetable/${lessonId}`, {
      method: "PATCH",
      body: JSON.stringify({ attended: true, reason: "" }),
    });
    await loadClassData(classId);
  }

  async function removeLesson(id: string) {
    await api(`/timetable/${id}`, { method: "DELETE" });
    await loadClassData(classId);
  }

  function openCompensationModal(lesson: Lesson) {
    setCompLesson(lesson);
    setCompDay(lesson.day_of_week || "Monday");
    setCompStart(lesson.start_time?.slice(0, 5) || "08:00");
    setCompEnd(lesson.end_time?.slice(0, 5) || "08:40");
    setCompNote("");
    setCompDate(new Date().toISOString().slice(0, 10));
  }

  function closeCompensationModal() {
    setCompLesson(null);
    setCompSaving(false);
  }

  function closeReasonModal() {
    setReasonLesson(null);
    setReasonText("");
    setReasonSaving(false);
  }

  async function submitNotAttendedReason(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonLesson) return;
    setReasonSaving(true);
    try {
      await api(`/timetable/${reasonLesson.id}`, {
        method: "PATCH",
        body: JSON.stringify({ attended: false, reason: reasonText }),
      });
      await loadClassData(classId);
      closeReasonModal();
    } finally {
      setReasonSaving(false);
    }
  }

  async function submitCompensation(e: React.FormEvent) {
    e.preventDefault();
    if (!compLesson) return;
    setCompSaving(true);
    try {
      await api(`/timetable/${compLesson.id}/compensate`, {
        method: "PATCH",
        body: JSON.stringify({
          day_of_week: compDay,
          start_time: compStart,
          end_time: compEnd,
          compensation_note: compNote,
          compensation_date: compDate,
        }),
      });
      await loadClassData(classId);
      closeCompensationModal();
    } finally {
      setCompSaving(false);
    }
  }

  function normalizeHeader(value: string) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeDay(value: string) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.startsWith("mon")) return "Monday";
    if (raw.startsWith("tue")) return "Tuesday";
    if (raw.startsWith("wed")) return "Wednesday";
    if (raw.startsWith("thu")) return "Thursday";
    if (raw.startsWith("fri")) return "Friday";
    return "";
  }

  async function importTimetableFile(file: File) {
    if (!classId) return;
    setImporting(true);
    setImportStatus("");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      if (!rows.length) {
        setImportStatus("No rows found in file.");
        return;
      }

      const subjectIdByName = new Map<string, string>();
      subjects.forEach((s) => subjectIdByName.set(s.name.trim().toLowerCase(), String(s.id)));

      let added = 0;
      let skipped = 0;

      for (const row of rows) {
        const mapped: Record<string, any> = {};
        Object.keys(row).forEach((k) => {
          mapped[normalizeHeader(k)] = row[k];
        });

        const day = normalizeDay(mapped.day || mapped.dayofweek || "");
        const subjectName = String(mapped.subject || mapped.subjectname || "").trim();
        const start = String(mapped.starttime || mapped.start || "").trim();
        const end = String(mapped.endtime || mapped.end || "").trim();
        const subjectId = subjectIdByName.get(subjectName.toLowerCase()) || "";

        if (!day || !subjectId || !start || !end) {
          skipped += 1;
          continue;
        }

        try {
          await api(`/classes/${classId}/timetable`, {
            method: "POST",
            body: JSON.stringify({
              subject_id: subjectId,
              day_of_week: day,
              start_time: start,
              end_time: end,
            }),
          });
          added += 1;
        } catch {
          skipped += 1;
        }
      }

      await loadClassData(classId);
      setImportStatus(`Import complete. Added ${added} lessons, skipped ${skipped}.`);
    } catch (e: any) {
      setImportStatus(e.message || "Failed to import timetable.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await importTimetableFile(file);
  }

  function downloadTimetableTemplate() {
    const rows = [
      { day: "Monday", subject: "Mathematics", start_time: "08:00", end_time: "08:40" },
      { day: "Tuesday", subject: "English", start_time: "08:40", end_time: "09:20" },
      { day: "Wednesday", subject: "Kiswahili", start_time: "09:20", end_time: "10:00" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timetable");
    XLSX.writeFile(wb, "timetable_import_template.xlsx");
  }

  const coverage = useMemo(() => {
    const total = lessons.length;
    const attended = lessons.filter((l) => l.attended === true).length;
    const missed = lessons.filter((l) => l.attended === false).length;
    const compensated = lessons.filter((l) => l.compensated === true).length;
    return {
      total,
      attended,
      missed,
      compensated,
      percent: total ? ((attended / total) * 100).toFixed(1) : "0.0",
    };
  }, [lessons]);

  return (
    <div>
      <h2>Timetable & Lesson Coverage</h2>
      <p className="muted">Plan weekly lessons and track attended/not attended with reasons.</p>
      {compLesson && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Add Compensation Slot</h3>
            <p className="muted">
              For missed lesson: {compLesson.day_of_week} {compLesson.start_time?.slice(0, 5)} -{" "}
              {compLesson.end_time?.slice(0, 5)}
            </p>
            <form className="inline-form" onSubmit={submitCompensation}>
              <select value={compDay} onChange={(e) => setCompDay(e.target.value)} required>
                {DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <input type="time" value={compStart} onChange={(e) => setCompStart(e.target.value)} required />
              <input type="time" value={compEnd} onChange={(e) => setCompEnd(e.target.value)} required />
              <input type="date" value={compDate} onChange={(e) => setCompDate(e.target.value)} />
              <input
                placeholder="Optional note"
                value={compNote}
                onChange={(e) => setCompNote(e.target.value)}
              />
              <button className="btn" type="submit" disabled={compSaving}>
                {compSaving ? "Saving..." : "Save Compensation"}
              </button>
              <button className="btn btn-outline" type="button" onClick={closeCompensationModal} disabled={compSaving}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      {reasonLesson && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Reason For Not Attended</h3>
            <p className="muted">
              Lesson: {reasonLesson.day_of_week} {reasonLesson.start_time?.slice(0, 5)} -{" "}
              {reasonLesson.end_time?.slice(0, 5)}
            </p>
            <form className="inline-form" onSubmit={submitNotAttendedReason}>
              <input
                placeholder="e.g. Public holiday, teacher absent, school activity"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="modal-flex-input"
              />
              <button className="btn btn-yellow" type="submit" disabled={reasonSaving}>
                {reasonSaving ? "Saving..." : "Save Reason"}
              </button>
              <button className="btn btn-outline" type="button" onClick={closeReasonModal} disabled={reasonSaving}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="inline-form">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream ? `- ${c.stream}` : ""}
              </option>
            ))}
          </select>
          <span className="tag tag-blue">Total: {coverage.total}</span>
          <span className="tag tag-green">Attended: {coverage.attended}</span>
          <span className="tag tag-red">Not attended: {coverage.missed}</span>
          <span className="tag">Compensated: {coverage.compensated}</span>
          <span className="tag tag-yellow">Coverage: {coverage.percent}%</span>
        </div>
      </section>
      <section className="panel">
        <h3>Add Lesson</h3>
        <form className="inline-form" onSubmit={addLesson}>
          <select value={day_of_week} onChange={(e) => setDay(e.target.value)}>
            {DAYS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select value={subject_id} onChange={(e) => setSubjectId(e.target.value)} required disabled={!subjects.length}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input type="time" value={start_time} onChange={(e) => setStartTime(e.target.value)} required />
          <input type="time" value={end_time} onChange={(e) => setEndTime(e.target.value)} required />
          <button className="btn" type="submit" disabled={!classId || !subject_id}>
            Add
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onImportChange}
            style={{ display: "none" }}
          />
          <button
            className="btn btn-outline"
            type="button"
            disabled={!classId || importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Importing..." : "Import Excel"}
          </button>
          <button className="btn btn-outline" type="button" onClick={downloadTimetableTemplate}>
            Download Template
          </button>
        </form>
        {!subjects.length && <p className="muted">Add subjects in Marks page before creating lessons.</p>}
        <p className="muted">Expected columns: day, subject, start_time, end_time.</p>
        {!!importStatus && <p className="muted">{importStatus}</p>}
      </section>
      {DAYS.map((day) => {
        const dayLessons = lessons.filter((l) => l.day_of_week === day);
        if (!dayLessons.length) return null;
        return (
          <section className="panel" key={day}>
            <h3>{day}</h3>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dayLessons.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.start_time.slice(0, 5)} - {l.end_time.slice(0, 5)}
                    </td>
                    <td>{l.subject_name || "-"}</td>
                    <td>
                      {l.attended === null && <span className="tag">Pending</span>}
                      {l.attended === true && <span className="tag tag-green">Attended</span>}
                      {l.attended === false && <span className="tag tag-red">Not attended</span>}
                      {l.attended === false && l.compensated === true && (
                        <span className="tag tag-blue" style={{ marginLeft: "6px" }}>
                          Compensated
                        </span>
                      )}
                    </td>
                    <td>
                      {l.reason || "-"}
                      {l.compensated && (
                        <div className="muted" style={{ marginTop: "4px", fontSize: "0.85rem" }}>
                          {l.compensation_date ? `Comp date: ${l.compensation_date}. ` : ""}
                          {l.compensation_note || ""}
                        </div>
                      )}
                    </td>
                    <td className="table-actions-cell">
                      <div className="inline-form table-actions">
                        <button className="btn btn-green" type="button" onClick={() => mark(l.id, true)}>
                          Attended
                        </button>
                        <button className="btn btn-yellow" type="button" onClick={() => mark(l.id, false)}>
                          Not Attended
                        </button>
                        {l.attended === false && !l.compensated && (
                          <button className="btn btn-outline" type="button" onClick={() => openCompensationModal(l)}>
                            Add Compensation Slot
                          </button>
                        )}
                        <button className="btn btn-danger" type="button" onClick={() => removeLesson(l.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
