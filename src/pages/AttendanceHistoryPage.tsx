import { useEffect, useState } from "react";
import { api } from "../lib/api";
import * as XLSX from "xlsx-js-style";
import { showSuccess } from "../lib/notify";

type ClassItem = { id: string; name: string; stream: string | null };
type Student = { id: string; full_name: string; admission_number: string; gender: string };
type AttendanceStatus = "present" | "absent";
type AttendanceRecord = { status: AttendanceStatus; reason: string };
type HistoryRow = { date: string; total_students: number; present_count: number; absent_count: number };

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AttendanceHistoryPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/classes").then((data) => {
      setClasses(data || []);
      if ((data || []).length) setClassId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    Promise.all([api(`/classes/${classId}/students`), api(`/classes/${classId}/attendance/history`)]).then(
      ([studentsData, historyData]) => {
        setStudents(studentsData || []);
        setHistory(historyData || []);
      },
    );
  }, [classId]);

  function getClassLabel() {
    const c = classes.find((x) => String(x.id) === String(classId));
    return c ? `${c.name}${c.stream ? `-${c.stream}` : ""}` : "Class";
  }

  async function fetchAttendanceMap(date: string) {
    const rows = await api(`/classes/${classId}/attendance?date=${date}`);
    const map: Record<string, AttendanceRecord> = {};
    (rows || []).forEach((r: { student_id: string; status: AttendanceStatus; reason?: string | null }) => {
      map[String(r.student_id)] = {
        status: r.status,
        reason: r.reason ? String(r.reason) : "",
      };
    });
    return map;
  }

  function listDatesBetween(from: string, to: string) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  function styleSheet(ws: XLSX.WorkSheet, statusColIndex: number) {
    const ref = ws["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) continue;
        const value = String(ws[addr].v ?? "");
        const isHeader = r === 0;
        ws[addr].s = {
          border: {
            top: { style: "thin", color: { rgb: "D9E2F1" } },
            bottom: { style: "thin", color: { rgb: "D9E2F1" } },
            left: { style: "thin", color: { rgb: "D9E2F1" } },
            right: { style: "thin", color: { rgb: "D9E2F1" } },
          },
          font: isHeader ? { bold: true, color: { rgb: "0E2F59" } } : { color: { rgb: "143B6F" } },
          fill: isHeader ? { fgColor: { rgb: "EEF4FF" } } : undefined,
        };

        if (!isHeader && c === statusColIndex) {
          if (value === "Absent") {
            ws[addr].s = { ...ws[addr].s, fill: { fgColor: { rgb: "FDE2E2" } }, font: { bold: true, color: { rgb: "B42318" } } };
          } else if (value === "Present") {
            ws[addr].s = { ...ws[addr].s, fill: { fgColor: { rgb: "DCFCE7" } }, font: { bold: true, color: { rgb: "166534" } } };
          }
        }
      }
    }
    ws["!cols"] = [{ wch: 18 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
  }

  async function downloadDay(date: string) {
    if (!classId || !students.length) return;
    setExporting(true);
    setMessage("");
    try {
      const map = await fetchAttendanceMap(date);
      const aoa: (string | number)[][] = [["Admission Number", "Name", "Gender", "Date", "Status", "Reason"]];
      students.forEach((s) => {
        const row = map[String(s.id)];
        const status = row?.status === "present" ? "Present" : row?.status === "absent" ? "Absent" : "Not Marked";
        aoa.push([s.admission_number, s.full_name, s.gender, date, status, row?.reason || ""]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      styleSheet(ws, 4);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, date);
      XLSX.writeFile(wb, `${getClassLabel()}_attendance_${date}.xlsx`);
      setMessage(`Downloaded attendance sheet for ${date}.`);
      showSuccess(`Attendance workbook downloaded for ${date}.`);
    } finally {
      setExporting(false);
    }
  }

  async function downloadRangeWorkbook() {
    if (!classId || !students.length) return;
    if (!dateFrom || !dateTo) {
      setMessage("Select both From and To dates.");
      return;
    }
    if (dateFrom > dateTo) {
      setMessage("From date must be before or equal to To date.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const days = listDatesBetween(dateFrom, dateTo);
      if (!days.length) {
        setMessage("No days in selected range.");
        return;
      }
      if (days.length > 31) {
        setMessage("Please choose a range of 31 days or less.");
        return;
      }
      const wb = XLSX.utils.book_new();

      for (let i = 0; i < days.length; i++) {
        const date = days[i];
        const map = await fetchAttendanceMap(date);
        const aoa: (string | number)[][] = [["Admission Number", "Name", "Gender", "Date", "Status", "Reason"]];
        students.forEach((s) => {
          const row = map[String(s.id)];
          const status = row?.status === "present" ? "Present" : row?.status === "absent" ? "Absent" : "Not Marked";
          aoa.push([s.admission_number, s.full_name, s.gender, date, status, row?.reason || ""]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        styleSheet(ws, 4);
        const weekday = WEEKDAY_NAMES[(new Date(`${date}T00:00:00`).getDay() + 6) % 7] || "Day";
        const sheetName = `${weekday}_${date}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      XLSX.writeFile(wb, `${getClassLabel()}_attendance_${days[0]}_to_${days[days.length - 1]}.xlsx`);
      setMessage("Downloaded workbook with separate daily sheets for selected range.");
      showSuccess("Attendance range workbook downloaded successfully.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h2>Attendance History</h2>
      <p className="muted">View saved attendance days and export history sheets.</p>

      <section className="panel">
        <div className="inline-form">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream ? `- ${c.stream}` : ""}
              </option>
            ))}
          </select>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <button
            className="btn btn-outline"
            onClick={() => downloadDay(selectedDate)}
            disabled={!classId || !students.length || exporting}
          >
            {exporting ? "Preparing..." : "Download Day Workbook"}
          </button>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button className="btn btn-outline" onClick={downloadRangeWorkbook} disabled={!classId || !students.length || exporting}>
            {exporting ? "Preparing..." : "Download Range Workbook"}
          </button>
        </div>
        {!!message && <p className="muted">{message}</p>}
      </section>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th>Present</th>
              <th>Absent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.date}>
                <td>{i + 1}</td>
                <td>{h.date}</td>
                <td>{h.present_count}</td>
                <td>{h.absent_count}</td>
                <td>
                  <button className="btn btn-outline" onClick={() => downloadDay(h.date)} disabled={exporting}>
                    Download Day Workbook
                  </button>
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {classId ? "No attendance history yet." : "Create a class first in Dashboard."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
