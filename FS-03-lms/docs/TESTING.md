# FS-03 Testing

Run: `cd backend && npm test`

## Automated tests

| File | What it checks |
|---|---|
| `tests/learning.test.ts` | Quiz auto-grading (100%, fail below pass mark, pass exactly at threshold, skipped answers, per-question feedback), progress %, course-completion rule (all lessons **and** all quizzes), 90%-watched rule, revenue split adds up, slugs, FFmpeg HLS argument builder with and without audio |
| `tests/api.test.ts` | Health check, 401 on protected routes (dashboard, admin, certificates, quiz attempts, LiveKit token), registration validation |

### Latest results (run in this workspace)

```
Test Files  2 passed (2)
Tests       13 passed (13)
```

### FFmpeg pipeline check

The exact arguments produced by `buildHlsArgs()` were run through FFmpeg on two generated test clips (8 s 720p with audio, 5 s 720p without audio). Both produced:

```
master.m3u8
v360p/index.m3u8  seg_000.ts  seg_001.ts …
v720p/index.m3u8  seg_000.ts  …
```

with a master playlist listing 640×360 (~1.0 Mbps) and 1280×720 (~3.2 Mbps) variants.

> Add screenshots after running the manual end-to-end flows.

## Manual end-to-end checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Instructor creates a course, adds 3 lessons, publishes | Course appears in the catalog |
| 2 | Upload a 1–2 min MP4 to a lesson | Status UPLOADED → PROCESSING (with %) → READY; duration shown |
| 3 | Upload a non-video file / kill the worker mid-job | Rejected / job retried, then FAILED with the error shown |
| 4 | Student opens a non-preview lesson without enrolling | 🔒 locked, API returns no video URL |
| 5 | Student watches a lesson to the end | Lesson marked ✅, progress bar updates; reload resumes at the last position |
| 6 | DevTools → Network while playing | `.m3u8` + `.ts` requests from the CDN domain; quality switches when throttled to "Slow 3G" |
| 7 | Take the quiz and score 50% | Failed, correct answers + explanations shown, retry allowed |
| 8 | Retake and pass | Quiz ✅; with all lessons done, certificate button unlocks |
| 9 | Download certificate, open the verify link | PDF with name, course, date, ID; verify page says valid |
| 10 | Instructor goes live, student joins in another browser | Student sees and hears the instructor; cannot publish; chat works both ways and persists after reload |
| 11 | Instructor ends class | Student is disconnected, "class has ended" shown |
| 12 | Buy a paid course with `4242 4242 4242 4242` | Redirect back, enrolled within a few seconds; dashboard shows the sale with 80% earning |
| 13 | Student opens `/instructor` or calls `/api/admin/stats` | Access denied / 403 |

## Performance (fill in with your measurements)

| Measurement | How | Result |
|---|---|---|
| Transcode speed | 10-min 1080p video, `veryfast` preset, 1 worker | _e.g. ~1.5× real time_ |
| Time to first frame | DevTools Performance, cold vs CloudFront-cached | _ms_ |
| Catalog API latency | `autocannon -c 50 -d 20 localhost:5000/api/courses` | _req/s, p95_ |
| Live class | LiveKit dashboard: participants, bitrate, packet loss | _values_ |
