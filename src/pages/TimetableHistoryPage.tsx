import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import * as XLSX from "xlsx-js-style";

type ClassItem = { id: string; name: string; stream: string | null };
type HistoryItem = {
  id: string | number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  status: "attended" | "not_attended";
  reason: string | null;
  subject_name: string | null;
  recorded_at: string;
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

export default function TimetableHistoryPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/classes").then((data) => {
      const sorted = sortClasses(data || []);
      setClasses(sorted);
      if (sorted.length) setClassId(sorted[0].id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    api(`/classes/${classId}/timetable/history`).then((data) => setItems(data || []));
  }, [classId]);

  const summary = useMemo(() => {
    const attended = items.filter((x) => x.status === "attended").length;
    const missed = items.filter((x) => x.status === "not_attended").length;
    return { attended, missed };
  }, [items]);

  function classLabel() {
    const c = classes.find((x) => String(x.id) === String(classId));
    return c ? `${c.name}${c.stream ? `-${c.stream}` : ""}` : "Class";
  }

  function dateKey(value: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  function dateList(from: string, to: string) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const out: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  function styleSheet(ws: XLSX.WorkSheet) {
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
        if (!isHeader && c === 4) {
          if (value === "Attended") {
            ws[addr].s = { ...ws[addr].s, fill: { fgColor: { rgb: "DCFCE7" } }, font: { bold: true, color: { rgb: "166534" } } };
          } else if (value === "Not Attended") {
            ws[addr].s = { ...ws[addr].s, fill: { fgColor: { rgb: "FDE2E2" } }, font: { bold: true, color: { rgb: "B42318" } } };
          }
        }
      }
    }
    ws["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 24 }];
  }

  function rowsForDate(targetDate: string) {
    const filtered = items.filter((x) => dateKey(x.recorded_at) === targetDate);
    return filtered.map((x, i) => [
      i + 1,
      targetDate,
      x.day_of_week,
      `${x.start_time?.slice(0, 5)} - ${x.end_time?.slice(0, 5)}`,
      x.status === "attended" ? "Attended" : "Not Attended",
      x.subject_name || "-",
      x.reason || "-",
    ]);
  }

  async function downloadDayWorkbook(targetDate: string) {
    if (!classId) return;
    setExporting(true);
    setMessage("");
    try {
      const rows = rowsForDate(targetDate);
      if (!rows.length) {
        setMessage(`No timetable history found on ${targetDate}.`);
        return;
      }
      const aoa: (string | number)[][] = [
        ["No.", "Recorded Date", "Day", "Time", "Status", "Subject", "Reason"],
        ...rows,
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      styleSheet(ws);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, targetDate);
      XLSX.writeFile(wb, `${classLabel()}_timetable_history_${targetDate}.xlsx`);
      setMessage(`Downloaded day workbook for ${targetDate}.`);
    } finally {
      setExporting(false);
    }
  }

  async function downloadRangeWorkbook() {
    if (!classId) return;
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
      const dates = dateList(dateFrom, dateTo);
      if (!dates.length) {
        setMessage("No days in selected range.");
        return;
      }
      if (dates.length > 31) {
        setMessage("Choose a range of 31 days or less.");
        return;
      }

      const wb = XLSX.utils.book_new();
      let added = 0;
      for (const d of dates) {
        const rows = rowsForDate(d);
        if (!rows.length) continue;
        const aoa: (string | number)[][] = [
          ["No.", "Recorded Date", "Day", "Time", "Status", "Subject", "Reason"],
          ...rows,
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        styleSheet(ws);
        XLSX.utils.book_append_sheet(wb, ws, d.slice(0, 31));
        added += 1;
      }
      if (!added) {
        setMessage("No timetable history in selected range.");
        return;
      }
      XLSX.writeFile(wb, `${classLabel()}_timetable_history_${dateFrom}_to_${dateTo}.xlsx`);
      setMessage("Downloaded range workbook.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h2>Timetable History</h2>
      <p className="muted">Every attended/not attended action is logged here.</p>

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
          <button className="btn btn-outline" onClick={() => downloadDayWorkbook(selectedDate)} disabled={!classId || exporting}>
            {exporting ? "Preparing..." : "Download Day Workbook"}
          </button>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <button className="btn btn-outline" onClick={downloadRangeWorkbook} disabled={!classId || exporting}>
            {exporting ? "Preparing..." : "Download Range Workbook"}
          </button>
          <span className="tag tag-green">Attended Logs: {summary.attended}</span>
          <span className="tag tag-red">Not Attended Logs: {summary.missed}</span>
        </div>
        {!!message && <p className="muted">{message}</p>}
      </section>

      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Recorded At</th>
              <th>Day</th>
              <th>Time</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={String(x.id)}>
                <td>{i + 1}</td>
                <td>{new Date(x.recorded_at).toLocaleString()}</td>
                <td>{x.day_of_week}</td>
                <td>
                  {x.start_time?.slice(0, 5)} - {x.end_time?.slice(0, 5)}
                </td>
                <td>{x.subject_name || "-"}</td>
                <td>
                  {x.status === "attended" ? (
                    <span className="tag tag-green">Attended</span>
                  ) : (
                    <span className="tag tag-red">Not Attended</span>
                  )}
                </td>
                <td>{x.reason || "-"}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="muted">
                  No timetable history for this class yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
