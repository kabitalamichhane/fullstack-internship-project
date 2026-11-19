# Full-Stack Development Internship — Final Projects

This repository contains both projects for the Full-Stack Development specialization track.

| Code | Project | Folder |
|---|---|---|
| **FS-01** | Multi-Vendor E-Commerce Marketplace (*Nexmart*) | [`FS-01-marketplace/`](FS-01-marketplace) |
| **FS-03** | Learning Management System with Live Classes (*LearnHub*) | [`FS-03-lms/`](FS-03-lms) |

Both projects use **React + TypeScript + Tailwind** on the front end and **Node.js + Express + PostgreSQL + Prisma** on the back end, run fully in **Docker**, and deploy front end and back end separately.

---

## FS-01 · Multi-Vendor Marketplace

An Amazon-style marketplace where vendors sell, customers buy, and the platform splits each payment and earns a commission.

- JWT auth with **customer / vendor / admin** roles (sessions in Redis)
- Vendor onboarding, product CRUD with **S3** image upload
- **Elasticsearch** search with filters, sorting, facets (PostgreSQL fallback)
- **Redis** cart and caching; order lifecycle *placed → packed → shipped → delivered*
- **Stripe Connect** (test mode) split payments: one payment, one transfer per vendor minus commission
- Verified-purchase reviews, coupons, **PDF invoices**, admin analytics

→ [README](FS-01-marketplace/README.md) · [Architecture](FS-01-marketplace/docs/ARCHITECTURE.md) · [API](FS-01-marketplace/docs/API.md) · [Tests](FS-01-marketplace/docs/TESTING.md)

## FS-03 · Learning Management System

A full online school with video courses, live classes, quizzes, certificates and instructor earnings.

- **Student / instructor / admin** roles; course, lesson and enrollment schema
- Video upload → **BullMQ** job → **FFmpeg** adaptive HLS (360p/720p) → S3 → **CloudFront**
- Auto-graded quizzes, watch-progress tracking, completion rules
- Live classes over **LiveKit (WebRTC)** with **Socket.io** chat
- **PDF certificates** with public verification
- **Stripe** test-mode payments and a **Chart.js** instructor revenue dashboard

→ [README](FS-03-lms/README.md) · [Architecture](FS-03-lms/docs/ARCHITECTURE.md) · [API](FS-03-lms/docs/API.md) · [Tests](FS-03-lms/docs/TESTING.md) · [Deployment](FS-03-lms/docs/DEPLOYMENT.md)

---

## Quick start

Requirements: **Docker Desktop** (and Node.js 20+ for development mode).

```bash
# FS-01 → http://localhost:5173
cd FS-01-marketplace
docker compose up --build
docker compose exec api npx tsx prisma/seed.ts && docker compose exec api node dist/scripts/reindex.js

# FS-03 → http://localhost:5174   (different ports, both can run together)
cd FS-03-lms
docker compose up --build
docker compose exec api npx tsx prisma/seed.ts
```

Demo password for every seeded account: `Password123!` (accounts are listed in each project README).

## Live demo

| Project | Frontend | API |
|---|---|---|
| FS-01 | _add your Vercel URL_ | _add your Render URL_ |
| FS-03 | _add your Vercel URL_ | _add your Render URL_ |

Demo videos: _add links (Google Drive / YouTube unlisted)_

## Repository layout

```
.
├── FS-01-marketplace/     backend/ · frontend/ · docs/ · screenshots/ · docker-compose.yml
├── FS-03-lms/             backend/ · frontend/ · docs/ · screenshots/ · docker-compose.yml
└── docs/                  PRESENTATION.md (10-minute talk outline) · REFLECTION.md
```

## Running the tests

```bash
cd FS-01-marketplace/backend && npm install && npm test
cd FS-03-lms/backend && npm install && npm test
```

## Security note

Secrets live only in `.env` files, which are git-ignored. Each service ships an `.env.example` with safe placeholder values. Payments run in Stripe **test mode** only.
