# FS-01 Testing

Run: `cd backend && npm test` (Vitest + Supertest)

## Automated tests

| File | What it checks |
|---|---|
| `tests/pricing.test.ts` | Coupon rules (percent, fixed, cap at subtotal, expired/inactive/used-up/min-order), multi-vendor commission split (discount shared proportionally, **money always adds up**: `discount + commission + payout = subtotal` for every vendor), order status state machine, combined status from vendor shipments |
| `tests/api.test.ts` | Health endpoint, 401 on every protected route without a token, invalid JWT rejected, registration validation (400), unknown route 404 |

### Latest results (run in this workspace)

```
Test Files  2 passed (2)
Tests       12 passed (12)
```

## Manual end-to-end test checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Register as customer and as vendor | Token returned; vendor lands on dashboard with "awaiting approval" |
| 2 | Admin approves the vendor | Vendor's products appear in search |
| 3 | Vendor adds a product with 3 images | Images visible (served from S3/MinIO) and product searchable within ~1s |
| 4 | Search "phone", filter price $100–$500, sort price ↑ | Only matching products, correct order |
| 5 | Stop Elasticsearch, search again | Results still returned (`source: "database"`) |
| 6 | Add items from 2 vendors to cart, reload the page | Cart persists (Redis) |
| 7 | Apply `WELCOME10` at checkout | 10% discount shown and charged |
| 8 | Pay with `4242 4242 4242 4242` | Order becomes PLACED, cart cleared, 2 vendor shipments, each vendor sees payout = sale − 10% |
| 9 | Vendor marks PACKED → SHIPPED → DELIVERED | Customer's tracker updates; skipping a step is rejected |
| 10 | Customer reviews the delivered product | Rating average updates; reviewing an undelivered product is rejected (403) |
| 11 | Download invoice | PDF with items per vendor, discount and total |
| 12 | Two customers buy the last item at the same time | Only one succeeds; the other gets "just sold out" (409) |
| 13 | Customer opens `/admin` | "You don't have access" (and API returns 403) |
| 14 | Admin analytics | GMV, commission and daily revenue match the orders placed |

## Performance notes (fill in with your measurements)

| Measurement | How to measure | Result |
|---|---|---|
| Search latency (ES) | `curl -w "%{time_total}" "localhost:4000/api/search?q=phone"` | _e.g. 25 ms_ |
| Product page (cache hit vs miss) | Call `/api/products/:id` twice | _e.g. 40 ms → 4 ms_ |
| Load test | `npx autocannon -c 50 -d 20 localhost:4000/api/search?q=shirt` | _req/s, p95_ |
