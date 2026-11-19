import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, byRole, courses, published, enrollments, revenue, videosProcessing, videosFailed] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.course.count(),
      prisma.course.count({ where: { published: true } }),
      prisma.enrollment.count(),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true, platformFeeCents: true } }),
      prisma.lesson.count({ where: { videoStatus: { in: ['UPLOADED', 'PROCESSING'] } } }),
      prisma.lesson.count({ where: { videoStatus: 'FAILED' } }),
    ]);
    res.json({
      users,
      byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count])),
      courses,
      published,
      enrollments,
      revenueCents: revenue._sum.amountCents ?? 0,
      platformFeesCents: revenue._sum.platformFeeCents ?? 0,
      videosProcessing,
      videosFailed,
    });
  }),
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { enrollments: true, coursesTaught: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ users });
  }),
);

router.patch(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = z.object({ role: z.enum(['STUDENT', 'INSTRUCTOR', 'ADMIN']) }).parse(req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { role }, select: { id: true, role: true } });
    res.json({ user });
  }),
);

export default router;
