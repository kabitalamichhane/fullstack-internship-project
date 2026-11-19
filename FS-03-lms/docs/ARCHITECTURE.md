# FS-03 Architecture

## System overview

```mermaid
flowchart LR
  subgraph Browser
    FE[React SPA<br/>hls.js · Chart.js · LiveKit UI]
  end
  FE -- REST + JWT --> API[Express API]
  FE <-- Socket.io chat --> API
  FE <-- WebRTC audio/video --> LK[LiveKit SFU]
  FE -- HLS segments --> CF[CloudFront CDN]
  CF --> S3[(S3 bucket<br/>raw/ · hls/ · thumbnails/)]
  API -- Prisma --> PG[(PostgreSQL)]
  API -- sessions --> R[(Redis)]
  API -- enqueue job --> Q[[BullMQ queue<br/>in Redis]]
  Q --> W[Video worker<br/>FFmpeg]
  W -- download raw / upload HLS --> S3
  W -- status, duration, URL --> PG
  API -- signed token --> LK
  API -- Checkout --> ST[Stripe]
  ST -- webhook --> API
```

The API never processes video itself: uploads are handed to a **separate worker process** through a **BullMQ** queue, so a long FFmpeg job can't slow down normal requests, and you can scale workers independently.

## Database schema

```mermaid
erDiagram
  User ||--o{ Course : teaches
  User ||--o{ Enrollment : has
  Course ||--o{ Enrollment : has
  Course ||--o{ Lesson : contains
  Course ||--o{ Quiz : contains
  Lesson |o--o{ Quiz : "optional placement"
  Quiz ||--o{ Question : has
  Quiz ||--o{ QuizAttempt : graded
  User ||--o{ QuizAttempt : takes
  User ||--o{ LessonProgress : tracks
  Lesson ||--o{ LessonProgress : tracked
  Course ||--o{ LiveClass : schedules
  LiveClass ||--o{ ChatMessage : has
  User ||--o{ ChatMessage : writes
  User ||--o{ Certificate : earns
  Course ||--o{ Certificate : awards
  User ||--o{ Payment : pays
  Course ||--o{ Payment : sold

  User {
    string id PK
    string email UK
    enum role "STUDENT|INSTRUCTOR|ADMIN"
  }
  Course {
    string id PK
    string instructorId FK
    string slug UK
    int priceCents
    bool published
  }
  Lesson {
    string id PK
    string courseId FK
    int position
    enum videoStatus "NONE|UPLOADED|PROCESSING|READY|FAILED"
    string hlsUrl
    int durationSec
    bool isPreview
  }
  Enrollment {
    string userId FK
    string courseId FK
    datetime completedAt
  }
  LessonProgress {
    string userId FK
    string lessonId FK
    int watchedSec
    bool completed
  }
  Quiz {
    string id PK
    string courseId FK
    string lessonId FK
    int passPercent
  }
  Question {
    string quizId FK
    string text
    string[] options
    int correctIndex
  }
  QuizAttempt {
    string quizId FK
    string userId FK
    int[] answers
    int score
    bool passed
  }
  LiveClass {
    string id PK
    string courseId FK
    string roomName UK
    enum status "SCHEDULED|LIVE|ENDED"
  }
  ChatMessage {
    string liveClassId FK
    string userId FK
    string text
  }
  Certificate {
    string code UK
    string userId FK
    string courseId FK
  }
  Payment {
    string userId FK
    string courseId FK
    int amountCents
    int platformFeeCents
    int instructorEarningCents
    enum status
  }
```

## Video pipeline (upload → FFmpeg → CloudFront)

```mermaid
sequenceDiagram
  participant I as Instructor (browser)
  participant API as Express API
  participant S3 as S3
  participant Q as BullMQ (Redis)
  participant W as Worker (FFmpeg)
  participant DB as PostgreSQL
  participant CF as CloudFront
  participant St as Student (hls.js)
  I->>API: POST /lessons/:id/video (multipart, progress bar)
  API->>S3: upload raw/{lessonId}/... (multipart stream)
  API->>DB: videoStatus = UPLOADED
  API->>Q: add job {lessonId, rawKey}
  API-->>I: 202 Accepted
  Q->>W: job
  W->>DB: PROCESSING
  W->>S3: download raw file
  W->>W: ffprobe (duration, audio?) + ffmpeg → HLS 360p/720p + master.m3u8
  W->>S3: upload hls/{lessonId}/{version}/... (Cache-Control immutable)
  W->>DB: READY, hlsUrl = CDN/.../master.m3u8, durationSec
  I->>API: GET /lessons/:id/status (polling, shows %)
  St->>CF: GET master.m3u8 + segments
  CF->>S3: cache miss only
```

**FFmpeg output** (tested on sample videos with and without audio):

```
hls/{lessonId}/{version}/master.m3u8
hls/{lessonId}/{version}/v360p/index.m3u8, seg_000.ts, seg_001.ts …
hls/{lessonId}/{version}/v720p/index.m3u8, seg_000.ts, …
```

The player starts at the quality the bandwidth allows and switches automatically (adaptive bitrate).

## Live class

```mermaid
sequenceDiagram
  participant H as Instructor
  participant API
  participant LK as LiveKit
  participant S as Student
  H->>API: PATCH /live/:id/status {LIVE}
  API-->>S: socket "live:status" LIVE
  H->>API: POST /live/:id/token
  API-->>H: JWT (canPublish = true)
  H->>LK: connect + publish camera/mic/screen
  S->>API: POST /live/:id/token
  API-->>S: JWT (subscribe only)
  S->>LK: connect + receive stream
  S->>API: socket chat:send
  API->>API: save ChatMessage
  API-->>H: chat:message (to everyone in the room)
```

## Completion & certificate rules

- A lesson is **completed** when the student watched ≥ 90% of it, or clicked "Mark as complete".
- A course is **complete** when every lesson is completed **and** every quiz has at least one passing attempt.
- On completion `Enrollment.completedAt` is set; the certificate is created once (unique per user + course) with a random public code.

## Payments

`revenueSplit(price, PLATFORM_FEE_PERCENT)` → platform fee + instructor earning, stored on each `Payment`. Stripe Checkout (test mode) handles the card; the `checkout.session.completed` webhook marks the payment PAID and creates the enrollment (idempotent). Instructor payouts are reported on the dashboard. Stripe Connect transfers (as in FS-01) can be added for automatic payouts.

## Security

- bcrypt passwords, JWT + Redis sessions (revocable), role checks on every route, ownership checks (`assertCourseOwner`, `assertCourseAccess`).
- Lesson video URLs and notes are only returned to enrolled students, the instructor, or for preview lessons.
- Quiz answers are graded server-side; `correctIndex` is never sent to students before submission.
- LiveKit tokens are short-lived and scoped to one room; only the host can publish.
- Socket.io connections require a valid JWT and course access to join a room.
- Zod validation everywhere, upload type/size limits, Helmet, CORS, rate limiting on auth, Stripe webhook signature check.
