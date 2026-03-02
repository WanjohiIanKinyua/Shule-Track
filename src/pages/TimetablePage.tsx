import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import * as XLSX from "xlsx-js-style";
import { showSuccess } from "../lib/notify";

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
type HistoryItem = {
  id: string;
  lesson_id: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  status: "attended" | "not_attended";
  reason: string | null;
  recorded_at: string;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function formatDateLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekBounds(dateValue: string) {
  const base = new Date(`${dateValue}T00:00:00`);
  const day = (base.getDay() + 6) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: formatDateLocal(start),
    end: formatDateLocal(end),
  };
}

export default function TimetablePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [day_of_week, setDay] = useState("Monday");
  const [subject_id, setSubjectId] = useState("");
  const [start_time, setStartTime] = useState("08:00");
  const [end_time, setEndTime] = useState("08:40");
  const [addingLesson, setAddingLesson] = useState(false);
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
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editDay, setEditDay] = useState("Monday");
  const [editSubjectId, setEditSubjectId] = useState("");
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("08:40");
  const [editSaving, setEditSaving] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [pageMessage, setPageMessage] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const isPastDate = selectedDate < today;

  useEffect(() => {
    api("/classes").then((data) => {
      const sorted = sortClasses(data || []);
      setClasses(sorted);
      if (sorted.length) setClassId(sorted[0].id);
    });
  }, []);

  async function loadClassData(targetClassId: string) {
    const [subjectsData, lessonsData, historyData] = await Promise.all([
      api(`/classes/${targetClassId}/subjects`),
      api(`/classes/${targetClassId}/timetable`),
      api(`/classes/${targetClassId}/timetable/history`),
    ]);
    setSubjects(subjectsData || []);
    setLessons(lessonsData || []);
    setHistoryItems(historyData || []);
    if ((subjectsData || []).length) setSubjectId((current) => current || subjectsData[0].id);
  }

  useEffect(() => {
    if (!classId) return;
    loadClassData(classId);
  }, [classId]);

  function openNotice(message: string) {
    setNoticeMessage(message);
  }

  function openLockedNotice() {
    setPageMessage("Previous timetable dates are view-only.");
    openNotice("You cannot edit timetable details for a previous day.");
  }

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    if (isPastDate) {
      openLockedNotice();
      return;
    }
    if (!classId || !subject_id) return;
    if (addingLesson) return;
    if (start_time >= end_time) {
      openNotice("End time must be later than start time.");
      return;
    }
    setAddingLesson(true);
    try {
      await api(`/classes/${classId}/timetable`, {
        method: "POST",
        body: JSON.stringify({ subject_id, day_of_week, start_time, end_time }),
      });
      await loadClassData(classId);
      setPageMessage("Lesson added. Keep adding lessons for Monday to Friday to build the whole week.");
      setImportStatus("");
      showSuccess("Lesson added successfully.");
    } catch (e: any) {
      openNotice(e.message || "Could not add lesson.");
    } finally {
      setAddingLesson(false);
    }
  }

  async function mark(lessonId: string, attended: boolean) {
    if (isPastDate) {
      openLockedNotice();
      return;
    }
    if (!attended) {
      const lesson = lessons.find((x) => String(x.id) === String(lessonId)) || null;
      setReasonLesson(lesson);
      setReasonText("");
      return;
    }
    try {
      await api(`/timetable/${lessonId}`, {
        method: "PATCH",
        body: JSON.stringify({ attended: true, reason: "" }),
      });
      await loadClassData(classId);
      showSuccess("Lesson marked as attended.");
    } catch (e: any) {
      openNotice(e.message || "Could not update lesson.");
    }
  }

  async function removeLesson(id: string) {
    if (isPastDate) {
      openLockedNotice();
      return;
    }
    await api(`/timetable/${id}`, { method: "DELETE" });
    await loadClassData(classId);
    showSuccess("Lesson deleted successfully.");
  }

  function openEditModal(lesson: Lesson) {
    if (isPastDate) {
      openLockedNotice();
      return;
    }
    setEditLesson(lesson);
    setEditDay(lesson.day_of_week || "Monday");
    setEditSubjectId(lesson.subject_id || "");
    setEditStart(lesson.start_time?.slice(0, 5) || "08:00");
    setEditEnd(lesson.end_time?.slice(0, 5) || "08:40");
  }

  function closeEditModal() {
    setEditLesson(null);
    setEditSaving(false);
  }

  function openCompensationModal(lesson: Lesson) {
    if (isPastDate) {
      openLockedNotice();
      return;
    }
    setCompLesson(lesson);
    setCompDay(lesson.day_of_week || "Monday");
    setCompStart(lesson.start_time?.slice(0, 5) || "08:00");
    setCompEnd(lesson.end_time?.slice(0, 5) || "08:40");
    setCompNote("");
    setCompDate(selectedDate);
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
    if (isPastDate) {
      closeReasonModal();
      openLockedNotice();
      return;
    }
    setReasonSaving(true);
    try {
      await api(`/timetable/${reasonLesson.id}`, {
        method: "PATCH",
        body: JSON.stringify({ attended: false, reason: reasonText }),
      });
      await loadClassData(classId);
      closeReasonModal();
      showSuccess("Reason saved successfully.");
    } catch (e: any) {
      openNotice(e.message || "Could not save reason.");
    } finally {
      setReasonSaving(false);
    }
  }

  async function submitCompensation(e: React.FormEvent) {
    e.preventDefault();
    if (!compLesson) return;
    if (isPastDate) {
      closeCompensationModal();
      openLockedNotice();
      return;
    }
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
      showSuccess("Compensation slot saved successfully.");
    } catch (e: any) {
      openNotice(e.message || "Could not save compensation slot.");
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
    if (raw.startsWith("sat")) return "Saturday";
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
      if (added > 0) showSuccess(`Timetable import completed. Added ${added} lesson${added === 1 ? "" : "s"}.`);
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
    if (isPastDate) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      openLockedNotice();
      return;
    }
    await importTimetableFile(file);
  }

  async function submitEditLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!editLesson) return;
    setEditSaving(true);
    try {
      await api(`/timetable/${editLesson.id}`, {
        method: "PUT",
        body: JSON.stringify({
          subject_id: editSubjectId,
          day_of_week: editDay,
          start_time: editStart,
          end_time: editEnd,
        }),
      });
      await loadClassData(classId);
      setPageMessage("Lesson updated.");
      closeEditModal();
      showSuccess("Lesson updated successfully.");
    } catch (e: any) {
      openNotice(e.message || "Could not update lesson.");
    } finally {
      setEditSaving(false);
    }
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
    showSuccess("Timetable template downloaded successfully.");
  }

  const selectedClassLabel = useMemo(() => {
    const classItem = classes.find((c) => String(c.id) === String(classId));
    return classItem ? `${classItem.name}${classItem.stream ? ` - ${classItem.stream}` : ""}` : "-";
  }, [classes, classId]);

  const weeklyState = useMemo(() => {
    const { start, end } = weekBounds(selectedDate);
    const latestByLesson = new Map<string, HistoryItem>();

    historyItems.forEach((item) => {
      const lessonId = String(item.lesson_id || "");
      if (!lessonId) return;
      const recordDate = formatDateLocal(new Date(item.recorded_at));
      if (recordDate < start || recordDate > end) return;
      const existing = latestByLesson.get(lessonId);
      if (!existing || new Date(item.recorded_at).getTime() > new Date(existing.recorded_at).getTime()) {
        latestByLesson.set(lessonId, item);
      }
    });

    const completed = Array.from(latestByLesson.values());
    const attended = completed.filter((item) => item.status === "attended").length;
    const missed = completed.filter((item) => item.status === "not_attended").length;

    return {
      latestByLesson,
      attended,
      missed,
      total: lessons.length,
      compensated: lessons.filter((l) => l.compensated).length,
      percent: lessons.length ? ((attended / lessons.length) * 100).toFixed(1) : "0.0",
    };
  }, [historyItems, lessons, selectedDate]);

  return (
    <div>
      {!!noticeMessage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Timetable Notice</h3>
            <p className="muted">{noticeMessage}</p>
            <div className="inline-form">
              <button className="btn" type="button" onClick={() => setNoticeMessage("")}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {editLesson && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Edit Lesson</h3>
            <form className="inline-form" onSubmit={submitEditLesson}>
              <select value={editDay} onChange={(e) => setEditDay(e.target.value)} required>
                {DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select value={editSubjectId} onChange={(e) => setEditSubjectId(e.target.value)} required disabled={!subjects.length}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} required />
              <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} required />
              <button className="btn" type="submit" disabled={editSaving}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
              <button className="btn btn-outline" type="button" onClick={closeEditModal} disabled={editSaving}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
      {compLesson && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Add Compensation Slot</h3>
            <p className="muted">
              For missed lesson: {compLesson.day_of_week} {compLesson.start_time?.slice(0, 5)} - {" "}
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
              <input placeholder="Optional note" value={compNote} onChange={(e) => setCompNote(e.target.value)} />
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
              Lesson: {reasonLesson.day_of_week} {reasonLesson.start_time?.slice(0, 5)} - {" "}
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

      <h2>Timetable & Lesson Coverage</h2>
      <p className="muted">Plan weekly lessons and track attended/not attended with reasons.</p>

      <section className="panel">
        <div className="inline-form">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream ? `- ${c.stream}` : ""}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedDate(value);
              if (value < today) {
                setPageMessage("Previous timetable dates are view-only.");
              } else {
                setPageMessage("");
              }
            }}
          />
          <span className="tag tag-blue">Class: {selectedClassLabel}</span>
          <span className="tag tag-blue">Total: {weeklyState.total}</span>
          <span className="tag tag-green">Attended: {weeklyState.attended}</span>
          <span className="tag tag-red">Not attended: {weeklyState.missed}</span>
          <span className="tag">Compensated: {weeklyState.compensated}</span>
          <span className="tag tag-yellow">Coverage: {weeklyState.percent}%</span>
        </div>
        {!!pageMessage && <p className="muted">{pageMessage}</p>}
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
          <button className="btn" type="submit" disabled={!classId || !subject_id || addingLesson}>
            {addingLesson ? "Adding..." : "Add"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onImportChange} style={{ display: "none" }} />
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
        <p className="muted">Use this to build the whole week by adding lessons for Monday to Saturday.</p>
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
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dayLessons.map((l) => {
                  const weeklyEntry = weeklyState.latestByLesson.get(String(l.id));
                  const isCompleted = !!weeklyEntry;
                  const weeklyReason = weeklyEntry?.reason || "-";
                  return (
                    <tr key={l.id} className={isCompleted ? "lesson-complete" : ""}>
                      <td>
                        {l.start_time.slice(0, 5)} - {l.end_time.slice(0, 5)}
                      </td>
                      <td>{selectedClassLabel}</td>
                      <td>{l.subject_name || "-"}</td>
                      <td>
                        {!weeklyEntry && <span className="tag">Pending</span>}
                        {weeklyEntry?.status === "attended" && <span className="tag tag-green">Completed</span>}
                        {weeklyEntry?.status === "not_attended" && <span className="tag tag-red">Not Attended</span>}
                      </td>
                      <td>
                        {weeklyReason}
                        {weeklyEntry?.status === "not_attended" && l.compensated && (
                          <div className="muted" style={{ marginTop: "4px", fontSize: "0.85rem" }}>
                            {l.compensation_date ? `Comp date: ${l.compensation_date}. ` : ""}
                            {l.compensation_note || ""}
                          </div>
                        )}
                      </td>
                      <td className="table-actions-cell">
                        <div className="inline-form table-actions">
                          <button className="btn btn-outline" type="button" onClick={() => openEditModal(l)}>
                            Edit
                          </button>
                          <button className="btn btn-green" type="button" onClick={() => mark(l.id, true)} disabled={isCompleted}>
                            Attended
                          </button>
                          <button className="btn btn-yellow" type="button" onClick={() => mark(l.id, false)} disabled={isCompleted}>
                            Not Attended
                          </button>
                          {weeklyEntry?.status === "not_attended" && (
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
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
