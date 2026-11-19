# FS-01 API Reference

Base URL: `http://localhost:4000/api` · Auth: `Authorization: Bearer <token>` · Money values are in **cents**.

Errors return `{ "error": "message", "details"?: {...} }` with a matching HTTP status (400 validation, 401 not logged in, 403 wrong role, 404, 409 conflict).

## Auth

| Method | Path | Role | Body / Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{ name, email, password, role: "CUSTOMER" \| "VENDOR", storeName? }` → `{ token, user }` |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | any | Revokes the session in Redis |
| GET | `/auth/me` | any | Current user (+ vendor profile) |

## Products & search

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/products/categories` | public | Category list (cached) |
| GET | `/products/:id` | public | Product with vendor and reviews (cached 60s) |
| POST | `/products` | vendor | multipart: `title, description, priceCents, stock, categoryId, isActive, images[]` |
| PUT | `/products/:id` | vendor (owner) | Same fields, plus `removeImages` (JSON array of URLs) |
| DELETE | `/products/:id` | vendor (owner), admin | Soft-deletes if already sold |
| GET | `/search` | public | `q, category, vendorId, minPrice, maxPrice, minRating, inStock, sort (relevance\|price_asc\|price_desc\|newest\|rating), page, pageSize` → `{ total, items, facets }` |

## Cart (Redis)

| Method | Path | Body |
|---|---|---|
| GET | `/cart` | → `{ items, subtotalCents, itemCount }` |
| POST | `/cart/items` | `{ productId, quantity }` (adds) |
| PUT | `/cart/items/:productId` | `{ quantity }` (0 removes) |
| DELETE | `/cart/items/:productId` | |
| DELETE | `/cart` | Clear cart |

## Orders & payments

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/coupons/validate` | customer | `{ code }` → `{ discountCents, totalCents }` |
| POST | `/orders/checkout` | customer | `{ shippingAddress, couponCode? }` → `{ orderId, checkoutUrl }` (`checkoutUrl` null in mock mode = already paid) |
| GET | `/orders` | customer | My orders |
| GET | `/orders/:id` | owner, vendor on order, admin | Order with vendor shipments |
| POST | `/orders/:id/cancel` | owner, admin | Only while `PENDING_PAYMENT` or `PLACED`; restores stock, refunds |
| GET | `/orders/:id/invoice` | owner, vendor, admin | PDF download |
| POST | `/webhooks/stripe` | Stripe | `checkout.session.completed`, `checkout.session.expired` |

## Vendor

| Method | Path | Notes |
|---|---|---|
| GET / PUT | `/vendor/me` | Store profile (PUT is multipart with optional `logo`) |
| POST | `/vendor/stripe/onboard` | Creates Stripe Express account → `{ url }` onboarding link |
| GET | `/vendor/products` | All my products |
| GET | `/vendor/orders` | My sub-orders (paid ones) |
| PATCH | `/vendor/orders/:id/status` | `{ status: PACKED \| SHIPPED \| DELIVERED \| CANCELLED }` (validated transitions) |
| GET | `/vendor/stats` | Orders, gross, payout, commission |

## Reviews

| Method | Path | Notes |
|---|---|---|
| GET | `/reviews/product/:productId` | public |
| POST | `/reviews/product/:productId` | customer who received the product · `{ rating 1-5, comment? }` (upsert) |
| DELETE | `/reviews/:id` | author or admin |

## Admin

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/analytics?days=30` | Totals, daily revenue, orders by status, top products, top vendors |
| GET | `/admin/vendors` | All vendors |
| PATCH | `/admin/vendors/:id` | `{ approved: boolean }` |
| GET | `/admin/orders` | Latest 100 orders |
| POST | `/admin/categories` | `{ name, slug }` |
| GET / POST | `/coupons` | List / create `{ code, type: PERCENT\|FIXED, value, minOrderCents, maxUses?, expiresAt? }` |
| PATCH / DELETE | `/coupons/:id` | Update / delete |

## Example

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"customer@demo.com","password":"Password123!"}' | jq -r .token)

curl "localhost:4000/api/search?q=phone&sort=price_asc&minRating=4"
curl -X POST localhost:4000/api/cart/items -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"productId":"<id>","quantity":1}'
```
