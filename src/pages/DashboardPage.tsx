import { useEffect, useState } from "react";
import { api } from "../lib/api";

type ClassItem = {
  id: string;
  name: string;
  stream: string | null;
  year: number;
  student_count: number;
};

type Summary = {
  class_average: number;
  class_grade: string;
  attendance_rate: number;
  grade_breakdown: { A: number; B: number; C: number; D: number; E: number };
  trends: { week_start: string; attendance_rate: number }[];
};

export default function DashboardPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [name, setName] = useState("Form 1");
  const [stream, setStream] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  async function loadClasses() {
    const data = await api("/classes");
    setClasses(data);
    if (!data.length) {
      return;
    }
  }

  useEffect(() => {
    loadClasses().catch((e) => setError(e.message));
  }, []);

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/classes", {
        method: "POST",
        body: JSON.stringify({ name, stream }),
      });
      setStream("");
      await loadClasses();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeClass(id: string) {
    try {
      await api(`/classes/${id}`, { method: "DELETE" });
      await loadClasses();
    } catch (err: any) {
      setError(err.message || "Failed to delete class");
    }
  }

  async function openSummary(classItem: ClassItem) {
    setSelectedClass(classItem);
    setSummaryLoading(true);
    setSummary(null);
    try {
      const data = await api(`/classes/${classItem.id}/performance-summary`);
      setSummary(data);
    } catch (err: any) {
      setError(err.message || "Failed to load class summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div>
      <div className="dashboard-head">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">Manage your classes and track student progress</p>
        </div>
        <button className="btn" type="button" onClick={() => setShowCreate((v) => !v)}>
          + New Class
        </button>
      </div>

      {showCreate && (
        <section className="panel dashboard-create">
          <form className="inline-form" onSubmit={createClass}>
            <select value={name} onChange={(e) => setName(e.target.value)}>
              <option>Form 1</option>
              <option>Form 2</option>
              <option>Form 3</option>
              <option>Form 4</option>
            </select>
            <input
              placeholder="Stream (optional)"
              value={stream}
              onChange={(e) => setStream(e.target.value)}
            />
            <button className="btn" type="submit">
              Save Class
            </button>
          </form>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      <section className="grid-3 dashboard-cards">
        {classes.map((c) => (
          <article key={c.id} className="panel dashboard-card">
            <div className="panel-head dashboard-card-head">
              <h3>
                {c.name} {c.stream ? `- ${c.stream}` : ""}
              </h3>
              <button
                className="dashboard-delete"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeClass(c.id);
                }}
              >
                x
              </button>
            </div>
            <p className="muted">{c.year}</p>
            <p className="dashboard-students">{c.student_count} students</p>
            <button className="btn btn-outline dashboard-summary-btn" onClick={() => openSummary(c)} type="button">
              View Summary
            </button>
          </article>
        ))}
        {!classes.length && (
          <article className="panel">
            <p className="muted">No classes yet. Create your first class above.</p>
          </article>
        )}
      </section>

      {selectedClass && (
        <section className="panel dashboard-summary">
          <div className="panel-head">
            <h3>
              {selectedClass.name} {selectedClass.stream ? `- ${selectedClass.stream}` : ""} Summary
            </h3>
            <button className="btn btn-ghost" onClick={() => setSelectedClass(null)} type="button">
              Close
            </button>
          </div>

          {summaryLoading && <p className="muted">Loading summary...</p>}

          {!summaryLoading && summary && (
            <>
              <div className="summary-row">
                <span className="tag tag-blue">Class Avg: {summary.class_average}%</span>
                <span className="tag tag-yellow">Overall Grade: {summary.class_grade}</span>
                <span className="tag tag-green">Attendance: {summary.attendance_rate}%</span>
              </div>

              <div className="dashboard-graphs">
                <div className="dashboard-graph">
                  <h4>Grade Distribution</h4>
                  {(["A", "B", "C", "D", "E"] as const).map((grade) => {
                    const total = Object.values(summary.grade_breakdown).reduce((a, b) => a + b, 0);
                    const value = summary.grade_breakdown[grade];
                    const percent = total ? (value / total) * 100 : 0;
                    return (
                      <div key={grade} className="graph-row">
                        <span className="graph-label">{grade}</span>
                        <div className="graph-track">
                          <div className="graph-fill" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="graph-value">{value}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="dashboard-graph">
                  <h4>Attendance Trend</h4>
                  {!summary.trends.length && <p className="muted">No attendance trend yet.</p>}
                  {!!summary.trends.length &&
                    summary.trends.map((t) => (
                      <div key={t.week_start} className="graph-row">
                        <span className="graph-label">{t.week_start}</span>
                        <div className="graph-track">
                          <div className="graph-fill graph-fill-attendance" style={{ width: `${t.attendance_rate}%` }} />
                        </div>
                        <span className="graph-value">{t.attendance_rate}%</span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
