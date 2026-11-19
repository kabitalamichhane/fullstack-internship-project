# FS-01 · Multi-Vendor E-Commerce Marketplace (Nexmart)

An Amazon-style marketplace where many vendors sell, customers buy, and the platform splits each payment between vendors and earns a commission.

**Stack:** React · TypeScript · Tailwind CSS · Node.js · Express · PostgreSQL · Prisma · Redis · Elasticsearch · AWS S3 (MinIO locally) · Stripe Connect (test mode) · Docker

---

## Features

| Area | What it does |
|---|---|
| **Roles** | `CUSTOMER`, `VENDOR`, `ADMIN` with JWT auth and role-based access control (`requireRole` middleware). Sessions are stored in Redis so logout really revokes the token. |
| **Vendor onboarding** | Vendors sign up with a store name, edit their profile and logo, wait for admin approval, and connect a Stripe Express account for payouts. |
| **Products** | Full CRUD for vendors. Up to 6 images per product uploaded to **S3**. Sold products are soft-deleted to keep order history. |
| **Search** | **Elasticsearch** full-text search (fuzzy, title boosted) with filters (category, price range, minimum rating, in stock, vendor), sorting (relevance, price ↑/↓, newest, top-rated), pagination and category facets. Falls back to PostgreSQL if Elasticsearch is down. |
| **Cart** | Stored in **Redis** (`cart:{userId}` hash, 30-day TTL). Product details cached in Redis for 60s. |
| **Checkout** | Stock is reserved atomically, the order is split into one **VendorOrder per vendor**, the coupon discount is shared proportionally. |
| **Payments** | **Stripe Checkout + Stripe Connect** (test mode) with "separate charges and transfers": the customer pays the platform once, then each vendor receives a transfer for their share minus the platform commission (`PLATFORM_COMMISSION_PERCENT`, default 10%). Without a Stripe key the app runs in **mock payment mode** so it works out of the box. |
| **Order lifecycle** | `PENDING_PAYMENT → PLACED → PACKED → SHIPPED → DELIVERED` (or `CANCELLED`), enforced by a transition table. Vendors move their own shipment; the overall order status follows the slowest vendor. Cancelling restores stock and refunds. |
| **Reviews** | Verified-purchase reviews (only after delivery), one per customer per product; ratings are kept on the product and in the search index. |
| **Coupons** | Percent or fixed coupons with minimum order, usage limit and expiry. Admin creates them, customers apply them at checkout. |
| **PDF invoices** | Generated on the fly with PDFKit: `GET /api/orders/:id/invoice`. |
| **Admin analytics** | GMV, commission earned, paid orders, average order value, customers, vendors, daily revenue chart, orders by status, top products and top vendors. Vendor approval and coupon management. |
| **Deployment** | Frontend and backend are deployed **separately** (frontend → Vercel/Netlify, backend → Render/Railway with Docker). |

## Project structure

```
FS-01-marketplace/
├── backend/
│   ├── prisma/            schema.prisma, seed.ts
│   ├── src/
│   │   ├── lib/           prisma, redis, elastic, s3, stripe clients
│   │   ├── middleware/    auth (JWT + roles), error handler
│   │   ├── routes/        auth, vendor, product, search, cart, order, review, coupon, admin, webhook
│   │   ├── services/      cart, order (checkout + split payments), invoice (PDF)
│   │   ├── utils/         pricing (coupon, commission split, status rules), http helpers
│   │   └── scripts/       reindex.ts (rebuild Elasticsearch index)
│   ├── tests/             unit + API tests (Vitest + Supertest)
│   └── Dockerfile
├── frontend/              React + Vite + Tailwind app (customer, vendor and admin screens)
├── docs/                  ARCHITECTURE.md, API.md, TESTING.md
├── docker-compose.yml     Postgres, Redis, Elasticsearch, MinIO, API, web
└── render.yaml            Backend deployment blueprint
```

## Run locally

### Option A — everything with Docker

```bash
cd FS-01-marketplace
docker compose up --build
# in a second terminal, load demo data and build the search index:
docker compose exec api npx tsx prisma/seed.ts
docker compose exec api node dist/scripts/reindex.js
```

Open **http://localhost:5173** (API at http://localhost:4000/api, MinIO console at http://localhost:9001).

### Option B — run the code yourself (for development)

```bash
# 1. start only the infrastructure
docker compose up -d postgres redis elasticsearch minio create-bucket

# 2. backend
cd backend
cp .env.example .env
npm install
npx prisma db push      # create tables
npm run seed            # demo users, products (from DummyJSON) and coupons
npm run reindex         # copy products into Elasticsearch
npm run dev             # http://localhost:4000

# 3. frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

### Demo accounts (password `Password123!`)

| Email | Role |
|---|---|
| customer@demo.com | Customer |
| vendor1@demo.com | Vendor (TechHub) |
| vendor2@demo.com | Vendor (StyleCorner) |
| admin@demo.com | Admin |

Coupons: `WELCOME10` (10% off), `FLAT5` ($5 off orders over $25).

### Turning on real Stripe test payments

1. Create a free Stripe account and enable **Connect** in test mode.
2. Put your test secret key in `backend/.env` → `STRIPE_SECRET_KEY=sk_test_...`
3. Forward webhooks: `stripe listen --forward-to localhost:4000/api/webhooks/stripe` and copy the `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.
4. Log in as a vendor → **Connect payouts** → finish Stripe's test onboarding.
5. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.

## Tests

```bash
cd backend && npm test
```

Covers coupon rules, the multi-vendor commission split (money always adds up), the order status state machine and API access control. See [docs/TESTING.md](docs/TESTING.md).

## Deployment (front end and back end separately)

- **Backend → Render:** New → Blueprint → select this repo (uses `render.yaml`), or create a Docker web service from `FS-01-marketplace/backend`. Add managed PostgreSQL and Redis, an Elasticsearch host (Elastic Cloud free trial or Bonsai), an S3 bucket, and set the environment variables from `.env.example`.
- **Frontend → Vercel:** import the repo, root directory `FS-01-marketplace/frontend`, set `VITE_API_URL=https://<your-api>.onrender.com/api`. `vercel.json` handles SPA routing.
- Set `CLIENT_URL` on the backend to the Vercel URL (for CORS and Stripe redirects).

## Documentation

- [Architecture & database schema](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Testing](docs/TESTING.md)

## Data sources

Seed products come from the free **DummyJSON** API. Larger catalogues (Flipkart Products, Olist, Amazon Reviews 2023) can be imported with the same seed approach.
