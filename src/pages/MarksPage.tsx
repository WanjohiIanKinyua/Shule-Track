import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { average } from "../lib/grades";
import * as XLSX from "xlsx-js-style";

type ClassItem = { id: string; name: string; stream: string | null };
type Subject = { id: string; name: string };
type Student = { id: string; full_name: string; admission_number: string };
type ExamType = { id: string | number; name: string };
const TERMS = ["Term 1", "Term 2", "Term 3"];
const GRADE_FIELDS = [
  { key: "a_min", label: "A", defaultValue: "80" },
  { key: "a_minus_min", label: "A-", defaultValue: "75" },
  { key: "b_plus_min", label: "B+", defaultValue: "70" },
  { key: "b_min", label: "B", defaultValue: "65" },
  { key: "b_minus_min", label: "B-", defaultValue: "60" },
  { key: "c_plus_min", label: "C+", defaultValue: "55" },
  { key: "c_min", label: "C", defaultValue: "50" },
  { key: "c_minus_min", label: "C-", defaultValue: "45" },
  { key: "d_plus_min", label: "D+", defaultValue: "40" },
  { key: "d_min", label: "D", defaultValue: "35" },
  { key: "d_minus_min", label: "D-", defaultValue: "30" },
  { key: "e_min", label: "E", defaultValue: "0" },
] as const;
type GradeKey = (typeof GRADE_FIELDS)[number]["key"];

type GradeScale = {
  a_min: number;
  a_minus_min: number;
  b_plus_min: number;
  b_min: number;
  b_minus_min: number;
  c_plus_min: number;
  c_min: number;
  c_minus_min: number;
  d_plus_min: number;
  d_min: number;
  d_minus_min: number;
  e_min: number;
  average_multiplier: number;
};

