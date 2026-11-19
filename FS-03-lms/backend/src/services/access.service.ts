import { prisma } from '../lib/prisma';
import { AuthUser } from '../middleware/auth';
import { HttpError } from '../utils/http';

/** Throws unless the user is the course's instructor or an admin. */
export async function assertCourseOwner(courseId: string, user: AuthUser) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new HttpError(404, 'Course not found');
  if (user.role !== 'ADMIN' && course.instructorId !== user.id) throw new HttpError(403, 'Only the course instructor can do this');
  return course;
}

/** True if the user may watch the course content (enrolled, its instructor, or admin). */
export async function canAccessCourse(courseId: string, user?: AuthUser) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true } });
  if (course?.instructorId === user.id) return true;
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  return Boolean(enrollment);
}

export async function assertCourseAccess(courseId: string, user?: AuthUser) {
  if (!(await canAccessCourse(courseId, user))) throw new HttpError(403, 'Enroll in this course to access it');
}
