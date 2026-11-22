# FS-03 · Learning Management System with Live Classes (LearnHub)

A full online school: courses, adaptive-streaming video lessons, live classes with chat, auto-graded quizzes, progress tracking, PDF certificates and instructor earnings.

**Stack:** React · TypeScript · Tailwind CSS · Chart.js · hls.js · Node.js · Express · PostgreSQL · Prisma · Redis · BullMQ · FFmpeg · AWS S3 + CloudFront (MinIO locally) · LiveKit (WebRTC) · Socket.io · Stripe (test mode) · Docker

---

## Features (mapped to the milestones)

| # | Milestone | Implementation |
|---|---|---|
| 1 | Roles + course/lesson/enrollment schema | `STUDENT`, `INSTRUCTOR`, `ADMIN` with JWT + Redis sessions and `requireRole` middleware. Prisma schema: Course, Lesson, Enrollment, LessonProgress, Quiz, Question, QuizAttempt, LiveClass, ChatMessage, Certificate, Payment. |
| 2 | Course creation + video upload + FFmpeg in BullMQ | Instructors build courses in the **Course editor**. Videos upload with a progress bar, are stored in S3 (`raw/`), and a **BullMQ** job is queued. A separate **worker** process runs **FFmpeg** to produce adaptive **HLS** (360p + 720p + master playlist), uploads the result to S3 (`hls/`) and reports progress %. Failed jobs retry 3× with exponential backoff. |
| 3 | Delivery through CloudFront | Lesson URLs are built from `CDN_BASE_URL` (your CloudFront domain). Segments are uploaded with `Cache-Control: immutable` and versioned paths so CloudFront caches them forever. Playback uses **hls.js** (native HLS on Safari). |
| 4 | Quizzes with auto-grading + progress tracking | Instructor quiz builder (2–6 options, pass mark, explanations). Answers are graded on the server; correct answers are never sent to students before submitting. Watch progress is saved every 15 s; a lesson completes at 90% watched or "Mark as complete". |
| 5 | Live classes (WebRTC/LiveKit) with chat | Instructor schedules a class and clicks **Go live**. The API issues signed **LiveKit** tokens (host can publish camera/mic/screen; students subscribe). Chat runs over **Socket.io**, is saved in Postgres (late joiners see history) and shows a live viewer count. |
| 6 | PDF certificates on completion | When all lessons are complete **and** all quizzes passed, students download a landscape PDF certificate (PDFKit) with a unique ID and a public **verification page** (`/verify/:code`). |
| 7 | Instructor revenue dashboard + payments (test mode) | **Stripe Checkout** in test mode for paid courses (webhook enrolls the student). The platform keeps `PLATFORM_FEE_PERCENT` (default 20%). The **Chart.js** dashboard shows monthly earnings, students per course, completion rate, average quiz score and recent sales. Without a Stripe key, payments run in mock mode. |

Extras: course catalog with search and filters, free preview lessons, admin page (platform stats, user roles, failed video jobs), seed data with demo accounts.

## Project structure

```
FS-03-lms/
├── backend/
│   ├── prisma/          schema.prisma, seed.ts
│   ├── src/
│   │   ├── index.ts     HTTP server + Socket.io
│   │   ├── worker.ts    BullMQ + FFmpeg video worker (separate process)
│   │   ├── socket.ts    live-class chat
│   │   ├── lib/         prisma, redis, s3 (+ CloudFront URLs), queue, stripe
│   │   ├── middleware/  auth (JWT + roles), errors
│   │   ├── routes/      auth, courses, lessons, quizzes, live, certificates, enroll (payments), instructor, admin
│   │   ├── services/    access control, progress, certificate PDF
│   │   └── utils/       learning.ts (grading, completion, revenue split, FFmpeg HLS args)
│   ├── tests/           Vitest + Supertest
│   └── Dockerfile       API and worker image (includes FFmpeg)
├── frontend/            React + Vite + Tailwind + Chart.js + hls.js + LiveKit components
├── docs/                ARCHITECTURE.md, API.md, TESTING.md, DEPLOYMENT.md
└── docker-compose.yml   Postgres, Redis, MinIO, LiveKit, API, worker, web
```

## Run locally

### Option A — Docker (everything)

```bash
cd FS-03-lms
docker compose up --build
docker compose exec api npx tsx prisma/seed.ts     # demo data
```

Open **http://localhost:5174** · API http://localhost:5000 · MinIO console http://localhost:9011 · LiveKit ws://localhost:7880

### Option B — development mode

```bash
docker compose up -d postgres redis minio create-bucket livekit

cd backend
cp .env.example .env
npm install
npx prisma db push
npm run seed
npm run dev            # API on :5000
npm run dev:worker     # in another terminal: video worker (needs ffmpeg installed locally)

cd ../frontend
cp .env.example .env
npm install
npm run dev            # http://localhost:5174
```

In development, if Redis is unavailable, the API uses temporary in-memory sessions and logs a warning. Sessions are lost when the API stops; video job queues still require Redis.

### Demo accounts (password `Password123!`)

| Email | Role |
|---|---|
| student@demo.com | Student (enrolled in *Web Development Foundations*) |
| instructor@demo.com | Instructor (owns both demo courses, has sales data) |
| admin@demo.com | Admin |

Seeded lessons embed *How The Web Works - The Big Picture* (Academind) from YouTube. Upload your own video in the Course editor to test the FFmpeg pipeline.

### Try the full flow in 5 minutes

1. Log in as **instructor** → Instructor → *Web Development Foundations* → Edit → upload a short MP4 to a lesson → watch the status go UPLOADED → PROCESSING % → READY.
2. In **Live classes**, schedule a session → **Open studio** → **Go live** (allow camera).
3. In another browser (or incognito), log in as **student** → open the course → **Join** the live class → chat.
4. As the student, watch/mark all lessons complete → take the quiz (pass 70%) → **Download certificate** → open the verification link.
5. Log in as a new student, buy *Backend APIs with Node.js* (test card `4242 4242 4242 4242` with Stripe keys, or instantly in mock mode) → the instructor dashboard updates.

## Tests

```bash
cd backend && npm test
```

See [docs/TESTING.md](docs/TESTING.md).

## Deployment

Front end and back end deploy separately: frontend on Vercel, API + worker on Render (Docker), S3 + CloudFront on AWS, LiveKit Cloud (free tier). Step-by-step guide, including the CloudFront setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture, schema and video pipeline](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Testing](docs/TESTING.md)
- [Deployment & CloudFront](docs/DEPLOYMENT.md)