export default function MarksPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [examType, setExamType] = useState("");
  const [newExamType, setNewExamType] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [gradeScale, setGradeScale] = useState<GradeScale>({
    a_min: 80,
    a_minus_min: 75,
    b_plus_min: 70,
    b_min: 65,
    b_minus_min: 60,
    c_plus_min: 55,
    c_min: 50,
    c_minus_min: 45,
    d_plus_min: 40,
    d_min: 35,
    d_minus_min: 30,
    e_min: 0,
    average_multiplier: 1,
  });
  const [gradeInputs, setGradeInputs] = useState<Record<GradeKey, string>>(
    Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, field.defaultValue])) as Record<GradeKey, string>,
  );
  const [savingScale, setSavingScale] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [compileSelections, setCompileSelections] = useState<Record<string, boolean>>({});
  const selectedCompileExamTypes = examTypes.filter((e) => compileSelections[e.name]).map((e) => e.name);

  function getGrade(score: number) {
    if (score >= gradeScale.a_min) return "A";
    if (score >= gradeScale.a_minus_min) return "A-";
    if (score >= gradeScale.b_plus_min) return "B+";
    if (score >= gradeScale.b_min) return "B";
    if (score >= gradeScale.b_minus_min) return "B-";
    if (score >= gradeScale.c_plus_min) return "C+";
    if (score >= gradeScale.c_min) return "C";
    if (score >= gradeScale.c_minus_min) return "C-";
    if (score >= gradeScale.d_plus_min) return "D+";
    if (score >= gradeScale.d_min) return "D";
    if (score >= gradeScale.d_minus_min) return "D-";
    if (score >= gradeScale.e_min) return "E";
    return "E";
  }

  function adjustedScore(score: number) {
    return Math.min(100, score * (Number(gradeScale.average_multiplier) || 1));
  }

  useEffect(() => {
    api("/classes").then((data) => {
      setClasses(data);
      if (data.length) setClassId(data[0].id);
    });
    api("/grade-settings").then((data) => {
      const next = {
        a_min: Number(data.a_min ?? 80),
        a_minus_min: Number(data.a_minus_min ?? 75),
        b_plus_min: Number(data.b_plus_min ?? 70),
        b_min: Number(data.b_min ?? 65),
        b_minus_min: Number(data.b_minus_min ?? 60),
        c_plus_min: Number(data.c_plus_min ?? 55),
        c_min: Number(data.c_min ?? 50),
        c_minus_min: Number(data.c_minus_min ?? 45),
        d_plus_min: Number(data.d_plus_min ?? 40),
        d_min: Number(data.d_min ?? 35),
        d_minus_min: Number(data.d_minus_min ?? 30),
        e_min: Number(data.e_min ?? 0),
        average_multiplier: Number(data.average_multiplier ?? 1),
      };
      setGradeScale(next);
      setGradeInputs(
        Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, String(next[field.key])])) as Record<GradeKey, string>,
      );
    });
    api("/exam-types").then((data) => {
      const list = (data || []) as ExamType[];
      setExamTypes(list);
      setExamType((prev) => prev || list[0]?.name || "CAT");
    });
  }, []);

  function onGradeInputChange(field: GradeKey, value: string) {
    if (/^\d*\.?\d*$/.test(value)) {
      setGradeInputs((prev) => ({ ...prev, [field]: value }));
    }
  }

  function onGradeInputBlur(field: GradeKey) {
    setGradeInputs((prev) => ({
      ...prev,
      [field]: prev[field].trim() === "" ? "0" : prev[field],
    }));
  }

  useEffect(() => {
    if (!classId) return;
    Promise.all([api(`/classes/${classId}/students`), api(`/classes/${classId}/subjects`)]).then(
      ([studentsData, subjectsData]) => {
        setStudents(studentsData);
        setSubjects(subjectsData);
        if (subjectsData.length) {
          if (!subjectsData.some((s: Subject) => String(s.id) === String(subjectId))) {
            setSubjectId(subjectsData[0].id);
          }
        } else {
          setSubjectId("");
        }
      },
    );
  }, [classId]);

  useEffect(() => {
    if (!classId || !subjectId) return;
    api(`/classes/${classId}/marks?subject_id=${subjectId}&exam_type=${examType}&term=${term}`).then(
      (data) => {
        const map: Record<string, number> = {};
        data.forEach((r: { student_id: string; score: number }) => {
          map[r.student_id] = Number(r.score);
        });
        setMarks(map);
      },
    );
  }, [classId, subjectId, examType, term]);

  async function addExamType() {
    const value = newExamType.trim();
    if (!value) return;
    const list = await api("/exam-types", {
      method: "POST",
      body: JSON.stringify({ name: value }),
    });
    setExamTypes(list || []);
    setExamType(value);
    setNewExamType("");
  }

  async function deleteExamType() {
    const selected = examTypes.find((e) => e.name === examType);
    if (!selected) return;
    try {
      const list = await api(`/exam-types/${selected.id}`, { method: "DELETE" });
      const next = (list || []) as ExamType[];
      setExamTypes(next);
      setExamType(next[0]?.name || "");
      setStatusMessage("Exam type deleted.");
    } catch (e: any) {
      setStatusMessage(e.message || "Could not delete exam type.");
    }
  }

  async function addSubject() {
    if (!classId) return;
    const name = newSubjectName.trim();
    if (!name) {
      setStatusMessage("Type a subject name first.");
      return;
    }
    try {
      await api(`/classes/${classId}/subjects`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      const data = await api(`/classes/${classId}/subjects`);
      setSubjects(data);
      const added = data.find((item: Subject) => item.name.toLowerCase() === name.toLowerCase());
      if (added) setSubjectId(added.id);
      setNewSubjectName("");
      setStatusMessage("Subject added.");
    } catch (e: any) {
      setStatusMessage(e.message || "Could not add subject.");
    }
  }

  async function saveMarks() {
    if (!classId || !subjectId || !examType) return;
    const records = Object.entries(marks)
      .filter(([, score]) => Number.isFinite(score))
      .map(([student_id, score]) => ({ student_id, score }));
    await api(`/classes/${classId}/marks`, {
      method: "POST",
      body: JSON.stringify({ subject_id: subjectId, exam_type: examType, term, records }),
    });
    setStatusMessage("Marks saved.");
  }

  async function removeSubject() {
    if (!subjectId) return;
    await api(`/subjects/${subjectId}`, { method: "DELETE" });
    const data = await api(`/classes/${classId}/subjects`);
    setSubjects(data);
    setSubjectId(data.length ? data[0].id : "");
    setStatusMessage("Subject deleted.");
  }

  async function saveGradeScale() {
    setStatusMessage("");
    setSavingScale(true);
    try {
      const payload: GradeScale = {
        a_min: Number(gradeInputs.a_min || "0"),
        a_minus_min: Number(gradeInputs.a_minus_min || "0"),
        b_plus_min: Number(gradeInputs.b_plus_min || "0"),
        b_min: Number(gradeInputs.b_min || "0"),
        b_minus_min: Number(gradeInputs.b_minus_min || "0"),
        c_plus_min: Number(gradeInputs.c_plus_min || "0"),
        c_min: Number(gradeInputs.c_min || "0"),
        c_minus_min: Number(gradeInputs.c_minus_min || "0"),
        d_plus_min: Number(gradeInputs.d_plus_min || "0"),
        d_min: Number(gradeInputs.d_min || "0"),
        d_minus_min: Number(gradeInputs.d_minus_min || "0"),
        e_min: Number(gradeInputs.e_min || "0"),
        average_multiplier: Number(gradeScale.average_multiplier || 1),
      };
      const saved = await api("/grade-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setGradeScale(saved);
      setGradeInputs(
        Object.fromEntries(GRADE_FIELDS.map((field) => [field.key, String(saved[field.key])])) as Record<GradeKey, string>,
      );
      setStatusMessage("Grade ranges saved.");
    } catch (e: any) {
      setStatusMessage(e.message || "Could not save grade ranges.");
    } finally {
      setSavingScale(false);
    }
  }

  function classLabel() {
    const c = classes.find((x) => String(x.id) === String(classId));
    if (!c) return "class";
    return `${c.name}${c.stream ? `-${c.stream}` : ""}`.replace(/\s+/g, "_");
  }

  async function downloadAllMarksExcel() {
    if (!classId) return;
    setExporting(true);
    setStatusMessage("");
    try {
      const studentsData: Student[] = await api(`/classes/${classId}/students`);
      const subjectsData: Subject[] = await api(`/classes/${classId}/subjects`);

      if (!studentsData.length || !subjectsData.length) {
        setStatusMessage("Need at least one student and one subject to export.");
        return;
      }

      const marksBySubject: Record<string, Record<string, number>> = {};
      for (const s of subjectsData) {
        const rows = await api(
          `/classes/${classId}/marks?subject_id=${s.id}&exam_type=${examType}&term=${term}`,
        );
        const map: Record<string, number> = {};
        (rows || []).forEach((r: { student_id: string; score: number }) => {
          map[String(r.student_id)] = Number(r.score);
        });
        marksBySubject[s.name] = map;
      }

      const header = ["Admission Number", "Name", ...subjectsData.map((s) => s.name), "Total", "Average", "Grade"];
      const rows: (string | number)[][] = [header];

      studentsData.forEach((st) => {
        const scores = subjectsData.map((sub) => {
          const raw = marksBySubject[sub.name]?.[String(st.id)];
          return Number.isFinite(raw) ? Number(raw) : "";
        });
        const numericScores = scores.filter((x): x is number => typeof x === "number");
        const total = numericScores.reduce((a, b) => a + b, 0);
        const avg = numericScores.length ? total / numericScores.length : 0;
        const adjusted = adjustedScore(avg);
        rows.push([
          st.admission_number,
          st.full_name,
          ...scores,
          numericScores.length ? Number(total.toFixed(2)) : "",
          numericScores.length ? Number(adjusted.toFixed(2)) : "",
          numericScores.length ? getGrade(adjusted) : "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 18 },
        { wch: 28 },
        ...subjectsData.map(() => ({ wch: 12 })),
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
      ];

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const address = XLSX.utils.encode_cell({ r, c });
          if (!ws[address]) continue;
          ws[address].s = {
            border: {
              top: { style: "thin", color: { rgb: "D9E2F1" } },
              bottom: { style: "thin", color: { rgb: "D9E2F1" } },
              left: { style: "thin", color: { rgb: "D9E2F1" } },
              right: { style: "thin", color: { rgb: "D9E2F1" } },
            },
            font: r === 0 ? { bold: true, color: { rgb: "0E2F59" } } : { color: { rgb: "143B6F" } },
            fill: r === 0 ? { fgColor: { rgb: "EEF4FF" } } : undefined,
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Marks");
      XLSX.writeFile(
        wb,
        `${classLabel()}_marks_${examType.replace(/\s+/g, "_")}_${term.replace(/\s+/g, "_")}.xlsx`,
      );
      setStatusMessage("Marks export downloaded.");
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to export marks.");
    } finally {
      setExporting(false);
    }
  }

  async function downloadCompiledMarksExcel() {
    if (!classId || !subjectId) return;
    if (!selectedCompileExamTypes.length) {
      setStatusMessage("Select at least one exam type to compile.");
      return;
    }

    setExporting(true);
    setStatusMessage("");
    try {
      const studentsData: Student[] = await api(`/classes/${classId}/students`);
      if (!studentsData.length) {
        setStatusMessage("No students found for this class.");
        return;
      }

      const marksByExamType: Record<string, Record<string, number>> = {};
      await Promise.all(
        selectedCompileExamTypes.map(async (typeName) => {
          const rows = await api(
            `/classes/${classId}/marks?subject_id=${subjectId}&exam_type=${encodeURIComponent(typeName)}&term=${encodeURIComponent(term)}`,
          );
          const map: Record<string, number> = {};
          (rows || []).forEach((r: { student_id: string; score: number }) => {
            map[String(r.student_id)] = Number(r.score);
          });
          marksByExamType[typeName] = map;
        }),
      );

      const header = [
        "Admission Number",
        "Name",
        ...selectedCompileExamTypes.map((x) => `${x} (${term})`),
        "Compiled Total",
        "Compiled Average",
        "Grade",
      ];
      const rows: (string | number)[][] = [header];

      studentsData.forEach((st) => {
        const values = selectedCompileExamTypes.map((typeName) => {
          const raw = marksByExamType[typeName]?.[String(st.id)];
          return Number.isFinite(raw) ? Number(raw) : "";
        });
        const nums = values.filter((x): x is number => typeof x === "number");
        const total = nums.reduce((a, b) => a + b, 0);
        const avg = nums.length ? total / nums.length : 0;
        const adjusted = adjustedScore(avg);

        rows.push([
          st.admission_number,
          st.full_name,
          ...values,
          nums.length ? Number(total.toFixed(2)) : "",
          nums.length ? Number(adjusted.toFixed(2)) : "",
          nums.length ? getGrade(adjusted) : "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 18 },
        { wch: 28 },
        ...selectedCompileExamTypes.map(() => ({ wch: 15 })),
        { wch: 15 },
        { wch: 16 },
        { wch: 10 },
      ];

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const address = XLSX.utils.encode_cell({ r, c });
          if (!ws[address]) continue;
          ws[address].s = {
            border: {
              top: { style: "thin", color: { rgb: "D9E2F1" } },
              bottom: { style: "thin", color: { rgb: "D9E2F1" } },
              left: { style: "thin", color: { rgb: "D9E2F1" } },
              right: { style: "thin", color: { rgb: "D9E2F1" } },
            },
            font: r === 0 ? { bold: true, color: { rgb: "0E2F59" } } : { color: { rgb: "143B6F" } },
            fill: r === 0 ? { fgColor: { rgb: "EEF4FF" } } : undefined,
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Compiled Marks");
      XLSX.writeFile(
        wb,
        `${classLabel()}_compiled_${selectedCompileExamTypes.join("_").replace(/\s+/g, "_")}_${term.replace(/\s+/g, "_")}.xlsx`,
      );
      setStatusMessage("Compiled marks export downloaded.");
    } catch (e: any) {
      setStatusMessage(e.message || "Failed to compile/export marks.");
    } finally {
      setExporting(false);
    }
  }

  const allScores = Object.values(marks).map((v) => adjustedScore(v));
  const classAverage = average(allScores);
  const classGrade = getGrade(classAverage);
  const totalScore = allScores.reduce((a, b) => a + b, 0);
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const aRaw = marks[a.id];
      const bRaw = marks[b.id];
      const aHas = typeof aRaw === "number" && !Number.isNaN(aRaw);
      const bHas = typeof bRaw === "number" && !Number.isNaN(bRaw);
      if (aHas && bHas) return adjustedScore(bRaw) - adjustedScore(aRaw);
      if (aHas) return -1;
      if (bHas) return 1;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [students, marks, gradeScale.average_multiplier]);

  const visibleStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sortedStudents;
    return sortedStudents.filter((student) => student.full_name.toLowerCase().includes(query));
  }, [sortedStudents, searchTerm]);

  const classSummary = useMemo(
    () => ({
      totalScore: totalScore.toFixed(1),
      average: classAverage.toFixed(1),
      grade: classGrade,
    }),
    [totalScore, classAverage, classGrade],
  );

  return (
    <div>
      <h2>Marks</h2>
      <p className="muted">Enter CAT and exam marks, then auto-calculate grades.</p>
      <section className="marks-two-cards">
        <div className="panel marks-panel">
          <div className="inline-form marks-row marks-row-primary">
            <select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!classes.length}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.stream ? `- ${c.stream}` : ""}
                </option>
              ))}
            </select>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!subjects.length}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={examType} onChange={(e) => setExamType(e.target.value)} disabled={!examTypes.length}>
              {examTypes.map((e) => (
                <option key={String(e.id)} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
            <select value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="inline-form marks-row">
            <input
              placeholder="Add exam type (e.g. CAT 2)"
              value={newExamType}
              onChange={(e) => setNewExamType(e.target.value)}
            />
            <button className="btn btn-outline" type="button" onClick={addExamType}>
              Add Exam Type
            </button>
          </div>
          <div className="inline-form marks-row">
            <button className="btn" onClick={saveMarks} disabled={!classId || !subjectId || !examType}>
              Save Marks
            </button>
            <button className="btn btn-outline" onClick={downloadAllMarksExcel} disabled={!classId || exporting}>
              {exporting ? "Preparing..." : "Download Excel"}
            </button>
            <button className="btn btn-danger" onClick={removeSubject} disabled={!subjectId}>
              Delete Subject
            </button>
            <button className="btn btn-danger" type="button" onClick={deleteExamType} disabled={!examType}>
              Delete Exam Type
            </button>
          </div>
        </div>

        <div className="panel marks-panel">
          <div className="inline-form marks-row">
            <input
              placeholder="Type subject name"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
            />
            <button className="btn btn-outline" onClick={addSubject} disabled={!classId}>
              Add Subject
            </button>
          </div>
          <div className="inline-form marks-row marks-grade-row">
            <strong>Grade Ranges:</strong>
            {GRADE_FIELDS.map((field) => (
              <label key={field.key} className="marks-grade-item">
                {field.label}:
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={gradeInputs[field.key]}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => onGradeInputChange(field.key, e.target.value)}
                  onBlur={() => onGradeInputBlur(field.key)}
                />
              </label>
            ))}
            <label className="marks-grade-item marks-grade-mode">
              Average Mode:
              <select
                value={String(gradeScale.average_multiplier)}
                onChange={(e) =>
                  setGradeScale((g) => ({ ...g, average_multiplier: Number(e.target.value) || 1 }))
                }
              >
                <option value="1">As Is (x1)</option>
                <option value="2">Multiply by 2 (x2)</option>
              </select>
            </label>
            <button className="btn btn-outline" disabled={savingScale} onClick={saveGradeScale}>
              {savingScale ? "Saving..." : "Save Grade Ranges"}
            </button>
          </div>
        <div className="inline-form marks-row">
          <details className="subject-dropdown">
            <summary>Compile Exam Types ({selectedCompileExamTypes.length})</summary>
            <div className="subject-dropdown-menu">
              {examTypes.map((ex) => (
                <label key={String(ex.id)} className="subject-option">
                  <input
                    type="checkbox"
                    checked={!!compileSelections[ex.name]}
                    onChange={(e) =>
                      setCompileSelections((prev) => ({
                        ...prev,
                        [ex.name]: e.target.checked,
                      }))
                    }
                  />
                  {ex.name}
                </label>
              ))}
            </div>
          </details>
          <button
            className="btn btn-outline"
            type="button"
            onClick={downloadCompiledMarksExcel}
            disabled={!classId || !subjectId || exporting}
          >
            {exporting ? "Preparing..." : "Download Compiled Excel"}
          </button>
        </div>
        {!!statusMessage && <p className="muted">{statusMessage}</p>}
        </div>
      </section>
      {!classId || !subjectId ? (
        <section className="panel">
          <p className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
            Select a class and subject to enter marks
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="summary-row">
            <span className="tag tag-blue">Class Total: {classSummary.totalScore}</span>
            <span className="tag tag-yellow">Class Avg: {classSummary.average}%</span>
            <span className="tag tag-green">Class Grade: {classSummary.grade}</span>
          </div>
          <div className="inline-form" style={{ marginTop: "10px" }}>
            <input
              placeholder="Search student by name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Adm No</th>
                <th>Name</th>
                <th>Score / 100</th>
                <th>Total</th>
                <th>Average</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s, index) => {
                const hasScore = typeof marks[s.id] === "number" && !Number.isNaN(marks[s.id]);
                const score = hasScore ? marks[s.id] : null;
                return (
                  <tr key={s.id}>
                    <td>{index + 1}</td>
                    <td>{s.admission_number}</td>
                    <td>{s.full_name}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={100}
                        value={marks[s.id] ?? ""}
                        onChange={(e) =>
                          setMarks((prev) => {
                            const raw = e.target.value.trim();
                            if (raw === "") {
                              const copy = { ...prev };
                              delete copy[s.id];
                              return copy;
                            }
                            const num = Math.max(0, Math.min(100, Number(raw)));
                            return { ...prev, [s.id]: num };
                          })
                        }
                      />
                    </td>
                    <td>{score === null ? "-" : adjustedScore(score).toFixed(1)}</td>
                    <td>{score === null ? "-" : `${adjustedScore(score).toFixed(1)}%`}</td>
                    <td>
                      <span className="tag tag-blue">{score === null ? "-" : getGrade(adjustedScore(score))}</span>
                    </td>
                  </tr>
                );
              })}
              {!visibleStudents.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    {students.length ? "No student matches that name." : "No students in this class yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
