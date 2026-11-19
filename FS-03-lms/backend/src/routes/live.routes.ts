import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { AccessToken } from 'livekit-server-sdk';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler, HttpError } from '../utils/http';
import { assertCourseAccess, assertCourseOwner } from '../services/access.service';
import { getIo } from '../socket';

/**
 * Live classes use LiveKit (WebRTC SFU) for audio/video and Socket.io for chat.
 * The API never touches media — it only issues signed LiveKit access tokens.
 */
const router = Router();
router.use(authenticate);

router.post(
  '/course/:courseId',
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    await assertCourseOwner(req.params.courseId, req.user!);
    const data = z.object({ title: z.string().min(3).max(150), scheduledAt: z.coerce.date() }).parse(req.body);
    const live = await prisma.liveClass.create({
      data: { ...data, courseId: req.params.courseId, roomName: `course-${req.params.courseId}-${crypto.randomUUID().slice(0, 8)}` },
    });
    res.status(201).json({ liveClass: live });
  }),
);

router.get(
  '/course/:courseId',
  asyncHandler(async (req, res) => {
    await assertCourseAccess(req.params.courseId, req.user);
    const liveClasses = await prisma.liveClass.findMany({ where: { courseId: req.params.courseId }, orderBy: { scheduledAt: 'asc' } });
    res.json({ liveClasses });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const live = await prisma.liveClass.findUnique({ where: { id: req.params.id }, include: { course: { select: { id: true, title: true, instructorId: true } } } });
    if (!live) throw new HttpError(404, 'Live class not found');
    await assertCourseAccess(live.courseId, req.user);
    const messages = await prisma.chatMessage.findMany({
      where: { liveClassId: live.id },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json({ liveClass: live, messages, isHost: live.course.instructorId === req.user!.id });
  }),
);

/** Instructor starts or ends the class. Students in the page are notified over Socket.io. */
router.patch(
  '/:id/status',
  requireRole('INSTRUCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const live = await prisma.liveClass.findUnique({ where: { id: req.params.id } });
    if (!live) throw new HttpError(404, 'Live class not found');
    await assertCourseOwner(live.courseId, req.user!);
    const { status } = z.object({ status: z.enum(['LIVE', 'ENDED']) }).parse(req.body);
    const updated = await prisma.liveClass.update({ where: { id: live.id }, data: { status } });
    getIo()?.to(`live:${live.id}`).emit('live:status', { status });
    res.json({ liveClass: updated });
  }),
);

/** Issue a LiveKit token. Instructor = host (can publish camera/screen); students can watch and raise their mic only if allowed. */
router.post(
  '/:id/token',
  asyncHandler(async (req, res) => {
    const live = await prisma.liveClass.findUnique({ where: { id: req.params.id }, include: { course: { select: { instructorId: true } } } });
    if (!live) throw new HttpError(404, 'Live class not found');
    await assertCourseAccess(live.courseId, req.user);
    const isHost = live.course.instructorId === req.user!.id || req.user!.role === 'ADMIN';
    if (!isHost && live.status !== 'LIVE') throw new HttpError(400, 'The class has not started yet');

    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: req.user!.id,
      name: req.user!.name,
      ttl: '3h',
    });
    at.addGrant({ room: live.roomName, roomJoin: true, canPublish: isHost, canSubscribe: true, canPublishData: true, roomAdmin: isHost });
    res.json({ token: await at.toJwt(), url: config.livekit.url, isHost });
  }),
);

export default router;
