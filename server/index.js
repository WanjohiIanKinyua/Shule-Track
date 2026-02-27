import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, "shule-track.db");

const db = new Database(SQLITE_PATH);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sqlite.sql"), "utf8"));
try {
  db.exec("alter table grade_settings add column average_multiplier real not null default 1");
} catch {
}
try {
  db.exec("alter table grade_settings add column e_min real not null default 0");
} catch {
}
try {
  db.exec("alter table timetable_lessons add column compensated integer not null default 0");
} catch {
}
try {
  db.exec("alter table timetable_lessons add column compensation_note text");
} catch {
}
try {
  db.exec("alter table timetable_lessons add column compensation_date text");
} catch {
}
try {
  db.exec("alter table timetable_lessons add column compensation_for_lesson_id integer");
} catch {
}

function migrateMarksExamTypeConstraintIfNeeded() {
  const row = db
    .prepare("select sql from sqlite_master where type = 'table' and name = 'marks'")
    .get();
  const ddl = String(row?.sql || "");
  if (!ddl.toLowerCase().includes("check (exam_type")) return;

  db.exec("begin");
  try {
    db.exec(`
      create table if not exists marks_new (
        id integer primary key autoincrement,
        student_id integer not null,
        subject_id integer not null,
        class_id integer not null,
        exam_type text not null,
        term text not null check (term in ('Term 1', 'Term 2', 'Term 3')),
        score real not null check (score >= 0 and score <= 100),
        out_of real not null default 100,
        created_at text not null default current_timestamp,
        unique (student_id, subject_id, exam_type, term),
        foreign key (student_id) references students(id) on delete cascade,
        foreign key (subject_id) references subjects(id) on delete cascade,
        foreign key (class_id) references classes(id) on delete cascade
      );
    `);
    db.exec(`
      insert into marks_new (id, student_id, subject_id, class_id, exam_type, term, score, out_of, created_at)
      select id, student_id, subject_id, class_id, exam_type, term, score, out_of, created_at from marks;
    `);
    db.exec("drop table marks;");
    db.exec("alter table marks_new rename to marks;");
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
}

migrateMarksExamTypeConstraintIfNeeded();

const DEFAULT_EXAM_TYPES = ["Opener", "CAT", "Mid-Term", "End-Term"];

function ensureDefaultExamTypes(teacherId) {
  const existing = db.prepare("select count(*) as count from exam_types where teacher_id = ?").get(teacherId);
  if (Number(existing?.count || 0) > 0) return;
  const stmt = db.prepare("insert or ignore into exam_types (teacher_id, name) values (?, ?)");
  for (const name of DEFAULT_EXAM_TYPES) stmt.run(teacherId, name);
}

app.use(cors());
app.use(express.json());

function gradeFromAverage(avg) {
  if (avg >= 80) return "A";
  if (avg >= 60) return "B";
  if (avg >= 40) return "C";
  if (avg >= 30) return "D";
  return "E";
}

function gradeFromScale(avg, scale) {
  if (avg >= scale.a_min) return "A";
  if (avg >= scale.b_min) return "B";
  if (avg >= scale.c_min) return "C";
  if (avg >= scale.d_min) return "D";
  if (avg >= scale.e_min) return "E";
  return "E";
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

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const info = db
      .prepare("insert into teachers (name, email, password_hash) values (?, ?, ?)")
      .run(name, String(email).toLowerCase(), hash);
    const teacher = db
      .prepare("select id, name, email from teachers where id = ?")
      .get(Number(info.lastInsertRowid));
    const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, teacher });
  } catch (error) {
    if (String(error).includes("UNIQUE")) return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });
  const teacher = db.prepare("select * from teachers where email = ?").get(String(email).toLowerCase());
  if (!teacher) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, teacher.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, teacher: { id: teacher.id, name: teacher.name, email: teacher.email } });
});

app.get("/api/me", auth, (req, res) => {
  const teacher = db.prepare("select id, name, email from teachers where id = ?").get(req.user.id);
  res.json(teacher || null);
});

app.put("/api/me", auth, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  try {
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
      const hash = await bcrypt.hash(password, 10);
      db.prepare("update teachers set name = ?, email = ?, password_hash = ? where id = ?").run(
        name,
        email,
        hash,
        req.user.id,
      );
    } else {
      db.prepare("update teachers set name = ?, email = ? where id = ?").run(name, email, req.user.id);
    }
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return res.status(409).json({ error: "Email already exists." });
    }
    return res.status(500).json({ error: "Failed to update profile." });
  }

  const updated = db.prepare("select id, name, email from teachers where id = ?").get(req.user.id);
  res.json(updated);
});

