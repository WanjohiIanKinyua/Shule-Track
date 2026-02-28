# Shule Track

Shule Track is a Kenyan high school teacher management system for:
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
- Database: PostgreSQL (Neon)
- Analytics: Vercel Analytics

## 1) Configure environment

Copy `.env.example` to `.env` and set values:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=verify-full
JWT_SECRET=your-strong-secret
PORT=4000
VITE_API_URL=http://localhost:4000/api
```

## 2) Install dependencies

```bash
npm install
```

## 3) Run backend

```bash
npm run server
```

## 4) Run frontend

In another terminal:

```bash
npm run dev
```

Frontend runs on `http://localhost:8080` and API on `http://localhost:4000`.

## Authentication

- Registration requires a password with:
- at least 6 characters
- at least 1 letter
- at least 1 number
- at least 1 special character

## Deployment

### Render (backend)

- Root Directory: project root (recommended)
- Build Command: `npm install`
- Start Command: `npm run server`
- Set `DATABASE_URL`, `JWT_SECRET`, and `PORT`

### Vercel (frontend)

- Framework preset: `Vite`
- Set `VITE_API_URL` to your backend API, for example:

```bash
VITE_API_URL=https://your-backend-domain.onrender.com/api
```

## Notes

- The backend auto-applies `server/schema.postgres.sql` on startup.
- If port `4000` is busy, stop the process using it or change `PORT` in `.env`.
- Vercel Analytics is already wired in through the React app entry file.
