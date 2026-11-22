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

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days, matches JWT_EXPIRES_IN default
type SessionUser = { id: string; role: Role; email: string; name: string };

const memorySessions = new Map<string, { user: SessionUser; expiresAt: number }>();
let useMemorySessions = false;

export function enableInMemorySessions() {
  if (config.env !== 'development' && config.env !== 'test') {
    throw new Error('In-memory sessions are only available in development and test environments');
  }
  memorySessions.clear();
  useMemorySessions = true;
}

/**
 * Store the session with the JWT so tokens can be revoked on logout.
 */
export async function createSession(user: SessionUser) {
  const sid = crypto.randomUUID();
  if (useMemorySessions) {
    memorySessions.set(sid, { user, expiresAt: Date.now() + SESSION_TTL * 1000 });
  } else {
    await redis.set(`session:${sid}`, JSON.stringify(user), 'EX', SESSION_TTL);
  }
  const token = jwt.sign({ sub: user.id, role: user.role, sid }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
  return token;
}

export async function destroySession(sid: string) {
  if (useMemorySessions) {
    memorySessions.delete(sid);
  } else {
    await redis.del(`session:${sid}`);
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
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
    req.user = { ...JSON.parse(session), sid };
    next();
  } catch (err) {
    next(err);
  }
}

/** Role-based access control: allow only the listed roles. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission for this action'));
    next();
  };