app.get("/api/exam-types", auth, (req, res) => {
  ensureDefaultExamTypes(req.user.id);
  const rows = db
    .prepare("select id, name from exam_types where teacher_id = ? order by lower(name)")
    .all(req.user.id);
  res.json(rows);
});

app.post("/api/exam-types", auth, (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Exam type name is required." });
  db.prepare("insert or ignore into exam_types (teacher_id, name) values (?, ?)").run(req.user.id, name);
  const rows = db
    .prepare("select id, name from exam_types where teacher_id = ? order by lower(name)")
    .all(req.user.id);
  res.json(rows);
});

app.delete("/api/exam-types/:id", auth, (req, res) => {
  const id = req.params.id;
  const entry = db.prepare("select id, name from exam_types where id = ? and teacher_id = ?").get(id, req.user.id);
  if (!entry) return res.status(404).json({ error: "Exam type not found." });

  const usage = db
    .prepare(
      `
      select count(*) as count
      from marks m
      join classes c on c.id = m.class_id
      where c.teacher_id = ? and m.exam_type = ?
      `,
    )
    .get(req.user.id, entry.name);

  if (Number(usage?.count || 0) > 0) {
    return res.status(400).json({ error: "Cannot delete exam type already used in saved marks." });
  }

  db.prepare("delete from exam_types where id = ? and teacher_id = ?").run(id, req.user.id);
  const rows = db
    .prepare("select id, name from exam_types where teacher_id = ? order by lower(name)")
    .all(req.user.id);
  res.json(rows);
});

app.get("/api/classes", auth, (req, res) => {
  const classes = db
    .prepare(
      `
      select c.*,
        (select count(*) from students s where s.class_id = c.id) as student_count
      from classes c
      where c.teacher_id = ?
      order by c.name, c.stream
      `,
    )
    .all(req.user.id);
  res.json(classes);
});

app.post("/api/classes", auth, (req, res) => {
  const { name, stream } = req.body;
  const info = db
    .prepare("insert into classes (teacher_id, name, stream, year) values (?, ?, ?, ?)")
    .run(req.user.id, name, stream || null, new Date().getFullYear());
  const row = db.prepare("select * from classes where id = ?").get(Number(info.lastInsertRowid));
  res.json(row);
});

