import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const DEFAULT_EXAM_TYPES = ["Opener", "CAT", "Mid-Term", "End-Term"];
const DEFAULT_GRADE_SCALE = {
  a_min: 80,
  b_min: 60,
  c_min: 40,
  d_min: 30,
  e_min: 0,
  average_multiplier: 1,
};

app.use(cors());
app.use(express.json());

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isStrongPassword(password) {
  const value = String(password || "");
  return value.length >= 6 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function gradeFromScale(avg, scale) {
  if (avg >= scale.a_min) return "A";
  if (avg >= scale.b_min) return "B";
  if (avg >= scale.c_min) return "C";
  if (avg >= scale.d_min) return "D";
  if (avg >= scale.e_min) return "E";
  return "E";
}

async function ensureSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.postgres.sql"), "utf8");
  await pool.query(schemaSql);
}

async function ensureDefaultExamTypes(teacherId) {
  const existing = await pool.query("select count(*)::int as count from exam_types where teacher_id = $1", [teacherId]);
  if ((existing.rows[0]?.count || 0) > 0) return;

  for (const name of DEFAULT_EXAM_TYPES) {
    await pool.query("insert into exam_types (teacher_id, name) values ($1, $2) on conflict (teacher_id, name) do nothing", [
      teacherId,
      name,
    ]);
  }
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "Password must be at least 6 characters and include a letter, a number, and a special character.",
      });
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const created = await pool.query(
        "insert into teachers (name, email, password_hash) values ($1, $2, $3) returning id, name, email",
        [name, email, hash],
      );
      const teacher = created.rows[0];
      const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, teacher });
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "Email already exists" });
      res.status(500).json({ error: "Registration failed" });
    }
  }),
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });

    const found = await pool.query("select * from teachers where email = $1", [email]);
    const teacher = found.rows[0];
    if (!teacher) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, teacher.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, teacher: { id: teacher.id, name: teacher.name, email: teacher.email } });
  }),
);

app.get(
  "/api/me",
  auth,
  asyncHandler(async (req, res) => {
    const result = await pool.query("select id, name, email from teachers where id = $1", [req.user.id]);
    res.json(result.rows[0] || null);
  }),
);

app.put(
  "/api/me",
  auth,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email) return res.status(400).json({ error: "Name and email are required." });

    try {
      if (password) {
        if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
        const hash = await bcrypt.hash(password, 10);
        await pool.query("update teachers set name = $1, email = $2, password_hash = $3 where id = $4", [
          name,
          email,
          hash,
          req.user.id,
        ]);
      } else {
        await pool.query("update teachers set name = $1, email = $2 where id = $3", [name, email, req.user.id]);
      }
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ error: "Email already exists." });
      return res.status(500).json({ error: "Failed to update profile." });
    }

    const updated = await pool.query("select id, name, email from teachers where id = $1", [req.user.id]);
    res.json(updated.rows[0] || null);
  }),
);

app.get(
  "/api/exam-types",
  auth,
  asyncHandler(async (req, res) => {
    await ensureDefaultExamTypes(req.user.id);
    const rows = await pool.query("select id, name from exam_types where teacher_id = $1 order by lower(name)", [req.user.id]);
    res.json(rows.rows);
  }),
);

app.post(
  "/api/exam-types",
  auth,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Exam type name is required." });

    await pool.query("insert into exam_types (teacher_id, name) values ($1, $2) on conflict (teacher_id, name) do nothing", [
      req.user.id,
      name,
    ]);
    const rows = await pool.query("select id, name from exam_types where teacher_id = $1 order by lower(name)", [req.user.id]);
    res.json(rows.rows);
  }),
);

app.delete(
  "/api/exam-types/:id",
  auth,
  asyncHandler(async (req, res) => {
    const found = await pool.query("select id, name from exam_types where id = $1 and teacher_id = $2", [
      req.params.id,
      req.user.id,
    ]);
    const entry = found.rows[0];
    if (!entry) return res.status(404).json({ error: "Exam type not found." });

    const usage = await pool.query(
      `
      select count(*)::int as count
      from marks m
      join classes c on c.id = m.class_id
      where c.teacher_id = $1 and m.exam_type = $2
      `,
      [req.user.id, entry.name],
    );

    if ((usage.rows[0]?.count || 0) > 0) {
      return res.status(400).json({ error: "Cannot delete exam type already used in saved marks." });
    }

    await pool.query("delete from exam_types where id = $1 and teacher_id = $2", [req.params.id, req.user.id]);
    const rows = await pool.query("select id, name from exam_types where teacher_id = $1 order by lower(name)", [req.user.id]);
    res.json(rows.rows);
  }),
);

