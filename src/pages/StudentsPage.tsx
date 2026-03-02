import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import * as XLSX from "xlsx-js-style";
import { showSuccess } from "../lib/notify";

type ClassItem = { id: string; name: string; stream: string | null };
type Student = { id: string; admission_number: string; full_name: string; gender: string };

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [full_name, setName] = useState("");
  const [admission_number, setAdm] = useState("");
  const [gender, setGender] = useState("Male");
  const [error, setError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAdmission, setEditAdmission] = useState("");
  const [editName, setEditName] = useState("");
  const [editGender, setEditGender] = useState("Male");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api("/classes")
      .then((data) => {
        setClasses(data);
        if (data.length) setClassId(data[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!classId) return;
    api(`/classes/${classId}/students`)
      .then(setStudents)
      .catch((e) => setError(e.message));
  }, [classId]);

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return;
    await api(`/classes/${classId}/students`, {
      method: "POST",
      body: JSON.stringify({ admission_number, full_name, gender }),
    });
    setName("");
    setAdm("");
    const data = await api(`/classes/${classId}/students`);
    setStudents(data);
    showSuccess("Student added successfully.");
  }

  async function remove(id: string) {
    await api(`/students/${id}`, { method: "DELETE" });
    setStudents((prev) => prev.filter((s) => s.id !== id));
    showSuccess("Student removed successfully.");
  }

  function startEdit(student: Student) {
    setEditingId(student.id);
    setEditAdmission(student.admission_number);
    setEditName(student.full_name);
    setEditGender(student.gender);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAdmission("");
    setEditName("");
    setEditGender("Male");
  }

  async function saveEdit(studentId: string) {
    setError("");
    try {
      const updated = await api(`/students/${studentId}`, {
        method: "PUT",
        body: JSON.stringify({
          admission_number: editAdmission,
          full_name: editName,
          gender: editGender,
        }),
      });
      setStudents((prev) => prev.map((s) => (s.id === studentId ? updated : s)));
      cancelEdit();
      showSuccess("Student details saved successfully.");
    } catch (e: any) {
      setError(e.message || "Failed to update student.");
    }
  }

  function normalizeHeader(value: string) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeGender(value: string) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.startsWith("f")) return "Female";
    return "Male";
  }

  async function importFile(file: File) {
    if (!classId) return;
    setError("");
    setImportStatus("");
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: "" });

      if (!rows.length) {
        setImportStatus("No rows found in file.");
        return;
      }

      let success = 0;
      let skipped = 0;

      for (const row of rows) {
        const mapped: Record<string, any> = {};
        for (const key of Object.keys(row)) mapped[normalizeHeader(key)] = row[key];

        const adm = String(
          mapped.admissionnumber || mapped.admno || mapped.admnumber || mapped.adm || "",
        ).trim();
        const fullName = String(mapped.name || mapped.fullname || mapped.studentname || "").trim();
        const genderValue = normalizeGender(String(mapped.gender || ""));

        if (!adm || !fullName) {
          skipped += 1;
          continue;
        }

        try {
          await api(`/classes/${classId}/students`, {
            method: "POST",
            body: JSON.stringify({
              admission_number: adm,
              full_name: fullName,
              gender: genderValue,
            }),
          });
          success += 1;
        } catch {
          skipped += 1;
        }
      }

      const data = await api(`/classes/${classId}/students`);
      setStudents(data);
      setImportStatus(`Import complete. Added ${success} students, skipped ${skipped}.`);
      if (success > 0) showSuccess(`Student import completed. Added ${success} student${success === 1 ? "" : "s"}.`);
    } catch (e: any) {
      setError(e.message || "Failed to import file.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await importFile(file);
  }

  function downloadTemplate() {
    const templateRows = [
      { "admission number": "2026-001", name: "John Kamau", gender: "Male" },
      { "admission number": "2026-002", name: "Mary Achieng", gender: "Female" },
    ];
    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "students_import_template.xlsx");
    showSuccess("Student template downloaded successfully.");
  }

  return (
    <div>
      <h2>Students</h2>
      <p className="muted">Add and manage students per class.</p>
      <section className="panel">
        <form className="inline-form" onSubmit={addStudent}>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} required disabled={!classes.length}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.stream ? `- ${c.stream}` : ""}
              </option>
            ))}
          </select>
          <input placeholder="Adm No." value={admission_number} onChange={(e) => setAdm(e.target.value)} required />
          <input placeholder="Full name" value={full_name} onChange={(e) => setName(e.target.value)} required />
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option>Male</option>
            <option>Female</option>
          </select>
          <button className="btn" type="submit" disabled={!classId}>
            Add Student
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
          <button className="btn btn-outline" type="button" onClick={downloadTemplate}>
            Download Template
          </button>
        </form>
        <p className="muted">Expected columns: admission number, name, gender.</p>
        {!!importStatus && <p className="muted">{importStatus}</p>}
      </section>
      {error && <p className="error">{error}</p>}
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Adm No</th>
              <th>Name</th>
              <th>Gender</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, index) => (
              <tr key={s.id}>
                <td>{index + 1}</td>
                <td>
                  {editingId === s.id ? (
                    <input value={editAdmission} onChange={(e) => setEditAdmission(e.target.value)} />
                  ) : (
                    s.admission_number
                  )}
                </td>
                <td>
                  {editingId === s.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    s.full_name
                  )}
                </td>
                <td>
                  {editingId === s.id ? (
                    <select value={editGender} onChange={(e) => setEditGender(e.target.value)}>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  ) : (
                    s.gender
                  )}
                </td>
                <td className="table-actions-cell">
                  {editingId === s.id ? (
                    <div className="table-actions">
                      <button className="btn" type="button" onClick={() => saveEdit(s.id)}>
                        Save
                      </button>
                      <button className="btn btn-outline" type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="table-actions">
                      <button className="btn btn-outline" type="button" onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" type="button" onClick={() => remove(s.id)}>
                        Remove
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!students.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {classId ? "No students yet." : "Create a class first in Dashboard."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
