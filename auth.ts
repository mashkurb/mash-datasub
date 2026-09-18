import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, User } from './db';

const JWT_SECRET = process.env.JWT_SECRET?.trim();

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required. Configure it in the hosting environment before starting Mash DataSub.');
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN' | 'OWNER';
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function signToken(user: User): string {
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };
  // 7 days token expiration
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    return;
  }

  const user = db.findUserById(decoded.userId);
  if (!user) {
    res.status(401).json({ error: 'User account not found.' });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER')) {
      res.status(403).json({ error: 'Access denied. Administrative authorization required.' });
      return;
    }
    next();
  });
}

export function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'OWNER') {
      res.status(403).json({ error: 'Access denied. Owner authorization required.' });
      return;
    }
    next();
  });
}
