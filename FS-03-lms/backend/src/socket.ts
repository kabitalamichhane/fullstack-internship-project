import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { prisma } from './lib/prisma';
import { verifyToken, AuthUser } from './middleware/auth';
import { canAccessCourse } from './services/access.service';

let io: Server | null = null;
export const getIo = () => io;

/**
 * Real-time chat for live classes.
 * Client: io(API, { auth: { token } }) → emit('live:join', liveClassId) → emit('chat:send', { liveClassId, text })
 */
export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: config.clientUrl.split(','), credentials: true } });

  io.use(async (socket, next) => {
    try {
      socket.data.user = await verifyToken(String(socket.handshake.auth?.token ?? ''));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;

    socket.on('live:join', async (liveClassId: string, ack?: (r: { ok: boolean; error?: string }) => void) => {
      const live = await prisma.liveClass.findUnique({ where: { id: String(liveClassId) } });
      if (!live || !(await canAccessCourse(live.courseId, user))) return ack?.({ ok: false, error: 'Not allowed' });
      await socket.join(`live:${live.id}`);
      socket.to(`live:${live.id}`).emit('presence', { type: 'join', name: user.name });
      const count = (await io!.in(`live:${live.id}`).fetchSockets()).length;
      io!.to(`live:${live.id}`).emit('presence:count', count);
      ack?.({ ok: true });
    });

    socket.on('chat:send', async (payload: { liveClassId: string; text: string }) => {
      const text = String(payload?.text ?? '').trim().slice(0, 1000);
      const room = `live:${payload?.liveClassId}`;
      if (!text || !socket.rooms.has(room)) return;
      const msg = await prisma.chatMessage.create({
        data: { liveClassId: payload.liveClassId, userId: user.id, text },
        include: { user: { select: { name: true, role: true } } },
      });
      io!.to(room).emit('chat:message', msg);
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('live:')) {
          socket.to(room).emit('presence', { type: 'leave', name: user.name });
          io!.in(room).fetchSockets().then((s) => io!.to(room).emit('presence:count', s.length - 1));
        }
      }
    });
  });

  return io;
}
