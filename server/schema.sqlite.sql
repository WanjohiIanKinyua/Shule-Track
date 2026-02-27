create table if not exists teachers (
  id integer primary key autoincrement,
  name text not null,
  email text not null unique,
  password_hash text not null,
  created_at text not null default current_timestamp
);

create table if not exists classes (
  id integer primary key autoincrement,
  teacher_id integer not null,
  name text not null check (name in ('Form 1', 'Form 2', 'Form 3', 'Form 4')),
  stream text,
  year integer not null,
  created_at text not null default current_timestamp,
  foreign key (teacher_id) references teachers(id) on delete cascade
);

create table if not exists students (
  id integer primary key autoincrement,
  class_id integer not null,
  admission_number text not null,
  full_name text not null,
  gender text not null check (gender in ('Male', 'Female')),
  created_at text not null default current_timestamp,
  unique (class_id, admission_number),
  foreign key (class_id) references classes(id) on delete cascade
);

create table if not exists attendance (
  id integer primary key autoincrement,
  student_id integer not null,
  class_id integer not null,
  date text not null,
  status text not null check (status in ('present', 'absent')),
  created_at text not null default current_timestamp,
  unique (student_id, date),
  foreign key (student_id) references students(id) on delete cascade,
  foreign key (class_id) references classes(id) on delete cascade
);

create table if not exists subjects (
  id integer primary key autoincrement,
  class_id integer not null,
  name text not null,
  created_at text not null default current_timestamp,
  unique (class_id, name),
  foreign key (class_id) references classes(id) on delete cascade
);

create table if not exists marks (
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

create table if not exists timetable_lessons (
  id integer primary key autoincrement,
  class_id integer not null,
  subject_id integer,
  day_of_week text not null check (day_of_week in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')),
  start_time text not null,
  end_time text not null,
  attended integer,
  reason text,
  compensated integer not null default 0,
  compensation_note text,
  compensation_date text,
  compensation_for_lesson_id integer,
  created_at text not null default current_timestamp,
  foreign key (class_id) references classes(id) on delete cascade,
  foreign key (subject_id) references subjects(id) on delete set null,
  foreign key (compensation_for_lesson_id) references timetable_lessons(id) on delete set null
);

create table if not exists timetable_history (
  id integer primary key autoincrement,
  class_id integer not null references classes(id) on delete cascade,
  lesson_id integer references timetable_lessons(id) on delete set null,
  subject_id integer references subjects(id) on delete set null,
  day_of_week text not null,
  start_time text not null,
  end_time text not null,
  status text not null check (status in ('attended', 'not_attended')),
  reason text,
  recorded_at text not null default current_timestamp
);

create table if not exists grade_settings (
  id integer primary key autoincrement,
  teacher_id integer not null unique,
  a_min real not null default 80,
  b_min real not null default 60,
  c_min real not null default 40,
  d_min real not null default 30,
  e_min real not null default 0,
  average_multiplier real not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  foreign key (teacher_id) references teachers(id) on delete cascade
);

create table if not exists exam_types (
  id integer primary key autoincrement,
  teacher_id integer not null,
  name text not null,
  created_at text not null default current_timestamp,
  unique (teacher_id, name),
  foreign key (teacher_id) references teachers(id) on delete cascade
);
