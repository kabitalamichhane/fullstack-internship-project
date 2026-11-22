import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { config } from '../config';
import { redis } from '../lib/redis';
import { HttpError } from '../utils/http';

export type AuthUser = { id: string; role: Role; email: string; name: string; sid: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const SESSION_TTL = 60 * 60 * 24 * 7;
type SessionUser = Omit<AuthUser, 'sid'>;

const memorySessions = new Map<string, { user: SessionUser; expiresAt: number }>();
let useMemorySessions = false;

export function enableInMemorySessions() {
  if (config.env !== 'development' && config.env !== 'test') {
    throw new Error('In-memory sessions are only available in development and test environments');
  }
  memorySessions.clear();
  useMemorySessions = true;
}

export async function createSession(user: SessionUser) {
  const sid = crypto.randomUUID();
  if (useMemorySessions) {
    memorySessions.set(sid, { user, expiresAt: Date.now() + SESSION_TTL * 1000 });
  } else {
    await redis.set(`session:${sid}`, JSON.stringify(user), 'EX', SESSION_TTL);
  }
  return jwt.sign({ sub: user.id, role: user.role, sid }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export async function destroySession(sid: string) {
  if (useMemorySessions) {
    memorySessions.delete(sid);
  } else {
    await redis.del(`session:${sid}`);
  }
}

/** Verify a JWT and load its session. Shared by HTTP routes and Socket.io. */
export async function verifyToken(token: string): Promise<AuthUser> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  const sid = String(payload.sid);
  let session: string | null;
  if (useMemorySessions) {
    const stored = memorySessions.get(sid);
    if (stored && stored.expiresAt > Date.now()) {
      session = JSON.stringify(stored.user);
    } else {
      memorySessions.delete(sid);
      session = null;
    }
  } else {
    session = await redis.get(`session:${sid}`);
  }
  if (!session) throw new HttpError(401, 'Session expired, please log in again');
  return { ...JSON.parse(session), sid };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
    req.user = await verifyToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

/** Like authenticate, but lets anonymous visitors through (req.user stays undefined). */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    req.user = await verifyToken(header.slice(7)).catch(() => undefined);
  }
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission for this action'));
    next();
  };
