import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { assertCourseAccess, assertCourseOwner } from '../services/access.service';
import { gradeQuiz } from '../utils/learning';
import { getCourseProgress } from '../services/progress.service';

const router = Router();
router.use(authenticate);

const quizSchema = z.object({
  title: z.string().min(2).max(150),
  lessonId: z.string().nullable().optional(),
  passPercent: z.number().int().min(1).max(100).default(70),
  questions: z
    .array(
      z
        .object({
          text: z.string().min(3),
          options: z.array(z.string().min(1)).min(2).max(6),
          correctIndex: z.number().int().min(0),
          explanation: z.string().optional(),
        })
        .refine((q) => q.correctIndex < q.options.length, { message: 'correctIndex must point to one of the options' }),
    )
    .min(1),
});

/** Instructor creates a quiz with its questions in one request. */
router.post(
  '/course/:courseId',
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.courseId, req.user!);
    const data = quizSchema.parse(req.body);
    const quiz = await prisma.quiz.create({
      data: {
        courseId: req.params.courseId,
        lessonId: data.lessonId ?? null,
        title: data.title,
        passPercent: data.passPercent,
        questions: { create: data.questions.map((q, i) => ({ ...q, position: i + 1 })) },
      },
      include: { questions: true },
    });
    res.status(201).json({ quiz });
  }),
);

/** Replace a quiz's questions. */
router.put(
  '/:id',
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.quiz.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Quiz not found');
    await assertCourseOwner(existing.courseId, req.user!);
    const data = quizSchema.parse(req.body);
    const quiz = await prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { quizId: existing.id } });
      return tx.quiz.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          lessonId: data.lessonId ?? null,
          passPercent: data.passPercent,
          questions: { create: data.questions.map((q, i) => ({ ...q, position: i + 1 })) },
        },
        include: { questions: true },
      });
    });
    res.json({ quiz });
  }),
);

router.delete(
  '/:id',
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id } });
    if (!quiz) throw new HttpError(404, 'Quiz not found');
    await assertCourseOwner(quiz.courseId, req.user!);
    await prisma.quiz.delete({ where: { id: quiz.id } });
    res.json({ ok: true });
  }),
);

/** Take a quiz. Students never receive the correct answers before submitting. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { position: 'asc' } }, course: { select: { instructorId: true, title: true } } },
    });
    if (!quiz) throw new HttpError(404, 'Quiz not found');
    await assertCourseAccess(quiz.courseId, req.user);
    const isOwner = quiz.course.instructorId === req.user!.id || req.user!.role === 'ADMIN';
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: quiz.id, userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, score: true, passed: true, createdAt: true },
    });
    res.json({
      quiz: {
        ...quiz,
        questions: quiz.questions.map((q) => (isOwner ? q : { id: q.id, text: q.text, options: q.options, position: q.position })),
      },
      attempts,
    });
  }),
);

/** Submit answers → auto-graded immediately, with per-question feedback and explanations. */
router.post(
  '/:id/attempts',
  asyncHandler(async (req, res) => {
    const { answers } = z.object({ answers: z.array(z.number().int()) }).parse(req.body);
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id }, include: { questions: { orderBy: { position: 'asc' } } } });
    if (!quiz) throw new HttpError(404, 'Quiz not found');
    await assertCourseAccess(quiz.courseId, req.user);
    if (answers.length !== quiz.questions.length) throw new HttpError(400, `Answer all ${quiz.questions.length} questions`);

    const result = gradeQuiz(quiz.questions, answers, quiz.passPercent);
    const attempt = await prisma.quizAttempt.create({
      data: { quizId: quiz.id, userId: req.user!.id, answers, score: result.score, passed: result.passed },
    });
    res.status(201).json({
      attemptId: attempt.id,
      ...result,
      passPercent: quiz.passPercent,
      feedback: result.results.map((r, i) => ({ ...r, explanation: quiz.questions[i].explanation })),
      progress: await getCourseProgress(req.user!.id, quiz.courseId),
    });
  }),
);

export default router;
