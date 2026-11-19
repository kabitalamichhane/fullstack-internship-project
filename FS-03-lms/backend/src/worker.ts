/**
 * Background video worker (BullMQ + FFmpeg). Run as a separate process: npm run dev:worker
 *
 * For each uploaded lesson video it:
 *  1. downloads the raw file from S3
 *  2. probes duration + audio track with ffprobe
 *  3. converts it to adaptive HLS (360p + 720p) with FFmpeg
 *  4. uploads the playlists and segments back to S3 under hls/{lessonId}/
 *  5. saves the CloudFront URL of master.m3u8 on the lesson and marks it READY
 */
import { Job, Worker } from 'bullmq';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { config } from './config';
import { prisma } from './lib/prisma';
import { createBullConnection } from './lib/redis';
import { TRANSCODE_QUEUE, TranscodeJob } from './lib/queue';
import { cdnUrl, downloadToFile, uploadFile } from './lib/s3';
import { buildHlsArgs } from './utils/learning';

const execFileAsync = promisify(execFile);

async function probe(file: string) {
  const { stdout } = await execFileAsync(config.ffprobePath, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file]);
  const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type: string }[] };
  return {
    durationSec: Math.round(Number(info.format?.duration ?? 0)),
    hasAudio: (info.streams ?? []).some((s) => s.codec_type === 'audio'),
  };
}

function runFfmpeg(args: string[], durationSec: number, job: Job) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, ['-progress', 'pipe:1', '-nostats', ...args]);
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      // ffmpeg -progress prints "out_time_ms=12345678" lines; turn them into a % for the job.
      const match = /out_time_ms=(\d+)/.exec(chunk.toString());
      if (match && durationSec > 0) {
        const pct = Math.min(99, Math.round((Number(match[1]) / 1e6 / durationSec) * 100));
        job.updateProgress(pct).catch(() => undefined);
      }
    });
    proc.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-500)}`))));
  });
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])));
  return files.flat();
}

async function processJob(job: Job<TranscodeJob>) {
  const { lessonId, rawKey } = job.data;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `lesson-${lessonId}-`));
  const input = path.join(work, 'input' + path.extname(rawKey));
  const outDir = path.join(work, 'hls');
  await fs.mkdir(outDir);

  try {
    await prisma.lesson.update({ where: { id: lessonId }, data: { videoStatus: 'PROCESSING', videoError: null } });
    await downloadToFile(rawKey, input);
    const { durationSec, hasAudio } = await probe(input);

    await runFfmpeg(buildHlsArgs(input, outDir, hasAudio), durationSec, job);

    const prefix = `hls/${lessonId}/${Date.now()}`; // versioned path so CloudFront never serves a stale playlist
    for (const file of await walk(outDir)) {
      const rel = path.relative(outDir, file).split(path.sep).join('/');
      const isPlaylist = file.endsWith('.m3u8');
      await uploadFile(
        file,
        `${prefix}/${rel}`,
        isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
        'public, max-age=31536000, immutable',
      );
    }

    await prisma.lesson.update({
      where: { id: lessonId },
      data: { videoStatus: 'READY', hlsUrl: cdnUrl(`${prefix}/master.m3u8`), durationSec },
    });
    await job.updateProgress(100);
    console.log(`[worker] lesson ${lessonId} ready (${durationSec}s, audio=${hasAudio})`);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

const worker = new Worker<TranscodeJob>(TRANSCODE_QUEUE, processJob, {
  connection: createBullConnection(),
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1), // FFmpeg is CPU heavy
});

worker.on('failed', async (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await prisma.lesson
      .update({ where: { id: job.data.lessonId }, data: { videoStatus: 'FAILED', videoError: err.message.slice(0, 500) } })
      .catch(() => undefined);
  }
});

console.log(`[worker] listening on queue "${TRANSCODE_QUEUE}"`);

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
