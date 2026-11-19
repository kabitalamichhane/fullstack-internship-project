import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { assertCourseAccess, assertCourseOwner } from '../services/access.service';
import { uploadFile } from '../lib/s3';
import { transcodeQueue } from '../lib/queue';
import { getCourseProgress } from '../services/progress.service';
import { isWatched } from '../utils/learning';

const router = Router();

// Videos are streamed to a temp file on disk (not memory), then uploaded to S3.
const videoUpload = multer({
  dest: path.join(os.tmpdir(), 'lms-uploads'),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, f, cb) => cb(null, f.mimetype.startsWith('video/')),
});

const lessonSchema = z.object({
  title: z.string().min(2).max(150),
  content: z.string().max(20000).optional(),
  isPreview: z.boolean().optional(),
  position: z.number().int().min(1).optional(),
});

router.post(
  '/course/:courseId',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.courseId, req.user!);
    const data = lessonSchema.parse(req.body);
    const last = await prisma.lesson.findFirst({ where: { courseId: req.params.courseId }, orderBy: { position: 'desc' } });
    const lesson = await prisma.lesson.create({
      data: { ...data, courseId: req.params.courseId, position: data.position ?? (last?.position ?? 0) + 1 },
    });
    res.status(201).json({ lesson });
  }),
);

async function ownLesson(id: string, user: Express.Request['user']) {
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson) throw new HttpError(404, 'Lesson not found');
  await assertCourseOwner(lesson.courseId, user!);
  return lesson;
}

router.put(
  '/:id',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await ownLesson(req.params.id, req.user);
    const lesson = await prisma.lesson.update({ where: { id: req.params.id }, data: lessonSchema.partial().parse(req.body) });
    res.json({ lesson });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await ownLesson(req.params.id, req.user);
    await prisma.lesson.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

/**
 * Upload a lesson video: saves the original to S3 (raw/), then queues a BullMQ job.
 * The worker converts it to HLS with FFmpeg; the client polls GET /lessons/:id/status.
 */
router.post(
  '/:id/video',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  videoUpload.single('video'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, 'Attach a video file in the "video" field');
    try {
      const lesson = await ownLesson(req.params.id, req.user);
      const rawKey = `raw/${lesson.id}/${Date.now()}${path.extname(file.originalname).toLowerCase() || '.mp4'}`;
      await uploadFile(file.path, rawKey, file.mimetype);
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: { rawVideoKey: rawKey, videoStatus: 'UPLOADED', videoError: null },
      });
      const job = await transcodeQueue().add('transcode', { lessonId: lesson.id, rawKey }, { jobId: `${lesson.id}-${Date.now()}` });
      res.status(202).json({ status: 'UPLOADED', jobId: job.id });
    } finally {
      await fs.rm(file.path, { force: true });
    }
  }),
);

/** Processing status + progress % for the instructor UI. */
router.get(
  '/:id/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id }, select: { id: true, videoStatus: true, hlsUrl: true, videoError: true, durationSec: true, courseId: true } });
    if (!lesson) throw new HttpError(404, 'Lesson not found');
    await assertCourseOwner(lesson.courseId, req.user!);
    let progress = lesson.videoStatus === 'READY' ? 100 : 0;
    if (lesson.videoStatus === 'PROCESSING' || lesson.videoStatus === 'UPLOADED') {
      const jobs = await transcodeQueue().getJobs(['active', 'waiting'], 0, 50);
      const job = jobs.find((j) => j.data.lessonId === lesson.id);
      progress = typeof job?.progress === 'number' ? job.progress : 0;
    }
    res.json({ ...lesson, progress });
  }),
);

const progressSchema = z.object({ watchedSec: z.number().int().min(0), completed: z.boolean().optional() });

/** Save watch progress. Lessons auto-complete at 90% watched (or when the student clicks "mark complete"). */
router.post(
  '/:id/progress',
  authenticate,
  asyncHandler(async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson) throw new HttpError(404, 'Lesson not found');
    await assertCourseAccess(lesson.courseId, req.user);
    const { watchedSec, completed } = progressSchema.parse(req.body);
    const existing = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: req.user!.id, lessonId: lesson.id } } });
    const maxWatched = Math.max(existing?.watchedSec ?? 0, watchedSec);
    const done = Boolean(existing?.completed || completed || isWatched(maxWatched, lesson.durationSec));
    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: req.user!.id, lessonId: lesson.id } },
      create: { userId: req.user!.id, lessonId: lesson.id, watchedSec: maxWatched, completed: done },
      update: { watchedSec: maxWatched, completed: done },
    });
    res.json(await getCourseProgress(req.user!.id, lesson.courseId));
  }),
);

export default router;
