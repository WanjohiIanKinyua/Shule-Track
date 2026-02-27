# Shule Track

Shule Track is a simple Kenyan high school teacher management system for:
- class setup (`Form 1` to `Form 4`)
- student records per class
- daily attendance
- CAT/exam marks with automatic grade assignment (`A-E`)
- class performance summary and trends
- timetable and lesson coverage tracking

## Active code vs old files

- Active app code: `src/` and `server/`
- Old mixed files kept for reference: `legacy/` (not used by the running app)

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database (current): SQLite
- Database (later): PostgreSQL (Neon)

## 1) Configure environment

Copy `.env.example` to `.env` and set values:

```bash
SQLITE_PATH=./server/shule-track.db
JWT_SECRET=your-strong-secret
PORT=4000
VITE_API_URL=http://localhost:4000/api
```

## 2) Initialize database schema

The app auto-creates SQLite tables on backend startup using:

- `server/schema.sqlite.sql`

For later PostgreSQL migration, use:

- `server/schema.postgres.sql`

## 3) Install dependencies

```bash
npm install
```

## 4) Run backend

```bash
npm run server
```

## 5) Run frontend

In another terminal:

```bash
npm run dev
```

Frontend runs on `http://localhost:8080` and API on `http://localhost:4000`.