app.delete("/api/classes/:id", auth, (req, res) => {
  db.prepare("delete from classes where id = ? and teacher_id = ?").run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get("/api/classes/:classId/students", auth, (req, res) => {
  const students = db
    .prepare(
      `
      select s.* from students s
      join classes c on c.id = s.class_id
      where s.class_id = ? and c.teacher_id = ?
      order by s.full_name
      `,
    )
    .all(req.params.classId, req.user.id);
  res.json(students);
});

app.post("/api/classes/:classId/students", auth, (req, res) => {
  const classOk = db
    .prepare("select 1 from classes where id = ? and teacher_id = ?")
    .get(req.params.classId, req.user.id);
  if (!classOk) return res.status(404).json({ error: "Class not found" });

  const { admission_number, full_name, gender } = req.body;
  const info = db
    .prepare("insert into students (class_id, admission_number, full_name, gender) values (?, ?, ?, ?)")
    .run(req.params.classId, admission_number, full_name, gender);
  const row = db.prepare("select * from students where id = ?").get(Number(info.lastInsertRowid));
  res.json(row);
});

app.delete("/api/students/:id", auth, (req, res) => {
  db.prepare(
    `
    delete from students
    where id = ?
      and class_id in (select id from classes where teacher_id = ?)
    `,
  ).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.put("/api/students/:id", auth, (req, res) => {
  const { admission_number, full_name, gender } = req.body;
  if (!admission_number || !full_name || !gender) {
    return res.status(400).json({ error: "Admission number, name and gender are required." });
  }

  const student = db
    .prepare(
      `
      select s.id, s.class_id
      from students s
      join classes c on c.id = s.class_id
      where s.id = ? and c.teacher_id = ?
      `,
    )
    .get(req.params.id, req.user.id);

  if (!student) return res.status(404).json({ error: "Student not found." });

  try {
    db.prepare("update students set admission_number = ?, full_name = ?, gender = ? where id = ?").run(
      String(admission_number).trim(),
      String(full_name).trim(),
      String(gender),
      req.params.id,
    );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return res.status(409).json({ error: "Admission number already exists in this class." });
    }
    return res.status(500).json({ error: "Failed to update student." });
  }

  const updated = db.prepare("select * from students where id = ?").get(req.params.id);
  res.json(updated);
});

app.get("/api/classes/:classId/attendance", auth, (req, res) => {
  const rows = db
    .prepare(
      `
      select a.student_id, a.status
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = ? and a.date = ? and c.teacher_id = ?
      `,
    )
    .all(req.params.classId, req.query.date, req.user.id);
  res.json(rows);
});

app.get("/api/classes/:classId/attendance/history", auth, (req, res) => {
  const rows = db
    .prepare(
      `
      select
        a.date,
        count(*) as total_students,
        sum(case when a.status = 'present' then 1 else 0 end) as present_count,
        sum(case when a.status = 'absent' then 1 else 0 end) as absent_count
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = ? and c.teacher_id = ?
      group by a.date
      order by a.date desc
      `,
    )
    .all(req.params.classId, req.user.id);
  res.json(rows);
});

app.post("/api/classes/:classId/attendance", auth, (req, res) => {
  const { date, records } = req.body;
  const tx = db.transaction((items) => {
    const stmt = db.prepare(
      `
      insert into attendance (student_id, class_id, date, status)
      values (?, ?, ?, ?)
      on conflict (student_id, date)
      do update set status = excluded.status, class_id = excluded.class_id
      `,
    );
    for (const r of items) {
      stmt.run(r.student_id, req.params.classId, date, r.status);
    }
  });
  tx(records || []);
  res.json({ ok: true });
});

app.get("/api/classes/:classId/subjects", auth, (req, res) => {
  const rows = db
    .prepare(
      `
      select s.* from subjects s
      join classes c on c.id = s.class_id
      where s.class_id = ? and c.teacher_id = ?
      order by s.name
      `,
    )
    .all(req.params.classId, req.user.id);
  res.json(rows);
});

app.post("/api/classes/:classId/subjects", auth, (req, res) => {
  const classOk = db
    .prepare("select 1 from classes where id = ? and teacher_id = ?")
    .get(req.params.classId, req.user.id);
  if (!classOk) return res.status(404).json({ error: "Class not found" });

  const info = db
    .prepare("insert into subjects (class_id, name) values (?, ?)")
    .run(req.params.classId, req.body.name);
  const row = db.prepare("select * from subjects where id = ?").get(Number(info.lastInsertRowid));
  res.json(row);
});

app.delete("/api/subjects/:id", auth, (req, res) => {
  db.prepare(
    `
    delete from subjects
    where id = ?
      and class_id in (select id from classes where teacher_id = ?)
    `,
  ).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get("/api/grade-settings", auth, (req, res) => {
  const settings = db
    .prepare("select a_min, b_min, c_min, d_min, e_min, average_multiplier from grade_settings where teacher_id = ?")
    .get(req.user.id);
  res.json(settings || { a_min: 80, b_min: 60, c_min: 40, d_min: 30, e_min: 0, average_multiplier: 1 });
});

app.put("/api/grade-settings", auth, (req, res) => {
  const a_min = Number(req.body.a_min);
  const b_min = Number(req.body.b_min);
  const c_min = Number(req.body.c_min);
  const d_min = Number(req.body.d_min);
  const e_min = Number(req.body.e_min ?? 0);
  const average_multiplier = Number(req.body.average_multiplier ?? 1);

  if (
    Number.isNaN(a_min) ||
    Number.isNaN(b_min) ||
    Number.isNaN(c_min) ||
    Number.isNaN(d_min) ||
    Number.isNaN(e_min) ||
    Number.isNaN(average_multiplier) ||
    !(a_min > b_min && b_min > c_min && c_min > d_min && d_min > e_min && e_min >= 0 && a_min <= 100)
  ) {
    return res.status(400).json({ error: "Invalid grade ranges. Must be A > B > C > D > E." });
  }
  if (average_multiplier !== 1 && average_multiplier !== 2) {
    return res.status(400).json({ error: "Average multiplier must be 1 or 2." });
  }

  db.prepare(
    `
    insert into grade_settings (teacher_id, a_min, b_min, c_min, d_min, e_min, average_multiplier, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, current_timestamp)
    on conflict (teacher_id)
    do update set
      a_min = excluded.a_min,
      b_min = excluded.b_min,
      c_min = excluded.c_min,
      d_min = excluded.d_min,
      e_min = excluded.e_min,
      average_multiplier = excluded.average_multiplier,
      updated_at = current_timestamp
    `,
  ).run(req.user.id, a_min, b_min, c_min, d_min, e_min, average_multiplier);

  const saved = db
    .prepare("select a_min, b_min, c_min, d_min, e_min, average_multiplier from grade_settings where teacher_id = ?")
    .get(req.user.id);
  res.json(saved);
});

app.get("/api/classes/:classId/marks", auth, (req, res) => {
  const { subject_id, exam_type, term } = req.query;
  const rows = db
    .prepare(
      `
      select m.student_id, m.score
      from marks m
      join classes c on c.id = m.class_id
      where m.class_id = ? and m.subject_id = ? and m.exam_type = ? and m.term = ? and c.teacher_id = ?
      `,
    )
    .all(req.params.classId, subject_id, exam_type, term, req.user.id);
  res.json(rows);
});

app.post("/api/classes/:classId/marks", auth, (req, res) => {
  const { subject_id, exam_type, term, records } = req.body;
  const tx = db.transaction((items) => {
    const stmt = db.prepare(
      `
      insert into marks (student_id, subject_id, class_id, exam_type, term, score, out_of)
      values (?, ?, ?, ?, ?, ?, 100)
      on conflict (student_id, subject_id, exam_type, term)
      do update set score = excluded.score, class_id = excluded.class_id
      `,
    );
    for (const r of items) {
      stmt.run(r.student_id, subject_id, req.params.classId, exam_type, term, r.score);
    }
  });
  tx(records || []);
  res.json({ ok: true });
});

app.get("/api/classes/:classId/timetable", auth, (req, res) => {
  const rows = db
    .prepare(
      `
      select t.*, coalesce(s.name, s2.name) as subject_name
      from timetable_lessons t
      join classes c on c.id = t.class_id
      left join subjects s on s.id = t.subject_id
      left join timetable_lessons t2 on t2.id = t.compensation_for_lesson_id
      left join subjects s2 on s2.id = t2.subject_id
      where t.class_id = ? and c.teacher_id = ?
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
    )
    .all(req.params.classId, req.user.id);
  const normalized = rows.map((row) => ({
    ...row,
    attended: row.attended === null ? null : Boolean(row.attended),
    compensated: Boolean(row.compensated),
  }));
  res.json(normalized);
});

app.post("/api/classes/:classId/timetable", auth, (req, res) => {
  const classOk = db
    .prepare("select 1 from classes where id = ? and teacher_id = ?")
    .get(req.params.classId, req.user.id);
  if (!classOk) return res.status(404).json({ error: "Class not found" });

  const { subject_id, day_of_week, start_time, end_time } = req.body;
  const info = db
    .prepare(
      "insert into timetable_lessons (class_id, subject_id, day_of_week, start_time, end_time) values (?, ?, ?, ?, ?)",
    )
    .run(req.params.classId, subject_id || null, day_of_week, start_time, end_time);
  const row = db.prepare("select * from timetable_lessons where id = ?").get(Number(info.lastInsertRowid));
  res.json(row);
});

app.patch("/api/timetable/:id", auth, (req, res) => {
  const { attended, reason } = req.body;
  const lesson = db
    .prepare(
      `
      select t.*
      from timetable_lessons t
      join classes c on c.id = t.class_id
      where t.id = ? and c.teacher_id = ?
      `,
    )
    .get(req.params.id, req.user.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found." });

  const tx = db.transaction(() => {
    db.prepare(
      `
      update timetable_lessons
      set attended = ?, reason = ?
      where id = ?
        and class_id in (select id from classes where teacher_id = ?)
      `,
    ).run(attended === null ? null : attended ? 1 : 0, reason || null, req.params.id, req.user.id);

    if (attended === true || attended === false) {
      db.prepare(
        `
        insert into timetable_history (
          class_id, lesson_id, subject_id, day_of_week, start_time, end_time, status, reason
        )
        values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        lesson.class_id,
        lesson.id,
        lesson.subject_id,
        lesson.day_of_week,
        lesson.start_time,
        lesson.end_time,
        attended ? "attended" : "not_attended",
        attended ? null : reason || null,
      );
    }
  });

  tx();
  res.json({ ok: true });
});

app.get("/api/classes/:classId/timetable/history", auth, (req, res) => {
  const rows = db
    .prepare(
      `
      select h.*, s.name as subject_name
      from timetable_history h
      join classes c on c.id = h.class_id
      left join subjects s on s.id = h.subject_id
      where h.class_id = ? and c.teacher_id = ?
      order by h.recorded_at desc
      `,
    )
    .all(req.params.classId, req.user.id);
  res.json(rows);
});

app.patch("/api/timetable/:id/compensate", auth, (req, res) => {
  const lesson = db
    .prepare(
      `
      select t.*
      from timetable_lessons t
      join classes c on c.id = t.class_id
      where t.id = ? and c.teacher_id = ?
      `,
    )
    .get(req.params.id, req.user.id);

  if (!lesson) return res.status(404).json({ error: "Lesson not found." });
  if (lesson.attended !== 0) {
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

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
        insert into timetable_lessons (
          class_id, subject_id, day_of_week, start_time, end_time,
          attended, reason, compensated, compensation_for_lesson_id
        )
        values (?, ?, ?, ?, ?, null, ?, 0, ?)
        `,
      )
      .run(
        lesson.class_id,
        lesson.subject_id,
        day_of_week,
        start_time,
        end_time,
        compensation_note ? `Compensation slot for missed lesson #${lesson.id}: ${compensation_note}` : `Compensation slot for missed lesson #${lesson.id}`,
        lesson.id,
      );

    db.prepare(
      `
      update timetable_lessons
      set compensated = 1, compensation_note = ?, compensation_date = ?
      where id = ?
      `,
    ).run(compensation_note || null, compensation_date || null, lesson.id);

    return info.lastInsertRowid;
  });

  const newLessonId = tx();
  res.json({ ok: true, compensation_lesson_id: newLessonId });
});

