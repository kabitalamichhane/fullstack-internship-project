# 10-Minute Final Presentation — Outline

**Slide deck:** [Final-Project-Presentation.pptx](./Final-Project-Presentation.pptx) (12 slides, with speaker notes).

Covers **problem, design, challenges, results, next steps** for both projects. Aim for ~12 slides; keep demos as short pre-recorded clips in case live demos fail.

| Time | Slide | What to say / show |
|---|---|---|
| 0:00 | **1. Title** | Your name, track (Full-Stack), the two projects |
| 0:30 | **2. Problems** | FS-01: small sellers need a shared storefront, and the platform has to split payments fairly. FS-03: teachers need one place for recorded videos, live classes, tests and getting paid |
| 1:15 | **3. Tech stack** | React/TS/Tailwind · Express/Prisma/PostgreSQL · Redis · Docker; plus Elasticsearch/S3/Stripe Connect (FS-01) and BullMQ/FFmpeg/CloudFront/LiveKit (FS-03) |
| 1:45 | **4. FS-01 architecture** | `FS-01-marketplace/docs/diagrams/architecture.png`. Explain Postgres = source of truth, Elasticsearch = search copy, Redis = cart/sessions |
| 2:30 | **5. FS-01 key design: order split** | One Order → one VendorOrder per vendor; money in cents; commission split (show the sequence diagram) |
| 3:15 | **6. FS-01 demo (60–90 s)** | Search + filters → cart → coupon → pay with test card → vendor marks shipped → customer sees tracker → invoice PDF → admin analytics |
| 4:45 | **7. FS-03 architecture** | `FS-03-lms/docs/diagrams/architecture.png`. Why a separate worker + queue for video |
| 5:30 | **8. FS-03 video pipeline** | Upload → BullMQ → FFmpeg HLS 360p/720p → S3 → CloudFront; adaptive bitrate (show the network tab) |
| 6:15 | **9. FS-03 demo (60–90 s)** | Upload video with progress → watch → quiz with feedback → live class with chat → certificate + verify page → instructor Chart.js dashboard |
| 7:45 | **10. Challenges & how I solved them** | Pick 3 real ones, for example: race condition on the last item in stock (atomic `updateMany` with `stock >= qty`); Stripe webhooks arriving twice (idempotent handlers); FFmpeg failing on videos without audio (probe first, build args conditionally); keeping the search index in sync |
| 8:45 | **11. Results** | Test results (unit + API), performance numbers you measured (search latency, cache hit vs miss, transcode speed), features completed vs milestones |
| 9:30 | **12. Next steps** | e.g. Stripe Connect payouts for instructors, CloudFront signed cookies, recommendations, mobile app, CI/CD with GitHub Actions |

### Tips
- Practise with a timer; 10 minutes goes quickly. Two 90-second demos is the maximum.
- Have the deployed URLs and the recorded demo videos open in tabs before you start.
- Be ready for questions like: *Why Elasticsearch instead of SQL LIKE? Why HLS instead of MP4? How do you stop a student from getting quiz answers? What happens if the worker crashes mid-transcode?* (Answers are in each `docs/ARCHITECTURE.md`.)
