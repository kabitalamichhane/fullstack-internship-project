# FS-03 API Reference

Base URL `http://localhost:5000/api` · Auth header `Authorization: Bearer <token>` · Money in **cents**.
Errors: `{ "error": "message", "details"?: {...} }`.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password, role: STUDENT \| INSTRUCTOR }` → `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | revokes session |
| GET | `/auth/me` | current user |

## Courses

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/courses?q=&category=&price=free\|paid` | public | Published catalog + category list |
| GET | `/courses/mine` | any | Student: enrollments with progress · Instructor: own courses |
| GET | `/courses/:idOrSlug` | public | Detail with lessons, quizzes, live classes. Video URLs only if you have access (or preview). Includes `enrolled`, `hasAccess`, `isOwner`, `progress` |
| POST | `/courses` | instructor | JSON or multipart (`thumbnail`): `title, subtitle, description, category, level, priceCents` |
| PUT | `/courses/:id` | owner | Same fields (partial) |
| POST | `/courses/:id/publish` | owner | `{ published: boolean }` (needs ≥1 lesson) |
| DELETE | `/courses/:id` | owner | Not allowed once it has paying students |
| GET | `/courses/:id/progress` | student | Progress object |

## Lessons & video

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/lessons/course/:courseId` | owner | `{ title, content?, isPreview?, position? }` |
| PUT | `/lessons/:id` | owner | partial update |
| DELETE | `/lessons/:id` | owner | |
| POST | `/lessons/:id/video` | owner | multipart `video` (≤ 2 GB) → `202 { status: "UPLOADED", jobId }` |
| GET | `/lessons/:id/status` | owner | `{ videoStatus, progress (0-100), hlsUrl, durationSec, videoError }` |
| POST | `/lessons/:id/progress` | enrolled | `{ watchedSec, completed? }` → course progress |

## Quizzes

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/quizzes/course/:courseId` | owner | `{ title, lessonId?, passPercent, questions: [{ text, options[2-6], correctIndex, explanation? }] }` |
| PUT | `/quizzes/:id` | owner | Replace quiz + questions |
| DELETE | `/quizzes/:id` | owner | |
| GET | `/quizzes/:id` | enrolled / owner | Questions (without answers for students) + my attempts |
| POST | `/quizzes/:id/attempts` | enrolled | `{ answers: number[] }` → `{ score, passed, correct, total, feedback[], progress }` |

## Live classes

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/live/course/:courseId` | owner | `{ title, scheduledAt }` |
| GET | `/live/course/:courseId` | enrolled / owner | list |
| GET | `/live/:id` | enrolled / owner | class + last 200 chat messages + `isHost` |
| PATCH | `/live/:id/status` | owner | `{ status: LIVE \| ENDED }` (broadcast over Socket.io) |
| POST | `/live/:id/token` | enrolled / owner | `{ token, url, isHost }` LiveKit access token |

**Socket.io** (same host/port): connect with `auth: { token }`.
Client → server: `live:join (liveClassId, ack)`, `chat:send ({ liveClassId, text })`.
Server → client: `chat:message`, `live:status`, `presence`, `presence:count`.

## Enrollment & payments

| Method | Path | Notes |
|---|---|---|
| POST | `/enroll/:courseId` | Free → `{ enrolled: true }` · Paid → `{ checkoutUrl }` (Stripe test) · Mock mode → enrolled immediately |
| POST | `/enroll/webhook` | Stripe webhook (`checkout.session.completed`) |

## Certificates

| Method | Path | Notes |
|---|---|---|
| GET | `/certificates` | My certificates |
| GET | `/certificates/course/:courseId/pdf` | Issues (if course complete) and downloads PDF; 400 with what's missing otherwise |
| GET | `/certificates/verify/:code` | Public verification |

## Instructor & admin

| Method | Path | Notes |
|---|---|---|
| GET | `/instructor/dashboard` | totals, monthly earnings (12 months), per-course stats, recent sales |
| GET | `/admin/stats` | platform stats incl. video jobs processing/failed |
| GET | `/admin/users` | users |
| PATCH | `/admin/users/:id/role` | `{ role }` |
