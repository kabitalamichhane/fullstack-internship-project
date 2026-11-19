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

/**
 * Issue a JWT and store the session in Redis. Storing the session lets us
 * revoke tokens on logout (plain JWTs cannot be revoked) and caches user info.
 */
export async function createSession(user: { id: string; role: Role; email: string; name: string }) {
  const sid = crypto.randomUUID();
  await redis.set(`session:${sid}`, JSON.stringify(user), 'EX', SESSION_TTL);
  const token = jwt.sign({ sub: user.id, role: user.role, sid }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
  return token;
}

export async function destroySession(sid: string) {
  await redis.del(`session:${sid}`);
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
    const session = await redis.get(`session:${payload.sid}`);
    if (!session) throw new HttpError(401, 'Session expired, please log in again');
    req.user = { ...JSON.parse(session), sid: payload.sid };
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
