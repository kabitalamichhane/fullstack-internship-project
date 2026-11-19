import { prisma } from '../lib/prisma';
import { isCourseComplete, progressPercent } from '../utils/learning';

/** Full progress picture for one student in one course. Also stamps Enrollment.completedAt when finished. */
export async function getCourseProgress(userId: string, courseId: string) {
  const [lessons, quizzes, progress, passedAttempts, enrollment] = await Promise.all([
    prisma.lesson.findMany({ where: { courseId }, select: { id: true }, orderBy: { position: 'asc' } }),
    prisma.quiz.findMany({ where: { courseId }, select: { id: true } }),
    prisma.lessonProgress.findMany({ where: { userId, lesson: { courseId } } }),
    prisma.quizAttempt.findMany({ where: { userId, passed: true, quiz: { courseId } }, select: { quizId: true }, distinct: ['quizId'] }),
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
  ]);

  const completedLessonIds = progress.filter((p) => p.completed).map((p) => p.lessonId);
  const passedQuizIds = passedAttempts.map((a) => a.quizId);
  const complete = isCourseComplete(lessons.map((l) => l.id), completedLessonIds, quizzes.map((q) => q.id), passedQuizIds);

  if (complete && enrollment && !enrollment.completedAt) {
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: new Date() } });
  }

  return {
    totalLessons: lessons.length,
    completedLessons: completedLessonIds.length,
    percent: progressPercent(lessons.length, completedLessonIds.length),
    totalQuizzes: quizzes.length,
    passedQuizzes: passedQuizIds.length,
    completedLessonIds,
    passedQuizIds,
    lessonProgress: Object.fromEntries(progress.map((p) => [p.lessonId, { watchedSec: p.watchedSec, completed: p.completed }])),
    complete,
  };
}
