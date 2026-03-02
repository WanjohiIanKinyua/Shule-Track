import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useParams } from "react-router-dom";
import { showSuccess } from "../lib/notify";

type ClassItem = { id: string; name: string; stream: string | null };
type Student = { id: string; full_name: string; admission_number: string; gender: string };
type AttendanceStatus = "present" | "absent";
type AttendanceRow = { student_id: string; status: AttendanceStatus; reason?: string | null };

export default function AttendancePage() {
  const params = useParams();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [absenceReasons, setAbsenceReasons] = useState<Record<string, string>>({});
  const [reasonStudent, setReasonStudent] = useState<Student | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [message, setMessage] = useState("");
  const [lockedNoticeOpen, setLockedNoticeOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const isPastDate = date < today;

  useEffect(() => {
    if (params.date) setDate(params.date);
  }, [params.date]);

  useEffect(() => {
    api("/classes").then((data) => {
      setClasses(data);
      if (data.length) setClassId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    Promise.all([api(`/classes/${classId}/students`), api(`/classes/${classId}/attendance?date=${date}`)]).then(
      ([studentsData, attendanceData]) => {
        setStudents(studentsData);
        const map: Record<string, AttendanceStatus> = {};
        const reasonsMap: Record<string, string> = {};
        studentsData.forEach((s: Student) => {
          map[s.id] = "present";
        });
        attendanceData.forEach((r: AttendanceRow) => {
          map[r.student_id] = r.status;
          if (r.status === "absent" && r.reason) reasonsMap[r.student_id] = String(r.reason);
        });
        setAttendance(map);
        setAbsenceReasons(reasonsMap);
      },
    );
  }, [classId, date]);

  const summary = useMemo(() => {
    const values = Object.values(attendance);
    const present = values.filter((v) => v === "present").length;
    return { present, absent: values.length - present };
  }, [attendance]);

  const visibleStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => student.full_name.toLowerCase().includes(query));
  }, [students, searchTerm]);

  async function save() {
    if (!classId) return;
    if (isPastDate) {
      setMessage("Previous attendance records are view-only.");
      setLockedNoticeOpen(true);
      return;
    }
    const records = Object.entries(attendance).map(([student_id, status]) => ({
      student_id,
      status,
      reason: status === "absent" ? absenceReasons[student_id] || "" : "",
    }));
    await api(`/classes/${classId}/attendance`, {
      method: "POST",
      body: JSON.stringify({ date, records }),
    });
    setMessage("");
    showSuccess("Attendance saved successfully.");
  }

  function openAbsentReason(student: Student) {
    setReasonStudent(student);
    setReasonDraft(absenceReasons[student.id] || "");
  }

  function closeAbsentReason() {
    setReasonStudent(null);
    setReasonDraft("");
  }

  function confirmAbsentReason() {
    if (!reasonStudent) return;
    setAttendance((prev) => ({ ...prev, [reasonStudent.id]: "absent" }));
    setAbsenceReasons((prev) => ({
      ...prev,
      [reasonStudent.id]: reasonDraft.trim(),
    }));
    closeAbsentReason();
  }

  function openLockedNotice() {
    setMessage("Previous attendance records are view-only.");
    setLockedNoticeOpen(true);
  }

  return (
    <div>
      {lockedNoticeOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Attendance Locked</h3>
            <p className="muted">You cannot edit attendance for a previous day.</p>
            <div className="inline-form">
              <button className="btn" type="button" onClick={() => setLockedNoticeOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {reasonStudent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Optional Absence Reason</h3>
            <p className="muted">
              Add a reason for {reasonStudent.full_name} being absent, or leave it empty.
            </p>
            <div className="inline-form">
              <input
                className="modal-flex-input"
                placeholder="e.g. Sick, sent home, absent with permission"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
              />
              <button className="btn btn-danger" type="button" onClick={confirmAbsentReason}>
                Mark Absent
              </button>
              <button className="btn btn-outline" type="button" onClick={closeAbsentReason}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <h2>Attendance</h2>
      <p className="muted">Mark daily attendance as present or absent.</p>
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
            value={date}
            onChange={(e) => {
              const newDate = e.target.value;
              setDate(newDate);
              if (newDate < today) {
                setMessage("Previous attendance records are view-only.");
              } else {
                setMessage("");
              }
            }}
          />
          <span className="tag tag-green">Present: {summary.present}</span>
          <span className="tag tag-red">Absent: {summary.absent}</span>
          <button className="btn" onClick={save} disabled={!classId}>
            Save
          </button>
        </div>
        <div className="inline-form" style={{ marginTop: "10px" }}>
          <input
            placeholder="Search student by name"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {!!message && <p className="muted">{message}</p>}
      </section>
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Adm No</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((s, index) => (
              <tr key={s.id}>
                <td>{index + 1}</td>
                <td>{s.admission_number}</td>
                <td>{s.full_name}</td>
                <td>{s.gender}</td>
                <td>
                  <div className="inline-form attendance-actions">
                    <button
                      className={attendance[s.id] === "present" ? "btn btn-green" : "btn btn-outline"}
                      type="button"
                      onClick={() => {
                        if (isPastDate) {
                          openLockedNotice();
                          return;
                        }
                        setAttendance((prev) => ({
                          ...prev,
                          [s.id]: "present",
                        }));
                        setAbsenceReasons((prev) => {
                          const next = { ...prev };
                          delete next[s.id];
                          return next;
                        });
                      }}
                    >
                      Present
                    </button>
                    <button
                      className={attendance[s.id] === "absent" ? "btn btn-danger" : "btn btn-outline"}
                      type="button"
                      onClick={() => {
                        if (isPastDate) {
                          openLockedNotice();
                          return;
                        }
                        openAbsentReason(s);
                      }}
                    >
                      Absent
                    </button>
                  </div>
                  {attendance[s.id] === "absent" && !!absenceReasons[s.id] && (
                    <div className="muted attendance-reason-text">{absenceReasons[s.id]}</div>
                  )}
                </td>
              </tr>
            ))}
            {!visibleStudents.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {students.length
                    ? "No student matches that name."
                    : classId
                      ? "No students in this class yet."
                      : "Create a class first in Dashboard."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
