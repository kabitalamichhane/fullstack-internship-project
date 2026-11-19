import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { slugify } from '../utils/learning';
import { uploadBuffer } from '../lib/s3';
import { assertCourseOwner, canAccessCourse } from '../services/access.service';
import { getCourseProgress } from '../services/progress.service';

const router = Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, f.mimetype.startsWith('image/')),
});

/** Public catalog: published courses with search, category and price filters. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ q: z.string().optional(), category: z.string().optional(), price: z.enum(['free', 'paid']).optional() })
      .parse(req.query);
    const where: Prisma.CourseWhereInput = {
      published: true,
      ...(q.q && { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] }),
      ...(q.category && { category: q.category }),
      ...(q.price === 'free' && { priceCents: 0 }),
      ...(q.price === 'paid' && { priceCents: { gt: 0 } }),
    };
    const courses = await prisma.course.findMany({
      where,
      include: { instructor: { select: { name: true } }, _count: { select: { lessons: true, enrollments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const categories = await prisma.course.findMany({ where: { published: true }, distinct: ['category'], select: { category: true } });
    res.json({ courses, categories: categories.map((c) => c.category) });
  }),
);

/** Student: my enrolled courses with progress. Instructor: my own courses. */
router.get(
  '/mine',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'INSTRUCTOR' || req.user!.role === 'ADMIN') {
      const courses = await prisma.course.findMany({
        where: req.user!.role === 'ADMIN' ? {} : { instructorId: req.user!.id },
        include: { _count: { select: { lessons: true, enrollments: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return res.json({ courses });
    }
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user!.id },
      include: { course: { include: { instructor: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const withProgress = await Promise.all(
      enrollments.map(async (e) => ({ ...e, progress: await getCourseProgress(req.user!.id, e.courseId) })),
    );
    res.json({ enrollments: withProgress });
  }),
);

/** Course detail. Lesson video URLs are only included for users with access (or free preview lessons). */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
      include: {
        instructor: { select: { id: true, name: true, bio: true } },
        lessons: { orderBy: { position: 'asc' } },
        quizzes: { select: { id: true, title: true, lessonId: true, passPercent: true, _count: { select: { questions: true } } } },
        liveClasses: { orderBy: { scheduledAt: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw new HttpError(404, 'Course not found');
    const hasAccess = await canAccessCourse(course.id, req.user);
    const isOwner = req.user?.id === course.instructorId || req.user?.role === 'ADMIN';
    if (!course.published && !isOwner) throw new HttpError(404, 'Course not found');

    const enrolled = req.user
      ? Boolean(await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: req.user.id, courseId: course.id } } }))
      : false;

    res.json({
      course: {
        ...course,
        lessons: course.lessons.map((l) => ({
          ...l,
          rawVideoKey: undefined,
          hlsUrl: hasAccess || l.isPreview ? l.hlsUrl : null,
          content: hasAccess || l.isPreview ? l.content : null,
        })),
      },
      enrolled,
      hasAccess,
      isOwner,
      progress: enrolled ? await getCourseProgress(req.user!.id, course.id) : null,
    });
  }),
);

const courseSchema = z.object({
  title: z.string().min(3).max(120),
  subtitle: z.string().max(200).optional(),
  description: z.string().min(10).max(10000),
  category: z.string().min(2).max(50).default('General'),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Beginner'),
  priceCents: z.coerce.number().int().min(0).default(0),
});

router.post(
  '/',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  imageUpload.single('thumbnail'),
  asyncHandler(async (req, res) => {
    const data = courseSchema.parse(req.body);
    const thumbnailUrl = req.file ? await uploadBuffer(req.file.buffer, 'thumbnails', req.file.originalname, req.file.mimetype) : undefined;
    const slug = `${slugify(data.title)}-${Math.random().toString(36).slice(2, 7)}`;
    const course = await prisma.course.create({ data: { ...data, slug, thumbnailUrl, instructorId: req.user!.id } });
    res.status(201).json({ course });
  }),
);

router.put(
  '/:id',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  imageUpload.single('thumbnail'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.id, req.user!);
    const data = courseSchema.partial().parse(req.body);
    const thumbnailUrl = req.file ? await uploadBuffer(req.file.buffer, 'thumbnails', req.file.originalname, req.file.mimetype) : undefined;
    const course = await prisma.course.update({ where: { id: req.params.id }, data: { ...data, ...(thumbnailUrl && { thumbnailUrl }) } });
    res.json({ course });
  }),
);

router.post(
  '/:id/publish',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.id, req.user!);
    const { published } = z.object({ published: z.boolean() }).parse(req.body);
    if (published) {
      const lessons = await prisma.lesson.count({ where: { courseId: req.params.id } });
      if (lessons === 0) throw new HttpError(400, 'Add at least one lesson before publishing');
    }
    res.json({ course: await prisma.course.update({ where: { id: req.params.id }, data: { published } }) });
  }),
);

router.delete(
  '/:id',
  authenticate,
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.id, req.user!);
    const sales = await prisma.payment.count({ where: { courseId: req.params.id, status: 'PAID' } });
    if (sales > 0) throw new HttpError(400, 'Courses with paying students cannot be deleted. Unpublish it instead.');
    await prisma.course.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/progress',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await getCourseProgress(req.user!.id, req.params.id));
  }),
);

export default router;