app.delete("/api/timetable/:id", auth, (req, res) => {
  db.prepare(
    `
    delete from timetable_lessons
    where id = ?
      and class_id in (select id from classes where teacher_id = ?)
    `,
  ).run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get("/api/classes/:classId/performance-summary", auth, (req, res) => {
  const classId = req.params.classId;
  const scale =
    db
      .prepare("select a_min, b_min, c_min, d_min, e_min, average_multiplier from grade_settings where teacher_id = ?")
      .get(req.user.id) || {
      a_min: 80,
      b_min: 60,
      c_min: 40,
      d_min: 30,
      e_min: 0,
      average_multiplier: 1,
    };

  const marksRows = db
    .prepare(
      `
      select m.student_id, avg(m.score) as avg_score
      from marks m
      join classes c on c.id = m.class_id
      where m.class_id = ? and c.teacher_id = ?
      group by m.student_id
      `,
    )
    .all(classId, req.user.id);

  const attendance = db
    .prepare(
      `
      select
        count(*) as total_records,
        sum(case when status = 'present' then 1 else 0 end) as present_records
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = ? and c.teacher_id = ?
      `,
    )
    .get(classId, req.user.id);

  const trends = db
    .prepare(
      `
      select
        strftime('%Y-W%W', a.date) as week_start,
        round(100.0 * sum(case when status='present' then 1 else 0 end) / count(*), 1) as attendance_rate
      from attendance a
      join classes c on c.id = a.class_id
      where a.class_id = ? and c.teacher_id = ?
      group by week_start
      order by week_start desc
      limit 6
      `,
    )
    .all(classId, req.user.id)
    .reverse();

  const studentAverages = marksRows.map((r) =>
    Math.min(100, Number((Number(r.avg_score || 0) * Number(scale.average_multiplier || 1)).toFixed(2))),
  );
  const classAverage =
    studentAverages.length === 0
      ? 0
      : studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length;

  const gradeBreakdown = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const avg of studentAverages) gradeBreakdown[gradeFromScale(avg, scale)] += 1;

  const total = Number(attendance?.total_records || 0);
  const present = Number(attendance?.present_records || 0);
  const attendanceRate = total === 0 ? 0 : (present * 100) / total;

  res.json({
    class_average: Number(classAverage.toFixed(1)),
    class_grade: gradeFromScale(classAverage, scale),
    attendance_rate: Number(attendanceRate.toFixed(1)),
    grade_breakdown: gradeBreakdown,
    trends,
  });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`SQLite DB: ${SQLITE_PATH}`);
});
