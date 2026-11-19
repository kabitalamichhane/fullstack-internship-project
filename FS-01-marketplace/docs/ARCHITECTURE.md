# FS-01 Architecture

## System overview

```mermaid
flowchart LR
  subgraph Client
    C[Customer]:::u
    V[Vendor]:::u
    A[Admin]:::u
    FE[React + TypeScript SPA<br/>Vercel]
  end
  C & V & A --> FE
  FE -- REST / JSON + JWT --> API[Express API<br/>Node.js · Render]
  API -- Prisma ORM --> PG[(PostgreSQL<br/>users, products, orders)]
  API -- cart, sessions, cache --> R[(Redis)]
  API -- index + search --> ES[(Elasticsearch<br/>products index)]
  API -- product images --> S3[(AWS S3 / MinIO)]
  API -- Checkout + Connect transfers --> ST[Stripe]
  ST -- webhook --> API
  classDef u fill:#eef6ff,stroke:#2563eb
```

## Roles

| Role | Can do |
|---|---|
| Customer | Search, view products, cart, checkout, pay, track orders, cancel, download invoices, review delivered products |
| Vendor | Store profile, Stripe payout onboarding, product CRUD + images, fulfil orders (pack/ship/deliver), see earnings |
| Admin | Analytics, approve/suspend vendors, manage coupons and categories, view all orders |

## Database schema

```mermaid
erDiagram
  User ||--o| Vendor : "owns store"
  User ||--o{ Order : places
  User ||--o{ Review : writes
  Vendor ||--o{ Product : sells
  Category ||--o{ Product : groups
  Product ||--o{ Review : has
  Order ||--|{ VendorOrder : "split per vendor"
  Vendor ||--o{ VendorOrder : fulfils
  VendorOrder ||--|{ OrderItem : contains
  Product ||--o{ OrderItem : "sold as"

  User {
    string id PK
    string email UK
    string name
    string passwordHash
    enum role
  }
  Vendor {
    string id PK
    string userId FK
    string storeName UK
    bool approved
    string stripeAccountId
  }
  Category {
    string id PK
    string name
    string slug UK
  }
  Product {
    string id PK
    string vendorId FK
    string categoryId FK
    string title
    int priceCents
    int stock
    string[] images
    float ratingAvg
  }
  Order {
    string id PK
    string userId FK
    enum status
    int subtotalCents
    int discountCents
    int totalCents
    string couponCode
    json shippingAddress
  }
  VendorOrder {
    string id PK
    string orderId FK
    string vendorId FK
    enum status
    int subtotalCents
    int commissionCents
    int vendorPayoutCents
    string transferId
  }
  OrderItem {
    string id PK
    string vendorOrderId FK
    string productId FK
    int unitPriceCents
    int quantity
  }
  Review {
    string id PK
    string productId FK
    string userId FK
    int rating
    string comment
  }
  Coupon {
    string id PK
    string code UK
    enum type
    int value
    int minOrderCents
    int maxUses
    int usedCount
    datetime expiresAt
  }
```

**Design decisions**

- **Money as integers (cents).** Avoids floating-point rounding errors in totals and commission.
- **Order → VendorOrder split.** A single customer order can contain products from several vendors. Each vendor packs and ships separately and is paid separately, so each vendor gets its own sub-order with its own status, commission and payout.
- **Price snapshot in OrderItem.** Title and unit price are copied at purchase time so later product edits don't change past orders or invoices.
- **PostgreSQL is the source of truth; Elasticsearch is a search copy.** Every product change calls `indexProduct()`; `npm run reindex` rebuilds the index from scratch.

## Checkout & split payment flow

```mermaid
sequenceDiagram
  participant FE as React app
  participant API as Express API
  participant R as Redis
  participant DB as PostgreSQL
  participant S as Stripe
  FE->>API: POST /orders/checkout (address, coupon)
  API->>R: read cart:{userId}
  API->>DB: transaction: reserve stock, create Order + VendorOrders
  API->>S: create Checkout Session (transfer_group = orderId)
  API-->>FE: checkoutUrl
  FE->>S: customer pays (test card)
  S->>API: webhook checkout.session.completed
  API->>DB: Order PLACED, coupon usedCount+1
  API->>R: clear cart
  loop each vendor
    API->>S: transfers.create(vendorPayout → vendor account)
  end
  Note over API,S: Platform keeps the commission (default 10%)
```

## Order lifecycle

```mermaid
stateDiagram-v2
  [*] --> PENDING_PAYMENT: checkout
  PENDING_PAYMENT --> PLACED: payment succeeded
  PENDING_PAYMENT --> CANCELLED: payment expired / cancelled
  PLACED --> PACKED: vendor
  PLACED --> CANCELLED: customer or vendor
  PACKED --> SHIPPED: vendor
  PACKED --> CANCELLED: vendor
  SHIPPED --> DELIVERED: vendor
  DELIVERED --> [*]
```

## Redis usage

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `session:{sid}` | string (JSON) | Logged-in session, allows logout/revocation | 7 days |
| `cart:{userId}` | hash productId → qty | Shopping cart | 30 days |
| `product:{id}` | string (JSON) | Product detail cache | 60 s |
| `categories` | string (JSON) | Category list cache | 5 min |

## Security

- Passwords hashed with bcrypt; JWT signed with `JWT_SECRET`; sessions revocable in Redis.
- Role checks on every protected route; vendors can only touch their own products and orders.
- All input validated with Zod; uploads limited to images ≤ 5 MB.
- Helmet security headers, CORS restricted to `CLIENT_URL`, rate limit on `/api/auth`.
- Stripe webhooks verified by signature. Secrets only in `.env` (never committed).
