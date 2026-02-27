import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useNavigate, useParams } from "react-router-dom";

type ClassItem = { id: string; name: string; stream: string | null };
type Student = { id: string; full_name: string; admission_number: string; gender: string };
type AttendanceStatus = "present" | "absent";

export default function AttendancePage() {
  const navigate = useNavigate();
  const params = useParams();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(params.date || new Date().toISOString().slice(0, 10));
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

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
        studentsData.forEach((s: Student) => {
          map[s.id] = "present";
        });
        attendanceData.forEach((r: { student_id: string; status: AttendanceStatus }) => {
          map[r.student_id] = r.status;
        });
        setAttendance(map);
      },
    );
  }, [classId, date]);

  const summary = useMemo(() => {
    const values = Object.values(attendance);
    const present = values.filter((v) => v === "present").length;
    return { present, absent: values.length - present };
  }, [attendance]);

  async function save() {
    if (!classId) return;
    const records = Object.entries(attendance).map(([student_id, status]) => ({ student_id, status }));
    await api(`/classes/${classId}/attendance`, {
      method: "POST",
      body: JSON.stringify({ date, records }),
    });
    alert("Attendance saved.");
  }

  return (
    <div>
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
              navigate(`/dashboard/attendance/${newDate}`);
            }}
          />
          <span className="tag tag-green">Present: {summary.present}</span>
          <span className="tag tag-red">Absent: {summary.absent}</span>
          <button className="btn" onClick={save} disabled={!classId}>
            Save
          </button>
        </div>
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
            {students.map((s, index) => (
              <tr key={s.id}>
                <td>{index + 1}</td>
                <td>{s.admission_number}</td>
                <td>{s.full_name}</td>
                <td>{s.gender}</td>
                <td>
                  <button
                    className={attendance[s.id] === "present" ? "btn btn-green" : "btn btn-danger"}
                    onClick={() =>
                      setAttendance((prev) => ({
                        ...prev,
                        [s.id]: prev[s.id] === "present" ? "absent" : "present",
                      }))
                    }
                  >
                    {attendance[s.id] === "present" ? "Present" : "Absent"}
                  </button>
                </td>
              </tr>
            ))}
            {!students.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {classId ? "No students in this class yet." : "Create a class first in Dashboard."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
