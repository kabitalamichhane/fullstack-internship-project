# FS-03 Deployment (front end and back end separately)

| Part | Where | Notes |
|---|---|---|
| Frontend (React) | **Vercel** or Netlify | Root `FS-03-lms/frontend`, env `VITE_API_URL=https://<api-host>` |
| API | **Render** web service (Docker) | Root `FS-03-lms/backend`, health check `/api/health` |
| Video worker | **Render** background worker (same Docker image) | Start command `node dist/worker.js` |
| PostgreSQL + Redis | Render managed (or Neon + Upstash) | `DATABASE_URL`, `REDIS_URL` |
| Media storage + CDN | **AWS S3 + CloudFront** | see below |
| Live video | **LiveKit Cloud** (free tier) | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Payments | Stripe test mode | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, webhook URL `https://<api-host>/api/enroll/webhook` |

`render.yaml` in this folder creates the API, the worker, Postgres and Redis in one step (New → Blueprint).

## S3 + CloudFront setup

1. **S3 bucket** (e.g. `learnhub-media`), Block Public Access **on** (CloudFront reads it privately).
2. **CORS** on the bucket (needed for hls.js):
   ```json
   [{ "AllowedOrigins": ["https://your-frontend.vercel.app"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. **CloudFront distribution** → origin = the S3 bucket, **Origin Access Control (OAC)** enabled, accept the suggested bucket policy.
   - Viewer protocol: Redirect HTTP to HTTPS
   - Cache policy: `CachingOptimized`; Origin request policy: `CORS-S3Origin`; Response headers policy: `SimpleCORS`
4. **IAM user** for the API/worker with `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::learnhub-media/*`.
5. Backend env:
   ```
   S3_REGION=ap-south-1
   S3_BUCKET=learnhub-media
   S3_ENDPOINT=            # leave empty for real AWS
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   CDN_BASE_URL=https://dxxxxxxxxxxxx.cloudfront.net
   ```

Every transcode is written to a new versioned folder (`hls/{lessonId}/{timestamp}/`), and segments are uploaded with `Cache-Control: public, max-age=31536000, immutable`. CloudFront can cache them forever, and replacing a video never serves stale files, so you never need a cache invalidation.

**Optional hardening:** use CloudFront **signed cookies** so only enrolled students can fetch segments. Issue the cookie from `/courses/:id` when `hasAccess` is true.

## LiveKit Cloud

Create a project at cloud.livekit.io → Settings → Keys → copy URL (`wss://…livekit.cloud`), API key and secret into the backend env. Nothing else is needed: the frontend receives the URL with the token.

## Checklist before submitting

- [ ] `CLIENT_URL` on the API = your Vercel URL (CORS, Socket.io, Stripe redirects, certificate verify link)
- [ ] Worker service is running (check its logs for `listening on queue "video-transcode"`)
- [ ] Upload a test video on production and confirm it plays from the CloudFront domain
- [ ] Stripe webhook endpoint added in the dashboard (test mode) with the `checkout.session.completed` event
- [ ] No `.env` file committed (`git status` should never show it)
