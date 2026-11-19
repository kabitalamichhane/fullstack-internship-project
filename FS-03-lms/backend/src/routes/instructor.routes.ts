import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate, requireRole('INSTRUCTOR', 'ADMIN'));

/**
 * Instructor revenue dashboard: totals, monthly earnings (for Chart.js),
 * per-course sales/students/completion rate and average quiz score.
 */
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const instructorId = req.user!.id;
    const courses = await prisma.course.findMany({
      where: { instructorId },
      select: { id: true, title: true, priceCents: true, published: true },
    });
    const courseIds = courses.map((c) => c.id);

    const [totals, perCourseRevenue, enrollCounts, completedCounts, quizAvg, monthly, recentSales] = await Promise.all([
      prisma.payment.aggregate({
        where: { courseId: { in: courseIds }, status: 'PAID' },
        _sum: { amountCents: true, instructorEarningCents: true, platformFeeCents: true },
        _count: true,
      }),
      prisma.payment.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courseIds }, status: 'PAID' },
        _sum: { instructorEarningCents: true },
        _count: true,
      }),
      prisma.enrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: true }),
      prisma.enrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds }, completedAt: { not: null } }, _count: true }),
      prisma.quizAttempt.aggregate({ where: { quiz: { courseId: { in: courseIds } } }, _avg: { score: true } }),
      prisma.$queryRaw<{ month: Date; earnings: bigint; sales: bigint }[]>`
        SELECT date_trunc('month', p."paidAt") AS month,
               SUM(p."instructorEarningCents") AS earnings,
               COUNT(*) AS sales
        FROM "Payment" p
        JOIN "Course" c ON c.id = p."courseId"
        WHERE c."instructorId" = ${instructorId} AND p.status = 'PAID'
          AND p."paidAt" >= now() - interval '12 months'
        GROUP BY 1 ORDER BY 1`,
      prisma.payment.findMany({
        where: { courseId: { in: courseIds }, status: 'PAID' },
        include: { user: { select: { name: true } }, course: { select: { title: true } } },
        orderBy: { paidAt: 'desc' },
        take: 10,
      }),
    ]);

    const find = <T extends { courseId: string }>(rows: T[], id: string) => rows.find((r) => r.courseId === id);
    const totalStudents = enrollCounts.reduce((s, e) => s + e._count, 0);

    res.json({
      totals: {
        grossCents: totals._sum.amountCents ?? 0,
        earningsCents: totals._sum.instructorEarningCents ?? 0,
        platformFeesCents: totals._sum.platformFeeCents ?? 0,
        sales: totals._count,
        students: totalStudents,
        courses: courses.length,
        avgQuizScore: Math.round(quizAvg._avg.score ?? 0),
      },
      monthly: monthly.map((m) => ({ month: m.month.toISOString().slice(0, 7), earningsCents: Number(m.earnings), sales: Number(m.sales) })),
      courses: courses.map((c) => {
        const students = find(enrollCounts, c.id)?._count ?? 0;
        const completed = find(completedCounts, c.id)?._count ?? 0;
        return {
          ...c,
          students,
          sales: find(perCourseRevenue, c.id)?._count ?? 0,
          earningsCents: find(perCourseRevenue, c.id)?._sum.instructorEarningCents ?? 0,
          completionRate: students ? Math.round((completed / students) * 100) : 0,
        };
      }),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        student: s.user.name,
        course: s.course.title,
        amountCents: s.amountCents,
        earningCents: s.instructorEarningCents,
        paidAt: s.paidAt,
      })),
    });
  }),
);

export default router;