app.get(
  "/api/classes",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `
      select
        c.id,
        c.teacher_id,
        c.name,
        c.stream,
        c.year,
        c.created_at,
        (select count(*)::int from students s where s.class_id = c.id) as student_count
      from classes c
      where c.teacher_id = $1
      order by c.name, c.stream
      `,
      [req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.post(
  "/api/classes",
  auth,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const stream = String(req.body.stream || "").trim() || null;
    if (!name) return res.status(400).json({ error: "Class name is required" });

    const row = await pool.query(
      "insert into classes (teacher_id, name, stream, year) values ($1, $2, $3, $4) returning *",
      [req.user.id, name, stream, new Date().getFullYear()],
    );
    res.json(row.rows[0]);
  }),
);

app.delete(
  "/api/classes/:id",
  auth,
  asyncHandler(async (req, res) => {
    await pool.query("delete from classes where id = $1 and teacher_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  }),
);

app.get(
  "/api/classes/:classId/students",
  auth,
  asyncHandler(async (req, res) => {
    const students = await pool.query(
      `
      select s.*
      from students s
      join classes c on c.id = s.class_id
      where s.class_id = $1 and c.teacher_id = $2
      order by s.full_name
      `,
      [req.params.classId, req.user.id],
    );
    res.json(students.rows);
  }),
);

app.post(
  "/api/classes/:classId/students",
  auth,
  asyncHandler(async (req, res) => {
    const classOk = await pool.query("select 1 from classes where id = $1 and teacher_id = $2", [
      req.params.classId,
      req.user.id,
    ]);
    if (!classOk.rowCount) return res.status(404).json({ error: "Class not found" });

    const admission_number = String(req.body.admission_number || "").trim();
    const full_name = String(req.body.full_name || "").trim();
    const gender = String(req.body.gender || "").trim();
    if (!admission_number || !full_name || !gender) {
      return res.status(400).json({ error: "Admission number, name and gender are required." });
    }

    try {
      const row = await pool.query(
        "insert into students (class_id, admission_number, full_name, gender) values ($1, $2, $3, $4) returning *",
        [req.params.classId, admission_number, full_name, gender],
      );
      res.json(row.rows[0]);
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Admission number already exists in this class." });
      }
      throw error;
    }
  }),
);

app.delete(
  "/api/students/:id",
  auth,
  asyncHandler(async (req, res) => {
    await pool.query(
      `
      delete from students
      where id = $1
        and class_id in (select id from classes where teacher_id = $2)
      `,
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  }),
);

app.put(
  "/api/students/:id",
  auth,
  asyncHandler(async (req, res) => {
    const admission_number = String(req.body.admission_number || "").trim();
    const full_name = String(req.body.full_name || "").trim();
    const gender = String(req.body.gender || "").trim();

    if (!admission_number || !full_name || !gender) {
      return res.status(400).json({ error: "Admission number, name and gender are required." });
    }

    const student = await pool.query(
      `
      select s.id
      from students s
      join classes c on c.id = s.class_id
      where s.id = $1 and c.teacher_id = $2
      `,
      [req.params.id, req.user.id],
    );

    if (!student.rowCount) return res.status(404).json({ error: "Student not found." });

    try {
      await pool.query("update students set admission_number = $1, full_name = $2, gender = $3 where id = $4", [
        admission_number,
        full_name,
        gender,
        req.params.id,
      ]);
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Admission number already exists in this class." });
      }
      return res.status(500).json({ error: "Failed to update student." });
    }

    const updated = await pool.query("select * from students where id = $1", [req.params.id]);
    res.json(updated.rows[0]);
  }),
);

app.get(
  "/api/classes/:classId/attendance",
  auth,
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || "").trim();
    if (!date) return res.json([]);

    const rows = await pool.query(
      `
      select a.student_id, a.status
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = $1 and a.date = $2::date and c.teacher_id = $3
      `,
      [req.params.classId, date, req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.get(
  "/api/classes/:classId/attendance/history",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `
      select
        a.date::text as date,
        count(*)::int as total_students,
        sum(case when a.status = 'present' then 1 else 0 end)::int as present_count,
        sum(case when a.status = 'absent' then 1 else 0 end)::int as absent_count
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = $1 and c.teacher_id = $2
      group by a.date
      order by a.date desc
      `,
      [req.params.classId, req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.post(
  "/api/classes/:classId/attendance",
  auth,
  asyncHandler(async (req, res) => {
    const date = String(req.body.date || "").trim();
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    if (!date) return res.status(400).json({ error: "Date is required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of records) {
        await client.query(
          `
          insert into attendance (student_id, class_id, date, status)
          values ($1, $2, $3::date, $4)
          on conflict (student_id, date)
          do update set status = excluded.status, class_id = excluded.class_id
          `,
          [r.student_id, req.params.classId, date, r.status],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  }),
);

app.get(
  "/api/classes/:classId/subjects",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `
      select s.*
      from subjects s
      join classes c on c.id = s.class_id
      where s.class_id = $1 and c.teacher_id = $2
      order by s.name
      `,
      [req.params.classId, req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.post(
  "/api/classes/:classId/subjects",
  auth,
  asyncHandler(async (req, res) => {
    const classOk = await pool.query("select 1 from classes where id = $1 and teacher_id = $2", [
      req.params.classId,
      req.user.id,
    ]);
    if (!classOk.rowCount) return res.status(404).json({ error: "Class not found" });

    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Subject name is required" });

    try {
      const row = await pool.query("insert into subjects (class_id, name) values ($1, $2) returning *", [
        req.params.classId,
        name,
      ]);
      res.json(row.rows[0]);
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Subject already exists in this class." });
      }
      throw error;
    }
  }),
);

app.delete(
  "/api/subjects/:id",
  auth,
  asyncHandler(async (req, res) => {
    await pool.query(
      `
      delete from subjects
      where id = $1
        and class_id in (select id from classes where teacher_id = $2)
      `,
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  }),
);

app.get(
  "/api/grade-settings",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      "select a_min::float as a_min, b_min::float as b_min, c_min::float as c_min, d_min::float as d_min, e_min::float as e_min, average_multiplier::float as average_multiplier from grade_settings where teacher_id = $1",
      [req.user.id],
    );
    res.json(rows.rows[0] || DEFAULT_GRADE_SCALE);
  }),
);

app.put(
  "/api/grade-settings",
  auth,
  asyncHandler(async (req, res) => {
    const a_min = toNumber(req.body.a_min, 0);
    const b_min = toNumber(req.body.b_min, 0);
    const c_min = toNumber(req.body.c_min, 0);
    const d_min = toNumber(req.body.d_min, 0);
    const e_min = toNumber(req.body.e_min ?? 0, 0);
    const average_multiplier = toNumber(req.body.average_multiplier ?? 1, 1);

    if (!(a_min > b_min && b_min > c_min && c_min > d_min && d_min > e_min && e_min >= 0 && a_min <= 100)) {
      return res.status(400).json({ error: "Invalid grade ranges. Must be A > B > C > D > E." });
    }
    if (average_multiplier !== 1 && average_multiplier !== 2) {
      return res.status(400).json({ error: "Average multiplier must be 1 or 2." });
    }

    await pool.query(
      `
      insert into grade_settings (teacher_id, a_min, b_min, c_min, d_min, e_min, average_multiplier, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (teacher_id)
      do update set
        a_min = excluded.a_min,
        b_min = excluded.b_min,
        c_min = excluded.c_min,
        d_min = excluded.d_min,
        e_min = excluded.e_min,
        average_multiplier = excluded.average_multiplier,
        updated_at = now()
      `,
      [req.user.id, a_min, b_min, c_min, d_min, e_min, average_multiplier],
    );

    const saved = await pool.query(
      "select a_min::float as a_min, b_min::float as b_min, c_min::float as c_min, d_min::float as d_min, e_min::float as e_min, average_multiplier::float as average_multiplier from grade_settings where teacher_id = $1",
      [req.user.id],
    );
    res.json(saved.rows[0]);
  }),
);

app.get(
  "/api/classes/:classId/marks",
  auth,
  asyncHandler(async (req, res) => {
    const subject_id = String(req.query.subject_id || "").trim();
    const exam_type = String(req.query.exam_type || "").trim();
    const term = String(req.query.term || "").trim();

    const rows = await pool.query(
      `
      select m.student_id, m.score::float as score
      from marks m
      join classes c on c.id = m.class_id
      where m.class_id = $1 and m.subject_id = $2 and m.exam_type = $3 and m.term = $4 and c.teacher_id = $5
      `,
      [req.params.classId, subject_id, exam_type, term, req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.post(
  "/api/classes/:classId/marks",
  auth,
  asyncHandler(async (req, res) => {
    const subject_id = String(req.body.subject_id || "").trim();
    const exam_type = String(req.body.exam_type || "").trim();
    const term = String(req.body.term || "").trim();
    const records = Array.isArray(req.body.records) ? req.body.records : [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of records) {
        await client.query(
          `
          insert into marks (student_id, subject_id, class_id, exam_type, term, score, out_of)
          values ($1, $2, $3, $4, $5, $6, 100)
          on conflict (student_id, subject_id, exam_type, term)
          do update set score = excluded.score, class_id = excluded.class_id
          `,
          [r.student_id, subject_id, req.params.classId, exam_type, term, r.score],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  }),
);

app.get(
  "/api/classes/:classId/timetable",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `
      select
        t.*,
        coalesce(s.name, s2.name) as subject_name
      from timetable_lessons t
      join classes c on c.id = t.class_id
      left join subjects s on s.id = t.subject_id
      left join timetable_lessons t2 on t2.id = t.compensation_for_lesson_id
      left join subjects s2 on s2.id = t2.subject_id
      where t.class_id = $1 and c.teacher_id = $2
      order by
        case t.day_of_week
          when 'Monday' then 1
          when 'Tuesday' then 2
          when 'Wednesday' then 3
          when 'Thursday' then 4
          when 'Friday' then 5
          else 6
        end,
        t.start_time
      `,
      [req.params.classId, req.user.id],
    );

    const normalized = rows.rows.map((row) => ({
      ...row,
      attended: row.attended === null ? null : Boolean(row.attended),
      compensated: Boolean(row.compensated),
    }));
    res.json(normalized);
  }),
);

app.post(
  "/api/classes/:classId/timetable",
  auth,
  asyncHandler(async (req, res) => {
    const classOk = await pool.query("select 1 from classes where id = $1 and teacher_id = $2", [
      req.params.classId,
      req.user.id,
    ]);
    if (!classOk.rowCount) return res.status(404).json({ error: "Class not found" });

    const subject_id = String(req.body.subject_id || "").trim();
    const day_of_week = String(req.body.day_of_week || "").trim();
    const start_time = String(req.body.start_time || "").trim();
    const end_time = String(req.body.end_time || "").trim();

    const row = await pool.query(
      "insert into timetable_lessons (class_id, subject_id, day_of_week, start_time, end_time) values ($1, $2, $3, $4::time, $5::time) returning *",
      [req.params.classId, subject_id || null, day_of_week, start_time, end_time],
    );
    res.json(row.rows[0]);
  }),
);

app.patch(
  "/api/timetable/:id",
  auth,
  asyncHandler(async (req, res) => {
    const attended = req.body.attended;
    const reason = String(req.body.reason || "").trim();

    const lesson = await pool.query(
      `
      select t.*
      from timetable_lessons t
      join classes c on c.id = t.class_id
      where t.id = $1 and c.teacher_id = $2
      `,
      [req.params.id, req.user.id],
    );
    const lessonRow = lesson.rows[0];
    if (!lessonRow) return res.status(404).json({ error: "Lesson not found." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        update timetable_lessons
        set attended = $1, reason = $2
        where id = $3
          and class_id in (select id from classes where teacher_id = $4)
        `,
        [attended === null ? null : Boolean(attended), reason || null, req.params.id, req.user.id],
      );

      if (attended === true || attended === false) {
        await client.query(
          `
          insert into timetable_history (
            class_id, lesson_id, subject_id, day_of_week, start_time, end_time, status, reason
          ) values ($1, $2, $3, $4, $5::time, $6::time, $7, $8)
          `,
          [
            lessonRow.class_id,
            lessonRow.id,
            lessonRow.subject_id,
            lessonRow.day_of_week,
            lessonRow.start_time,
            lessonRow.end_time,
            attended ? "attended" : "not_attended",
            attended ? null : reason || null,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  }),
);

app.get(
  "/api/classes/:classId/timetable/history",
  auth,
  asyncHandler(async (req, res) => {
    const rows = await pool.query(
      `
      select h.*, s.name as subject_name
      from timetable_history h
      join classes c on c.id = h.class_id
      left join subjects s on s.id = h.subject_id
      where h.class_id = $1 and c.teacher_id = $2
      order by h.recorded_at desc
      `,
      [req.params.classId, req.user.id],
    );
    res.json(rows.rows);
  }),
);

app.patch(
  "/api/timetable/:id/compensate",
  auth,
  asyncHandler(async (req, res) => {
    const lesson = await pool.query(
      `
      select t.*
      from timetable_lessons t
      join classes c on c.id = t.class_id
      where t.id = $1 and c.teacher_id = $2
      `,
      [req.params.id, req.user.id],
    );
    const lessonRow = lesson.rows[0];

    if (!lessonRow) return res.status(404).json({ error: "Lesson not found." });
    if (lessonRow.attended !== false) {
      return res.status(400).json({ error: "Only lessons marked as not attended can be compensated." });
    }

    const day_of_week = String(req.body.day_of_week || "").trim();
    const start_time = String(req.body.start_time || "").trim();
    const end_time = String(req.body.end_time || "").trim();
    const compensation_note = String(req.body.compensation_note || "").trim();
    const compensation_date = String(req.body.compensation_date || "").trim();

    if (!day_of_week || !start_time || !end_time) {
      return res.status(400).json({ error: "Compensation day and time are required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const created = await client.query(
        `
        insert into timetable_lessons (
          class_id, subject_id, day_of_week, start_time, end_time,
          attended, reason, compensated, compensation_for_lesson_id
        ) values ($1, $2, $3, $4::time, $5::time, null, $6, false, $7)
        returning id
        `,
        [
          lessonRow.class_id,
          lessonRow.subject_id,
          day_of_week,
          start_time,
          end_time,
          compensation_note
            ? `Compensation slot for missed lesson #${lessonRow.id}: ${compensation_note}`
            : `Compensation slot for missed lesson #${lessonRow.id}`,
          lessonRow.id,
        ],
      );

      await client.query(
        `
        update timetable_lessons
        set compensated = true, compensation_note = $1, compensation_date = $2::date
        where id = $3
        `,
        [compensation_note || null, compensation_date || null, lessonRow.id],
      );

      await client.query("COMMIT");
      res.json({ ok: true, compensation_lesson_id: created.rows[0].id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.delete(
  "/api/timetable/:id",
  auth,
  asyncHandler(async (req, res) => {
    await pool.query(
      `
      delete from timetable_lessons
      where id = $1
        and class_id in (select id from classes where teacher_id = $2)
      `,
      [req.params.id, req.user.id],
    );
    res.json({ ok: true });
  }),
);

app.get(
  "/api/classes/:classId/performance-summary",
  auth,
  asyncHandler(async (req, res) => {
    const classId = req.params.classId;

    const scaleRows = await pool.query(
      "select a_min::float as a_min, b_min::float as b_min, c_min::float as c_min, d_min::float as d_min, e_min::float as e_min, average_multiplier::float as average_multiplier from grade_settings where teacher_id = $1",
      [req.user.id],
    );
    const scale = scaleRows.rows[0] || DEFAULT_GRADE_SCALE;

    const marksRows = await pool.query(
      `
      select m.student_id, avg(m.score)::float as avg_score
      from marks m
      join classes c on c.id = m.class_id
      where m.class_id = $1 and c.teacher_id = $2
      group by m.student_id
      `,
      [classId, req.user.id],
    );

    const attendanceRows = await pool.query(
      `
      select
        count(*)::int as total_records,
        sum(case when status = 'present' then 1 else 0 end)::int as present_records
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = $1 and c.teacher_id = $2
      `,
      [classId, req.user.id],
    );

    const trendsRows = await pool.query(
      `
      select
        to_char(date_trunc('week', a.date), 'IYYY-"W"IW') as week_start,
        round(100.0 * sum(case when status = 'present' then 1 else 0 end) / nullif(count(*), 0), 1)::float as attendance_rate,
        min(a.date) as min_date
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = $1 and c.teacher_id = $2
      group by date_trunc('week', a.date)
      order by min(a.date) desc
      limit 6
      `,
      [classId, req.user.id],
    );

    const studentAverages = marksRows.rows.map((r) =>
      Math.min(100, Number((toNumber(r.avg_score, 0) * toNumber(scale.average_multiplier, 1)).toFixed(2))),
    );
    const classAverage =
      studentAverages.length === 0 ? 0 : studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length;

    const gradeBreakdown = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const avg of studentAverages) gradeBreakdown[gradeFromScale(avg, scale)] += 1;

    const attendance = attendanceRows.rows[0] || { total_records: 0, present_records: 0 };
    const total = toNumber(attendance.total_records, 0);
    const present = toNumber(attendance.present_records, 0);
    const attendanceRate = total === 0 ? 0 : (present * 100) / total;

    const trends = trendsRows.rows
      .sort((a, b) => new Date(a.min_date).getTime() - new Date(b.min_date).getTime())
      .map((r) => ({ week_start: r.week_start, attendance_rate: toNumber(r.attendance_rate, 0) }));

    res.json({
      class_average: Number(classAverage.toFixed(1)),
      class_grade: gradeFromScale(classAverage, scale),
      attendance_rate: Number(attendanceRate.toFixed(1)),
      grade_breakdown: gradeBreakdown,
      trends,
    });
  }),
);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Server error" });
});

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
      console.log("Database: PostgreSQL (Neon)");
    });
  } catch (error) {
    console.error("Failed to start API:", error.message || error);
    process.exit(1);
  }
}

start();
